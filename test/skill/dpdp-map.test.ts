import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeMapQuestions, executeMapShow } from "../../src/cli/map.js";
import { emptyDataMap, serializeDataMap } from "../../src/map/io.js";
import { writeHumanZone, type HumanZoneEdit } from "../../src/map/human.js";
import { mergeScan } from "../../src/map/merge.js";
import { openQuestions } from "../../src/map/show.js";
import type { DataMap } from "../../src/map/schema.js";
import { scanCode } from "../../src/scanners/code/index.js";
import { Finding } from "../../src/types.js";
import { rulesDir, vendorsDir, writeRepo } from "../scanners/js/repo.js";

const skillPath = join(process.cwd(), "skills", "dpdp-map", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");

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

describe("skills/dpdp-map/SKILL.md", () => {
  it("has frontmatter with name and description", () => {
    expect(skill).toMatch(/^---\nname: dpdp-map\n/);
    expect(skill).toContain("description:");
    const desc = skill.split("---")[1] ?? "";
    for (const phrase of ["DPDP", "codebase", "basis", "questions"]) {
      expect(desc).toContain(phrase);
    }
  });

  it("explains the three certainty tiers and the indicative line", () => {
    for (const tier of ["settled", "arguable", "open"]) expect(skill).toContain(tier);
    expect(skill).toContain("Indicative, not legal advice. Not a compliance verdict.");
    expect(skill).toContain("sentinel.vettam.ai");
    expect(skill.toLowerCase()).toContain("compliant");
    expect(skill.toLowerCase()).toContain("never invent");
  });

  it("runs scan code, reads map questions, and summarises map show", () => {
    expect(skill).toContain("npx dpdp-compliance-scanner scan code");
    expect(skill).toContain("npx dpdp-compliance-scanner map questions --json");
    expect(skill).toContain("npx dpdp-compliance-scanner map show --json");
  });

  it("references only fields that exist in the schemas", () => {
    const allowed = schemaTokens(
      JSON.parse(readFileSync(join(process.cwd(), "schema", "datamap.schema.json"), "utf8")),
    );
    schemaTokens(
      JSON.parse(readFileSync(join(process.cwd(), "schema", "scanresult.schema.json"), "utf8")),
      allowed,
    );
    allowed.add("catalogue_questions");
    const unknown = new Set<string>();
    for (const token of referencedFields(skill)) {
      if (!allowed.has(token)) unknown.add(token);
    }
    expect([...unknown].sort()).toEqual([]);
  });
});

describe("slice 7 scripted answers on the slice 5 fixture", () => {
  it("answers every question, sets basis, and map show reports DPDP-C-093 for Segment", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dpdp-slice7-"));
    try {
      writeRepo(dir, fixture);
      const scannedAt = "2026-10-15T00:00:00.000Z";
      const first = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt });
      const map = mergeScan(emptyDataMap(first.emitted.generated_by), first.emitted);
      expect(map.questions.length).toBeGreaterThan(0);
      for (const question of map.questions) expect(question.data_point).toBeTruthy();

      const before = scannerZone(map);
      const edited = writeHumanZone(map, scriptedEdits(map));
      expect(scannerZone(edited)).toEqual(before);
      expect(openQuestions(edited)).toEqual([]);
      for (const point of edited.data_points) expect(point.basis).not.toBe("unstated");

      const segment = edited.data_points.find((point) => point.id === "dp_vendor_segment");
      expect(segment?.basis).toBe("voluntarily_provided");
      expect(segment?.category).toBe("C9");

      const shown = await mapShow(edited);
      const c093 = shown.findings.filter((finding) => finding.rule_id === "DPDP-C-093");
      expect(c093.map((finding) => finding.tracker?.id)).toEqual(["segment"]);
      expect(c093[0]?.certainty).toBe("settled");
      expect(c093[0]?.provisions).toEqual(expect.arrayContaining(["s.7(a)", "s.6(1)"]));
      expect(Finding.safeParse(c093[0]).success).toBe(true);
      expect(shown.findings.some((finding) => finding.rule_id === "DPDP-C-093" && finding.tracker?.id === "razorpay")).toBe(
        false,
      );

      const second = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt });
      const rescanned = mergeScan(edited, second.emitted);
      expect(rescanned.data_points.find((point) => point.id === "dp_vendor_segment")?.basis).toBe(
        "voluntarily_provided",
      );
      expect(openQuestions(rescanned)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a data point the map does not contain", () => {
    const map = emptyDataMap({
      package: "dpdp-compliance-scanner",
      version: "2.0.0",
      rules_version: "0.5.0",
      vendors_version: "1.0.0",
    });
    expect(() => writeHumanZone(map, [{ id: "dp_missing", basis: "consent" }])).toThrow(/no data point/);
  });
});

