import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { scan, FixtureEngine } from "../src/index.js";
import { ScanResult } from "../src/types.js";

const rulesDir = join(process.cwd(), "rules");
const trackersDir = join(process.cwd(), "trackers");

function fixtureEngine() {
  const fixtures = new Map<string, unknown[]>([
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
  ]);
  return new FixtureEngine(fixtures as never);
}

describe("scan()", () => {
  it("returns a schema-valid ScanResult from fixture observations", async () => {
    const sr = await scan("https://staging.acme.in", {
      engine: fixtureEngine(),
      rulesDir,
      trackersDir,
      interpretationAsOf: "2026-09-15",
    });
    expect(ScanResult.safeParse(sr).success).toBe(true);
    expect(sr.target.url).toBe("https://staging.acme.in");
    expect(sr.findings.map((f) => f.rule_id)).toContain("DPDP-C-001");
    expect(sr.questions.map((q) => q.rule_id)).toContain("DPDP-C-040");
    expect(sr.rules_version).toBe("0.6.0");
    expect(sr.trackers_version).toBe("1.0.0");
    expect(sr.engine_version).toBe("1.0.0");
  });

  it("runs three independent passes when interact is set", async () => {
    const actions: Array<string | undefined> = [];
    const inner = fixtureEngine();
    const engine = {
      scan: async (url: string, options?: { bannerAction?: "accept" | "reject" }) => {
        actions.push(options?.bannerAction);
        return inner.scan(url, options);
      },
    };
    const sr = await scan("https://staging.acme.in", {
      engine,
      rulesDir,
      trackersDir,
      interpretationAsOf: "2026-09-15",
      interact: true,
    });
    expect(actions).toEqual([undefined, "accept", "reject"]);
    expect(sr.findings.map((f) => f.rule_id)).toContain("DPDP-C-001");
    // No distinct accept/reject fixtures → clicks missed; extra passes are load-only.
    expect(sr.interaction.performed).toBe(false);
    expect(sr.interaction.accept_clicked).toBe(false);
    expect(sr.interaction.reject_clicked).toBe(false);
    expect(sr.interaction.survived_reject).toHaveLength(0);
    expect(sr.limits.some((l) => /was not performed/.test(l))).toBe(true);
  });
});
