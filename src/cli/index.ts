import { defineCommand, runMain } from "citty";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execute, executeMapDiff, type CliArgs } from "./execute.js";
import { executeExplain } from "./explain.js";
import { executeVersion } from "./version.js";
import { executeNoticeLint, type NoticeLintArgs } from "../notice-lint/execute.js";
import { loadNoticeText } from "../notice-lint/fetch.js";
import { loadTrackers } from "../trackers/loader.js";
import type { ScanResult } from "../types.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rulesDir = join(rootDir, "rules");
const trackersDir = join(rootDir, "trackers");
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
    };
    const code = await execute(cliArgs, { ...io(), rulesDir, trackersDir });
    process.exit(code);
  },
});

const scan = defineCommand({
  meta: { name: "scan", description: "Scan a source." },
  subCommands: { page },
});

const noticeLint = defineCommand({
  meta: {
    name: "lint",
    description: "Check a published notice against DPDP Rule 3.",
  },
  args: {
    notice: { type: "positional", required: false, description: "notice URL or local file path" },
    scan: { type: "string", description: "path to a findings.json, to drive itemisation checks" },
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
      trackers,
    });
    process.exit(code);
  },
});

const notice = defineCommand({
  meta: { name: "notice", description: "Notice checks." },
  subCommands: { lint: noticeLint },
});

const mapDiff = defineCommand({
  meta: {
    name: "diff",
    description: "Compare two ScanResult files (no crawl).",
  },
  args: {
    diffFrom: { type: "string", description: "ScanResult JSON to diff from" },
    diffTo: { type: "string", description: "ScanResult JSON to diff to" },
    json: { type: "boolean", description: "also write findings-diff.json" },
    ci: { type: "boolean", description: "machine mode; also write findings-diff.json" },
    out: { type: "string", default: "./dpdp-scan", description: "output directory" },
  },
  run: ({ args }) => {
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
  meta: { name: "map", description: "Compare scan results." },
  subCommands: { diff: mapDiff },
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
