import ts from "typescript";
import { calleeName, decoratorCall, deepestCall, lineAt, lineOf, literalString, loc, objectString, propName, rootIdentifier, walk } from "./ast.js";
import type { CodeFile } from "./walk.js";

export interface SchemaColumn {
  table: string;
  column: string;
  location: string;
  freeText: boolean;
  /** Set when a decorator names the signal and the column name does not. */
  signal?: string;
}

const FREE_SQL = new Set([
  "string",
  "text",
  "varchar",
  "char",
  "nvarchar",
  "nchar",
  "character",
  "citext",
  "json",
  "jsonb",
  "tinytext",
  "mediumtext",
  "longtext",
  "clob",
]);

const DRIZZLE_TABLES = new Set(["pgTable", "mysqlTable", "sqliteTable"]);
const DRIZZLE_FREE = new Set(["text", "varchar", "char", "json", "jsonb", "citext"]);
const KNEX_TYPES = new Set([
  "string",
  "text",
  "integer",
  "bigInteger",
  "boolean",
  "date",
  "dateTime",
  "datetime",
  "timestamp",
  "timestamps",
  "json",
  "jsonb",
  "uuid",
  "binary",
  "float",
  "decimal",
  "enu",
  "enum",
  "specificType",
  "varchar",
]);
const SQL_SKIP = new Set(["constraint", "primary", "unique", "key", "foreign", "check", "index"]);

export function columnsFromFile(file: CodeFile, sf?: ts.SourceFile): SchemaColumn[] {
  if (file.kind === "prisma") return columnsFromPrisma(file.rel, file.text);
  if (file.kind === "sql") return columnsFromSql(file.rel, file.text);
  if (file.kind === "script" && sf) return columnsFromScript(file.rel, sf);
  return [];
}

function columnsFromPrisma(rel: string, text: string): SchemaColumn[] {
  const lines = text.split(/\r?\n/);
  const out: SchemaColumn[] = [];
  let table = "";
  let mapped = "";
  let fields: { column: string; type: string; line: number }[] = [];

  const flush = () => {
    if (!table) return;
    const name = mapped || table;
    for (const field of fields) {
      out.push({
        table: name,
        column: field.column,
        location: loc(rel, field.line),
        freeText: field.type === "String" || field.type === "Json",
      });
    }
    table = "";
    mapped = "";
    fields = [];
  };

  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trim();
    if (!open) {
      const model = /^model\s+(\w+)\b/.exec(trimmed);
      if (model?.[1] && trimmed.includes("{")) {
        table = model[1];
        mapped = "";
        fields = [];
        open = true;
      }
      continue;
    }
    if (trimmed.startsWith("}")) {
      flush();
      open = false;
      continue;
    }
    const map = /@@map\(\s*["'](\w+)["']\s*\)/.exec(trimmed);
    if (map?.[1]) {
      mapped = map[1];
      continue;
    }
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@") || trimmed.startsWith("*")) continue;
    const field = /^(\w+)\s+(\w+)/.exec(trimmed);
    if (field?.[1] && field[2]) fields.push({ column: field[1], type: field[2], line: i + 1 });
  }
  flush();
  return out;
}

function columnsFromSql(rel: string, text: string): SchemaColumn[] {
  const out: SchemaColumn[] = [];
  const head = /create\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?(\w+)["'`]?/gi;
  let match: RegExpExecArray | null;
  while ((match = head.exec(text))) {
    const table = match[1];
    if (!table) continue;
    const open = text.indexOf("(", match.index + match[0].length);
    if (open < 0) continue;
    const body = readParen(text, open);
    if (body === undefined) continue;
    const startLine = lineAt(text, open);
    for (const part of splitComma(body)) {
      const col = /^\s*["'`]?(\w+)["'`]?\s+([A-Za-z]+)/.exec(part);
      const name = col?.[1];
      const type = col?.[2];
      if (!name || !type || SQL_SKIP.has(name.toLowerCase())) continue;
      const line = startLine + newlinesBefore(body, part);
      out.push({
        table,
        column: name,
        location: loc(rel, line),
        freeText: FREE_SQL.has(type.toLowerCase()),
      });
    }
  }
  return out;
}

function columnsFromScript(rel: string, sf: ts.SourceFile): SchemaColumn[] {
  return [...drizzle(rel, sf), ...typeorm(rel, sf), ...sequelize(rel, sf), ...knex(rel, sf)];
}

function drizzle(rel: string, sf: ts.SourceFile): SchemaColumn[] {
  const out: SchemaColumn[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node) || !DRIZZLE_TABLES.has(calleeName(node.expression) ?? "")) return;
    const table = literalString(node.arguments[0]);
    const cols = node.arguments[1];
    if (!table || !cols || !ts.isObjectLiteralExpression(cols)) return;
    for (const prop of cols.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = propName(prop.name);
      if (!key) continue;
      const call = deepestCall(prop.initializer);
      const column = (call && literalString(call.arguments[0])) || key;
      const method = call ? calleeName(call.expression) : undefined;
      out.push({
        table,
        column,
        location: loc(rel, lineOf(sf, prop)),
        freeText: method !== undefined && DRIZZLE_FREE.has(method),
      });
    }
  });
  return out;
}

