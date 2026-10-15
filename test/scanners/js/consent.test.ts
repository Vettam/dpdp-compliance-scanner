import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("JS consent gates", () => {
  it("records a consent checkbox next to submit", async () => {
    const { emitted } = await scan({
      "app/signup/page.tsx": `
export default function SignupPage() {
  return (
    <form name="signup">
      <label>
        <input type="checkbox" name="consent" />
        I agree to the processing of my data as described in the notice.
      </label>
      <button type="submit">Sign up</button>
    </form>
  );
}
`,
    });
    expect(emitted.consent_gates).toEqual([
      expect.objectContaining({
        id: "cg_signup_checkbox",
        kind: "checkbox",
        text_excerpt: "I agree to the processing of my data as described in the notice.",
      }),
    ]);
  });

  it("records a CMP SDK import as a banner gate", async () => {
    const { emitted } = await scan({
      "src/banner.tsx": `
import { CookieYes } from "cookieyes";
export function Banner() {
  return <CookieYes />;
}
`,
    });
    expect(emitted.consent_gates.map((g) => ({ id: g.id, kind: g.kind }))).toContainEqual({
      id: "cg_cmp_cookieyes",
      kind: "banner",
    });
  });

  it("links a call inside a consent branch and not one outside it", async () => {
    const gated = await scan({
      "src/analytics.ts": `
import { AnalyticsBrowser } from "@segment/analytics-next";
const analytics = AnalyticsBrowser.load({ writeKey: "x" });
export function run(hasConsent: boolean) {
  if (hasConsent) {
    analytics.track("Allowed");
  }
}
`,
    });
    expect(gated.emitted.data_points.find((p) => p.id === "dp_vendor_segment")?.consent_gate).toBe("cg_hasconsent_check");
    expect(gated.emitted.consent_gates.find((g) => g.id === "cg_hasconsent_check")?.kind).toBe("code_check");

    const early = await scan({
      "src/analytics.ts": `
import { AnalyticsBrowser } from "@segment/analytics-next";
const analytics = AnalyticsBrowser.load({ writeKey: "x" });
export function run(hasConsent: boolean) {
  if (!hasConsent) return;
  analytics.track("Allowed");
}
`,
    });
    expect(early.emitted.data_points.find((p) => p.id === "dp_vendor_segment")?.consent_gate).toBe("cg_hasconsent_check");

    const outside = await scan({
      "src/analytics.ts": `
import { AnalyticsBrowser } from "@segment/analytics-next";
const analytics = AnalyticsBrowser.load({ writeKey: "x" });
export function run(hasConsent: boolean) {
  if (hasConsent) return;
  analytics.track("Signed Up");
}
`,
    });
    expect(outside.emitted.data_points.find((p) => p.id === "dp_vendor_segment")?.consent_gate).toBeNull();
  });
});
