import type { Tracker } from "../../../vendors/schema.js";
import type { PersonalDataEntry } from "../../../vendors/vocabulary.js";
import { deriveId } from "../../../map/ids.js";
import type { EmittedScan } from "../../../map/page.js";
import type {
  ConsentGate,
  DataPoint,
  MapObservation,
  MapQuestion,
  RetentionSignal,
  RightsEndpoint,
} from "../../../map/schema.js";
import { parseScript } from "./ast.js";
import { consentHits } from "./consent.js";
import { httpHits, type HttpHit } from "./http.js";
import { inputHits } from "./inputs.js";
import { columnSignals, fileSignals, retentionKind } from "./retention.js";
import { rightsHits } from "./rights.js";
import { columnsFromFile, type SchemaColumn } from "./schema.js";
import { matchColumn, normColumn } from "./vocab.js";
import { listCodeFiles } from "./walk.js";
import { TrackerIndex } from "../../../vendors/matcher.js";

const SKIP_COLUMNS = new Set(["id", "uuid", "pk", "created_at", "updated_at"]);

export interface JsContribution {
  data_points: DataPoint[];
  consent_gates: ConsentGate[];
  questions: MapQuestion[];
  rights_endpoints: RightsEndpoint[];
}

export function scanJs(input: {
  root: string;
  scanId: string;
  vendors: Tracker[];
  vocabulary: { entries: PersonalDataEntry[] };
}): JsContribution {
  const index = new TrackerIndex(input.vendors);
  const files = listCodeFiles(input.root);
  const columns: SchemaColumn[] = [];
  const calls: HttpHit[] = [];
  const inputs: ReturnType<typeof inputHits> = [];
  const gateHits: ReturnType<typeof consentHits>["gates"] = [];
  const spans: ReturnType<typeof consentHits>["spans"] = [];
  const rights: ReturnType<typeof rightsHits> = [];

  for (const file of files) {
    const sf = file.kind === "script" ? parseScript(file.rel, file.text) : undefined;
    columns.push(...columnsFromFile(file, sf));
    if (!sf) {
      rights.push(...rightsHits(file.rel));
      continue;
    }
    calls.push(...httpHits(file.rel, sf, index));
    inputs.push(...inputHits(file.rel, sf));
    const consent = consentHits(file.rel, sf, index);
    gateHits.push(...consent.gates);
    spans.push(...consent.spans);
    rights.push(...rightsHits(file.rel, sf));
  }

  for (const call of calls) {
    const span = spans.find((s) => s.file === call.file && call.start >= s.start && call.start < s.end);
    if (span) call.gatedBy = span.gateId;
  }

  const tables = [...new Set(columns.map((c) => c.table))];
  const signals = [
    ...columnSignals(columns),
    ...files.flatMap((file) => fileSignals(file, tables)),
  ];

  return assemble({
    scanId: input.scanId,
    vocabulary: input.vocabulary.entries,
    columns,
    calls,
    inputs,
    gateHits,
    rights,
    signals,
  });
}

export function foldJs(base: EmittedScan, js: JsContribution): EmittedScan {
  return {
    ...base,
    data_points: mergePoints(base.data_points, js.data_points),
    consent_gates: mergeGates(base.consent_gates, js.consent_gates),
    rights_endpoints: mergeRights(base.rights_endpoints, js.rights_endpoints),
    questions: dedupeQuestions([...base.questions, ...js.questions]),
  };
}

