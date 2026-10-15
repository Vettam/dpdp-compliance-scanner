import ts from "typescript";

export function parseScript(fileName: string, text: string): ts.SourceFile {
  const lower = fileName.toLowerCase();
  const kind = lower.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : lower.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
}

export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export function loc(rel: string, line: number): string {
  return `${rel}:${line}`;
}

export function calleeName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return undefined;
}

export function rootIdentifier(expr: ts.Expression): string | undefined {
  let cur: ts.Expression = expr;
  for (;;) {
    if (ts.isIdentifier(cur)) return cur.text;
    if (
      ts.isPropertyAccessExpression(cur) ||
      ts.isCallExpression(cur) ||
      ts.isParenthesizedExpression(cur) ||
      ts.isAsExpression(cur) ||
      ts.isNonNullExpression(cur) ||
      ts.isElementAccessExpression(cur)
    ) {
      cur = cur.expression;
      continue;
    }
    return undefined;
  }
}

export function literalString(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

export function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

export function objectString(obj: ts.ObjectLiteralExpression, key: string): string | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || propName(prop.name) !== key) continue;
    return literalString(prop.initializer);
  }
  return undefined;
}

export function jsxTag(node: ts.Node): string | undefined {
  const el = ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)
      ? node
      : undefined;
  if (!el) return undefined;
  const tag = el.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  return undefined;
}

export function jsxAttr(node: ts.Node, name: string): string | undefined {
  const el = ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)
      ? node
      : undefined;
  if (!el) return undefined;
  for (const attr of el.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name) || attr.name.text !== name || !attr.initializer) continue;
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
    if (
      ts.isJsxExpression(attr.initializer) &&
      attr.initializer.expression &&
      (ts.isStringLiteral(attr.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(attr.initializer.expression))
    ) {
      return attr.initializer.expression.text;
    }
  }
  return undefined;
}

export function jsxText(node: ts.Node): string {
  if (!ts.isJsxElement(node)) return "";
  let text = "";
  for (const child of node.children) {
    if (ts.isJsxText(child)) text += child.text;
  }
  return text.replace(/\s+/g, " ").trim();
}

export function deepestCall(expr: ts.Expression): ts.CallExpression | undefined {
  if (ts.isCallExpression(expr)) {
    return deepestCall(expr.expression) ?? expr;
  }
  if (
    ts.isPropertyAccessExpression(expr) ||
    ts.isParenthesizedExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isAsExpression(expr)
  ) {
    return deepestCall(expr.expression);
  }
  return undefined;
}

export function decoratorCall(node: ts.Node, name: string): ts.CallExpression | undefined {
  if (!ts.canHaveDecorators(node)) return undefined;
  for (const dec of ts.getDecorators(node) ?? []) {
    if (!ts.isCallExpression(dec.expression)) continue;
    if (calleeName(dec.expression.expression) === name) return dec.expression;
  }
  return undefined;
}

export function lineAt(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
