import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DataMap, DataPoint, MapObservation, Recipient } from "../../src/map/schema.js";
import { mapDataMap } from "../../src/mapper/data-map.js";
import { loadRules } from "../../src/rules/loader.js";
import type { Rule } from "../../src/rules/schema.js";
import type { Tracker } from "../../src/vendors/schema.js";

const rulesDir = join(process.cwd(), "rules");

function obs(kind: MapObservation["kind"], scan = "scan_code"): MapObservation {
  return { scan, kind, location: "a.ts:1", confidence: "high", detail: {} };
}

function recipient(over: Partial<Recipient> & { vendor: string }): Recipient {
  return {
    vendor: over.vendor,
    role: over.role ?? "processor",
    country: over.country ?? "US",
    observed: over.observed ?? [obs("http_call")],
  };
}

function point(over: Partial<DataPoint> & { id: string }): DataPoint {
  return {
    id: over.id,
    name: over.name ?? over.id,
    category: over.category ?? "C8",
    flags: over.flags ?? [],
    aliases: [],
    observed: over.observed ?? [obs("schema_column")],
    recipients: over.recipients ?? [],
    consent_gate: over.consent_gate === undefined ? null : over.consent_gate,
    purpose: "",
    basis: over.basis ?? "unstated",
    retention: over.retention ?? { stated: "", signals: [] },
    answers: {},
    notes: "",
    stale: false,
  };
}

function codeMap(points: DataPoint[], extra: Partial<DataMap> = {}): DataMap {
  return {
    schema_version: "1.0.0",
    repository: "",
    generated_by: { package: "t", version: "0", rules_version: "0.6.0", vendors_version: "1.0.0" },
    scans: [{ id: "scan_code", source: { kind: "code", path: ".", commit: "" }, scanned_at: "2026-10-15T00:00:00.000Z" }],
    data_points: points,
    consent_gates: [],
    rights_endpoints: [],
    questions: [],
    ...extra,
  };
}

function rule(where: Rule["detection"]["where"], match: Rule["detection"]["match"] = "data_point"): Rule {
  return {
    id: "DPDP-C-099",
    title: "predicate",
    certainty: "settled",
    enforceable_from: "2027-05-13",
    observable: true,
    provisions: ["s.8(7)"],
    flags: [],
    categories: [],
    owner: "counsel",
    sources: ["code"],
    penalty_band: "none",
    detection: { match, where },
    needs_input: [],
    rationale_plain: "plain",
    rationale_dev: "dev",
    remediation_summary: "",
    explainer_url: "https://sentinel.vettam.ai/rules/DPDP-C-099",
    since: "0.6.0",
    changelog: [],
  };
}

function matched(map: DataMap, where: Rule["detection"]["where"], match?: Rule["detection"]["match"], vendors: Tracker[] = []): boolean {
  return mapDataMap(map, [rule(where, match)], vendors).findings.length === 1;
}

const vendor = (id: string, notice: string): Tracker => ({
  id,
  vendor: id,
  match: { hosts: ["example.test"] },
  category: "C8",
  flags: [],
  role: "processor",
  lawful_basis: "consent",
  provisions: ["s.8(2)"],
  notice_itemisation: notice,
  destination_countries: ["US"],
  fires_pre_consent_by_default: false,
  withdrawal_mechanism: "",
  last_verified: "2026-10-15",
  provenance: "direct observation",
});

