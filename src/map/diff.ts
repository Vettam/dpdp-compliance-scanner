import type { Finding, FindingPresence } from "../types.js";
import { findingHost, findingKey, toPresence } from "../interaction/finding-key.js";
import type { DataMap, DataMapDiff, DataPoint, Recipient } from "./schema.js";
import { DataMapDiffSchema } from "./schema.js";
import { samePoint } from "./merge.js";

export type DeriveFindings = (map: DataMap) => Finding[];

/**
 * Site drift is data points, recipients, gates, and retention signals added or
 * removed. Catalogue drift is findings that changed because rules_version or
 * vendors_version changed (spec §4.7). Pass `derive` to fill those findings.
 */
export function diffDataMaps(from: DataMap, to: DataMap, derive?: DeriveFindings): DataMapDiff {
  const catalogue_changed =
    from.generated_by.rules_version !== to.generated_by.rules_version ||
    from.generated_by.vendors_version !== to.generated_by.vendors_version;

  const pairedTo = new Set<DataPoint>();
  const removed: DataPoint[] = [];
  const pairs: Array<[DataPoint, DataPoint]> = [];
  for (const point of from.data_points) {
    const match = to.data_points.find((p) => !pairedTo.has(p) && samePoint(point, p));
    if (!match) removed.push(point);
    else {
      pairedTo.add(match);
      pairs.push([point, match]);
    }
  }
  const added = to.data_points.filter((p) => !pairedTo.has(p));

  const recipients_added: DataMapDiff["site"]["recipients_added"] = [];
  const recipients_removed: DataMapDiff["site"]["recipients_removed"] = [];
  const retention_signals_added: DataMapDiff["site"]["retention_signals_added"] = [];
  const retention_signals_removed: DataMapDiff["site"]["retention_signals_removed"] = [];

  for (const [a, b] of pairs) {
    const pointId = b.id;
    diffRecipients(pointId, a.recipients, b.recipients, recipients_added, recipients_removed);
    diffSignals(pointId, a, b, retention_signals_added, retention_signals_removed);
  }

  const fromGates = new Set(from.consent_gates.map((g) => g.id));
  const toGates = new Set(to.consent_gates.map((g) => g.id));

  const catalogue = emptyCatalogue();
  if (catalogue_changed && derive) {
    fillCatalogue(catalogue, derive(from), derive(to));
  }

  return DataMapDiffSchema.parse({
    schema_version: "1.0.0",
    from: {
      rules_version: from.generated_by.rules_version,
      vendors_version: from.generated_by.vendors_version,
    },
    to: {
      rules_version: to.generated_by.rules_version,
      vendors_version: to.generated_by.vendors_version,
    },
    catalogue_changed,
    site: {
      data_points_added: added.map(pointRef).sort(byId),
      data_points_removed: removed.map(pointRef).sort(byId),
      recipients_added: recipients_added.sort(byVendor),
      recipients_removed: recipients_removed.sort(byVendor),
      consent_gates_added: to.consent_gates
        .filter((g) => !fromGates.has(g.id))
        .map((g) => ({ id: g.id, kind: g.kind }))
        .sort(byId),
      consent_gates_removed: from.consent_gates
        .filter((g) => !toGates.has(g.id))
        .map((g) => ({ id: g.id, kind: g.kind }))
        .sort(byId),
      retention_signals_added: retention_signals_added.sort(bySignal),
      retention_signals_removed: retention_signals_removed.sort(bySignal),
    },
    catalogue,
  });
}

export function renderDataMapDiff(diff: DataMapDiff): string {
  const s = diff.site;
  const version = diff.catalogue_changed
    ? `${diff.from.rules_version} → ${diff.to.rules_version}`
    : "unchanged";
  return [
    `SITE  data points +${s.data_points_added.length} −${s.data_points_removed.length}  recipients +${s.recipients_added.length} −${s.recipients_removed.length}  gates +${s.consent_gates_added.length} −${s.consent_gates_removed.length}  signals +${s.retention_signals_added.length} −${s.retention_signals_removed.length}`,
    `CATALOGUE  ${version}  findings +${diff.catalogue.findings_added.length} −${diff.catalogue.findings_removed.length}  reclassified ${diff.catalogue.findings_reclassified.length}`,
  ].join("\n");
}

