import { classifyRight, type RightsHit } from "../js/rights.js";
import { eachNode, loc, parsePython, stringLiteral } from "./parse.js";
import type { PySource } from "./walk.js";

const ROUTE_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "route",
  "add_api_route",
  "add_url_rule",
  "api_route",
  "path",
  "re_path",
  "url",
]);

const HTTP_ROOTS = new Set(["requests", "httpx", "urllib", "aiohttp"]);

export function rightsHits(file: PySource): RightsHit[] {
  if (file.kind !== "python") return [];
  const parsed = parsePython(file.text);
  const hits: RightsHit[] = [];
  for (const call of parsed.calls) {
    if (!ROUTE_METHODS.has(call.method)) continue;
    if (HTTP_ROOTS.has(call.root) && call.method !== "path" && call.method !== "url") continue;
    const lit = call.args[0] ? stringLiteral(call.args[0]) : undefined;
    const path = lit?.value ?? "";
    push(hits, classifyRight(path), loc(file.rel, call.line), path);
  }
  eachNode(parsed.root, (node) => {
    if (node.kind !== "func" || !node.name) return;
    push(hits, classifyRight(node.name), loc(file.rel, node.line), node.name);
  });
  return dedupe(hits);
}

function push(hits: RightsHit[], right: RightsHit["right"] | undefined, location: string, path: string): void {
  if (!right) return;
  hits.push({ right, location, path });
}

function dedupe(hits: RightsHit[]): RightsHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.right}\0${hit.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
