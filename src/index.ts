import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadRules, readRulesVersion } from "./rules/loader.js";
import { bundledVendorsDir, loadTrackers, readTrackersVersion } from "./trackers/loader.js";
import { TrackerIndex } from "./trackers/matcher.js";
import { mapScan } from "./mapper/index.js";
import { emitPageScan, type EmittedScan } from "./map/page.js";
import { attachInteraction, bannerActionClicked } from "./interaction/compare.js";
import { cmpSignaturesFromTrackers } from "./engine/banner.js";
import type { ScanResult } from "./types.js";
import type { ScanEngine, ScanOptions } from "./engine/types.js";

export { FixtureEngine } from "./engine/fixture.js";
export type { ScanEngine, ScanOptions } from "./engine/types.js";
export { renderTerminal } from "./report/terminal.js";
export { renderJson } from "./report/json.js";
export { renderMarkdown } from "./report/markdown.js";
export { diffScanResults } from "./diff/index.js";
export { comparePasses, attachInteraction } from "./interaction/compare.js";
export type { ScanResult, Finding, Question, Observation, ScanResultDiff, Interaction } from "./types.js";
export { loadDataMap, saveDataMap } from "./map/io.js";
export { deriveId } from "./map/ids.js";
export { mergeScan } from "./map/merge.js";
export { diffDataMaps } from "./map/diff.js";
export { mapDataMap, mapDataMap as mapFindings } from "./mapper/data-map.js";
export type { DataMap, DataMapDiff } from "./map/schema.js";
export type { EmittedScan };
export { scanCode } from "./scanners/code/index.js";
export type { CodeScan, CodeScanOptions } from "./scanners/code/index.js";
export { noticeInputs, noticeLines, noticeChanges } from "./notice/index.js";
export type { NoticeInputs, NoticeLine, NoticeChange, NoticeReading } from "./notice/index.js";

export interface ScanRunOptions extends ScanOptions {
  /** Override the engine (tests pass a FixtureEngine). Defaults to the real engine. */
  engine?: ScanEngine;
  /** Override the rules directory. */
  rulesDir?: string;
  /** Override the trackers directory. */
  trackersDir?: string;
  /** Override the interpretation-as-of date. */
  interpretationAsOf?: string;
  /**
   * Run three independent passes (load, accept-all, reject-all) and attach
   * `interaction` comparing their findings. Default is load-only.
   */
  interact?: boolean;
}

const ENGINE_VERSION = "1.0.0";

function defaultRulesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "rules");
}

function defaultTrackersDir(): string {
  return bundledVendorsDir(import.meta.url);
}

function engineOptions(options: ScanRunOptions): ScanOptions {
  const out: ScanOptions = {};
  if (options.timeout !== undefined) out.timeout = options.timeout;
  if (options.settle !== undefined) out.settle = options.settle;
  if (options.gpc !== undefined) out.gpc = options.gpc;
  if (options.includeQuery !== undefined) out.includeQuery = options.includeQuery;
  if (options.screenshot !== undefined) out.screenshot = options.screenshot;
  if (options.screenshotPath !== undefined) out.screenshotPath = options.screenshotPath;
  if (options.browserPath !== undefined) out.browserPath = options.browserPath;
  if (options.bannerAction !== undefined) out.bannerAction = options.bannerAction;
  return out;
}

function withoutBannerAction(options: ScanOptions): ScanOptions {
  const { bannerAction: _unused, ...rest } = options;
  return rest;
}

function passOptions(options: ScanOptions, bannerAction: "accept" | "reject"): ScanOptions {
  const { screenshotPath: _unused, ...rest } = options;
  return { ...rest, bannerAction };
}

function readPackage(): { name: string; version: string } {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  return JSON.parse(readFileSync(path, "utf8")) as { name: string; version: string };
}

/**
 * The library entry point (spec §3.1): scan(url, options) → ScanResult.
 * Surfaces are thin renderers over this. Never forks logic per surface.
 */
export async function scan(url: string, options: ScanRunOptions = {}): Promise<ScanResult> {
  return (await scanPage(url, options)).result;
}

/** Page scan plus the data-map records it emits. ScanResult itself is unchanged. */
export async function scanPage(
  url: string,
  options: ScanRunOptions = {},
): Promise<{ result: ScanResult; emitted: EmittedScan }> {
  const engine = options.engine ?? (await import("./engine/playwright.js")).defaultEngine;
  const rulesDir = options.rulesDir ?? defaultRulesDir();
  const trackersDir = options.trackersDir ?? defaultTrackersDir();

  const rules = await loadRules(rulesDir);
  const trackers = await loadTrackers(trackersDir);
  const index = new TrackerIndex(trackers);
  const mapped = {
    rules,
    trackers: index,
    engineVersion: ENGINE_VERSION,
    rulesVersion: readRulesVersion(rulesDir),
    trackersVersion: readTrackersVersion(trackersDir),
    interpretationAsOf: options.interpretationAsOf ?? new Date().toISOString().slice(0, 10),
  };

  const opts: ScanOptions = { ...engineOptions(options), cmpSignatures: cmpSignaturesFromTrackers(trackers) };
  const loadObs = await engine.scan(url, options.interact ? withoutBannerAction(opts) : opts);
  const load = mapScan({ observations: loadObs, ...mapped });
  const pkg = readPackage();
  const emitted = emitPageScan({
    result: load,
    observations: loadObs,
    vendors: trackers,
    packageName: pkg.name,
    packageVersion: pkg.version,
  });
  if (!options.interact) return { result: load, emitted };

  const acceptObs = await engine.scan(url, passOptions(opts, "accept"));
  const rejectObs = await engine.scan(url, passOptions(opts, "reject"));
  return {
    result: attachInteraction(
      load,
      mapScan({ observations: acceptObs, ...mapped }),
      mapScan({ observations: rejectObs, ...mapped }),
      { accept: bannerActionClicked(acceptObs), reject: bannerActionClicked(rejectObs) },
    ),
    emitted,
  };
}
