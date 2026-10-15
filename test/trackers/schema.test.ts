import { describe, expect, it } from "vitest";
import { TrackerSchema, validateTracker } from "../../src/trackers/schema.js";

const valid = {
  id: "meta-pixel",
  vendor: "Meta Platforms",
  match: { cookies: ["_fbp", "_fbc"], hosts: ["connect.facebook.net", "www.facebook.com"], paths: ["/tr"] },
  data_points: ["persistent_browser_id", "click_id", "ip_address"],
  category: "C6",
  flags: ["3PF", "XFER", "KIDS", "PRE", "SENS"],
  role: "independent_or_joint_fiduciary",
  lawful_basis: "consent",
  provisions: ["s.6(1)", "s.9(3)"],
  notice_itemisation: "Browser identifier, click ID, IP, shared with Meta for ads.",
  destination_countries: ["US"],
  fires_pre_consent_by_default: true,
  withdrawal_mechanism: "Stop firing; clear _fbp/_fbc.",
  last_verified: "2026-09-15",
};

describe("TrackerSchema", () => {
  it("accepts a well-formed tracker", () => {
    expect(TrackerSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts the `domains` alias for `hosts`", () => {
    const { hosts: _h, ...rest } = valid.match;
    const r = validateTracker({ ...valid, match: { ...rest, domains: valid.match.hosts } });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown category", () => {
    const r = validateTracker({ ...valid, category: "C99" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown flag", () => {
    const r = validateTracker({ ...valid, flags: ["BOGUS"] });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown role", () => {
    const r = validateTracker({ ...valid, role: "controller" });
    expect(r.ok).toBe(false);
  });

  it("rejects an empty provisions list", () => {
    const r = validateTracker({ ...valid, provisions: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects a tracker with no match keys at all", () => {
    const r = validateTracker({ ...valid, match: {} });
    expect(r.ok).toBe(false);
  });

  it("accepts package names and depends_on_configuration", () => {
    const r = validateTracker({
      ...valid,
      role: "depends_on_configuration",
      packages: { npm: ["@segment/analytics-next"], go: ["gopkg.in/segmentio/analytics-go.v3"] },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts optional CMP banner selectors on a C10 record", () => {
    const r = validateTracker({
      ...valid,
      category: "C10",
      cmp: {
        selectors: ["#onetrust-banner-sdk"],
        accept_selectors: ["#onetrust-accept-btn-handler"],
        reject_selectors: ["#onetrust-reject-all-handler"],
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cmp?.selectors).toEqual(["#onetrust-banner-sdk"]);
  });
});
