import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeNoticeInputs } from "../../src/cli/notice.js";
import { emptyDataMap, serializeDataMap } from "../../src/map/io.js";
import { writeHumanZone, type HumanZoneEdit } from "../../src/map/human.js";
import { mergeScan } from "../../src/map/merge.js";
import type { DataMap, DataPoint } from "../../src/map/schema.js";
import { mapDataMap } from "../../src/mapper/data-map.js";
import { noticeChanges, noticeInputs, type NoticeChange, type NoticeInputs, type NoticeLine } from "../../src/notice/index.js";
import { executeNoticeLint } from "../../src/notice-lint/execute.js";
import { loadRules } from "../../src/rules/loader.js";
import { scanCode } from "../../src/scanners/code/index.js";
import { loadTrackers } from "../../src/trackers/loader.js";
import type { Tracker } from "../../src/vendors/schema.js";
import { rulesDir, vendorsDir, writeRepo } from "../scanners/js/repo.js";

const skillPath = join(process.cwd(), "skills", "dpdp-notice", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");

const DRAFT_LINE = "This is a draft pending counsel review.";
const FRESH = "We need your fresh consent before we use your data for this new purpose.";
const THIN = "The map is thin. This notice itemises only the data points the map records.";
const BLANKS = [
  "[BLANK: withdrawal mechanism]",
  "[BLANK: grievance officer]",
  "[BLANK: complaint to the Board]",
  "[BLANK: Hindi]",
];

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

describe("skills/dpdp-notice/SKILL.md", () => {
  it("has frontmatter with name and description", () => {
    expect(skill).toMatch(/^---\nname: dpdp-notice\n/);
    expect(skill).toContain("description:");
    const desc = skill.split("---")[1] ?? "";
    for (const phrase of ["consent notice", "change", "customers"]) {
      expect(desc).toContain(phrase);
    }
  });

  it("explains the three certainty tiers, the refusal, and the indicative line", () => {
    for (const tier of ["settled", "arguable", "open"]) expect(skill).toContain(tier);
    expect(skill).toContain("Indicative, not legal advice. Not a compliance verdict.");
    expect(skill).toContain("sentinel.vettam.ai");
    expect(skill.toLowerCase()).toContain("compliant");
    expect(skill.toLowerCase()).toContain("never invent");
    expect(skill).toContain("not in the map");
    expect(skill).toContain(DRAFT_LINE);
    expect(skill).toContain(FRESH);
    expect(skill).toContain(THIN);
    for (const blank of BLANKS) expect(skill).toContain(blank);
  });

  it("runs notice inputs and notice changes", () => {
    expect(skill).toContain("npx dpdp-compliance-scanner notice inputs --json");
    expect(skill).toContain("npx dpdp-compliance-scanner notice changes");
    expect(skill).toContain("fresh_consent");
  });

  it("references only fields that exist in the schemas", () => {
    const allowed = new Set<string>();
    for (const file of [
      "schema/datamap.schema.json",
      "schema/datamap-diff.schema.json",
      "schema/scanresult.schema.json",
      "schema/notice-inputs.schema.json",
      "schema/notice-change.schema.json",
      "vendors/schema.json",
    ]) {
      schemaTokens(JSON.parse(readFileSync(join(process.cwd(), file), "utf8")), allowed);
    }
    const unknown = new Set<string>();
    for (const token of referencedFields(skill)) {
      if (!allowed.has(token)) unknown.add(token);
    }
    expect([...unknown].sort()).toEqual([]);
  });
});

describe("slice 10 notice from the slice 8 fixture map", () => {
  it("itemises each data point, leaves the four blanks, and traces ids that resolve", async () => {
    const { map, vendors, rules } = await slice8Map();
    const reading = mapDataMap(map, rules, vendors);
    const inputs = noticeInputs(map, vendors, { rules, findings: reading.findings, questions: reading.questions });

    expect(inputs.thin).toBe(false);
    expect(inputs.lines.map((line) => line.id)).toEqual(map.data_points.map((point) => point.id));
    expect(inputs.questions).toEqual([]);
    expect(inputs.basis_findings.some((finding) => finding.rule_id === "DPDP-C-093")).toBe(true);

    const draft = draftConsent(inputs);
    const body = draft.slice(0, draft.indexOf("## Cover sheet"));
    const itemised = [...body.matchAll(/^- (dp_[A-Za-z0-9_]+) \|/gm)].map((match) => match[1]);
    expect(itemised).toEqual(map.data_points.map((point) => point.id));
    for (const blank of BLANKS) expect(draft).toContain(blank);
    expect(draft).toContain(DRAFT_LINE);
    expect(draft).not.toContain(THIN);

    const cover = draft.slice(draft.indexOf("## Cover sheet"));
    const traceIds = [...cover.matchAll(/^- (dp_[A-Za-z0-9_]+)/gm)].map((match) => match[1]);
    const known = new Set(map.data_points.map((point) => point.id));
    expect(new Set(traceIds)).toEqual(known);
    for (const finding of inputs.basis_findings) expect(cover).toContain(finding.rule_id);
    for (const question of inputs.catalogue_questions) expect(cover).toContain(question.rule_id);

    expect(() => draftConsent(inputs, ["dp_not_in_the_map"])).toThrow(/not in the map/);

    const files = new Map<string, string>();
    const code = await executeNoticeLint(
      { notice: "draft.md", scan: undefined, json: true, out: "./out", ci: true },
      {
        stdout: { write: () => {} },
        stderr: { write: () => {} },
        exit: () => {},
        writeFile: (path, data) => files.set(path, data),
        mkdir: () => {},
        loadNotice: async () => body,
        trackers: vendors,
        loadDataMap: async () => map,
      },
    );
    expect(code).toBe(0);
    const lint = JSON.parse(files.get(join("./out", "notice-lint.json")) ?? "{}") as {
      checks: Array<{ id: string; status: string }>;
    };
    expect(lint.checks.filter((check) => check.status === "fail").map((check) => check.id).sort()).toEqual([
      "NL-001",
      "NL-002",
      "NL-003",
      "NL-004",
    ]);
  });

  it("asks for fresh consent only when a purpose is new", async () => {
    const { map, vendors } = await slice8Map();
    const inputs = noticeInputs(map, vendors);

    const added = structuredClone(map);
    added.data_points.push(clonePoint(added, "dp_users_phone", "dp_users_email", "email", "To send a newsletter the customer asked for."));
    const newPurpose = noticeChanges(map, added);
    expect(newPurpose.fresh_consent).toBe(true);
    expect(newPurpose.data_points_added.find((point) => point.id === "dp_users_email")?.purpose_is_new).toBe(true);
    expect(draftChange(noticeInputs(added, vendors), newPurpose)).toContain(FRESH);

    const reused = structuredClone(map);
    const phone = reused.data_points.find((point) => point.id === "dp_users_phone");
    reused.data_points.push(clonePoint(reused, "dp_users_phone", "dp_users_email", "email", phone?.purpose ?? ""));
    const samePurpose = noticeChanges(map, reused);
    expect(samePurpose.fresh_consent).toBe(false);
    expect(draftChange(noticeInputs(reused, vendors), samePurpose)).not.toContain("fresh consent");

    const recipientOnly = structuredClone(map);
    recipientOnly.data_points.find((point) => point.id === "dp_users_phone")?.recipients.push({
      vendor: "hotjar",
      role: "processor",
      country: "US",
      observed: [],
    });
    const onlyRecipient = noticeChanges(map, recipientOnly);
    expect(onlyRecipient.fresh_consent).toBe(false);
    expect(onlyRecipient.recipients_added).toEqual([{ data_point: "dp_users_phone", vendor: "hotjar" }]);
    const recipientNotice = draftChange(noticeInputs(recipientOnly, vendors), onlyRecipient);
    expect(recipientNotice).not.toContain("fresh consent");
    expect(recipientNotice).toContain("hotjar");

    const retargeted = structuredClone(map);
    const segment = retargeted.data_points.find((point) => point.id === "dp_vendor_segment");
    if (!segment) throw new Error("missing segment");
    segment.purpose = "To sell the customer's behaviour to advertisers.";
    const changedPurpose = noticeChanges(map, retargeted);
    expect(changedPurpose.fresh_consent).toBe(true);
    expect(draftChange(noticeInputs(retargeted, vendors), changedPurpose)).toContain(FRESH);

    const reusedOnExisting = structuredClone(map);
    const notes = reusedOnExisting.data_points.find((point) => point.id === "dp_users_notes");
    const phonePurpose = reusedOnExisting.data_points.find((point) => point.id === "dp_users_phone")?.purpose ?? "";
    if (!notes || !phonePurpose) throw new Error("missing points");
    notes.purpose = phonePurpose;
    const moved = noticeChanges(map, reusedOnExisting);
    expect(moved.fresh_consent).toBe(false);
    expect(moved.purpose_changes).toEqual([{ id: "dp_users_notes", purpose: phonePurpose, purpose_is_new: false }]);
    const movedNotice = draftChange(noticeInputs(reusedOnExisting, vendors), moved);
    expect(movedNotice).not.toContain("fresh consent");
    expect(movedNotice).toContain("dp_users_notes");
  });
});

async function slice8Map(): Promise<{ map: DataMap; vendors: Tracker[]; rules: Awaited<ReturnType<typeof loadRules>> }> {
  const dir = mkdtempSync(join(tmpdir(), "dpdp-slice10-"));
  try {
    writeRepo(dir, fixture);
    const scannedAt = "2026-10-15T00:00:00.000Z";
    const first = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt });
    const merged = mergeScan(emptyDataMap(first.emitted.generated_by), first.emitted);
    const map = writeHumanZone(merged, scriptedEdits(merged));
    const yaml = serializeDataMap(map);
    const mapPath = join(dir, "data-map.yaml");
    const out: string[] = [];
    expect(
      await executeNoticeInputs(
        { json: true },
        {
          stdout: { write: (s) => out.push(s) },
          stderr: { write: () => {} },
          exit: () => {},
          writeFile: () => {},
          readFile: (path) => {
            if (path !== mapPath) throw new Error(`ENOENT: ${path}`);
            return yaml;
          },
          mkdir: () => {},
          exists: (path) => path === mapPath,
          rulesDir,
          trackersDir: vendorsDir,
          mapPath,
          packageName: "dpdp-compliance-scanner",
          packageVersion: "2.0.0",
        },
      ),
    ).toBe(0);
    const printed = JSON.parse(out.join("")) as NoticeInputs;
    expect(printed.lines.map((line) => line.id)).toEqual(map.data_points.map((point) => point.id));
    const [vendors, rules] = await Promise.all([loadTrackers(vendorsDir), loadRules(rulesDir)]);
    return { map, vendors, rules };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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

function clonePoint(map: DataMap, fromId: string, id: string, name: string, purpose: string): DataPoint {
  const source = map.data_points.find((point) => point.id === fromId);
  if (!source) throw new Error(`missing ${fromId}`);
  const point = structuredClone(source);
  point.id = id;
  point.name = name;
  point.purpose = purpose;
  point.recipients = [];
  point.observed = point.observed.map((observed) => ({ ...observed, location: `${observed.location}:email` }));
  return point;
}

function draftConsent(inputs: NoticeInputs, extraIds: string[] = []): string {
  const known = new Set(inputs.lines.map((line) => line.id));
  refuse(extraIds, known);
  return [
    DRAFT_LINE,
    "",
    "This notice is for you, the person this data is about.",
    "",
    ...inputs.lines.map(itemLine),
    "",
    ...BLANKS,
    "",
    ...cover(inputs, inputs.lines.map((line) => line.id)),
  ].join("\n");
}

function draftChange(inputs: NoticeInputs, changes: NoticeChange): string {
  const known = new Set(inputs.lines.map((line) => line.id));
  const itemIds = [...changes.data_points_added.map((point) => point.id), ...changes.purpose_changes.map((point) => point.id)];
  refuse(
    [...itemIds, ...changes.recipients_added.map((recipient) => recipient.data_point)],
    known,
  );
  const lines = [
    DRAFT_LINE,
    "",
    "This notice is for you. We already hold personal data about you. This notice says what changed.",
    "",
  ];
  for (const id of itemIds) {
    const line = inputs.lines.find((item) => item.id === id);
    if (!line) throw new Error(`refusing ${id}; not in the map`);
    lines.push(itemLine(line));
  }
  for (const recipient of changes.recipients_added) {
    lines.push(`- ${recipient.data_point} is now also received by ${recipient.vendor}.`);
  }
  if (changes.fresh_consent) lines.push("", FRESH);
  for (const removed of changes.data_points_removed) lines.push(`- We no longer process ${removed.id}.`);
  const trace = [...itemIds, ...changes.recipients_added.map((recipient) => recipient.data_point)];
  lines.push("", ...BLANKS, "", ...cover(inputs, trace));
  return lines.join("\n");
}

function itemLine(line: NoticeLine): string {
  const purpose = line.purpose.trim() || "[BLANK: purpose]";
  const howLong = line.how_long.trim() || "[BLANK: how long]";
  const who =
    line.recipients.length === 0
      ? "No recipient is recorded."
      : line.recipients.map((recipient) => recipient.notice_itemisation || recipient.vendor_name).join(" / ");
  return `- ${line.id} | ${line.name} | ${purpose} | ${who} | ${howLong}`;
}

function cover(inputs: NoticeInputs, traceIds: string[]): string[] {
  const lines = ["## Cover sheet", ""];
  if (inputs.thin) lines.push(THIN, "");
  lines.push("### Trace");
  const byId = new Map(inputs.lines.map((line) => [line.id, line]));
  for (const id of traceIds) {
    const locations = byId.get(id)?.locations ?? [];
    if (locations.length === 0) lines.push(`- ${id}`);
    else for (const location of locations) lines.push(`- ${id} ${location}`);
  }
  lines.push("", "### Open questions");
  if (inputs.questions.length === 0) lines.push("None.");
  else for (const question of inputs.questions) lines.push(`- ${question.id} ${question.ask}`);
  lines.push("", "### Catalogue questions");
  if (inputs.catalogue_questions.length === 0) lines.push("None.");
  else for (const question of inputs.catalogue_questions) lines.push(`- ${question.rule_id} ${question.prompt.replace(/\s+/g, " ")}`);
  lines.push("", "### Findings on asserted bases");
  if (inputs.basis_findings.length === 0) lines.push("None.");
  else {
    for (const finding of inputs.basis_findings) {
      lines.push(`- ${finding.rule_id} ${finding.certainty} ${finding.title} ${finding.explainer_url}`);
    }
  }
  return lines;
}

function refuse(ids: string[], known: Set<string>) {
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) throw new Error(`refusing ${missing.join(", ")}; not in the map`);
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
