import type { ScanResult } from "../types.js";
import type { DataMapDiff } from "../map/schema.js";

export type FailOn = "" | "settled" | "unmapped" | "invalid";

/**
 * Opt-in CI gates. `settled` is the only legal gate.
 * `unmapped` (scan code and map diff) is the bookkeeping gate: the scanner
 * observed something the committed map does not account for.
 * Catalogue drift never trips a gate.
 */
export function parseFailOn(value: string, allowUnmapped = false): FailOn {
  const v = value.trim().toLowerCase();
  if (v === "" || v === "none") return "";
  if (v === "settled") return "settled";
  if (v === "unmapped") return allowUnmapped ? "unmapped" : "invalid";
  return "invalid";
}

export function hasSettledFindings(sr: ScanResult): boolean {
  return sr.findings.some((f) => f.certainty === "settled");
}

/** Additions the committed map does not account for. Removals are not unmapped. */
export function unmappedNames(diff: DataMapDiff): string[] {
  return [
    ...diff.site.data_points_added.map((d) => d.id),
    ...diff.site.recipients_added.map((r) => r.vendor),
    ...diff.site.consent_gates_added.map((g) => g.id),
    ...diff.site.retention_signals_added.map((s) => `${s.kind} on ${s.data_point}`),
  ];
}
