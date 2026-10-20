import ts from "typescript";
import { calleeName, decoratorCall, lineOf, literalString, loc, walk } from "./ast.js";

export interface RightsHit {
  right: "access" | "erase" | "correct";
  location: string;
  path: string;
}

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "all", "route", "head", "options"]);
const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

export function rightsHits(file: string, sf?: ts.SourceFile): RightsHit[] {
  const hits: RightsHit[] = [];
  const route = routeFromFile(file);
  if (route) push(hits, classifyRight(route), loc(file, 1), route);
  if (!sf) return dedupe(hits);

  walk(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      considerName(hits, file, sf, node.name.text, node);
      return;
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      considerName(hits, file, sf, node.name.text, node);
      return;
    }
    if (!ts.isCallExpression(node) || (node.parent && ts.isDecorator(node.parent))) return;
    const method = calleeName(node.expression)?.toLowerCase();
    if (!method || !ROUTE_METHODS.has(method)) return;
    const path = literalString(node.arguments[0]);
    if (!path) return;
    push(hits, classifyRight(path), loc(file, lineOf(sf, node)), path);
  });

  for (const node of sf.statements) {
    if (ts.isClassDeclaration(node)) nestRoutes(hits, file, sf, node);
  }
  return dedupe(hits);
}

function routeFromFile(rel: string): string | undefined {
  const norm = rel.replace(/\\/g, "/");
  const app = /(?:^|\/)app\/(.+)\/route\.(?:tsx|ts|jsx|js)$/.exec(norm);
  if (app?.[1]) return `/${app[1]}`;
  const pages = /(?:^|\/)pages\/(.+)\.(?:tsx|ts|jsx|js)$/.exec(norm);
  if (pages?.[1]?.startsWith("api/") || pages?.[1] === "api") return `/${pages[1].replace(/\/index$/, "")}`;
  return undefined;
}

export function classifyRight(raw: string): RightsHit["right"] | undefined {
  const s = raw.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  if (
    /download[-_]?my[-_]?data|data[-_]?export|download[-_]?data|(?:^|[/_-])export(?:\/|$|[-_])|my[-_]data/.test(s)
  ) {
    return "access";
  }
  if (/delete[-_]?account|account\/delete|(?:^|\/)erase(?:\/|$)|erase[-_]|(?:^|\/)forget[-_]?me/.test(s)) {
    return "erase";
  }
  if (/update[-_]?profile|edit[-_]?profile|(?:^|\/)correct(?:\/|$)|correct[-_]/.test(s)) return "correct";
  return undefined;
}

function considerName(hits: RightsHit[], file: string, sf: ts.SourceFile, name: string, node: ts.Node): void {
  if (HTTP_VERBS.has(name.toLowerCase())) return;
  const right = classifyRight(name);
  if (!right) return;
  push(hits, right, loc(file, lineOf(sf, node)), name);
}

function nestRoutes(hits: RightsHit[], file: string, sf: ts.SourceFile, node: ts.ClassDeclaration): void {
  const controller = decoratorCall(node, "Controller");
  if (!controller) return;
  const prefix = literalString(controller.arguments[0]) ?? "";
  for (const member of node.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    for (const name of ["Get", "Post", "Put", "Patch", "Delete", "All", "Head", "Options"]) {
      const call = decoratorCall(member, name);
      if (!call) continue;
      const path = joinRoute(prefix, literalString(call.arguments[0]) ?? "");
      push(hits, classifyRight(path), loc(file, lineOf(sf, member)), path);
    }
  }
}

function joinRoute(prefix: string, path: string): string {
  const left = prefix.replace(/^\/+|\/+$/g, "");
  const right = path.replace(/^\/+|\/+$/g, "");
  return `/${[left, right].filter(Boolean).join("/")}`;
}

function push(
  hits: RightsHit[],
  right: RightsHit["right"] | undefined,
  location: string,
  path: string,
): void {
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
