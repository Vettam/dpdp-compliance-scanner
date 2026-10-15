import ts from "typescript";
import type { Tracker } from "../../../vendors/schema.js";
import { TrackerIndex } from "../../../vendors/matcher.js";
import { calleeName, lineOf, literalString, loc, propName, rootIdentifier, walk } from "./ast.js";
import { hostOf } from "./redact.js";

/** Spec §5.2: a dynamic URL whose name suggests data leaving the repository. */
const OUTBOUND = new Set([
  "analytics",
  "tracking",
  "pixel",
  "telemetry",
  "crm",
  "email",
  "sms",
  "push",
  "payment",
  "auth",
  "ads",
  "logging",
]);

const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "request"]);
const CLIENTS = new Set(["axios", "got", "http", "https", "request", "fetch"]);
const HTTP_MODULES = new Set(["axios", "got", "node-fetch"]);
const SDK_SKIP = new Set(["load", "init", "ready", "on", "off", "use", "then", "catch", "finally", "debug"]);
const VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

export interface HttpHit {
  file: string;
  start: number;
  location: string;
  vendor?: Tracker;
  confidence: "high" | "medium";
  detail: Record<string, unknown>;
  questionName?: string;
  gatedBy?: string;
}

export function httpHits(file: string, sf: ts.SourceFile, index: TrackerIndex): HttpHit[] {
  const imports = collectImports(sf);
  const strings = collectStrings(sf);
  const bindings = vendorBindings(sf, index, imports);
  const vendorIds = index.all().map((t) => t.id);
  const hits: HttpHit[] = [];

  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const sdk = sdkHit(file, sf, node, bindings);
    if (sdk) {
      hits.push(sdk);
      return;
    }
    const arg = urlArgument(node, imports);
    if (!arg) return;
    const resolved = resolveUrl(arg, strings);
    if (!resolved) return;
    if (resolved.kind === "dynamic") {
      if (looksOutbound(resolved.name, vendorIds)) {
        hits.push({
          file,
          start: node.getStart(sf),
          location: loc(file, lineOf(sf, node)),
          confidence: "medium",
          detail: {},
          questionName: resolved.name,
        });
      }
      return;
    }
    const parsed = hostOf(resolved.url);
    if (!parsed) return;
    const vendor = index.byRequest(parsed.host, parsed.path);
    if (!vendor) return;
    hits.push({
      file,
      start: node.getStart(sf),
      location: loc(file, lineOf(sf, node)),
      vendor,
      confidence: resolved.kind === "literal" ? "high" : "medium",
      detail: { host: parsed.host },
    });
  });
  return hits;
}

function sdkHit(
  file: string,
  sf: ts.SourceFile,
  node: ts.CallExpression,
  bindings: Map<string, Tracker>,
): HttpHit | undefined {
  const expr = node.expression;
  const root = rootIdentifier(expr);
  if (!root) return undefined;
  const vendor = bindings.get(root);
  if (!vendor) return undefined;
  const method = ts.isPropertyAccessExpression(expr) ? expr.name.text : root;
  if (SDK_SKIP.has(method)) return undefined;
  if (ts.isIdentifier(expr) && method === root) return undefined;
  return {
    file,
    start: node.getStart(sf),
    location: loc(file, lineOf(sf, node)),
    vendor,
    confidence: "high",
    detail: { call: method },
  };
}

function urlArgument(call: ts.CallExpression, imports: Map<string, string>): ts.Expression | undefined {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) {
    const mod = imports.get(expr.text);
    if (expr.text === "fetch" || mod === "node-fetch") return call.arguments[0];
    if (expr.text === "axios" || expr.text === "got" || mod === "axios" || mod === "got") {
      return configOrFirst(call);
    }
    return undefined;
  }
  if (!ts.isPropertyAccessExpression(expr)) return undefined;
  const method = expr.name.text;
  if (method === "sendBeacon") return call.arguments[0];
  if (method === "open") {
    const verb = literalString(call.arguments[0]);
    if (!verb || !VERBS.has(verb.toUpperCase())) return undefined;
    return call.arguments[1];
  }
  if (!METHODS.has(method)) return undefined;
  const root = rootIdentifier(expr);
  const mod = root ? imports.get(root) : undefined;
  const known = (root !== undefined && CLIENTS.has(root)) || (mod !== undefined && HTTP_MODULES.has(mod));
  if (!known && !call.arguments[0]) return undefined;
  return call.arguments[0];
}

function configOrFirst(call: ts.CallExpression): ts.Expression | undefined {
  const arg = call.arguments[0];
  if (!arg) return undefined;
  if (!ts.isObjectLiteralExpression(arg)) return arg;
  for (const prop of arg.properties) {
    if (ts.isPropertyAssignment(prop) && propName(prop.name) === "url") return prop.initializer;
  }
  return undefined;
}

function resolveUrl(
  expr: ts.Expression,
  strings: Map<string, string>,
): { kind: "literal" | "const"; url: string } | { kind: "dynamic"; name: string } | undefined {
  const literal = literalString(expr);
  if (literal !== undefined) return { kind: "literal", url: literal };
  if (ts.isIdentifier(expr)) {
    const value = strings.get(expr.text);
    if (value !== undefined) return { kind: "const", url: value };
    return { kind: "dynamic", name: expr.text };
  }
  if (ts.isPropertyAccessExpression(expr)) return { kind: "dynamic", name: expr.name.text };
  if (ts.isTemplateExpression(expr) && hostOf(expr.head.text)) return { kind: "const", url: expr.head.text };
  if (ts.isTemplateExpression(expr)) return { kind: "dynamic", name: "template" };
  return undefined;
}

export function looksOutbound(name: string, vendorIds: string[]): boolean {
  const tokens = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((t) => OUTBOUND.has(t) || vendorIds.includes(t));
}

function collectImports(sf: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>();
  walk(sf, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause) {
      if (node.importClause.isTypeOnly) return;
      const spec = node.moduleSpecifier.text;
      if (node.importClause.name) map.set(node.importClause.name.text, spec);
      const named = node.importClause.namedBindings;
      if (named && ts.isNamespaceImport(named)) map.set(named.name.text, spec);
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if (!el.isTypeOnly) map.set(el.name.text, spec);
        }
      }
      return;
    }
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    if (!ts.isCallExpression(node.initializer) || calleeName(node.initializer.expression) !== "require") return;
    const spec = literalString(node.initializer.arguments[0]);
    if (spec) map.set(node.name.text, spec);
  });
  return map;
}

/** shortcut: one file-level map; a later binding shadows an earlier one. */
function collectStrings(sf: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>();
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const value = literalString(node.initializer);
    if (value !== undefined) map.set(node.name.text, value);
  });
  return map;
}

function vendorBindings(sf: ts.SourceFile, index: TrackerIndex, imports: Map<string, string>): Map<string, Tracker> {
  const bindings = new Map<string, Tracker>();
  for (const [name, spec] of imports) {
    const vendor = index.byPackage("npm", spec);
    if (vendor) bindings.set(name, vendor);
  }
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const root = rootIdentifier(node.initializer);
    const vendor = root ? bindings.get(root) : undefined;
    if (vendor) bindings.set(node.name.text, vendor);
  });
  return bindings;
}
