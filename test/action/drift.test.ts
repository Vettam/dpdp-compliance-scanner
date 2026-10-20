import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildComment } from "../../action/comment.mjs";
import { executeCode, type CodeArgs } from "../../src/cli/code.js";
import type { CliDeps } from "../../src/cli/execute.js";
import { executeDataMapDiff, type MapCommandDeps } from "../../src/cli/map.js";
import { parseDataMap, serializeDataMap } from "../../src/map/io.js";

const rulesDir = join(process.cwd(), "rules");
const vendorsDir = join(process.cwd(), "trackers");

function git(dir: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "dpdp test",
      GIT_AUTHOR_EMAIL: "dpdp@example.com",
      GIT_COMMITTER_NAME: "dpdp test",
      GIT_COMMITTER_EMAIL: "dpdp@example.com",
    },
  });
  if (result.status !== 0) throw new Error(`${args.join(" ")}\n${result.stderr}`);
  return result.stdout.trim();
}

function codeHarness(dir: string) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    stdout: { write: (s) => out.push(s) },
    stderr: { write: (s) => err.push(s) },
    exit: () => {},
    writeFile: (path, data) => writeFileSync(path, data),
    readFile: (path) => readFileSync(path, "utf8"),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    rulesDir,
    trackersDir: vendorsDir,
    mapPath: join(dir, ".dpdp", "data-map.yaml"),
  };
  return { out, err, deps };
}

function mapHarness(dir: string) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: MapCommandDeps = {
    stdout: { write: (s) => out.push(s) },
    stderr: { write: (s) => err.push(s) },
    exit: () => {},
    writeFile: (path, data) => writeFileSync(path, data),
    readFile: (path) => readFileSync(path, "utf8"),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    exists: existsSync,
    rulesDir,
    trackersDir: vendorsDir,
    mapPath: join(dir, ".dpdp", "data-map.yaml"),
    packageName: "dpdp-compliance-scanner",
    packageVersion: "2.0.0",
    cwd: dir,
  };
  return { out, err, deps };
}

function codeArgs(dir: string, over: Partial<CodeArgs> = {}): CodeArgs {
  return {
    path: dir,
    json: false,
    md: false,
    out: join(dir, "dpdp-scan", "code"),
    ci: true,
    failOn: "",
    noMap: false,
    ...over,
  };
}

