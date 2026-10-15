import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Rule } from "../rules/schema.js";
import type { Finding, Question } from "../types.js";
import type { Tracker } from "../vendors/schema.js";
import { diffDataMaps } from "../map/diff.js";
import { openQuestions } from "../map/show.js";
import type { DataMap, DataPoint } from "../map/schema.js";

/**
 * Itemisation inputs for the dpdp-notice skill (spec §8).
 * The skill drafts. This module only joins the map to vendor notice_itemisation
 * and classifies a diff. It does not write notice text.
 */

const NOTICE_SCHEMA_VERSION = "1.0.0";

const NoticeRecipient = z.object({
  vendor: z.string(),
  vendor_name: z.string(),
  role: z.string(),
  notice_itemisation: z.string(),
});

const NoticeLine = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  how_long: z.string(),
  locations: z.array(z.string()),
  recipients: z.array(NoticeRecipient),
});
export type NoticeLine = z.infer<typeof NoticeLine>;

const NoticeQuestion = z.object({
  id: z.string(),
  data_point: z.string().optional(),
  rule_id: z.string().nullable(),
  ask: z.string(),
});

const CatalogueQuestion = z.object({
  rule_id: z.string(),
  prompt: z.string(),
  needs_input: z.array(z.string()),
});

const BasisFinding = z.object({
  rule_id: z.string(),
  title: z.string(),
  provisions: z.array(z.string()),
  certainty: z.enum(["settled", "arguable", "open"]),
  explainer_url: z.string(),
});

export const NoticeInputsSchema = z.object({
  schema_version: z.literal(NOTICE_SCHEMA_VERSION),
  thin: z.boolean(),
  lines: z.array(NoticeLine),
  questions: z.array(NoticeQuestion),
  catalogue_questions: z.array(CatalogueQuestion),
  basis_findings: z.array(BasisFinding),
});
export type NoticeInputs = z.infer<typeof NoticeInputsSchema>;

const PurposeChange = z.object({
  id: z.string(),
  purpose: z.string(),
  purpose_is_new: z.boolean(),
});

export const NoticeChangeSchema = z.object({
  schema_version: z.literal(NOTICE_SCHEMA_VERSION),
  fresh_consent: z.boolean(),
  data_points_added: z.array(PurposeChange),
  purpose_changes: z.array(PurposeChange),
  recipients_added: z.array(z.object({ data_point: z.string(), vendor: z.string() })),
  data_points_removed: z.array(z.object({ id: z.string() })),
});
export type NoticeChange = z.infer<typeof NoticeChangeSchema>;

export interface NoticeReading {
  rules: Rule[];
  findings: Finding[];
  questions: Question[];
}

export function noticeInputsJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(NoticeInputsSchema) as Record<string, unknown>;
}

export function noticeChangeJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(NoticeChangeSchema) as Record<string, unknown>;
}

/** One line per data point, in map order. `how_long` is `retention.stated`. */
export function noticeLines(map: DataMap, vendors: Tracker[]): NoticeLine[] {
  const byId = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  return map.data_points.map((point) => lineFor(point, byId));
}

export function noticeInputs(map: DataMap, vendors: Tracker[], reading?: NoticeReading): NoticeInputs {
  const asserted = new Set(
    (reading?.rules ?? [])
      .filter((rule) => {
        const basis = rule.detection.where.basis;
        return basis !== undefined && basis !== "unstated";
      })
      .map((rule) => rule.id),
  );
  const purposes = map.data_points.filter((point) => point.purpose.trim());
  return NoticeInputsSchema.parse({
    schema_version: NOTICE_SCHEMA_VERSION,
    thin: map.data_points.length === 0 || purposes.length === 0,
    lines: noticeLines(map, vendors),
    questions: openQuestions(map).map((question) => ({
      id: question.id,
      ...(question.data_point ? { data_point: question.data_point } : {}),
      rule_id: question.rule_id,
      ask: question.ask,
    })),
    catalogue_questions: (reading?.questions ?? []).map((question) => ({
      rule_id: question.rule_id,
      prompt: question.prompt,
      needs_input: question.needs_input,
    })),
    basis_findings: (reading?.findings ?? [])
      .filter((finding) => asserted.has(finding.rule_id))
      .map((finding) => ({
        rule_id: finding.rule_id,
        title: finding.title,
        provisions: finding.provisions,
        certainty: finding.certainty,
        explainer_url: finding.explainer_url,
      })),
  });
}

/**
 * A purpose is new when the later map records a purpose string the earlier map
 * does not. A new data point that reuses an existing purpose, an existing
 * point whose purpose changes to a string already on the map, or a new
 * recipient alone, does not ask for fresh consent (spec §8.2). The reused
 * purpose is still listed.
 */
export function noticeChanges(from: DataMap, to: DataMap): NoticeChange {
  const diff = diffDataMaps(from, to);
  const prior = new Set(from.data_points.map((point) => point.purpose.trim()).filter(Boolean));
  const fromById = new Map(from.data_points.map((point) => [point.id, point]));
  const toById = new Map(to.data_points.map((point) => [point.id, point]));
  const addedIds = new Set(diff.site.data_points_added.map((point) => point.id));
  const data_points_added = diff.site.data_points_added.map((ref) => {
    const purpose = toById.get(ref.id)?.purpose.trim() ?? "";
    return { id: ref.id, purpose, purpose_is_new: purpose.length > 0 && !prior.has(purpose) };
  });
  const purpose_changes = to.data_points.flatMap((point) => {
    if (addedIds.has(point.id)) return [];
    const next = point.purpose.trim();
    const prev = fromById.get(point.id)?.purpose.trim() ?? "";
    if (!next || next === prev) return [];
    return [{ id: point.id, purpose: next, purpose_is_new: !prior.has(next) }];
  });
  const fresh = [...data_points_added, ...purpose_changes].some((change) => change.purpose_is_new);
  return NoticeChangeSchema.parse({
    schema_version: NOTICE_SCHEMA_VERSION,
    fresh_consent: fresh,
    data_points_added,
    purpose_changes,
    recipients_added: diff.site.recipients_added.map((recipient) => ({
      data_point: recipient.data_point,
      vendor: recipient.vendor,
    })),
    data_points_removed: diff.site.data_points_removed.map((point) => ({ id: point.id })),
  });
}

function lineFor(point: DataPoint, vendors: Map<string, Tracker>): NoticeLine {
  const locations: string[] = [];
  for (const observed of point.observed) {
    if (observed.location && !locations.includes(observed.location)) locations.push(observed.location);
  }
  return {
    id: point.id,
    name: point.name,
    purpose: point.purpose,
    how_long: point.retention.stated,
    locations,
    recipients: point.recipients.map((recipient) => {
      const vendor = vendors.get(recipient.vendor);
      return {
        vendor: recipient.vendor,
        vendor_name: vendor?.vendor ?? recipient.vendor,
        role: recipient.role,
        notice_itemisation: vendor?.notice_itemisation?.replace(/\s+/g, " ").trim() ?? "",
      };
    }),
  };
}

