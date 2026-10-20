# DPDP Compliance Scanner

Open-source scanner for India's Digital Personal Data Protection Act, 2023 (DPDP Act) and the DPDP Rules, 2025. It records the personal data a website and a codebase handle, writes that record to a committed **data map**, and maps each item to the provisions it engages. Every finding reports **how settled the law is**, and the date the obligation becomes enforceable.

People look for an India cookie scanner because that is how consent tools are sold. India has no cookie law. A cookie, a database column, a form field, and a log line are the same kind of thing under the Act: an item of personal data. This tool scans all of them.

**Law last verified: 20 October 2026.** The rule catalogue (`rules/` 0.6.0) was confirmed on that date against the Gazette text of the Act, the Rules, the corrigendum, and the commencement notification. Copies live in [`docs/legal-sources/`](docs/legal-sources/README.md). Where a reading in this repository disagrees with a Gazette PDF, the Gazette wins.

npm package: [`dpdp-compliance-scanner`](https://www.npmjs.com/package/dpdp-compliance-scanner). One command: `dpdp`. Requires Node.js 22 or newer.

```bash
npx dpdp-compliance-scanner scan page https://example.com --md
npx dpdp-compliance-scanner scan code .
```

The scanner runs in your environment. It does not phone home, fetch rules from a server, or send telemetry. The only network calls in a page scan are the target URL and its subresources.

## What a scan produces

A **data map** at `.dpdp/data-map.yaml`, committed to the repository. Findings, questions, and notice drafts are derived from that file. A single scan is only the recording of one source at one moment.

| Source | Command | What it observes |
|---|---|---|
| Live page | `dpdp scan page <url>` | Cookies, storage keys, requests, embeds, fingerprinting API calls, and the consent banner. Uses the system Chrome or Edge, and downloads Chromium only if neither is present. |
| Codebase | `dpdp scan code [path]` | Dependency manifests in every supported ecosystem, plus JavaScript, TypeScript, and Python source. Reads files. Does not run the repository, call the network, or need a Python interpreter. |

Other languages are read from their manifests only. Go, Java, Kotlin, Swift, Ruby, PHP, Rust, and Dart dependencies are matched; their source is not parsed.

The code scanner records:

- a recipient for each dependency that matches the vendor dataset
- a data point for each personal-data column and form field
- a recipient for each outbound call to a known vendor host
- consent gates, retention signals, and rights endpoints (`access`, `erase`, `correct`)
- a question when a free-text column or an unmatched outbound-looking dependency cannot be classified

Manifests it reads include `package.json` and lockfiles, `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `Pipfile.lock`, `Gemfile.lock`, `go.mod` / `go.sum`, `pom.xml`, `build.gradle` / `build.gradle.kts`, `Cargo.lock`, `Podfile.lock`, `Package.swift`, `composer.lock`, and `pubspec.lock`.

Each scan rewrites the scanner zone (`observed`, retention `signals`, `questions`) and leaves the human zone in place: `name`, `purpose`, `basis`, `retention.stated`, `answers`, and `notes`. A new data point starts at `basis: unstated`. A data point that later scans no longer see is marked `stale: true`. A machine never deletes it.

## What this repository includes

| Piece | Where | Role |
|---|---|---|
| CLI | `src/cli/`, bin `dpdp` | Page scan, code scan, data map, notice inputs, notice lint, rule explainers |
| Page scanner | `src/engine/` | Headless browser capture, banner detection, redaction, offline IP-to-country |
| Code scanner | `src/scanners/code/` | Manifests, JS/TS (TypeScript compiler API), Python (built-in tokenizer) |
| Data map | `src/map/`, `.dpdp/data-map.yaml` | Merge of every scan of one repository, with stable ids |
| Mapper | `src/mapper/` | Applies `rules/*.yaml` to the data map. Scanners record facts; the mapper interprets them |
| Rule catalogue | `rules/` (version 0.6.0) | 35 rules, each with a certainty tier, an enforceability date, and a rationale |
| Vendor dataset | `vendors/` (version 1.0.0) | Hosts, packages, and signatures for third parties, including Indian payment, marketing, and support vendors |
| Notice tools | `src/notice/`, `src/notice-lint/` | Itemisation inputs, change classification, and a check of a published notice against Rule 3 |
| Agent skills | `skills/dpdp-scan`, `skills/dpdp-map`, `skills/dpdp-notice` | Run the CLI and reason over its JSON. They contain no scanning logic and no legal logic |
| GitHub Action | `action/` | Page scan, code scan, map diff, and a pull-request comment |
| Explainer JSON | `npm run build:explainers` | One JSON file per rule for the [Sentinel](https://sentinel.vettam.ai) site. The rendered pages are not stored here |
| Deprecated shim | [`shim/`](shim/README.md) | The old `dpdp-cookie-scanner` package name, forwarding to `dpdp` |

Library entry points, for a host that imports the package: `scan`, `scanCode`, `loadDataMap`, `mergeScan`, `mapFindings`, `diffDataMaps`, `noticeInputs`, `noticeChanges`.

Anything that runs on your machine, in CI, or in your own agent is in this repository. Scheduled re-scans, drift history, merging data maps across repositories, and counsel review of a notice draft are the hosted Sentinel product from Vettam (Rylematic Technologies Private Limited).

## How a finding is read

Every finding carries a **certainty tier** and an **enforceability date**. There is no severity field. The tier is a property of the rule, fixed in `rules/*.yaml`, and the same for every vendor.

| Tier | Meaning |
|---|---|
| `settled` | The text of the Act or Rules is clear, and applying it here needs no interpretation. |
| `arguable` | The provision applies, and applying it to this fact pattern is contestable. |
| `open` | The text is silent or undefined. No Board guidance and no case law yet. |

Most substantive obligations commence **13 May 2027** (G.S.R. 843(E), 13 November 2025). A finding whose rule is not yet in force is still reported, with that date beside it.

A finding is one rule applied to one or more data points: what was observed, which provisions it engages, how certain that reading is, and from when it is enforceable. Compliance is a judgement for counsel. The full model is [`docs/certainty-model.md`](docs/certainty-model.md).

Categories `C0`–`C10` classify a data point by purpose and lawful basis (service delivery, security, measurement, behavioural analytics, advertising, identity data, and the consent record, among others). They are defined in [`docs/legal-sources/dpdp-web-data-map.md`](docs/legal-sources/dpdp-web-data-map.md).

Before a basis is recorded, `dpdp map show` reports **DPDP-C-095** (arguable) on each personal-data point with no basis, and **DPDP-C-094** (open) for a recipient outside India. Transfer is permitted unless the destination is restricted. **DPDP-C-080** and **DPDP-C-082** (arguable) fire when stored columns have no access or correction route. An erasure route satisfies **DPDP-C-081**.

Questions, rather than findings, ask for a retention period (**DPDP-C-070**), whether Rule 8(3) and the Third Schedule apply (**DPDP-C-072**), and whether a written contract exists for a processor (**DPDP-C-090**). Razorpay stays a fiduciary, so C-090 does not apply to it.

After a basis is recorded, the mapper tests the claim. Voluntarily provided on `C5`, `C6`, or `C9` is **DPDP-C-093**. Consent with no linked gate is **DPDP-C-091**. Consent with no `C10` consent record in the map is **DPDP-C-092**. A consent basis linked to a code gate with no reject control is **DPDP-C-004**. A pre-ticked gate is **DPDP-C-005**. The finding says the claim and the Act disagree. It does not say the claim is false.

`dpdp explain DPDP-C-001` prints the rule. The last line is `https://sentinel.vettam.ai/rules/<id>`.

## How to use it

### Scan a website for DPDP issues

```bash
npx dpdp-compliance-scanner scan page https://example.com --md
```

Findings land in `./dpdp-scan/` (`findings.md`, and `findings.json` when you pass `--json` or `--ci`). The same command writes `.dpdp/data-map.yaml` unless you pass `--no-map`.

```
dpdp scan page <url>
  --json                 write findings.json (default in --ci)
  --md                   write findings.md into --out (default ./dpdp-scan)
  --out <dir>            output directory (default ./dpdp-scan)
  --ci                   machine mode: no colour, JSON and Markdown always
  --gpc                  send Sec-GPC: 1 and evaluate DPDP-C-050
  --include-query        keep query strings in request evidence (prints a warning)
  --screenshot           save a viewport screenshot alongside output
  --timeout <ms>         navigation timeout (default 15000)
  --settle <ms>          post-load settle wait (default 3000)
  --rules-version        print catalogue version and exit
  --browser <path>       use a specific Chrome, Edge, or Chromium binary
  --interact             three-pass banner interaction (load, accept-all, reject-all)
  --fail-on settled      opt-in CI gate; arguable and open findings do not trip it
  --no-map               do not write .dpdp/data-map.yaml
```

`--interact` loads the page three times: once as a visitor who does nothing, once after accept-all, and once after reject-all. The report shows which trackers still fire after reject.

### Scan a codebase and build the data map

From the repository root:

```bash
npx dpdp-compliance-scanner scan code . --md
npx dpdp-compliance-scanner map show
npx dpdp-compliance-scanner map questions
```

`dpdp map init` creates an empty `.dpdp/data-map.yaml` when you want the file before the first scan. `dpdp map show` applies catalogue 0.6.0 and prints data points, findings, and open questions. `dpdp map questions` prints only the questions.

Purpose, category, basis, and retention are written by a person, or by the `dpdp-map` skill after that person confirms the words. The scanner proposes a category and a name. It leaves `basis` as `unstated`.

```
dpdp scan code [path]
  --json
  --md
  --out <dir>                 default ./dpdp-scan
  --ci
  --fail-on settled|unmapped
  --no-map

dpdp map init
dpdp map show [--json]
dpdp map questions [--json]
dpdp map diff --from <ref-or-file> --to <ref-or-file> [--md] [--ci] [--fail-on settled|unmapped] [--out <dir>]
dpdp map diff --diff-from <a.json> --diff-to <b.json> [--json] [--ci] [--out <dir>]
```

`dpdp map diff --from origin/main --to HEAD` reads `.dpdp/data-map.yaml` from those commits. A path that exists on disk is read as a file. The report separates **site drift** (data points, recipients, consent gates, and retention signals added or removed) from **catalogue drift** (findings that changed because `rules_version` or `vendors_version` changed). Catalogue drift does not fail a build.

`--diff-from` / `--diff-to` compare two page-scan `ScanResult` JSON files, the older interpretation diff.

### Draft and check a DPDP consent notice

The scanner records the inventory. Drafting is a separate step, and a published notice is checked only when you lint it.

```bash
npx dpdp-compliance-scanner notice inputs --json
npx dpdp-compliance-scanner notice changes --from origin/main --to HEAD --json
npx dpdp-compliance-scanner notice lint ./notice.md --json
npx dpdp-compliance-scanner notice lint https://example.com/privacy
```

`dpdp notice inputs` prints one line per data point: what (`name`), why (`purpose`), who (the vendor's `notice_itemisation`), and how long (`retention.stated`). Pass `--map <file>` when the map is not `.dpdp/data-map.yaml`.

`dpdp notice changes` compares two maps, or a map file with the map at a git ref. A purpose is new when the later map uses a purpose string the earlier map does not. A new purpose is what asks for fresh consent. A new recipient, or a new data point that reuses a purpose, does not.

The `dpdp-notice` skill turns that JSON into a draft and a cover sheet for counsel. The draft itemises only data points on the map. These four spans stay blank, and a person fills them before publication:

```
[BLANK: withdrawal mechanism]
[BLANK: grievance officer]
[BLANK: complaint to the Board]
[BLANK: Hindi]
```

`dpdp notice lint` checks a published notice against `.dpdp/data-map.yaml` and DPDP Rule 3: each data point itemised, each recipient named, a withdrawal mechanism (s.6(4)), a grievance contact, how to complain to the Board (Rule 3(c)), and English plus an Eighth Schedule language. A `[BLANK: …]` span does not pass those checks. Lint the notice, not the cover sheet. The command exits 0 when it finishes; a failed check is listed in the output. `--scan findings.json` still itemises a page-scan inventory, for one release, and does not read the map. Default output directory for lint JSON is `./notice-lint-out`.

### Versions

```bash
npx dpdp-compliance-scanner version
npx dpdp-compliance-scanner explain DPDP-C-002
```

`dpdp version` prints the package version, `rules/VERSION`, and `vendors/VERSION`.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | The command finished. Findings on their own do not change this. |
| 1 | An opt-in gate tripped. |
| 2 | Usage error: missing URL, missing map, unknown rule, bad `--fail-on`. |
| 3 | The page did not load, or the repository path could not be read. |

| Gate | Commands | Trips when |
|---|---|---|
| `--fail-on settled` | `scan page`, `scan code` | The scan has a settled finding. Arguable findings, open findings, and questions do not trip it. |
| `--fail-on unmapped` | `scan code`, `map diff` | The later map has a data point, recipient, consent gate, or retention signal the earlier map does not account for. Removals do not trip it. A page scan rejects this value. |

```bash
npx dpdp-compliance-scanner scan code --ci --fail-on unmapped
npx dpdp-compliance-scanner map diff --from origin/main --to HEAD --ci
```

`scan code --fail-on unmapped` exits 1 until you commit the map the scan wrote. After that commit, the same scan exits 0.

### GitHub Action

`action/` runs `dpdp scan page --ci` when `url` is set and `dpdp scan code --ci` when `code: true`. On a pull request it then runs `dpdp map diff` against the base commit. The `dpdp-scan` artifact holds the findings, the data map, and `datamap-diff.json`. The pull-request comment puts the drift table above the findings.

Check out with `fetch-depth: 0` so the base commit is available. Grant `pull-requests: write` so the comment can be posted. Pin the Action ref and the npm `version` together.

```yaml
name: DPDP scan
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: Vettam/dpdp-cookie-scanner/action@v2
        with:
          url: https://staging.example.com
          code: true
          version: "2.0.0"
          fail-on: unmapped
```

`fail-on: settled` fails the job on a settled finding. `fail-on: unmapped` fails the code scan when the scan observed something the committed map does not account for. Catalogue drift does not fail the job. Inputs, outputs, and the comment format are in [`action/README.md`](action/README.md).

### Agent skills

The skills run the CLI and reason over its JSON. If a JSON schema changes, that skill's parsing instructions change in the same commit.

| Skill | Use it when you want to | What it runs |
|---|---|---|
| [`skills/dpdp-scan`](skills/dpdp-scan/SKILL.md) | Check a site for DPDP issues, see what fires before consent, or review a consent banner | `dpdp scan page`, then a summary grouped by certainty |
| [`skills/dpdp-map`](skills/dpdp-map/SKILL.md) | Map what a codebase collects, and record purpose, category, and basis | `dpdp scan code`, then one question at a time. It writes the human zone only after you confirm the words |
| [`skills/dpdp-notice`](skills/dpdp-notice/SKILL.md) | Draft a consent notice, or say what to tell customers about a change | `dpdp notice inputs` and, for a change, `dpdp notice changes`. It does not edit the map |

### Use it as a library

```ts
import { scan, scanCode, loadDataMap, mapFindings } from "dpdp-compliance-scanner";

const page = await scan("https://example.com");
const code = await scanCode(".");
const map = await loadDataMap(".dpdp/data-map.yaml");
```

`scan` returns a `ScanResult` (schema 1.x) and also emits data points into the map. `scanCode` returns the code scan's data points, findings, and questions.

### Explainers

The Sentinel site renders one page per rule. From a checkout, after `npm run build` (that command deletes `dist/`):

```bash
npm run build:explainers
```

That writes one `dist/explainers/<rule-id>.json` per file in `rules/`. The directory is gitignored and excluded from the npm package. The field contract is [`docs/explainers.md`](docs/explainers.md).

### The old package name

`dpdp-cookie-scanner`, `dpdp-cookie-scan`, and `dpdp-notice-lint` are deprecated bins in the shim package. They forward to `dpdp scan page`, `dpdp map diff`, and `dpdp notice lint`. Install `dpdp-compliance-scanner` directly. Details are in [`shim/README.md`](shim/README.md).

## Questions people ask

**Does India have a cookie law?**
The DPDP Act, 2023 does not mention cookies. A cookie is personal data when it identifies a person or can be related to one (s.2(t)). Processing needs a lawful basis from a closed list: consent (s.6), or a limb of s.7. Consent must be preceded by notice (s.5) and be a clear affirmative act. Continued browsing is not that act.

**Is a finding a compliance verdict?**
A finding is a reading of one rule against what was observed, with a certainty tier and an enforceability date. Whether a product complies is a judgement for counsel, after they have seen the data map and the notice.

**When do the obligations start?**
The commencement notification is G.S.R. 843(E) of 13 November 2025. Most substantive obligations in the catalogue commence on 13 May 2027. The scanner still reports them, with that date on the finding.

**What should I commit?**
Commit `.dpdp/data-map.yaml`. The human zone (purpose, basis, retention, answers) is yours. The next scan refreshes observations and keeps those answers.

**What does the notice draft leave blank?**
Withdrawal, the grievance officer, a complaint to the Board, and the Eighth Schedule language (the skill marks it as Hindi). Rule 3 requires all four in a published notice. `dpdp notice lint` checks that a published page actually contains them.

## Architecture

One core, many surfaces. The core is the data map plus the mapper. The CLI, the Action, the skills, and a host that imports the library are thin renderers over the same findings.

```
Surfaces:  dpdp CLI · GitHub Action · skills · library import
                         │
                         ▼
              .dpdp/data-map.yaml
               ▲              ▲
     page scanner          code scanner
     (Playwright)          (manifests, JS/TS, Python)
                         │
                         ▼
         Mapper  ←  rules/*.yaml , vendors/*.yaml
                         │
                         ▼
         Findings · questions · notice inputs
```

Product shape is [`docs/spec-v2.md`](docs/spec-v2.md). Vocabulary is [`CONTEXT.md`](CONTEXT.md). Decisions are in [`docs/adr/`](docs/adr/).

## Licensing

- **Code:** Apache-2.0 (see `LICENSE`, `NOTICE`).
- **`vendors/` dataset:** CC BY-SA 4.0 (see `vendors/LICENSE`). `trackers/` is a symlink kept for one release.
- **Rule rationale text and explainer pages:** CC BY-ND 4.0, owned by Rylematic Technologies Private Limited.
- **IP-to-country dataset:** DB-IP Lite, CC BY 4.0 (see [`data/geo/README.md`](data/geo/README.md) and [`vendors/PROVENANCE.md`](vendors/PROVENANCE.md)).

## Contributing

Vendor records, especially Indian vendors, and bug-fixes are welcome. Rule-catalogue changes are reviewed as legal content. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/contributing-rules.md](docs/contributing-rules.md).

## Trademarks

"Sentinel" and "Vettam" are names and marks of Rylematic Technologies Private Limited. The code grant under the Apache-2.0 licence does **not** extend to these trademarks. Forks and derivative works may not use the "Sentinel" or "Vettam" names, logos, or marks — in the project name, package name, domain, or marketing — to present themselves as the official, endorsed, or affiliated tool. Choose your own name.

## Status

- **Package:** `dpdp-compliance-scanner` 2.0.0, bin `dpdp`.
- **Rules:** 0.6.0. **Vendors:** 1.0.0.
- **Law last verified:** 20 October 2026, against the Gazette text of the Digital Personal Data Protection Act, 2023, the DPDP Rules, 2025, the corrigendum (G.S.R. 892(E)), and the commencement notification (G.S.R. 843(E)).
- **Product shape:** [`docs/spec-v2.md`](docs/spec-v2.md). Release history: [`CHANGELOG.md`](CHANGELOG.md).

---

*This tool reports how the DPDP Act and Rules read against what it observed. It is not legal advice.*
