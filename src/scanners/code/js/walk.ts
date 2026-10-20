import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  "Pods",
  "target",
  ".dpdp",
  ".next",
  ".turbo",
  "out",
]);

/** shortcut: files larger than this are skipped; raise it if a real schema exceeds it. */
const MAX_BYTES = 1_000_000;

export interface CodeFile {
  rel: string;
  text: string;
  kind: "script" | "prisma" | "sql" | "lifecycle";
}

interface ListedFile<K extends string> {
  rel: string;
  text: string;
  kind: K;
}

export function listCodeFiles(root: string): CodeFile[] {
  return listFiles(root, kindOf);
}

export function listFiles<K extends string>(root: string, kindOfName: (name: string) => K | undefined): ListedFile<K>[] {
  const out: ListedFile<K>[] = [];
  walk(root, root, kindOfName, out);
  return out;
}

function walk<K extends string>(
  root: string,
  dir: string,
  kindOfName: (name: string) => K | undefined,
  out: ListedFile<K>[],
): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.isSymbolicLink()) continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(root, abs, kindOfName, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const kind = kindOfName(ent.name);
    if (!kind) continue;
    let text: string;
    try {
      if (statSync(abs).size > MAX_BYTES) continue;
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    out.push({ rel: relative(root, abs).split(sep).join("/"), text, kind });
  }
  if (dir === root) out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function kindOf(name: string): CodeFile["kind"] | undefined {
  if (name.endsWith(".d.ts")) return undefined;
  const lower = name.toLowerCase();
  if (lower.endsWith(".prisma")) return "prisma";
  if (lower.endsWith(".sql")) return "sql";
  if (
    (lower.endsWith(".json") || lower.endsWith(".yaml") || lower.endsWith(".yml")) &&
    lower.includes("lifecycle")
  ) {
    return "lifecycle";
  }
  if (/\.(tsx|ts|jsx|js|mjs|cjs|mts|cts)$/.test(lower)) return "script";
  return undefined;
}
