import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { execute, executeMapDiff, type CliArgs, type CliDeps } from "../../src/cli/execute.js";
import { FixtureEngine } from "../../src/engine/fixture.js";

const rulesDir = join(process.cwd(), "rules");
const trackersDir = join(process.cwd(), "trackers");

function makeDeps(): CliDeps {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode = -1;
  const files = new Map<string, string>();
  const deps: CliDeps = {
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    exit: (c: number) => {
      exitCode = c;
    },
    writeFile: (path: string, data: string) => files.set(path, data),
    readFile: (path: string) => {
      const data = files.get(path);
      if (data === undefined) throw new Error(`ENOENT: ${path}`);
      return data;
    },
    mkdir: (_p: string) => {},
    engine: new FixtureEngine(
      new Map<string, unknown[]>([
        [
          "https://staging.acme.in",
          [
            {
              type: "meta", timestamp_ms: 0, before_first_paint: true, before_banner_detected: true,
              url: "https://staging.acme.in", final_url: "https://staging.acme.in/",
              page_language: "en", title: "Acme", scan_started_at: "2026-09-17T09:12:00.000Z",
              engine_version: "0.1.0", rules_version: "0.1.0", trackers_version: "0.1.0",
              geo_source: "DB-IP Lite", geo_date: "2026-09-01",
            },
            {
              type: "request", timestamp_ms: 412, before_first_paint: true, before_banner_detected: true,
              method: "GET", host: "www.facebook.com", path: "/tr",
              initiator_host: "www.googletagmanager.com", resource_type: "image",
              is_third_party: true, destination_country: "US",
            },
            {
              type: "banner", timestamp_ms: 2000, before_first_paint: false, before_banner_detected: false,
              detected: true, has_accept: true, has_reject: false, has_settings: false,
              has_pre_ticked: false, has_language_switcher: false, mentions_legitimate_interest: false,
              implies_consent_by_browsing: false, text_excerpt: "", detection_confidence: "high",
            },
          ],
        ],
        [
          "https://clean.example",
          [
            {
              type: "meta", timestamp_ms: 0, before_first_paint: true, before_banner_detected: true,
              url: "https://clean.example", final_url: "https://clean.example/",
              page_language: "en", title: "Clean", scan_started_at: "2026-09-17T09:12:00.000Z",
              engine_version: "1.0.0", rules_version: "0.1.0", trackers_version: "0.1.0",
              geo_source: "DB-IP Lite", geo_date: "2026-09-01",
            },
          ],
        ],
        [
          "https://staging.acme.in#reject",
          [
            {
              type: "meta", timestamp_ms: 0, before_first_paint: true, before_banner_detected: true,
              url: "https://staging.acme.in", final_url: "https://staging.acme.in/",
              page_language: "en", title: "Acme", scan_started_at: "2026-09-17T09:12:00.000Z",
              engine_version: "1.0.0", rules_version: "0.1.0", trackers_version: "0.1.0",
              geo_source: "DB-IP Lite", geo_date: "2026-09-01",
            },
            {
              type: "banner", timestamp_ms: 2000, before_first_paint: false, before_banner_detected: false,
              detected: true, has_accept: true, has_reject: true, has_settings: false,
              has_pre_ticked: false, has_language_switcher: false, mentions_legitimate_interest: false,
              implies_consent_by_browsing: false, text_excerpt: "", detection_confidence: "high",
            },
          ],
        ],
        [
          "https://staging.acme.in#accept",
          [
            {
              type: "meta", timestamp_ms: 0, before_first_paint: true, before_banner_detected: true,
              url: "https://staging.acme.in", final_url: "https://staging.acme.in/",
              page_language: "en", title: "Acme", scan_started_at: "2026-09-17T09:12:00.000Z",
              engine_version: "1.0.0", rules_version: "0.1.0", trackers_version: "0.1.0",
              geo_source: "DB-IP Lite", geo_date: "2026-09-01",
            },
            {
              type: "request", timestamp_ms: 412, before_first_paint: true, before_banner_detected: true,
              method: "GET", host: "www.facebook.com", path: "/tr",
              initiator_host: "www.googletagmanager.com", resource_type: "image",
              is_third_party: true, destination_country: "US",
            },
            {
              type: "request", timestamp_ms: 4100, before_first_paint: false, before_banner_detected: false,
              method: "GET", host: "static.hotjar.com", path: "/c/hotjar.js",
              initiator_host: "www.googletagmanager.com", resource_type: "script",
              is_third_party: true, destination_country: "US",
            },
            {
              type: "banner", timestamp_ms: 2000, before_first_paint: false, before_banner_detected: false,
              detected: true, has_accept: true, has_reject: true, has_settings: false,
              has_pre_ticked: false, has_language_switcher: false, mentions_legitimate_interest: false,
              implies_consent_by_browsing: false, text_excerpt: "", detection_confidence: "high",
            },
          ],
        ],
      ]) as never,
    ),
    rulesDir,
    trackersDir,
  };
  return { deps, getOut: () => out.join(""), getErr: () => err.join(""), getExit: () => exitCode, getFiles: () => files };
}

