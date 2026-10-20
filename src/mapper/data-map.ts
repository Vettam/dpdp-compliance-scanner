import type { Finding, Observation, Question } from "../types.js";
import type { Rule, WhereCondition } from "../rules/schema.js";
import type { Tracker } from "../trackers/schema.js";
import { TrackerIndex } from "../trackers/matcher.js";
import { mapScan } from "./index.js";
import type { ConsentGate, DataMap, DataPoint, MapObservation, Recipient } from "../map/schema.js";

const MAP_MATCH = new Set(["data_point", "recipient", "consent_gate", "map"]);

/**
 * Page findings are re-derived from the observations the page scanner stored.
 * Map rules (blocks 070–090) then test the committed map (spec §4.6, §6).
 */
export function mapDataMap(
  map: DataMap,
  rules: Rule[],
  vendors: Tracker[],
  options?: { page?: boolean },
): { findings: Finding[]; questions: Question[] } {
  // `page: false` skips re-deriving page findings. Map rules still run.
  const findings = options?.page === false ? [] : pageFindings(map, rules, vendors);
  const asserted = mapReadings(map, rules, vendors);
  for (const finding of asserted.findings) {
    if (!findings.some((existing) => existing.id === finding.id)) findings.push(finding);
  }
  sortFindings(findings);
  return { findings, questions: asserted.questions };
}

function pageFindings(map: DataMap, rules: Rule[], vendors: Tracker[]): Finding[] {
  const findings: Finding[] = [];
  const pageScans = map.scans.filter((s) => s.source.kind === "page");
  for (const scan of pageScans) {
    const observations = observationsForScan(map, scan.id);
    if (observations.length === 0) continue;
    const sr = mapScan({
      observations,
      rules,
      trackers: new TrackerIndex(vendors),
      engineVersion: map.generated_by.version,
      rulesVersion: map.generated_by.rules_version,
      trackersVersion: map.generated_by.vendors_version,
      interpretationAsOf: scan.scanned_at.slice(0, 10),
    });
    for (const finding of sr.findings) {
      if (!findings.some((existing) => existing.id === finding.id)) findings.push(finding);
    }
  }
  return findings;
}

interface Hit {
  label: string;
  point?: DataPoint;
  recipient?: Recipient;
  gate?: ConsentGate;
}

function mapReadings(
  map: DataMap,
  rules: Rule[],
  vendors: Tracker[],
): { findings: Finding[]; questions: Question[] } {
  const findings: Finding[] = [];
  const questions: Question[] = [];
  for (const rule of rules) {
    if (!MAP_MATCH.has(rule.detection.match) || !rule.observable) continue;
    if (!sourcesApply(rule, map)) continue;
    const hits = hitsFor(rule, map, vendors);
    if (hits.length === 0) continue;
    if (rule.needs_input.length > 0) {
      const subjects = rule.detection.match === "map" ? hits.slice(0, 1) : hits;
      for (const hit of subjects) questions.push(toQuestion(rule, hit));
      continue;
    }
    for (const hit of hits) findings.push(toHitFinding(rule, hit, vendors));
  }
  for (const finding of bannerRulesOnCodeGates(map, rules, vendors)) {
    if (!findings.some((existing) => existing.id === finding.id)) findings.push(finding);
  }
  questions.sort((a, b) => a.rule_id.localeCompare(b.rule_id) || a.prompt.localeCompare(b.prompt));
  return { findings, questions };
}

function sourcesApply(rule: Rule, map: DataMap): boolean {
  const kinds = new Set<string>(map.scans.map((scan) => scan.source.kind));
  return rule.sources.some((source) => kinds.has(source));
}

