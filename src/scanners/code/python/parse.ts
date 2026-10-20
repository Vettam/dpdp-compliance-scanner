/** Purpose-built Python tokenizer. See README.md for why this is not tree-sitter. */

export interface LogicalLine {
  line: number;
  indent: number;
  text: string;
  start: number;
  end: number;
}

export interface PyNode {
  kind: "module" | "class" | "func" | "if" | "elif" | "else" | "other";
  name: string;
  bases: string[];
  decorators: string[];
  condition: string;
  /** Logical header line, including the trailing colon. */
  header: string;
  line: number;
  indent: number;
  start: number;
  end: number;
  bodyStart: number;
  items: PyItem[];
}

export type PyItem = { type: "stmt"; stmt: LogicalLine } | { type: "node"; node: PyNode };

export interface PyImport {
  name: string;
  module: string;
  line: number;
}

export interface PyCall {
  root: string;
  method: string;
  callee: string;
  args: string[];
  line: number;
  start: number;
  end: number;
  argsStart: number;
  argsEnd: number;
}

export interface PyFile {
  root: PyNode;
  imports: PyImport[];
  constants: Map<string, string>;
  calls: PyCall[];
}

export function loc(rel: string, line: number): string {
  return `${rel}:${line}`;
}

export function lineAt(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function parsePython(src: string): PyFile {
  const lines = logicalLines(src);
  return {
    root: buildTree(src, lines),
    imports: collectImports(lines),
    constants: collectConstants(lines),
    calls: extractCalls(src),
  };
}

export function eachNode(node: PyNode, visit: (node: PyNode) => void): void {
  visit(node);
  for (const item of node.items) if (item.type === "node") eachNode(item.node, visit);
}

export function statements(node: PyNode): LogicalLine[] {
  const out: LogicalLine[] = [];
  for (const item of node.items) if (item.type === "stmt") out.push(item.stmt);
  return out;
}

export function childNodes(node: PyNode): PyNode[] {
  const out: PyNode[] = [];
  for (const item of node.items) if (item.type === "node") out.push(item.node);
  return out;
}

/** A string that is the whole expression. `interpolated` is an f-string with a `{…}` hole. */
export function stringLiteral(expr: string): { value: string; interpolated: boolean } | undefined {
  const trimmed = expr.trim();
  if (!trimmed) return undefined;
  const span = stringSpan(trimmed, 0);
  if (!span || span.end !== trimmed.length) return undefined;
  return { value: span.value, interpolated: span.interpolated };
}

export function lastPart(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1] ?? name;
}

function logicalLines(src: string): LogicalLine[] {
  const out: LogicalLine[] = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const lineNo = line;
    let indent = 0;
    while (src[i] === " " || src[i] === "\t") {
      indent += src[i] === "\t" ? 8 : 1;
      i++;
    }
    if (src[i] === "\r") i++;
    if (src[i] === "\n" || i >= src.length) {
      if (src[i] === "\n") {
        i++;
        line++;
      }
      continue;
    }
    if (src[i] === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      if (src[i] === "\n") {
        i++;
        line++;
      }
      continue;
    }
    const start = i;
    let text = "";
    let paren = 0;
    let end = src.length;
    while (i < src.length) {
      const str = stringSpan(src, i);
      if (str) {
        text += src.slice(i, str.end);
        for (let k = i; k < str.end; k++) if (src[k] === "\n") line++;
        i = str.end;
        continue;
      }
      const c = src[i]!;
      if (c === "#") {
        while (i < src.length && src[i] !== "\n") i++;
        continue;
      }
      if (c === "\\" && (src[i + 1] === "\n" || (src[i + 1] === "\r" && src[i + 2] === "\n"))) {
        i += src[i + 1] === "\r" ? 3 : 2;
        line++;
        text += " ";
        continue;
      }
      if (c === "(" || c === "[" || c === "{") paren++;
      else if ((c === ")" || c === "]" || c === "}") && paren > 0) paren--;
      if (c === "\n" && paren === 0) {
        end = i;
        i++;
        line++;
        break;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        text += " ";
        i++;
        line++;
        continue;
      }
      text += c;
      i++;
      end = i;
    }
    const trimmed = text.trim();
    if (trimmed) out.push({ line: lineNo, indent, text: trimmed, start, end });
  }
  return out;
}

