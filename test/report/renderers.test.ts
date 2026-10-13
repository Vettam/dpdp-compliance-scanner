import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mapScan } from "../../src/mapper/index.js";
import { TrackerIndex } from "../../src/trackers/matcher.js";
import { loadRules } from "../../src/rules/loader.js";
import { loadTrackers } from "../../src/trackers/loader.js";
import { renderTerminal } from "../../src/report/terminal.js";
import { renderJson } from "../../src/report/json.js";
import { renderMarkdown } from "../../src/report/markdown.js";
import { ScanResult } from "../../src/types.js";

const rules = await loadRules(join(process.cwd(), "rules"));
const trackers = await loadTrackers(join(process.cwd(), "trackers"));
const index = new TrackerIndex(trackers);

function fixtureScan() {
  const obs = [
    {
      type: "meta" as const, timestamp_ms: 0, before_first_paint: true, before_banner_detected: true,
      url: "https://staging.acme.in", final_url: "https://staging.acme.in/",
      page_language: "en", title: "Acme", scan_started_at: "2026-09-17T09:12:00.000Z",
      engine_version: "0.1.0", rules_version: "0.1.0", trackers_version: "0.1.0",
      geo_source: "DB-IP Lite", geo_date: "2026-09-01",
    },
    {
      type: "request" as const, timestamp_ms: 412, before_first_paint: true, before_banner_detected: true,
      method: "GET", host: "www.facebook.com", path: "/tr",
      initiator_host: "www.googletagmanager.com", resource_type: "image",
      is_third_party: true, destination_country: "US",
    },
    {
      type: "request" as const, timestamp_ms: 500, before_first_paint: true, before_banner_detected: true,
      method: "GET", host: "static.hotjar.com", path: "/c/hotjar.js",
      initiator_host: "www.googletagmanager.com", resource_type: "script",
      is_third_party: true, destination_country: "US",
    },
    {
      type: "banner" as const, timestamp_ms: 2000, before_first_paint: false, before_banner_detected: false,
      detected: true, has_accept: true, has_reject: false, has_settings: false,
      has_pre_ticked: false, has_language_switcher: false, mentions_legitimate_interest: false,
      implies_consent_by_browsing: false, text_excerpt: "", detection_confidence: "high" as const,
    },
  ];
  return mapScan({
    observations: obs as never,
    rules,
    trackers: index,
    engineVersion: "0.1.0",
    rulesVersion: "0.1.0",
    trackersVersion: "0.1.0",
    interpretationAsOf: "2026-09-15",
  });
}

describe("renderers", () => {
  it("terminal output matches snapshot and contains no rupee figures", async () => {
    const sr = fixtureScan();
    const out = renderTerminal(sr, { color: false });
    expect(out).not.toMatch(/₹|rupee|crore/i);
    expect(out).toContain("SETTLED");
    expect(out).toContain("How sure the law is");
    expect(out).toContain("Applying them needs no interpretation");
    expect(out).toContain("QUESTIONS ON THE LAW");
    expect(out).toContain("keep for later");
    expect(out).toContain("SAME VENDOR, DIFFERENT QUESTIONS");
    expect(out).toContain("Save this report as a markdown file by running:");
    expect(out).toContain("dpdp scan page https://staging.acme.in --md");
    expect(out).toContain("./dpdp-scan/findings.md");
    expect(out).toContain("https://sentinel.vettam.ai/rules/<id>");
    await expect(out).toMatchFileSnapshot(snapshotPath("terminal.txt"));
  });

  it("json output is valid ScanResult and matches snapshot", async () => {
    const sr = fixtureScan();
    const out = renderJson(sr);
    expect(ScanResult.safeParse(JSON.parse(out)).success).toBe(true);
    await expect(out).toMatchFileSnapshot(snapshotPath("scanresult.json"));
  });

  it("markdown output matches snapshot and has collapsible blocks", async () => {
    const sr = fixtureScan();
    const out = renderMarkdown(sr);
    expect(out).toContain("<details>");
    expect(out).toContain("## How sure the law is");
    expect(out).toContain("## QUESTIONS ON THE LAW");
    expect(out).toContain("## SAME VENDOR, DIFFERENT QUESTIONS");
    await expect(out).toMatchFileSnapshot(snapshotPath("findings.md"));
  });

  it("terminal and markdown display finding detection_confidence", () => {
    const sr = fixtureScan();
    const c004 = sr.findings.find((f) => f.rule_id === "DPDP-C-004")!;
    const term = renderTerminal(sr, { color: false });
    expect(term).toMatch(new RegExp(`${c004.rule_id}.*\\[${c004.detection_confidence}\\]`));
    const md = renderMarkdown(sr);
    expect(md).toMatch(/Detection confidence:\*\* high/);
  });

  it("renders C-040 as the specified under-18 conditional", () => {
    const sr = fixtureScan();
    const term = renderTerminal(sr, { color: false });
    expect(term).toContain("If this site is used by people under 18, then");
    expect(term).not.toContain("Does this site reach people under 18?");
    const md = renderMarkdown(sr);
    expect(md).toMatch(/### DPDP-C-040 — If this site is used by people under 18, then/);
  });

  it("schema-validates JSON at write time", () => {
    const sr = fixtureScan();
    expect(ScanResult.parse(JSON.parse(renderJson(sr))).schema_version).toBe("1.0.0");
    expect(() => renderJson({} as never)).toThrow();
  });

  it("markdown points at dpdp notice lint and prints a captured notice URL", () => {
    const sr = fixtureScan();
    sr.banner.notice_url = "https://staging.acme.in/privacy";
    const md = renderMarkdown(sr);
    expect(md).toContain("dpdp notice lint");
    expect(md).toContain("https://staging.acme.in/privacy");
  });
});

function snapshotPath(name: string): string {
  return join(import.meta.dirname, "__snapshots__", name);
}