function hitsFor(rule: Rule, map: DataMap, vendors: Tracker[]): Hit[] {
  const where = rule.detection.where;
  const keep = (scope: Scope) => holds(where, scope) && hitInSources(rule, scope);
  if (rule.detection.match === "map") {
    return keep({ map, vendors }) ? [{ label: "map" }] : [];
  }
  if (rule.detection.match === "consent_gate") {
    return map.consent_gates
      .filter((gate) => keep({ map, gate, vendors }))
      .map((gate) => ({ label: gate.id, gate }));
  }
  if (rule.detection.match === "recipient") {
    const hits: Hit[] = [];
    for (const point of map.data_points) {
      for (const recipient of point.recipients) {
        if (!keep({ map, point, recipient, vendors })) continue;
        hits.push({ label: `${point.id}:${recipient.vendor}`, point, recipient });
      }
    }
    return hits;
  }
  return map.data_points
    .filter((point) => keep({ map, point, vendors }))
    .map((point) => ({ label: point.id, point }));
}

interface Scope {
  map: DataMap;
  point?: DataPoint;
  recipient?: Recipient;
  gate?: ConsentGate;
  vendors: Tracker[];
}

const MAP_KEYS = new Set([
  "basis",
  "basis_not",
  "category",
  "category_in",
  "category_absent",
  "flags_any",
  "source_kind",
  "consent_gate_present",
  "consent_gate_kind",
  "retention_stated",
  "retention_signal_any",
  "recipient_role",
  "recipient_country_not",
  "observation_kind",
  "notice_itemisation",
  "mentions_grievance",
  "rights_endpoint_present",
]);

function holds(where: WhereCondition, scope: Scope): boolean {
  const { map } = scope;
  if (Object.keys(where).some((key) => !MAP_KEYS.has(key))) return false;
  if (where.basis && !basisIs(scope, where.basis)) return false;
  if (where.basis_not && !basisIsNot(scope, where.basis_not)) return false;
  if (where.category && !categoryIs(scope, where.category)) return false;
  if (where.category_in && !categoryIn(scope, where.category_in)) return false;
  if (where.category_absent && map.data_points.some((item) => item.category === where.category_absent)) return false;
  if (where.flags_any && !flagsAny(scope, where.flags_any)) return false;
  if (where.source_kind && !sourceKind(scope, where.source_kind)) return false;
  if (where.consent_gate_present !== undefined && !gatePresent(scope, where.consent_gate_present)) return false;
  if (where.consent_gate_kind && !gateKind(scope, where.consent_gate_kind)) return false;
  if (where.retention_stated !== undefined && !retentionStated(scope, where.retention_stated)) return false;
  if (where.retention_signal_any !== undefined && !retentionSignal(scope, where.retention_signal_any)) return false;
  if (where.recipient_role && !recipientRole(scope, where.recipient_role)) return false;
  if (where.recipient_country_not !== undefined && !countryNot(scope, where.recipient_country_not)) return false;
  if (where.observation_kind && !observationKind(scope, where.observation_kind)) return false;
  if (where.notice_itemisation !== undefined && !itemisation(scope, where.notice_itemisation)) return false;
  if (where.mentions_grievance !== undefined) {
    if (grievanceMentioned(map) !== where.mentions_grievance) return false;
    // shortcut: an empty map is not "no grievance contact", upgrade when notice text is on the map.
    if (!where.mentions_grievance && map.data_points.length === 0 && map.consent_gates.length === 0) return false;
  }
  if (where.rights_endpoint_present) {
    const { right, present } = where.rights_endpoint_present;
    const has = map.rights_endpoints.some((endpoint) => endpoint.right === right);
    if (has !== present) return false;
  }
  return true;
}

function hitInSources(rule: Rule, scope: Scope): boolean {
  const kinds = hitKinds(scope);
  if (kinds.size === 0) return rule.detection.match === "map";
  return rule.sources.some((source) => kinds.has(source));
}

function hitKinds(scope: Scope): Set<string> {
  if (scope.recipient) return recipientKinds(scope.map, scope.recipient);
  if (scope.gate) return gateKinds(scope.map, scope.gate);
  if (scope.point) return pointKinds(scope.map, scope.point);
  return new Set<string>(scope.map.scans.map((scan) => scan.source.kind));
}

function basisIs(scope: Scope, basis: DataPoint["basis"]): boolean {
  if (scope.point) return scope.point.basis === basis;
  return scope.map.data_points.some((point) => point.basis === basis);
}