export function assemble(input: {
  scanId: string;
  vocabulary: PersonalDataEntry[];
  columns: SchemaColumn[];
  calls: HttpHit[];
  inputs: ReturnType<typeof inputHits>;
  gateHits: ReturnType<typeof consentHits>["gates"];
  rights: ReturnType<typeof rightsHits>;
  signals: ReturnType<typeof columnSignals>;
}): JsContribution {
  let seq = 0;
  const obs = (
    kind: MapObservation["kind"],
    location: string,
    confidence: MapObservation["confidence"],
    detail: Record<string, unknown>,
  ): MapObservation => ({
    scan: input.scanId,
    kind,
    location,
    confidence,
    seq: seq++,
    detail,
  });

  const points = new Map<string, DataPoint>();
  const questions: MapQuestion[] = [];
  const columnPoints: { norm: string; table: string; point: DataPoint }[] = [];

  for (const col of input.columns) {
    const entry = matchColumn(input.vocabulary, col.column);
    const named = col.signal ?? retentionKind(col.column);
    if (named && !entry) continue;
    const norm = normColumn(col.column);
    if (!entry && (!col.freeText || SKIP_COLUMNS.has(norm))) continue;
    const id = deriveId({ kind: "column", table: col.table, column: col.column });
    const point = points.get(id) ?? blank(id, col.column, entry?.category ?? "UNCLASSIFIED", entry?.flags ?? []);
    point.observed.push(obs("schema_column", col.location, "high", { table: col.table, column: col.column }));
    points.set(id, point);
    columnPoints.push({ norm, table: col.table, point });
    if (!entry && col.freeText) {
      questions.push({
        id: `q_${id}_meaning`,
        data_point: id,
        rule_id: null,
        ask: `The column ${col.table}.${col.column} is free text. Does it hold personal data? What kind?`,
        scan: input.scanId,
      });
    }
  }

  for (const hit of input.inputs) {
    const norm = normColumn(hit.field);
    const linked = columnPoints.filter((c) => c.norm === norm);
    const detail = { form: hit.form, field: hit.field };
    if (linked.length > 0) {
      for (const col of linked) col.point.observed.push(obs("input_field", hit.location, "high", detail));
      continue;
    }
    const entry = matchColumn(input.vocabulary, hit.field);
    const id = deriveId({ kind: "input", form: hit.form, field: hit.field });
    const point = points.get(id) ?? blank(id, hit.field, entry?.category ?? "UNCLASSIFIED", entry?.flags ?? []);
    point.observed.push(obs("input_field", hit.location, "high", detail));
    points.set(id, point);
  }

  const byVendor = new Map<string, HttpHit[]>();
  for (const call of input.calls) {
    if (call.questionName) {
      questions.push({
        id: `q_http_${normColumn(call.file)}_${normColumn(call.questionName)}`,
        rule_id: null,
        ask: `A call builds its URL from \`${call.questionName}\`. Does it send data outside this repository? To whom?`,
        scan: input.scanId,
      });
      continue;
    }
    if (!call.vendor) continue;
    const list = byVendor.get(call.vendor.id) ?? [];
    list.push(call);
    byVendor.set(call.vendor.id, list);
  }
  for (const [vendorId, list] of byVendor) {
    const vendor = list[0]?.vendor;
    if (!vendor) continue;
    const id = deriveId({ kind: "vendor", id: vendorId });
    const point = points.get(id) ?? blank(id, vendor.vendor, vendor.category, [...vendor.flags]);
    const observed = list.map((call) => obs("http_call", call.location, call.confidence, call.detail));
    const recipient = point.recipients.find((r) => r.vendor === vendor.id) ?? {
      vendor: vendor.id,
      role: vendor.role,
      country: vendor.destination_countries[0] ?? "",
      observed: [],
    };
    recipient.observed.push(...observed);
    if (!point.recipients.includes(recipient)) point.recipients.push(recipient);
    const gates = new Set(list.map((call) => call.gatedBy).filter((id): id is string => Boolean(id)));
    if (list.every((call) => call.gatedBy) && gates.size === 1) point.consent_gate = [...gates][0] ?? null;
    points.set(id, point);
  }

  for (const signal of input.signals) {
    for (const col of columnPoints) {
      if (col.table !== signal.table) continue;
      const next: RetentionSignal = { kind: signal.kind, location: signal.location, scan: input.scanId };
      const have = col.point.retention.signals.some((s) => s.kind === next.kind && s.location === next.location);
      if (!have) col.point.retention.signals.push(next);
    }
  }

  const gates = new Map<string, ConsentGate>();
  for (const hit of input.gateHits) {
    const observed = obs("consent_gate", hit.location, hit.confidence, {});
    const existing = gates.get(hit.id);
    if (!existing) {
      gates.set(hit.id, { id: hit.id, kind: hit.kind, observed: [observed], text_excerpt: hit.text });
      continue;
    }
    existing.observed.push(observed);
    if (!existing.text_excerpt && hit.text) existing.text_excerpt = hit.text;
  }

  const rights = new Map<string, RightsEndpoint>();
  for (const hit of input.rights) {
    const observed = obs("rights_endpoint", hit.location, "high", { path: hit.path, right: hit.right });
    const existing = rights.get(hit.right);
    if (!existing) rights.set(hit.right, { right: hit.right, observed: [observed] });
    else existing.observed.push(observed);
  }

  return {
    data_points: [...points.values()],
    consent_gates: [...gates.values()],
    questions: dedupeQuestions(questions),
    rights_endpoints: [...rights.values()],
  };
}