describe("Action e2e: a pull request's data-map drift", () => {
  let dir: string;
  let baseSha: string;
  const outDir = () => join(dir, "dpdp-scan");

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "dpdp-drift-"));
    writeFileSync(join(dir, "pay.js"), 'fetch("https://api.razorpay.com/v1/orders");\n');
    git(dir, ["init", "-b", "main"]);
    const scan = codeHarness(dir);
    expect(await executeCode(codeArgs(dir, { ci: false }), scan.deps)).toBe(0);
    git(dir, ["add", "pay.js", ".dpdp"]);
    git(dir, ["-c", "commit.gpgsign=false", "commit", "-m", "map razorpay"]);
    baseSha = git(dir, ["rev-parse", "HEAD"]);
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("fails only when fail-on is unmapped, and the comment names the new recipient", async () => {
    writeFileSync(
      join(dir, "pay.js"),
      'fetch("https://api.razorpay.com/v1/orders");\nfetch("https://api.segment.io/v1/track");\n',
    );
    const open = codeHarness(dir);
    expect(await executeCode(codeArgs(dir, { failOn: "", noMap: true }), open.deps)).toBe(0);
    const settled = codeHarness(dir);
    expect(await executeCode(codeArgs(dir, { failOn: "settled", noMap: true }), settled.deps)).toBe(0);

    const blocked = codeHarness(dir);
    expect(await executeCode(codeArgs(dir, { failOn: "unmapped", noMap: true }), blocked.deps)).toBe(1);
    expect(blocked.err.join("")).toContain("segment");
    expect(blocked.err.join("")).toContain("--fail-on unmapped");

    const diff = mapHarness(dir);
    expect(
      await executeDataMapDiff(
        { from: baseSha, to: "HEAD", out: outDir(), json: false, md: true, ci: true, failOn: "" },
        diff.deps,
      ),
    ).toBe(0);
    const comment = buildComment({
      summary: "Scanned the repository with `dpdp scan code --ci`.",
      drift: readFileSync(join(outDir(), "datamap-diff.md"), "utf8"),
      findings: [readFileSync(join(outDir(), "code", "findings.md"), "utf8")],
    });
    expect(comment.indexOf("# Data map diff")).toBeLessThan(comment.indexOf("segment"));
    expect(comment).toContain("### ");
    expect(readFileSync(join(outDir(), "datamap-diff.md"), "utf8")).not.toContain("segment");
  });

  it("passes once the map that records the recipient is committed", async () => {
    const scan = codeHarness(dir);
    expect(await executeCode(codeArgs(dir, { failOn: "unmapped", ci: false }), scan.deps)).toBe(1);
    git(dir, ["add", "pay.js", ".dpdp"]);
    git(dir, ["-c", "commit.gpgsign=false", "commit", "-m", "record segment"]);

    const again = codeHarness(dir);
    expect(await executeCode(codeArgs(dir, { failOn: "unmapped" }), again.deps)).toBe(0);

    const report = mapHarness(dir);
    const reportCode = await executeDataMapDiff(
      { from: baseSha, to: "HEAD", out: outDir(), json: true, md: true, ci: true, failOn: "" },
      report.deps,
    );
    expect(reportCode).toBe(0);
    const drift = readFileSync(join(outDir(), "datamap-diff.md"), "utf8");
    expect(drift).toContain("segment");
    expect(existsSync(join(outDir(), "datamap-diff.json"))).toBe(true);

    const gated = mapHarness(dir);
    expect(
      await executeDataMapDiff(
        { from: baseSha, to: "HEAD", out: outDir(), json: false, md: false, ci: false, failOn: "unmapped" },
        gated.deps,
      ),
    ).toBe(1);
    const removed = mapHarness(dir);
    expect(
      await executeDataMapDiff(
        { from: "HEAD", to: baseSha, out: outDir(), json: false, md: false, ci: false, failOn: "unmapped" },
        removed.deps,
      ),
    ).toBe(0);
  });

  it("reports a rules_version change as catalogue drift and does not fail", async () => {
    const mapPath = join(dir, ".dpdp", "data-map.yaml");
    const map = parseDataMap(readFileSync(mapPath, "utf8"));
    const fromVersion = map.generated_by.rules_version;
    map.generated_by.rules_version = `${fromVersion}-next`;
    writeFileSync(mapPath, serializeDataMap(map));
    git(dir, ["add", ".dpdp"]);
    git(dir, ["-c", "commit.gpgsign=false", "commit", "-m", "bump rules"]);
    const parent = git(dir, ["rev-parse", "HEAD~1"]);

    for (const failOn of ["unmapped", "settled", ""]) {
      const diff = mapHarness(dir);
      const code = await executeDataMapDiff(
        { from: parent, to: "HEAD", out: outDir(), json: false, md: true, ci: true, failOn },
        diff.deps,
      );
      expect(code, failOn).toBe(0);
      expect(diff.out.join("")).toContain(`${fromVersion} → ${fromVersion}-next`);
    }
    const comment = buildComment({
      summary: "Scanned the repository with `dpdp scan code --ci`.",
      drift: readFileSync(join(outDir(), "datamap-diff.md"), "utf8"),
      findings: [],
    });
    expect(comment).toContain(`${fromVersion} → ${fromVersion}-next`);
    expect(comment).not.toContain("segment →");

    const dirty = readFileSync(mapPath, "utf8");
    writeFileSync(mapPath, dirty.replace(`${fromVersion}-next`, "9.9.9"));
    const same = mapHarness(dir);
    expect(
      await executeDataMapDiff(
        { from: "HEAD", to: "HEAD", out: outDir(), json: false, md: false, ci: false, failOn: "unmapped" },
        same.deps,
      ),
    ).toBe(0);
    expect(same.out.join("")).toContain("unchanged");
    writeFileSync(mapPath, dirty);

    const scan = codeHarness(dir);
    expect(await executeCode(codeArgs(dir, { failOn: "unmapped" }), scan.deps)).toBe(0);
  });

  it("exits 2 when the git ref has no data map", async () => {
    const missing = mapHarness(dir);
    const code = await executeDataMapDiff(
      { from: "HEAD", to: "not-a-ref", out: outDir(), json: false, md: false, ci: false, failOn: "" },
      missing.deps,
    );
    expect(code).toBe(2);
    expect(missing.err.join("")).toMatch(/not-a-ref|data-map/);
  });
});
