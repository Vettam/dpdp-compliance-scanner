import { execFileSync } from "node:child_process";
import { dirname, join, sep } from "node:path";
import { loadRules, readRulesVersion } from "../rules/loader.js";
import { loadTrackers, readTrackersVersion } from "../trackers/loader.js";
import { mapDataMap } from "../mapper/data-map.js";
import { DATA_MAP_FILENAME } from "../map/io.js";
import {
  diffDataMaps,
  emptyDataMap,
  parseDataMap,
  renderDataMapDiff,
  renderDataMapDiffMarkdown,
  renderMapShow,
  renderMapShowJson,
  serializeDataMap,
  openQuestions,
} from "../map/index.js";
import { parseFailOn, unmappedNames } from "./fail-on.js";

export interface MapCommandDeps {
  stdout: { write: (s: string) => void };
  stderr: { write: (s: string) => void };
  exit: (code: number) => void;
  writeFile: (path: string, data: string) => void;
  readFile: (path: string) => string;
  mkdir: (path: string) => void;
  exists: (path: string) => boolean;
  rulesDir: string;
  trackersDir: string;
  mapPath: string;
  packageName: string;
  packageVersion: string;
  /** Repository for `git show <ref>:.dpdp/data-map.yaml`. Defaults to the process cwd. */
  cwd?: string;
}

const MISSING = "no data map; run `dpdp scan page` or `dpdp map init`\n";

export function executeMapInit(deps: MapCommandDeps): number {
  if (deps.exists(deps.mapPath)) {
    deps.stdout.write(`${deps.mapPath}\n`);
    return 0;
  }
  const map = emptyDataMap({
    package: deps.packageName,
    version: deps.packageVersion,
    rules_version: readRulesVersion(deps.rulesDir),
    vendors_version: readTrackersVersion(deps.trackersDir),
  });
  deps.mkdir(dirname(deps.mapPath));
  deps.writeFile(deps.mapPath, serializeDataMap(map));
  deps.stdout.write(`${deps.mapPath}\n`);
  return 0;
}

export async function executeMapShow(args: { json: boolean }, deps: MapCommandDeps): Promise<number> {
  const map = readMap(deps);
  if (!map) return 2;
  const rules = await loadRules(deps.rulesDir);
  const vendors = await loadTrackers(deps.trackersDir);
  const { findings, questions } = mapDataMap(map, rules, vendors);
  deps.stdout.write(args.json ? renderMapShowJson(map, findings, questions) : renderMapShow(map, findings, questions) + "\n");
  return 0;
}

export function executeMapQuestions(args: { json: boolean }, deps: MapCommandDeps): number {
  const map = readMap(deps);
  if (!map) return 2;
  const questions = openQuestions(map);
  if (args.json) deps.stdout.write(JSON.stringify(questions, null, 2) + "\n");
  else if (questions.length === 0) deps.stdout.write("no open questions\n");
  else deps.stdout.write(questions.map((q) => q.ask).join("\n") + "\n");
  return 0;
}

export async function executeDataMapDiff(
  args: { from: string; to: string; out: string; json: boolean; md: boolean; ci: boolean; failOn: string },
  deps: MapCommandDeps,
): Promise<number> {
  const failOn = parseFailOn(args.failOn, true);
  if (failOn === "invalid") {
    deps.stderr.write("error: --fail-on accepts 'settled' or 'unmapped'\n");
    deps.exit(2);
    return 2;
  }
  if (!args.from || !args.to) {
    deps.stderr.write("usage: dpdp map diff --from <ref|file> --to <ref|file>\n");
    deps.exit(2);
    return 2;
  }
  let fromText: string;
  let toText: string;
  try {
    fromText = readMapSource(args.from, deps);
    toText = readMapSource(args.to, deps);
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(2);
    return 2;
  }
  let diff;
  try {
    const from = parseDataMap(fromText);
    const to = parseDataMap(toText);
    const rules = await loadRules(deps.rulesDir);
    const vendors = await loadTrackers(deps.trackersDir);
    diff = diffDataMaps(from, to, (map) => mapDataMap(map, rules, vendors).findings);
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(2);
    return 2;
  }
  const json = JSON.stringify(diff, null, 2) + "\n";
  deps.mkdir(args.out);
  deps.writeFile(join(args.out, "datamap-diff.json"), json);
  if (args.md || args.ci) {
    deps.writeFile(join(args.out, "datamap-diff.md"), renderDataMapDiffMarkdown(diff));
  }
  deps.stdout.write(renderDataMapDiff(diff) + "\n");
  // Catalogue drift never fails a build. `settled` is a scan gate, not a diff gate.
  if (failOn === "unmapped") {
    const names = [...new Set(unmappedNames(diff))];
    if (names.length > 0) {
      deps.stderr.write(`${names.length} unmapped (${names.join(", ")}); --fail-on unmapped\n`);
      return 1;
    }
  }
  return 0;
}

const GIT_MAP_PATH = DATA_MAP_FILENAME.split(sep).join("/");

export function readMapSource(spec: string, deps: MapCommandDeps): string {
  if (deps.exists(spec)) return deps.readFile(spec);
  const cwd = deps.cwd ?? process.cwd();
  try {
    return execFileSync("git", ["show", `${spec}:${GIT_MAP_PATH}`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const stderr = String((e as { stderr?: string }).stderr ?? "").trim();
    throw new Error(stderr || `cannot read ${DATA_MAP_FILENAME} at ${spec}`);
  }
}

export function readMap(deps: MapCommandDeps) {
  if (!deps.exists(deps.mapPath)) {
    deps.stderr.write(MISSING);
    deps.exit(2);
    return undefined;
  }
  try {
    return parseDataMap(deps.readFile(deps.mapPath));
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(3);
    return undefined;
  }
}
