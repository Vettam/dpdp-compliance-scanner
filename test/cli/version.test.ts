import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { executeVersion } from "../../src/cli/version.js";

describe("executeVersion", () => {
  it("prints package, rules, and vendors versions", () => {
    const out: string[] = [];
    const code = executeVersion({
      stdout: { write: (s) => out.push(s) },
      name: "dpdp-compliance-scanner",
      version: "1.0.0",
      rulesDir: join(process.cwd(), "rules"),
      trackersDir: join(process.cwd(), "trackers"),
    });
    expect(code).toBe(0);
    const rules = readFileSync(join(process.cwd(), "rules", "VERSION"), "utf8").trim();
    const vendors = readFileSync(join(process.cwd(), "trackers", "VERSION"), "utf8").trim();
    expect(out.join("")).toBe(`dpdp-compliance-scanner 1.0.0\nrules ${rules}\nvendors ${vendors}\n`);
  });
});
