# Free runs in the developer's environment; paid needs our server

**Status:** accepted

This repository is the sales funnel for the hosted Sentinel product, so every capability needs a predictable side of the line. We decided on one rule: anything that runs in the developer's own environment (their machine, their CI runner, their agent and key) is free and lives here; anything that needs us to operate a server (holding OAuth or GitHub App tokens, scheduling re-scans, storing history, polling non-code sources such as forms, merging data maps across repositories) is paid and lives in the hosted product. Legal vetting of a notice draft is paid because it is counsel, not software.

## Considered options

- A feature-based line (for example, the schema scanner or the notice draft is paid). Faster upsell, but the open-source tool reads as crippled and the rule catalogue ends up serving two products unevenly.

## Consequences

- A solo founder can scan, commit a data map, run the Action, and draft a notice without paying. That is intended; the trigger to pay is a second data source or the wish to see change over time.
- The rule catalogue, tracker dataset, and explainer pages stay public. The licence, not a paywall, protects them from being forked into a competing knowledge base.
- Nothing in this repository may hold credentials for a third-party service on the developer's behalf, phone home, or gate output.