function blank(
  id: string,
  name: string,
  category: DataPoint["category"],
  flags: DataPoint["flags"],
): DataPoint {
  return {
    id,
    name,
    category,
    flags: [...flags],
    aliases: [],
    observed: [],
    recipients: [],
    consent_gate: null,
    purpose: "",
    basis: "unstated",
    retention: { stated: "", signals: [] },
    answers: {},
    notes: "",
    stale: false,
  };
}

function mergePoints(base: DataPoint[], extra: DataPoint[]): DataPoint[] {
  const out = base.map((point) => ({
    ...point,
    flags: [...point.flags],
    observed: [...point.observed],
    recipients: point.recipients.map((r) => ({ ...r, observed: [...r.observed] })),
    retention: { ...point.retention, signals: [...point.retention.signals] },
  }));
  for (const point of extra) {
    const idx = out.findIndex((p) => p.id === point.id);
    if (idx === -1) out.push(point);
    else out[idx] = combine(out[idx]!, point);
  }
  return out;
}

function combine(a: DataPoint, b: DataPoint): DataPoint {
  return {
    ...a,
    category: a.category === "UNCLASSIFIED" ? b.category : a.category,
    flags: [...new Set([...a.flags, ...b.flags])],
    observed: [...a.observed, ...b.observed],
    recipients: mergeRecipients(a.recipients, b.recipients),
    consent_gate: a.consent_gate ?? b.consent_gate,
    retention: {
      stated: a.retention.stated || b.retention.stated,
      signals: dedupeSignals([...a.retention.signals, ...b.retention.signals]),
    },
  };
}

function mergeRecipients(a: DataPoint["recipients"], b: DataPoint["recipients"]): DataPoint["recipients"] {
  const out = a.map((r) => ({ ...r, observed: [...r.observed] }));
  for (const rec of b) {
    const existing = out.find((r) => r.vendor === rec.vendor);
    if (!existing) out.push(rec);
    else existing.observed.push(...rec.observed);
  }
  return out;
}

function dedupeSignals(signals: RetentionSignal[]): RetentionSignal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = `${s.kind}\0${s.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeGates(a: ConsentGate[], b: ConsentGate[]): ConsentGate[] {
  const out = a.map((g) => ({ ...g, observed: [...g.observed] }));
  for (const gate of b) {
    const existing = out.find((g) => g.id === gate.id);
    if (!existing) out.push(gate);
    else {
      existing.observed.push(...gate.observed);
      if (!existing.text_excerpt) existing.text_excerpt = gate.text_excerpt;
    }
  }
  return out;
}

function mergeRights(a: RightsEndpoint[], b: RightsEndpoint[]): RightsEndpoint[] {
  const out = a.map((r) => ({ ...r, observed: [...r.observed] }));
  for (const endpoint of b) {
    const existing = out.find((r) => r.right === endpoint.right);
    if (!existing) out.push(endpoint);
    else existing.observed.push(...endpoint.observed);
  }
  return out;
}

function dedupeQuestions(questions: MapQuestion[]): MapQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });
}
