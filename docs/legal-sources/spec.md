# dpdp-cookie-scan — Product Specification

**Status:** v0.1–v1.0 spec, implemented. Superseded for product shape by [`docs/spec-v2.md`](../spec-v2.md); remains the reference for page-scanner engine behaviour (§4), the page-shaped rule tranche (§5.3), and the `ScanResult` 1.x schema (§7).
**Date:** 15 September 2026
**Owner:** Vettam (Rylematic Technologies Private Limited), Sentinel product line
**Repo:** `dpdp-compliance-scanner` (open source). Command names in the body below are the v1 names this spec was written against (`dpdp-cookie-scan`, `dpdp-notice-lint`).

This document is no longer the product-shape spec. Build product shape from [`docs/spec-v2.md`](../spec-v2.md). This document remains the reference for the page scanner's engine (§4), the page-shaped rule tranche (§5.3), and the `ScanResult` 1.x schema (§7). Coding conventions and CI rules live in `CONTRIBUTING.md`.

---

## 0. Read this first

### 0.1 What the tool is

A scanner that loads a web page in a headless browser, records everything the page collects about a visitor (cookies, storage, third-party requests, fingerprinting calls, consent-banner state), and maps each observation to the provisions of India's **Digital Personal Data Protection Act 2023** and **DPDP Rules 2025** that it engages.

The output is a set of **findings**. Each finding says: what we observed, which provision it engages, how *legally certain* that mapping is, when the provision becomes enforceable, and who in the organisation is best placed to act on it.

### 0.2 What the tool is not

- It is **not an enforcement gate.** It surfaces risk. It never blocks a build or a deploy. Exit code is `0` on any successful scan.
- It is **not a consent manager.** It does not fix anything.
- It is **not a compliance verdict.** It never says a site "is" or "is not" compliant. That judgement, with counsel review, is the paid Sentinel product.
- It is **not a static analyser.** It observes a running page. It does not read source code.

### 0.3 The one idea that matters

Every other cookie scanner reports *how many trackers fired* with red/amber/green severity. This tool reports **how settled the law is** about each thing it found. Legal certainty is a first-class field on every finding, not a caveat in a footer.

India has no cookie-specific law. The entire relevance of a cookie scan under DPDP rests on an inference chain:

1. A tracker collects data about a visitor
2. That data identifies, or can identify, an individual (s.2(t): "identifiable by or in relation to such data")
3. Processing personal data requires a lawful basis (s.4)
4. DPDP's lawful bases are a closed list: consent, or the exhaustive "certain legitimate uses" in s.7. There is no legitimate-interest basis and no contract-necessity basis.
5. So most trackers require consent, which must be preceded by notice (s.5) and be a clear affirmative act (s.6(1))

Some links in that chain are settled. Some are arguable. Some will only be resolved when the Data Protection Board issues orders and appeals reach the TDSAT. **The tool's job is to show the user which is which.** That interpretation layer is the product's moat. The scanning engine is commodity.

### 0.4 Companion documents

The implementing session should have these in the repo under `/docs/legal-sources/` (they are the legal grounding for every rule). See `docs/legal-sources/README.md` for the index.

- `dpdp-web-data-map.md` — engineering reference mapping web data collection to the Act and Rules. **This is the primary source for the rule catalogue and tracker categories.** Its Part 2 (categories C1–C10 and overlay flags), Part 3 (page-load inventory), Part 4 (vendor table), Part 5 (hard calls H1–H9) and Part 6 (what this means for the scanner) are directly implementable.
- `dpdp-guide.md` — provision-by-provision guide to the Act.
- The Act (Act 22 of 2023) as `DPDP Act 2023.pdf`, the Rules (G.S.R. 846(E)) as `DPDP Rules 2025.pdf`, the corrigendum (G.S.R. 892(E)) as `DPDP Rules 2025 Corrigendum.pdf`, and the commencement notification (G.S.R. 843(E)) as `DPDP Enforcement Timeline.pdf`. These Gazette PDFs are the primary legal texts; where a project reading disagrees with them, the Gazette wins.

Where this spec and the web data map disagree on legal content, the web data map wins. Where they disagree on product shape, this spec wins.

---

## 1. Product principles

1. **One engine, many surfaces.** The core is a library. CLI, CI mode, agent skill, and the hosted web tool are thin renderers over the same `ScanResult`. Never fork logic per surface.
2. **Certainty over severity.** Findings are grouped and sorted by legal certainty tier. There is no severity field.
3. **Cite or don't claim.** Every finding carries a provision citation and a link to a versioned public rationale page. A finding without a citation is a bug.
4. **Version the interpretation.** Every scan records the version of the rule catalogue it ran against. A change in the law's reading produces a diff on re-scan.
5. **Observation is neutral, interpretation is explicit.** The engine records facts. The mapper applies rules. Keep them in separate modules so the facts can be trusted independently of the reading.
6. **Never attribute to a person.** No author, committer, or individual is named in any output. Findings attribute to systems ("the tag manager container"), never people.
7. **Don't become the breach.** A DPDP tool that leaks personal data in its own output is disqualifying. Redact by default.
8. **No telemetry.** The CLI never phones home. No analytics, no usage pings, no update checks without an explicit flag. Developer trust depends on this.
9. **Say what you can't see.** A crawler cannot observe server-side tagging, backend relays, logs, or retention. Findings that depend on unobservable facts are surfaced as *questions*, not silently omitted.

