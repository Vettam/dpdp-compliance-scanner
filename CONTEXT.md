# DPDP compliance scanner

Records the personal data a product collects, from whichever source it can observe, and maps each item to the DPDP Act and Rules, reporting how settled that reading is.

## Language

### Observation

**Data point**:
One item of personal data a product handles: what it is, where it was observed, who receives it, and how long it is kept. The unit of analysis under DPDP; a cookie, a database column, a form field, and a log line are all data points.
_Avoid_: cookie, tracker, field, PII

**Source**:
One place a scanner can observe data points: a live page, a codebase, a database schema, an external form.
_Avoid_: target, input, surface

**Scan**:
A recording of the data points one source exposes at one moment. A page scan, a codebase scan, and a schema scan are scans of different sources.
_Avoid_: audit, crawl, review

**Scanner**:
The component that performs a scan of one kind of source.
_Avoid_: engine (the page scanner's browser runtime is an implementation detail)

**Data map**:
The merged set of data points from every scan of one product, with the source each came from. Findings, questions, and notice drafts are derived from the data map, never from a single scan.
_Avoid_: inventory, data flow diagram, RoPA

**Vendor**:
A third party that receives data points, recognised by its hosts, its packages in each ecosystem, and its signatures. A vendor is either a fiduciary in its own right or a processor acting on the data fiduciary's instructions.
_Avoid_: tracker, tag, SDK, integration

**Recipient**:
A vendor that a specific data point reaches, with the country it resolves to. The itemised recipient list a data principal may ask for is the set of recipients in the data map.
_Avoid_: third party, destination, sub-processor

**Question**:
A fact no scanner can observe that changes how a data point is read: the purpose it serves, how long it is kept, whether a site reaches children, whether an unrecognised import sends data out. Put to the developer or data fiduciary; the answer is recorded in the data map.
_Avoid_: prompt, questionnaire item, todo

### Interpretation

**Finding**:
One rule applied to one or more data points: what was observed, which provisions it engages, how certain the law is, and from when it is enforceable. Never a verdict on the product.
_Avoid_: violation, issue, alert, error

**Certainty tier**:
How settled the law is for a finding: `settled` (the text is clear), `arguable` (the provision applies but its application here is contestable), or `open` (no Board guidance, no case law). A property of the rule, never of the vendor. There is no severity.
_Avoid_: severity, risk level, score

**Assertion**:
A claim the data fiduciary records against a data point that no scanner can observe: its purpose and its lawful basis. The mapper tests an assertion against the Act; it never accepts it as a conclusion.
_Avoid_: declaration, label, override

**Explainer**:
The public page for one rule on the Sentinel website: the rule's rationale plus worked examples, what changed, related rules, and questions. Built from the rule file at the site's deploy; the only rendered home of the rule. A scan's findings link to it.
_Avoid_: rule page, docs page, wiki

**Data principal**:
The person a consent notice is written to: the visitor of a website, the customer of an app.
_Avoid_: user, data subject

**Data fiduciary**:
The person or organisation that decides why personal data is processed and that publishes the consent notice.
_Avoid_: user, site owner, website maker

**Consent notice**:
The standalone text that accompanies or precedes a consent request. It itemises the personal data and the purpose, and tells the data principal how to withdraw consent, raise a grievance, and complain to the Board.
_Avoid_: privacy policy, privacy notice, cookie policy

**Notice draft**:
A consent notice this product produces for the data fiduciary to complete and publish. Its finished sentences itemise only data points in the data map. Withdrawal, grievance, complaint to the Board, and Hindi stay blanks the fiduciary fills. It is addressed to the data principal and is not advice to the data fiduciary.
_Avoid_: legal opinion, finished notice, compliance certificate, privacy policy

**Change notice**:
A notice to data principals whose data is already held, produced when the data map changes: a new data point, recipient, or purpose. Where the purpose is new, it asks for fresh consent. It is the message the fiduciary sends to existing customers, not a new consent notice.
_Avoid_: update email, policy update, changelog

**Cover sheet**:
The page that accompanies a notice draft or change notice and traces each sentence to the data point it came from. Written for the fiduciary's lawyer, not the data principal.
_Avoid_: audit trail, appendix, evidence pack

**Notice lint**:
A check of a published consent notice against the data map: each data point itemised, withdrawal and grievance stated, English plus an Eighth Schedule language present. It never drafts.
_Avoid_: notice scan, policy check

**Consent gate**:
The point in a flow where processing waits for the data principal's clear affirmative act: a banner on a page, a checkbox or dialogue at sign-up, a check in code before a call is made. A data point whose basis is consent must sit behind one; a scan that finds none is a finding, and the finding tells the developer that a gate is required, not how to build it.
_Avoid_: consent flow, opt-in, permission prompt

**Consent banner**:
The consent gate on a web page: the on-page control through which a person gives or refuses consent.
_Avoid_: cookie banner, CMP

**Consent manager**:
A runtime that presents the banner, records the choice, and gates processing.
_Avoid_: cookie banner, consent widget
