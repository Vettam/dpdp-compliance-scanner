import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diffDataMaps } from "../../../src/map/diff.js";
import { emptyDataMap } from "../../../src/map/io.js";
import { mergeScan } from "../../../src/map/merge.js";
import { scanCode } from "../../../src/scanners/code/index.js";
import { rulesDir, vendorsDir, writeRepo } from "./repo.js";

const jsFixture = {
  "prisma/schema.prisma": `
model users {
  id            Int       @id
  phone         String
  aadhaar_last4 String
  notes         String
  deleted_at    DateTime?
}
`,
  "app/signup/page.tsx": `
export default function SignupPage() {
  return (
    <form name="signup">
      <input name="phone" />
      <label>
        <input type="checkbox" name="consent" />
        I agree to the processing of my data as described in the notice.
      </label>
      <button type="submit">Sign up</button>
    </form>
  );
}
`,
  "src/server/pay.ts": `
export async function createOrder() {
  await fetch("https://api.razorpay.com/v1/orders", { method: "POST" });
}
`,
  "src/analytics.ts": `
import { AnalyticsBrowser } from "@segment/analytics-next";
const analytics = AnalyticsBrowser.load({ writeKey: "wk_test" });
export function trackSignup() {
  analytics.track("Signed Up");
}
`,
  "app/api/account/delete/route.ts": `
export async function DELETE() {
  return Response.json({ ok: true });
}
`,
};

const pyFixture = {
  "app/models.py": `
class users(models.Model):
    phone = models.CharField(max_length=20)
    aadhaar_last4 = models.CharField(max_length=4)
    notes = models.TextField()
    deleted_at = models.DateTimeField(null=True, blank=True)
`,
  "app/forms.py": `
class SignupForm(forms.Form):
    phone = forms.CharField()
`,
  "templates/signup.html": `
<form name="signup" method="post">
  <label>
    <input type="checkbox" name="consent">
    I agree to the processing of my data as described in the notice.
  </label>
  <button type="submit">Sign up</button>
</form>
`,
  "app/pay.py": `
def create_order():
    requests.post("https://api.razorpay.com/v1/orders")
`,
  "app/analytics.py": `
import analytics

def track_signup():
    analytics.track("user", "Signed Up")
`,
  "app/urls.py": `
from django.urls import path
urlpatterns = [
    path("api/account/delete", views.delete_account),
]
`,
};

describe("slice 6 Django fixture", () => {
  it("yields the same map shape as the JavaScript fixture, apart from locations", async () => {
    const jsDir = mkdtempSync(join(tmpdir(), "dpdp-slice6-js-"));
    const pyDir = mkdtempSync(join(tmpdir(), "dpdp-slice6-py-"));
    try {
      writeRepo(jsDir, jsFixture);
      writeRepo(pyDir, pyFixture);
      const scannedAt = "2026-10-15T00:00:00.000Z";
      const opts = { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt };
      const js = await scanCode(jsDir, opts);
      const py = await scanCode(pyDir, opts);

      const phone = py.emitted.data_points.find((p) => p.id === "dp_users_phone");
      const aadhaar = py.emitted.data_points.find((p) => p.id === "dp_users_aadhaar_last4");
      const notes = py.emitted.data_points.find((p) => p.id === "dp_users_notes");
      expect(phone?.category).toBe("C8");
      expect(phone?.flags).not.toContain("SENS");
      expect(aadhaar?.flags).toContain("SENS");
      expect(py.emitted.questions.find((q) => q.data_point === "dp_users_notes")?.ask).toContain("users.notes");
      for (const point of [phone, aadhaar, notes]) {
        expect(point?.retention.signals.some((s) => s.kind === "soft_delete_column")).toBe(true);
      }
      expect(py.emitted.consent_gates.map((g) => g.id)).toEqual(["cg_signup_checkbox"]);
      expect(py.emitted.data_points.find((p) => p.id === "dp_vendor_razorpay")?.recipients[0]?.observed).toEqual([
        expect.objectContaining({ kind: "http_call", confidence: "high" }),
      ]);
      const segment = py.emitted.data_points.find((p) => p.id === "dp_vendor_segment");
      expect(segment?.consent_gate).toBeNull();
      expect(segment?.recipients.some((r) => r.vendor === "segment")).toBe(true);
      expect(py.emitted.rights_endpoints.map((r) => r.right)).toEqual(["erase"]);
      expect(ruleCounts(py.findings)).toEqual({
        "DPDP-C-080": 1,
        "DPDP-C-082": 1,
        "DPDP-C-094": 1,
        "DPDP-C-095": 5,
      });

      const jsMap = mergeScan(emptyDataMap(js.emitted.generated_by), js.emitted);
      const pyMap = mergeScan(emptyDataMap(py.emitted.generated_by), py.emitted);
      const diff = diffDataMaps(jsMap, pyMap);
      expect(diff.catalogue_changed).toBe(false);
      expect(diff.site.data_points_added).toEqual([]);
      expect(diff.site.data_points_removed).toEqual([]);
      expect(diff.site.recipients_added).toEqual([]);
      expect(diff.site.recipients_removed).toEqual([]);
      expect(diff.site.consent_gates_added).toEqual([]);
      expect(diff.site.consent_gates_removed).toEqual([]);
      const sig = (row: { data_point: string; kind: string }) => `${row.data_point}\0${row.kind}`;
      expect(diff.site.retention_signals_added.map(sig).sort()).toEqual(diff.site.retention_signals_removed.map(sig).sort());
      expect(diff.site.retention_signals_added.length).toBeGreaterThan(0);

      const second = await scanCode(pyDir, opts);
      const once = mergeScan(emptyDataMap(py.emitted.generated_by), py.emitted);
      const twice = mergeScan(once, second.emitted);
      expect(twice).toEqual(once);
    } finally {
      rmSync(jsDir, { recursive: true, force: true });
      rmSync(pyDir, { recursive: true, force: true });
    }
  });
});

function ruleCounts(findings: { rule_id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.rule_id] = (counts[finding.rule_id] ?? 0) + 1;
  return counts;
}