export function renderDataMapDiffMarkdown(diff: DataMapDiff): string {
  const lines = ["# Data map diff", "", renderDataMapDiff(diff), ""];
  const section = (title: string, rows: string[]) => {
    lines.push(`## ${title}`, "");
    if (rows.length === 0) lines.push("None.");
    else for (const row of rows) lines.push(`- ${row}`);
    lines.push("");
  };
  section(
    "Data points added",
    diff.site.data_points_added.map((d) => `${d.id} (${d.category})`),
  );
  section(
    "Data points removed",
    diff.site.data_points_removed.map((d) => `${d.id} (${d.category})`),
  );
  section(
    "Recipients added",
    diff.site.recipients_added.map((r) => `${r.data_point} → ${r.vendor}`),
  );
  section(
    "Recipients removed",
    diff.site.recipients_removed.map((r) => `${r.data_point} → ${r.vendor}`),
  );
  section(
    "Consent gates added",
    diff.site.consent_gates_added.map((g) => `${g.id} (${g.kind})`),
  );
  section(
    "Consent gates removed",
    diff.site.consent_gates_removed.map((g) => `${g.id} (${g.kind})`),
  );
  section(
    "Retention signals added",
    diff.site.retention_signals_added.map((s) => `${s.data_point} ${s.kind} ${s.location}`),
  );
  section(
    "Retention signals removed",
    diff.site.retention_signals_removed.map((s) => `${s.data_point} ${s.kind} ${s.location}`),
  );
  return lines.join("\n");
}

function pointRef(dp: DataPoint) {
  return { id: dp.id, name: dp.name, category: dp.category };
}

function diffRecipients(
  dataPoint: string,
  from: Recipient[],
  to: Recipient[],
  added: DataMapDiff["site"]["recipients_added"],
  removed: DataMapDiff["site"]["recipients_removed"],
): void {
  const fromIds = new Set(from.map((r) => r.vendor));
  const toIds = new Set(to.map((r) => r.vendor));
  for (const r of to) {
    if (!fromIds.has(r.vendor)) added.push({ data_point: dataPoint, vendor: r.vendor, role: r.role, country: r.country });
  }
  for (const r of from) {
    if (!toIds.has(r.vendor)) removed.push({ data_point: dataPoint, vendor: r.vendor, role: r.role, country: r.country });
  }
}

function diffSignals(
  dataPoint: string,
  from: DataPoint,
  to: DataPoint,
  added: DataMapDiff["site"]["retention_signals_added"],
  removed: DataMapDiff["site"]["retention_signals_removed"],
): void {
  const key = (kind: string, location: string) => `${kind}\0${location}`;
  const fromKeys = new Set(from.retention.signals.map((s) => key(s.kind, s.location)));
  const toKeys = new Set(to.retention.signals.map((s) => key(s.kind, s.location)));
  for (const s of to.retention.signals) {
    if (!fromKeys.has(key(s.kind, s.location))) added.push({ data_point: dataPoint, kind: s.kind, location: s.location });
  }
  for (const s of from.retention.signals) {
    if (!toKeys.has(key(s.kind, s.location))) removed.push({ data_point: dataPoint, kind: s.kind, location: s.location });
  }
}

function emptyCatalogue(): DataMapDiff["catalogue"] {
  return { findings_added: [], findings_removed: [], findings_reclassified: [] };
}

function fillCatalogue(catalogue: DataMapDiff["catalogue"], from: Finding[], to: Finding[]): void {
  const fromMap = byKey(from);
  const toMap = byKey(to);
  for (const [key, f] of toMap) {
    const prev = fromMap.get(key);
    if (!prev) catalogue.findings_added.push(toPresence(f));
    else if (prev.certainty !== f.certainty) {
      catalogue.findings_reclassified.push({
        rule_id: f.rule_id,
        tracker_id: f.tracker?.id ?? null,
        host: findingHost(f),
        from_certainty: prev.certainty,
        to_certainty: f.certainty,
      });
    }
  }
  for (const [key, f] of fromMap) {
    if (!toMap.has(key)) catalogue.findings_removed.push(toPresence(f));
  }
  catalogue.findings_added.sort(byPresence);
  catalogue.findings_removed.sort(byPresence);
}

function byKey(findings: Finding[]): Map<string, Finding> {
  const map = new Map<string, Finding>();
  for (const f of findings) map.set(findingKey(f), f);
  return map;
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

function byVendor(a: { data_point: string; vendor: string }, b: { data_point: string; vendor: string }): number {
  return a.data_point.localeCompare(b.data_point) || a.vendor.localeCompare(b.vendor);
}

function bySignal(
  a: { data_point: string; kind: string; location: string },
  b: { data_point: string; kind: string; location: string },
): number {
  return a.data_point.localeCompare(b.data_point) || a.kind.localeCompare(b.kind) || a.location.localeCompare(b.location);
}

function byPresence(a: FindingPresence, b: FindingPresence): number {
  return a.rule_id.localeCompare(b.rule_id) || a.host.localeCompare(b.host);
}
