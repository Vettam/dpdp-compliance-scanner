import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureEngine, scanPage } from "../../src/index.js";
import { deriveId } from "../../src/map/ids.js";
import { diffDataMaps } from "../../src/map/diff.js";
import { emptyDataMap, parseDataMap, saveDataMap, serializeDataMap } from "../../src/map/io.js";
import { mergeScan } from "../../src/map/merge.js";
import { mapDataMap } from "../../src/mapper/data-map.js";
import { loadRules } from "../../src/rules/loader.js";
import { loadTrackers } from "../../src/trackers/loader.js";
import type { Observation } from "../../src/types.js";
import { COOKIEYES_URL, cookieyesObservations } from "./cookieyes-fixture.js";

const rulesDir = join(process.cwd(), "rules");
const trackersDir = join(process.cwd(), "trackers");
const rules = await loadRules(rulesDir);
const vendors = await loadTrackers(trackersDir);

function engine(observations: Observation[]) {
  return new FixtureEngine(new Map([[COOKIEYES_URL, observations]]));
}

async function scanned(observations: Observation[]) {
  return scanPage(COOKIEYES_URL, {
    engine: engine(observations),
    rulesDir,
    trackersDir,
    interpretationAsOf: "2026-10-13",
  });
}

describe("DataMap 1.0.0 (slice 3)", () => {
  it("derives the stable ids from spec §4.5", () => {
    expect(deriveId({ kind: "column", table: "users", column: "phone" })).toBe("dp_users_phone");
    expect(deriveId({ kind: "cookie", name: "_ga" })).toBe("dp_cookie__ga");
    expect(deriveId({ kind: "input", form: "signup", field: "email" })).toBe("dp_input_signup_email");
    expect(deriveId({ kind: "vendor", id: "hotjar" })).toBe("dp_vendor_hotjar");
  });

  it("merges the CookieYes fixture twice into an identical map", async () => {
    const first = await scanned(cookieyesObservations());
    const second = await scanned(cookieyesObservations());
    const once = mergeScan(emptyDataMap(first.emitted.generated_by), first.emitted);
    const twice = mergeScan(once, second.emitted);
    expect(twice).toEqual(once);

    const dir = mkdtempSync(join(tmpdir(), "dpdp-map-"));
    try {
      const path = join(dir, "data-map.yaml");
      saveDataMap(path, once);
      const text = readFileSync(path, "utf8");
      saveDataMap(path, twice);
      expect(readFileSync(path, "utf8")).toBe(text);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a hand-edited purpose, and its comment, across a re-scan", async () => {
    const { emitted } = await scanned(cookieyesObservations());
    const once = mergeScan(emptyDataMap(emitted.generated_by), emitted);
    let yaml = serializeDataMap(once);
    expect(yaml).toContain('purpose: ""');
    yaml = yaml.replace('purpose: ""', 'purpose: "Session replay of the checkout." # counsel confirmed');
    const edited = parseDataMap(yaml);
    const { emitted: reduced } = await scanned(cookieyesObservations({ omitHost: "static.hotjar.com" }));
    const again = mergeScan(edited, reduced);
    const kept = again.data_points.find((d) => d.purpose === "Session replay of the checkout.");
    expect(kept).toBeTruthy();
    const saved = serializeDataMap(again, yaml);
    expect(saved).toContain("Session replay of the checkout.");
    expect(saved).toContain("# counsel confirmed");
  });

  it("honours an alias when a human renames a data point", async () => {
    const { emitted } = await scanned(cookieyesObservations());
    const once = mergeScan(emptyDataMap(emitted.generated_by), emitted);
    const cookie = once.data_points.find((d) => d.id.startsWith("dp_cookie_"));
    expect(cookie).toBeTruthy();
    const renamed = {
      ...once,
      data_points: once.data_points.map((d) =>
        d.id === cookie!.id ? { ...d, id: "dp_consent_cookie", aliases: [cookie!.id], purpose: "Consent choice" } : d,
      ),
    };
    const again = mergeScan(renamed, emitted);
    const point = again.data_points.find((d) => d.id === "dp_consent_cookie");
    expect(point?.purpose).toBe("Consent choice");
    expect(point?.aliases).toContain(cookie!.id);
    expect(again.data_points.find((d) => d.id === cookie!.id)).toBeUndefined();
    expect(point!.recipients.some((r) => r.observed.length > 0)).toBe(true);
  });

  it("marks a data point stale when the next scan does not see it", async () => {
    const full = await scanned(cookieyesObservations());
    const reduced = await scanned(cookieyesObservations({ omitHost: "static.hotjar.com" }));
    const once = mergeScan(emptyDataMap(full.emitted.generated_by), full.emitted);
    const again = mergeScan(once, reduced.emitted);
    expect(again.data_points.find((d) => d.id === "dp_vendor_hotjar")?.stale).toBe(true);
    expect(again.data_points.find((d) => d.id === "dp_vendor_cookieyes")?.stale).toBe(false);
    expect(again.data_points.find((d) => d.id === "dp_vendor_hotjar")).toBeTruthy();
  });

  it("reports a removed tracker as site drift and nothing as catalogue drift", async () => {
    const full = await scanned(cookieyesObservations());
    const reduced = await scanned(cookieyesObservations({ omitHost: "static.hotjar.com" }));
    const from = mergeScan(emptyDataMap(full.emitted.generated_by), full.emitted);
    const to = mergeScan(emptyDataMap(reduced.emitted.generated_by), reduced.emitted);
    const diff = diffDataMaps(from, to, (map) => mapDataMap(map, rules, vendors).findings);
    expect(diff.site.data_points_removed.map((d) => d.id)).toEqual(["dp_vendor_hotjar"]);
    expect(diff.site.data_points_added).toEqual([]);
    expect(diff.site.recipients_added).toEqual([]);
    expect(diff.site.recipients_removed).toEqual([]);
    expect(diff.site.consent_gates_added).toEqual([]);
    expect(diff.site.consent_gates_removed).toEqual([]);
    expect(diff.site.retention_signals_added).toEqual([]);
    expect(diff.site.retention_signals_removed).toEqual([]);
    expect(diff.catalogue_changed).toBe(false);
    expect(diff.catalogue.findings_added).toEqual([]);
    expect(diff.catalogue.findings_removed).toEqual([]);
    expect(diff.catalogue.findings_reclassified).toEqual([]);
  });

  it("records finding changes as catalogue drift when the rules version changes", async () => {
    const { emitted } = await scanned(cookieyesObservations());
    const from = mergeScan(emptyDataMap(emitted.generated_by), emitted);
    const to = { ...from, generated_by: { ...from.generated_by, rules_version: "9.9.9" } };
    const diff = diffDataMaps(from, to, (map) => {
      const findings = mapDataMap(map, rules, vendors).findings;
      return map.generated_by.rules_version === "9.9.9" ? findings.slice(1) : findings;
    });
    expect(diff.catalogue_changed).toBe(true);
    expect(diff.catalogue.findings_removed).toHaveLength(1);
    expect(diff.site.data_points_added).toEqual([]);
    expect(diff.site.data_points_removed).toEqual([]);
  });
});
