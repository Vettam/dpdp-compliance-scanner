import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, join, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PackageEcosystem } from "../../../vendors/schema.js";

export interface ManifestDependency {
  ecosystem: PackageEcosystem;
  name: string;
  description: string;
  location: string;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  "Pods",
  "target",
  ".dpdp",
]);

const MAX_BYTES = 20 * 1024 * 1024;

/** Dependency names from the manifest files in spec v2 §5.2. No network, no install. */
export function readManifestDependencies(root: string): ManifestDependency[] {
  if (!statSync(root).isDirectory()) throw new Error(`unreadable repository: ${root}`);
  const out: ManifestDependency[] = [];
  walk(root, root, out);
  return out;
}

function walk(root: string, dir: string, out: ManifestDependency[]): void {
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
      if (!SKIP_DIRS.has(ent.name)) walk(root, abs, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const kind = classify(ent.name);
    if (!kind) continue;
    let text: string;
    try {
      if (statSync(abs).size > MAX_BYTES) continue;
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const location = relative(root, abs).split(sep).join("/");
    for (const dep of parseManifest(kind, text)) {
      out.push({ ...dep, location });
    }
  }
}

type ManifestKind =
  | "npm-json"
  | "npm-lock"
  | "yarn"
  | "pnpm"
  | "bun"
  | "requirements"
  | "pyproject"
  | "poetry"
  | "pipfile"
  | "gem"
  | "gomod"
  | "gosum"
  | "pom"
  | "gradle"
  | "cargo"
  | "pod"
  | "swift"
  | "composer"
  | "pub";

function classify(filename: string): ManifestKind | undefined {
  switch (filename) {
    case "package.json":
      return "npm-json";
    case "package-lock.json":
      return "npm-lock";
    case "yarn.lock":
      return "yarn";
    case "pnpm-lock.yaml":
      return "pnpm";
    case "bun.lock":
      return "bun";
    case "pyproject.toml":
      return "pyproject";
    case "poetry.lock":
      return "poetry";
    case "Pipfile.lock":
      return "pipfile";
    case "Gemfile.lock":
      return "gem";
    case "go.mod":
      return "gomod";
    case "go.sum":
      return "gosum";
    case "pom.xml":
      return "pom";
    case "build.gradle":
    case "build.gradle.kts":
      return "gradle";
    case "Cargo.lock":
      return "cargo";
    case "Podfile.lock":
      return "pod";
    case "Package.swift":
      return "swift";
    case "composer.lock":
      return "composer";
    case "pubspec.lock":
      return "pub";
    default:
      return /^requirements.*\.txt$/i.test(filename) ? "requirements" : undefined;
  }
}

interface ParsedDep {
  ecosystem: PackageEcosystem;
  name: string;
  description: string;
}

function parseManifest(kind: ManifestKind, text: string): ParsedDep[] {
  const named = (ecosystem: PackageEcosystem, names: string[], description = ""): ParsedDep[] =>
    dedupe(names).map((name) => ({ ecosystem, name, description }));
  try {
    switch (kind) {
      case "npm-json":
        return named("npm", parsePackageJson(text));
      case "npm-lock":
        return named("npm", parsePackageLock(text));
      case "yarn":
        return named("npm", parseYarnLock(text));
      case "pnpm":
        return named("npm", parsePnpm(text));
      case "bun":
        return named("npm", parseBun(text));
      case "requirements":
        return named("pypi", parseRequirements(text));
      case "pyproject":
        return named("pypi", parsePyproject(text));
      case "poetry":
        return named("pypi", parseNameEquals(text));
      case "pipfile":
        return named("pypi", parsePipfile(text));
      case "gem":
        return named("rubygems", parseGemfile(text));
      case "gomod":
        return named("go", parseGoMod(text));
      case "gosum":
        return named("go", parseGoSum(text));
      case "pom":
        return named("maven", parsePom(text));
      case "gradle":
        return named("maven", parseGradle(text));
      case "cargo":
        return named("cargo", parseNameEquals(text));
      case "pod":
        return named("cocoapods", parsePodfile(text));
      case "swift":
        return named("swift", parsePackageSwift(text));
      case "composer":
        return dedupeDescribed(parseComposer(text)).map((d) => ({ ecosystem: "composer", ...d }));
      case "pub":
        return named("pub", parsePubspec(text));
    }
  } catch {
    return [];
  }
}

function capture(m: RegExpMatchArray | null): string | undefined {
  return m?.[1];
}

function dedupe(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

function dedupeDescribed(deps: { name: string; description: string }[]): { name: string; description: string }[] {
  const seen = new Set<string>();
  const out: { name: string; description: string }[] = [];
  for (const dep of deps) {
    const name = dep.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, description: dep.description });
  }
  return out;
}

