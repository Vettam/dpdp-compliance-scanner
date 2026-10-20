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

`observable: true | false` on every rule. A rule with `observable: false` never produces a finding from a scan. It produces a question. A rule with `needs_input` also produces a question when its predicate matches: the trigger was observed, and the missing fact is what the developer supplies. Catalogue 0.6.0 uses that for an unstated retention period (DPDP-C-070), the fiduciary class under Rule 8 (DPDP-C-072), and a processor contract the repository does not contain (DPDP-C-090).

## Assertions

`purpose`, `basis`, and `retention.stated` are claims a person records. A scan leaves `basis` as `unstated` and `retention.stated` empty, and does not treat either as a conclusion. `dpdp map show` tests them. The `dpdp-map` skill is how a developer records the claim; the rule text stays in `rules/`.

| What the map shows | Rule | Output |
|---|---|---|
| `basis` unstated on code-observed personal data (not `C0`) | DPDP-C-095 | arguable finding. The data-map form of DPDP-C-031. |
| `basis: voluntarily_provided` on `C5`, `C6`, or `C9` | DPDP-C-093 | settled finding. Section 7(a) does not carry behavioural, advertising, or derived processing. |
| `basis: consent` and no consent gate | DPDP-C-091 | settled finding. Section 6(10) puts the burden of proof on the fiduciary. |
| `basis: consent` and no `C10` point in the map | DPDP-C-092 | settled finding. The consent record is not on the map. |
| `basis: consent` linked to a code gate with no reject, or a pre-ticked gate | DPDP-C-004, DPDP-C-005 | the page banner rules, applied to that gate. |
| `retention.stated` empty | DPDP-C-070 | question. |
| A stated period and no deletion signal | DPDP-C-071 | arguable finding. A soft-delete column satisfies it. |
| A stored column, class unknown | DPDP-C-072 | question, contingent on `fiduciary_class`. |
| A processor recipient | DPDP-C-090 | question. A fiduciary, including Razorpay, does not match. |
| Stored columns and no access, erasure, or correction route | DPDP-C-080, DPDP-C-081, DPDP-C-082 | arguable finding for each missing route. |
| A code-observed recipient outside India | DPDP-C-094 | open finding. The same corrective note as DPDP-C-020: transfer is permitted unless restricted. |

A finding that tests a claim says the claim and the Act disagree. It does not say the claim is false.

The `dpdp-notice` skill copies those claims into a consent notice or a change notice. It itemises only data points on the map. Withdrawal, grievance, a complaint to the Board, and Hindi stay blanks. A purpose the earlier map does not already record asks for fresh consent; a new recipient does not. The draft is not a finding and not a verdict. `dpdp notice lint` checks a published notice against the map and does not draft.

## Why certainty, not severity

India has no cookie law. The relevance of a page scan under DPDP rests on an inference chain (`docs/legal-sources/spec.md` §0.3). The same chain for every data point is `docs/spec-v2.md` §0.2. Some links in that chain are settled, some arguable, some open. The tool's job is to show which is which. Severity would be a product judgement; certainty is a reading of the law, and the reading is versioned and citable.
