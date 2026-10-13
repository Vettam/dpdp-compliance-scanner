# dpdp-compliance-scanner — Product Specification v2

**Status:** v2 spec, agreed 13 October 2026. Slice 1 implemented; slices 2–10 not started.
**Owner:** Vettam (Rylematic Technologies Private Limited), Sentinel product line
**Repo:** npm package `dpdp-compliance-scanner` (Apache-2.0). GitHub repository `Vettam/dpdp-cookie-scanner`.
**Supersedes:** `docs/legal-sources/spec.md` for product shape. That document remains the reference for the page scanner's engine behaviour (§4), the page-shaped rule tranche (§5.3), and the `ScanResult` 1.x schema (§7), all of which v2 keeps.

This document says *what* to build, *why*, and in *what order*. Each slice in §12 is a self-contained brief a coding agent can take without reading the others. Vocabulary is governed by `CONTEXT.md`; decisions that were real trade-offs are recorded in `docs/adr/`. When this document and `CONTEXT.md` disagree on a term, `CONTEXT.md` wins. When this document and a Gazette PDF under `docs/legal-sources/` disagree on the law, the Gazette wins.

---

## 0. Read this first

### 0.1 What changed from v1

v1 was a cookie scanner: one source (a live page), one artefact (`ScanResult`), one reading (the rule catalogue). v2 keeps the reading and widens the sources. The product now records the personal data a product handles, from whichever source it can observe, and maps each item to the DPDP Act 2023 and Rules 2025, reporting how settled the law is.

Three things are new:

1. **The data map.** A source-neutral record of data points, committed to the developer's repository, built by scanners and corrected by people. Every finding, question, and notice draft is derived from it.
2. **The codebase as a source.** A deterministic scanner reads manifests, code, and schema-as-code; a skill walks the developer through what the scanner could not see.
3. **The notice generator.** A skill that drafts a consent notice and a change notice from the data map, with a cover sheet for the lawyer.

Three things are unchanged and must stay unchanged:

- **Certainty over severity.** Every finding carries a certainty tier (`settled`, `arguable`, `open`) and an enforceability date. There is no severity field. See `docs/certainty-model.md`.
- **Observation is neutral, interpretation is explicit.** Scanners record facts. The mapper applies rules. They live in separate modules.
- **Not a verdict, not a gate, not a fix.** The tool never says a product is or is not compliant, never blocks a build by default, never generates remediation code, never phones home.

### 0.2 The inference chain, generalised

v1 §0.3 stated the chain for trackers. It holds for every data point:

1. The product handles an item of data about a person (a cookie, a column, a form field, a log line, an API payload).
2. That item identifies, or can identify, the person (s.2(t), "by or in relation to").
3. Processing it needs a lawful basis (s.4), and the bases are a closed list: consent, or a limb of s.7.
4. So the item needs consent preceded by notice (s.5, s.6), or a documented s.7 basis.
5. Whichever basis carries it, the fiduciary must itemise it in the notice (Rule 3), name who receives it (s.11(1)(b)), erase it when its purpose is served (s.8(7)), and honour access, correction, and erasure (ss.11–12).

The tool shows which links are settled, arguable, or open for each item. That reading is the moat. Scanners are commodity.

### 0.3 Who uses this and why it is free

See ADR-0002. This repository is the funnel for the hosted Sentinel product. Anything that runs in the developer's own environment is free and lives here. Anything that needs us to run a server (GitHub App tokens, scheduled re-scans, drift history, polling non-code sources such as forms, merging data maps across repositories) is paid and lives in the hosted product. Legal vetting of a notice draft is paid because it is counsel.

A solo founder can scan a site, map a codebase, run the Action, and draft a notice without paying. The trigger to pay is a second data source or the wish to see change over time.

---

## 1. Product principles

The nine principles in v1 §1 stand. Two are restated for the wider scope and two are added.

1. **One core, many surfaces.** The core is the data map plus the mapper. CLI, Action, skills, and the hosted product are thin renderers over the same findings. Never fork logic per surface.
5. **Observation is neutral, interpretation is explicit.** Now with a third layer: *assertion*. Developers assert purpose and basis in the data map. The mapper treats an assertion as one more fact to test, never as a conclusion.
10. **Machines detect change; people decide meaning.** Deterministic scanners write and diff. Agents and developers enrich and answer. CI runs only the deterministic part. (ADR-0001)
11. **One map per repository.** The free tier never merges maps across repositories. That merge is the hosted product.

---

## 2. Domain

The glossary is `CONTEXT.md`. The terms that matter most for v2, in the relationships the code must preserve:

```
Source ──(scanned by)──▶ Scanner ──(produces)──▶ Scan
                                                   │
                                      (merged into)│
                                                   ▼
            Vendor ◀──(is a)── Recipient ◀──── Data map ────▶ Data point ──▶ Consent gate
                                                   │                │
                                        (derived)  │                │ (raises)
                                                   ▼                ▼
                                   Finding · Question · Notice draft · Change notice
```

