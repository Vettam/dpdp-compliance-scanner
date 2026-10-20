# Explainer JSON

The Sentinel site builds one page per rule at `https://sentinel.vettam.ai/rules/<id>`. This repository emits the JSON for that build. Rendered pages are not committed here and are not in the npm package.

## Build

`npm run build` deletes `dist/`. Run the explainer build after it:

```bash
npm run build
npm run build:explainers
```

That replaces `dist/explainers/` with one `<rule-id>.json` per `rules/*.yaml` (35 files in the current catalogue). `dist/` is gitignored. `package.json` `files` excludes `dist/explainers`.

`schema/explainer.schema.json` is generated from the Zod schema by `npm run gen:schemas`. Change the Zod schema and regenerate; do not hand-edit the JSON Schema file.

## Contract

Each file validates against [`schema/explainer.schema.json`](../schema/explainer.schema.json). String fields are trimmed.

| Field | Meaning |
|---|---|
| `id` | Rule id, `DPDP-C-NNN` |
| `title` | Rule title |
| `tier` | The rule's `certainty`: `settled`, `arguable`, or `open` |
| `provisions` | Provisions the rule cites |
| `rationale_plain` | Plain-language rationale |
| `rationale_dev` | Developer rationale |
| `enforceable_from` | Date the obligation can be enforced |
| `observable` | Whether a scan can observe the fact |
| `needs_input` | Facts the rule asks the developer to supply |
| `since` | Catalogue version that added the rule |
| `changelog` | `{ version, date, note }` entries from the rule file |
| `related` | Other rule ids that share a provision or a category, sorted |
| `questions` | The question text this rule raises, or `[]` |

`related` is that overlap and nothing tighter. Rules that cite `s.6(1)` list each other.

A rule raises a question when `observable` is false, or when `needs_input` is non-empty. `questions` is that rule's `prompt` with whitespace collapsed. When the prompt is absent, the title is used.

The rule file's `explainer_url` must be `https://sentinel.vettam.ai/rules/` plus the id. `dpdp explain DPDP-C-001` prints that URL on its last line.

CI runs `npm run build:explainers` after `npm run build`. A shipped rule that lacks a field the builder reads, including `rationale_plain`, fails the run.
