import type { NoticeLine } from "../notice/index.js";
import type { ScanResult } from "../types.js";
import type { Tracker } from "../trackers/schema.js";

/**
 * dpdp notice lint — checks a published notice against the data map and Rule 3.
 * It itemises each data point and names each recipient. `--scan findings.json`
 * keeps the page-scan inventory for one release. Marked `[BLANK: …]` spans are
 * not treated as the fiduciary having filled them in. This module never drafts.
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
  /** Data-map lines. When set, each point and recipient is checked. */
  dataPoints?: NoticeLine[];
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

/** Eighth Schedule scripts. shortcut: Arabic script also matches non-Schedule Arabic, upgrade when a script tag is recorded. */
const EIGHTH_SCHEDULE =
  /[\u0600-\u06FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u1C50-\u1C7F\uABC0-\uABFF]/;

function withoutBlanks(text: string): string {
  return text.replace(/\[BLANK:[^\]]*\]/gi, " ");
}

export function lintNotice(input: LintNoticeInput): NoticeLintResult {
  const text = withoutBlanks(input.noticeText).toLowerCase();
  const checks: NoticeCheck[] = [];

  checks.push(checkWithdrawal(text));
  checks.push(checkGrievance(text));
  checks.push(checkBilingual(text));
  checks.push(checkBoard(text));

  if (input.dataPoints) {
    for (const point of input.dataPoints) checks.push(...checkDataPoint(point, text));
  }

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
  const withoutBoard = text.replace(/complaints? to the (?:data protection )?board/g, " ");
  const ok = /grievance|complaint|data protection officer|nodal officer/.test(withoutBoard);
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
  const hasSchedule = EIGHTH_SCHEDULE.test(text);
  const hasEnglish = /[a-z]{4,}/.test(text);
  const ok = hasSchedule && hasEnglish;
  return {
    id: "NL-003",
    title: "Notice is in English and an Eighth Schedule language",
    certainty: "settled",
    provisions: ["Rule 3"],
    status: ok ? "pass" : "fail",
    detail: ok
      ? "The notice carries English and an Eighth Schedule script."
      : hasSchedule
        ? "The notice carries an Eighth Schedule script but no English text."
        : "The notice does not carry an Eighth Schedule script (Rule 3 requires English and another Eighth Schedule language).",
    explainer_url: EXPLAINER_BASE + "NL-003",
  };
}

function checkBoard(text: string): NoticeCheck {
  const ok = /data protection board|complain(?:t|ts)? to the board/.test(text);
  return {
    id: "NL-004",
    title: "Notice tells a person how to complain to the Board",
    certainty: "settled",
    provisions: ["s.5(1)", "Rule 3(c)"],
    status: ok ? "pass" : "fail",
    detail: ok
      ? "The notice says how to complain to the Board."
      : "The notice does not say how to complain to the Data Protection Board (Rule 3(c)).",
    explainer_url: EXPLAINER_BASE + "NL-004",
  };
}

function checkDataPoint(point: NoticeLine, text: string): NoticeCheck[] {
  const named = boundary(text, point.name) || boundary(text, point.id);
  const checks: NoticeCheck[] = [
    {
      id: `NL-200-${point.id}`,
      title: `Notice itemises ${point.name || point.id}`,
      certainty: "settled",
      provisions: ["Rule 3(b)", "s.5(1)"],
      status: named ? "pass" : "fail",
      detail: named
        ? `The notice itemises ${point.name || point.id}.`
        : `The notice does not itemise ${point.name || point.id} (${point.id}).`,
      explainer_url: EXPLAINER_BASE + `NL-200-${point.id}`,
    },
  ];
  for (const recipient of point.recipients) {
    const ok =
      boundary(text, recipient.vendor) ||
      boundary(text, recipient.vendor_name) ||
      itemised(recipient.notice_itemisation, text);
    const id = `NL-201-${point.id}-${recipient.vendor}`;
    checks.push({
      id,
      title: `Notice names ${recipient.vendor_name}`,
      certainty: "settled",
      provisions: ["s.11(1)(b)", "Rule 3(b)"],
      status: ok ? "pass" : "fail",
      detail: ok
        ? `The notice names ${recipient.vendor_name}.`
        : `The notice does not name ${recipient.vendor_name} (${recipient.vendor}).`,
      explainer_url: EXPLAINER_BASE + id,
    });
  }
  return checks;
}

function boundary(text: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(text);
}

function itemised(itemisation: string, text: string): boolean {
  const words = contentWords(itemisation);
  if (words.length === 0) return false;
  return words.filter((word) => text.includes(word)).length / words.length >= 0.3;
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
