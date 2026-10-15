import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureEngine, scanPage } from "../../src/index.js";
import { emptyDataMap, parseDataMap, serializeDataMap } from "../../src/map/io.js";
import { mergeScan } from "../../src/map/merge.js";
import { mapDataMap } from "../../src/mapper/data-map.js";
import { loadRules } from "../../src/rules/loader.js";
import { loadTrackers } from "../../src/trackers/loader.js";
import type { Observation } from "../../src/types.js";
import { COOKIEYES_URL, cookieyesObservations } from "../map/cookieyes-fixture.js";

const rulesDir = join(process.cwd(), "rules");
const trackersDir = join(process.cwd(), "trackers");
const rules = await loadRules(rulesDir);
const vendors = await loadTrackers(trackersDir);

const meta = (url: string): Observation => ({
  type: "meta",
  timestamp_ms: 0,
  before_first_paint: true,
  before_banner_detected: true,
  url,
  final_url: `${url}/`,
  page_language: "en",
  title: "Fixture",
  scan_started_at: "2026-10-13T09:00:00.000Z",
  engine_version: "1.0.0",
  rules_version: "0.4.0",
  trackers_version: "0.3.0",
  geo_source: "",
  geo_date: "",
});

const fixtures: Array<{ name: string; url: string; observations: Observation[] }> = [
  { name: "cookieyes", url: COOKIEYES_URL, observations: cookieyesObservations() },
  {
    name: "acme",
    url: "https://staging.acme.in",
    observations: [
      meta("https://staging.acme.in"),
      {
        type: "request",
        timestamp_ms: 412,
        before_first_paint: true,
        before_banner_detected: true,
        method: "GET",
        host: "www.facebook.com",
        path: "/tr",
        initiator_host: "www.googletagmanager.com",
        resource_type: "image",
        is_third_party: true,
        destination_country: "US",
      },
      {
        type: "banner",
        timestamp_ms: 2000,
        before_first_paint: false,
        before_banner_detected: false,
        detected: true,
        has_accept: true,
        has_reject: false,
        has_settings: false,
        has_pre_ticked: false,
        has_language_switcher: false,
        mentions_legitimate_interest: false,
        implies_consent_by_browsing: false,
        text_excerpt: "",
        detection_confidence: "high",
        notice_url: "",
      },
    ],
  },
  { name: "clean", url: "https://clean.example", observations: [meta("https://clean.example")] },
  {
    name: "mixed",
    url: "https://mixed.example",
    observations: [
      meta("https://mixed.example"),
      {
        type: "storage",
        timestamp_ms: 10,
        before_first_paint: false,
        before_banner_detected: true,
        kind: "local",
        key: "hjSessionUser",
        first_party: true,
      },
      {
        type: "api_call",
        timestamp_ms: 20,
        before_first_paint: false,
        before_banner_detected: true,
        api: "canvas.toDataURL",
      },
      {
        type: "api_call",
        timestamp_ms: 21,
        before_first_paint: false,
        before_banner_detected: true,
        api: "canvas.getContext:2d",
      },
      {
        type: "request",
        timestamp_ms: 30,
        before_first_paint: false,
        before_banner_detected: true,
        method: "GET",
        host: "unknown.example",
        path: "/",
        initiator_host: "",
        resource_type: "script",
        is_third_party: true,
        destination_country: "",
      },
      {
        type: "request",
        timestamp_ms: 31,
        before_first_paint: false,
        before_banner_detected: true,
        method: "GET",
        host: "mixed.example",
        path: "/app.js",
        initiator_host: "",
        resource_type: "script",
        is_third_party: false,
        destination_country: "",
      },
      {
        type: "embed",
        timestamp_ms: 40,
        before_first_paint: false,
        before_banner_detected: true,
        host: "fonts.gstatic.com",
        kind: "font",
        sri: false,
        is_third_party: true,
      },
      {
        type: "banner",
        timestamp_ms: 50,
        before_first_paint: false,
        before_banner_detected: false,
        detected: false,
        has_accept: false,
        has_reject: false,
        has_settings: false,
        has_pre_ticked: false,
        has_language_switcher: false,
        mentions_legitimate_interest: false,
        implies_consent_by_browsing: false,
        text_excerpt: "",
        detection_confidence: "low",
        notice_url: "",
      },
    ],
  },
];

describe("mapDataMap consistency", () => {
  it.each(fixtures)("re-derives page findings for $name", async ({ name, url, observations }) => {
    const { result, emitted } = await scanPage(url, {
      engine: new FixtureEngine(new Map([[url, observations]])),
      rulesDir,
      trackersDir,
      interpretationAsOf: "2026-10-13",
    });
    const map = mergeScan(emptyDataMap(emitted.generated_by), emitted);
    expect(mapDataMap(map, rules, vendors).findings).toEqual(result.findings);
    const loaded = parseDataMap(serializeDataMap(map));
    expect(mapDataMap(loaded, rules, vendors).findings).toEqual(result.findings);
    if (name === "mixed") {
      expect(map.data_points.some((d) => d.id === "dp_host_mixed_example")).toBe(false);
      expect(map.data_points.some((d) => d.id === "dp_host_unknown_example")).toBe(true);
    }
  });
});
