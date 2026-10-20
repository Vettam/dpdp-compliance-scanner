import { dirname, join } from "node:path";
import { scanPage, type ScanRunOptions } from "../index.js";
import {
  DATA_MAP_FILENAME,
  emptyDataMap,
  mergeScan,
  parseDataMap,
  serializeDataMap,
  type EmittedScan,
} from "../map/index.js";
import { renderTerminal } from "../report/terminal.js";
import { renderJson } from "../report/json.js";
import { renderMarkdown } from "../report/markdown.js";
import { diffScanResults } from "../diff/index.js";
import { hasSettledFindings, parseFailOn } from "./fail-on.js";
import type { ScanEngine } from "../engine/types.js";
import { ScanResult } from "../types.js";
import { readRulesVersion } from "../rules/loader.js";

export interface CliArgs {
  url: string;
  json: boolean;
  md: boolean;
  out: string;
  ci: boolean;
  gpc: boolean;
  includeQuery: boolean;
  screenshot: boolean;
  timeout: number;
  settle: number;
  rulesVersion: boolean;
  browser: string;
  interact: boolean;
  failOn: string;
  noMap?: boolean;
}

export interface CliDeps {
  stdout: { write: (s: string) => void };
  stderr: { write: (s: string) => void };
  exit: (code: number) => void;
  writeFile: (path: string, data: string) => void;
  readFile?: (path: string) => string;
  mkdir: (path: string) => void;
  engine?: ScanEngine;
  rulesDir: string;
  trackersDir: string;
  /** Override `.dpdp/data-map.yaml`. Defaults to that path under the process cwd. */
  mapPath?: string;
}

const USAGE = "usage: dpdp scan page <url> [--no-map] [options]\n";

export async function execute(args: CliArgs, deps: CliDeps): Promise<number> {
  if (args.rulesVersion) {
    deps.stdout.write(readRulesVersion(deps.rulesDir) + "\n");
    return 0;
  }

  const failOn = parseFailOn(args.failOn);
  if (failOn === "invalid") {
    deps.stderr.write("error: --fail-on accepts only 'settled'\n");
    deps.exit(2);
    return 2;
  }

  if (!args.url) {
    deps.stderr.write(USAGE);
    deps.exit(2);
    return 2;
  }

  try {
    const scanOpts: ScanRunOptions = {
      rulesDir: deps.rulesDir,
      trackersDir: deps.trackersDir,
      gpc: args.gpc,
      includeQuery: args.includeQuery,
      screenshot: args.screenshot,
      timeout: args.timeout,
      settle: args.settle,
      interact: args.interact,
    };
    if (deps.engine) scanOpts.engine = deps.engine;
    if (args.browser) scanOpts.browserPath = args.browser;
    if (args.screenshot) {
      deps.mkdir(args.out);
      scanOpts.screenshotPath = join(args.out, "screenshot.png");
    }
    const { result: sr, emitted } = await scanPage(args.url, scanOpts);
    if (!args.noMap) writeDataMap(emitted, deps);

    const useColor = !args.ci;
    const terminal = renderTerminal(sr, { color: useColor });

    if (args.ci || args.json) {
      deps.mkdir(args.out);
      deps.writeFile(join(args.out, "findings.json"), renderJson(sr));
    }
    if (args.ci || args.md) {
      deps.mkdir(args.out);
      deps.writeFile(join(args.out, "findings.md"), renderMarkdown(sr));
    }

    if (args.ci) {
      deps.stdout.write(`${sr.summary.third_parties} third parties · ${sr.summary.fired_before_banner} fired before the banner\n`);
    } else {
      deps.stdout.write(terminal + "\n");
    }

    if (args.includeQuery && !args.ci) {
      deps.stderr.write("warning: --include-query keeps query strings in evidence; do not share this output.\n");
    }

    if (failOn === "settled" && hasSettledFindings(sr)) {
      const n = sr.findings.filter((f) => f.certainty === "settled").length;
      deps.stderr.write(`${n} settled finding(s); --fail-on settled\n`);
      return 1;
    }

    return 0;
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(3);
    return 3;
  }
}

function writeDataMap(emitted: EmittedScan, deps: CliDeps): void {
  const mapPath = deps.mapPath ?? join(process.cwd(), DATA_MAP_FILENAME);
  let previous: string | undefined;
  if (deps.readFile) {
    try {
      previous = deps.readFile(mapPath);
    } catch (e) {
      if (!String((e as Error).message).includes("ENOENT")) throw e;
    }
  }
  const base = previous ? parseDataMap(previous) : emptyDataMap(emitted.generated_by);
  const merged = mergeScan(base, emitted);
  deps.mkdir(dirname(mapPath));
  deps.writeFile(mapPath, serializeDataMap(merged, previous));
}

export interface MapDiffArgs {
  diffFrom: string;
  diffTo: string;
  out: string;
  json: boolean;
  ci: boolean;
}

/** Compare two ScanResult files. Same files and summary as the old --diff-from/--diff-to flags. */
export function executeMapDiff(args: MapDiffArgs, deps: CliDeps): number {
  if (!args.diffFrom || !args.diffTo) {
    deps.stderr.write("usage: dpdp map diff --diff-from <a.json> --diff-to <b.json>\n");
    deps.exit(2);
    return 2;
  }
  if (!deps.readFile) {
    deps.stderr.write("error: this environment cannot read files for --diff-from/--diff-to\n");
    deps.exit(2);
    return 2;
  }
  let fromJson: unknown;
  let toJson: unknown;
  try {
    fromJson = JSON.parse(deps.readFile(args.diffFrom));
    toJson = JSON.parse(deps.readFile(args.diffTo));
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(2);
    return 2;
  }
  const from = ScanResult.safeParse(fromJson);
  const to = ScanResult.safeParse(toJson);
  if (!from.success || !to.success) {
    deps.stderr.write("error: --diff-from/--diff-to must be ScanResult JSON\n");
    deps.exit(2);
    return 2;
  }
  const diff = diffScanResults(from.data, to.data);
  const json = JSON.stringify(diff, null, 2) + "\n";
  deps.mkdir(args.out);
  deps.writeFile(join(args.out, "diff.json"), json);
  if (args.json || args.ci) {
    deps.writeFile(join(args.out, "findings-diff.json"), json);
  }
  deps.stdout.write(renderDiffSummary(diff) + "\n");
  return 0;
}

function renderDiffSummary(diff: ReturnType<typeof diffScanResults>): string {
  const lines = [
    `SITE  hosts +${diff.site.hosts_added.length} −${diff.site.hosts_removed.length}  findings +${diff.site.findings_added.length} −${diff.site.findings_removed.length}`,
    `CATALOGUE  ${diff.catalogue_changed ? `${diff.from.rules_version} → ${diff.to.rules_version}` : "unchanged"}  findings +${diff.catalogue.findings_added.length} −${diff.catalogue.findings_removed.length}  reclassified ${diff.catalogue.findings_reclassified.length}`,
  ];
  return lines.join("\n");
}
