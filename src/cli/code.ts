import { dirname, join } from "node:path";
import { scanCode } from "../scanners/code/index.js";
import {
  DATA_MAP_FILENAME,
  diffDataMaps,
  emptyDataMap,
  mergeScan,
  parseDataMap,
  serializeDataMap,
} from "../map/index.js";
import { parseFailOn, unmappedNames } from "./fail-on.js";
import type { CliDeps } from "./execute.js";
import type { Finding, Question } from "../types.js";
import type { DataMap } from "../map/schema.js";
import type { MapQuestion } from "../map/schema.js";
import type { EmittedScan } from "../map/page.js";

export interface CodeArgs {
  path: string;
  json: boolean;
  md: boolean;
  out: string;
  ci: boolean;
  failOn: string;
  noMap: boolean;
}

const USAGE = "usage: dpdp scan code [path] [--no-map] [--fail-on settled|unmapped]\n";

export async function executeCode(args: CodeArgs, deps: CliDeps): Promise<number> {
  const failOn = parseFailOn(args.failOn, true);
  if (failOn === "invalid") {
    deps.stderr.write("error: --fail-on accepts 'settled' or 'unmapped'\n");
    deps.exit(2);
    return 2;
  }
  if (!args.path) {
    deps.stderr.write(USAGE);
    deps.exit(2);
    return 2;
  }

  try {
    const committed = loadCommitted(deps);
    const { emitted, findings, questions } = await scanCode(args.path, {
      rulesDir: deps.rulesDir,
      vendorsDir: deps.trackersDir,
      sourcePath: args.path,
      ...(committed.base ? { base: committed.base } : {}),
    });
    const merged = mergeIntoCommitted(emitted, committed);
    if (!args.noMap) {
      deps.mkdir(dirname(merged.mapPath));
      deps.writeFile(merged.mapPath, serializeDataMap(merged.merged, merged.previous));
    }

    const summary = summaryLine(emitted, findings);
    if (args.ci || args.json) {
      deps.mkdir(args.out);
      deps.writeFile(join(args.out, "findings.json"), renderFindingsJson(findings, emitted.questions, questions));
    }
    if (args.ci || args.md) {
      deps.mkdir(args.out);
      deps.writeFile(join(args.out, "findings.md"), renderFindingsMarkdown(emitted, findings, questions));
    }
    deps.stdout.write(summary + "\n");

    if (failOn === "settled" && findings.some((f) => f.certainty === "settled")) {
      const n = findings.filter((f) => f.certainty === "settled").length;
      deps.stderr.write(`${n} settled finding(s); --fail-on settled\n`);
      return 1;
    }
    if (failOn === "unmapped") {
      const names = [...new Set(unmappedNames(diffDataMaps(merged.base, merged.merged)))];
      if (names.length > 0) {
        deps.stderr.write(`${names.length} unmapped (${names.join(", ")}); --fail-on unmapped\n`);
        return 1;
      }
    }
    return 0;
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(3);
    return 3;
  }
}

function loadCommitted(deps: CliDeps): { mapPath: string; previous?: string; base?: DataMap } {
  const mapPath = deps.mapPath ?? join(process.cwd(), DATA_MAP_FILENAME);
  if (!deps.readFile) return { mapPath };
  try {
    const previous = deps.readFile(mapPath);
    return { mapPath, previous, base: parseDataMap(previous) };
  } catch (e) {
    if (String((e as Error).message).includes("ENOENT")) return { mapPath };
    throw e;
  }
}

function mergeIntoCommitted(
  emitted: EmittedScan,
  committed: { mapPath: string; previous?: string; base?: DataMap },
): { mapPath: string; previous?: string; base: DataMap; merged: DataMap } {
  const base = committed.base ?? emptyDataMap(emitted.generated_by);
  return {
    mapPath: committed.mapPath,
    ...(committed.previous !== undefined ? { previous: committed.previous } : {}),
    base,
    merged: mergeScan(base, emitted),
  };
}

function summaryLine(emitted: Parameters<typeof mergeScan>[1], findings: Finding[]): string {
  const recipients = new Set<string>();
  for (const dp of emitted.data_points) for (const r of dp.recipients) recipients.add(r.vendor);
  const questions = emitted.questions.length;
  const qLabel = questions === 1 ? "open question" : "open questions";
  return `${recipients.size} recipients · ${questions} ${qLabel} · ${findings.length} findings`;
}

function renderFindingsJson(findings: Finding[], questions: MapQuestion[], catalogue: Question[]): string {
  return JSON.stringify({ findings, questions, catalogue_questions: catalogue }, null, 2) + "\n";
}

function renderFindingsMarkdown(
  emitted: Parameters<typeof mergeScan>[1],
  findings: Finding[],
  catalogue: Question[],
): string {
  const lines = ["# Code scan", "", "## Recipients"];
  const recipients = emitted.data_points.flatMap((dp) => dp.recipients);
  if (recipients.length === 0) lines.push("None.");
  for (const r of recipients) {
    const where = r.observed.map((o) => o.location).join(", ");
    lines.push(`- ${r.vendor} (${r.role}) — ${where}`);
  }
  lines.push("", "## Questions");
  if (emitted.questions.length === 0) lines.push("None.");
  for (const q of emitted.questions) lines.push(`- ${q.ask}`);
  lines.push("", "## Catalogue questions");
  if (catalogue.length === 0) lines.push("None.");
  for (const q of catalogue) lines.push(`- ${q.rule_id} ${q.prompt}`);
  lines.push("", "## Findings");
  if (findings.length === 0) lines.push("None.");
  for (const tier of ["settled", "arguable", "open"] as const) {
    const group = findings.filter((f) => f.certainty === tier);
    if (group.length === 0) continue;
    lines.push("", `### ${tier} (${group.length})`);
    for (const f of group) lines.push(`- ${f.rule_id} ${f.attributed_to} — ${f.title}`);
  }
  lines.push("");
  return lines.join("\n");
}
