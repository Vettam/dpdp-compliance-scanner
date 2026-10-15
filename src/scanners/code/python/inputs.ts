import { slug, type InputHit } from "../js/inputs.js";
import { eachNode, lastPart, loc, parsePython, statements, type PyNode } from "./parse.js";
import type { PySource } from "./walk.js";

const SKIP_FIELDS = new Set(["csrf", "csrf_token", "submit", "model_config", "config"]);
const SKIP_CALLEES = new Set(["booleanfield", "submitfield"]);

export function inputHits(file: PySource): InputHit[] {
  if (file.kind !== "python") return [];
  const parsed = parsePython(file.text);
  const hits: InputHit[] = [];
  eachNode(parsed.root, (node) => {
    if (node.kind !== "class") return;
    const style = formStyle(node);
    if (!style) return;
    const form = formSlug(node.name);
    for (const stmt of statements(node)) {
      const field = fieldOf(stmt.text, style);
      if (!field) continue;
      hits.push({ form, field, location: loc(file.rel, stmt.line) });
    }
  });
  return hits;
}

function formStyle(node: PyNode): "django" | "drf" | "wtforms" | "pydantic" | undefined {
  const bases = node.bases.map(lastPart);
  if (bases.some((base) => base === "BaseModel")) return "pydantic";
  if (bases.some((base) => base === "Serializer" || base === "ModelSerializer")) return "drf";
  if (bases.some((base) => base === "FlaskForm")) return "wtforms";
  const callees = statements(node)
    .map((stmt) => calleeOf(stmt.text))
    .filter((name): name is string => Boolean(name));
  if (bases.some((base) => base === "Form" || base === "ModelForm")) {
    if (callees.some((name) => name === "StringField" || name === "TextAreaField" || name === "PasswordField")) {
      return "wtforms";
    }
    return "django";
  }
  return undefined;
}

function fieldOf(text: string, style: "django" | "drf" | "wtforms" | "pydantic"): string | undefined {
  if (style === "pydantic") {
    const ann = /^([A-Za-z_]\w*)\s*:\s*[^=]+/.exec(text);
    const name = ann?.[1];
    if (!name || name.startsWith("_") || SKIP_FIELDS.has(name.toLowerCase())) return undefined;
    if (/^\s*ClassVar\b/.test(text.slice(text.indexOf(":") + 1))) return undefined;
    return name;
  }
  const match = /^([A-Za-z_]\w*)\s*=\s*([A-Za-z_][\w.]*)\s*\(/.exec(text);
  const name = match?.[1];
  const callee = match?.[2] ? lastPart(match[2]) : "";
  if (!name || name.startsWith("_") || SKIP_FIELDS.has(name.toLowerCase())) return undefined;
  if (SKIP_CALLEES.has(callee.toLowerCase())) return undefined;
  if (!callee.endsWith("Field")) return undefined;
  return name;
}

function calleeOf(text: string): string | undefined {
  const match = /^[A-Za-z_]\w*\s*=\s*([A-Za-z_][\w.]*)\s*\(/.exec(text);
  return match?.[1] ? lastPart(match[1]) : undefined;
}

function formSlug(name: string): string {
  const stripped = name.replace(/(Page|Form|Component|Schema|Validator|Shape|Object|Serializer|Model)$/i, "");
  return slug(stripped || name);
}