function parsePackageJson(text: string): string[] {
  const json = JSON.parse(text) as Record<string, Record<string, unknown> | undefined>;
  const names: string[] = [];
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    names.push(...Object.keys(json[key] ?? {}));
  }
  return names;
}

function parsePackageLock(text: string): string[] {
  const json = JSON.parse(text) as {
    packages?: Record<string, unknown>;
    dependencies?: Record<string, { dependencies?: Record<string, unknown> }>;
  };
  const names = new Set<string>();
  for (const key of Object.keys(json.packages ?? {})) {
    if (!key) continue;
    const marker = "node_modules/";
    const i = key.lastIndexOf(marker);
    names.add(i === -1 ? key : key.slice(i + marker.length));
  }
  const walk = (deps: Record<string, { dependencies?: Record<string, unknown> }> | undefined) => {
    if (!deps) return;
    for (const [name, body] of Object.entries(deps)) {
      names.add(name);
      walk(body?.dependencies as typeof deps);
    }
  };
  walk(json.dependencies);
  return [...names];
}

function parseYarnLock(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#") || line.startsWith(" ") || line.startsWith("\t")) continue;
    if (!line.endsWith(":")) continue;
    for (const part of line.slice(0, -1).split(",")) {
      const name = yarnName(part.trim().replace(/^"|"$/g, ""));
      if (name) names.push(name);
    }
  }
  return names;
}

function yarnName(entry: string): string | undefined {
  const body = entry.startsWith("@") ? entry.slice(1) : entry;
  const at = body.indexOf("@");
  if (at === -1) return undefined;
  return (entry.startsWith("@") ? "@" : "") + body.slice(0, at);
}

function parsePnpm(text: string): string[] {
  const doc = parseYaml(text) as { packages?: Record<string, unknown> } | null;
  const names: string[] = [];
  for (const key of Object.keys(doc?.packages ?? {})) {
    const stripped = key.replace(/^\//, "");
    const at = stripped.lastIndexOf("@");
    if (at > 0) names.push(stripped.slice(0, at));
  }
  return names;
}

function parseBun(text: string): string[] {
  const start = text.indexOf("{");
  if (start === -1) return [];
  const json = JSON.parse(text.slice(start)) as {
    workspaces?: Record<string, Record<string, Record<string, unknown>> | undefined>;
  };
  const names: string[] = [];
  for (const ws of Object.values(json.workspaces ?? {})) {
    for (const key of ["dependencies", "devDependencies", "optionalDependencies"]) {
      names.push(...Object.keys(ws?.[key] ?? {}));
    }
  }
  return names;
}

function parseRequirements(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0]?.trim() ?? "";
    if (!line || line.startsWith("-")) continue;
    const name = line.split(/\[|@|>=|<=|==|~=|!=|>|</)[0]?.trim() ?? "";
    if (/^[A-Za-z0-9]/.test(name)) names.push(name);
  }
  return names;
}

