# Legal sources

Primary texts of India's Digital Personal Data Protection Act and Rules, plus
the project's reading of them. These files are the legal grounding for every
rule in `rules/`.

Where a reading in this directory disagrees with a Gazette PDF, **the Gazette wins**.

Product shape is [`docs/spec-v2.md`](../spec-v2.md). [`spec.md`](spec.md) remains the reference for the page scanner's engine, the page-shaped rules, and the `ScanResult` 1.x schema. Where `spec.md` and the web data map disagree on legal content, the web data map wins. Vocabulary is [`CONTEXT.md`](../../CONTEXT.md). Decisions are in [`docs/adr/`](../adr/).

## Official texts (Gazettes)

Copies of public documents of the Government of India. Rule PRs that cite a
provision must be checkable against these files.

| File | Instrument | Citation |
|---|---|---|
| [`DPDP Act 2023.pdf`](DPDP%20Act%202023.pdf) | Digital Personal Data Protection Act, 2023 | Act 22 of 2023 (11 August 2023) |
| [`DPDP Rules 2025.pdf`](DPDP%20Rules%202025.pdf) | Digital Personal Data Protection Rules, 2025 | G.S.R. 846(E), 13 November 2025 |
| [`DPDP Rules 2025 Corrigendum.pdf`](DPDP%20Rules%202025%20Corrigendum.pdf) | Corrigenda to the Rules | G.S.R. 892(E), 10 December 2025 |
| [`DPDP Enforcement Timeline.pdf`](DPDP%20Enforcement%20Timeline.pdf) | Commencement notification | G.S.R. 843(E), 13 November 2025 |

`DPDP Enforcement Timeline.pdf` is the Gazette commencement notification
(G.S.R. 843(E)), not a secondary timeline graphic. Tranche dates used in the
rule catalogue (`enforceable_from`) come from this instrument.

## Project readings

- [`dpdp-web-data-map.md`](dpdp-web-data-map.md) — engineering reference mapping web data collection to the Act and Rules. **Primary source for the rule catalogue and tracker categories** (Parts 2–6).
- [`dpdp-guide.md`](dpdp-guide.md) — provision-by-provision guide to the Act.
- [`spec.md`](spec.md) — v1 page-scanner specification (engine, page-shaped rules, `ScanResult` 1.x). Product shape is [`docs/spec-v2.md`](../spec-v2.md).