---

## 2. The certainty model

Two orthogonal axes on every finding.

### 2.1 Certainty tier (interpretive confidence)

| Tier | Meaning | Test |
|---|---|---|
| `settled` | The text of the Act or Rules is clear and its application to this observation needs no interpretation | A competent lawyer would not hedge |
| `arguable` | The provision applies, but its application to this fact pattern is contestable | A competent lawyer would say "probably, but…" and give reasons |
| `open` | No Board guidance, no case law, the text is silent or undefined; the question will be resolved by future orders | A competent lawyer would say "nobody knows yet" |

### 2.2 Enforceability (temporal status)

`enforceable_from: <ISO date>` on every rule. Most substantive obligations under the Act commence **13 May 2027**. A finding whose rule is not yet enforceable is still reported; the date is shown beside it. This axis is separate from certainty because a provision can be perfectly clear and not yet in force.

> Design note: an earlier draft used a fourth tier, "dated", for clear-but-not-yet-enforceable rules. It was dropped because nearly every cookie-relevant obligation commences on the same date, which would have collapsed the tier into "everything". Enforceability is a date field, not a certainty tier.

### 2.3 Observability

`observable: true | false` on every rule. Unobservable rules (retention, server-side tagging, log handling) never produce findings from the engine alone. They produce **questions** in the report and are wired to the hosted tool's questionnaire. See §7.4.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Surfaces (thin renderers)                                   │
│  CLI  ·  --ci mode  ·  /skill (SKILL.md)  ·  hosted (external)│
└───────────────┬──────────────────────────────────────────────┘
                │ ScanResult
┌───────────────▼──────────────────────────────────────────────┐
│  Mapper                                                      │
│  observations × rule catalogue × tracker dataset → findings  │
└───────────────┬──────────────────────────────────────────────┘
                │ Observation[]
