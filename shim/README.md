# dpdp-cookie-scanner

Deprecated shim. The package moved to [`dpdp-compliance-scanner`](https://www.npmjs.com/package/dpdp-compliance-scanner), which has one bin, `dpdp`.

| Old bin | Forwards to |
|---|---|
| `dpdp-cookie-scanner`, `dpdp-cookie-scan` | `dpdp scan page` |
| `dpdp-cookie-scan --diff-from … --diff-to …` | `dpdp map diff` |
| `dpdp-notice-lint` | `dpdp notice lint` |

Install the new package directly:

```bash
npx dpdp-compliance-scanner scan page <url>
```

## One-time publish

This package is **outside the changesets train**. Publish it once, by hand, after `dpdp-compliance-scanner@2.0.0` (or newer) is on npm, then never again.

```bash
cd shim
npm publish --access public
npm deprecate dpdp-cookie-scanner@1.0.0 "Renamed to dpdp-compliance-scanner. Use: npx dpdp-compliance-scanner"
```

`npm deprecate` marks `1.0.0` deprecated with a message that points at the new name. Do not publish another version of this shim.
