import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const contributing = readFileSync(join(process.cwd(), "CONTRIBUTING.md"), "utf8");
const rulesGuide = readFileSync(join(process.cwd(), "docs", "contributing-rules.md"), "utf8");

describe("contribution guides", () => {
  it("ships CONTRIBUTING.md as the public entry point", () => {
    expect(existsSync(join(process.cwd(), "CONTRIBUTING.md"))).toBe(true);
    expect(contributing).toMatch(/Vendors/);
    expect(contributing).toMatch(/rules\//);
    expect(contributing).toMatch(/changeset/i);
    expect(contributing).toMatch(/Indian vendors/);
    expect(contributing).toMatch(/No outbound network/i);
    expect(contributing).toContain("docs/contributing-rules.md");
    expect(contributing).toContain("docs/legal-sources/");
    expect(contributing).toMatch(/dod\.html/);
  });

  it("keeps the legal-content review bar in docs/contributing-rules.md", () => {
    expect(rulesGuide).toMatch(/cannot be tiered `settled`/);
    expect(rulesGuide).toMatch(/legal content/);
    expect(rulesGuide).toMatch(/provenance/);
    expect(rulesGuide).toContain("CONTRIBUTING.md");
    expect(rulesGuide).toMatch(/docs\/legal-sources/);
    expect(rulesGuide).toMatch(/G\.S\.R\. 846\(E\)/);
  });
});
