import { defineCommand, runMain } from "citty";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_MAP_FILENAME, loadDataMap as loadDataMapFile } from "../map/io.js";
import { executeDataMapDiff, executeMapInit, executeMapQuestions, executeMapShow } from "./map.js";
import { fileURLToPath } from "node:url";
import { execute, executeMapDiff, type CliArgs } from "./execute.js";
import { executeCode, type CodeArgs } from "./code.js";
import { executeExplain } from "./explain.js";
import { executeVersion } from "./version.js";
import { executeNoticeChanges, executeNoticeInputs } from "./notice.js";
import { executeNoticeLint, type NoticeLintArgs } from "../notice-lint/execute.js";
import { loadNoticeText } from "../notice-lint/fetch.js";
import { bundledVendorsDir, loadTrackers } from "../trackers/loader.js";
import type { ScanResult } from "../types.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rulesDir = join(rootDir, "rules");
const trackersDir = bundledVendorsDir(import.meta.url);
const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
  name: string;
  version: string;
};

function io() {
  return {
    stdout: { write: (s: string) => process.stdout.write(s) },
    stderr: { write: (s: string) => process.stderr.write(s) },
    exit: (c: number) => process.exit(c),
    writeFile: (path: string, data: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data);
    },
    readFile: (path: string) => readFileSync(path, "utf8"),
    mkdir: (p: string) => mkdirSync(p, { recursive: true }),
    exists: (p: string) => existsSync(p),
  };
}

const page = defineCommand({
  meta: {
    name: "page",
    description: "Scan a page and map each observation to the DPDP provisions it engages.",
  },
  args: {
    url: { type: "positional", required: false, description: "URL to scan" },
    json: { type: "boolean", description: "write findings.json (default in --ci)" },
    md: { type: "boolean", description: "write findings.md into --out (default ./dpdp-scan)" },
    out: { type: "string", default: "./dpdp-scan", description: "output directory" },
    ci: { type: "boolean", description: "machine mode: no colour, JSON always, exit 0" },
    gpc: { type: "boolean", description: "send Sec-GPC: 1 and evaluate DPDP-C-050" },
    includeQuery: { type: "boolean", description: "keep query strings in request evidence" },
    screenshot: { type: "boolean", description: "save a viewport screenshot" },
    timeout: { type: "string", default: "15000", description: "navigation timeout (ms)" },
    settle: { type: "string", default: "3000", description: "post-load settle wait (ms)" },
    rulesVersion: { type: "boolean", description: "print catalogue version and exit" },
    browser: { type: "string", default: "", description: "Chrome/Edge/Chromium binary path" },
    interact: {
      type: "boolean",
      description: "three-pass banner interaction (load, accept-all, reject-all)",
    },
    failOn: {
      type: "string",
      description: "opt-in CI gate; only 'settled' is accepted",
    },
    noMap: { type: "boolean", description: "do not write .dpdp/data-map.yaml" },
  },
  run: async ({ args }) => {
    const cliArgs: CliArgs = {
      url: (args.url as string | undefined) ?? "",
      json: Boolean(args.json),
      md: Boolean(args.md),
      out: args.out,
      ci: Boolean(args.ci),
      gpc: Boolean(args.gpc),
      includeQuery: Boolean(args.includeQuery),
      screenshot: Boolean(args.screenshot),
      timeout: Number(args.timeout),
      settle: Number(args.settle),
      rulesVersion: Boolean(args.rulesVersion),
      browser: args.browser,
      interact: Boolean(args.interact),
      // citty stores --fail-on as "fail-on". A default of "" on failOn hides that value.
      failOn: args.failOn || "",
      noMap: Boolean(args.noMap),
    };
    const code = await execute(cliArgs, { ...io(), rulesDir, trackersDir });
    process.exit(code);
  },
});

