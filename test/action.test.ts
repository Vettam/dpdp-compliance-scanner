import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const actionPath = join(process.cwd(), "action", "action.yml");
const actionText = readFileSync(actionPath, "utf8");
const action = parseYaml(actionText) as {
  name: string;
  description: string;
  inputs: Record<string, { required?: boolean; default?: unknown }>;
  outputs: Record<string, unknown>;
  runs: { using: string; steps: Array<Record<string, unknown>> };
};

describe("GitHub Action wrapper (action/action.yml)", () => {
  it("is a composite action named dpdp", () => {
    expect(action.name).toBe("dpdp");
    expect(action.runs.using).toBe("composite");
    expect(action.inputs.url?.required).toBe(true);
    expect(action.outputs["json-path"]).toBeDefined();
    expect(action.outputs["md-path"]).toBeDefined();
  });

  it("delegates scanning to the CLI in --ci mode", () => {
    expect(actionText).toContain("dpdp-compliance-scanner");
    expect(actionText).toContain("dpdp scan page");
    expect(actionText).toContain("--ci");
    expect(actionText).toContain("findings.json");
    expect(actionText).toContain("--fail-on");
    expect(action.inputs["fail-on"]?.default).toBe("");
    expect(action.inputs.interact?.default).toBe("false");
  });

  it("uploads the JSON artifact and posts findings.md on a pull_request", () => {
    expect(actionText).toContain("actions/upload-artifact@v4");
    expect(actionText).toContain("name: dpdp-scan");
    expect(actionText).toContain("github.event_name == 'pull_request'");
    expect(actionText).toContain("issues.createComment");
    expect(actionText).toContain("issues.updateComment");
    expect(actionText).toContain("<!-- dpdp-cookie-scan -->");
  });

  it("contains no interpretation logic of its own", () => {
    expect(actionText).not.toMatch(/certainty:\s*settled/);
    expect(actionText).not.toMatch(/mapScan/);
    expect(actionText).not.toMatch(/compliant/);
  });
});