function parsePyproject(text: string): string[] {
  const names: string[] = [];
  for (const block of text.matchAll(/dependencies\s*=\s*\[([\s\S]*?)\]/g)) {
    const body = capture(block);
    if (!body) continue;
    for (const s of body.matchAll(/["']([^"']+)["']/g)) {
      const spec = capture(s) ?? "";
      const name = spec.split(/\[|@|>=|<=|==|~=|!=|>|</)[0]?.trim() ?? "";
      if (name && name.toLowerCase() !== "python") names.push(name);
    }
  }
  const tables = text.matchAll(
    /\[tool\.poetry(?:\.group\.[^\]]+)?\.dependencies\]([\s\S]*?)(?=\n\[|$)/g,
  );
  for (const table of tables) {
    const body = capture(table);
    if (!body) continue;
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
      const ident = capture(m);
      if (ident && ident.toLowerCase() !== "python") names.push(ident);
    }
  }
  return names;
}

function parseNameEquals(text: string): string[] {
  return [...text.matchAll(/^name\s*=\s*["']([^"']+)["']/gm)].map((m) => capture(m) ?? "");
}

function parsePipfile(text: string): string[] {
  const json = JSON.parse(text) as { default?: Record<string, unknown>; develop?: Record<string, unknown> };
  return [...Object.keys(json.default ?? {}), ...Object.keys(json.develop ?? {})];
}

function parseGemfile(text: string): string[] {
  return [...text.matchAll(/^ {4}(\S+) \(/gm)].map((m) => capture(m) ?? "");
}

function parseGoMod(text: string): string[] {
  const names: string[] = [];
  const stripped = text.replace(/require\s*\(([\s\S]*?)\)/g, (_all, inner: string) => {
    for (const line of inner.split("\n")) {
      const mod = line.trim().split(/\s+/)[0];
      if (mod && !mod.startsWith("//")) names.push(mod);
    }
    return "";
  });
  for (const m of stripped.matchAll(/^\s*require\s+(\S+)/gm)) {
    const mod = capture(m);
    if (mod) names.push(mod);
  }
  return names;
}

function parseGoSum(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split("\n")) {
    const mod = line.trim().split(/\s+/)[0];
    if (mod) names.push(mod);
  }
  return names;
}

function parsePom(text: string): string[] {
  const names: string[] = [];
  for (const block of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/gi)) {
    const inner = capture(block);
    if (!inner) continue;
    const group = capture(inner.match(/<groupId>\s*([^<]+?)\s*<\/groupId>/));
    const artifact = capture(inner.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/));
    if (group && artifact) names.push(`${group}:${artifact}`);
  }
  return names;
}

function parseGradle(text: string): string[] {
  const names: string[] = [];
  const re =
    /(?:implementation|api|compileOnly|compile|runtimeOnly|kapt|annotationProcessor|classpath)\s*(?:\(\s*)?['"]([A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+)/g;
  for (const m of text.matchAll(re)) {
    const coord = capture(m);
    if (coord) names.push(coord);
  }
  return names;
}

function parsePodfile(text: string): string[] {
  const names: string[] = [];
  let inPods = false;
  for (const line of text.split("\n")) {
    if (line === "PODS:") {
      inPods = true;
      continue;
    }
    if (inPods && line && !line.startsWith(" ")) break;
    if (!inPods) continue;
    const m = line.match(/^ {2}- ([A-Za-z0-9_.+-]+)/);
    const pod = capture(m);
    if (pod) names.push(pod.split("/")[0] ?? pod);
  }
  return names;
}

function parsePackageSwift(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/\.package\(\s*url:\s*"([^"]+)"/g)) {
    const url = capture(m) ?? "";
    const last = url.split("/").pop()?.replace(/\.git$/, "") ?? "";
    if (last) names.push(last);
  }
  return names;
}

function parseComposer(text: string): { name: string; description: string }[] {
  const json = JSON.parse(text) as {
    packages?: { name?: string; description?: string }[];
    "packages-dev"?: { name?: string; description?: string }[];
  };
  const pkgs = [...(json.packages ?? []), ...(json["packages-dev"] ?? [])];
  return pkgs.filter((p) => p.name).map((p) => ({ name: p.name ?? "", description: p.description ?? "" }));
}

function parsePubspec(text: string): string[] {
  const doc = parseYaml(text) as { packages?: Record<string, unknown> } | null;
  return Object.keys(doc?.packages ?? {});
}
