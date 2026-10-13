import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { executeExplain } from "../../src/cli/explain.js";

const rulesDir = join(process.cwd(), "rules");

function makeDeps() {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode = -1;
  return {
    deps: {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      exit: (c: number) => {
        exitCode = c;
      },
      rulesDir,
    },
    getOut: () => out.join(""),
    getErr: () => err.join(""),
    getExit: () => exitCode,
  };
}

describe("executeExplain", () => {
  it("renders one rule and ends with its explainer URL", async () => {
    const { deps, getOut } = makeDeps();
    const code = await executeExplain("DPDP-C-001", deps);
    expect(code).toBe(0);
    const text = getOut().trimEnd();
    expect(text.endsWith("https://sentinel.vettam.ai/rules/DPDP-C-001")).toBe(true);
    expect(text).toContain("Advertising tracker fires before any consent interaction");
    expect(text).toContain("settled");
  });

  it("exits 2 for an unknown rule", async () => {
    const { deps, getErr, getExit } = makeDeps();
    const code = await executeExplain("DPDP-C-999", deps);
    expect(code).toBe(2);
    expect(getExit()).toBe(2);
    expect(getErr()).toContain("unknown rule");
  });
});
