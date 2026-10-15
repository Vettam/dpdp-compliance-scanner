import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadRules, readRulesVersion } from "../../src/rules/loader.js";

const rulesDir = join(process.cwd(), "rules");

describe("shipped rule catalogue", () => {
  it("loads every shipped rule without error", async () => {
    const rules = await loadRules(rulesDir);
    expect(rules.length).toBeGreaterThanOrEqual(9);
  });

  it("ships only settled, arguable, or open tier rules", async () => {
    const rules = await loadRules(rulesDir);
    for (const r of rules) {
      expect(["settled", "arguable", "open"]).toContain(r.certainty);
    }
  });

  it("every open-tier rule states the competing reading in its changelog", async () => {
    const rules = await loadRules(rulesDir);
    for (const r of rules.filter((r) => r.certainty === "open")) {
      expect(r.changelog.at(-1)?.note.length).toBeGreaterThan(0);
      expect(r.rationale_plain.length).toBeGreaterThan(0);
    }
  });

  it("every rule's rationale_dev explains the detection and the tier", async () => {
    const rules = await loadRules(rulesDir);
    for (const r of rules) {
      expect(r.rationale_dev.length).toBeGreaterThan(20);
    }
  });

  it("every rule's explainer_url matches the confirmed pattern", async () => {
    const rules = await loadRules(rulesDir);
    for (const r of rules) {
      expect(r.explainer_url).toBe(`https://sentinel.vettam.ai/rules/${r.id}`);
    }
  });

  it("every rule has a non-empty changelog and a since version", async () => {
    const rules = await loadRules(rulesDir);
    for (const r of rules) {
      expect(r.changelog.length).toBeGreaterThan(0);
      expect(r.since.length).toBeGreaterThan(0);
    }
  });

  it("has a VERSION file", () => {
    expect(readRulesVersion(rulesDir)).toBe("0.6.0");
  });

  it("every rule declares the sources it reads", async () => {
    const rules = await loadRules(rulesDir);
    for (const rule of rules) expect(rule.sources.length).toBeGreaterThan(0);
    expect(rules.find((rule) => rule.id === "DPDP-C-001")?.sources).toEqual(["page"]);
    expect(rules.find((rule) => rule.id === "DPDP-C-093")?.sources).toEqual(["page", "code"]);
    expect(rules.find((rule) => rule.id === "DPDP-C-094")?.sources).toEqual(["code"]);
  });

  it("rule ids are unique", async () => {
    const rules = await loadRules(rulesDir);
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
