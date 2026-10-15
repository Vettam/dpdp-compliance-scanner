import type { Tracker } from "../../../vendors/schema.js";
import { TrackerIndex } from "../../../vendors/matcher.js";
import { looksOutbound, type HttpHit } from "../js/http.js";
import { hostOf } from "../js/redact.js";
import { eachNode, lastPart, loc, parsePython, statements, stringLiteral, type PyCall, type PyFile } from "./parse.js";
import type { PySource } from "./walk.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "request", "urlopen"]);
const HTTP_ROOTS = new Set(["requests", "httpx", "urllib", "aiohttp"]);
const SDK_SKIP = new Set(["load", "init", "ready", "on", "off", "use", "then", "catch", "finally", "debug"]);
const VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export function httpHits(file: PySource, index: TrackerIndex): HttpHit[] {
  if (file.kind !== "python") return [];
  const parsed = parsePython(file.text);
  const bindings = vendorBindings(parsed, index);
  const httpNames = httpBindings(parsed);
  const vendorIds = index.all().map((t) => t.id);
  const hits: HttpHit[] = [];
  for (const call of parsed.calls) {
    const sdk = sdkHit(file.rel, call, bindings);
    if (sdk) {
      hits.push(sdk);
      continue;
    }
    if (!isHttpCall(call, httpNames)) continue;
    const expr = urlExpr(call);
    if (expr === undefined) continue;
    const resolved = resolveUrl(expr, parsed.constants);
    if (!resolved) continue;
    if (resolved.kind === "dynamic") {
      if (looksOutbound(resolved.name, vendorIds)) {
        hits.push({
          file: file.rel,
          start: call.start,
          location: loc(file.rel, call.line),
          confidence: "medium",
          detail: {},
          questionName: resolved.name,
        });
      }
      continue;
    }
    const parsedUrl = hostOf(resolved.url);
    if (!parsedUrl) continue;
    const vendor = index.byRequest(parsedUrl.host, parsedUrl.path);
    if (!vendor) continue;
    hits.push({
      file: file.rel,
      start: call.start,
      location: loc(file.rel, call.line),
      vendor,
      confidence: resolved.kind === "literal" ? "high" : "medium",
      detail: { host: parsedUrl.host },
    });
  }
  return hits;
}

/** PyPI package, or `name-python` when the import root drops that suffix (`analytics` → `analytics-python`). */
export function pythonVendor(index: TrackerIndex, module: string): Tracker | undefined {
  const parts = module.split(".").filter(Boolean);
  for (let n = parts.length; n >= 1; n--) {
    const joined = parts.slice(0, n).join("-");
    const hit = index.byPackage("pypi", joined) ?? index.byPackage("pypi", `${joined}-python`);
    if (hit) return hit;
  }
  return undefined;
}

function sdkHit(file: string, call: PyCall, bindings: Map<string, Tracker>): HttpHit | undefined {
  const vendor = bindings.get(call.root);
  if (!vendor) return undefined;
  if (call.callee === call.root || call.method === call.root) return undefined;
  if (SDK_SKIP.has(call.method)) return undefined;
  return {
    file,
    start: call.start,
    location: loc(file, call.line),
    vendor,
    confidence: "high",
    detail: { call: call.method },
  };
}

function isHttpCall(call: PyCall, names: Set<string>): boolean {
  if (!HTTP_METHODS.has(call.method)) return false;
  return names.has(call.root);
}

function urlExpr(call: PyCall): string | undefined {
  if (call.method === "request") {
    const verb = call.args[0] ? stringLiteral(call.args[0]) : undefined;
    if (verb && !verb.interpolated && VERBS.has(verb.value.toUpperCase())) return call.args[1];
  }
  return call.args[0];
}

function resolveUrl(
  expr: string,
  constants: Map<string, string>,
): { kind: "literal" | "const"; url: string } | { kind: "dynamic"; name: string } | undefined {
  const lit = stringLiteral(expr);
  if (lit && !lit.interpolated) return { kind: "literal", url: lit.value };
  if (lit?.interpolated && hostOf(lit.value)) return { kind: "const", url: lit.value };
  if (lit?.interpolated) return { kind: "dynamic", name: "template" };
  const name = /^[A-Za-z_]\w*$/.exec(expr.trim());
  if (name?.[0]) {
    const value = constants.get(name[0]);
    if (value !== undefined) return { kind: "const", url: value };
    return { kind: "dynamic", name: name[0] };
  }
  const attr = /\.([A-Za-z_]\w*)$/.exec(expr.trim());
  if (attr?.[1] && /^[\w.]+$/.test(expr.trim())) return { kind: "dynamic", name: attr[1] };
  return undefined;
}

function vendorBindings(file: PyFile, index: TrackerIndex): Map<string, Tracker> {
  const bindings = new Map<string, Tracker>();
  for (const imp of file.imports) {
    const vendor = pythonVendor(index, imp.module);
    if (vendor) bindings.set(imp.name, vendor);
  }
  eachNode(file.root, (node) => {
    for (const stmt of statements(node)) {
      const match = /^([A-Za-z_]\w*)\s*=\s*(?:await\s+)?([\s\S]+)$/.exec(stmt.text);
      if (!match?.[1] || !match[2]) continue;
      const root = /^([A-Za-z_]\w*)/.exec(match[2].trim())?.[1];
      const vendor = root ? bindings.get(root) : undefined;
      if (vendor) bindings.set(match[1], vendor);
    }
  });
  return bindings;
}

function httpBindings(file: PyFile): Set<string> {
  const names = new Set(HTTP_ROOTS);
  for (const imp of file.imports) {
    const root = imp.module.split(".")[0];
    if (root && HTTP_ROOTS.has(root)) names.add(imp.name);
    if (HTTP_ROOTS.has(lastPart(imp.module))) names.add(imp.name);
  }
  eachNode(file.root, (node) => {
    const withName = /^(?:async\s+)?with\s+([\s\S]+)\s+as\s+([A-Za-z_]\w*)\s*:/.exec(node.header);
    if (withName?.[1] && withName[2] && rootKnown(withName[1], names)) names.add(withName[2]);
    for (const stmt of statements(node)) {
      const match = /^([A-Za-z_]\w*)\s*=\s*(?:await\s+)?([\s\S]+)$/.exec(stmt.text);
      if (match?.[1] && match[2] && rootKnown(match[2], names)) names.add(match[1]);
    }
  });
  return names;
}

function rootKnown(expr: string, names: Set<string>): boolean {
  const root = /^([A-Za-z_]\w*)/.exec(expr.trim())?.[1];
  return root !== undefined && names.has(root);
}
