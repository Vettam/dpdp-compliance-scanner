import ts from "typescript";
import { jsxAttr, jsxTag, lineOf, literalString, loc, propName, rootIdentifier, walk } from "./ast.js";

export interface InputHit {
  form: string;
  field: string;
  location: string;
}

const SHAPE_MODULES = new Set(["zod", "yup"]);

export function inputHits(file: string, sf: ts.SourceFile): InputHit[] {
  const shapes = shapeBindings(sf);
  const hits: InputHit[] = [];
  walk(sf, (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node);
      const field = jsxAttr(node, "name");
      if (!field) return;
      if (tag !== "input" && tag !== "textarea" && tag !== "select" && tag !== "Field") return;
      if (jsxAttr(node, "type") === "checkbox") return;
      hits.push({ form: formOf(node, file), field, location: loc(file, lineOf(sf, node)) });
      return;
    }
    if (ts.isCallExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ts.isIdentifier(node.expression)
          ? node.expression.text
          : undefined;
      if (name === "register") {
        const field = literalString(node.arguments[0]);
        if (field) hits.push({ form: enclosingForm(node, file), field, location: loc(file, lineOf(sf, node)) });
        return;
      }
      if (name !== "object" && name !== "shape") return;
      const root = rootIdentifier(node.expression);
      if (!root || !shapes.has(root)) return;
      const arg = node.arguments[0];
      if (!arg || !ts.isObjectLiteralExpression(arg)) return;
      const form = schemaForm(node, file);
      for (const prop of arg.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const field = propName(prop.name);
        if (!field) continue;
        hits.push({ form, field, location: loc(file, lineOf(sf, prop)) });
      }
    }
  });
  return dedupe(hits);
}

function shapeBindings(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>(["z", "zod", "yup", "Yup"]);
  walk(sf, (node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || !node.importClause) return;
    const spec = node.moduleSpecifier.text;
    if (![...SHAPE_MODULES].some((m) => spec === m || spec.startsWith(`${m}/`))) return;
    if (node.importClause.name) names.add(node.importClause.name.text);
    const named = node.importClause.namedBindings;
    if (named && ts.isNamespaceImport(named)) names.add(named.name.text);
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) names.add(el.name.text);
    }
  });
  return names;
}

function formOf(node: ts.Node, file: string): string {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (jsxTag(cur) === "form") {
      const named = jsxAttr(cur, "name") || jsxAttr(cur, "id");
      if (named) return slug(named);
    }
    cur = cur.parent;
  }
  return enclosingForm(node, file);
}

function enclosingForm(node: ts.Node, file: string): string {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return formSlug(cur.name.text);
    if (
      ts.isVariableDeclaration(cur) &&
      ts.isIdentifier(cur.name) &&
      cur.initializer &&
      (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))
    ) {
      return formSlug(cur.name.text);
    }
    cur = cur.parent;
  }
  return fileSlug(file);
}

function schemaForm(node: ts.Node, file: string): string {
  const decl = node.parent;
  if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) return formSlug(decl.name.text);
  return enclosingForm(node, file);
}

function formSlug(name: string): string {
  const stripped = name.replace(/(Page|Form|Component|Schema|Validator|Shape|Object)$/i, "");
  return slug(stripped || name);
}

function fileSlug(file: string): string {
  const stem = file.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "form";
  if (/sign[-_]?up|register/i.test(stem)) return slug(stem);
  return "form";
}

export function slug(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "form";
}

function dedupe(hits: InputHit[]): InputHit[] {
  const seen = new Set<string>();
  const out: InputHit[] = [];
  for (const hit of hits) {
    const key = `${hit.form}\0${hit.field}\0${hit.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}
