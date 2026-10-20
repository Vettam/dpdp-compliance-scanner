import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { buildComment, COMMENT_MARKER } from "../action/comment.mjs";

const actionPath = join(process.cwd(), "action", "action.yml");
const actionText = readFileSync(actionPath, "utf8");
const action = parseYaml(actionText) as {
  name: string;
  description: string;
  inputs: Record<string, { required?: boolean; default?: unknown }>;
  outputs: Record<string, unknown>;
  runs: { using: string; steps: Array<{ name?: string; run?: string }> };
};

describe("GitHub Action wrapper (action/action.yml)", () => {
  it("is a composite action named dpdp", () => {
    expect(action.name).toBe("dpdp");
    expect(action.runs.using).toBe("composite");
    expect(action.inputs.url?.required).toBe(false);
    expect(action.inputs.code?.default).toBe("false");
    expect(action.inputs["fail-on"]?.default).toBe("");
    expect(action.outputs["json-path"]).toBeDefined();
    expect(action.outputs["md-path"]).toBeDefined();
    expect(action.outputs["diff-path"]).toBeDefined();
  });

  it("delegates page, code, and map diff to the CLI in --ci mode", () => {
    expect(actionText).toContain("dpdp-compliance-scanner");
    expect(actionText).toContain("dpdp scan page");
    expect(actionText).toContain("dpdp scan code");
    expect(actionText).toContain("dpdp map diff --from");
    expect(actionText).toContain("--to HEAD");
    expect(actionText).toContain("--ci");
    expect(actionText).not.toContain("npx --yes");
    expect(actionText).not.toContain("github-actions[bot]");
    expect(actionText).toContain("::warning::dpdp map diff exited");
    expect(action.inputs.interact?.default).toBe("false");
  });

  it("uploads the map and diff, and posts drift above findings on a pull_request", () => {
    expect(actionText).toContain("actions/upload-artifact@v4");
    expect(actionText).toContain("name: dpdp-scan");
    expect(actionText).toContain(".dpdp/data-map.yaml");
    expect(actionText).toContain("datamap-diff.json");
    expect(actionText).toContain("github.event_name == 'pull_request'");
    expect(actionText).toContain("issues.createComment");
    expect(actionText).toContain("issues.updateComment");
    expect(actionText).toContain(COMMENT_MARKER);
    expect(actionText).toContain("buildComment");
    const comment = actionText.slice(actionText.indexOf("buildComment"));
    expect(comment.indexOf("datamap-diff.md")).toBeLessThan(comment.indexOf("findings.md"));
  });

  it("fails the job from scan exit codes, not from the drift report", () => {
    const diff = action.runs.steps.find((step) => step.name === "Diff the committed data map");
    const gate = action.runs.steps.find((step) => step.name === "Apply the fail-on gate");
    const code = action.runs.steps.find((step) => step.name === "Run dpdp scan code --ci");
    expect(code?.run).toContain("--fail-on");
    expect(diff?.run).not.toContain("--fail-on");
    expect(gate?.run).toContain("PAGE_EXIT");
    expect(gate?.run).toContain("CODE_EXIT");
    expect(gate?.run).not.toContain("DIFF");
  });

  it("contains no interpretation logic of its own", () => {
    expect(actionText).not.toMatch(/certainty:\s*settled/);
    expect(actionText).not.toMatch(/mapScan/);
    expect(actionText).not.toMatch(/compliant/);
  });
});

describe("pull request comment", () => {
  it("places the drift table above findings and keeps the marker", () => {
    const body = buildComment({
      summary: "Scanned the repository with `dpdp scan code --ci`.",
      drift: "# Data map diff\n\nCATALOGUE  unchanged",
      findings: ["# Code scan\n\n- segment (processor)"],
    });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body.indexOf("# Data map diff")).toBeLessThan(body.indexOf("segment"));
  });
});
