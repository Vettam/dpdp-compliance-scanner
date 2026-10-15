import type { SchemaColumn } from "../js/schema.js";
import {
  childNodes,
  eachNode,
  lastPart,
  loc,
  parsePython,
  statements,
  stringLiteral,
  type PyCall,
  type PyFile,
  type PyNode,
} from "./parse.js";
import type { PySource } from "./walk.js";

const DJANGO_FREE = new Set([
  "charfield",
  "textfield",
  "emailfield",
  "urlfield",
  "slugfield",
  "jsonfield",
  "filepathfield",
]);

const SQL_FREE = new Set([
  "string",
  "text",
  "unicode",
  "unicodetext",
  "json",
  "jsonb",
  "varchar",
  "char",
  "nvarchar",
  "nchar",
  "clob",
]);

const TABLE_METHODS = new Set(["table", "create_table", "add_column"]);
const COLUMN_METHODS = new Set(["column", "mapped_column"]);

export function columnsFromPython(file: PySource): SchemaColumn[] {
  if (file.kind !== "python") return [];
  const parsed = parsePython(file.text);
  return [...classColumns(file.rel, parsed), ...tableCallColumns(file.rel, parsed)];
}

function classColumns(rel: string, file: PyFile): SchemaColumn[] {
  const out: SchemaColumn[] = [];
  eachNode(file.root, (node) => {
    if (node.kind !== "class") return;
    const table = tableName(node);
    if (!table) return;
    for (const stmt of statements(node)) {
      const col = columnAssign(stmt.text);
      if (!col) continue;
      out.push({ table, column: col.name, location: loc(rel, stmt.line), freeText: col.free });
    }
  });
  return out;
}

function tableName(node: PyNode): string | undefined {
  const named = statements(node)
    .map((stmt) => /^__tablename__\s*(?::[^=]+)?=\s*([\s\S]+)$/.exec(stmt.text))
    .find((match) => match?.[1]);
  const literal = named?.[1] ? stringLiteral(named[1]) : undefined;
  if (literal && !literal.interpolated) return literal.value;
  if (!isDjangoModel(node)) return undefined;
  return metaTable(node) ?? node.name;
}

function isDjangoModel(node: PyNode): boolean {
  return node.bases.some((base) => {
    const last = lastPart(base);
    return last === "Model";
  });
}

function metaTable(node: PyNode): string | undefined {
  for (const child of childNodes(node)) {
    if (child.kind !== "class" || child.name !== "Meta") continue;
    for (const stmt of statements(child)) {
      const match = /^db_table\s*(?::[^=]+)?=\s*([\s\S]+)$/.exec(stmt.text);
      const literal = match?.[1] ? stringLiteral(match[1]) : undefined;
      if (literal && !literal.interpolated) return literal.value;
    }
  }
  return undefined;
}

function columnAssign(text: string): { name: string; free: boolean } | undefined {
  const match = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*([\s\S]+)$/.exec(text);
  const name = match?.[1];
  const rhs = match?.[2]?.trim();
  if (!name || !rhs || name === "__tablename__" || name.startsWith("_")) return undefined;
  const call = /^([A-Za-z_][\w.]*)\s*\(/.exec(rhs);
  const callee = call?.[1] ? lastPart(call[1]) : "";
  const dbColumn = /db_column\s*=\s*(['"])([A-Za-z_]\w*)\1/.exec(rhs)?.[2];
  const column = dbColumn || name;
  if (DJANGO_FREE.has(callee.toLowerCase()) || callee.endsWith("Field")) {
    return { name: column, free: DJANGO_FREE.has(callee.toLowerCase()) };
  }
  if (!COLUMN_METHODS.has(callee.toLowerCase())) return undefined;
  const inner = rhs.slice(rhs.indexOf("(") + 1);
  const first = inner.split(",")[0]?.trim() ?? "";
  const named = stringLiteral(first);
  const typeArg = named ? inner.split(",").slice(1).join(",") : first;
  return {
    name: named && !named.interpolated ? named.value : column,
    free: SQL_FREE.has(typeToken(typeArg).toLowerCase()),
  };
}

function tableCallColumns(rel: string, file: PyFile): SchemaColumn[] {
  const out: SchemaColumn[] = [];
  for (const call of file.calls) {
    if (!TABLE_METHODS.has(call.method.toLowerCase())) continue;
    const table = firstString(call);
    if (!table) continue;
    for (const nested of file.calls) {
      if (nested.start <= call.start || nested.end > call.end) continue;
      if (!COLUMN_METHODS.has(nested.method.toLowerCase())) continue;
      const name = firstString(nested);
      if (!name) continue;
      const typeArg = nested.args[1] ?? "";
      out.push({
        table,
        column: name,
        location: loc(rel, nested.line),
        freeText: SQL_FREE.has(typeToken(typeArg).toLowerCase()),
      });
    }
  }
  return out;
}

function firstString(call: PyCall): string | undefined {
  const lit = call.args[0] ? stringLiteral(call.args[0]) : undefined;
  if (!lit || lit.interpolated) return undefined;
  return lit.value;
}

function typeToken(expr: string): string {
  const stripped = expr.trim().replace(/^[\w.]+\./, "");
  return /([A-Za-z_]\w*)/.exec(stripped)?.[1] ?? "";
}
