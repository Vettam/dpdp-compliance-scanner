import pc from "picocolors";
import type { Finding, Question, ScanResult } from "../types.js";
import {
  CERTAINTY_LEGEND,
  QUESTIONS_HEADING,
  QUESTIONS_NOTE,
  SAME_VENDOR_HEADING,
  SAME_VENDOR_NOTE,
  crossTierVendors,
  markdownHint,
} from "./labels.js";

export interface TerminalOptions {
  /** When false, strip all colour (used for --ci). Defaults to true. */
  color?: boolean;
}

const TOOL_NAME = "dpdp";

export function renderTerminal(sr: ScanResult, opts: TerminalOptions = {}): string {
  const useColor = opts.color ?? true;
  const c = useColor ? pc : noColor;
  const lines: string[] = [];

  const host = hostOf(sr.target.url);
  lines.push(
    `${c.bold(TOOL_NAME)}  ${host}     interpretation as of ${sr.interpretation_as_of}`,
  );
  lines.push("");
  lines.push("How sure the law is");
  for (const [tier, meaning] of CERTAINTY_LEGEND) {
    lines.push(`  ${tier.padEnd(10)} ${meaning}`);
  }
  lines.push("");

  const byTier = groupByTier(sr.findings);
  for (const tier of ["settled", "arguable", "open"] as const) {
    const fs = byTier[tier];
    if (fs.length === 0) continue;
    lines.push(
      `${c.bold(tier.toUpperCase())} (${fs.length})`.padEnd(48) +
        `enforceable ${earliestEnforceable(fs)}`,
    );
    for (const f of fs) {
      lines.push(renderFindingLine(f, c));
    }
    lines.push("");
  }

  const split = crossTierVendors(sr.findings);
  if (split.length > 0) {
    lines.push(c.bold(SAME_VENDOR_HEADING));
    lines.push(`  ${SAME_VENDOR_NOTE}`);
    for (const vendor of split) {
      lines.push(`  ${vendor.label}`);
      for (const rule of vendor.rules) {
        lines.push(`    ${rule.certainty.padEnd(10)} ${rule.rule_id}  ${rule.title}`);
      }
    }
    lines.push("");
  }

  if (sr.interaction.performed) {
    const acceptBit = sr.interaction.accept_clicked
      ? `accept-all ${sr.interaction.accept_findings}`
      : "accept click missed";
    const rejectBit = sr.interaction.reject_clicked
      ? `reject-all ${sr.interaction.reject_findings}`
      : "reject click missed";
    lines.push(`${c.bold("INTERACTION")}  ${acceptBit} · ${rejectBit}`);
    lines.push(
      `  survived reject ${sr.interaction.survived_reject.length} · cleared on reject ${sr.interaction.cleared_on_reject.length} · appeared on accept ${sr.interaction.appeared_on_accept.length}`,
    );
    for (const f of sr.interaction.survived_reject) {
      lines.push(`  survived reject  ${f.rule_id}  ${f.title}`);
    }
    for (const f of sr.interaction.cleared_on_reject) {
      lines.push(`  cleared on reject  ${f.rule_id}  ${f.title}`);
    }
    for (const f of sr.interaction.appeared_on_accept) {
      lines.push(`  appeared on accept  ${f.rule_id}  ${f.title}`);
    }
    lines.push("");
  }

  if (sr.questions.length > 0) {
    lines.push(`${c.bold(QUESTIONS_HEADING)} (${sr.questions.length})`);
    lines.push(`  ${QUESTIONS_NOTE}`);
    for (const q of sr.questions) {
      lines.push(renderQuestionLine(q, c));
    }
    lines.push("");
  }

  lines.push(
    `${sr.summary.third_parties} third parties · ${sr.summary.third_parties_outside_india} outside India · ${sr.summary.fired_before_banner} fired before the banner`,
  );
  lines.push(`Rationale for each rule: https://sentinel.vettam.ai/rules/<id>`);
  lines.push(`Notice content checks: run dpdp notice lint against your published notice.`);
  lines.push(markdownHint(sr.target.url));
  lines.push("");
  lines.push("Indicative, not legal advice. Not a compliance verdict.");

  return lines.join("\n");
}

function renderFindingLine(f: Finding, c: PicocolorsLike): string {
  const provisions = f.provisions.join(" ");
  const head = `  ${f.rule_id}  ${f.title}  [${f.detection_confidence}]`;
  if (!f.tracker) {
    const gap = Math.max(2, 60 - head.length);
    return `${head}${" ".repeat(gap)}${provisions}`;
  }
  return `${head}\n              ${f.tracker.vendor} (${f.tracker.id})  ${provisions}`;
}

function renderQuestionLine(q: Question, c: PicocolorsLike): string {
  const left = `  ${q.rule_id}  ${q.prompt}`;
  const provisions = q.provisions.join(" ");
  const gap = Math.max(2, 60 - left.length);
  return `${left}${" ".repeat(gap)}${provisions}`;
}

function shortTitle(f: Finding): string {
  return f.title;
}

function earliestEnforceable(fs: Finding[]): string {
  return fs.map((f) => f.enforceable_from).sort()[0] ?? "";
}

function groupByTier(fs: Finding[]) {
  return {
    settled: fs.filter((f) => f.certainty === "settled"),
    arguable: fs.filter((f) => f.certainty === "arguable"),
    open: fs.filter((f) => f.certainty === "open"),
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface PicocolorsLike {
  bold: (s: string) => string;
}
const noColor: PicocolorsLike = { bold: (s) => s };
