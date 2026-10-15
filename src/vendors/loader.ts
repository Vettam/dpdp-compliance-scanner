import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateTracker, type Tracker } from "./schema.js";

export interface TrackerFailure {
  file: string;
  error: string;
}

export class TrackerLoadError extends Error {
  failures: TrackerFailure[];
  constructor(failures: TrackerFailure[]) {
    super(`tracker dataset failed to load (${failures.length} failure(s))`);
    this.name = "TrackerLoadError";
    this.failures = failures;
  }
}

/**
 * `vendors/` is the dataset. `trackers/` is a symlink for this release.
 * If a checkout has only one of the two names, load the one that exists.
 */
export function resolveDatasetDir(dir: string): string {
  if (existsSync(dir)) return dir;
  const base = basename(dir);
  const sibling = base === "trackers" ? "vendors" : base === "vendors" ? "trackers" : "";
  if (!sibling) return dir;
  const alt = join(dirname(dir), sibling);
  return existsSync(alt) ? alt : dir;
}

/** Directory that contains this package's package.json, walking up from a module URL. */
export function packageRoot(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(fileURLToPath(moduleUrl));
}

/** Dataset shipped beside package.json (`vendors/`, or `trackers/` for this release). */
export function bundledVendorsDir(moduleUrl: string): string {
  return resolveDatasetDir(join(packageRoot(moduleUrl), "vendors"));
}

export async function loadTrackers(dir: string): Promise<Tracker[]> {
  const dataset = resolveDatasetDir(dir);
  const files = readdirSync(dataset)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const failures: TrackerFailure[] = [];
  const trackers: Tracker[] = [];
  for (const file of files) {
    const text = readFileSync(join(dataset, file), "utf8");
    const doc = parseYaml(text);
    const result = validateTracker(doc);
    if (result.ok) {
      trackers.push(result.value);
    } else {
      failures.push({ file, error: result.error.message });
    }
  }
  if (failures.length > 0) throw new TrackerLoadError(failures);
  return trackers;
}

export function readTrackersVersion(dir: string): string {
  return readFileSync(join(resolveDatasetDir(dir), "VERSION"), "utf8").trim();
}