function basisIsNot(scope: Scope, basis: DataPoint["basis"]): boolean {
  if (scope.point) return scope.point.basis !== basis;
  return scope.map.data_points.some((point) => point.basis !== basis);
}

function categoryIs(scope: Scope, category: DataPoint["category"]): boolean {
  if (scope.point) return scope.point.category === category;
  return scope.map.data_points.some((point) => point.category === category);
}

function categoryIn(scope: Scope, categories: DataPoint["category"][]): boolean {
  if (scope.point) return categories.includes(scope.point.category);
  return scope.map.data_points.some((point) => categories.includes(point.category));
}

function flagsAny(scope: Scope, flags: DataPoint["flags"]): boolean {
  const points = scope.point ? [scope.point] : scope.map.data_points;
  return points.some((point) => flags.some((flag) => point.flags.includes(flag)));
}

function sourceKind(scope: Scope, kind: "page" | "code" | "database"): boolean {
  if (scope.recipient) return recipientKinds(scope.map, scope.recipient).has(kind);
  if (scope.point) return pointKinds(scope.map, scope.point).has(kind);
  if (scope.gate) return gateKinds(scope.map, scope.gate).has(kind);
  return scope.map.scans.some((scan) => scan.source.kind === kind);
}

function gatePresent(scope: Scope, present: boolean): boolean {
  if (scope.point) return (scope.point.consent_gate !== null) === present;
  const any = scope.map.data_points.some((point) => point.consent_gate !== null);
  return any === present;
}

function gateKind(scope: Scope, kind: ConsentGate["kind"]): boolean {
  if (scope.gate) return scope.gate.kind === kind;
  if (!scope.point?.consent_gate) return false;
  const gate = scope.map.consent_gates.find((item) => item.id === scope.point?.consent_gate);
  return gate?.kind === kind;
}

function retentionStated(scope: Scope, stated: boolean): boolean {
  const points = scope.point ? [scope.point] : scope.map.data_points;
  return points.some((point) => (point.retention.stated.trim().length > 0) === stated);
}

function retentionSignal(scope: Scope, any: boolean): boolean {
  const points = scope.point ? [scope.point] : scope.map.data_points;
  return points.some((point) => (point.retention.signals.length > 0) === any);
}

function recipientRole(scope: Scope, role: Recipient["role"]): boolean {
  if (scope.recipient) return scope.recipient.role === role;
  const points = scope.point ? [scope.point] : scope.map.data_points;
  return points.some((point) => point.recipients.some((recipient) => recipient.role === role));
}

function countryNot(scope: Scope, country: string): boolean {
  const recipients = scope.recipient
    ? [scope.recipient]
    : (scope.point ? scope.point.recipients : scope.map.data_points.flatMap((point) => point.recipients));
  return recipients.some((recipient) => recipient.country.length > 0 && recipient.country !== country);
}

function observationKind(scope: Scope, kind: MapObservation["kind"]): boolean {
  if (scope.point) return pointObservations(scope.point).some((observation) => observation.kind === kind);
  if (scope.gate) return scope.gate.observed.some((observation) => observation.kind === kind);
  return (
    scope.map.data_points.some((point) => pointObservations(point).some((observation) => observation.kind === kind)) ||
    scope.map.consent_gates.some((gate) => gate.observed.some((observation) => observation.kind === kind)) ||
    scope.map.rights_endpoints.some((endpoint) => endpoint.observed.some((observation) => observation.kind === kind))
  );
}

function itemisation(scope: Scope, present: boolean): boolean {
  const recipients = scope.recipient
    ? [scope.recipient]
    : (scope.point ? scope.point.recipients : scope.map.data_points.flatMap((point) => point.recipients));
  if (recipients.length === 0) return false;
  const lacks = (recipient: Recipient) => {
    const vendor = scope.vendors.find((item) => item.id === recipient.vendor);
    return !vendor || vendor.notice_itemisation.trim().length === 0;
  };
  return present ? recipients.some((recipient) => !lacks(recipient)) : recipients.some(lacks);
}

