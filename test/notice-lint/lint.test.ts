import { describe, expect, it } from "vitest";
import { lintNotice } from "../../src/notice-lint/index.js";
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
  {
    id: "hotjar",
    vendor: "Hotjar",
    match: { hosts: ["static.hotjar.com"] },
    data_points: ["session_replay"],
    category: "C5",
    flags: ["3PF", "PRE"],
    role: "processor",
    lawful_basis: "consent",
    provisions: ["s.6(1)"],
    notice_itemisation:
      "Session recordings, heatmaps, click and move data, and device details, shared with Hotjar for behavioural analytics.",
    destination_countries: ["US"],
    fires_pre_consent_by_default: true,
    withdrawal_mechanism: "",
    last_verified: "2026-09-01",
    provenance: "direct observation",
  },
];

function scanWith(trackersIds: string[]): ScanResult {
  return {
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
      third_party_hosts: trackersIds.map((id) => ({
        host: id + ".example",
        tracker_id: id,
        category: "UNCLASSIFIED" as never,
        country: "US",
        first_seen_ms: 0,
        before_banner: true,
      })),
      fingerprinting_apis: [],
      unclassified_hosts: [],
    },
    findings: [],
    questions: [],
    summary: { by_certainty: { settled: 0, arguable: 0, open: 0 }, third_parties: 0, third_parties_outside_india: 0, fired_before_banner: 0 },
    limits: [],
  } as ScanResult;
}

describe("lintNotice", () => {
  it("passes withdrawal, grievance, bilingual, and itemisation when the notice covers everything", () => {
    const notice = [
      "Privacy Notice",
      "We use Meta Platforms for ad measurement and targeting: a browser identifier, ad-click identifier,",
      "IP address, device and browser details, pages visited and actions taken, and optionally a hashed email address.",
      "We use Hotjar for behavioural analytics: session recordings, heatmaps, click and move data, and device details.",
      "You may withdraw consent at any time by clicking the withdraw button below.",
      "Our Grievance Officer can be reached at grievance@acme.in for complaints.",
      "You can complain to the Data Protection Board.",
      "यह सूचना हिंदी में भी उपलब्ध है।",
    ].join("\n");
    const r = lintNotice({ noticeText: notice, noticeUrl: "https://acme.in/privacy", scanResult: scanWith(["meta-pixel", "hotjar"]), trackers });
    const failed = r.checks.filter((c) => c.status === "fail").map((c) => c.id);
    expect(failed).toEqual([]);
    expect(r.summary.failed).toBe(0);
  });

  it("fails the withdrawal check when the notice never mentions withdrawal", () => {
    const notice = "We use cookies. Grievance Officer: grievance@acme.in. हिंदी सूचना। We use Meta Platforms and Hotjar for ads and analytics (browser identifier, session recordings, heatmaps, click and move data, device details, IP address, pages visited).";
    const r = lintNotice({ noticeText: notice, scanResult: scanWith(["meta-pixel", "hotjar"]), trackers });
    const w = r.checks.find((c) => c.id === "NL-001")!;
    expect(w.status).toBe("fail");
    expect(w.provisions).toContain("s.6(4)");
  });

  it("fails the grievance check when no grievance/complaint officer is named", () => {
    const notice = "We use cookies. You can withdraw consent here. हिंदी सूचना। We use Meta Platforms and Hotjar for ads and analytics (browser identifier, session recordings, heatmaps, device details, IP address, pages visited).";
    const r = lintNotice({ noticeText: notice, scanResult: scanWith(["meta-pixel", "hotjar"]), trackers });
    const g = r.checks.find((c) => c.id === "NL-002")!;
    expect(g.status).toBe("fail");
  });

  it("fails the bilingual check when the notice is English-only", () => {
    const notice = "We use cookies. You can withdraw consent here. Grievance Officer: grievance@acme.in. We use Meta Platforms and Hotjar for ads and analytics (browser identifier, session recordings, heatmaps, device details, IP address, pages visited).";
    const r = lintNotice({ noticeText: notice, scanResult: scanWith(["meta-pixel", "hotjar"]), trackers });
    const b = r.checks.find((c) => c.id === "NL-003")!;
    expect(b.status).toBe("fail");
  });

  it("fails itemisation for a tracker whose details are absent from the notice", () => {
    const notice = [
      "Privacy Notice. You can withdraw consent here. Grievance Officer: grievance@acme.in.",
      "हिंदी सूचना उपलब्ध है।",
      "We use Hotjar for behavioural analytics: session recordings, heatmaps, click and move data, and device details.",
      // Meta Pixel deliberately not itemised
    ].join("\n");
    const r = lintNotice({ noticeText: notice, scanResult: scanWith(["meta-pixel", "hotjar"]), trackers });
    const meta = r.checks.find((c) => c.id === "NL-100-meta-pixel")!;
    expect(meta.status).toBe("fail");
    expect(meta.provisions).toContain("Rule 3(b)");
    const hotjar = r.checks.find((c) => c.id === "NL-100-hotjar")!;
    expect(hotjar.status).toBe("pass");
  });

  it("runs only structural checks when no scan result is provided", () => {
    const r = lintNotice({ noticeText: "Withdraw consent. Grievance officer. हिंदी।", trackers });
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain("NL-001");
    expect(ids).toContain("NL-002");
    expect(ids).toContain("NL-003");
    expect(ids).toContain("NL-004");
    expect(ids.some((id) => id.startsWith("NL-100-"))).toBe(false);
  });

  it("accepts Tamil as an Eighth Schedule script", () => {
    const notice = "You may withdraw consent here. Grievance Officer: grievance@acme.in. Complain to the Data Protection Board. தமிழ் அறிவிப்பு.";
    const bilingual = lintNotice({ noticeText: notice }).checks.find((c) => c.id === "NL-003")!;
    expect(bilingual.status).toBe("pass");
  });

  it("does not treat a Board complaint as the grievance officer", () => {
    const notice = "You may withdraw consent here. You may make a complaint to the Board using its website. हिंदी सूचना उपलब्ध है।";
    const r = lintNotice({ noticeText: notice });
    expect(r.checks.find((c) => c.id === "NL-002")!.status).toBe("fail");
    expect(r.checks.find((c) => c.id === "NL-004")!.status).toBe("pass");
  });

  it("does not treat a marked blank as withdrawal, grievance, the Board, or Hindi", () => {
    const notice = [
      "We process phone numbers to deliver the order.",
      "[BLANK: withdrawal mechanism]",
      "[BLANK: grievance officer]",
      "[BLANK: complaint to the Board]",
      "[BLANK: Hindi]",
    ].join("\n");
    const r = lintNotice({
      noticeText: notice,
      dataPoints: [
        {
          id: "dp_users_phone",
          name: "phone",
          purpose: "To deliver the order.",
          how_long: "",
          locations: [],
          recipients: [],
        },
      ],
    });
    expect(r.checks.filter((c) => c.status === "fail").map((c) => c.id).sort()).toEqual([
      "NL-001",
      "NL-002",
      "NL-003",
      "NL-004",
    ]);
    expect(r.checks.find((c) => c.id === "NL-200-dp_users_phone")!.status).toBe("pass");
  });

  it("stamps schema_version and notice_url", () => {
    const r = lintNotice({ noticeText: "x", noticeUrl: "https://acme.in/privacy", trackers });
    expect(r.schema_version).toBe("1.0.0");
    expect(r.notice_url).toBe("https://acme.in/privacy");
  });
});
