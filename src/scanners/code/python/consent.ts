import type { Tracker } from "../../../vendors/schema.js";
import { TrackerIndex } from "../../../vendors/matcher.js";
import { idPart } from "../../../map/ids.js";
import { CONSENT_WORD, SUBMIT_TEXT, isConsentName, type CodeSpan, type GateHit } from "../js/consent.js";
import { hostOf, safeExcerpt } from "../js/redact.js";
import { childNodes, eachNode, lastPart, lineAt, loc, parsePython, statements, stringLiteral, type PyNode } from "./parse.js";
import { pythonVendor } from "./http.js";
import type { PySource } from "./walk.js";

export function consentHits(
  file: PySource,
  index: TrackerIndex,
): { gates: GateHit[]; spans: CodeSpan[] } {
  if (file.kind === "template") return { gates: templateGates(file.rel, file.text), spans: [] };
  if (file.kind !== "python") return { gates: [], spans: [] };
  const parsed = parsePython(file.text);
  const gates: GateHit[] = [];
  const spans: CodeSpan[] = [];
  for (const vendor of cmpVendors(parsed, index)) {
    gates.push({
      id: `cg_cmp_${idPart(vendor.id)}`,
      kind: "banner",
      location: loc(file.rel, vendor.line),
      confidence: "high",
      text: "",
    });
  }
  eachNode(parsed.root, (node) => {
    if (node.kind === "class" && isMiddleware(node)) pushCheck(gates, file.rel, node.line, node.name);
    if (node.kind !== "if" && node.kind !== "elif") return;
    const pol = polarity(node.condition);
    if (!pol) return;
    if (pol.positive) addSpan(file.rel, node.bodyStart, node.end, node.line, pol.name, spans, gates);
    else {
      const siblings = childNodes(parentOf(parsed.root, node) ?? parsed.root);
      const idx = siblings.indexOf(node);
      const nxt = siblings[idx + 1];
      if (nxt?.kind === "else") addSpan(file.rel, nxt.bodyStart, nxt.end, nxt.line, pol.name, spans, gates);
      else if (onlyReturn(node)) {
        const parent = parentOf(parsed.root, node) ?? parsed.root;
        addSpan(file.rel, node.end, parent.end, node.line, pol.name, spans, gates);
      }
    }
  });
  middlewareList(file.rel, parsed, gates);
  return { gates, spans };
}

function cmpVendors(file: ReturnType<typeof parsePython>, index: TrackerIndex): { id: string; line: number }[] {
  const found: { id: string; line: number }[] = [];
  const seen = new Set<string>();
  const add = (vendor: Tracker | undefined, line: number) => {
    if (!vendor || vendor.category !== "C10" || seen.has(vendor.id)) return;
    seen.add(vendor.id);
    found.push({ id: vendor.id, line });
  };
  for (const imp of file.imports) {
    add(cmpFromModule(imp.module, index), imp.line);
  }
  for (const value of file.constants.values()) {
    const host = hostOf(value);
    if (host) add(index.byRequest(host.host, host.path), 1);
  }
  return found;
}

function cmpFromModule(module: string, index: TrackerIndex): Tracker | undefined {
  const packaged = pythonVendor(index, module);
  if (packaged?.category === "C10") return packaged;
  const parts = module.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return index.all().find((tracker) => tracker.category === "C10" && parts.includes(tracker.id));
}

function isMiddleware(node: PyNode): boolean {
  if (!/consent|opt_?in|opted_?in/i.test(node.name)) return false;
  const bases = node.bases.map(lastPart).join(" ");
  if (/Middleware|BasePermission|Permission/.test(bases)) return true;
  return childNodes(node).some((child) => child.kind === "func" && /^(?:__call__|process_request|has_permission)$/.test(child.name));
}

function middlewareList(rel: string, file: ReturnType<typeof parsePython>, gates: GateHit[]): void {
  eachNode(file.root, (node) => {
    for (const stmt of statements(node)) {
      if (!/^MIDDLEWARE\s*(?::[^=]+)?=/.test(stmt.text)) continue;
      for (const lit of stringLiterals(stmt.text)) {
        if (!/consent|opt_?in/i.test(lit.value)) continue;
        const name = lit.value.split(".").pop() ?? lit.value;
        pushCheck(gates, rel, stmt.line, name);
      }
    }
  });
}

function pushCheck(gates: GateHit[], rel: string, line: number, name: string): void {
  const id = `cg_${idPart(name)}_check`;
  if (gates.some((gate) => gate.id === id)) return;
  gates.push({ id, kind: "code_check", location: loc(rel, line), confidence: "medium", text: "" });
}

function addSpan(
  file: string,
  start: number,
  end: number,
  line: number,
  name: string,
  spans: CodeSpan[],
  gates: GateHit[],
): void {
  if (end <= start) return;
  const gateId = `cg_${idPart(name)}_check`;
  spans.push({ file, start, end, gateId });
  if (!gates.some((gate) => gate.id === gateId)) {
    gates.push({ id: gateId, kind: "code_check", location: loc(file, line), confidence: "medium", text: "" });
  }
}

