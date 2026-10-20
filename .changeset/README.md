# Changesets

This folder is managed by [@changesets/cli](https://github.com/changesets/changesets).

To record a change, run:

```sh
npm run changeset
```

and follow the prompts. A new file describing the change will be added here. The
`version` and `release` scripts consume these files to bump `package.json` and
publish to npm. The release script is not named `publish`, because npm runs a
`publish` lifecycle script during `npm publish`.

The rule catalogue (`rules/VERSION`), vendor dataset (`vendors/VERSION`), and
engine version are versioned **independently** of the npm package version. Use a
changeset to bump the npm package; bump the catalogue/dataset/engine versions in
their own `VERSION` files when their contents change.
