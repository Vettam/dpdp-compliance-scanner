import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { execute, type CliArgs, type CliDeps } from "../../src/cli/execute.js";
import { executeDataMapDiff, executeMapInit, executeMapQuestions, executeMapShow } from "../../src/cli/map.js";
import { FixtureEngine } from "../../src/engine/fixture.js";
import { DATA_MAP_FILENAME } from "../../src/map/io.js";
import { COOKIEYES_URL, cookieyesObservations } from "../map/cookieyes-fixture.js";

const rulesDir = join(process.cwd(), "rules");
const trackersDir = join(process.cwd(), "trackers");

function harness(mapPath = join(process.cwd(), DATA_MAP_FILENAME)) {
  const files = new Map<string, string>();
  const out: string[] = [];
  const err: string[] = [];
  const deps = {
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    exit: (_c: number) => {},
    writeFile: (path: string, data: string) => files.set(path, data),
    readFile: (path: string) => {
      const data = files.get(path);
      if (data === undefined) throw new Error(`ENOENT: ${path}`);
      return data;
    },
    mkdir: (_p: string) => {},
    exists: (path: string) => files.has(path),
    engine: new FixtureEngine(new Map([[COOKIEYES_URL, cookieyesObservations()]])),
    rulesDir,
    trackersDir,
    mapPath,
    packageName: "dpdp-compliance-scanner",
    packageVersion: "2.0.0",
  };
  return { deps, files, out: () => out.join(""), err: () => err.join("") };
}

function pageArgs(over: Partial<CliArgs> = {}): CliArgs {
  return {
    url: COOKIEYES_URL,
    json: false,
    md: false,
    out: "./dpdp-scan",
    ci: false,
    gpc: false,
    includeQuery: false,
    screenshot: false,
    timeout: 15000,
    settle: 3000,
    rulesVersion: false,
    browser: "",
    interact: false,
    failOn: "",
    ...over,
  };
}

describe("dpdp map", () => {
  it("writes a data map from scan page unless --no-map", async () => {
    const { deps, files } = harness();
    const code = await execute(pageArgs(), deps as CliDeps);
    expect(code).toBe(0);
    expect(files.has(deps.mapPath)).toBe(true);
    expect(files.get(deps.mapPath)).toContain("schema_version: 1.0.0");
    expect(files.get(deps.mapPath)).toContain("dp_vendor_hotjar");

    const skipped = harness();
    const skippedCode = await execute(pageArgs({ noMap: true }), skipped.deps as CliDeps);
    expect(skippedCode).toBe(0);
    expect(skipped.files.has(skipped.deps.mapPath)).toBe(false);
  });

  it("inits, shows, and lists questions", async () => {
    const { deps, out } = harness("/tmp/dpdp-map-test.yaml");
    expect(executeMapInit(deps)).toBe(0);
    expect(out()).toContain("/tmp/dpdp-map-test.yaml");
    expect(await executeMapShow({ json: false }, deps)).toBe(0);
    expect(out()).toContain("0 data points");
    expect(executeMapQuestions({ json: true }, deps)).toBe(0);
    expect(out()).toContain("[]");
  });

  it("diffs two data maps from the CLI", async () => {
    const full = harness("/tmp/dpdp-full.yaml");
    await execute(pageArgs(), full.deps as CliDeps);
    const reduced = harness("/tmp/dpdp-reduced.yaml");
    reduced.deps.engine = new FixtureEngine(
      new Map([[COOKIEYES_URL, cookieyesObservations({ omitHost: "static.hotjar.com" })]]),
    );
    await execute(pageArgs(), reduced.deps as CliDeps);

    const diff = harness("/tmp/unused.yaml");
    diff.files.set("/tmp/from.yaml", full.files.get(full.deps.mapPath)!);
    diff.files.set("/tmp/to.yaml", reduced.files.get(reduced.deps.mapPath)!);
    const code = await executeDataMapDiff(
      { from: "/tmp/from.yaml", to: "/tmp/to.yaml", out: "/tmp/out", json: false, md: true, ci: false, failOn: "" },
      diff.deps,
    );
    expect(code).toBe(0);
    expect(diff.out()).toContain("SITE");
    expect(diff.out()).toContain("CATALOGUE");
    expect(diff.out()).toContain("unchanged");
    expect(diff.files.get("/tmp/out/datamap-diff.md")).toContain("dp_vendor_hotjar");
  });
});
