import { describe, expect, it } from "vitest";
import { RuleSchema, validateRule } from "../../src/rules/schema.js";

const validRule = {
  id: "DPDP-C-001",
  title: "Advertising tracker fires before any consent interaction",
  certainty: "settled",
  enforceable_from: "2027-05-13",
  observable: true,
  provisions: ["s.4(1)", "s.5(1)", "s.6(1)"],
  flags: ["PRE", "3PF"],
  categories: ["C6"],
  owner: "engineering",
  penalty_band: "consent_notice",
  detection: {
    match: "request",
    where: { tracker_category: "C6", before_banner_detected: true },
  },
  needs_input: [],
  rationale_plain: "Plain explanation.",
  rationale_dev: "Dev explanation.",
  remediation_summary: "Gate the tag behind consent.",
  explainer_url: "https://sentinel.vettam.ai/rules/DPDP-C-001",
  since: "0.1.0",
  changelog: [{ version: "0.1.0", date: "2026-09-15", note: "Initial rule." }],
};

describe("RuleSchema", () => {
  it("accepts a well-formed settled rule", () => {
    const result = RuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown certainty tier", () => {
    const r = validateRule({ ...validRule, certainty: "definitely" });
    expect(r.ok).toBe(false);
  });

  it("rejects an id that is not DPDP-C-NNN", () => {
    const r = validateRule({ ...validRule, id: "DPDP-001" });
    expect(r.ok).toBe(false);
  });

  it("rejects an empty provisions array (cite or don't claim)", () => {
    const r = validateRule({ ...validRule, provisions: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects missing rationale_plain", () => {
    const { rationale_plain: _omit, ...rest } = validRule;
    const r = validateRule(rest);
    expect(r.ok).toBe(false);
  });

  it("rejects missing explainer_url", () => {
    const { explainer_url: _omit, ...rest } = validRule;
    const r = validateRule(rest);
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown overlay flag", () => {
    const r = validateRule({ ...validRule, flags: ["PRE", "MADEUP"] });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown tracker category", () => {
    const r = validateRule({ ...validRule, categories: ["C99"] });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown owner", () => {
    const r = validateRule({ ...validRule, owner: "legal" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown detection match type", () => {
    const r = validateRule({
      ...validRule,
      detection: { match: "websocket", where: {} },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown condition key in where", () => {
    const r = validateRule({
      ...validRule,
      detection: { match: "request", where: { frobnicate: true } },
    });
    expect(r.ok).toBe(false);
  });

  it("accepts each map predicate from spec §6.1", () => {
    const predicates: Array<Record<string, unknown>> = [
      { source_kind: "code" },
      { category: "C8" },
      { category_absent: "C10" },
      { flags_any: ["PROC"] },
      { basis_not: "unstated" },
      { consent_gate_present: false },
      { consent_gate_kind: "checkbox" },
      { retention_stated: false },
      { retention_signal_any: false },
      { recipient_role: "processor" },
      { recipient_country_not: "IN" },
      { rights_endpoint_present: { right: "access", present: false } },
      { observation_kind: "schema_column" },
      { notice_itemisation: false },
      { mentions_grievance: false },
    ];
    for (const where of predicates) {
      const r = validateRule({
        ...validRule,
        sources: ["code"],
        detection: { match: "map", where },
      });
      expect(r.ok, JSON.stringify(where)).toBe(true);
    }
    for (const match of ["recipient", "consent_gate", "map"]) {
      const r = validateRule({
        ...validRule,
        detection: { match, where: { source_kind: "code" } },
      });
      expect(r.ok, match).toBe(true);
    }
  });

  it("accepts a data-point rule with basis and category_in", () => {
    const r = validateRule({
      ...validRule,
      id: "DPDP-C-093",
      detection: {
        match: "data_point",
        where: { basis: "voluntarily_provided", category_in: ["C5", "C6", "C9"] },
      },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a banner-matched rule with banner conditions", () => {
    const r = validateRule({
      ...validRule,
      id: "DPDP-C-004",
      detection: {
        match: "banner",
        where: { has_accept: true, has_reject: false },
      },
    });
    expect(r.ok).toBe(true);
  });

  it("validateRule returns the parsed rule on success", () => {
    const r = validateRule(validRule);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe("DPDP-C-001");
  });
});