function onlyReturn(node: PyNode): boolean {
  if (node.items.length === 0) return false;
  return node.items.every((item) => item.type === "stmt" && /^(return|raise|break|continue)\b/.test(item.stmt.text));
}

function parentOf(root: PyNode, target: PyNode): PyNode | undefined {
  for (const child of childNodes(root)) {
    if (child === target) return root;
    const found = parentOf(child, target);
    if (found) return found;
  }
  return undefined;
}

function polarity(expr: string): { positive: boolean; name: string } | undefined {
  let s = expr.trim().replace(/:$/, "").trim();
  if (s.startsWith("(") && s.endsWith(")")) return polarity(s.slice(1, -1));
  const negated = /^not\s+([\s\S]+)$/i.exec(s);
  if (negated?.[1]) {
    const inner = polarity(negated[1]);
    if (inner) return { positive: !inner.positive, name: inner.name };
  }
  const cmp = /^(.+?)\s*(==|!=|is\s+not|is)\s*(.+)$/i.exec(s);
  if (cmp?.[1] && cmp[2] && cmp[3]) {
    const left = consentRef(cmp[1]);
    const right = consentRef(cmp[3]);
    const name = left ?? right;
    const other = left ? cmp[3] : cmp[1];
    if (name && isBoolText(other)) {
      let positive = boolValue(other);
      const op = cmp[2].replace(/\s+/g, " ").toLowerCase();
      if (op === "!=" || op === "is not") positive = !positive;
      return { positive, name };
    }
  }
  const name = consentRef(s);
  if (name) return { positive: true, name };
  return undefined;
}

function consentRef(expr: string): string | undefined {
  const s = expr.trim();
  if (!/^[\w.]+$/.test(s)) return undefined;
  const lastName = s.split(".").pop() ?? "";
  return isConsentName(lastName) ? lastName : undefined;
}

function isBoolText(expr: string): boolean {
  const s = expr.trim().toLowerCase();
  return s === "true" || s === "false";
}

function boolValue(expr: string): boolean {
  return expr.trim().toLowerCase() === "true";
}

function templateGates(rel: string, text: string): GateHit[] {
  const gates: GateHit[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match: RegExpExecArray | null;
  while ((match = formRe.exec(text))) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    if (!hasSubmit(body)) continue;
    const excerpt = consentLabel(body);
    if (excerpt === undefined) continue;
    const form = htmlAttr(attrs, "name") || htmlAttr(attrs, "id") || "form";
    gates.push({
      id: `cg_${idPart(form)}_checkbox`,
      kind: "checkbox",
      location: loc(rel, lineAt(text, match.index)),
      confidence: "high",
      text: safeExcerpt(excerpt),
    });
  }
  return gates;
}

function hasSubmit(body: string): boolean {
  if (/<input\b[^>]*type\s*=\s*["']submit["']/i.test(body)) return true;
  const button = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match: RegExpExecArray | null;
  while ((match = button.exec(body))) {
    const attrs = match[1] ?? "";
    const type = htmlAttr(attrs, "type");
    if (type === "submit" || type === null) {
      if (type === "submit" || SUBMIT_TEXT.test(stripTags(match[2] ?? ""))) return true;
    }
  }
  return false;
}

function consentLabel(body: string): string | undefined {
  const labelRe = /<label\b[^>]*>([\s\S]*?)<\/label>/gi;
  let match: RegExpExecArray | null;
  while ((match = labelRe.exec(body))) {
    const inner = match[1] ?? "";
    const text = stripTags(inner);
    if (checkboxIn(inner, text)) return text;
  }
  const inputRe = /<input\b([^>]*)\/?>/gi;
  while ((match = inputRe.exec(body))) {
    if (!isConsentBox(match[1] ?? "", "")) continue;
    return "";
  }
  return undefined;
}

/** A checkbox, or an unnamed checkbox whose label text is a consent sentence. */
function checkboxIn(html: string, labelText: string): boolean {
  const inputRe = /<input\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = inputRe.exec(html))) {
    if (isConsentBox(match[1] ?? "", labelText)) return true;
  }
  return false;
}

function isConsentBox(attrs: string, labelText: string): boolean {
  const type = htmlAttr(attrs, "type");
  const name = `${htmlAttr(attrs, "name") ?? ""} ${htmlAttr(attrs, "id") ?? ""}`;
  if (type !== null && type !== "checkbox") return false;
  if (CONSENT_WORD.test(name)) return true;
  return type === "checkbox" && CONSENT_WORD.test(labelText);
}

function htmlAttr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stringLiterals(text: string): { value: string }[] {
  const out: { value: string }[] = [];
  const re = /(['"])((?:\\.|(?!\1).)*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const lit = stringLiteral(`${match[1]}${match[2]}${match[1]}`);
    if (lit && !lit.interpolated) out.push({ value: lit.value });
  }
  return out;
}
