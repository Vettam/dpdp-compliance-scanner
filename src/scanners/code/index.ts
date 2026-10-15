import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRules, readRulesVersion } from "../../rules/loader.js";
import {
  bundledVendorsDir,
  loadTrackers,
  packageRoot,
  readTrackersVersion,
  resolveDatasetDir,
} from "../../vendors/loader.js";
import { loadPersonalDataVocabulary, type PersonalDataEntry } from "../../vendors/vocabulary.js";
import { mapDataMap } from "../../mapper/data-map.js";
import { emptyDataMap, mergeScan } from "../../map/index.js";
import type { DataMap } from "../../map/schema.js";
import type { Finding, Question } from "../../types.js";
import type { EmittedScan } from "../../map/page.js";
import { emitManifestScan } from "./manifests/scan.js";
import { foldJs, scanJs } from "./js/scan.js";
import { scanPython } from "./python/scan.js";

export interface CodeScanOptions {
  vendorsDir?: string;
  rulesDir?: string;
  /** Path recorded on the scan. Defaults to `repoPath` so `.` stays `.`. */
  sourcePath?: string;
  packageName?: string;
  packageVersion?: string;
  commit?: string;
  scannedAt?: string;
  /** Committed map. Human zone is kept; findings are read from the merge. */
  base?: DataMap;
}

export interface CodeScan {
  emitted: EmittedScan;
  findings: Finding[];
  /** Catalogue questions (`needs_input`). Scanner questions stay on `emitted.questions`. */
  questions: Question[];
}

/**
 * Code scan (spec v2 §5.2): manifests for every ecosystem, JS/TS and Python at code level.
 * No network calls. Findings are map rules on `base` merged with this scan, so a
 * committed basis and retention are tested. With no base, basis stays unstated.
 * Page findings stay on `dpdp scan page`.
 */
export async function scanCode(repoPath: string, options: CodeScanOptions = {}): Promise<CodeScan> {
  const root = resolve(repoPath);
  try {
    if (!statSync(root).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`unreadable repository: ${repoPath}`);
  }
  const vendorsDir = options.vendorsDir ?? bundledVendorsDir(import.meta.url);
  const rulesDir = options.rulesDir ?? join(packageRoot(import.meta.url), "rules");
  const vendors = await loadTrackers(vendorsDir);
  const rules = await loadRules(rulesDir);
  const pkg = readPackage(options);
  const emitted = emitManifestScan({
    root,
    sourcePath: options.sourcePath ?? repoPath,
    vendors,
    packageName: pkg.name,
    packageVersion: pkg.version,
    rulesVersion: readRulesVersion(rulesDir),
    vendorsVersion: readTrackersVersion(vendorsDir),
    ...(options.commit !== undefined ? { commit: options.commit } : {}),
    ...(options.scannedAt !== undefined ? { scannedAt: options.scannedAt } : {}),
  });
  const vocabulary = readVocabulary(vendorsDir);
  const code = { root, scanId: emitted.scan.id, vendors, vocabulary };
  const folded = foldJs(foldJs(emitted, scanJs(code)), scanPython(code));
  const base = options.base ?? emptyDataMap(folded.generated_by);
  const reading = mapDataMap(mergeScan(base, folded), rules, vendors, { page: false });
  return { emitted: folded, findings: reading.findings, questions: reading.questions };
}

function readVocabulary(vendorsDir: string): { entries: PersonalDataEntry[] } {
  const path = join(resolveDatasetDir(vendorsDir), "vocabulary", "personal-data.yaml");
  if (!existsSync(path)) return { entries: [] };
  return loadPersonalDataVocabulary(path);
}

function readPackage(options: CodeScanOptions): { name: string; version: string } {
  if (options.packageName && options.packageVersion) {
    return { name: options.packageName, version: options.packageVersion };
  }
  const path = join(packageRoot(import.meta.url), "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8")) as { name: string; version: string };
  return {
    name: options.packageName ?? pkg.name,
    version: options.packageVersion ?? pkg.version,
  };
}