function buildTree(src: string, lines: LogicalLine[]): PyNode {
  const root: PyNode = {
    kind: "module",
    name: "",
    bases: [],
    decorators: [],
    condition: "",
    header: "",
    line: 1,
    indent: -1,
    start: 0,
    end: src.length,
    bodyStart: 0,
    items: [],
  };
  const stack: PyNode[] = [root];
  let pending: string[] = [];
  for (const line of lines) {
    while (stack.length > 1 && line.indent <= stack[stack.length - 1]!.indent) {
      const done = stack.pop()!;
      done.end = line.start;
    }
    if (line.text.startsWith("@")) {
      pending.push(line.text);
      continue;
    }
    const header = compoundHeader(src, line);
    const top = stack[stack.length - 1]!;
    if (header) {
      const node: PyNode = {
        kind: header.kind,
        name: header.name,
        bases: header.bases,
        decorators: header.kind === "class" || header.kind === "func" ? pending : [],
        condition: header.condition,
        header: line.text,
        line: line.line,
        indent: line.indent,
        start: line.start,
        end: line.end,
        bodyStart: header.suiteStart ?? line.end,
        items: [],
      };
      pending = [];
      top.items.push({ type: "node", node });
      if (header.suite !== undefined) {
        node.items.push({
          type: "stmt",
          stmt: { line: line.line, indent: line.indent + 1, text: header.suite, start: header.suiteStart ?? line.start, end: line.end },
        });
      } else stack.push(node);
      continue;
    }
    pending = [];
    top.items.push({ type: "stmt", stmt: line });
  }
  while (stack.length > 1) {
    const done = stack.pop()!;
    done.end = src.length;
  }
  return root;
}

const HEADER =
  /^(async\s+def|async\s+with|async\s+for|elif|else|if|for|while|with|try|except|finally|class|def)\b([\s\S]*)$/;

