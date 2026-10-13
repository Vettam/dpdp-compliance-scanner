import type { Rule } from "../rules/schema.js";
import { loadRules } from "../rules/loader.js";

export interface ExplainDeps {
  stdout: { write: (s: string) => void };
  stderr: { write: (s: string) => void };
  exit: (code: number) => void;
  rulesDir: string;
}

const USAGE = "usage: dpdp explain <rule-id>\n";

/** Terse terminal rendering of one rule. The last line is its explainer URL. */
export function renderExplain(rule: Rule): string {
  const rationale = rule.rationale_plain.replace(/\s+/g, " ").trim();
  return [
    `${rule.id}  ${rule.title}`,
    `${rule.certainty}  enforceable ${rule.enforceable_from}`,
    rule.provisions.join(" "),
    "",
    rationale,
    "",
    rule.explainer_url,
  ].join("\n");
}

export async function executeExplain(ruleId: string, deps: ExplainDeps): Promise<number> {
  if (!ruleId) {
    deps.stderr.write(USAGE);
    deps.exit(2);
    return 2;
  }
  const rules = await loadRules(deps.rulesDir);
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    deps.stderr.write(`error: unknown rule ${ruleId}\n`);
    deps.exit(2);
    return 2;
  }
  deps.stdout.write(renderExplain(rule) + "\n");
  return 0;
}
