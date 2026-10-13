# The certainty model

Every finding carries two orthogonal axes. There is no severity field.

## Certainty tier (interpretive confidence)

| Tier | Meaning | Test |
|---|---|---|
| `settled` | The text of the Act or Rules is clear and its application to this observation needs no interpretation. | A competent lawyer would not hedge. |
| `arguable` | The provision applies, but its application to this fact pattern is contestable. | A competent lawyer would say "probably, but…" and give reasons. |
| `open` | No Board guidance, no case law, the text is silent or undefined; resolved by future orders. | A competent lawyer would say "nobody knows yet". |

## Enforceability (temporal status)

`enforceable_from: <ISO date>` on every rule. Most substantive obligations under the Act commence **13 May 2027**. A finding whose rule is not yet enforceable is still reported; the date is shown beside it. This axis is separate from certainty because a provision can be perfectly clear and not yet in force.

## Observability

`observable: true | false` on every rule. Unobservable rules (retention, server-side tagging, log handling) never produce findings from the engine alone. They produce **questions** in the report and are wired to the hosted tool's questionnaire.

## Why certainty, not severity

India has no cookie law. The relevance of a page scan under DPDP rests on an inference chain (`docs/legal-sources/spec.md` §0.3). The same chain for every data point is `docs/spec-v2.md` §0.2. Some links in that chain are settled, some arguable, some open. The tool's job is to show which is which. Severity would be a product judgement; certainty is a reading of the law, and the reading is versioned and citable.