describe("map predicates", () => {
  const stored = point({ id: "dp_users_phone" });

  it("matches retention_stated only when the statement is empty or present as asked", () => {
    expect(matched(codeMap([stored]), { retention_stated: false })).toBe(true);
    expect(matched(codeMap([point({ id: "dp_users_phone", retention: { stated: "1 year", signals: [] } })]), { retention_stated: false })).toBe(false);
    expect(matched(codeMap([point({ id: "dp_users_phone", retention: { stated: "1 year", signals: [] } })]), { retention_stated: true })).toBe(true);
  });

  it("matches retention_signal_any from the signal list", () => {
    expect(matched(codeMap([stored]), { retention_signal_any: false })).toBe(true);
    const withSignal = point({
      id: "dp_users_phone",
      retention: { stated: "1 year", signals: [{ kind: "soft_delete_column", location: "schema.prisma:1" }] },
    });
    expect(matched(codeMap([withSignal]), { retention_signal_any: false, retention_stated: true })).toBe(false);
    expect(matched(codeMap([withSignal]), { retention_signal_any: true })).toBe(true);
  });

  it("matches category, flags_any, and basis_not on the point", () => {
    const flagged = point({ id: "dp_users_phone", category: "C8", flags: ["SENS"], basis: "consent" });
    expect(matched(codeMap([flagged]), { category: "C8" })).toBe(true);
    expect(matched(codeMap([flagged]), { category: "C9" })).toBe(false);
    expect(matched(codeMap([flagged]), { flags_any: ["SENS"] })).toBe(true);
    expect(matched(codeMap([flagged]), { flags_any: ["KIDS"] })).toBe(false);
    expect(matched(codeMap([flagged]), { basis_not: "unstated" })).toBe(true);
    expect(matched(codeMap([flagged]), { basis_not: "consent" })).toBe(false);
  });

  it("matches consent_gate_present and consent_gate_kind", () => {
    const gated = point({ id: "dp_vendor_segment", consent_gate: "cg_signup_checkbox" });
    const map = codeMap([gated], {
      consent_gates: [{ id: "cg_signup_checkbox", kind: "checkbox", observed: [obs("consent_gate")], text_excerpt: "I agree" }],
    });
    expect(matched(map, { consent_gate_present: false })).toBe(false);
    expect(matched(map, { consent_gate_present: true })).toBe(true);
    expect(matched(map, { consent_gate_kind: "checkbox" })).toBe(true);
    expect(matched(map, { consent_gate_kind: "banner" })).toBe(false);
  });

  it("matches recipient_role and recipient_country_not, and ignores an unknown country", () => {
    const map = codeMap([
      point({
        id: "dp_vendor_segment",
        recipients: [recipient({ vendor: "segment", role: "processor", country: "US" })],
      }),
    ]);
    expect(matched(map, { recipient_role: "processor" }, "recipient")).toBe(true);
    expect(matched(map, { recipient_role: "fiduciary" }, "recipient")).toBe(false);
    expect(matched(map, { recipient_country_not: "IN" }, "recipient")).toBe(true);
    expect(matched(map, { recipient_country_not: "US" }, "recipient")).toBe(false);
    const unknown = codeMap([
      point({ id: "dp_vendor_segment", recipients: [recipient({ vendor: "segment", country: "" })] }),
    ]);
    expect(matched(unknown, { recipient_country_not: "IN" }, "recipient")).toBe(false);
  });

  it("matches rights_endpoint_present against the map", () => {
    const map = codeMap([stored], { rights_endpoints: [{ right: "erase", observed: [obs("rights_endpoint")] }] });
    expect(matched(map, { rights_endpoint_present: { right: "access", present: false } }, "map")).toBe(true);
    expect(matched(map, { rights_endpoint_present: { right: "erase", present: false } }, "map")).toBe(false);
    expect(matched(map, { rights_endpoint_present: { right: "erase", present: true } }, "map")).toBe(true);
  });

  it("matches observation_kind and source_kind", () => {
    expect(matched(codeMap([stored]), { observation_kind: "schema_column" })).toBe(true);
    expect(matched(codeMap([stored]), { observation_kind: "package" })).toBe(false);
    expect(matched(codeMap([stored]), { source_kind: "code" })).toBe(true);
    expect(matched(codeMap([stored]), { source_kind: "page" })).toBe(false);
  });

  it("matches notice_itemisation from the vendor record", () => {
    const map = codeMap([
      point({ id: "dp_vendor_acme", recipients: [recipient({ vendor: "acme" })] }),
    ]);
    expect(matched(map, { notice_itemisation: false }, "recipient", [vendor("acme", "")])).toBe(true);
    expect(matched(map, { notice_itemisation: false }, "recipient", [vendor("acme", "A device id.")])).toBe(false);
  });

  it("matches mentions_grievance on consent-gate text", () => {
    const bare = codeMap([stored], {
      consent_gates: [{ id: "cg", kind: "checkbox", observed: [obs("consent_gate")], text_excerpt: "I agree" }],
    });
    const named = codeMap([stored], {
      consent_gates: [{ id: "cg", kind: "checkbox", observed: [obs("consent_gate")], text_excerpt: "Email the grievance officer" }],
    });
    expect(matched(bare, { mentions_grievance: false }, "map")).toBe(true);
    expect(matched(named, { mentions_grievance: false }, "map")).toBe(false);
    expect(matched(codeMap([]), { mentions_grievance: false }, "map")).toBe(false);
  });

  it("matches category_absent across the map", () => {
    const map = codeMap([point({ id: "dp_users_phone", basis: "consent" })]);
    expect(matched(map, { basis: "consent", category_absent: "C10" }, "map")).toBe(true);
    expect(matched(codeMap([point({ id: "dp_ledger", category: "C10", basis: "consent" })]), { category_absent: "C10" }, "map")).toBe(false);
  });

  it("applies C-004 to a code consent gate linked from a consent basis", async () => {
    const rules = await loadRules(rulesDir);
    const gate = { id: "cg_signup_checkbox", kind: "checkbox" as const, observed: [obs("consent_gate")], text_excerpt: "I agree" };
    const linked = codeMap(
      [point({ id: "dp_users_phone", basis: "consent", consent_gate: gate.id })],
      { consent_gates: [gate] },
    );
    const ids = mapDataMap(linked, rules, []).findings.map((finding) => finding.rule_id);
    expect(ids).toContain("DPDP-C-004");
    const unlinked = codeMap([point({ id: "dp_users_phone", basis: "unstated", consent_gate: gate.id })], { consent_gates: [gate] });
    expect(mapDataMap(unlinked, rules, []).findings.map((finding) => finding.rule_id)).not.toContain("DPDP-C-004");
  });
});
