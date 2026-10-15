# dpdp-compliance-scanner

> A scanner that loads a web page in a headless browser, records everything the
> page collects about a visitor, and maps each observation to the provisions of
> India's **Digital Personal Data Protection Act 2023** and **DPDP Rules 2025**
> that it engages — reporting **how settled the law is**, not how severe the
> tracker is.

India has no cookie law. The entire relevance of a cookie scan under DPDP
rests on an inference chain: a tracker collects data → that data identifies a
person → processing personal data needs a lawful basis → DPDP's lawful bases
are a closed list (consent, or s.7) → so most trackers need consent, which
must be preceded by notice and be a clear affirmative act. Some links in that
chain are settled, some are arguable, some nobody knows yet. **This tool's job
is to show you which is which.** That interpretation layer is the product; the
scanning engine is commodity.

`dpdp scan page` observes a live page. `dpdp scan code` reads a repository
and records what it finds on the same committed data map: dependency manifests
in every ecosystem, and JavaScript, TypeScript, and Python source (outbound
calls, schema columns, form inputs, consent gates, retention signals, and
rights endpoints). It does not run the repository or call the network, and it
does not need a Python interpreter. `dpdp notice inputs` is what the
`dpdp-notice` skill reads when it drafts a consent notice from that map. The
skill does not decide the law, and it does not fill the notice in.

## The certainty model

Every finding carries a **certainty tier** (interpretive confidence) and an
**enforceability date** (temporal status). There is no severity field.

| Tier | Meaning |
|---|---|
| `settled` | The text of the Act or Rules is clear and its application needs no interpretation. |
| `arguable` | The provision applies, but its application to this fact pattern is contestable. |
| `open` | No Board guidance, no case law, the text is silent; resolved by future orders. |

Most substantive obligations commence **13 May 2027**. A finding whose rule is
not yet enforceable is still reported; the date is shown beside it.

## What it is — and is not

- **Not an enforcement gate by default.** A completed scan exits 0. The only
  opt-in exits are `--fail-on settled` and `--fail-on unmapped` (see CI below).
- **Not a consent manager.** It does not fix anything.
- **Not a finished notice.** The notice skill drafts from the data map and
  leaves withdrawal, grievance, a Board complaint, and Hindi blank.
- **Not a compliance verdict.** It never says a site "is" or "is not"
  compliant. That judgement, with counsel review, is the paid Sentinel product.
- **Not an executor.** `dpdp scan code` reads manifests and JavaScript,
  TypeScript, or Python source. It does not run that code. Other languages
  are read from their manifests only.

## Install / run

```bash
npx dpdp-compliance-scanner scan page <url> [options]
```

Example: `npx dpdp-compliance-scanner scan page https://example.com --md`

One package, one `dpdp` bin. `npx` runs that bin, so the package name is the
command. The old `dpdp-cookie-scanner` package is a deprecated shim (see
[`shim/README.md`](shim/README.md)).

`dpdp scan page` also writes `.dpdp/data-map.yaml` (the committed data map)
unless `--no-map` is set. `dpdp map show` reads that file.

Detects an existing system Chrome/Edge and uses it; downloads Chromium only as
a fallback (with a one-time message). No outbound network calls other than the
target URL and its subresources — no telemetry, no update checks, no remote
rule fetching.

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
  --browser <path>       use a specific Chrome/Edge/Chromium binary
  --interact             three-pass banner interaction (load, accept-all, reject-all)
  --fail-on settled      opt-in CI gate; never trips on arguable or open findings
  --no-map               do not write .dpdp/data-map.yaml

dpdp scan code [path] [--json] [--md] [--out <dir>] [--ci] [--fail-on settled|unmapped] [--no-map]