- A **Scan** records what one **Source** exposes at one moment. Sources in v2: `page`, `code`. Later: `database` (live introspection), and in the hosted product, `form` and others.
- The **Data map** merges every scan of one repository. It is the only thing the mapper, the skills, and the notice generator read.
- A **Data point** is one item of personal data with category (`C0`–`C10`), flags, where it was observed, its **Recipients**, and the developer's assertions (purpose, basis, retention).
- A **Consent gate** is where processing waits for the data principal's affirmative act. A data point whose basis is `consent` must sit behind one.
- A **Question** is a fact no scanner can observe. The `dpdp-map` skill puts it to the developer; the answer lives in the map.
- A **Vendor** is a third party recognised by hosts, packages, and signatures. The dataset in `vendors/` describes vendors; a **Recipient** is a vendor a specific data point reaches.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Surfaces (thin)                                                     │
│  dpdp CLI · GitHub Action · skills/dpdp-scan · skills/dpdp-map ·     │
│  skills/dpdp-notice · hosted (external, imports the library)         │
└──────────────┬───────────────────────────────────────────────────────┘
               │ Finding[] · Question[] · DataMapDiff · NoticeDraft inputs
┌──────────────▼───────────────────────────────────────────────────────┐
│  Mapper                                                              │
│  data map × rule catalogue × vendor dataset → findings, questions    │
└──────────────┬───────────────────────────────────────────────────────┘
               │ DataMap (read) · DataPoint[] (write, per scan)
┌──────────────▼───────────────────────────────────────────────────────┐
│  Data map  (.dpdp/data-map.yaml, committed)                          │
│  merge · stable ids · human zone preserved · scanner zone regenerated│
└──────┬──────────────────────────┬────────────────────────────────────┘
       │                          │
