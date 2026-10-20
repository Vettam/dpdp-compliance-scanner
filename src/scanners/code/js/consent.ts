import ts from "typescript";
import type { Tracker } from "../../../vendors/schema.js";
import { TrackerIndex } from "../../../vendors/matcher.js";
import { idPart } from "../../../map/ids.js";
import { jsxAttr, jsxTag, jsxText, lineOf, literalString, loc, walk } from "./ast.js";
import { hostOf, safeExcerpt } from "./redact.js";

export interface CodeSpan {
  file: string;
  start: number;
  end: number;
  gateId: string;
}

export interface GateHit {
  id: string;
  kind: "banner" | "checkbox" | "dialog" | "code_check";
  location: string;
  confidence: "high" | "medium";
  text: string;
}

export const CONSENT_WORD = /consent|agree|opt[-_]?in|privacy|terms/i;
export const SUBMIT_TEXT = /sign\s*up|submit|register|create account/i;

export function consentHits(
  file: string,
  sf: ts.SourceFile,
  index: TrackerIndex,
): { gates: GateHit[]; spans: CodeSpan[] } {
  const gates: GateHit[] = [];
  const spans: CodeSpan[] = [];
  for (const vendor of cmpVendors(sf, index)) {
    gates.push({
      id: `cg_cmp_${idPart(vendor.id)}`,
      kind: "banner",
      location: loc(file, vendor.line),
      confidence: "high",
      text: "",
    });
  }
  const checkbox = checkboxGate(file, sf);
  if (checkbox) gates.push(checkbox);
  codeSpans(file, sf, spans, gates);
  return { gates, spans };
}

function cmpVendors(sf: ts.SourceFile, index: TrackerIndex): { id: string; line: number }[] {
  const found: { id: string; line: number }[] = [];
  const seen = new Set<string>();
  const add = (vendor: Tracker | undefined, line: number) => {
    if (!vendor || vendor.category !== "C10" || seen.has(vendor.id)) return;
    seen.add(vendor.id);
    found.push({ id: vendor.id, line });
  };
  walk(sf, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add(vendorFromSpecifier(node.moduleSpecifier.text, index), lineOf(sf, node));
      return;
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node);
      if (tag) add(vendorFromSpecifier(tag, index), lineOf(sf, node));
      return;
    }
    const literal = literalString(node);
    if (!literal) return;
    const host = hostOf(literal);
    if (!host) return;
    add(index.byRequest(host.host, host.path), lineOf(sf, node));
  });
  return found;
}

function vendorFromSpecifier(spec: string, index: TrackerIndex): Tracker | undefined {
  const packaged = index.byPackage("npm", spec);
  if (packaged?.category === "C10") return packaged;
  const parts = spec.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return index.all().find((t) => t.category === "C10" && parts.includes(t.id));
}

function checkboxGate(file: string, sf: ts.SourceFile): GateHit | undefined {
  const boxes: ts.Node[] = [];
  const submits: ts.Node[] = [];
  walk(sf, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    if (isConsentBox(node)) boxes.push(node);
    if (isSubmit(node)) submits.push(node);
  });
  const box = boxes.find((candidate) => submits.some((submit) => sameFunction(candidate, submit)));
  if (!box) return undefined;
  const form = formName(box, file);
  const label = labelText(box);
  return {
    id: `cg_${idPart(form)}_checkbox`,
    kind: "checkbox",
    location: loc(file, lineOf(sf, box)),
    confidence: "high",
    text: safeExcerpt(label),
  };
}

function isConsentBox(node: ts.Node): boolean {
  const tag = jsxTag(node);
  if (tag !== "input") return false;
  const type = jsxAttr(node, "type");
  const name = `${jsxAttr(node, "name") ?? ""} ${jsxAttr(node, "id") ?? ""} ${jsxAttr(node, "aria-label") ?? ""}`;
  if (CONSENT_WORD.test(name)) return type === undefined || type === "checkbox";
  if (type !== "checkbox") return false;
  return CONSENT_WORD.test(labelText(node));
}

function isSubmit(node: ts.Node): boolean {
  const tag = jsxTag(node);
  if (tag === "input" && jsxAttr(node, "type") === "submit") return true;
  if (tag !== "button") return false;
  if (jsxAttr(node, "type") === "submit") return true;
  const parent = node.parent;
  return ts.isJsxElement(parent) && SUBMIT_TEXT.test(jsxText(parent));
}

function labelText(node: ts.Node): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (jsxTag(cur) === "label" && ts.isJsxElement(cur)) return jsxText(cur);
    if (jsxTag(cur) === "form") break;
    cur = cur.parent;
  }
  const parent = node.parent;
  if (parent && ts.isJsxElement(parent)) return jsxText(parent);
  return "";
}