const code = defineCommand({
  meta: {
    name: "code",
    description: "Scan repository manifests and record vendor packages in the data map.",
  },
  args: {
    path: { type: "positional", required: false, description: "repository path (default .)" },
    json: { type: "boolean", description: "write findings.json" },
    md: { type: "boolean", description: "write findings.md into --out (default ./dpdp-scan)" },
    out: { type: "string", default: "./dpdp-scan", description: "output directory" },
    ci: { type: "boolean", description: "machine mode: JSON and Markdown always" },
    failOn: { type: "string", description: "opt-in gate: 'settled', or 'unmapped' when the scan is not in the committed map" },
    noMap: { type: "boolean", description: "do not write .dpdp/data-map.yaml" },
  },
  run: async ({ args }) => {
    const cliArgs: CodeArgs = {
      path: (args.path as string | undefined) || ".",
      json: Boolean(args.json),
      md: Boolean(args.md),
      out: args.out,
      ci: Boolean(args.ci),
      failOn: args.failOn || "",
      noMap: Boolean(args.noMap),
    };
    const exitCode = await executeCode(cliArgs, { ...io(), rulesDir, trackersDir });
    process.exit(exitCode);
  },
});

const scan = defineCommand({
  meta: { name: "scan", description: "Scan a source." },
  subCommands: { page, code },
});

const noticeInputs = defineCommand({
  meta: {
    name: "inputs",
    description: "Print notice itemisation inputs from the data map.",
  },
  args: {
    map: { type: "string", description: "data map file (default .dpdp/data-map.yaml)" },
    json: { type: "boolean", description: "print the inputs as JSON" },
  },
  run: async ({ args }) => {
    const map = args.map || undefined;
    process.exit(await executeNoticeInputs(map ? { json: Boolean(args.json), map } : { json: Boolean(args.json) }, mapDeps()));
  },
});

const noticeChanges = defineCommand({
  meta: {
    name: "changes",
    description: "Classify a data-map diff for a change notice.",
  },
  args: {
    from: { type: "string", description: "earlier data map file or git ref" },
    to: { type: "string", description: "later data map file or git ref" },
    json: { type: "boolean", description: "print the classification as JSON" },
  },
  run: async ({ args }) => {
    process.exit(
      await executeNoticeChanges({ from: args.from || "", to: args.to || "", json: Boolean(args.json) }, mapDeps()),
    );
  },
});

const noticeLint = defineCommand({
  meta: {
    name: "lint",
    description: "Check a published notice against the data map and DPDP Rule 3.",
  },
  args: {
    notice: { type: "positional", required: false, description: "notice URL or local file path" },
    scan: { type: "string", description: "legacy: findings.json from a page scan, for one release" },
    json: { type: "boolean", description: "write notice-lint.json" },
    out: { type: "string", default: "./notice-lint-out", description: "output directory" },
    ci: { type: "boolean", description: "machine mode: no colour, JSON always" },
  },
  run: async ({ args }) => {
    const trackers = await loadTrackers(trackersDir);
    const cliArgs: NoticeLintArgs = {
      notice: (args.notice as string | undefined) ?? "",
      scan: args.scan,
      json: Boolean(args.json),
      out: args.out,
      ci: Boolean(args.ci),
    };
    const code = await executeNoticeLint(cliArgs, {
      ...io(),
      loadNotice: (src) => loadNoticeText(src),
      loadScanResult: async (p) => {
        if (!existsSync(p)) return undefined;
        return JSON.parse(readFileSync(p, "utf8")) as ScanResult;
      },
      loadDataMap: async () => {
        const path = join(process.cwd(), DATA_MAP_FILENAME);
        if (!existsSync(path)) return undefined;
        return loadDataMapFile(path);
      },
      trackers,
    });
    process.exit(code);
  },
});

const notice = defineCommand({
  meta: { name: "notice", description: "Notice inputs, change classification, and lint." },
  subCommands: { inputs: noticeInputs, changes: noticeChanges, lint: noticeLint },
});

