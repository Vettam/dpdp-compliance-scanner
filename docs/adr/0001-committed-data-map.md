# The data map is a committed artefact, built by machines and corrected by people

**Status:** accepted

The codebase scanner cannot see everything: a hand-rolled `fetch` to an analytics host, a free-text column holding health data, or a vendor SDK it has no signature for. An agent can, but an agent's output is not reproducible and cannot honestly gate or diff in CI. We decided that the data map lives as a file in the developer's own repository: a deterministic scanner writes the baseline with detection confidence, a skill lets an agent and the developer enrich and correct it (answering the questions the scanner raises), and CI re-runs only the deterministic scanner and reports drift against the committed map. Machines detect change; humans and agents decide what the data means.

## Considered options

- Deterministic scanner only. Reproducible, but blind to anything semantic, and the misses are exactly the data points DPDP cares most about.
- Agent only. Catches semantics, but non-reproducible, needs an LLM key, and cannot be a CI baseline.

## Consequences

- We own a schema that developers edit by hand. It must stay small and stable; breaking changes to it are breaking changes to the product.
- The same file is the hand-off to the notice draft and to the hosted dashboard, so neither needs to re-scan.
- This mirrors the page scanner's existing rule: observation (facts) and interpretation (reading) are separate, and the facts can be trusted on their own.