dpdp notice inputs [--map <file>] [--json]
dpdp notice changes --from <ref|file> --to <ref|file> [--json]
dpdp notice lint <url|file> [--scan findings.json] [--json] [--ci]
dpdp map init              # create .dpdp/data-map.yaml
dpdp map show [--json]     # data points, findings, and open questions
dpdp map questions [--json]
dpdp map diff --from <ref|file> --to <ref|file> [--md] [--ci] [--fail-on settled|unmapped] [--out <dir>]
dpdp map diff --diff-from <a.json> --diff-to <b.json> [--json] [--ci] [--out <dir>]
dpdp explain <rule-id>     # last line is https://sentinel.vettam.ai/rules/<id>
dpdp version               # package, rules/VERSION, vendors/VERSION
```

`dpdp scan code` writes that repository into the same data map. A matched dependency becomes a recipient (`kind: package`). JavaScript, TypeScript, and Python add a data point per personal-data column and form field, a recipient per outbound call to a known vendor, consent gates, retention signals on the columns they belong to, and rights endpoints (`access`, `erase`, `correct`) on the map. A free-text column the vocabulary does not recognise becomes a question. It does not run the code or call the network. Python is tokenized in this package; a scan does not need a Python interpreter installed.

A scan rewrites the scanner zone (`observed`, retention `signals`, `questions`) and leaves the human zone in place. A new data point starts at `basis: unstated`. Purpose, basis, category, `retention.stated`, notes, and `answers` are written by a person, or by the `dpdp-map` skill after they confirm the words. `dpdp map show` applies the catalogue (rules `0.6.0`) to that map.

Before a basis is set, a code map reports **DPDP-C-095** (arguable) on each personal-data point with no basis, **DPDP-C-094** (open) for a recipient outside India — transfer is permitted unless the destination is restricted — and **DPDP-C-080** / **DPDP-C-082** (arguable) when stored columns have no access or correction route. An erasure route satisfies **DPDP-C-081**. Questions, not findings, ask for a retention period (**DPDP-C-070**), whether Rule 8(3) and the Third Schedule apply (**DPDP-C-072**), and whether a written contract exists for a processor (**DPDP-C-090**). Razorpay stays a fiduciary, so C-090 does not apply to it.

After a basis is recorded, show tests the claim. Voluntarily provided on `C5`, `C6`, or `C9` is **DPDP-C-093**. Consent with no linked gate is **DPDP-C-091**. Consent with no `C10` consent record in the map is **DPDP-C-092**. A consent basis linked to a code gate with no reject control is **DPDP-C-004**; a pre-ticked gate is **DPDP-C-005**. The finding says the claim and the Act disagree. It does not say the claim is false.

## CI

Exit codes: `0` completed · `1` an opt-in gate tripped · `2` usage error · `3` navigation failure or unreadable repository.

| Gate | Commands | Trips when |
|---|---|---|
| `--fail-on settled` | `scan page`, `scan code` | The scan has a settled finding. Arguable findings, open findings, and questions do not trip it. |
| `--fail-on unmapped` | `scan code`, `map diff` | The later map has a data point, recipient, consent gate, or retention signal the earlier map does not account for. Removals do not trip it. |

Catalogue drift is a change in findings because `rules_version` or `vendors_version` changed. It does not fail a build. `dpdp map diff --from <git-ref> --to <git-ref>` reads `.dpdp/data-map.yaml` from those commits. A path that exists on disk is read as a file.

```bash
npx dpdp-compliance-scanner scan code --ci --fail-on unmapped
npx dpdp-compliance-scanner map diff --from origin/main --to HEAD --ci
```

The scan exits 1 until you commit the map it wrote. After that commit, the same scan exits 0. The diff prints site drift and catalogue drift separately.

## Notice

The scanner records the inventory. It does not write the notice, and it does
not check the published text while scanning.

`dpdp notice inputs` prints one line per data point: what (`name`), why
(`purpose`), who (the vendor's `notice_itemisation`), and how long
(`retention.stated`). `dpdp notice changes` compares two maps, or a map file
with the map at a git ref, and reports whether any purpose is new. A purpose
is new when the later map uses a purpose string the earlier map does not. A
new recipient, or a new data point that reuses a purpose, does not ask for
fresh consent.

The `dpdp-notice` skill turns that JSON into a draft and a cover sheet for
counsel. The draft itemises only data points on the map. These four spans stay
blank, and a person fills them before publication:

```
[BLANK: withdrawal mechanism]
[BLANK: grievance officer]
[BLANK: complaint to the Board]
[BLANK: Hindi]
```

`dpdp notice lint` checks a published notice against `.dpdp/data-map.yaml` and
DPDP Rule 3: each data point itemised, each recipient named, a withdrawal
mechanism (s.6(4)), a grievance contact, how to complain to the Board (Rule
3(c)), and English plus an Eighth Schedule language. A `[BLANK: …]` span does
not pass those checks. Lint the notice, not the cover sheet. The command exits
0 when it finishes; a failed check is listed in the output. `--scan
findings.json` still itemises the page-scan inventory, for one release, and
does not read the map.

```bash
npx dpdp-compliance-scanner notice inputs --json
npx dpdp-compliance-scanner notice changes --from origin/main --to HEAD --json
npx dpdp-compliance-scanner notice lint <notice-url-or-file> [--scan ./dpdp-scan/findings.json] [--json] [--ci]
```

## Agent skills

The skills run the CLI and reason over its JSON. They do not scan and they do
not apply the catalogue. If a JSON schema changes, that skill's parsing
instructions change in the same commit.

`skills/dpdp-scan/SKILL.md` summarises a page scan grouped by certainty, for
"check this site for DPDP issues".

`skills/dpdp-map/SKILL.md` is interactive, for "map what my codebase collects"
or "answer the DPDP questions". It runs `dpdp scan code`, reads
`dpdp map questions --json`, and asks each question with the observed hint
(`kind`, `location`, `confidence`). It offers the closed lists for `category`,
`basis`, and retention wording, proposes a `purpose`, and writes only after
the developer confirms. Answers go in the human zone: `answers.<question id>`
holds `answered_at` and `by` (the word `developer`). It then runs
`dpdp map show --json` and summarises findings by tier, then the catalogue
questions (retention, fiduciary class, processor contract). A section 7(a)
claim on behavioural, advertising, or derived data is DPDP-C-093.

`skills/dpdp-notice/SKILL.md` drafts a consent notice, or a change notice, for
"draft our consent notice" or "what do we tell customers about this change".
It reads `dpdp notice inputs --json` and, for a change, `dpdp notice changes`.
It itemises only data points in the map, leaves withdrawal, grievance, a Board
complaint, and Hindi as marked blanks, and writes a cover sheet that traces
each line to a data point. A new purpose asks for fresh consent. A new
recipient does not. It does not edit the map.

## GitHub Action

`action/` is a composite Action. It runs `dpdp scan page --ci` when `url` is
set and `dpdp scan code --ci` when `code: true`, then on a pull request runs
`dpdp map diff --from <base> --to HEAD`. The artifact holds the findings, the
data map, and `datamap-diff.json`. The pull-request comment puts that drift
table above the findings. Interpretation stays in the CLI. See
[`action/README.md`](action/README.md).

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: Vettam/dpdp-cookie-scanner/action@v2
  with:
    url: https://staging.example.com
    code: true
```

