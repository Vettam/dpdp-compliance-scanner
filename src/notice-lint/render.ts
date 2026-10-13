import pc from "picocolors";
import type { NoticeLintResult } from "./index.js";

export function renderNoticeLintTerminal(r: NoticeLintResult, color = true): string {
  const c = color ? pc : noColor;
  const lines: string[] = [];
  lines.push(`${c.bold("dpdp notice lint")}  ${r.notice_url || "(notice text)"}`);
  lines.push("");
  const failed = r.checks.filter((x) => x.status === "fail");
  const passed = r.checks.filter((x) => x.status === "pass");
  if (failed.length) {
    lines.push(`${c.bold("FAIL")} (${failed.length})`);
    for (const f of failed) lines.push(`  ${f.id}  ${f.detail}`);
    lines.push("");
  }
  lines.push(`${passed.length} passed · ${failed.length} failed`);
  lines.push("Indicative, not legal advice. Not a compliance verdict.");
  return lines.join("\n");
}

export function renderNoticeLintJson(r: NoticeLintResult): string {
  return JSON.stringify(r, null, 2) + "\n";
}

const noColor = { bold: (s: string) => s };
