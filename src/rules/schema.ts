import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  CERTAINTY_TIERS,
  OVERLAY_FLAGS,
  RULE_OWNERS,
  TRACKER_CATEGORIES,
} from "../taxonomy.js";
import { TrackerRole } from "../vendors/schema.js";

/**
 * Rule catalogue schema (spec §5.1). One YAML file per rule in rules/.
 * Rules are validated against this at build time AND at load time. A rule that
 * fails validation fails the build. Missing provisions, rationale_plain, or
 * explainer_url are validation errors.
 */

const ObservationMatch = z.enum([
  "request",
  "banner",
  "cookie",
  "storage",
  "api_call",
  "embed",
  "meta",
  "data_point",
  "recipient",
  "consent_gate",
  "map",
]);

/** Which scan sources a rule reads (spec §6.1). Page rules stay on the page path. */
export const RULE_SOURCES = ["page", "code", "database"] as const;

/**
 * Detection conditions. Each key is an optional predicate the mapper evaluates
 * against an observation (and its resolved tracker / the scan banner / meta).
 * The set is deliberately closed: an unknown key is a schema error, which keeps
 * the rule DSL auditable.
 */
export const WhereCondition = z
  .object({
    tracker_category: z.enum(TRACKER_CATEGORIES).optional(),
    tracker_categories: z.array(z.enum(TRACKER_CATEGORIES)).optional(),
    tracker_flags: z.array(z.enum(OVERLAY_FLAGS)).optional(),
    before_banner_detected: z.boolean().optional(),
    before_first_paint: z.boolean().optional(),
    banner_detected: z.boolean().optional(),
    has_accept: z.boolean().optional(),
    has_reject: z.boolean().optional(),
    has_settings: z.boolean().optional(),
    has_pre_ticked: z.boolean().optional(),
    has_language_switcher: z.boolean().optional(),
    mentions_legitimate_interest: z.boolean().optional(),
    implies_consent_by_browsing: z.boolean().optional(),
    page_language: z.string().optional(),
    gpc_sent: z.boolean().optional(),
    is_third_party: z.boolean().optional(),
    destination_country: z.string().optional(),
    destination_country_not: z.string().optional(),
    cookie_name: z.string().optional(),
    cookie_insecure: z.boolean().optional(),
    first_party: z.boolean().optional(),
    api: z.string().optional(),
    embed_kind: z.enum(["iframe", "script", "img", "font"]).optional(),
    sri: z.boolean().optional(),
    /** Asserted lawful basis on a data point (spec §4.6). */
    basis: z
      .enum([
        "consent",
        "voluntarily_provided",
        "legal_obligation",
        "medical_emergency",
        "employment",
        "state_function",
        "unstated",
      ])
      .optional(),
    /** Data-point categories this rule reads. */
    category_in: z.array(z.enum(TRACKER_CATEGORIES)).optional(),
    /** Scan source of the point, recipient, or map being tested. */
    source_kind: z.enum(RULE_SOURCES).optional(),
    /** This data point's category, or, on a whole-map rule, some point has it. */
    category: z.enum(TRACKER_CATEGORIES).optional(),
    /** No data point in the map has this category. */
    category_absent: z.enum(TRACKER_CATEGORIES).optional(),
    /** The point carries at least one of these flags. */
    flags_any: z.array(z.enum(OVERLAY_FLAGS)).optional(),
    basis_not: z
      .enum([
        "consent",
        "voluntarily_provided",
        "legal_obligation",
        "medical_emergency",
        "employment",
        "state_function",
        "unstated",
      ])
      .optional(),
    consent_gate_present: z.boolean().optional(),
    consent_gate_kind: z.enum(["banner", "checkbox", "dialog", "code_check"]).optional(),
    /** True when retention.stated is non-empty. */
    retention_stated: z.boolean().optional(),
    /** True when the point has at least one retention signal. */
    retention_signal_any: z.boolean().optional(),
    recipient_role: TrackerRole.optional(),
    /** A named country other than this one. An unknown country does not match. */
    recipient_country_not: z.string().optional(),
    rights_endpoint_present: z
      .object({
        right: z.enum(["access", "erase", "correct"]),
        present: z.boolean(),
      })
      .strict()
      .optional(),
    observation_kind: z
      .enum([
        "cookie",
        "storage_key",
        "request",
        "api_call",
        "embed",
        "banner",
        "package",
        "http_call",
        "schema_column",
        "input_field",
        "consent_gate",
        "retention_signal",
        "rights_endpoint",
      ])
      .optional(),
    /** The vendor record's notice_itemisation is non-empty. */
    notice_itemisation: z.boolean().optional(),
    /** A consent gate's text mentions a grievance contact. */
    mentions_grievance: z.boolean().optional(),
  })
  .strict();

export const Detection = z.object({
  match: ObservationMatch,
  where: WhereCondition,
});

const ChangelogEntry = z.object({
  version: z.string(),
  date: z.string(),
  note: z.string(),
});

export const RuleSchema = z.object({
  id: z.string().regex(/^DPDP-C-\d{3}$/),
  title: z.string().min(1),
  certainty: z.enum(CERTAINTY_TIERS),
  enforceable_from: z.string(),
  observable: z.boolean(),
  provisions: z.array(z.string().min(1)).min(1),
  flags: z.array(z.enum(OVERLAY_FLAGS)).default([]),
  categories: z.array(z.enum(TRACKER_CATEGORIES)).default([]),
  owner: z.enum(RULE_OWNERS),
  /** Existing page rules declare [page]. Map rules declare the sources they read. */
  sources: z.array(z.enum(RULE_SOURCES)).default(["page"]),
  penalty_band: z.string(),
  detection: Detection,
  needs_input: z.array(z.string()).default([]),
  prompt: z.string().optional(),
  /** When set, findings from this rule use this instead of inheriting banner confidence. */
  detection_confidence: z.enum(["high", "medium", "low"]).optional(),
  rationale_plain: z.string().min(1),
  rationale_dev: z.string().min(1),
  remediation_summary: z.string().default(""),
  explainer_url: z.string().url(),
  since: z.string(),
  changelog: z.array(ChangelogEntry),
});

export type Rule = z.infer<typeof RuleSchema>;
export type WhereCondition = z.infer<typeof WhereCondition>;
export type Detection = z.infer<typeof Detection>;

export type ValidateOk = { ok: true; value: Rule };
export type ValidateErr = { ok: false; error: z.ZodError };
export type ValidateResult = ValidateOk | ValidateErr;

export function validateRule(input: unknown): ValidateResult {
  const parsed = RuleSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error };
}

/** JSON Schema (draft-07) generated from the Zod schema. Published at rules/schema.json. */
export function ruleJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(RuleSchema) as Record<string, unknown>;
}
