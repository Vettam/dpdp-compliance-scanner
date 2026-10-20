import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRules } from "../rules/loader.js";
import type { Rule } from "../rules/schema.js";
import { ExplainerSchema, type Explainer } from "./schema.js";

/** Gitignored build output. Excluded from the npm package. */
export const EXPLAINER_OUT_DIR = "dist/explainers";

function sharesProvisionOrCategory(a: Rule, b: Rule): boolean {
  for (const provision of a.provisions) {
    if (b.provisions.includes(provision)) return true;
  }
  for (const category of a.categories) {
    if (b.categories.includes(category)) return true;
  }
  return false;
}

/** Rule ids, sorted, that share a provision or a category with `rule`. */
export function relatedRuleIds(rule: Rule, rules: readonly Rule[]): string[] {
  const ids: string[] = [];
  for (const other of rules) {
    if (other.id === rule.id) continue;
    if (sharesProvisionOrCategory(rule, other)) ids.push(other.id);
  }
  ids.sort();
  return ids;
}

/**
 * A rule raises a question when a scan cannot observe it, or when it needs a
 * fact the developer has to supply. The text is the rule's prompt.
 */
export function questionTexts(rule: Rule): string[] {
  if (rule.observable && rule.needs_input.length === 0) return [];
  const prompt = rule.prompt?.replace(/\s+/g, " ").trim();
  return [prompt && prompt.length > 0 ? prompt : rule.title.trim()];
}

export function toExplainer(rule: Rule, rules: readonly Rule[]): Explainer {
  return ExplainerSchema.parse({
    id: rule.id,
    title: rule.title.trim(),
    tier: rule.certainty,
    provisions: rule.provisions,
    rationale_plain: rule.rationale_plain.trim(),
    rationale_dev: rule.rationale_dev.trim(),
    enforceable_from: rule.enforceable_from,
    observable: rule.observable,
    needs_input: [...rule.needs_input],
    since: rule.since,
    changelog: rule.changelog.map((entry) => ({
      version: entry.version,
      date: entry.date,
      note: entry.note,
    })),
    related: relatedRuleIds(rule, rules),
    questions: questionTexts(rule),
  });
}

/** Load `rulesDir`, replace `outDir` with one JSON file per rule. */
export async function writeExplainers(options: {
  rulesDir: string;
  outDir: string;
}): Promise<string[]> {
  const rules = await loadRules(options.rulesDir);
  const explainers = rules.map((rule) => toExplainer(rule, rules));
  rmSync(options.outDir, { recursive: true, force: true });
  mkdirSync(options.outDir, { recursive: true });
  const written: string[] = [];
  for (const explainer of explainers) {
    const path = join(options.outDir, `${explainer.id}.json`);
    writeFileSync(path, JSON.stringify(explainer, null, 2) + "\n");
    written.push(path);
  }
  written.sort();
  return written;
}
