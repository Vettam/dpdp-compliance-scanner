import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyDataMap } from "../../../src/map/io.js";
import { mergeScan } from "../../../src/map/merge.js";
import { scanCode } from "../../../src/scanners/code/index.js";
import { rulesDir, vendorsDir, writeRepo } from "./repo.js";

const fixture = {
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

describe("slice 5 Next.js fixture", () => {
  it("yields the data map the spec names", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dpdp-slice5-"));
    try {
      writeRepo(dir, fixture);
      const scannedAt = "2026-10-15T00:00:00.000Z";
      const first = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt });
      const phone = first.emitted.data_points.find((p) => p.id === "dp_users_phone");
      const aadhaar = first.emitted.data_points.find((p) => p.id === "dp_users_aadhaar_last4");
      const notes = first.emitted.data_points.find((p) => p.id === "dp_users_notes");
      expect(phone?.category).toBe("C8");
      expect(phone?.flags).not.toContain("SENS");
      expect(phone?.observed.some((o) => o.kind === "schema_column" && o.confidence === "high")).toBe(true);
      expect(aadhaar?.category).toBe("C8");
      expect(aadhaar?.flags).toContain("SENS");
      expect(aadhaar?.observed.every((o) => o.confidence === "high")).toBe(true);
      expect(first.emitted.questions.find((q) => q.data_point === "dp_users_notes")?.ask).toContain("users.notes");
      for (const point of [phone, aadhaar, notes]) {
        expect(point?.retention.signals.some((s) => s.kind === "soft_delete_column")).toBe(true);
      }
      expect(first.emitted.consent_gates.map((g) => g.id)).toContain("cg_signup_checkbox");
      const razorpay = first.emitted.data_points.find((p) => p.id === "dp_vendor_razorpay");
      expect(razorpay?.recipients[0]?.observed).toEqual([
        expect.objectContaining({ kind: "http_call", confidence: "high" }),
      ]);
      const segment = first.emitted.data_points.find((p) => p.id === "dp_vendor_segment");
      expect(segment?.consent_gate).toBeNull();
      expect(segment?.recipients.some((r) => r.vendor === "segment")).toBe(true);
      expect(first.emitted.rights_endpoints.map((r) => r.right)).toContain("erase");
      expect(ruleCounts(first.findings)).toEqual({
        "DPDP-C-080": 1,
        "DPDP-C-082": 1,
        "DPDP-C-094": 1,
        "DPDP-C-095": 5,
      });

      const second = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt });
      const once = mergeScan(emptyDataMap(first.emitted.generated_by), first.emitted);
      const twice = mergeScan(once, second.emitted);
      expect(twice).toEqual(once);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finishes a 2000-file repo in under 10 seconds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dpdp-slice5-wide-"));
    try {
      writeRepo(dir, fixture);
      mkdirSync(join(dir, "src", "gen"), { recursive: true });
      const { writeFileSync } = await import("node:fs");
      for (let i = 0; i < 2000; i++) {
        writeFileSync(join(dir, "src", "gen", `f${i}.ts`), "export const n = 1;\n");
      }
      const start = performance.now();
      const result = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture" });
      expect(performance.now() - start).toBeLessThan(10_000);
      expect(result.emitted.data_points.find((p) => p.id === "dp_users_phone")).toBeTruthy();
      expect(result.emitted.rights_endpoints.map((r) => r.right)).toContain("erase");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

function ruleCounts(findings: { rule_id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.rule_id] = (counts[finding.rule_id] ?? 0) + 1;
  return counts;
}