function scriptedEdits(map: DataMap): HumanZoneEdit[] {
  const stated = "Until account deletion, then 30 days.";
  const answered_at = "2026-10-15";
  const edits: HumanZoneEdit[] = [
    {
      id: "dp_users_phone",
      basis: "voluntarily_provided",
      purpose: "To contact the customer about their order.",
      retention_stated: stated,
    },
    {
      id: "dp_users_aadhaar_last4",
      basis: "consent",
      purpose: "To verify the customer's identity for the payment.",
      retention_stated: stated,
    },
    {
      id: "dp_users_notes",
      category: "C8",
      basis: "voluntarily_provided",
      purpose: "To record what the customer asked us to remember about the order.",
      notes: "Customer notes about an order.",
      retention_stated: stated,
    },
    {
      id: "dp_vendor_razorpay",
      basis: "voluntarily_provided",
      purpose: "To take payment for the order.",
    },
    {
      id: "dp_vendor_segment",
      basis: "voluntarily_provided",
      purpose: "To measure how people use the product.",
    },
  ];
  const ids = map.data_points.map((point) => point.id).sort();
  expect(ids).toEqual(edits.map((edit) => edit.id).sort());
  for (const question of map.questions) {
    const edit = edits.find((item) => item.id === question.data_point);
    if (!edit) throw new Error(`no scripted edit for ${question.data_point}`);
    edit.answers = { ...edit.answers, [question.id]: { answered_at, by: "developer" } };
  }
  return edits;
}

function scannerZone(map: DataMap) {
  return {
    questions: map.questions,
    scans: map.scans,
    rights_endpoints: map.rights_endpoints,
    points: map.data_points.map((point) => ({
      id: point.id,
      observed: point.observed,
      signals: point.retention.signals,
      recipients: point.recipients.map((recipient) => ({
        vendor: recipient.vendor,
        observed: recipient.observed,
      })),
    })),
  };
}

async function mapShow(map: DataMap): Promise<{ findings: Array<{ rule_id: string; certainty: string; provisions: string[]; tracker?: { id: string } | null }> }> {
  const files = new Map<string, string>();
  const out: string[] = [];
  const mapPath = join(tmpdir(), "dpdp-slice7-map.yaml");
  files.set(mapPath, serializeDataMap(map));
  const deps = {
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: () => {} },
    exit: () => {},
    writeFile: (path: string, data: string) => files.set(path, data),
    readFile: (path: string) => {
      const data = files.get(path);
      if (data === undefined) throw new Error(`ENOENT: ${path}`);
      return data;
    },
    mkdir: () => {},
    exists: (path: string) => files.has(path),
    rulesDir,
    trackersDir: vendorsDir,
    mapPath,
    packageName: "dpdp-compliance-scanner",
    packageVersion: "2.0.0",
  };
  expect(await executeMapShow({ json: true }, deps)).toBe(0);
  expect(executeMapQuestions({ json: true }, deps)).toBe(0);
  const questions = JSON.parse(out.at(-1) ?? "null") as unknown[];
  expect(questions).toEqual([]);
  return JSON.parse(out[0] ?? "{}") as { findings: Array<{ rule_id: string; certainty: string; provisions: string[]; tracker?: { id: string } | null }> };
}

function referencedFields(text: string): string[] {
  const fields: string[] = [];
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1] ?? "";
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(token)) continue;
    for (const part of token.split(".")) fields.push(part);
  }
  return fields;
}

function schemaTokens(schema: unknown, into = new Set<string>()): Set<string> {
  if (!schema || typeof schema !== "object") return into;
  if (Array.isArray(schema)) {
    for (const item of schema) schemaTokens(item, into);
    return into;
  }
  const record = schema as Record<string, unknown>;
  if (record.properties && typeof record.properties === "object") {
    for (const key of Object.keys(record.properties as object)) into.add(key);
  }
  if (Array.isArray(record.enum)) {
    for (const value of record.enum) if (typeof value === "string") into.add(value);
  }
  if (typeof record.const === "string") into.add(record.const);
  for (const value of Object.values(record)) schemaTokens(value, into);
  return into;
}
