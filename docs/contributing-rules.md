# Contributing rules and tracker records

Because the rule catalogue is the product, changes to it are reviewed differently from code. The public entry point for contributors is [`CONTRIBUTING.md`](../CONTRIBUTING.md). This page is the legal-content bar.

## Rules (`rules/`)

- Any new rule, or any change to `certainty`, `provisions`, `rationale_*`, or `enforceable_from`, requires a PR that cites the provision text from the Gazette PDFs in [`docs/legal-sources/`](legal-sources/README.md) (Act 22 of 2023, G.S.R. 846(E), G.S.R. 892(E), G.S.R. 843(E)) and, for `arguable` or `open` tiers, states the competing readings.
- Rule PRs require review by a maintainer designated for legal content (not just code review).
- A rule cannot be tiered `settled` if the PR describes a plausible alternative reading.
- Every rule change appears in the catalogue changelog (the `changelog` field in the rule file) with the date. The changelog is public and is the source for the explainer pages' "what changed" sections.
- Any change to a rule's `certainty`, `provisions`, `rationale_*`, or `enforceable_from` requires a version bump in `rules/VERSION` (additive → minor; change to existing → minor with an entry; removal → major).
- The `explainer_url` is `https://sentinel.vettam.ai/rules/<id>` (no trailing slash) and is embedded in every rule file. `npm run build:explainers` (see [`explainers.md`](explainers.md)) fails when a shipped rule lacks a field the page needs, including `rationale_plain` and `explainer_url`.
- Blocks 070–090 and DPDP-C-095 shipped at `rules/VERSION` 0.6.0. Their tier text still needs the legal-content review on this page. A later review that changes `certainty`, `provisions`, or `rationale_*` is a catalogue change with its own changelog entry.

## Vendors (`vendors/`)

`trackers/` is a symlink to `vendors/` for one release.

- Community contributions are welcome and are the expected way the dataset grows. Indian vendors are the priority: global lists under-cover Razorpay, PayU, Cashfree, CleverTap, MoEngage, WebEngage, Freshworks, Zoho, VWO, Netcore, InMobi, and similar.
- Each record must cite where its classification came from in its `provenance` field: vendor documentation, direct observation, or a named list with compatible licence terms.
- `packages` is filled only for SDKs the vendor publishes. Check the registry listing and note it in `vendors/PROVENANCE.md`. Do not add community wrappers.
- Do not seed from EasyPrivacy, the Open Cookie Database, DuckDuckGo Tracker Radar, or similar lists until their licence terms have been checked and recorded in `vendors/PROVENANCE.md`.
- Categories C0–C10 and overlay flags are defined in `docs/legal-sources/dpdp-web-data-map.md` Part 2 and must be used exactly as defined there. Do not invent new codes without updating the data map.
- A third-party host with no dataset match is reported under category `UNCLASSIFIED` with the finding text "an unmapped purpose cannot lawfully continue" — this is a feature: it prompts dataset contributions.
- How to add a record (hosts, paths, version bump, tests): see `CONTRIBUTING.md`.

