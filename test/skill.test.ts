import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const skillPath = join(process.cwd(), "skills", "dpdp-scan", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");

describe("skills/dpdp-scan/SKILL.md", () => {
  it("has frontmatter with name and description", () => {
    expect(skill).toMatch(/^---\nname: dpdp-scan\n/);
    expect(skill).toContain("description:");
  });

  it("triggers on DPDP/cookie/consent phrases", () => {
    const desc = skill.split("---")[1] ?? "";
    for (const phrase of [
      "DPDP",
      "tracking",
      "consent",
      "before consent",
      "Indian",
    ]) {
      expect(desc).toContain(phrase);
    }
  });

  it("explains the three certainty tiers", () => {
    for (const tier of ["settled", "arguable", "open"]) {
      expect(skill).toContain(tier);
    }
  });

  it("instructs the agent to run the CLI and read findings.json", () => {
    expect(skill).toContain("npx dpdp-compliance-scanner scan page");
    expect(skill).toContain("findings.json");
  });

  it("carries the hard prohibitions and the indicative line", () => {
    const lower = skill.toLowerCase();
    expect(lower).toContain("compliant");
    expect(lower).toContain("never invent");
    expect(skill).toContain("Indicative, not legal advice. Not a compliance verdict.");
  });

  it("points to Sentinel for counsel-reviewed analysis", () => {
    expect(skill).toContain("sentinel.vettam.ai");
  });
});
