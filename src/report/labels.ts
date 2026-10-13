import type { Finding } from "../types.js";

/** Meanings printed on every report so the tiers are readable without the docs. */
export const CERTAINTY_LEGEND: ReadonlyArray<readonly [string, string]> = [
  ["settled", "The Act or Rules are clear. Applying them needs no interpretation."],
  ["arguable", "The provision applies, but applying it to this fact is contestable."],
  ["open", "No Board guidance and no case law. The text is silent; resolved later."],
];

export const QUESTIONS_HEADING = "QUESTIONS ON THE LAW";
export const QUESTIONS_NOTE =
  "Subjective or unobservable questions to keep for later. These are not findings.";

export const SAME_VENDOR_HEADING = "SAME VENDOR, DIFFERENT QUESTIONS";
export const SAME_VENDOR_NOTE =
  "Certainty follows the legal question, not the vendor. One vendor can be arguable under one rule and open under another.";

/** Copy-paste command so a terminal reader can write findings.md for this scan. */
export function markdownHint(url: string): string {
  const target = url.trim() === "" ? "<url>" : url.trim();
  return [
    "Save this report as a markdown file by running:",
    `  dpdp scan page ${shellArg(target)} --md`,
    "That creates ./dpdp-scan/findings.md in the folder where you run the command.",
  ].join("\n");
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9:/._~?#&=%@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

const TIER_ORDER = ["settled", "arguable", "open"] as const;

export interface CrossTierVendor {
  label: string;
  rules: Array<{ certainty: string; rule_id: string; title: string }>;
}

/** Vendors whose traffic engaged rules in more than one certainty tier. */
export function crossTierVendors(findings: Finding[]): CrossTierVendor[] {
  const byId = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.tracker) continue;
    const list = byId.get(f.tracker.id) ?? [];
    list.push(f);
    byId.set(f.tracker.id, list);
  }
  const out: CrossTierVendor[] = [];
  for (const fs of byId.values()) {
    const tiers = new Set(fs.map((f) => f.certainty));
    if (tiers.size < 2) continue;
    const tracker = fs[0]!.tracker!;
    const rules = [...fs].sort((a, b) => {
      const tier = TIER_ORDER.indexOf(a.certainty) - TIER_ORDER.indexOf(b.certainty);
      if (tier !== 0) return tier;
      return a.rule_id.localeCompare(b.rule_id);
    });
    out.push({
      label: `${tracker.vendor} (${tracker.id})`,
      rules: rules.map((f) => ({
        certainty: f.certainty,
        rule_id: f.rule_id,
        title: f.title,
      })),
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