┌──────▼──────────┐   ┌───────────▼──────────────┐   ┌────────────────┐
│ Page scanner    │   │ Code scanner             │   │ (v3) DB scanner│
│ Playwright,     │   │ manifests (all) ·        │   │ live schema    │
│ unchanged       │   │ JS/TS · Python           │   │                │
└─────────────────┘   └──────────────────────────┘   └────────────────┘
       ▲                          ▲
  rules/*.yaml               vendors/*.yaml
  (interpretation)           (classification dataset)
```

### 3.1 Modules

| Module | Responsibility | New in v2 |
|---|---|---|
| `src/scanners/page/` | Today's `engine/`. Loads a URL, captures observations, detects the banner, redacts. Also emits its observations as data points. | Moved; emits data points |
| `src/scanners/code/` | Reads a repository: manifests for every ecosystem; code and schema-as-code for JS/TS and Python. Emits data points, recipients, consent gates, retention signals, questions. | New |
| `src/map/` | `DataMap` schema, load/save, stable id derivation, merge of scanner output into the committed file, diff. | New |
| `src/rules/` | Catalogue, schema, loader. Schema gains data-map predicates. | Extended |
| `src/vendors/` | Today's `trackers/`. Dataset schema, loader, matcher by host, package, signature. | Renamed, extended |
| `src/mapper/` | Applies rules to the data map (and, for page scans, to `ScanResult` as today). | Extended |
| `src/notice/` | Notice lint against the data map; the data the `dpdp-notice` skill reads. No drafting logic in code. | Extended |
| `src/report/` | Terminal, JSON, Markdown renderers for findings and for map diffs. | Extended |
| `src/cli/` | `dpdp` bin with sub-commands. | Reshaped |
| `scripts/build-explainers.ts` | Emits explainer page data from rule YAML for the Sentinel site. | New |
| `skills/` | Three skills. Each runs the CLI and reasons over its JSON. No scanning or legal logic. | Extended |
| `action/` | Composite Action: page scan, code scan, map diff, PR comment. | Extended |
| `shim/` | The deprecated `dpdp-cookie-scanner` package, published once by hand. | New |

Library entry points: `scan(url, options): Promise<ScanResult>` (unchanged), `scanCode(path, options): Promise<CodeScan>`, `loadDataMap(path)`, `mergeScan(map, scan)`, `mapFindings(map, rules, vendors)`, `diffDataMaps(a, b)`.

### 3.2 Technology

Unchanged from v1 §3.2: TypeScript on Node 22+, `playwright-core`, YAML datasets validated by JSON Schema, npm as the only channel. Additions: a parser layer for the code scanner (TypeScript compiler API for JS/TS; a Python AST via a bundled, dependency-free tokenizer-level parser or `tree-sitter` WASM grammars, decided in slice 5 with the constraint that `npx` first-run must not need a Python interpreter).

---

## 4. The data map

### 4.1 File

`.dpdp/data-map.yaml` at the repository root. YAML, because developers edit it by hand and the rest of the repo's datasets are YAML. One map per repository (principle 11). Committed.

### 4.2 Two zones

Every record has a **scanner zone** (regenerated on each scan, never hand-edited: `observed`, `signals`, `questions`) and a **human zone** (preserved across scans, edited by the developer or the `dpdp-map` skill: `name`, `purpose`, `basis`, `retention.stated`, `answers`, `notes`). Merging a scan into the map replaces the scanner zone and never touches the human zone. A data point that no scan has observed for N scans is marked `stale: true`, never deleted by a machine.

### 4.3 Shape (`DataMap` schema 1.0.0)

```yaml
schema_version: "1.0.0"
repository: acme/app                       # informational
generated_by:
  package: dpdp-compliance-scanner
  version: "2.1.0"
  rules_version: "0.5.0"
  vendors_version: "1.0.0"

scans:                                     # scanner zone
  - id: scan_page_01J9…
    source: { kind: page, url: "https://acme.in" }
    scanned_at: "2026-10-13T09:00:00Z"
  - id: scan_code_01J9…
    source: { kind: code, path: ".", commit: "febd120" }
    scanned_at: "2026-10-13T09:01:00Z"

data_points:
  - id: dp_users_phone                     # stable, human-readable, never reused
    name: Phone number                     # human zone; scanner proposes, human may rename
    category: C8                           # scanner proposes; human may override with reason
    flags: [SENS]
    observed:                              # scanner zone
      - scan: scan_code_01J9…
        kind: schema_column                # see 4.4
        location: "prisma/schema.prisma:42"
        confidence: high
      - scan: scan_code_01J9…
        kind: input_field
        location: "src/pages/signup.tsx:88"
        confidence: high
    recipients:
      - vendor: razorpay
        role: processor                    # from vendors/*.yaml, human may override
        country: IN
        observed:
          - { scan: scan_code_01J9…, kind: http_call, location: "src/server/pay.ts:17", confidence: medium }
    consent_gate: cg_signup_checkbox       # human zone; scanner proposes if it can prove the path
    purpose: "To contact the customer about their order."      # human zone
    basis: voluntarily_provided            # consent | voluntarily_provided | legal_obligation
                                           # | medical_emergency | employment | state_function | unstated
    retention:
      stated: "Until account deletion, then 30 days."          # human zone
      signals:                             # scanner zone
        - { kind: soft_delete_column, location: "prisma/schema.prisma:44" }
    answers:                               # human zone; keyed by question id
      q_dp_users_phone_purpose: { answered_at: "2026-10-13", by: "developer" }
    stale: false

consent_gates:
  - id: cg_signup_checkbox
    kind: checkbox                         # banner | checkbox | dialog | code_check
    observed:
      - { scan: scan_code_01J9…, location: "src/pages/signup.tsx:120", confidence: high }
    text_excerpt: "I agree to the processing of my data as described in the notice."  # redacted per v1 §4.4

questions:                                 # scanner zone; derived, regenerated
  - id: q_dp_users_notes_meaning
    data_point: dp_users_notes
    rule_id: null                          # scanner-raised, not rule-raised
    ask: "The column users.notes is free text. Does it hold personal data? What kind?"
  - id: q_pkg_unknown_sdk
    rule_id: null
    ask: "The dependency `@acme/telemetry` is not in the vendor dataset. Does it send data outside this repository? To whom?"
```

### 4.4 Observation kinds

Page scanner (from `ScanResult.inventory`): `cookie`, `storage_key`, `request`, `api_call`, `embed`, `banner`.
Code scanner: `package`, `http_call`, `schema_column`, `input_field`, `consent_gate`, `retention_signal`, `rights_endpoint`.

Each observation carries `scan`, `kind`, `location` (URL or `path:line`), `confidence` (`high | medium | low`), and kind-specific detail. Redaction rules from v1 §4.4 apply to every location and excerpt.

### 4.5 Stable ids

Scanners derive ids deterministically from the observation shape so that re-scans match existing records: `dp_<table>_<column>` for columns, `dp_cookie_<name>` for cookies, `dp_input_<form>_<field>` for fields, `dp_vendor_<id>` for vendor-side data points inferred from a vendor record. A human may rename an id once by adding `aliases: [old_id]`; the merge honours aliases.

### 4.6 Assertions and how the mapper reads them

`basis` is the developer's claim. The mapper tests it:

| Data point state | Reading |
|---|---|
| `basis: unstated` on any non-`C0` point | `arguable` finding (today's DPDP-C-031 generalised) |
| `basis: voluntarily_provided` on a `C5` or `C6` point | `settled` finding: s.7(a) cannot carry behavioural or advertising processing |
| `basis: consent` and `consent_gate: null` | `settled` finding: consent claimed but no gate observed; s.6(10) puts the burden of proof on the fiduciary |
| `basis: consent`, gate present, gate has no reject or is pre-ticked | existing banner rules (C-004, C-005), now applied to any gate kind |
| `retention.stated` empty on any stored point | question (block 070) |

The finding never says the claim is false. It says the claim and the Act disagree, cites the provision, and gives the certainty tier.

### 4.7 Diff

`diffDataMaps(a, b)` reports, separately: **site/code drift** (data points, recipients, consent gates, retention signals added or removed) and **catalogue drift** (findings that changed because `rules_version` or `vendors_version` changed). This is today's `ScanResultDiff` generalised; `schema/scanresult-diff.schema.json` gains a sibling `schema/datamap-diff.schema.json`.

---

## 5. Scanners

### 5.1 Page scanner

Behaviour unchanged from v1 §4 (procedure, observations, banner detection, redaction, `--interact`, `--gpc`, `--screenshot`). Two additions:

- After producing `ScanResult`, it emits data points: one per cookie and storage key, one per third-party request host (as a recipient on the data points the vendor record declares), one per fingerprinting API family, one consent gate of kind `banner` when detected. Category and flags come from the vendor record or `UNCLASSIFIED`.
- `ScanResult` stays schema 1.x and is still written as `findings.json`. The data-point emission is additive. (ADR: Q13.)

### 5.2 Code scanner

Two depths, both deterministic, no network calls.

**Manifest level, every ecosystem.** Parse `package.json` and lockfiles, `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `Pipfile.lock`, `Gemfile.lock`, `go.mod`/`go.sum`, `pom.xml`, `build.gradle(.kts)`, `Cargo.lock`, `Podfile.lock`, `Package.swift`, `composer.lock`, `pubspec.lock`. Match each dependency against `vendors/*.yaml` `packages.<ecosystem>`. A match produces a recipient on the vendor's declared data points with `confidence: medium` and `kind: package`. A dependency that is not matched and whose name or description suggests outbound data (analytics, tracking, pixel, telemetry, crm, email, sms, push, payment, auth, ads, logging) produces a question. Everything else is ignored.

**Code level, JS/TS and Python.** The scanner looks for:

| What | How (JS/TS) | How (Python) | Emits |
|---|---|---|---|
| Outbound HTTP to a vendor host | `fetch`, `axios`, `got`, `node-fetch`, `XMLHttpRequest`, `navigator.sendBeacon` with a literal or constant URL | `requests`, `httpx`, `aiohttp`, `urllib` with a literal or constant URL | `http_call` recipient, `confidence: high` if literal, `medium` if constant, question if dynamic to a vendor-looking variable |
| Schema-as-code | Prisma, Drizzle, TypeORM, Sequelize, Knex migrations, raw `.sql` | Django models, SQLAlchemy, Alembic, raw `.sql` | one `schema_column` data point per column whose name or type matches the personal-data vocabulary (`vendors/vocabulary/personal-data.yaml`, new), `C8` by default; `SENS` flag on health, financial, caste, religion, biometric, government-id vocab |
| Input shapes | JSX/TSX `<input name=…>`, Zod, Yup, react-hook-form, Formik | Django forms, Pydantic, WTForms, DRF serializers | `input_field` data point, linked to a `schema_column` of the same name when one exists |
| Consent gates | CMP SDKs (from vendor signatures), consent checkboxes near sign-up/submit, branches on `consent`/`hasConsent`/`optIn` identifiers around an outbound call | same identifiers; Django/DRF middleware patterns | `consent_gate`; and a proposed `consent_gate` link on data points whose call sits inside the gated branch, `confidence: medium` |
| Retention signals | `deleted_at`, `expires_at`, `ttl`, TTL indexes, cron or scheduled deletion jobs, S3/GCS lifecycle config | same, plus Celery beat, Django management commands scheduled in cron files | `retention_signal` on the owning data point |
| Rights endpoints | routes or handlers whose path or name contains export/download-my-data, delete-account, erase, correct/update-profile | same (Django URLs, FastAPI/Flask routes) | `rights_endpoint` observation on the map (not on one data point), used by block 080 |

Everything the code scanner cannot resolve becomes a question. The scanner never reads `.env` values, secrets, or test fixtures as data; it may read `.env.example` keys to detect vendor presence.

**Out of scope in v2:** Go, Java, Kotlin, Swift, Ruby, PHP at code level (manifest level covers them); live database introspection (v3 `database` source); form providers and non-code sources (hosted product).

### 5.3 Redaction

v1 §4.4 applies to every scanner. The code scanner additionally never copies string literals longer than 80 characters, never copies anything that matches an API-key or token shape, and reports `location` as `path:line`, never the line's content.

---

## 6. Rule catalogue

### 6.1 Schema extensions

`rules/schema.json` gains:

- `sources: [page, code, database]` — which sources the rule reads. Existing rules get `sources: [page]`.
- `detection.match` gains `data_point`, `recipient`, `consent_gate`, `map` (whole-map predicates such as "no rights endpoint exists").
- `detection.where` gains `source_kind`, `category`, `category_in`, `flags_any`, `basis`, `basis_not`, `consent_gate_present`, `consent_gate_kind`, `retention_stated`, `retention_signal_any`, `recipient_role`, `recipient_country_not`, `rights_endpoint_present`, `observation_kind`.
- `needs_input` stays; questions raised by a rule continue to flow into `questions[]`.

Every existing predicate keeps working against `ScanResult` so the page path is untouched.

### 6.2 New blocks (v2)

Drafting starts in slice 3; each rule lands only after review under `docs/contributing-rules.md` with `owner: counsel` on tier assignment. Explainer fields are mandatory (slice 2 enforces this in CI).

**`070–079` Retention and erasure**

| ID | Title (working) | Provisions | Tier | Detection |
|---|---|---|---|---|
| C-070 | Stored personal data has no stated retention | s.8(7) | question | `retention_stated: false` on any stored point |
| C-071 | Stored personal data has no observable deletion path | s.8(7), s.6(6) | `arguable` | `retention_signal_any: false` and `retention_stated` present (so the claim exists, the mechanism does not) |
| C-072 | One-year retention floor may apply | Rule 8(3), Third Schedule | `arguable` + `needs_input: [fiduciary_class]` | any stored point; the floor binds only e-commerce ≥ 2 crore users, gaming ≥ 50 lakh, social media ≥ 2 crore |
| C-073 | Withdrawal does not propagate to processors | s.6(6) | question | any recipient with `role: processor` on a `basis: consent` point |

**`080–089` Data principal rights**

| ID | Title (working) | Provisions | Tier | Detection |
|---|---|---|---|---|
| C-080 | No way for a person to obtain a summary of their data | s.11(1)(a) | `settled` that the right exists; `arguable` whether absence of an endpoint is a contravention; emitted as `arguable` | `rights_endpoint_present: access = false` and any `C8` point |
| C-081 | No way for a person to request erasure | s.12(1), s.12(3) | as above | `rights_endpoint_present: erase = false` |
| C-082 | No way for a person to correct their data | s.12(1) | as above | `rights_endpoint_present: correct = false` |
| C-083 | Recipient list is not derivable for a person | s.11(1)(b) | `settled` | any point with recipients whose vendor record lacks `notice_itemisation` |
| C-084 | No grievance contact observable | s.13, Rule 9 | question | no grievance text in any consent gate or notice; hands off to notice lint |

**`090–099` Recipients, processors, consent records**

| ID | Title (working) | Provisions | Tier | Detection |
|---|---|---|---|---|
| C-090 | Processor receives personal data; contract not observable | s.8(2), Rule 6(1)(f) | question | any recipient with `role: processor` |
| C-091 | Consent claimed, no consent gate observed | s.6(1), s.6(10) | `settled` | `basis: consent` and `consent_gate_present: false` |
| C-092 | Consent claimed, no consent record kept | s.6(10), C10 | `settled` | `basis: consent` and no `C10` data point in the map |
| C-093 | s.7(a) claimed for behavioural or advertising processing | s.7(a), s.6(1) | `settled` | `basis: voluntarily_provided` and `category_in: [C5, C6]` |
| C-094 | Recipient outside India (permitted by default) | s.16 | `open` | generalises C-020 to code-observed recipients; same corrective note |

**Deferred to v3:** breach notification (s.8(6), Rule 7); SDF obligations (s.10, Rule 13).

### 6.3 Versioning

Unchanged (v1 §5.2). `rules/VERSION` is its own semver line; the package major bump to 2.0.0 does not reset it. Adding block 070–090 is a minor bump of the catalogue.

---

## 7. Vendor dataset

`trackers/` becomes `vendors/`; the record is a **Vendor**. Every existing field is kept. Additions:

```yaml
packages:
  npm: ["@segment/analytics-next", "analytics-node"]
  pypi: ["analytics-python", "segment-analytics-python"]
  maven: ["com.segment.analytics.java:analytics"]
  go: ["gopkg.in/segmentio/analytics-go.v3"]
  rubygems: ["analytics-ruby"]
  cocoapods: ["Analytics"]
role: processor | fiduciary | depends_on_configuration    # replaces the free-text role; drives the s.8(2) question
```

`vendors/VERSION` becomes `1.0.0`. `trackers/` remains for one release as a symlink or a loader alias so open contributor PRs do not break. `PROVENANCE.md` and the CC BY-SA 4.0 licence move unchanged. A new `vendors/vocabulary/personal-data.yaml` holds the column and field vocabulary the code scanner uses (name, kind, default category, flags), with its own provenance notes.

---

## 8. Notice

### 8.1 Notice draft (skill `dpdp-notice`)

Input: the data map. Output: a consent notice addressed to the data principal (s.5(1), Rule 3), plus a cover sheet for the lawyer. The skill:

- Itemises only data points in the map. It may not add a data point the map lacks; if the map is thin, the notice is thin, and the cover sheet says so.
- Writes one itemised line per data point: what, why (from `purpose`), who receives it (from recipients, using the vendor's `notice_itemisation`), how long (from `retention.stated`).
- Leaves blanks the fiduciary must fill: withdrawal mechanism, grievance officer, how to complain to the Board, the Eighth Schedule language text. Blanks are marked, never invented.
- Opens with one line saying it is a draft pending counsel review.
- The cover sheet traces each sentence to a data point id and location, lists every open question, and lists every finding the mapper raised against the asserted bases.

### 8.2 Change notice (skill `dpdp-notice`, given a diff)

Input: a data map diff. Output: a notice to existing data principals (s.5(2); fresh consent under s.6 where a purpose is new). The skill distinguishes: new data point under an existing purpose (notice), new purpose (notice and fresh consent), new recipient (notice, s.11(1)(b)), removed data point (optional good-news notice). Same blanks, same cover sheet.

### 8.3 Notice lint (`dpdp notice lint`)

Today's `dpdp-notice-lint`, retargeted to read the data map instead of `findings.json`: each data point itemised, each recipient named, withdrawal and grievance present, English plus Devanagari (or another Eighth Schedule script) present. Deterministic. Never drafts.

### 8.4 Out of scope

Terms and conditions (not a DPDP instrument). Legal opinion. Any claim the notice is compliant.

---

## 9. Surfaces

### 9.1 CLI

One bin, `dpdp` (ADR-0003).

```
dpdp scan page <url> [--json] [--md] [--out <dir>] [--ci] [--gpc] [--include-query]
                     [--screenshot] [--timeout <ms>] [--settle <ms>] [--browser <path>]
                     [--interact] [--fail-on settled] [--no-map]
dpdp scan code [path] [--json] [--md] [--out <dir>] [--ci] [--fail-on settled|unmapped] [--no-map]
dpdp map init                      # create .dpdp/data-map.yaml
dpdp map show [--json]             # render the map with findings and questions
dpdp map questions [--json]        # open questions only (what dpdp-map walks through)
dpdp map diff [--from <ref|file>] [--to <ref|file>] [--json] [--md]   # drift, site vs catalogue
dpdp notice lint <url|file> [--json] [--ci]
dpdp explain <rule-id>             # terse rule rendering ending with the explainer URL
dpdp version                       # package, rules, vendors versions
```

`scan page` and `scan code` write their observations into `.dpdp/data-map.yaml` unless `--no-map`; both still write `findings.json`/`findings.md` to `--out` as today.

Exit codes unchanged: `0` completed; `1` `--fail-on` tripped; `2` usage; `3` navigation or unreadable repository. `--fail-on` accepts `settled` (the only legal gate) and, for `scan code` and `map diff`, `unmapped` (the only bookkeeping gate: the scanner observed something the committed map does not account for). Drift in findings never fails a build.

### 9.2 GitHub Action

`action/` runs `dpdp scan page --ci` (when `url` is given) and `dpdp scan code --ci` (when `code: true`), then `dpdp map diff --from <base> --to <head>` on pull requests, uploads JSON and Markdown as an artefact, and posts or updates one PR comment containing findings by tier and the drift table. Interpretation stays in the CLI. Grant `pull-requests: write`. The job succeeds on a completed scan even when findings exist; `fail-on` input forwards to the CLI.

### 9.3 Skills

Three, under `skills/<name>/SKILL.md`, each thin, with no scanning or legal logic. If a JSON schema changes, the skill's parsing instructions change in the same commit.

| Skill | Trigger | Behaviour | Interactive |
|---|---|---|---|
| `dpdp-scan` | "check this site for DPDP issues" | Today's skill, on the new command. | No |
| `dpdp-map` | "map what my codebase collects", "answer the DPDP questions" | Runs `dpdp scan code`, reads `dpdp map questions`, walks the developer through each question, writes answers and assertions into the human zone, re-runs `dpdp map show`, summarises findings by tier. | Yes |
| `dpdp-notice` | "draft our consent notice", "what do we tell customers about this change" | Reads the map (or a diff), produces the notice draft or change notice and the cover sheet (§8). Refuses to add data points not in the map. | No |

### 9.4 Explainers

`scripts/build-explainers.ts` reads the rule YAML and emits one JSON document per rule (title, tier, provisions, rationale, enforceable date, changelog, the questions it raises, related rules). The Sentinel site runs it at deploy, pinned to a catalogue version, and builds `/rules/<id>`. The rendered pages live **only** on the site (SEO and traffic); nothing rendered is committed here or published to npm. CI in this repo fails when any shipped rule lacks a field the builder needs. `dpdp explain` stays terse and ends with the URL.

FAQs are website content and out of scope here. The `faqs` table in the Vettam legal workspace is unrelated to this product.

### 9.5 Hosted product (out of scope; interface only)

Imports the library. Adds: GitHub App connection across repositories, scheduled re-scans, drift history, non-code sources (forms), merge of many maps into one, PDF, counsel review. Reads `DataMap` 1.0.0 and `Finding` as published here. Nothing in this repo may hold credentials for a third party, phone home, or gate output.

---

## 10. Output schemas

- `schema/scanresult.schema.json` — **1.x, unchanged.** Page scan output.
- `schema/datamap.schema.json` — **1.0.0, new.** The committed data map.
- `schema/datamap-diff.schema.json` — new.
- `schema/finding.schema.json` — extracted from `ScanResult` so code-derived findings share the exact shape (rule id, tier, provisions, evidence, explainer URL, `attributed_to`). `evidence[]` gains the code observation kinds.
- `schema/scanresult-diff.schema.json` — unchanged.

Findings derived from a `code` source never exist on their own; they are always a view over the map.

---

## 11. Licensing and release

- Code Apache-2.0; `vendors/` CC BY-SA 4.0; rule rationale and explainers CC BY-ND 4.0 (owned by Rylematic Technologies); DB-IP Lite CC BY 4.0. Unchanged.
- Release train unchanged: push to `main` → changesets version PR → publish. `package.json` `name` is `dpdp-compliance-scanner`; a `major` changeset makes the first release **2.0.0**. `package.json` stays at `1.0.0` until that version PR, because a major bump of the published `0.5.2` would stop at `1.0.0` and the shim depends on `>=2`. The name is free on npm as of 13 October 2026. The `NPM_TOKEN` owner will own the new package. The GitHub repository remains `Vettam/dpdp-cookie-scanner`; Action examples use `Vettam/dpdp-cookie-scanner/action@v2`.
- The shim `shim/` is published **once by hand** as `dpdp-cookie-scanner@1.0.0` (depends on `dpdp-compliance-scanner@>=2`, forwards `dpdp-cookie-scanner`, `dpdp-cookie-scan`, `dpdp-notice-lint` to `dpdp scan page` and `dpdp notice lint`), then `npm deprecate`d with a message pointing to the new name. It is outside the changesets train and never published again.

---

## 12. Slices

Each slice leaves `main` releasable, has its own changeset, and has a definition of done a coding agent can verify without asking. Slices 1 and 2 are independent of each other. Slice 8 (rules) starts drafting at slice 3 and lands when counsel has reviewed; it is the only slice with an external clock.

### Slice 1 — Rename and reshape

**Status:** implemented 13 October 2026.

**Goal.** Ship the new name and the `dpdp` bin with no new behaviour.

**Build.**
- `package.json`: `name: dpdp-compliance-scanner`, `bin: { dpdp: ./dist/cli.js }`, `major` changeset.
- `src/cli/`: sub-command router (`citty` supports it) with `scan page`, `notice lint`, `map diff` (over two `ScanResult` files, exactly today's `--diff-from/--diff-to`), `explain` (today's terminal rendering of one rule plus URL), `version`. Every existing flag keeps its name and default.
- `shim/`: package `dpdp-cookie-scanner`, `dependencies: { dpdp-compliance-scanner: ">=2" }`, three bin files that `execFileSync` the new bin with the translated sub-command. README in `shim/` with the one-time publish and deprecate steps.
- `action/`: call the new command; `uses:` examples updated to `@v2`.
- `skill/SKILL.md` moves to `skills/dpdp-scan/SKILL.md` and calls `npx dpdp-compliance-scanner scan page`.
- README rewritten to the new install line; `CHANGELOG.md` via changeset; `docs/legal-sources/spec.md` header notes it is superseded for product shape by this document.

**Do not.** Add the data map, change `ScanResult`, change any rule or vendor file, rename `trackers/`.

**Done when.** `npx dpdp-compliance-scanner scan page <fixture>` produces byte-identical `findings.json` (ignoring `engine_version`) to `dpdp-cookie-scan <fixture>` at 0.5.2; `dpdp notice lint` and `dpdp map diff` match their predecessors on the test snapshots; all existing tests pass under the new paths; the shim's three bins forward correctly when installed from a local tarball; the Action's e2e job passes on the new command.

### Slice 2 — Explainer builder and CI contract

**Goal.** Make it impossible to ship a rule the website cannot render, and give the site a build input.

**Build.**
- `scripts/build-explainers.ts` → `dist/explainers/<rule-id>.json` (not committed, not in `files`), one per rule: id, title, tier, provisions, `rationale_plain`, `rationale_dev`, `enforceable_from`, `observable`, `needs_input`, `since`, `changelog`, `related` (rules sharing a provision or category), `questions` (text of any question the rule raises).
- A test that fails if any rule lacks a field the builder needs, or if `explainer_url` does not equal `EXPLAINER_URL_BASE + id`.
- `npm run build:explainers` documented for the website team; a short `docs/explainers.md` describing the JSON contract and that rendered pages live only on the site.

**Do not.** Commit rendered Markdown or HTML; add explainer output to the npm `files`.

**Done when.** `npm run build:explainers` emits 19 JSON files that validate against a committed `schema/explainer.schema.json`; deleting `rationale_plain` from any rule fails CI; `dpdp explain DPDP-C-001` ends with `https://sentinel.vettam.ai/rules/DPDP-C-001`.

### Slice 3 — `DataMap` 1.0.0

**Goal.** The artefact. Page scans write into it; nothing reads from it yet except `map show`.

**Build.**
- `schema/datamap.schema.json` per §4.3, generated from Zod like the existing schemas.
- `src/map/`: `loadDataMap`, `saveDataMap` (stable key order, comments preserved where YAML allows), `deriveId`, `mergeScan` (scanner zone replaced, human zone preserved, `stale` marking, `aliases`), `diffDataMaps` per §4.7 with `schema/datamap-diff.schema.json`.
- Page scanner emits data points per §5.1.
- `dpdp map init|show|questions|diff`; `scan page` writes to the map unless `--no-map`.
- `src/mapper/`: a `mapDataMap(map, rules, vendors)` entry that, for now, re-derives the page findings from the map and asserts they equal the `ScanResult` findings (a consistency test, not a user feature).

**Do not.** Add code scanning; add new rules; change `ScanResult`.

**Done when.** Scanning the CookieYes fixture twice produces an identical map (idempotent merge); hand-editing `purpose` on a data point survives a re-scan; `map diff` between the fixture map and a map scanned with one tracker removed reports exactly that drift under site drift and nothing under catalogue drift; the mapper consistency test passes on every fixture.

### Slice 4 — Vendors dataset and manifest scanner

**Goal.** Every repository in any language gets a first result.

**Build.**
- `trackers/` → `vendors/`; schema gains `packages` and the `role` enum; `vendors/VERSION` 1.0.0; loader alias for `trackers/` for one release; `PROVENANCE.md` moved; `CONTRIBUTING.md` updated.
- `packages` filled for every existing record where the vendor ships SDKs (verified against the registry listing, recorded in `PROVENANCE.md`).
- `vendors/vocabulary/personal-data.yaml` seeded (name, phone, email, address, dob, gender, pan, aadhaar, passport, ip, device id, geolocation, health, income, caste, religion, biometric, and common variants), with category and flags per entry.
- `src/scanners/code/manifests/`: parsers for the manifests in §5.2; matcher; question emission for suspicious unknowns.
- `dpdp scan code [path]` wired to the manifest level only; writes to the map; `--fail-on settled`.

**Done when.** A fixture repo containing a `package.json` with `@segment/analytics-next`, a `requirements.txt` with `razorpay`, a `go.mod` with `gopkg.in/segmentio/analytics-go.v3`, and an unknown `acme-telemetry` yields: Segment (processor) and Razorpay (processor) as recipients with `kind: package`, one question for `acme-telemetry`, and no findings beyond C-094-style inventory notes (until slice 8 lands); `trackers/` loader alias passes the old tests unchanged.

### Slice 5 — Code level, JavaScript/TypeScript

**Goal.** The six detections in §5.2 for JS/TS.

**Build.** `src/scanners/code/js/` using the TypeScript compiler API: HTTP calls; Prisma, Drizzle, TypeORM, Sequelize, Knex, raw SQL; JSX inputs, Zod, Yup, react-hook-form, Formik; consent gates (CMP SDK signatures from `vendors/`, checkbox-near-submit heuristic, consent-identifier branches); retention signals; rights endpoints (Next.js, Express, Fastify, Hono, NestJS routes). Redaction per §5.3. Each detection is its own module with its own fixtures.

**Done when.** A fixture Next.js + Prisma app with `users(phone, aadhaar_last4, notes, deleted_at)`, a sign-up form with a consent checkbox, a `fetch` to `api.razorpay.com`, a Segment `track` call outside the consent branch, and a `/api/account/delete` route yields: `dp_users_phone` and `dp_users_aadhaar_last4` (`C8`, `SENS` on the second, `high`), a question on `notes`, a soft-delete retention signal on all three, `cg_signup_checkbox`, Razorpay as recipient (`high`), Segment as recipient with no `consent_gate` link, and `rights_endpoint: erase` present. Under 10 seconds on a 2,000-file repo.

### Slice 6 — Code level, Python

**Goal.** The same six detections for Python.

**Build.** `src/scanners/code/python/` with a parser that does not require a Python interpreter (decide between a bundled tree-sitter WASM grammar and a purpose-built tokenizer; record the decision in the module README). Django models, SQLAlchemy, Alembic, raw SQL; Django forms, Pydantic, WTForms, DRF serializers; `requests`, `httpx`, `aiohttp`, `urllib`; consent identifiers and DRF/Django middleware patterns; Celery beat and cron; Django URLs, FastAPI and Flask routes.

**Done when.** A fixture Django app with the same shape as slice 5's fixture yields the same data points, question, signals, gate, recipients, and rights endpoint; the JS and Python fixtures produce maps that `map diff` reports as identical apart from locations.

### Slice 7 — `dpdp-map` skill

**Goal.** The interactive enrichment loop.

**Build.** `skills/dpdp-map/SKILL.md`: run `dpdp scan code`; read `dpdp map questions --json`; for each question, ask the developer in plain language with the observed hint, offer the closed lists (`category`, `basis`, retention phrasing), write the answer into the human zone with `answered_at` and `by`; propose `purpose` wording the developer confirms; never write to the scanner zone; re-run `dpdp map show --json`; summarise findings by tier the way `dpdp-scan` does, and point out every place an asserted basis and the Act disagree. A test, as for the existing skill, that the SKILL.md references only fields that exist in the schemas.

**Done when.** Following the skill against the slice 5 fixture, with scripted answers, produces a map where every question is answered, `basis` is set on every data point, and `dpdp map show` reports the C-093-shaped finding when the scripted answer claims s.7(a) for the Segment data point.

### Slice 8 — Rule blocks 070, 080, 090

**Goal.** The catalogue reads the map. External clock: counsel review.

**Build.** Schema extensions in §6.1 with tests for each new predicate; the rules in §6.2 drafted from the web data map and the Gazette texts, each with full rationale, explainer fields, `sources`, `owner`, and changelog; `rules/VERSION` minor bump; existing rules gain `sources: [page]`; explainer builder validates them (slice 2). Each rule PR follows `docs/contributing-rules.md`; tier assignments are approved by `counsel`.

**Done when.** The slice 5 fixture, with slice 7's scripted answers, yields C-070 questions where retention is unstated, C-071 nowhere (soft delete present), C-072 as a conditional question, C-080/081/082 with erase satisfied and access and correct absent, C-090 for Razorpay and Segment, C-091 for the Segment point if `basis: consent` is asserted with no gate link, C-093 if s.7(a) is asserted, C-094 for Segment (US). Each new rule's explainer JSON validates.

### Slice 9 — CI drift

**Goal.** Continuous monitoring in the developer's own CI.

**Build.** `--fail-on unmapped` on `scan code` and `map diff`; `map diff --from <git-ref>` reading the committed map at a ref; Action inputs `code: true`, `fail-on`; PR comment with a drift table (added, removed, changed data points, recipients, gates, signals) above the findings by tier; artefact upload of map and diff JSON.

**Done when.** In the Action's e2e job, a PR that adds a `fetch` to a new vendor host fails with exit 1 only when `fail-on: unmapped` is set, posts a comment naming the new recipient, and passes once the map is updated and committed; a PR that only changes `rules_version` produces catalogue drift in the comment and never fails.

### Slice 10 — `dpdp-notice` skill and notice lint on the map

**Goal.** The notice generator.

**Build.** `skills/dpdp-notice/SKILL.md` per §8.1 and §8.2, including the refusal rule and the cover sheet format; `dpdp notice lint` retargeted to read `.dpdp/data-map.yaml` (with `--scan findings.json` kept for one release); `src/notice/` exposes the itemisation inputs the skill reads (per data point: what, why, who, how long; per recipient: `notice_itemisation`). A test that the skill references only schema fields.

**Done when.** Following the skill against the slice 8 fixture map produces a notice whose itemised lines equal the map's data points one-to-one, with marked blanks for withdrawal, grievance, Board complaint, and Hindi, and a cover sheet whose trace ids all resolve; `dpdp notice lint` on that draft passes itemisation and fails the four blanks; a change notice from a diff that adds a new purpose includes a fresh-consent paragraph and one from a diff that adds only a recipient does not.

---

## 13. Out of scope for v2 (do not build)

- Live database introspection (v3 `database` source).
- Go, Java, Kotlin, Swift, Ruby, PHP at code level (manifest level only).
- Breach notification and SDF rules (v3).
- GitHub App, scheduled scans, drift history, form connectors, cross-repository merge, PDF, email (hosted product).
- Terms and conditions, legal opinion, any compliance verdict.
- Remediation code generation; a consent manager.
- Telemetry or any outbound call other than the scan target and its subresources.
- Rendered explainer pages in this repo or in the npm package.

---

## 14. Decisions recorded

- ADR-0001 — The data map is a committed artefact, built by machines and corrected by people.
- ADR-0002 — Free runs in the developer's environment; paid needs our server.
- ADR-0003 — One npm package, one `dpdp` bin with sub-commands.

Decisions agreed in the 13 October 2026 session that did not meet the ADR bar and are recorded only here: schema-as-code is part of the code scanner and live introspection is a later source; developers may assert a lawful basis and the mapper tests it; two notice documents (consent, change) and no T&Cs; three rule blocks in v2 with breach and SDF deferred; explainers generated from rule YAML and rendered only on the Sentinel site; manifest level for all ecosystems and code level for JS/TS and Python; three thin skills with only `dpdp-map` interactive; `settled` the only legal gate and `unmapped` the only bookkeeping gate; `ScanResult` 1.x kept with `DataMap` 1.0.0 as a sibling; `trackers/` renamed to `vendors/`.

---

*This tool reports risk under the DPDP Act and Rules. It is not legal advice and does not state that any product is or is not compliant.*
