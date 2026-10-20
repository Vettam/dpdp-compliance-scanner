# GitHub Action — `dpdp`

Thin wrapper around the CLI. On a pull request it runs the scans you ask for,
diffs the committed data map against the base commit, uploads the findings,
the data map, and `datamap-diff.json` as the `dpdp-scan` artifact, and posts
(or updates) one comment: the drift table, then the findings.

All interpretation stays in the CLI. This Action does not decide certainty
and does not say a product is or is not compliant. It does not fail the job
because findings exist. `fail-on` is forwarded to the scans:

- `settled` — exit 1 when a scan has a settled finding. Never trips on arguable or open findings.
- `unmapped` — exit 1 when `dpdp scan code` observed a data point, recipient, consent gate, or retention signal the committed map does not account for. A page scan does not accept this value; a page-only job ignores it.

`dpdp map diff` writes the drift report. Catalogue drift (a `rules_version` or
`vendors_version` change) never fails the job. A data map the pull request
itself commits does not fail the job either: once that map accounts for the
scan, `unmapped` passes.

Check out the repository with `fetch-depth: 0` so the base commit is available.
The Action fetches the base commit when a shallow clone does not have it.

The Action downloads the `dpdp-compliance-scanner` package. Locally that is:

```bash
npx dpdp-compliance-scanner scan page <url> --ci
npx dpdp-compliance-scanner scan code --ci
npx dpdp-compliance-scanner map diff --from <base> --to HEAD --ci
```

## Usage

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
          version: "2.0.0"   # pin the npm package; omit for latest
          fail-on: unmapped
```

Pin the Action ref (`@v2`) and `version` together so the wrapper and the CLI
cannot drift. Set `url`, or `code: true`, or both.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `url` | empty | Page to scan. Empty skips the page scan |
| `code` | `false` | Run `dpdp scan code --ci` |
| `version` | latest | npm package version of `dpdp-compliance-scanner` |
| `gpc` | `false` | Send `Sec-GPC: 1` |
| `include-query` | `false` | Keep query strings in evidence |
| `timeout` | `15000` | Navigation timeout (ms) |
| `settle` | `3000` | Post-load wait (ms) |
| `interact` | `false` | Three-pass banner interaction |
| `fail-on` | empty | `settled` and, for the code scan, `unmapped` |
| `out` | `dpdp-scan` | Output directory |
| `comment` | `true` | Post/update the PR comment |
| `github-token` | `${{ github.token }}` | Token for the comment |

## Outputs

- `json-path` — path to `findings.json` (page scan when `url` is set, otherwise the code scan)
- `md-path` — path to `findings.md`
- `diff-path` — path to `datamap-diff.json` on a pull request

Page findings are written to `out/`. Code findings are written to `out/code/`
so the two scans do not overwrite each other. The job exit code follows the
scans: `0` on a completed scan regardless of findings, `1` when `fail-on`
trips, non-zero on usage or navigation failure. The map diff's exit code is
not the job status.
