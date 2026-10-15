import { describe, expect, it } from "vitest";
import { hasSettledFindings, parseFailOn } from "../../src/cli/fail-on.js";
import type { Finding, Question, ScanResult } from "../../src/types.js";

function sr(over: { findings?: Finding[]; questions?: Question[] }): ScanResult {
  return {
    schema_version: "1.0.0",
    engine_version: "1.0.0",
    rules_version: "0.3.1",
    trackers_version: "0.2.0",
    interpretation_as_of: "2026-09-15",
    scanned_at: "2026-09-17T09:12:00.000Z",
    target: { url: "https://staging.acme.in", final_url: "", page_language: "en" },
    banner: { detected: false, confidence: "medium" },
    inventory: {
      cookies: [],
      storage: [],
      third_party_hosts: [],
      fingerprinting_apis: [],
      unclassified_hosts: [],
    },
    findings: over.findings ?? [],
    questions: over.questions ?? [],
    summary: {
      by_certainty: { settled: 0, arguable: 0, open: 0 },
      third_parties: 0,
      third_parties_outside_india: 0,
      fired_before_banner: 0,
    },
    limits: [],
    interaction: {
      performed: false,
      accept_clicked: false,
      reject_clicked: false,
      accept_findings: 0,
      reject_findings: 0,
      survived_reject: [],
      cleared_on_reject: [],
      appeared_on_accept: [],
    },
  };
}

const settledFinding = {
  id: "f1",
  rule_id: "DPDP-C-001",
  title: "t",
  certainty: "settled" as const,
  enforceable_from: "2027-05-13",
  observable: true,
  detection_confidence: "high" as const,
  provisions: ["s.6(1)"],
  flags: [] as const,
  owner: "engineering" as const,
  tracker: null,
  attributed_to: "host",
  evidence: [],
  rationale_plain: "p",
  rationale_dev: "d",
  remediation_summary: "",
  explainer_url: "https://sentinel.vettam.ai/rules/DPDP-C-001",
  needs_input: [],
};

const arguableFinding = { ...settledFinding, id: "f2", rule_id: "DPDP-C-010", certainty: "arguable" as const };
const openFinding = { ...settledFinding, id: "f3", rule_id: "DPDP-C-020", certainty: "open" as const };

const settledQuestion: Question = {
  rule_id: "DPDP-C-040",
  title: "minors",
  prompt: "Does this site reach under-18s?",
  certainty: "settled",
  enforceable_from: "2027-05-13",
  provisions: ["s.9(3)"],
  flags: ["KIDS"],
  owner: "counsel",
  needs_input: ["reaches_minors"],
  fact_needed: "reaches_minors",
  consequence_if_true: "C5/C6 tags are prohibited for under-18s regardless of consent.",
  rationale_plain: "p",
  explainer_url: "https://sentinel.vettam.ai/rules/DPDP-C-040",
};

describe("parseFailOn", () => {
  it("accepts only settled on a page scan", () => {
    expect(parseFailOn("")).toBe("");
    expect(parseFailOn("none")).toBe("");
    expect(parseFailOn("settled")).toBe("settled");
    expect(parseFailOn("SETTLED")).toBe("settled");
    expect(parseFailOn("unmapped")).toBe("invalid");
    expect(parseFailOn("arguable")).toBe("invalid");
    expect(parseFailOn("open")).toBe("invalid");
    expect(parseFailOn("all")).toBe("invalid");
  });

  it("accepts unmapped for scan code and map diff", () => {
    expect(parseFailOn("unmapped", true)).toBe("unmapped");
    expect(parseFailOn("UNMAPPED", true)).toBe("unmapped");
    expect(parseFailOn("settled", true)).toBe("settled");
    expect(parseFailOn("arguable", true)).toBe("invalid");
  });
});

describe("hasSettledFindings", () => {
  it("is true only for settled findings, never for arguable, open, or questions", () => {
    expect(hasSettledFindings(sr({ findings: [settledFinding] }))).toBe(true);
    expect(hasSettledFindings(sr({ findings: [arguableFinding, openFinding] }))).toBe(false);
    expect(hasSettledFindings(sr({ findings: [], questions: [settledQuestion] }))).toBe(false);
  });
});