const GRIEVANCE = /grievance|data protection officer|\bDPO\b|complain/i;

function grievanceMentioned(map: DataMap): boolean {
  return map.consent_gates.some((gate) => GRIEVANCE.test(gate.text_excerpt));
}

function pointKinds(map: DataMap, point: DataPoint): Set<string> {
  return kindsOf(map, pointObservations(point).map((observation) => observation.scan));
}

function recipientKinds(map: DataMap, recipient: Recipient): Set<string> {
  return kindsOf(map, recipient.observed.map((observation) => observation.scan));
}

function gateKinds(map: DataMap, gate: ConsentGate): Set<string> {
  return kindsOf(map, gate.observed.map((observation) => observation.scan));
}

function kindsOf(map: DataMap, scanIds: string[]): Set<string> {
  const kinds = new Set<string>();
  for (const id of scanIds) {
    const scan = map.scans.find((item) => item.id === id);
    if (scan) kinds.add(scan.source.kind);
  }
  return kinds;
}

function pointObservations(point: DataPoint): MapObservation[] {
  return [...point.observed, ...point.recipients.flatMap((recipient) => recipient.observed)];
}

function toHitFinding(rule: Rule, hit: Hit, vendors: Tracker[]): Finding {
  const vendorId = hit.recipient?.vendor ?? hit.point?.recipients[0]?.vendor;
  const vendor = vendorId ? vendors.find((item) => item.id === vendorId) : undefined;
  const point = hit.point;
  return {
    id: findingId(rule.id, hit.label),
    rule_id: rule.id,
    title: rule.title,
    certainty: rule.certainty,
    enforceable_from: rule.enforceable_from,
    observable: rule.observable,
    detection_confidence: hitConfidence(hit),
    provisions: rule.provisions,
    flags: rule.flags,
    owner: rule.owner,
    tracker: vendor ? { id: vendor.id, vendor: vendor.vendor, category: point?.category ?? vendor.category } : null,
    attributed_to: point?.name || point?.id || hit.gate?.id || "the data map",
    evidence: [],
    rationale_plain: rule.rationale_plain,
    rationale_dev: rule.rationale_dev,
    remediation_summary: rule.remediation_summary,
    explainer_url: rule.explainer_url,
    needs_input: rule.needs_input,
  };
}

function toQuestion(rule: Rule, hit: Hit): Question {
  const base = (rule.prompt ?? rule.title).replace(/\s+/g, " ").trim();
  return {
    rule_id: rule.id,
    title: rule.title,
    prompt: hit.label === "map" ? base : `${base} (${hit.label})`,
    certainty: rule.certainty,
    enforceable_from: rule.enforceable_from,
    provisions: rule.provisions,
    flags: rule.flags,
    owner: rule.owner,
    needs_input: rule.needs_input,
    fact_needed: rule.needs_input[0] ?? "",
    consequence_if_true: rule.remediation_summary,
    rationale_plain: rule.rationale_plain,
    explainer_url: rule.explainer_url,
  };
}

const BANNER_KEYS = new Set([
  "banner_detected",
  "has_accept",
  "has_reject",
  "has_settings",
  "has_pre_ticked",
  "has_language_switcher",
  "mentions_legitimate_interest",
  "implies_consent_by_browsing",
  "page_language",
]);

/**
 * C-004 and C-005 stay banner rules on a page. A code gate linked from a
 * consent-basis point is read with the same where keys (spec §4.6).
 */
function bannerRulesOnCodeGates(map: DataMap, rules: Rule[], vendors: Tracker[]): Finding[] {
  const findings: Finding[] = [];
  for (const point of map.data_points) {
    if (point.basis !== "consent" || !point.consent_gate) continue;
    const gate = map.consent_gates.find((item) => item.id === point.consent_gate);
    if (!gate || !gateKinds(map, gate).has("code")) continue;
    const flags = inferGate(gate);
    for (const rule of rules) {
      if (rule.detection.match !== "banner" || !rule.observable || rule.needs_input.length > 0) continue;
      const where = rule.detection.where;
      const keys = Object.keys(where);
      if (keys.length === 0 || keys.some((key) => !BANNER_KEYS.has(key))) continue;
      if (!bannerHolds(where, flags)) continue;
      findings.push(toHitFinding(rule, { label: point.id, point, gate }, vendors));
    }
  }
  return findings;
}