The job succeeds on a completed scan even when findings exist. `fail-on: settled`
fails on a settled finding. `fail-on: unmapped` fails `dpdp scan code` when the
scan observed something the committed map does not account for; catalogue drift
does not fail the job. Grant `pull-requests: write` so the comment can be posted.

## Architecture

One core, many surfaces. The core is the data map plus the mapper. `scan(url, options)`
still returns a `ScanResult`. `scanCode(path)` reads manifests and JavaScript, TypeScript, and Python.
The CLI and the agent skills are thin renderers. Scanners record facts; a person asserts purpose and basis; the mapper applies rules.

```
Surfaces (CLI / skill)
        │
        ▼
Data map (.dpdp/data-map.yaml)  ←  page scanner (Playwright)
        │                         ←  code scanner (dpdp scan code)
        ▼
Mapper  ←  rules/*.yaml , vendors/*.yaml
```

## Explainers

The Sentinel site renders one page per rule. This repo does not store those pages. From a checkout, after `npm run build` (that command deletes `dist/`):

```bash
npm run build:explainers
```

That writes one `dist/explainers/<rule-id>.json` per file in `rules/`. The directory is gitignored and excluded from the npm package. The field contract is [`docs/explainers.md`](docs/explainers.md).

## Licensing

- **Code:** Apache-2.0 (see `LICENSE`, `NOTICE`).
- **`vendors/` dataset:** CC BY-SA 4.0 (see `vendors/LICENSE`). `trackers/` is a symlink for one release.
- **Rule rationale text and explainer pages:** CC BY-ND 4.0, owned by Rylematic
  Technologies Private Limited.
- **IP-to-country dataset:** DB-IP Lite, CC BY 4.0 (see `data/geo/README.md`
  and `vendors/PROVENANCE.md`).

## Contributing

Vendor records (especially Indian vendors) and bug-fixes are welcome.
Rule-catalogue changes are welcome too, but they are reviewed as legal
content, not just code. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/contributing-rules.md](docs/contributing-rules.md).

## Trademarks

"Sentinel" and "Vettam" are names and marks of Rylematic Technologies Private
Limited. The code grant under the Apache-2.0 licence does **not** extend to
these trademarks. Forks and derivative works may not use the "Sentinel" or
"Vettam" names, logos, or marks — in the project name, package name, domain,
or marketing — to present themselves as the official, endorsed, or affiliated
tool. Choose your own name.

## Status

**Last rule freshness active date:** 30 September 2026.

The rule catalogue was last confirmed against the Gazette text of the Act,
Rules, corrigendum, and commencement notification on this date. Product shape
is [`docs/spec-v2.md`](docs/spec-v2.md). The Gazette PDFs, the
provision-by-provision guide, the web-data map, and the v1 page-scanner spec
are in [`docs/legal-sources/`](docs/legal-sources/README.md). Release history
lives in [`CHANGELOG.md`](CHANGELOG.md).

---

*This tool reports risk under the DPDP Act and Rules. It is not legal advice
and does not state that any site is or is not compliant.*
