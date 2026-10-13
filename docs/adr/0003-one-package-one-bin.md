# One npm package, one `dpdp` bin with sub-commands

**Status:** accepted

The product grew from a page scanner into several scanners plus a notice generator. We decided to publish a single npm package, `dpdp-compliance-scanner`, with a single bin, `dpdp`, and sub-commands (`dpdp scan page`, `dpdp scan code`, `dpdp map diff`, `dpdp notice lint`, …), rather than a monorepo of scoped packages or a growing list of flat bins. One bin means `npx dpdp-compliance-scanner …` runs it without `--package`. The GitHub repository stays `Vettam/dpdp-cookie-scanner`, so the Action is `Vettam/dpdp-cookie-scanner/action@v2`. The old package name is published once, by hand, as `dpdp-cookie-scanner@1.0.0`: it depends on `dpdp-compliance-scanner@>=2`, forwards `dpdp-cookie-scan`, `dpdp-cookie-scanner`, and `dpdp-notice-lint`, and is then deprecated and never published again.

## Considered options

- A monorepo of scoped packages (`@dpdp/page`, `@dpdp/code`, …). Cleaner dependency graphs, but the funnel depends on one paste-able command, and everything ships from one repository on one release train anyway.
- Keep flat bins and add more (`dpdp-code-scan`, `dpdp-notice-draft`). Least churn, but the surface widens and the package-versus-command naming problem gets worse.
- Publish several versions of the shim. Callers would stay on the old names longer, but the shim would become a second release train.

## Consequences

- Scanners, mapper, and renderers stay as directories inside one package; module boundaries are enforced by convention and tests, not by separate publishes.
- The GitHub Action and `skills/dpdp-scan` ship in the `dpdp-compliance-scanner` release. The shim is outside the changesets train and is published only after `2.0.0` is on npm.
- `package.json` stays at `1.0.0` until the version PR. A major bump of the published `0.5.2` would stop at `1.0.0`, and the shim's `>=2` range would not install that release. The unpublished `1.0.0` is what makes this major changeset publish `2.0.0`.
