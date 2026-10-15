import type { DataMap, DataPoint, MapObservation, Recipient, RetentionSignal, RightsEndpoint } from "./schema.js";
import { DataMapSchema } from "./schema.js";
import type { EmittedScan } from "./page.js";

/**
 * Replace this scan's scanner zone. Human fields on a matched point are kept.
 * shortcut: stale after one miss of this source; raise N when the product names it.
 */
export function mergeScan(map: DataMap, emitted: EmittedScan): DataMap {
  const scanId = emitted.scan.id;
  const points = map.data_points.map((dp) => stripPoint(dp, scanId));
  const gates = map.consent_gates.map((g) => ({
    ...g,
    observed: g.observed.filter((o) => o.scan !== scanId),
  }));
  const rights = mergeRights(map.rights_endpoints, scanId);

  for (const incoming of emitted.data_points) {
    const idx = points.findIndex((p) => samePoint(p, incoming));
    if (idx === -1) points.push(incoming);
    else points[idx] = overlay(points[idx]!, incoming);
  }

  for (const incoming of emitted.consent_gates) {
    const idx = gates.findIndex((g) => g.id === incoming.id);
    if (idx === -1) gates.push(incoming);
    else {
      const prev = gates[idx]!;
      gates[idx] = {
        ...prev,
        kind: incoming.kind,
        text_excerpt: incoming.text_excerpt || prev.text_excerpt,
        observed: [...prev.observed, ...incoming.observed],
      };
    }
  }

  const merged: DataMap = {
    schema_version: "1.0.0",
    repository: map.repository,
    generated_by: emitted.generated_by,
    scans: [...map.scans.filter((s) => s.id !== scanId), emitted.scan],
    data_points: points.map(markStale),
    consent_gates: gates,
    rights_endpoints: overlayRights(rights, emitted.rights_endpoints),
    questions: [...map.questions.filter((q) => q.scan !== scanId), ...emitted.questions],
  };
  return sortDataMap(DataMapSchema.parse(merged));
}

export function samePoint(a: DataPoint, b: DataPoint): boolean {
  const left = new Set([a.id, ...a.aliases]);
  return [b.id, ...b.aliases].some((id) => left.has(id));
}

function stripPoint(dp: DataPoint, scanId: string): DataPoint {
  return {
    ...dp,
    observed: dp.observed.filter((o) => o.scan !== scanId),
    recipients: dp.recipients.map((r) => ({
      ...r,
      observed: r.observed.filter((o) => o.scan !== scanId),
    })),
    retention: {
      ...dp.retention,
      signals: dp.retention.signals.filter((s) => s.scan !== scanId),
    },
  };
}

function overlay(prev: DataPoint, incoming: DataPoint): DataPoint {
  const aliases = uniq([
    ...prev.aliases,
    ...incoming.aliases,
    ...(prev.id === incoming.id ? [] : [incoming.id]),
  ]).filter((id) => id !== prev.id);
  return {
    ...incoming,
    id: prev.id,
    name: prev.name,
    category: prev.category,
    flags: prev.flags,
    aliases,
    observed: [...prev.observed, ...incoming.observed],
    recipients: mergeRecipients(prev.recipients, incoming.recipients),
    consent_gate: prev.consent_gate ?? incoming.consent_gate,
    purpose: prev.purpose,
    basis: prev.basis,
    retention: {
      stated: prev.retention.stated,
      signals: [...prev.retention.signals, ...incoming.retention.signals],
    },
    answers: prev.answers,
    notes: prev.notes,
  };
}

function mergeRecipients(prev: Recipient[], incoming: Recipient[]): Recipient[] {
  const out = prev.map((r) => ({ ...r, observed: [...r.observed] }));
  for (const inc of incoming) {
    const existing = out.find((r) => r.vendor === inc.vendor);
    if (!existing) {
      out.push(inc);
      continue;
    }
    existing.observed.push(...inc.observed);
    if (inc.country) existing.country = inc.country;
  }
  return out;
}

function markStale(dp: DataPoint): DataPoint {
  const live = dp.observed.length > 0 || dp.recipients.some((r) => r.observed.length > 0);
  return { ...dp, stale: !live };
}

function mergeRights(prev: RightsEndpoint[], scanId: string): RightsEndpoint[] {
  return prev
    .map((r) => ({ ...r, observed: r.observed.filter((o) => o.scan !== scanId) }))
    .filter((r) => r.observed.length > 0);
}

function overlayRights(prev: RightsEndpoint[], incoming: RightsEndpoint[]): RightsEndpoint[] {
  const out = prev.map((r) => ({ ...r, observed: [...r.observed] }));
  for (const inc of incoming) {
    const existing = out.find((r) => r.right === inc.right);
    if (!existing) out.push(inc);
    else existing.observed.push(...inc.observed);
  }
  return out;
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort();
}

export function sortDataMap(map: DataMap): DataMap {
  return {
    ...map,
    scans: [...map.scans].sort((a, b) => a.id.localeCompare(b.id)),
    data_points: [...map.data_points].map(sortPoint).sort((a, b) => a.id.localeCompare(b.id)),
    consent_gates: [...map.consent_gates]
      .map((g) => ({ ...g, observed: sortObs(g.observed) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    rights_endpoints: [...map.rights_endpoints]
      .map((r) => ({ ...r, observed: sortObs(r.observed) }))
      .sort((a, b) => a.right.localeCompare(b.right)),
    questions: [...map.questions].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function sortPoint(dp: DataPoint): DataPoint {
  const answers: DataPoint["answers"] = {};
  for (const key of Object.keys(dp.answers).sort()) answers[key] = dp.answers[key]!;
  return {
    ...dp,
    aliases: [...dp.aliases].sort(),
    observed: sortObs(dp.observed),
    recipients: [...dp.recipients]
      .map((r) => ({ ...r, observed: sortObs(r.observed) }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor)),
    answers,
    retention: {
      ...dp.retention,
      signals: [...dp.retention.signals].sort(compareSignal),
    },
  };
}

function sortObs(obs: MapObservation[]): MapObservation[] {
  return [...obs].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.kind.localeCompare(b.kind));
}

function compareSignal(a: RetentionSignal, b: RetentionSignal): number {
  return a.kind.localeCompare(b.kind) || a.location.localeCompare(b.location);
}
