import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("Python consent gates", () => {
  it("records a consent checkbox next to submit", async () => {
    const { emitted } = await scan({
      "templates/signup.html": `
<form name="signup" method="post">
  <label>
    <input type="checkbox" name="consent">
    I agree to the processing of my data as described in the notice.
  </label>
  <button type="submit">Sign up</button>
</form>
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

  it("records a CMP import as a banner gate", async () => {
    const { emitted } = await scan({
      "app/banner.py": `import cookieyes\n`,
    });
    expect(emitted.consent_gates.map((g) => ({ id: g.id, kind: g.kind }))).toContainEqual({
      id: "cg_cmp_cookieyes",
      kind: "banner",
    });
  });

  it("records a consent middleware and a DRF permission", async () => {
    const { emitted } = await scan({
      "app/middleware.py": `
class ConsentMiddleware:
    def __call__(self, request):
        return self.get_response(request)
`,
      "app/permissions.py": `
class HasConsent(BasePermission):
    def has_permission(self, request, view):
        return True
`,
    });
    expect(emitted.consent_gates.map((g) => g.id).sort()).toEqual([
      "cg_consentmiddleware_check",
      "cg_hasconsent_check",
    ]);
  });

  it("links a call inside a consent branch and not one outside it", async () => {
    const gated = await scan({
      "app/analytics.py": `
import analytics

def run(has_consent):
    if has_consent:
        analytics.track("user", "Allowed")
`,
    });
    expect(gated.emitted.data_points.find((p) => p.id === "dp_vendor_segment")?.consent_gate).toBe("cg_has_consent_check");
    expect(gated.emitted.consent_gates.find((g) => g.id === "cg_has_consent_check")?.kind).toBe("code_check");

    const early = await scan({
      "app/analytics.py": `
import analytics

def run(has_consent):
    if not has_consent:
        return
    analytics.track("user", "Allowed")
`,
    });
    expect(early.emitted.data_points.find((p) => p.id === "dp_vendor_segment")?.consent_gate).toBe("cg_has_consent_check");

    const outside = await scan({
      "app/analytics.py": `
import analytics

def run(has_consent):
    if has_consent:
        return
    analytics.track("user", "Signed Up")
`,
    });
    expect(outside.emitted.data_points.find((p) => p.id === "dp_vendor_segment")?.consent_gate).toBeNull();
  });
});
