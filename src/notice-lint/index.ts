import type { ScanResult } from "../types.js";
import type { Tracker } from "../trackers/schema.js";

/**
 * dpdp notice lint — checks the *content* of a published privacy notice against
 * Rule 3 of the DPDP Rules 2025. The scanner captures the inventory; this
 * linter checks the notice itemises each item and carries the structural
 * requirements (withdrawal, grievance, bilingual). Rule 3 logic is not
 * duplicated in the scanner (spec §5.4).
 */

export interface NoticeCheck {
  id: string;
  title: string;
  certainty: "settled" | "arguable";
  provisions: string[];
  status: "pass" | "fail";
  detail: string;
  explainer_url: string;
}

export interface NoticeLintResult {
  schema_version: string;
  notice_url: string;
  checks: NoticeCheck[];
  summary: { passed: number; failed: number };
}

export interface LintNoticeInput {
  noticeText: string;
  noticeUrl?: string;
  scanResult?: ScanResult;
  trackers?: Tracker[];
}

const SCHEMA_VERSION = "1.0.0";
const EXPLAINER_BASE = "https://sentinel.vettam.ai/notice-lint/";

/** Categories that need itemisation in a consent notice (non-essential). */
const ITEMISED_CATEGORIES = ["C4", "C5", "C6", "C9"];

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "these", "those",
  "are", "was", "were", "have", "has", "not", "but", "its", "their",
  "may", "can", "all", "any", "into", "your", "you", "our", "also",
  "when", "where", "which", "than", "then", "such", "each", "both",
  "more", "most", "some", "only", "well", "via", "per", "etc",
]);

function contentWords(text: string): string[] {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

function devanagariPresent(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

export function lintNotice(input: LintNoticeInput): NoticeLintResult {
  const text = input.noticeText.toLowerCase();
  const checks: NoticeCheck[] = [];

  checks.push(checkWithdrawal(text));
  checks.push(checkGrievance(text));
  checks.push(checkBilingual(text));

  if (input.scanResult && input.trackers) {
    const observed = input.scanResult.inventory.third_party_hosts
      .map((h) => h.tracker_id)
      .filter((id): id is string => Boolean(id));
    for (const id of Array.from(new Set(observed))) {
      const tracker = input.trackers.find((t) => t.id === id);
      if (!tracker) continue;
      if (!ITEMISED_CATEGORIES.includes(tracker.category)) continue;
      checks.push(checkItemisation(tracker, text));
    }
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  return {
    schema_version: SCHEMA_VERSION,
    notice_url: input.noticeUrl ?? "",
    checks,
    summary: { passed, failed },
  };
}

function checkWithdrawal(text: string): NoticeCheck {
  const ok = /withdraw/.test(text);
  return {
    id: "NL-001",
    title: "Notice describes how to withdraw consent",
    certainty: "settled",
    provisions: ["s.6(4)", "Rule 3"],
    status: ok ? "pass" : "fail",
    detail: ok
      ? "The notice mentions a withdrawal mechanism."
      : "The notice does not mention how to withdraw consent (s.6(4) requires withdrawal 'with comparable ease').",
    explainer_url: EXPLAINER_BASE + "NL-001",
  };
}

function checkGrievance(text: string): NoticeCheck {
  const ok = /grievance|complaint|data protection officer|nodal officer/.test(text);
  return {
    id: "NL-002",
    title: "Notice names a grievance / complaint mechanism",
    certainty: "settled",
    provisions: ["Rule 3", "s.13(2)"],
    status: ok ? "pass" : "fail",
    detail: ok
      ? "The notice names a grievance or complaint mechanism."
      : "The notice does not name a grievance officer or complaint mechanism (Rule 3).",
    explainer_url: EXPLAINER_BASE + "NL-002",
  };
}

function checkBilingual(text: string): NoticeCheck {
  const hasHindi = devanagariPresent(text);
  const hasEnglish = /[a-z]{4,}/.test(text);
  const ok = hasHindi && hasEnglish;
  return {
    id: "NL-003",
    title: "Notice is in English and Hindi",
    certainty: "settled",
    provisions: ["Rule 3"],
    status: ok ? "pass" : "fail",
    detail: ok
      ? "The notice carries both English and Hindi text."
      : hasHindi
        ? "The notice carries Hindi but no English text."
        : "The notice does not carry Hindi text (Rule 3 requires the notice in English and Hindi).",
    explainer_url: EXPLAINER_BASE + "NL-003",
  };
}

function checkItemisation(tracker: Tracker, text: string): NoticeCheck {
  const vendor = tracker.vendor.toLowerCase();
  const words = contentWords(tracker.notice_itemisation);
  const overlap = words.filter((w) => text.includes(w));
  const ratio = words.length === 0 ? 1 : overlap.length / words.length;
  const vendorNamed = vendor.length > 0 && text.includes(vendor);
  const ok = vendorNamed || ratio >= 0.3;
  const id = `NL-100-${tracker.id}`;
  return {
    id,
    title: `Notice itemises data collected via ${tracker.vendor} (${tracker.id})`,
    certainty: "settled",
    provisions: ["Rule 3(b)", "s.5(1)"],
    status: ok ? "pass" : "fail",
    detail: ok
      ? `The notice itemises the data collected via ${tracker.vendor}.`
      : `The notice does not itemise the data collected via ${tracker.vendor} (${tracker.category}). Missing terms: ${words.filter((w) => !text.includes(w)).slice(0, 8).join(", ")}.`,
    explainer_url: EXPLAINER_BASE + id,
  };
}
