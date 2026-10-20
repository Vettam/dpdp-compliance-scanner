import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toExplainer } from "../../src/explainers/build.js";
import { ExplainerSchema } from "../../src/explainers/schema.js";
import { emptyDataMap } from "../../src/map/io.js";
import { writeHumanZone, type HumanZoneEdit } from "../../src/map/human.js";
import { mergeScan } from "../../src/map/merge.js";
import type { DataMap } from "../../src/map/schema.js";
import { mapDataMap } from "../../src/mapper/data-map.js";
import { loadRules } from "../../src/rules/loader.js";
import { scanCode } from "../../src/scanners/code/index.js";
import { loadTrackers } from "../../src/trackers/loader.js";
import { rulesDir, vendorsDir, writeRepo } from "../scanners/js/repo.js";

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

const rules = await loadRules(rulesDir);
const vendors = await loadTrackers(vendorsDir);

describe("slice 8 rule blocks on the slice 5 fixture", () => {
  it("reports retention, rights, processors, consent, and the US recipient", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dpdp-slice8-"));
    try {
      writeRepo(dir, fixture);
      const scannedAt = "2026-10-15T00:00:00.000Z";
      const first = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt });
      const map = writeHumanZone(mergeScan(emptyDataMap(first.emitted.generated_by), first.emitted), scriptedEdits(first.emitted));
      const shown = mapDataMap(map, rules, vendors);
      const findingIds = (id: string) => shown.findings.filter((finding) => finding.rule_id === id);
      const questionIds = (id: string) => shown.questions.filter((question) => question.rule_id === id);

      const c070 = questionIds("DPDP-C-070").map((question) => question.prompt);
      expect(c070).toEqual(expect.arrayContaining([
        expect.stringContaining("dp_vendor_razorpay"),
        expect.stringContaining("dp_vendor_segment"),
      ]));
      expect(c070.some((prompt) => prompt.includes("dp_users_phone"))).toBe(false);
      expect(findingIds("DPDP-C-071")).toEqual([]);
      expect(questionIds("DPDP-C-072")).toHaveLength(1);
      expect(questionIds("DPDP-C-072")[0]?.needs_input).toEqual(["fiduciary_class"]);
      expect(questionIds("DPDP-C-072")[0]?.prompt).toContain("2 crore");

      expect(findingIds("DPDP-C-080")).toHaveLength(1);
      expect(findingIds("DPDP-C-081")).toEqual([]);
      expect(findingIds("DPDP-C-082")).toHaveLength(1);

      const c090 = questionIds("DPDP-C-090").map((question) => question.prompt);
      expect(c090).toEqual([expect.stringContaining("segment")]);
      expect(c090.some((prompt) => prompt.includes("razorpay"))).toBe(false);

      expect(findingIds("DPDP-C-091").map((finding) => finding.id)).toEqual(["f_dpdp_c_091_dp_users_aadhaar_last4"]);
      expect(findingIds("DPDP-C-093").map((finding) => finding.tracker?.id)).toEqual(["segment"]);
      expect(findingIds("DPDP-C-094").map((finding) => finding.tracker?.id)).toEqual(["segment"]);
      expect(findingIds("DPDP-C-094")[0]?.certainty).toBe("open");

      const segment = map.data_points.find((item) => item.id === "dp_vendor_segment");
      expect(segment).toBeDefined();
      segment!.basis = "consent";
      const consent = mapDataMap(map, rules, vendors);
      expect(consent.findings.filter((finding) => finding.rule_id === "DPDP-C-091").map((finding) => finding.id).sort()).toEqual([
        "f_dpdp_c_091_dp_users_aadhaar_last4",
        "f_dpdp_c_091_dp_vendor_segment",
      ]);
      expect(consent.findings.some((finding) => finding.rule_id === "DPDP-C-093")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates an explainer for every new rule", () => {
    for (const id of [
      "DPDP-C-070",
      "DPDP-C-071",
      "DPDP-C-072",
      "DPDP-C-073",
      "DPDP-C-080",
      "DPDP-C-081",
      "DPDP-C-082",
      "DPDP-C-083",
      "DPDP-C-084",
      "DPDP-C-090",
      "DPDP-C-091",
      "DPDP-C-092",
      "DPDP-C-094",
      "DPDP-C-095",
    ]) {
      const rule = rules.find((item) => item.id === id);
      expect(rule, id).toBeDefined();
      expect(rule?.owner).toBe("counsel");
      expect(rule?.sources).toContain("code");
      expect(ExplainerSchema.parse(toExplainer(rule!, rules))).toMatchObject({ id });
    }
  });
});

function scriptedEdits(emitted: { data_points: DataMap["data_points"]; questions: DataMap["questions"] }): HumanZoneEdit[] {
  const stated = "Until account deletion, then 30 days.";
  const answered_at = "2026-10-15";
  const edits: HumanZoneEdit[] = [
    { id: "dp_users_phone", basis: "voluntarily_provided", purpose: "To contact the customer about their order.", retention_stated: stated },
    { id: "dp_users_aadhaar_last4", basis: "consent", purpose: "To verify the customer's identity for the payment.", retention_stated: stated },
    {
      id: "dp_users_notes",
      category: "C8",
      basis: "voluntarily_provided",
      purpose: "To record what the customer asked us to remember about the order.",
      notes: "Customer notes about an order.",
      retention_stated: stated,
    },
    { id: "dp_vendor_razorpay", basis: "voluntarily_provided", purpose: "To take payment for the order." },
    { id: "dp_vendor_segment", basis: "voluntarily_provided", purpose: "To measure how people use the product." },
  ];
  expect(emitted.data_points.map((item) => item.id).sort()).toEqual(edits.map((edit) => edit.id).sort());
  for (const question of emitted.questions) {
    const edit = edits.find((item) => item.id === question.data_point);
    if (!edit) throw new Error(`no scripted edit for ${question.data_point}`);
    edit.answers = { ...edit.answers, [question.id]: { answered_at, by: "developer" } };
  }
  return edits;
}
