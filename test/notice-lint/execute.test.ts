import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyDataMap } from "../../src/map/io.js";
import type { DataMap } from "../../src/map/schema.js";
import { executeNoticeLint, type NoticeLintArgs, type NoticeLintDeps } from "../../src/notice-lint/execute.js";
import type { Tracker } from "../../src/trackers/schema.js";
import type { ScanResult } from "../../src/types.js";

const trackers: Tracker[] = [
  {
    id: "meta-pixel",
    vendor: "Meta Platforms",
    match: { hosts: ["www.facebook.com"], paths: ["/tr"] },
    data_points: ["browser_id"],
    category: "C6",
    flags: ["3PF", "XFER", "PRE"],
    role: "independent_or_joint_fiduciary",
    lawful_basis: "consent",
    provisions: ["s.6(1)", "s.9(3)"],
    notice_itemisation:
      "Browser identifier, ad-click identifier, IP address, device and browser details, pages visited and actions taken, and optionally a hashed email address, shared with Meta Platforms for ad measurement and targeting.",
    destination_countries: ["US"],
    fires_pre_consent_by_default: true,
    withdrawal_mechanism: "",
    last_verified: "2026-09-01",
    provenance: "direct observation",
  },
];

const scan: ScanResult = {
  schema_version: "1.0.0",
  engine_version: "0.1.0",
  rules_version: "0.2.0",
  trackers_version: "0.1.0",
  interpretation_as_of: "2026-09-17",
  scanned_at: "",
  target: { url: "https://acme.in", final_url: "", page_language: "en" },
  banner: { detected: true, confidence: "high" },
  inventory: {
    cookies: [],
    storage: [],
    third_party_hosts: [{ host: "www.facebook.com", tracker_id: "meta-pixel", category: "UNCLASSIFIED" as never, country: "US", first_seen_ms: 0, before_banner: true }],
    fingerprinting_apis: [],
    unclassified_hosts: [],
  },
  findings: [],
  questions: [],
  summary: { by_certainty: { settled: 0, arguable: 0, open: 0 }, third_parties: 0, third_parties_outside_india: 0, fired_before_banner: 0 },
  limits: [],
} as ScanResult;

function makeDeps(opts: { noticeText?: string; scanPath?: string } = {}): { deps: NoticeLintDeps; getOut: () => string; getErr: () => string; getExit: () => number; files: Map<string, string> } {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode = -1;
  const files = new Map<string, string>();
  const d: NoticeLintDeps = {
    stdout: { write: (s) => out.push(s) },
    stderr: { write: (s) => err.push(s) },
    exit: (c) => { exitCode = c; },
    writeFile: (p, data) => files.set(p, data),
    mkdir: () => {},
    loadNotice: async () => opts.noticeText ?? "We use Meta Platforms for ad measurement and targeting (browser identifier, IP address). You can withdraw consent. Grievance officer: g@acme.in. हिंदी सूचना।",
    loadScanResult: async () => (opts.scanPath ? scan : undefined),
    trackers,
  };
  return { deps: d, getOut: () => out.join(""), getErr: () => err.join(""), getExit: () => exitCode, files };
}

function args(over: Partial<NoticeLintArgs> = {}): NoticeLintArgs {
  return { notice: "https://acme.in/privacy", scan: undefined, json: false, out: "./notice-lint-out", ci: false, ...over };
}

describe("executeNoticeLint", () => {
  it("prints a terminal summary and exits 0 when all checks pass", async () => {
    const { deps, getOut } = makeDeps({ scanPath: "findings.json" });
    const code = await executeNoticeLint(args({ scan: "findings.json" }), deps);
    expect(code).toBe(0);
    expect(getOut()).toContain("passed");
    expect(getOut()).toContain("Indicative, not legal advice");
  });

  it("exits 2 when no notice source is given", async () => {
    const { deps, getErr } = makeDeps();
    const code = await executeNoticeLint(args({ notice: "" }), deps);
    expect(code).toBe(2);
    expect(getErr()).toContain("usage");
  });

  it("writes notice-lint.json in --ci or --json", async () => {
    const { deps, files } = makeDeps({ scanPath: "findings.json" });
    await executeNoticeLint(args({ json: true, out: "./out" }), deps);
    expect(files.has(require("node:path").join("./out", "notice-lint.json"))).toBe(true);
  });

  it("runs structural-only checks when no scan is provided", async () => {
    const { deps, getOut } = makeDeps();
    const code = await executeNoticeLint(args(), deps);
    expect(code).toBe(0);
    expect(getOut()).not.toContain("NL-100-");
  });

  it("itemises the data map when --scan is omitted", async () => {
    const { deps, getOut } = makeDeps({ noticeText: "We process orders. You can withdraw consent." });
    deps.loadDataMap = async () => mapWithPhone();
    const code = await executeNoticeLint(args(), deps);
    expect(code).toBe(0);
    expect(getOut()).toContain("NL-200-dp_users_phone");
    expect(getOut()).not.toContain("NL-100-");
  });

  it("keeps --scan on the page inventory when a data map is also available", async () => {
    const { deps, files } = makeDeps({ scanPath: "findings.json" });
    deps.loadDataMap = async () => mapWithPhone();
    await executeNoticeLint(args({ scan: "findings.json", json: true, out: "./out" }), deps);
    const written = JSON.parse(files.get(join("./out", "notice-lint.json")) ?? "{}") as { checks: Array<{ id: string }> };
    const ids = written.checks.map((check) => check.id);
    expect(ids.some((id) => id.startsWith("NL-100-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("NL-200-"))).toBe(false);
  });
});

function mapWithPhone(): DataMap {
  const map = emptyDataMap({
    package: "dpdp-compliance-scanner",
    version: "2.0.0",
    rules_version: "0.6.0",
    vendors_version: "1.0.0",
  });
  map.data_points.push({
    id: "dp_users_phone",
    name: "phone",
    category: "C8",
    flags: [],
    aliases: [],
    observed: [],
    recipients: [],
    consent_gate: null,
    purpose: "To contact the customer.",
    basis: "consent",
    retention: { stated: "", signals: [] },
    answers: {},
    notes: "",
    stale: false,
  });
  return map;
}
