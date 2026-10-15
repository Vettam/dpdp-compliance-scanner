import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { questionTexts, toExplainer, writeExplainers } from "../../src/explainers/build.js";
import { ExplainerSchema, explainerJsonSchema } from "../../src/explainers/schema.js";
import { loadRules, RuleLoadError } from "../../src/rules/loader.js";
import { EXPLAINER_URL_BASE } from "../../src/taxonomy.js";

const rulesDir = join(process.cwd(), "rules");
const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "dpdp-explainers-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("explainer builder", () => {
  it("every shipped rule has the fields the builder needs, and a matching explainer_url", async () => {
    const rules = await loadRules(rulesDir);
    expect(rules).toHaveLength(35);
    for (const rule of rules) {
      expect(rule.id).toMatch(/^DPDP-C-\d{3}$/);
      expect(rule.title.trim().length).toBeGreaterThan(0);
      expect(rule.rationale_plain.trim().length).toBeGreaterThan(0);
      expect(rule.rationale_dev.trim().length).toBeGreaterThan(0);
      expect(rule.provisions.length).toBeGreaterThan(0);
      expect(rule.enforceable_from.length).toBeGreaterThan(0);
      expect(rule.since.length).toBeGreaterThan(0);
      expect(rule.changelog.length).toBeGreaterThan(0);
      expect(typeof rule.observable).toBe("boolean");
      expect(Array.isArray(rule.needs_input)).toBe(true);
      expect(["settled", "arguable", "open"]).toContain(rule.certainty);
      expect(rule.explainer_url).toBe(EXPLAINER_URL_BASE + rule.id);
      ExplainerSchema.parse(toExplainer(rule, rules));
    }
  });

  it("fails when rationale_plain is removed from a rule", async () => {
    const broken = tempDir();
    const raw = parse(readFileSync(join(rulesDir, "DPDP-C-001.yaml"), "utf8")) as Record<
      string,
      unknown
    >;
    delete raw.rationale_plain;
    writeFileSync(join(broken, "DPDP-C-001.yaml"), stringify(raw));

    const error = await writeExplainers({ rulesDir: broken, outDir: tempDir() }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(RuleLoadError);
    const messages = (error as RuleLoadError).failures.map((failure) => failure.error).join("\n");
    expect(messages).toContain("rationale_plain");
  });

  it("writes one JSON file per rule that matches schema/explainer.schema.json", async () => {
    const committed = JSON.parse(
      readFileSync(join(process.cwd(), "schema/explainer.schema.json"), "utf8"),
    );
    expect(committed).toEqual(explainerJsonSchema());

    const outDir = tempDir();
    const files = await writeExplainers({ rulesDir, outDir });
    expect(files).toHaveLength(35);

    const rules = await loadRules(rulesDir);
    const required = [...(committed.required as string[])].sort();
    for (const file of files) {
      const doc = JSON.parse(readFileSync(file, "utf8")) as { id: string; questions: string[] };
      expect(ExplainerSchema.parse(doc)).toEqual(doc);
      expect(Object.keys(doc).sort()).toEqual(required);
      const rule = rules.find((candidate) => candidate.id === doc.id)!;
      expect(doc.questions).toEqual(questionTexts(rule));
    }
  });

  it("links rules that share a provision or a category, and records question text", async () => {
    const rules = await loadRules(rulesDir);
    const explainers = rules.map((rule) => toExplainer(rule, rules));
    const byId = new Map(explainers.map((explainer) => [explainer.id, explainer]));

    for (const explainer of explainers) {
      expect(explainer.related).not.toContain(explainer.id);
      expect([...explainer.related].sort()).toEqual(explainer.related);
      const self = rules.find((rule) => rule.id === explainer.id)!;
      for (const relatedId of explainer.related) {
        const other = rules.find((rule) => rule.id === relatedId)!;
        const sharesProvision = self.provisions.some((provision) =>
          other.provisions.includes(provision),
        );
        const sharesCategory = self.categories.some((category) =>
          other.categories.includes(category),
        );
        expect(sharesProvision || sharesCategory).toBe(true);
      }
    }

    expect(byId.get("DPDP-C-001")!.questions).toEqual([]);
    expect(byId.get("DPDP-C-001")!.related).toContain("DPDP-C-002");
    expect(byId.get("DPDP-C-040")!.questions).toEqual([
      "If this site is used by people under 18, then…",
    ]);
    expect(byId.get("DPDP-C-041")!.questions[0]).toMatch(/traffic data/);
    expect(byId.get("DPDP-C-001")!.tier).toBe("settled");
  });
});
