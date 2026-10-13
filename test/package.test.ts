import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as {
  name: string;
  version: string;
  bin: Record<string, string>;
  scripts: Record<string, string>;
};
const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
const actionReadme = readFileSync(join(process.cwd(), "action", "README.md"), "utf8");
const skill = readFileSync(join(process.cwd(), "skills", "dpdp-scan", "SKILL.md"), "utf8");

const NPX_SCAN = "npx dpdp-compliance-scanner scan page";

describe("npx install contract", () => {
  it("publishes one bin whose package name npx can run", () => {
    expect(pkg.name).toBe("dpdp-compliance-scanner");
    expect(pkg.bin).toEqual({ dpdp: "./dist/cli.js" });
  });

  it("keeps the npm release script off the publish lifecycle name", () => {
    expect(pkg.scripts.publish).toBeUndefined();
    expect(pkg.scripts.release).toContain("changeset publish");
  });

  it("documents the install line in the public READMEs and skill", () => {
    expect(readme).toContain(NPX_SCAN);
    expect(readme).toContain("npx dpdp-compliance-scanner notice lint");
    expect(actionReadme).toContain(NPX_SCAN);
    expect(actionReadme).toContain("@v2");
    expect(skill).toContain(NPX_SCAN);
  });

  it("is version 2.0.0 or newer", () => {
    const major = Number(pkg.version.split(".")[0]);
    expect(major).toBeGreaterThanOrEqual(2);
  });
});