function compoundHeader(
  src: string,
  line: LogicalLine,
): { kind: PyNode["kind"]; name: string; bases: string[]; condition: string; suite?: string | undefined; suiteStart?: number | undefined } | undefined {
  const match = HEADER.exec(line.text);
  if (!match) return undefined;
  const colon = suiteColon(src, line.start, line.end);
  if (colon === undefined) return undefined;
  const keyword = (match[1] ?? "").replace(/\s+/g, " ");
  const afterKw = line.text.slice(keyword.length).trim();
  const head = src.slice(line.start, colon).trim();
  const headRest = head.replace(/^(async\s+def|async\s+with|async\s+for|elif|else|if|for|while|with|try|except|finally|class|def)\b/, "").trim();
  let suite: string | undefined;
  let suiteStart: number | undefined;
  let k = colon + 1;
  while (k < line.end && (src[k] === " " || src[k] === "\t")) k++;
  if (k < line.end && src[k] !== "#" && src[k] !== "\n" && src[k] !== "\r") {
    suiteStart = k;
    suite = src.slice(k, line.end).replace(/#.*$/, "").trim();
  }
  const kind = kindOf(keyword);
  if (kind === "class") {
    const parsed = classHead(headRest || afterKw);
    return { kind, name: parsed.name, bases: parsed.bases, condition: "", suite, suiteStart };
  }
  if (kind === "func") {
    const name = /^([A-Za-z_]\w*)/.exec(headRest)?.[1] ?? "";
    return { kind, name, bases: [], condition: "", suite, suiteStart };
  }
  if (kind === "if" || kind === "elif") {
    return { kind, name: "", bases: [], condition: headRest, suite, suiteStart };
  }
  return { kind, name: "", bases: [], condition: "", suite, suiteStart };
}

function kindOf(keyword: string): PyNode["kind"] {
  if (keyword === "class") return "class";
  if (keyword === "def" || keyword === "async def") return "func";
  if (keyword === "if") return "if";
  if (keyword === "elif") return "elif";
  if (keyword === "else") return "else";
  return "other";
}

function classHead(rest: string): { name: string; bases: string[] } {
  const name = /^([A-Za-z_]\w*)/.exec(rest)?.[1] ?? "";
  const open = rest.indexOf("(");
  const close = rest.lastIndexOf(")");
  if (open < 0 || close < open) return { name, bases: [] };
  const bases = splitCommas(rest.slice(open + 1, close))
    .map((part) => (part.split("=")[0] ?? "").trim())
    .filter((part) => /^[\w.]+$/.test(part));
  return { name, bases };
}

function suiteColon(src: string, start: number, end: number): number | undefined {
  let paren = 0;
  for (let i = start; i < end; i++) {
    const str = stringSpan(src, i);
    if (str && str.end > i) {
      i = str.end - 1;
      continue;
    }
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") paren++;
    else if ((c === ")" || c === "]" || c === "}") && paren > 0) paren--;
    else if (c === ":" && paren === 0) return i;
    else if (c === "#") break;
  }
  return undefined;
}

function collectImports(lines: LogicalLine[]): PyImport[] {
  const out: PyImport[] = [];
  for (const line of lines) {
    const from = /^from\s+(\S+)\s+import\s+(.+)$/.exec(line.text);
    if (from?.[1] && from[2]) {
      for (const part of splitCommas(from[2].replace(/^\(|\)$/g, ""))) {
        const alias = /^(\*|[A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(part.trim());
        if (!alias?.[1] || alias[1] === "*") continue;
        out.push({ name: alias[2] ?? alias[1], module: from[1], line: line.line });
      }
      continue;
    }
    const imp = /^import\s+(.+)$/.exec(line.text);
    if (!imp?.[1]) continue;
    for (const part of splitCommas(imp[1])) {
      const alias = /^([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(part.trim());
      if (!alias?.[1]) continue;
      out.push({ name: alias[2] ?? alias[1].split(".")[0] ?? alias[1], module: alias[1], line: line.line });
    }
  }
  return out;
}

/** shortcut: one file-level map; a later binding shadows an earlier one. */
function collectConstants(lines: LogicalLine[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const match = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*([\s\S]+)$/.exec(line.text);
    if (!match?.[1] || !match[2]) continue;
    const lit = stringLiteral(match[2]);
    if (lit && !lit.interpolated) map.set(match[1], lit.value);
  }
  return map;
}

function extractCalls(src: string): PyCall[] {
  const calls: PyCall[] = [];
  walkCalls(src, 0, src.length, calls);
  return calls;
}

function walkCalls(src: string, from: number, to: number, calls: PyCall[]): void {
  let i = from;
  while (i < to) {
    const str = stringSpan(src, i);
    if (str && str.end > i) {
      i = str.end;
      continue;
    }
    const c = src[i];
    if (c === "#") {
      while (i < to && src[i] !== "\n") i++;
      continue;
    }
    if (c && isIdentStart(c)) {
      const dotted = readDotted(src, i, to);
      const j = skipWs(src, dotted.end, to);
      if (j < to && src[j] === "(") {
        const chain = parseChain(src, dotted.parts, i, j, to);
        calls.push(...chain);
        for (const call of chain) walkCalls(src, call.argsStart, call.argsEnd, calls);
        const last = chain[chain.length - 1];
        i = last ? last.end : dotted.end;
        continue;
      }
      i = dotted.end;
      continue;
    }
    i++;
  }
}

function parseChain(src: string, parts: string[], start: number, paren: number, limit: number): PyCall[] {
  const root = parts[0] ?? "";
  const out: PyCall[] = [];
  let method = parts[parts.length - 1] ?? "";
  let callee = parts.join(".");
  let j = paren;
  let guard = 0;
  while (j < limit && src[j] === "(" && guard++ < 100) {
    const args = readArgs(src, j, limit);
    out.push({
      root,
      method,
      callee,
      args: args.parts,
      line: lineAt(src, start),
      start,
      end: args.end,
      argsStart: args.argsStart,
      argsEnd: args.argsEnd,
    });
    j = skipWs(src, args.end, limit);
    if (src[j] !== ".") break;
    const afterDot = skipWs(src, j + 1, limit);
    if (!isIdentStart(src[afterDot] ?? "")) break;
    const ident = readIdent(src, afterDot, limit);
    method = ident.text;
    callee = `${callee}.${method}`;
    j = skipWs(src, ident.end, limit);
  }
  return out;
}

function readArgs(
  src: string,
  open: number,
  limit: number,
): { parts: string[]; end: number; argsStart: number; argsEnd: number } {
  let i = open + 1;
  const argsStart = i;
  let depth = 1;
  let cur = "";
  const parts: string[] = [];
  while (i < limit && depth > 0) {
    const str = stringSpan(src, i);
    if (str && str.end > i) {
      cur += src.slice(i, Math.min(str.end, limit));
      i = str.end;
      continue;
    }
    const c = src[i]!;
    if (c === "#") {
      while (i < limit && src[i] !== "\n") i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      cur += c;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        if (cur.trim()) parts.push(cur.trim());
        return { parts, end: i + 1, argsStart, argsEnd: i };
      }
      cur += c;
      i++;
      continue;
    }
    if (c === "," && depth === 1) {
      parts.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) parts.push(cur.trim());
  return { parts, end: i, argsStart, argsEnd: i };
}

function readDotted(src: string, i: number, limit: number): { parts: string[]; end: number } {
  const parts: string[] = [];
  let end = i;
  while (i < limit && isIdentStart(src[i] ?? "")) {
    const ident = readIdent(src, i, limit);
    parts.push(ident.text);
    end = ident.end;
    const j = skipWs(src, ident.end, limit);
    if (src[j] !== ".") break;
    const after = skipWs(src, j + 1, limit);
    if (!isIdentStart(src[after] ?? "")) break;
    i = after;
    end = after;
  }
  return { parts, end };
}

function readIdent(src: string, i: number, limit: number): { text: string; end: number } {
  const start = i;
  i++;
  while (i < limit && isIdentPart(src[i] ?? "")) i++;
  return { text: src.slice(start, i), end: i };
}

function skipWs(src: string, i: number, limit: number): number {
  while (i < limit && (src[i] === " " || src[i] === "\t" || src[i] === "\n" || src[i] === "\r")) i++;
  return i;
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

export function splitCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const str = stringSpan(body, i);
    if (str && str.end > i) {
      cur += body.slice(i, str.end);
      i = str.end - 1;
      continue;
    }
    const c = body[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if ((c === ")" || c === "]" || c === "}") && depth > 0) depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

interface StrSpan {
  end: number;
  value: string;
  interpolated: boolean;
}

function stringSpan(src: string, i: number): StrSpan | undefined {
  let j = i;
  let prefix = "";
  if (/[rRuUbBfF]/.test(src[i] ?? "")) {
    let k = i;
    while (/[rRuUbBfF]/.test(src[k] ?? "")) k++;
    if (src[k] !== "'" && src[k] !== '"') return undefined;
    prefix = src.slice(i, k);
    if (!/^[rRuUbBfF]{1,3}$/.test(prefix)) return undefined;
    j = k;
  }
  const q = src[j];
  if (q !== "'" && q !== '"') return undefined;
  return readString(src, j, /[fF]/.test(prefix), /[rR]/.test(prefix));
}

function readString(src: string, i: number, isF: boolean, raw: boolean): StrSpan {
  const q = src[i]!;
  const triple = src.startsWith(q + q + q, i);
  const delim = triple ? q + q + q : q;
  i += delim.length;
  let value = "";
  let interpolated = false;
  while (i < src.length) {
    if (src.startsWith(delim, i)) return { end: i + delim.length, value, interpolated };
    const c = src[i]!;
    if (c === "\\") {
      const n = src[i + 1];
      if (n === undefined) break;
      value += raw ? `\\${n}` : n === "n" ? "\n" : n === "t" ? "\t" : n;
      i += 2;
      continue;
    }
    if (isF && c === "{") {
      if (src[i + 1] === "{") {
        value += "{";
        i += 2;
        continue;
      }
      interpolated = true;
      i = skipFExpr(src, i + 1);
      continue;
    }
    if (isF && c === "}" && src[i + 1] === "}") {
      value += "}";
      i += 2;
      continue;
    }
    value += c;
    i++;
  }
  return { end: src.length, value, interpolated };
}

function skipFExpr(src: string, i: number): number {
  let depth = 1;
  while (i < src.length && depth > 0) {
    const str = stringSpan(src, i);
    if (str && str.end > i) {
      i = str.end;
      continue;
    }
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return i;
}
