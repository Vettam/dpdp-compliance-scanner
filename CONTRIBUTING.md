# Contributing

This is a public scanner for India's DPDP Act. The interpretation layer
(rules + tracker classifications) is the product. Code changes and dataset
changes are both welcome; they are reviewed differently.

Product shape is [`docs/spec-v2.md`](docs/spec-v2.md). Decisions are in
[`docs/adr/`](docs/adr/). [`docs/legal-sources/spec.md`](docs/legal-sources/spec.md)
is the page-scanner reference; command names in that file are the v1 names.

Please read this file, then [`docs/contributing-rules.md`](docs/contributing-rules.md)
before opening a PR that touches `rules/` or `trackers/`. Primary legal texts
(the Act, Rules, corrigendum, and commencement notification) live as Gazette
PDFs under [`docs/legal-sources/`](docs/legal-sources/README.md).

## What to contribute

| You have | Open a PR that |
|---|---|
| A third-party host the scan reports as `UNCLASSIFIED` | Adds a `trackers/<id>.yaml` record with a `provenance` line |
| A bug in detection, mapping, or the CLI | Adds a failing test, then the fix (this repo is test-driven) |
| A new legal reading | Adds or amends a `rules/DPDP-C-NNN.yaml` file, with citations — see the legal-content bar below |
| A vendor hostname correction | Updates the existing tracker YAML and `last_verified` |

Do **not** send: telemetry, remote rule fetching, default enforcement gates
(the only opt-in gate is `--fail-on settled`, which must never trigger on
arguable or open findings), statements that a site "is compliant", or copies
of EasyPrivacy / Tracker Radar / Open Cookie Database (licence not yet
cleared — see `trackers/PROVENANCE.md`).

## Trackers (`trackers/`)

Community contributions are the expected way the dataset grows. Global cookie
lists under-cover Indian vendors; those records are the priority.

1. Copy the shape of an existing file in the same category
   (e.g. `trackers/razorpay.yaml` for a payment iframe, `trackers/clevertap.yaml`
   for engagement).
2. `id` is lowercase kebab-case and must be unique.
3. `match.hosts` are exact registrable names; subdomains match automatically
   (`freshdesk.com` matches `acme.freshdesk.com`). Optionally append a path
   (`js.zohocdn.com/salesiq`) when the host is a shared CDN.
4. Categories C0–C10 and overlay flags (`PRE`, `3PF`, `XFER`, …) are defined in
   [`docs/legal-sources/dpdp-web-data-map.md`](docs/legal-sources/dpdp-web-data-map.md)
   Part 2. Do not invent codes.
5. `provenance` must be one of: `vendor documentation`, `direct observation`,
   or a named list whose licence is already recorded in `trackers/PROVENANCE.md`.
6. Set `last_verified` to today's date (`YYYY-MM-DD`).
7. Bump `trackers/VERSION` (additive record → minor).
8. Run `npm test`. `test/trackers/catalogue.test.ts` loads every YAML file.

## Rules (`rules/`)

Held to a higher bar. Full policy: [`docs/contributing-rules.md`](docs/contributing-rules.md).

Short version: a new rule or any change to `certainty`, `provisions`, or
`rationale_*` needs a PR that quotes the provision from the Gazette PDFs in
[`docs/legal-sources/`](docs/legal-sources/README.md) and, for `arguable` /
`open`, states the competing reading. A rule cannot be `settled` if the PR
itself describes a plausible alternative. Legal-content review is required, not
just code review. Bump `rules/VERSION` and append a `changelog` entry.

## Code

- **Node ≥ 22**, TypeScript, tests in Vitest. `npm test` and `npm run typecheck`
  must pass. `npm test` includes a real Chromium scan of the locally served
  `test/fixtures/dod.html` page (spec §3.2 / §9). The first run may download
  Chromium if no system Chrome/Edge is installed. `npm run test:e2e` runs only
  that scan.
- Test-driven: write a failing test at a public seam (schema, mapper, renderer,
  CLI `execute`, geo lookup) before the implementation.
- Keep the dependency tree small. No outbound network calls other than the
  target URL and its subresources — no telemetry, no update checks, no remote
  rule fetching.
- Engine, rule catalogue, and tracker dataset version independently of the npm
  package. Use a [changeset](https://github.com/changesets/changesets) for the
  npm version (`npm run changeset`); bump `rules/VERSION` / `trackers/VERSION`
  / engine version in their own files.

## IP-to-country dataset (`data/geo/`)

Offline DB-IP Lite (CC BY 4.0). Do not fetch it at scan time. Maintainers
rebuild the packed file with:

```
npx tsx scripts/build-geo.ts /path/to/dbip-country-lite-YYYY-MM.csv.gz
```

See `data/geo/README.md` and `trackers/PROVENANCE.md`.

## Pull requests

- One concern per PR (one rule, one tracker cluster, or one code change).
- Include a changeset for user-facing npm changes.
- The CI workflow installs Playwright Chromium, then runs typecheck, tests
  (including the real-browser fixture scan), and the build. The Release
  workflow opens a version PR; maintainers merge that PR to publish.

## Licence

Code you contribute is Apache-2.0. Tracker YAML is CC BY-SA 4.0. Rule
`rationale_plain` / `rationale_dev` is CC BY-ND 4.0. Do not use the Sentinel
or Vettam names in a fork — see the README trademarks section.
