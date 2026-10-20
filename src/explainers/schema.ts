import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CERTAINTY_TIERS } from "../taxonomy.js";

const RULE_ID = z.string().regex(/^DPDP-C-\d{3}$/);

const ChangelogEntry = z.object({
  version: z.string().min(1),
  date: z.string().min(1),
  note: z.string().min(1),
});

/**
 * One document per rule, consumed by the Sentinel site. Rendered pages are
 * not produced here. Published at schema/explainer.schema.json.
 */
export const ExplainerSchema = z
  .object({
    id: RULE_ID,
    title: z.string().min(1),
    tier: z.enum(CERTAINTY_TIERS),
    provisions: z.array(z.string().min(1)).min(1),
    rationale_plain: z.string().min(1),
    rationale_dev: z.string().min(1),
    enforceable_from: z.string().min(1),
    observable: z.boolean(),
    needs_input: z.array(z.string()),
    since: z.string().min(1),
    changelog: z.array(ChangelogEntry).min(1),
    /** Other rule ids that share a provision or a category. */
    related: z.array(RULE_ID),
    /** Prompt text when this rule raises a question; otherwise empty. */
    questions: z.array(z.string().min(1)),
  })
  .strict();

export type Explainer = z.infer<typeof ExplainerSchema>;

export function explainerJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(ExplainerSchema) as Record<string, unknown>;
}