function args(over: Partial<CliArgs> = {}): CliArgs {
  return {
    url: "https://staging.acme.in",
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

describe("execute", () => {
  it("prints the terminal report and exits 0 by default", async () => {
    const { deps, getOut } = makeDeps();
    const code = await execute(args(), deps);
    expect(code).toBe(0);
    expect(getOut()).toContain("SETTLED");
    expect(getOut()).toContain("staging.acme.in");
  });

  it("exits 2 on a usage error (no url)", async () => {
    const { deps, getErr } = makeDeps();
    const code = await execute(args({ url: "" }), deps);
    expect(code).toBe(2);
    expect(getErr()).toContain("usage");
  });

  it("writes findings.json and findings.md in --ci mode and exits 0", async () => {
    const { deps, getFiles } = makeDeps();
    const code = await execute(args({ ci: true, out: "./out" }), deps);
    expect(code).toBe(0);
    expect(getFiles().has(join("./out", "findings.json"))).toBe(true);
    expect(getFiles().has(join("./out", "findings.md"))).toBe(true);
  });

  it("writes findings.json when --json is set", async () => {
    const { deps, getFiles } = makeDeps();
    await execute(args({ json: true, out: "./out2" }), deps);
    expect(getFiles().has(join("./out2", "findings.json"))).toBe(true);
  });

  it("writes schema-valid ScanResult JSON (spec §7.3)", async () => {
    const { ScanResult } = await import("../../src/types.js");
    const { deps, getFiles } = makeDeps();
    await execute(args({ json: true, out: "./out-valid" }), deps);
    const parsed = ScanResult.safeParse(JSON.parse(getFiles().get(join("./out-valid", "findings.json"))!));
    expect(parsed.success).toBe(true);
  });

  it("prints the rules version and exits 0 when --rules-version is set", async () => {
    const { deps, getOut } = makeDeps();
    const code = await execute(args({ rulesVersion: true, url: "" }), deps);
    expect(code).toBe(0);
    expect(getOut()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("never prints rupee figures in terminal output", async () => {
    const { deps, getOut } = makeDeps();
    await execute(args(), deps);
    expect(getOut()).not.toMatch(/₹|crore/i);
  });

  it("passes a screenshot path to the engine when --screenshot is set", async () => {
    const { deps } = makeDeps();
    const inner = deps.engine!;
    let seenPath: string | undefined;
    deps.engine = {
      scan: async (url, options) => {
        seenPath = options?.screenshotPath;
        return inner.scan(url, options);
      },
    };
    const code = await execute(args({ screenshot: true, out: "./shot-out" }), deps);
    expect(code).toBe(0);
    expect(seenPath).toBe(join("./shot-out", "screenshot.png"));
  });

  it("exits 1 with --fail-on settled when settled findings exist, after writing --ci files", async () => {
    const { deps, getFiles, getErr } = makeDeps();
    const code = await execute(args({ ci: true, failOn: "settled", out: "./fail-out" }), deps);
    expect(code).toBe(1);
    expect(getFiles().has(join("./fail-out", "findings.json"))).toBe(true);
    expect(getErr()).toMatch(/settled finding/);
  });

  it("does not fail --fail-on settled when there are no settled findings", async () => {
    const { deps } = makeDeps();
    const code = await execute(args({ url: "https://clean.example", failOn: "settled" }), deps);
    expect(code).toBe(0);
  });

  it("rejects --fail-on values other than settled", async () => {
    const { deps, getErr } = makeDeps();
    const code = await execute(args({ failOn: "arguable" }), deps);
    expect(code).toBe(2);
    expect(getErr()).toContain("settled");
  });

  it("exits 3 when navigation fails (spec §8.1)", async () => {
    const { deps, getErr } = makeDeps();
    deps.engine = {
      scan: async () => {
        throw new Error("navigation failed: https://dead.invalid: net::ERR_NAME_NOT_RESOLVED");
      },
    };
    const code = await execute(args({ url: "https://dead.invalid" }), deps);
    expect(code).toBe(3);
    expect(getErr()).toMatch(/navigation failed|ERR_NAME_NOT_RESOLVED/);
  });

  it("runs three passes with --interact and compares findings", async () => {
    const { deps, getOut } = makeDeps();
    const inner = deps.engine!;
    const actions: Array<string | undefined> = [];
    deps.engine = {
      scan: async (url, options) => {
        actions.push(options?.bannerAction);
        return inner.scan(url, options);
      },
    };
    const code = await execute(args({ interact: true, json: true, out: "./interact-out" }), deps);
    expect(code).toBe(0);
    expect(actions).toEqual([undefined, "accept", "reject"]);
    expect(getOut()).toContain("INTERACTION");
    expect(getOut()).toContain("survived reject");
  });

  it("does not report an interaction comparison when accept/reject clicks missed", async () => {
    const { deps, getOut } = makeDeps();
    const code = await execute(args({ url: "https://clean.example", interact: true }), deps);
    expect(code).toBe(0);
    expect(getOut()).not.toContain("INTERACTION");
    expect(getOut()).not.toContain("survived reject");
  });

  it("diffs two ScanResults with map diff and writes diff.json", async () => {
    const { deps, getFiles, getOut } = makeDeps();
    await execute(args({ json: true, out: "./diff-a" }), deps);
    const a = getFiles().get(join("./diff-a", "findings.json"))!;
    await execute(args({ url: "https://clean.example", json: true, out: "./diff-b" }), deps);
    const b = getFiles().get(join("./diff-b", "findings.json"))!;
    getFiles().set("from.json", a);
    getFiles().set("to.json", b);
    const code = executeMapDiff(
      { diffFrom: "from.json", diffTo: "to.json", out: "./diff-out", json: false, ci: false },
      deps,
    );
    expect(code).toBe(0);
    expect(getFiles().has(join("./diff-out", "diff.json"))).toBe(true);
    expect(getOut()).toContain("SITE");
    expect(getOut()).toContain("CATALOGUE");
  });
});