function mapDeps() {
  return {
    ...io(),
    rulesDir,
    trackersDir,
    mapPath: join(process.cwd(), DATA_MAP_FILENAME),
    packageName: pkg.name,
    packageVersion: pkg.version,
  };
}

const mapInit = defineCommand({
  meta: { name: "init", description: "Create .dpdp/data-map.yaml if it does not exist." },
  run: () => {
    process.exit(executeMapInit(mapDeps()));
  },
});

const mapShow = defineCommand({
  meta: { name: "show", description: "Render the data map with findings and questions." },
  args: {
    json: { type: "boolean", description: "print the map and findings as JSON" },
  },
  run: async ({ args }) => {
    process.exit(await executeMapShow({ json: Boolean(args.json) }, mapDeps()));
  },
});

const mapQuestions = defineCommand({
  meta: { name: "questions", description: "Print open data-map questions." },
  args: {
    json: { type: "boolean", description: "print questions as JSON" },
  },
  run: ({ args }) => {
    process.exit(executeMapQuestions({ json: Boolean(args.json) }, mapDeps()));
  },
});

const mapDiff = defineCommand({
  meta: {
    name: "diff",
    description: "Compare two data maps (--from/--to) or two ScanResult files (--diff-from/--diff-to).",
  },
  args: {
    from: { type: "string", description: "data map file or git ref to diff from" },
    to: { type: "string", description: "data map file or git ref to diff to" },
    diffFrom: { type: "string", description: "ScanResult JSON to diff from" },
    diffTo: { type: "string", description: "ScanResult JSON to diff to" },
    json: { type: "boolean", description: "also write findings-diff.json for a ScanResult diff" },
    md: { type: "boolean", description: "write datamap-diff.md for a data map diff" },
    ci: { type: "boolean", description: "machine mode" },
    out: { type: "string", default: "./dpdp-scan", description: "output directory" },
    failOn: { type: "string", description: "opt-in gate: 'unmapped' fails on site additions; catalogue drift never fails" },
  },
  run: async ({ args }) => {
    const from = args.from || "";
    const to = args.to || "";
    if (from || to) {
      const code = await executeDataMapDiff(
        {
          from,
          to,
          out: args.out,
          json: Boolean(args.json),
          md: Boolean(args.md),
          ci: Boolean(args.ci),
          failOn: args.failOn || "",
        },
        mapDeps(),
      );
      process.exit(code);
    }
    const code = executeMapDiff(
      {
        diffFrom: args.diffFrom || "",
        diffTo: args.diffTo || "",
        json: Boolean(args.json),
        ci: Boolean(args.ci),
        out: args.out,
      },
      { ...io(), rulesDir, trackersDir },
    );
    process.exit(code);
  },
});

const map = defineCommand({
  meta: { name: "map", description: "Read and diff the committed data map." },
  subCommands: { init: mapInit, show: mapShow, questions: mapQuestions, diff: mapDiff },
});

const explain = defineCommand({
  meta: {
    name: "explain",
    description: "Print one rule and its explainer URL.",
  },
  args: {
    ruleId: { type: "positional", required: false, description: "rule id, e.g. DPDP-C-001" },
  },
  run: async ({ args }) => {
    const code = await executeExplain((args.ruleId as string | undefined) ?? "", {
      ...io(),
      rulesDir,
    });
    process.exit(code);
  },
});

const version = defineCommand({
  meta: { name: "version", description: "Print package, rules, and vendors versions." },
  run: () => {
    const code = executeVersion({
      stdout: io().stdout,
      name: pkg.name,
      version: pkg.version,
      rulesDir,
      trackersDir,
    });
    process.exit(code);
  },
});

const command = defineCommand({
  meta: {
    name: "dpdp",
    version: pkg.version,
    description:
      "Map observations to the DPDP Act 2023 and Rules 2025, reporting how settled the law is.",
  },
  subCommands: { scan, notice, map, explain, version },
});

runMain(command);