function typeorm(rel: string, sf: ts.SourceFile): SchemaColumn[] {
  const out: SchemaColumn[] = [];
  walk(sf, (node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return;
    const entity = decoratorCall(node, "Entity");
    if (!entity) return;
    const table = entityTable(entity, node.name.text);
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) continue;
      const column = decoratorCall(member, "Column");
      const deleted = decoratorCall(member, "DeleteDateColumn");
      if (!column && !deleted) continue;
      const name = (column && columnName(column)) || member.name.text;
      const type = column ? columnType(column) : undefined;
      const free =
        type !== undefined
          ? FREE_SQL.has(type.toLowerCase()) || type === "string"
          : member.type !== undefined && isStringish(member.type);
      const hit: SchemaColumn = {
        table,
        column: name,
        location: loc(rel, lineOf(sf, member)),
        freeText: free,
      };
      if (deleted) hit.signal = "soft_delete_column";
      out.push(hit);
    }
  });
  return out;
}

function sequelize(rel: string, sf: ts.SourceFile): SchemaColumn[] {
  const out: SchemaColumn[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = calleeName(node.expression);
    if (name === "define") {
      const model = literalString(node.arguments[0]);
      const attrs = node.arguments[1];
      const options = node.arguments[2];
      const table =
        (options && ts.isObjectLiteralExpression(options) && objectString(options, "tableName")) || model;
      if (table && attrs && ts.isObjectLiteralExpression(attrs)) pushSequelize(out, rel, sf, table, attrs);
      return;
    }
    if (name !== "init" || !ts.isPropertyAccessExpression(node.expression)) return;
    const attrs = node.arguments[0];
    const options = node.arguments[1];
    const table =
      (options && ts.isObjectLiteralExpression(options) && (objectString(options, "tableName") || objectString(options, "modelName"))) ||
      rootIdentifier(node.expression);
    if (table && attrs && ts.isObjectLiteralExpression(attrs)) pushSequelize(out, rel, sf, table, attrs);
  });
  return out;
}

function pushSequelize(
  out: SchemaColumn[],
  rel: string,
  sf: ts.SourceFile,
  table: string,
  attrs: ts.ObjectLiteralExpression,
): void {
  for (const prop of attrs.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propName(prop.name);
    if (!key) continue;
    const type = sequelizeType(prop.initializer);
    out.push({
      table,
      column: key,
      location: loc(rel, lineOf(sf, prop)),
      freeText: type !== undefined && FREE_SQL.has(type.toLowerCase()),
    });
  }
}

function knex(rel: string, sf: ts.SourceFile): SchemaColumn[] {
  const out: SchemaColumn[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = calleeName(node.expression);
    if (name !== "createTable" && name !== "createTableIfNotExists") return;
    const table = literalString(node.arguments[0]);
    const fn = node.arguments[1];
    if (!table || !fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return;
    const param = fn.parameters[0];
    if (!param || !ts.isIdentifier(param.name)) return;
    const builder = param.name.text;
    walk(fn.body, (inner) => {
      if (!ts.isCallExpression(inner)) return;
      const columnCall = deepestCall(inner) ?? inner;
      if (rootIdentifier(columnCall.expression) !== builder) return;
      const method = calleeName(columnCall.expression);
      if (!method || !KNEX_TYPES.has(method) || method === "timestamps") return;
      const column = literalString(columnCall.arguments[0]);
      if (!column) return;
      const typeArg = method === "specificType" ? literalString(columnCall.arguments[1]) : method;
      out.push({
        table,
        column,
        location: loc(rel, lineOf(sf, columnCall)),
        freeText: typeArg !== undefined && FREE_SQL.has(typeArg.toLowerCase()),
      });
    });
  });
  return out;
}

function entityTable(call: ts.CallExpression, className: string): string {
  const arg = call.arguments[0];
  const literal = literalString(arg);
  if (literal) return literal;
  if (arg && ts.isObjectLiteralExpression(arg)) return objectString(arg, "name") ?? className;
  return className;
}

function columnName(call: ts.CallExpression): string | undefined {
  const arg = call.arguments[0];
  if (!arg) return undefined;
  if (ts.isObjectLiteralExpression(arg)) return objectString(arg, "name");
  return undefined;
}

function columnType(call: ts.CallExpression): string | undefined {
  const arg = call.arguments[0];
  if (!arg) return undefined;
  const literal = literalString(arg);
  if (literal) return literal;
  if (ts.isObjectLiteralExpression(arg)) return objectString(arg, "type");
  return undefined;
}

function sequelizeType(expr: ts.Expression): string | undefined {
  if (ts.isObjectLiteralExpression(expr)) {
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop) || propName(prop.name) !== "type") continue;
      return sequelizeType(prop.initializer);
    }
    return undefined;
  }
  const call = ts.isCallExpression(expr) ? expr.expression : expr;
  if (ts.isPropertyAccessExpression(call)) return call.name.text;
  if (ts.isIdentifier(call)) return call.text;
  const literal = literalString(expr);
  return literal;
}

function isStringish(type: ts.TypeNode): boolean {
  if (type.kind === ts.SyntaxKind.StringKeyword) return true;
  if (ts.isUnionTypeNode(type)) return type.types.some(isStringish);
  return false;
}

function readParen(text: string, open: number): string | undefined {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return undefined;
}

function splitComma(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")" && depth > 0) {
      depth--;
      cur += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function newlinesBefore(body: string, part: string): number {
  const at = body.indexOf(part);
  if (at < 0) return 0;
  return lineAt(body, at) - 1;
}