function formName(node: ts.Node, file: string): string {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (jsxTag(cur) === "form") {
      const named = jsxAttr(cur, "name") || jsxAttr(cur, "id");
      if (named) return named;
    }
    cur = cur.parent;
  }
  const stem = file.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
  if (/sign[-_]?up|register/i.test(stem)) return stem;
  let fn: ts.Node | undefined = node;
  while (fn) {
    if (ts.isFunctionDeclaration(fn) && fn.name && SUBMIT_TEXT.test(fn.name.text)) return fn.name.text;
    fn = fn.parent;
  }
  return "form";
}

function sameFunction(a: ts.Node, b: ts.Node): boolean {
  return enclosingFunction(a) === enclosingFunction(b);
}

function enclosingFunction(node: ts.Node): ts.Node | undefined {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur) || ts.isArrowFunction(cur) || ts.isMethodDeclaration(cur)) {
      return cur;
    }
    cur = cur.parent;
  }
  return undefined;
}

function codeSpans(file: string, sf: ts.SourceFile, spans: CodeSpan[], gates: GateHit[]): void {
  walk(sf, (node) => {
    if (ts.isIfStatement(node)) {
      const pol = conditionGate(node.expression);
      if (!pol) return;
      const region = pol.positive ? node.thenStatement : node.elseStatement;
      if (region) addSpan(file, sf, region, pol.name, spans, gates);
      else if (!pol.positive && isReturnOnly(node.thenStatement)) {
        const parent = node.parent;
        if (ts.isBlock(parent)) {
          const idx = parent.statements.indexOf(node);
          const rest = parent.statements.slice(idx + 1);
          const first = rest[0];
          const last = rest[rest.length - 1];
          if (first && last) {
            addRange(file, sf, first.getStart(sf), last.getEnd(), lineOf(sf, first), pol.name, spans, gates);
          }
        }
      }
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      const pol = polarity(node.left);
      if (pol?.positive) addSpan(file, sf, node.right, pol.name, spans, gates);
    }
  });
}

function addSpan(
  file: string,
  sf: ts.SourceFile,
  node: ts.Node,
  name: string,
  spans: CodeSpan[],
  gates: GateHit[],
): void {
  addRange(file, sf, node.getStart(sf), node.getEnd(), lineOf(sf, node), name, spans, gates);
}

function addRange(
  file: string,
  sf: ts.SourceFile,
  start: number,
  end: number,
  line: number,
  name: string,
  spans: CodeSpan[],
  gates: GateHit[],
): void {
  const gateId = `cg_${idPart(name)}_check`;
  spans.push({ file, start, end, gateId });
  if (!gates.some((g) => g.id === gateId)) {
    gates.push({
      id: gateId,
      kind: "code_check",
      location: loc(file, line),
      confidence: "medium",
      text: "",
    });
  }
}

function isReturnOnly(node: ts.Statement): boolean {
  if (ts.isReturnStatement(node) || ts.isBreakStatement(node) || ts.isContinueStatement(node)) return true;
  if (ts.isBlock(node)) return node.statements.every((s) => ts.isReturnStatement(s) || ts.isBreakStatement(s));
  return false;
}

function conditionGate(expr: ts.Expression): { positive: boolean; name: string } | undefined {
  const direct = polarity(expr);
  if (direct) return direct;
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return conditionGate(expr.left) ?? conditionGate(expr.right);
  }
  return undefined;
}

function polarity(expr: ts.Expression): { positive: boolean; name: string } | undefined {
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = polarity(expr.operand);
    if (inner) return { positive: !inner.positive, name: inner.name };
  }
  if (ts.isParenthesizedExpression(expr)) return polarity(expr.expression);
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      const name = consentRef(expr.left) ?? consentRef(expr.right);
      const other = consentRef(expr.left) ? expr.right : expr.left;
      if (name && (isBool(other, true) || isBool(other, false))) {
        let positive = isBool(other, true);
        if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) {
          positive = !positive;
        }
        return { positive, name };
      }
    }
  }
  const name = consentRef(expr);
  if (name) return { positive: true, name };
  return undefined;
}

function consentRef(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr) && isConsentName(expr.text)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && isConsentName(expr.name.text)) return expr.name.text;
  if (ts.isParenthesizedExpression(expr)) return consentRef(expr.expression);
  return undefined;
}

export function isConsentName(name: string): boolean {
  const n = name.replace(/[_-]/g, "").toLowerCase();
  return (
    n === "consent" ||
    n === "hasconsent" ||
    n === "optin" ||
    n === "optedin" ||
    n === "isoptedin" ||
    n === "consentgiven" ||
    n === "userconsent"
  );
}

function isBool(expr: ts.Expression, value: boolean): boolean {
  return (
    (value && expr.kind === ts.SyntaxKind.TrueKeyword) || (!value && expr.kind === ts.SyntaxKind.FalseKeyword)
  );
}