┌───────────────▼──────────────────────────────────────────────┐
│  Engine (Playwright)                                         │
│  page load · capture · banner detection · redaction          │
└──────────────────────────────────────────────────────────────┘
       ▲                        ▲
       │                        │
  rules/*.yaml           trackers/*.yaml
  (interpretation)       (classification dataset)
```

### 3.1 Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `engine/` | Launch browser, load URL, capture observations, detect banner, apply redaction | Playwright |
| `rules/` | Rule catalogue as YAML; schema; loader; validator | — |
| `trackers/` | Tracker classification dataset as YAML; schema; matcher | — |
| `mapper/` | Apply rules to observations; produce findings | engine, rules, trackers |
| `report/` | Renderers: terminal, JSON, markdown | mapper |
| `cli/` | Argument parsing, orchestration, exit codes | all |
| `skill/` | `SKILL.md` and supporting files for agent harnesses | cli (invokes it) |

The library entry point is `scan(url, options): Promise<ScanResult>`. The hosted tool (out of scope for this repo) imports this and adds its own PDF renderer.

### 3.2 Technology

- **Language:** TypeScript on Node (LTS). npm is the only distribution channel for v1. No Python wrapper.
- **Browser:** `playwright-core`, not `playwright`. Detect an existing Chrome or Edge on the machine and use it; fall back to downloading Chromium only if none is found, with a clear one-time message. This keeps the `npx` first-run under a few seconds on most developer machines.
- **Rule and dataset format:** YAML files, one per rule / one per tracker, validated against JSON Schema at build time and at load time.
- **Output schema:** JSON Schema published in the repo, versioned. Stable IDs throughout.
- **Tests:** unit tests on the mapper with fixture observations; integration tests against locally served fixture pages with known trackers; schema validation on every rule and tracker file; snapshot tests on JSON output.

---

## 4. Engine

### 4.1 Scan procedure (v0.1: baseline, no interaction)

1. Launch browser with a fresh context (no cookies, no storage).
2. Set headers: default user agent; optionally `Sec-GPC: 1` when `--gpc` is passed (see rule `DPDP-C-050`).
3. Navigate to the URL. Wait for `networkidle` or a configurable timeout (default 15s).
4. Record observations continuously from navigation start (§4.2).
5. Take a screenshot of the viewport (for the hosted PDF; stored only when `--screenshot` is set).
6. Detect a consent banner (§4.3). **Do not interact with it.**
7. Wait a further configurable settle period (default 3s) to catch late-firing tags.
8. Close context. Emit `Observation[]`.

Consent-banner interaction (accept-all / reject-all comparison scans) is **v1, not v0.1**. Design the engine so a second and third pass can be added without restructuring. With `--interact`, `scan()` runs three independent passes (fresh context each) and attaches `interaction` on the load-pass `ScanResult`: findings that survived reject-all, cleared on reject-all, and appeared only after accept-all. The `findings[]` array remains the load pass.

### 4.2 Observations captured

Every observation has: `type`, `timestamp_ms` (relative to navigation start), `before_first_paint: boolean`, `before_banner_detected: boolean`, and type-specific fields.

| Type | Fields | Notes |
|---|---|---|
| `cookie` | name, domain, path, expires, secure, httpOnly, sameSite, first_party, set_by (initiator host if known) | Value is **never** recorded |
| `storage` | kind (`local`/`session`/`indexeddb`), key, first_party | Value is never recorded |
| `request` | method, host, path, initiator_host, resource_type, is_third_party, destination_country | Query string stripped by default; see §4.4 |
| `api_call` | api (`canvas.toDataURL`, `AudioContext`, `navigator.plugins`, `fonts` enumeration, `WebGL` renderer string, `navigator.hardwareConcurrency`, `screen` dimensions in combination) | Fingerprinting signals; instrumented via init script |
| `embed` | host, kind (iframe/script/img/font) | Third-party embeds by tag type |
| `banner` | detected, has_accept, has_reject, has_settings, has_pre_ticked, has_language_switcher, mentions_legitimate_interest, text_excerpt (first 500 chars, redacted), notice_url | See §4.3 and §5.4 |
| `meta` | url, final_url, redirects, page_language, title, scan_started_at, engine_version, rules_version, trackers_version | One per scan |

`destination_country` is resolved from the request host via a bundled, periodically updated IP-geolocation-to-country lookup (offline, no network call). Record the source and date of the lookup data in `meta`.

### 4.3 Banner detection

Heuristic, not interaction. Detect a consent banner via a combination of:

- Known CMP signatures (OneTrust, Cookiebot, CookieYes, Osano, Quantcast, and others — maintain as a list in `trackers/` under category C10)
- DOM heuristics: fixed-position element appearing after load, containing consent-related vocabulary in any of the Eighth Schedule languages plus English
- Button text classification: accept / reject / settings / language switcher
- Pre-ticked state: checked checkboxes or toggles inside the banner region
- Presence of "legitimate interest" or equivalent phrasing (IAB TCF vocabulary)

Record confidence on the banner observation (`detection_confidence: high | medium | low`). Findings derived from banner state inherit that confidence and display it.

### 4.4 Redaction (default on)

- Request URLs: record scheme, host, path only. Strip query strings and fragments. `--include-query` re-enables them for local runs and prints a warning.
- Never record cookie or storage values.
- Banner `text_excerpt` is passed through a redactor that masks email-like, phone-like, and long-numeric tokens before storage.
- Screenshots are off by default and, when enabled, are not embedded in JSON — written to a separate file.
- No form field values, ever. The engine does not type into forms in v0.1 and must not in any later version without explicit spec change.

---

## 5. Rule catalogue

### 5.1 Rule schema

One YAML file per rule in `rules/`. Filename is the rule ID.

```yaml
id: DPDP-C-001                  # stable, never reused
title: Advertising tracker fires before any consent interaction
certainty: settled              # settled | arguable | open
enforceable_from: "2027-05-13"
observable: true
provisions:
  - "s.4(1)"
  - "s.5(1)"
  - "s.6(1)"
flags: [PRE, 3PF]               # overlay flags from the web data map
categories: [C6]                # tracker categories this rule applies to
owner: engineering              # engineering | marketing | counsel | product
penalty_band: consent_notice    # maps to the Schedule; only displayed for settled rules
detection:
  match: request
  where:
    tracker_category: C6
    before_banner_detected: true
needs_input: []                 # facts the scanner cannot observe (see §7.4)
rationale_plain: >
  Advertising trackers collect a persistent browser identifier, your IP address
  and the pages you visit, and send them to a company that uses them for its
  own purposes. Under DPDP that is processing of personal data. It needs your
  consent, and consent has to come before the processing starts, not after.
rationale_dev: >
  A request to a C6 vendor was observed before any consent banner was detected
  (or before any interaction, once interaction scans are enabled). s.6(1)
  requires a clear affirmative act before processing; s.5(1) requires notice
  to precede or accompany the consent request. Firing on page load satisfies
  neither. The vendor is an independent or joint Data Fiduciary for this
  disclosure (s.2(i)), so s.11(1)(b) also requires it to be named.
remediation_summary: >
  Gate the tag behind a consent signal so it does not load until an
  affirmative act is recorded.
explainer_url: https://sentinel.vettam.ai/rules/DPDP-C-001
since: "0.1.0"
changelog:
  - version: "0.1.0"
    date: "2026-09-15"
    note: Initial rule.
```

Rules are validated against `rules/schema.json` at build time. A rule that fails validation fails the build. Missing `provisions`, missing `rationale_plain`, or missing `explainer_url` are validation errors.

### 5.2 Catalogue versioning

`rules/VERSION` holds the catalogue version (semver). Any change to any rule's `certainty`, `provisions`, `rationale_*`, or `enforceable_from` requires a changelog entry and a version bump. Additive rules bump minor; changes to existing rules bump minor with an entry; removals bump major. The catalogue version is stamped on every `ScanResult`.

### 5.3 Initial rule tranche

Rule IDs are reserved in blocks: `001–019` consent and notice, `020–029` cross-border and vendor role, `030–039` identifiers and personal-data status, `040–049` children and unobservable obligations, `050–059` signals and withdrawal, `060–069` fingerprinting and security.

**v0.1 ships settled-tier rules only.** Arguable and open rules are drafted alongside but released in v0.3 (§9). Rationale: the settled tier establishes the tool as sharp; the hedged tiers then read as rigour rather than uncertainty.

#### Settled — v0.1

| ID | Title | Provisions | Detection |
|---|---|---|---|
| C-001 | Advertising tracker (C6) fires before any consent interaction | s.4(1), s.5(1), s.6(1) | request to C6 vendor with `before_banner_detected` |
| C-002 | Non-essential trackers present, no consent banner detected at all | s.5(1), s.6(1) | any C4/C5/C6/C9 tracker and `banner.detected == false` |
| C-003 | Banner offers a "legitimate interest" basis | s.4(1), s.7 (closed list) | `banner.mentions_legitimate_interest` |
| C-004 | Banner has an accept control but no equivalent reject control | s.6(1) "free … unconditional"; s.6(4) withdrawal with comparable ease | `banner.has_accept && !banner.has_reject` |
| C-005 | Pre-ticked consent toggles | s.6(1) "clear affirmative action" | `banner.has_pre_ticked` |
| C-006 | Consent implied by continued browsing or scrolling | s.6(1) | banner text matches implied-consent vocabulary |
| C-007 | Session replay / heatmap tool (C5) fires before consent | s.6(1); s.9(3) where KIDS | request to C5 vendor with `before_banner_detected` |
| C-013 | Session replay or heatmap tool present at all | s.6(1) — behavioural monitoring requires consent | any C5 tracker |
| C-009 | No language option beyond English in the notice/banner | s.5(3), s.6(3) — Eighth Schedule languages | `!banner.has_language_switcher` and `page_language == en` |

Notes for implementers: C-004 through C-006 depend on banner detection confidence; display it. C-009 is a heuristic (a site may provide language choice elsewhere); mark `detection_confidence` accordingly and phrase the finding as "we could not find".

#### Arguable — drafted now, released v0.3

| ID | Title | Provisions | Basis in web data map |
|---|---|---|---|
| C-010 | Analytics tracker (C4) fires before consent | s.4, s.6(1); s.17(2)(b) statistics exemption | H3 — aggregate-only analytics may fall outside the Act; per-user analytics does not |
| C-015 | External font or CDN request discloses IP to a third party with no processor contract inferable | s.8(2); s.7(a) | H1 — passive IP disclosure; Part 4 CDN row |
| C-030 | Pseudonymous client ID (`_ga`, `_fbp`, etc.) treated as personal data | s.2(t) | Part 0 — "identifiable … in relation to" |
| C-031 | Essential/session cookies relying on an unstated s.7(a) basis | s.7(a), Rule 3 | Part 1 — no strictly-necessary exemption; s.7(a) must be documented |
| C-060 | Fingerprinting API calls observed | s.6(1) "informed"; s.6(4) withdrawal near-impossible | Flag FP |
| C-061 | Session cookie lacks `Secure` / `HttpOnly` / `SameSite` | s.8(5), Rule 6(1) "reasonable security safeguards" | Rule 6 checklist; specific flags are inference |
| C-062 | Third-party script loaded without Subresource Integrity | Rule 6(1)(g) | Part 4 CDN row — SRI as a Rule 6 control is inference |

#### Open — drafted now, released v0.3

| ID | Title | Provisions | Basis |
|---|---|---|---|
| C-020 | Third-party endpoint resolves outside India | s.16 (permitted by default); Rule 13(4) SDF localisation | **Not a contravention.** Reported as inventory with the note that transfer is permitted unless the destination is notified. Becomes relevant only under SDF designation, criteria not yet specified. This rule exists specifically to *correct* the GDPR-trained assumption that cross-border = problem. |
| C-041 | Access logs as "traffic data" under the one-year retention floor | Rule 8(3), Rule 13(4) | Undefined term; IT Act s.69B is the likely anchor. `observable: false` → question. |
| C-050 | `Sec-GPC: 1` sent, trackers fired anyway | s.7(a) "has not indicated … that she does not consent" | H9 — DPDP is silent on browser signals; the argument is plausible. Only evaluated with `--gpc`. |

#### Children — special handling

| ID | Title | Provisions | Handling |
|---|---|---|---|
| C-040 | Behavioural tracking or targeted advertising on a site plausibly reaching under-18s | s.9(3) — absolute, consent cannot lift it | The *law* is settled. Whether the site reaches children is **unobservable**. Emit as `certainty: settled`, `needs_input: [reaches_minors]`. In CLI output it renders as a conditional: "If this site is used by people under 18, then…". In the hosted tool it becomes a questionnaire item. |

### 5.4 Cross-repo hand-off

The rule catalogue is deliberately narrow. Notice *content* checks (itemisation, standalone-ness, withdrawal link, complaint mechanism under Rule 3) belong to `dpdp-notice-lint`. This scanner captures `banner.text_excerpt` and the notice URL if found, and the markdown/JSON output includes a pointer suggesting the notice linter for content checks. Do not duplicate Rule 3 logic here.

The tracker dataset's `notice_itemisation` field (§6) is the bridge: the scanner produces the inventory, the notice linter checks the published notice itemises each item.

---

## 6. Tracker classification dataset

One YAML file per tracker in `trackers/`. Schema per the web data map Part 6:

```yaml
id: meta-pixel
vendor: Meta Platforms
match:
  cookies: ["_fbp", "_fbc"]
  hosts: ["connect.facebook.net", "www.facebook.com"]
  paths: ["/tr", "/tr/"]
data_points: [persistent_browser_id, click_id, ip_address, user_agent, page_url, event_name, hashed_email_optional]
category: C6
flags: [3PF, XFER, KIDS, PRE, SENS]
role: independent_or_joint_fiduciary
lawful_basis: consent
provisions: ["s.6(1)", "s.9(3)", "s.11(1)(b)", "s.16", "Rule 3(b)"]
notice_itemisation: >
  Browser identifier, ad-click identifier, IP address, device and browser
  details, pages visited and actions taken, and optionally a hashed email
  address, shared with Meta Platforms for ad measurement and targeting.
destination_countries: [US]
fires_pre_consent_by_default: true
withdrawal_mechanism: "Stop firing; clear _fbp/_fbc; request deletion via vendor tools."
last_verified: "2026-09-15"
```

**Categories** (C1–C10) and **overlay flags** (KIDS, 3PF, PROC, XFER, DEC, SENS, FP, PRE, PII-LEAK) are defined in the web data map Part 2 and must be used exactly as defined there. Do not invent new ones without updating the data map.

**Seed set for v0.1** — cover the vendor table in the web data map Part 4: GTM, Tealium, GA4, Adobe Analytics, Mixpanel, Amplitude, PostHog, Matomo, Meta Pixel, Google Ads, LinkedIn Insight, TikTok Pixel, X Pixel, Criteo, Segment, RudderStack, Hotjar, Microsoft Clarity, FullStory, Intercom, Zendesk, Freshchat, Tawk.to, reCAPTCHA, Turnstile, hCaptcha, Razorpay, PayU, Stripe, Google Sign-In, YouTube embed, Vimeo embed, Google Maps embed, Google Fonts, cdnjs, jsDelivr, Font Awesome kits, OneTrust, Cookiebot, CookieYes. Roughly 40 records. Indian vendors (Razorpay, PayU, CleverTap, MoEngage, WebEngage, Freshworks products) are a priority since global lists under-cover them.

**Unclassified trackers.** A third-party host with no dataset match is still reported, under category `UNCLASSIFIED`, with the finding text "an unmapped purpose cannot lawfully continue" (web data map §2.3). This is a feature: it prompts dataset contributions.

**Data provenance.** Do not seed from EasyPrivacy, Open Cookie Database, DuckDuckGo Tracker Radar or similar lists until their licence terms have been checked and recorded in `trackers/PROVENANCE.md`. Each record must cite where its classification came from (vendor documentation, direct observation, or a named list with compatible terms). See §11 on licensing.

---

## 7. Findings and output

### 7.1 Finding object

```json
{
  "id": "f_01J9...",                        
  "rule_id": "DPDP-C-001",
  "certainty": "settled",
  "enforceable_from": "2027-05-13",
  "observable": true,
  "detection_confidence": "high",
  "provisions": ["s.4(1)", "s.5(1)", "s.6(1)"],
  "flags": ["PRE", "3PF"],
  "owner": "engineering",
  "tracker": { "id": "meta-pixel", "vendor": "Meta Platforms", "category": "C6" },
  "attributed_to": "tag manager container (googletagmanager.com)",
  "evidence": [
    { "type": "request", "host": "www.facebook.com", "path": "/tr", "timestamp_ms": 412, "before_first_paint": true, "before_banner_detected": true, "initiator_host": "www.googletagmanager.com", "destination_country": "US" }
  ],
  "rationale_plain": "…",
  "rationale_dev": "…",
  "remediation_summary": "…",
  "explainer_url": "https://sentinel.vettam.ai/rules/DPDP-C-001",
  "needs_input": []
}
```

`attributed_to` is always a system or host. Never a person.

### 7.2 ScanResult

```json
{
  "schema_version": "1.0.0",
  "engine_version": "0.1.0",
  "rules_version": "0.1.0",
  "trackers_version": "0.1.0",
  "interpretation_as_of": "2026-09-15",
  "scanned_at": "…",
  "target": { "url": "…", "final_url": "…", "page_language": "en" },
  "banner": { "detected": true, "confidence": "high", "has_accept": true, "has_reject": false, "…": "…" },
  "inventory": {
    "cookies": [ … ],
    "storage": [ … ],
    "third_party_hosts": [ { "host": "…", "tracker_id": "…", "category": "C6", "country": "US", "first_seen_ms": 412, "before_banner": true } ],
    "fingerprinting_apis": [ … ],
    "unclassified_hosts": [ … ]
  },
  "findings": [ … ],
  "questions": [ … ],
  "summary": {
    "by_certainty": { "settled": 2, "arguable": 4, "open": 1 },
    "third_parties": 11,
    "third_parties_outside_india": 6,
    "fired_before_banner": 8
  },
  "limits": [
    "Server-side tagging, backend relays, logs and retention are not observable by a crawler.",
    "Consent-banner interaction was not performed; findings reflect the page state before any user action."
  ],
  "interaction": {
    "performed": false,
    "accept_clicked": false,
    "reject_clicked": false,
    "accept_findings": 0,
    "reject_findings": 0,
    "survived_reject": [],
    "cleared_on_reject": [],
    "appeared_on_accept": []
  }
}
```

### 7.3 Renderers

**Terminal** (default). Compact, grouped by certainty tier, one line per finding, provisions right-aligned, enforceability date on each. Summary line with count and a single explainer URL. No colour in `--ci`. Never print rupee penalty figures in the terminal.

```
dpdp-cookie-scan  staging.acme.in     interpretation as of 2026-09-15

How sure the law is
  settled    The Act or Rules are clear. Applying them needs no interpretation.
  arguable   The provision applies, but applying it to this fact is contestable.
  open       No Board guidance and no case law. The text is silent; resolved later.

SETTLED (2)                                         enforceable 2027-05-13
  DPDP-C-001  Advertising tracker fires before any consent interaction  [high]
              Meta Platforms (meta-pixel)  s.4(1) s.5(1) s.6(1)
  DPDP-C-004  Banner has accept but no reject control  [high]  s.6(1) s.6(4)

QUESTIONS ON THE LAW (1)
  Subjective or unobservable questions to keep for later. These are not findings.
  DPDP-C-040  If this site is used by people under 18, then…          s.9(3)

11 third parties · 6 outside India · 8 fired before the banner
Rationale for each rule: https://sentinel.vettam.ai/rules/<id>
Notice content checks: run dpdp-notice-lint against your published notice.
Save this report as a markdown file by running:
  dpdp-cookie-scan https://staging.acme.in --md
That creates ./dpdp-scan/findings.md in the folder where you run the command.
```

**JSON** (`--json`, or always in `--ci`). The full `ScanResult`, schema-validated.

**Markdown** (`--md`). For PR comments and issues. Same grouping as terminal. Each finding is a collapsible block: title, provisions, one-paragraph `rationale_dev`, evidence table, explainer link.

Rupee penalty bands appear in **no** developer-facing output. They are a hosted-PDF concern only, and only for settled findings.

### 7.4 Questions (unobservable rules)

Rules with `observable: false`, or findings with a non-empty `needs_input`, are emitted into `questions[]` rather than `findings[]`. Each question carries the rule ID, the fact needed, and the consequence if true. The CLI prints them under a `QUESTIONS ON THE LAW` header, with a line that these are subjective or unobservable questions to keep for later and are not findings. The hosted tool renders them as a short questionnaire and as the "questions to take to your lawyer" section of the PDF.

When one vendor's traffic matches rules in more than one certainty tier, the CLI prints a `SAME VENDOR, DIFFERENT QUESTIONS` block. Certainty is a property of the rule. The vendor is not scored once.

---

## 8. Surfaces

### 8.1 CLI

```
npx --package=dpdp-cookie-scanner dpdp-cookie-scan <url> [options]

  --json                 write findings.json (default in --ci)
  --md                   write findings.md
  --out <dir>            output directory (default ./dpdp-scan)
  --ci                   machine mode: no colour, no spinner, JSON always, exit 0
  --gpc                  send Sec-GPC: 1 and evaluate DPDP-C-050
  --include-query        keep query strings in request evidence (prints a warning)
  --screenshot           save a viewport screenshot alongside output
  --timeout <ms>         navigation timeout (default 15000)
  --settle <ms>          post-load settle wait (default 3000)
  --rules-version        print catalogue version and exit
  --browser <path>       use a specific Chrome/Edge/Chromium binary
  --interact             three-pass banner interaction (load, accept-all, reject-all)
  --fail-on settled      opt-in CI gate; never trips on arguable or open findings
  --diff-from <json>     with --diff-to, compare two ScanResult files (no crawl)
  --diff-to <json>
```

Exit codes: `0` on a completed scan regardless of findings. `1` only when `--fail-on settled` is set and the scan has at least one **settled** finding (never arguable, open, or questions). `2` on usage error. `3` on navigation failure (site unreachable, timeout). There is **no** default exit code for "findings present".

### 8.2 CI mode

`--ci` is a presentation and behaviour flag, not a different scan. It writes `findings.json` and `findings.md` to `--out`, prints a short plain-text summary, and exits 0. A separate optional GitHub Action (`dpdp-cookie-scan/action`, later) posts `findings.md` as a PR comment and uploads the JSON as an artifact. The Action is a thin wrapper; all logic stays in the CLI.

### 8.3 Agent skill

`/skill/SKILL.md` in the same repo, versioned with the CLI. Contents:

- Frontmatter: name, description written so an agent triggers on "check this site for DPDP tracking issues", "scan cookies for Indian compliance", "what fires before consent on my site", and similar.
- A short statement of the certainty model, so the agent explains tiers correctly.
- Instructions: run `npx --package=dpdp-cookie-scanner dpdp-cookie-scan <url> --json --out <tmp>`, read `findings.json`, summarise findings grouped by certainty, always link `explainer_url`, always append the indicative-not-legal-advice line, never invent provisions not present in the JSON.
- Explicit prohibition: the agent must not describe a site as compliant or non-compliant.
- Pointer to Sentinel for counsel-reviewed analysis.

The skill contains no scanning logic. If the JSON schema changes, the skill's parsing instructions change in the same commit.

### 8.4 Hosted tool (out of scope for this repo; interface only)

Lives in the Sentinel web app. Imports `scan()` from this package. Adds: URL + business-email form (with its own Rule 3-compliant notice and consent record), job queue, PDF renderer, email delivery, scan history, scheduled re-scan with interpretation diff.

The PDF structure is fixed here so the `ScanResult` carries everything it needs:

1. Cover — domain, scan date, interpretation-as-of date, one-line posture
2. The premise — "India has no cookie law" and the five-step inference chain (§0.3)
3. What is happening on your site — plain-English counts from `summary`
4. Findings grouped by certainty tier, each with: what we saw / why it matters / how sure we are / who fixes it / what it costs to leave (settled only)
5. Questions to take to your lawyer — from `questions[]`
6. Appendix — full inventory table from `inventory`
7. Limits — from `limits[]`

The repo must not contain the PDF renderer, email code, or anything that gates output.

---

## 9. Phasing

### v0.1 — "sharp and narrow"

- Engine: baseline scan, all observation types in §4.2, banner detection, redaction, offline country lookup
- Rules: the nine settled rules in §5.3, schema, validator, versioning
- Trackers: ~40 seed records covering the web data map Part 4, schema, validator, `PROVENANCE.md`
- Mapper and the `questions[]` mechanism (C-040 as the first)
- Renderers: terminal and JSON
- CLI with the flag set in §8.1 minus `--gpc`
- Explainer pages live at `sentinel.vettam.ai/rules/<id>` for every shipped rule before the npm publish
- README that explains the certainty model within the first screen
- Tests: fixture pages (including a real-browser scan of the locally served DoD page), mapper unit tests, schema validation, JSON snapshots

**Definition of done:** `npx --package=dpdp-cookie-scanner dpdp-cookie-scan https://<fixture>` produces correct findings against a fixture page containing GTM, GA4, Meta Pixel, Hotjar, and a CookieYes banner with no reject button, in under 10 seconds on a machine with Chrome installed.

### v0.2 — "reach"

- Markdown renderer
- `--ci` mode and the GitHub Action wrapper
- `/skill/SKILL.md`
- `--gpc` flag and rule C-050
- Hosted tool integration point (library API stabilised, `schema_version` 1.0.0 frozen)

### v0.3 — "the honest tiers"

- Arguable and open rules from §5.3 released
- C-020 (cross-border, not a contravention) — the corrective rule
- Fingerprinting instrumentation hardened (C-060)
- Security-flag rules (C-061, C-062)
- Dataset expansion, Indian vendor coverage, community contribution guide

### v1.0 — "interaction and drift"

- Consent-banner interaction: `--interact` runs accept-all and reject-all passes; findings compare the three states (`interaction` on `ScanResult`)
- Interpretation diff: `--diff-from` / `--diff-to` given two `ScanResult`s, separating site changes from rule-catalogue changes
- Opt-in `--fail-on settled` (exit 1); must never trigger on arguable or open findings

---

## 10. Out of scope (do not build)

- Blocking, gating, or enforcement of any kind in v0.x
- Static source-code scanning
- Remediation code generation
- Any statement that a site is or is not compliant
- Telemetry, update checks, or any outbound call from the CLI other than the target URL and its subresources
- Form filling, login, or authenticated scanning
- Multi-page crawling (single URL per invocation in v0.x; a `--pages` option may come later)
- PDF rendering, email, or lead capture (hosted tool)
- Rule 3 notice-content checks (belongs to `dpdp-notice-lint`)

---

## 11. Licensing (decision pending)

Recorded recommendation, not yet decided by the owner:

- **Code:** Apache-2.0. Explicit patent grant; NOTICE file carries attribution.
- **Tracker dataset (`trackers/`):** a share-alike licence (CC BY-SA 4.0 or ODbL), separately declared. The dataset is the durable asset; share-alike turns improvers into contributors.
- **Rule rationale text (`rationale_plain`, `rationale_dev`) and explainer pages:** owned by Vettam; CC BY-ND 4.0 is the suggested middle ground (freely citable with attribution, not forkable into a competing knowledge base).
- **Trademarks:** a short README section reserving the Sentinel and Vettam names and marks, so a fork cannot present itself as the official tool.

Until decided, the repo carries no LICENSE file and is not published. Add `LICENSE`, `trackers/LICENSE`, and the trademark note before the first npm publish.

---

## 12. Repository layout

```
dpdp-cookie-scan/
├── README.md                  # certainty model on the first screen
├── LICENSE                    # pending §11
├── NOTICE
├── package.json
├── src/
│   ├── engine/
│   ├── rules/                 # loader, validator
│   ├── trackers/              # matcher
│   ├── mapper/
│   ├── report/
│   ├── cli/
│   └── index.ts               # export scan()
├── rules/                     # YAML, one per rule + schema.json + VERSION
├── trackers/                  # YAML, one per tracker + schema.json + VERSION + PROVENANCE.md + LICENSE
├── schema/                    # ScanResult JSON Schema, versioned
├── skill/
│   └── SKILL.md
├── docs/
│   ├── legal-sources/         # README index, web data map, guide, Gazette PDFs (Act, Rules, corrigendum, commencement)
│   ├── certainty-model.md
│   └── contributing-rules.md  # how a rule is proposed, cited, tiered and reviewed
└── test/
    ├── fixtures/              # static HTML pages with known trackers, served locally
    ├── engine/
    ├── mapper/
    └── snapshots/
```

---

## 13. Contribution and review rules for legal content

Because the rule catalogue is the product, changes to it are reviewed differently from code:

- Any new rule or any change to `certainty`, `provisions`, or `rationale_*` requires a PR that cites the provision text and, for `arguable` or `open` tiers, states the competing readings.
- Rule PRs require review by a maintainer designated for legal content (not just code review).
- A rule cannot be tiered `settled` if the PR describes a plausible alternative reading.
- Every rule change appears in the catalogue changelog with the date. The changelog is public and is the source for the explainer pages' "what changed" sections.
- Community contributions to `trackers/` are welcome with a provenance line; contributions to `rules/` are welcome but are held to the review bar above.

---

## 14. Open questions for the owner

1. Licence decision (§11).
2. Confirm the explainer URL pattern `sentinel.vettam.ai/rules/<id>` before rules are authored, since it is embedded in every rule file.
3. Whether v0.1 should ship with an English-only banner-vocabulary list or include Eighth Schedule language vocabularies for banner detection from the start. Recommendation: English plus Hindi in v0.1, the rest in v0.3.
4. Whether to name the Data Protection Board's future guidance mechanism in `open`-tier rationale text now, or wait until the Board's first orders. Recommendation: name it, with the date the rationale was written.
5. Confirm the seed-tracker list priority for Indian vendors (§6).

---

## 15. Glossary

| Term | Meaning |
|---|---|
| Act | Digital Personal Data Protection Act 2023 (Act 22 of 2023) |
| Rules | Digital Personal Data Protection Rules 2025 (G.S.R. 846(E)), as corrected by G.S.R. 892(E) |
| Board | Data Protection Board of India |
| Data Fiduciary | The entity determining purpose and means of processing (≈ GDPR controller) |
| Data Processor | Processes on the Fiduciary's behalf |
| Data Principal | The individual |
| SDF | Significant Data Fiduciary, designated under s.10 |
| Eighth Schedule | The 22 languages listed in the Eighth Schedule to the Constitution of India |
| C1–C10 | Data-point categories defined in the web data map Part 2 |
| PRE, 3PF, PROC, XFER, DEC, SENS, FP, KIDS, PII-LEAK | Overlay flags defined in the web data map Part 2.2 |
| Certainty tier | `settled` / `arguable` / `open` — interpretive confidence of a rule |
| Finding | An observation mapped to a rule |
| Question | A rule whose truth depends on a fact the scanner cannot observe |
