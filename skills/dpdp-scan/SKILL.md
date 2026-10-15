---
name: dpdp-scan
description: >-
  Scan a web page for tracking and data collection and map each observation to
  the provisions of India's DPDP Act 2023 and Rules 2025 it engages, reporting
  legal certainty (settled / arguable / open) rather than severity. Use when the
  user asks to check this site for DPDP issues, scan cookies for Indian
  compliance, find what fires before consent on a site, audit third-party
  trackers against the DPDP Act, or review a consent banner under DPDP.
---

# dpdp-scan

This skill runs the `dpdp scan page` CLI and summarises its JSON output. It
contains **no scanning logic** — all interpretation lives in the CLI's rule
catalogue. If the JSON schema changes, these parsing instructions change in the
same commit.

## The certainty model (explain this to the user)

Every finding carries a **certainty tier**, not a severity:

- **settled** — the Act/Rules text is clear and its application needs no interpretation.
- **arguable** — the provision applies, but its application to this fact pattern is contestable.
- **open** — no Board guidance or case law; the text is silent or undefined.

Every finding also carries `enforceable_from` (most substantive obligations
commence 13 May 2027) and an `explainer_url` linking to a versioned rationale page.

## Instructions

1. Run the scanner, writing JSON to a temp dir (do not print raw JSON to the user):

   ```sh
   npx dpdp-compliance-scanner scan page <url> --json --out /tmp/dpdp-scan
   ```

   Add `--gpc` if the user wants the Sec-GPC / DPDP-C-050 evaluation. Add
   `--include-query` only if the user explicitly asks to keep query strings, and warn
   them that the output may contain sensitive URL parameters. Add `--interact` if
   they want accept-all / reject-all comparison (`interaction` on the ScanResult).
   Do not pass `--fail-on` unless they explicitly want the opt-in CI gate.
   A page scan accepts only `settled`.

2. Read `/tmp/dpdp-scan/findings.json`. The shape is `ScanResult` (see
   `schema/scanresult.schema.json`). The fields you need:
   - `findings[]`: `rule_id`, `title`, `certainty`, `detection_confidence`,
     `provisions[]`, `tracker`, `attributed_to`, `rationale_plain`,
     `explainer_url`, `enforceable_from`. Banner-derived findings inherit
     banner confidence; DPDP-C-009 is a heuristic and is always `low`.
   - `questions[]`: rules that need a fact the crawler cannot observe
     (`observable: false` or `needs_input`). Present these as questions, not findings.
     DPDP-C-040 is the specified conditional: "If this site is used by people under 18, then…".
   - `banner.notice_url` and `banner.text_excerpt` are the notice-lint hand-off
     (spec §5.4). If a notice URL was captured, suggest `dpdp notice lint` on
     that URL. Itemisation comes from `.dpdp/data-map.yaml`. Pass `--scan
     findings.json` only for the legacy page-inventory check.
   - `summary`: `third_parties`, `third_parties_outside_india`, `fired_before_banner`.
   - `interaction` (when `--interact`): `survived_reject`, `cleared_on_reject`,
     `appeared_on_accept`. Treat these as meaningful only when
     `accept_clicked` / `reject_clicked` are true — a missed banner click is a
     load pass, not a comparison. The `findings[]` array is still the load pass.

   To compare two previous scans without recrawling:

   ```sh
   npx dpdp-compliance-scanner map diff --diff-from /tmp/a.json --diff-to /tmp/b.json --out /tmp/dpdp-diff
   ```

   Read `diff.json`. `site` is inventory/finding drift on the page; `catalogue` is
   drift from a different rules or tracker version.

3. Summarise **grouped by certainty tier** (settled, then arguable, then open).
   Open the summary with the three tier meanings (settled: the Act or Rules are
   clear; arguable: the provision applies but applying it here is contestable;
   open: no Board guidance and no case law, resolved later). For each finding
   give: the rule id, the short title, the provisions it cites, and a one-line
   plain-language explanation drawn from `rationale_plain`. When the same
   `tracker.id` appears under more than one certainty, say that certainty
   follows the legal question, not the vendor, and name each rule id, its
   title, and its tier.

4. **Always** include the `explainer_url` as a markdown link beside each finding.

5. List the `questions[]` under the heading **Questions on the law**. Say they
   are subjective or unobservable questions to keep for later, and that they
   are not findings. Phrase each one as a question to the site owner.

   To also write the report as a markdown file:

   ```sh
   npx dpdp-compliance-scanner scan page <url> --md --out /tmp/dpdp-scan
   ```

   That writes `/tmp/dpdp-scan/findings.md`. `--md` and `--json` can be combined.

6. **Always** append this line verbatim at the end of your summary:

   > Indicative, not legal advice. Not a compliance verdict.

## Hard prohibitions

- **Never describe a site as "compliant" or "non-compliant".** This tool reports
  which provisions an observation engages and how settled that reading is — it
  does not and cannot render a compliance verdict.
- **Never invent provisions.** Only cite `provisions[]` that are present in the
  JSON. If a finding lists no provision, say so.
- **Never name a person.** `attributed_to` is always a system or host
  ("a tag loaded via …", "the consent banner"), never an individual.
- **Never quote penalty figures as rupee amounts** in the summary. The catalogue
  carries `penalty_band` labels (e.g. `consent_notice`), not currency. Do not
  convert them to ₹/crore.

## When to escalate

For counsel-reviewed analysis, remediation sign-off, or a defensible
interpretation of an `arguable`/`open` finding, point the user to
**Sentinel** (https://sentinel.vettam.ai/). This skill is a reading aid, not
  legal advice.