function inferGate(gate: ConsentGate) {
  const text = gate.text_excerpt;
  return {
    banner_detected: true,
    has_accept: true,
    has_reject: /\b(reject|decline|deny|refuse)\b/i.test(text),
    has_settings: false,
    has_pre_ticked: /pre-?tick|default\s*checked|checked by default/i.test(text),
    has_language_switcher: false,
    mentions_legitimate_interest: /legitimate interest/i.test(text),
    implies_consent_by_browsing: false,
    page_language: "",
  };
}

function bannerHolds(where: WhereCondition, flags: ReturnType<typeof inferGate>): boolean {
  const checks: Array<[unknown, unknown]> = [
    [where.banner_detected, flags.banner_detected],
    [where.has_accept, flags.has_accept],
    [where.has_reject, flags.has_reject],
    [where.has_settings, flags.has_settings],
    [where.has_pre_ticked, flags.has_pre_ticked],
    [where.has_language_switcher, flags.has_language_switcher],
    [where.mentions_legitimate_interest, flags.mentions_legitimate_interest],
    [where.implies_consent_by_browsing, flags.implies_consent_by_browsing],
    [where.page_language, flags.page_language],
  ];
  return checks.every(([expected, actual]) => expected === undefined || actual === expected);
}

function hitConfidence(hit: Hit): "high" | "medium" | "low" {
  const observed = hit.recipient?.observed ?? hit.gate?.observed ?? hit.point?.observed ?? [];
  const rank = { high: 0, medium: 1, low: 2 };
  let confidence: "high" | "medium" | "low" = "high";
  for (const item of observed) {
    if (rank[item.confidence] > rank[confidence]) confidence = item.confidence;
  }
  return confidence;
}

function findingId(ruleId: string, label: string): string {
  return `f_${ruleId}_${label}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

function sortFindings(findings: Finding[]): void {
  const order = ["settled", "arguable", "open"];
  findings.sort((a, b) => {
    const tier = order.indexOf(a.certainty) - order.indexOf(b.certainty);
    if (tier !== 0) return tier;
    return a.rule_id.localeCompare(b.rule_id);
  });
}

function observationsForScan(map: DataMap, scanId: string): Observation[] {
  const scan = map.scans.find((s) => s.id === scanId);
  const tagged: Array<{ seq: number; observation: Observation }> = [];
  const push = (seq: number, value: unknown) => {
    const observation = asObservation(value);
    if (observation) tagged.push({ seq, observation });
  };
  if (scan?.source.kind === "page") {
    const detail = scan.source.detail;
    const meta = detail.meta as { seq?: number; observation?: unknown } | undefined;
    const banner = detail.banner as { seq?: number; observation?: unknown } | undefined;
    if (meta?.observation) push(meta.seq ?? 0, meta.observation);
    if (banner?.observation) push(banner.seq ?? 0, banner.observation);
    const rest = detail.rest;
    if (Array.isArray(rest)) {
      for (const item of rest) {
        const held = item as { seq?: number; observation?: unknown };
        if (held?.observation) push(held.seq ?? 0, held.observation);
      }
    }
  }
  const take = (o: MapObservation) => {
    if (o.scan !== scanId) return;
    push(o.seq ?? 0, o.detail);
  };
  for (const dp of map.data_points) {
    for (const o of dp.observed) take(o);
    for (const r of dp.recipients) for (const o of r.observed) take(o);
  }
  for (const g of map.consent_gates) for (const o of g.observed) take(o);
  tagged.sort((a, b) => a.seq - b.seq);
  return tagged.map((t) => t.observation);
}

function asObservation(value: unknown): Observation | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (typeof (value as { type?: unknown }).type !== "string") return undefined;
  return value as Observation;
}
