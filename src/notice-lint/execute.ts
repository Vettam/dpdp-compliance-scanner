import { join } from "node:path";
import { lintNotice, type LintNoticeInput } from "./index.js";
import { renderNoticeLintTerminal, renderNoticeLintJson } from "./render.js";
import type { ScanResult } from "../types.js";
import type { Tracker } from "../trackers/schema.js";

export interface NoticeLintArgs {
  notice: string;
  scan?: string;
  json: boolean;
  out: string;
  ci: boolean;
}

export interface NoticeLintDeps {
  stdout: { write: (s: string) => void };
  stderr: { write: (s: string) => void };
  exit: (code: number) => void;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
  loadNotice: (source: string) => Promise<string>;
  loadScanResult?: (path: string) => Promise<ScanResult | undefined>;
  trackers: Tracker[];
}

export async function executeNoticeLint(args: NoticeLintArgs, deps: NoticeLintDeps): Promise<number> {
  if (!args.notice) {
    deps.stderr.write("usage: dpdp notice lint <notice-url-or-file> [--scan findings.json] [--json] [--ci]\n");
    deps.exit(2);
    return 2;
  }

  try {
    const noticeText = await deps.loadNotice(args.notice);
    const scanResult = args.scan && deps.loadScanResult ? await deps.loadScanResult(args.scan) : undefined;
    const input: LintNoticeInput = { noticeText, noticeUrl: args.notice, trackers: deps.trackers };
    if (scanResult) input.scanResult = scanResult;
    const result = lintNotice(input);

    if (args.ci || args.json) {
      deps.mkdir(args.out);
      deps.writeFile(join(args.out, "notice-lint.json"), renderNoticeLintJson(result));
    }

    deps.stdout.write(renderNoticeLintTerminal(result, !args.ci) + "\n");
    return 0;
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(3);
    return 3;
  }
}
