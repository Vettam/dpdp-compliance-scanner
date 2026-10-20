import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OVERLAY_FLAGS, TRACKER_CATEGORIES } from "../taxonomy.js";
import { TrackerRole } from "../trackers/schema.js";

/**
 * DataMap 1.0.0 (spec §4.3). Scanner zone is regenerated on merge.
 * Human zone — name, purpose, basis, retention.stated, answers, notes,
 * and a human override of category, flags, consent_gate, or recipient role —
 * is preserved.
 */

export const DATA_MAP_SCHEMA_VERSION = "1.0.0";

export const Confidence = z.enum(["high", "medium", "low"]);

export const ObservationKind = z.enum([
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
]);

export const MapObservation = z.object({
  scan: z.string(),
  kind: ObservationKind,
  location: z.string(),
  confidence: Confidence,
  /** Index in the source observation list so page findings re-derive in order. */
  seq: z.number().int().min(0).optional(),
  detail: z.record(z.string(), z.unknown()).default({}),
});
export type MapObservation = z.infer<typeof MapObservation>;

export const Basis = z.enum([
  "consent",
  "voluntarily_provided",
  "legal_obligation",
  "medical_emergency",
  "employment",
  "state_function",
  "unstated",
]);
export type Basis = z.infer<typeof Basis>;

export const Recipient = z.object({
  vendor: z.string(),
  role: TrackerRole,
  country: z.string().default(""),
  observed: z.array(MapObservation).default([]),
});
export type Recipient = z.infer<typeof Recipient>;

export const RetentionSignal = z.object({
  kind: z.string(),
  location: z.string(),
  scan: z.string().optional(),
});
export type RetentionSignal = z.infer<typeof RetentionSignal>;

export const Answer = z.object({
  answered_at: z.string(),
  by: z.string(),
});
export type Answer = z.infer<typeof Answer>;

export const DataPoint = z.object({
  id: z.string(),
  name: z.string().default(""),
  category: z.enum(TRACKER_CATEGORIES).default("UNCLASSIFIED"),
  flags: z.array(z.enum(OVERLAY_FLAGS)).default([]),
  aliases: z.array(z.string()).default([]),
  observed: z.array(MapObservation).default([]),
  recipients: z.array(Recipient).default([]),
  consent_gate: z.string().nullable().default(null),
  purpose: z.string().default(""),
  basis: Basis.default("unstated"),
  retention: z
    .object({
      stated: z.string().default(""),
      signals: z.array(RetentionSignal).default([]),
    })
    .default({ stated: "", signals: [] }),
  answers: z.record(z.string(), Answer).default({}),
  notes: z.string().default(""),
  stale: z.boolean().default(false),
});
export type DataPoint = z.infer<typeof DataPoint>;

export const ConsentGate = z.object({
  id: z.string(),
  kind: z.enum(["banner", "checkbox", "dialog", "code_check"]),
  observed: z.array(MapObservation).default([]),
  text_excerpt: z.string().default(""),
});
export type ConsentGate = z.infer<typeof ConsentGate>;

/** On the map, not on a data point (spec §5.2). Block 080 reads `right`. */
export const RightsEndpoint = z.object({
  right: z.enum(["access", "erase", "correct"]),
  observed: z.array(MapObservation).default([]),
});
export type RightsEndpoint = z.infer<typeof RightsEndpoint>;

export const MapQuestion = z.object({
  id: z.string(),
  data_point: z.string().optional(),
  rule_id: z.string().nullable().default(null),
  ask: z.string(),
  /** Scan that wrote this question. A merge replaces only that scan's questions. */
  scan: z.string().optional(),
});
export type MapQuestion = z.infer<typeof MapQuestion>;

const PageSource = z.object({
  kind: z.literal("page"),
  url: z.string(),
  /**
   * Meta observation (and a banner observation when no consent gate was created),
   * each wrapped as `{ seq, observation }`.
   */
  detail: z.record(z.string(), z.unknown()).default({}),
});

const CodeSource = z.object({
  kind: z.literal("code"),
  path: z.string(),
  commit: z.string().default(""),
});

export const ScanRecord = z.object({
  id: z.string(),
  source: z.discriminatedUnion("kind", [PageSource, CodeSource]),
  scanned_at: z.string(),
});
export type ScanRecord = z.infer<typeof ScanRecord>;

export const GeneratedBy = z.object({
  package: z.string(),
  version: z.string(),
  rules_version: z.string(),
  vendors_version: z.string(),
});
export type GeneratedBy = z.infer<typeof GeneratedBy>;

export const DataMapSchema = z.object({
  schema_version: z.literal(DATA_MAP_SCHEMA_VERSION),
  repository: z.string().default(""),
  generated_by: GeneratedBy,
  scans: z.array(ScanRecord).default([]),
  data_points: z.array(DataPoint).default([]),
  consent_gates: z.array(ConsentGate).default([]),
  rights_endpoints: z.array(RightsEndpoint).default([]),
  questions: z.array(MapQuestion).default([]),
});
export type DataMap = z.infer<typeof DataMapSchema>;

const DataPointRef = z.object({
  id: z.string(),
  name: z.string().default(""),
  category: z.string().default(""),
});

const RecipientRef = z.object({
  data_point: z.string(),
  vendor: z.string(),
  role: z.string().default(""),
  country: z.string().default(""),
});

const GateRef = z.object({
  id: z.string(),
  kind: z.string(),
});

const SignalRef = z.object({
  data_point: z.string(),
  kind: z.string(),
  location: z.string(),
});

const FindingPresenceRef = z.object({
  rule_id: z.string(),
  tracker_id: z.string().nullable(),
  host: z.string().default(""),
  certainty: z.enum(["settled", "arguable", "open"]),
  title: z.string(),
});

const FindingReclassifiedRef = z.object({
  rule_id: z.string(),
  tracker_id: z.string().nullable(),
  host: z.string().default(""),
  from_certainty: z.enum(["settled", "arguable", "open"]),
  to_certainty: z.enum(["settled", "arguable", "open"]),
});

/** Site drift is structural. Catalogue drift is findings that moved because a version changed (spec §4.7). */
export const DataMapDiffSchema = z.object({
  schema_version: z.literal(DATA_MAP_SCHEMA_VERSION),
  from: z.object({
    rules_version: z.string(),
    vendors_version: z.string(),
  }),
  to: z.object({
    rules_version: z.string(),
    vendors_version: z.string(),
  }),
  catalogue_changed: z.boolean(),
  site: z.object({
    data_points_added: z.array(DataPointRef).default([]),
    data_points_removed: z.array(DataPointRef).default([]),
    recipients_added: z.array(RecipientRef).default([]),
    recipients_removed: z.array(RecipientRef).default([]),
    consent_gates_added: z.array(GateRef).default([]),
    consent_gates_removed: z.array(GateRef).default([]),
    retention_signals_added: z.array(SignalRef).default([]),
    retention_signals_removed: z.array(SignalRef).default([]),
  }),
  catalogue: z.object({
    findings_added: z.array(FindingPresenceRef).default([]),
    findings_removed: z.array(FindingPresenceRef).default([]),
    findings_reclassified: z.array(FindingReclassifiedRef).default([]),
  }),
});
export type DataMapDiff = z.infer<typeof DataMapDiffSchema>;

export function dataMapJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(DataMapSchema) as Record<string, unknown>;
}

export function dataMapDiffJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(DataMapDiffSchema) as Record<string, unknown>;
}
