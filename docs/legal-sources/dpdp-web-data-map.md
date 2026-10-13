# Anatomy of a Page Visit — Web Data Collection Mapped to the DPDP Act 2023 and Rules 2025

*An engineering reference. Built on the project's DPDP guide, cross-checked against the text of the Act (Act 22 of 2023) and the Rules (G.S.R. 846(E)). A reading of the documents, not legal advice. Substantive obligations commence 13 May 2027 — roughly eight months from now.*

---

## Part 0 — The premise: India has no cookie law

Most cookie banners in the world are built for the EU ePrivacy Directive, whose trigger is a *technology*: storing or reading information on the user's device. DPDP has no equivalent provision. Its trigger is *personal data*, full stop. That single difference reshapes the whole problem, in four ways.

**The unit of analysis is the data point, not the cookie.** A server log line, a localStorage key, a canvas fingerprint, a Conversions API call made from your backend, and a Google Fonts request that hands a visitor's IP to Google are all equally "processing" under s.2(x). A scanner or notice that only enumerates cookies describes a fraction of what a page actually collects.

**There is no "strictly necessary" exemption.** ePrivacy exempts storage that is strictly necessary for a service the user requested. DPDP has no such carve-out. Every data point needs either consent or a limb of s.7, and for web traffic the only realistic limb is s.7(a) — data "voluntarily provided" for a "specified purpose". The strictly-necessary tier doesn't disappear, but it has to be re-argued through s.7(a) rather than assumed.

**Pseudonymous identifiers are personal data.** s.2(t) covers data about an individual "identifiable by or in relation to such data". A `_ga` client ID, a hashed email, a device fingerprint and an IP address are all identifiable *in relation to* other data held by you, your vendor, or an ISP. Hashing is pseudonymisation, not anonymisation.

**"Traffic data" is a named regulatory object.** Rule 8(3) requires retention of "personal data, associated traffic data and other logs of the processing" for at least a year, and Rule 13(4) extends SDF localisation to "the traffic data pertaining to its flow". Neither the Act nor the Rules define the term. The likely interpretive anchor is the IT Act's s.69B definition (data identifying origin, destination, route, time, date, size, duration or type of a communication) — which describes your access logs almost exactly. Treat that as a working assumption until the Board says otherwise.

---

## Part 1 — A typical cookie notice versus what DPDP actually requires

| Element | Typical GDPR-style cookie banner today | DPDP requirement | Gap to close |
|---|---|---|---|
| **Trigger** | Setting or reading device storage | Any processing of personal data (s.2(t), s.2(x)) | Notice must cover logs, fingerprinting, server-side tags, embeds — not just cookies |
| **Exempt tier** | "Strictly necessary" cookies need no consent | No exemption; must fit s.7(a) or get consent (s.4) | Document the s.7(a) argument for each essential item |
| **"Legitimate interest" toggles** | Common, especially under IAB TCF | Basis doesn't exist (s.4, s.7 is closed) | Rebase every LI purpose to consent or drop it |
| **Notice content** | Cookie categories plus a link to a cookie policy table | Itemised personal data, specified purpose, specific description of the goods/services/uses enabled (Rule 3(b)) | "We use analytics cookies" fails; list the actual fields (IP, device model, OS version, click ID…) |
| **Standalone** | "See our Cookie Policy for details" | Understandable independently of any other information (Rule 3(a)) | The banner/notice layer must carry the itemised content itself |
| **Language** | Usually English only | Option of English or any Eighth Schedule language (s.5(3), s.6(3)) | Translated notice strings, versioned per language |
| **Consent act** | Implied consent ("continuing to browse"), cookie walls, pre-ticked toggles are still common | Free, specific, informed, unconditional, unambiguous, clear affirmative action (s.6(1)) | No walls, no pre-ticks, no bundling; tags blocked until the act |
| **Consent scope** | Whatever the vendor list says, often hundreds of vendors | Limited to data *necessary* for the purpose; anything beyond is void, not merely risky (s.6(1) illustration) | Vendor sprawl in one consent is legally ineffective for the unnecessary part |
| **Withdrawal** | A footer link that reopens the banner, sometimes hard to find | As easy as giving consent (s.6(4)); Fiduciary must cease *and cause processors to cease* (s.6(6)); link and means stated in the notice (Rule 3(c)) | Persistent choices control plus downstream deletion/stop signals to vendors |
| **Proof** | A consent cookie on the device, lost when cleared | Fiduciary bears the burden of proving notice and consent (s.6(10)) | Server-side, append-only consent ledger tied to notice version |
| **Rights & complaints** | Rarely mentioned in the banner | Notice must say how to withdraw, seek grievance redressal, and complain to the Board (s.5(1), Rule 3(c)); contact published (s.8(9), Rule 9) | Add rights, grievance and Board complaint paths to the notice layer |
| **Third parties** | Vendor list in the policy | On request: identity of every Fiduciary and Processor data was shared with, plus a description of the data (s.11(1)(b)) | A live sharing register generated from the tag inventory |
| **Retention** | Cookie expiry shown per cookie | Erase when purpose is served or consent withdrawn (s.8(7)); minimum one-year retention of data, traffic data and logs (Rule 8(3)) | Cookie expiry is not data retention; the server-side copy is what counts |
| **Children** | Seldom addressed | Parental consent for any processing (s.9(1)); tracking, behavioural monitoring and targeted ads prohibited for under-18s regardless of consent (s.9(3)) | An age posture that switches C5/C6 off for minors |

---

## Part 2 — The classification scheme

### 2.1 Primary categories (by purpose and lawful basis)

Every data point in Part 3 is assigned one primary category. The categories are defined by *what the data is used for and which lawful basis can carry it*, not by the technology that collects it — the same IP address is C1 when used to serve a page and C9 when used to infer a company for sales outreach.

| Code | Category | What lives here | Lawful basis | Core provisions | Worst-case penalty band |
|---|---|---|---|---|---|
| **C0** | Outside the Act | Truly aggregated counts with no identifier retained; data the person made public herself (s.3(c)(ii)) | None needed | s.2(t), s.3(c) | — |
| **C1** | Service delivery | What it takes to return the page or complete the function the visitor asked for | s.7(a) — strong when the visitor initiated an action, weaker for passive anonymous browsing (see H1) | s.7(a), s.6(1) necessity | ₹50 cr |
| **C2** | Security, integrity & mandated logging | Access logs, WAF/bot signals, fraud checks, error monitoring, backups | No clean s.7 limb; candidates are s.7(a) and s.17(1)(c); Rules 6 and 8(3) require these logs to exist (see H2) | s.8(5), Rule 6, Rule 8(3) | ₹250 cr (security failure) |
| **C3** | Preferences | Language, theme, currency, region | s.7(a) where the user set it; consent otherwise | s.7(a) | ₹50 cr |
| **C4** | Measurement | Page views, traffic sources, conversion counts | Consent; possibly s.17(2)(b) if aggregate-only and never used for a decision about a person (see H3) | s.6, s.17(2)(b), Rule 16 | ₹50 cr |
| **C5** | Experience & behavioural analytics | Session replay, heatmaps, experiments, personalisation, recommendations | Consent | s.6, s.8(3), s.9(3) | ₹200 cr if children affected |
| **C6** | Advertising & cross-context tracking | Pixels, click IDs, retargeting, conversion APIs, ID syncing | Consent; prohibited for children even with consent | s.6, s.9(3), s.11(1)(b), s.16 | ₹200 cr if children affected |
| **C7** | Third-party embedded functionality | Video, maps, chat, fonts, CDN libraries | The function may be s.7(a) if the visitor chose to load it; the vendor's own tracking needs consent | s.8(2), s.11(1)(b), s.16 | ₹50 cr |
| **C8** | User-provided identity & transaction data | Form submissions, accounts, orders, uploads | s.7(a) for the purpose given; consent for anything beyond | s.7(a), ss.11–14, Rule 8 | ₹50 cr |
| **C9** | Derived, inferred & linked data | Segments, scores, identity stitching, enrichment, geo-inference used for profiling | Consent (the guide is explicit that inferred attributes and third-party enrichment sit outside s.7(a)) | s.6, s.8(3), s.33(2)(b) | ₹50 cr |
| **C10** | Consent & rights records | Consent state, ledger, withdrawal events, communication preferences | Processing required to evidence compliance under s.6(10) | s.6(10), s.6(4)–(6) | ₹50 cr |

Any personal data breach in *any* category additionally carries the ₹200 crore notification band under s.8(6) if not reported.

### 2.2 Overlay flags (cross-cutting risk markers)

A data point carries one primary category plus any number of flags. The flags are what turn a generic tracker list into a DPDP-specific one.

| Flag | Meaning | Provisions triggered |
|---|---|---|
| **KIDS** | Plausibly reaches under-18 visitors | s.9(1) parental consent; s.9(3) absolute prohibition on tracking/monitoring/targeted ads; s.9(2) wellbeing |
| **3PF** | Received by an independent (or joint) Fiduciary — the vendor uses it for its own purposes | s.2(i) "alone or in conjunction with"; s.11(1)(b) disclosure; named in notice |
| **PROC** | Received by a Processor acting on your instructions | s.8(2) written contract; Rule 6(1)(f) security flow-down; s.6(6) and s.8(7) cessation/erasure propagation |
| **XFER** | Leaves India | s.16 (permitted unless blacklisted); Rule 15 foreign-state access; Rule 13(4) SDF localisation of data *and traffic data* |
| **DEC** | Feeds a decision affecting the person (block, price, rank, eligibility) | s.8(3) accuracy and completeness; Rule 13(3) algorithmic due diligence if SDF |
| **SENS** | Could reveal or be used to infer health, finances, religion, sexuality, caste, etc. | No data-level sensitive category, but s.33(2)(b) weights penalties by type of data |
| **FP** | Stateless or covert identifier that survives cookie clearing | s.6(4) — withdrawal "with comparable ease" is near-impossible to honour; s.6(1) "informed" |
| **PRE** | Tends to fire before any consent interaction | s.5(1) notice must precede or accompany; s.6(1) no processing before the affirmative act |
| **PII-LEAK** | Commonly carries personal data it wasn't designed to (URLs, log lines, form auto-capture) | s.8(5) safeguards; s.2(u) breach includes accidental disclosure; s.8(6) notification |

### 2.3 Translating legacy CMP categories

| Conventional CMP category | DPDP categories it actually contains | Watch-out |
|---|---|---|
| Strictly necessary | C1, C2, C10 | Not self-executing; needs a documented s.7(a) or security rationale per item |
| Functional / preferences | C3, C7 | Embeds usually set advertising identifiers too — split them |
| Analytics / performance | C4, C5 | Session replay and heatmaps are behavioural monitoring, not "performance" |
| Marketing / advertising | C6, C9 | Includes server-side conversion APIs the browser never shows |
| Social media | C6, C7 | Share buttons and embeds are 3PF by default |
| Unclassified | Anything | Under DPDP an unclassified tracker is an unmapped purpose, and an unmapped purpose can't lawfully continue |

---

## Part 3 — The inventory, layer by layer

The layers follow the order of a page load. The **PD?** column reads: *Yes* (personal data on its own), *Linked* (personal data once joined with an identifier, which in practice it almost always is), *Quasi* (a fingerprinting ingredient — low alone, identifying in combination), *Depends* (varies by implementation).

### L1 — Network and transport (before any page code runs)

| Data point | How it's collected | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Client IP address (v4/v6) | TCP connection; unavoidable | Yes | C1 / C2 | PRE, XFER (via CDN) | s.2(t); Rule 8(3) traffic data, 1-year floor; Rule 6(1)(c) |
| Source port + connection timestamp | TCP | Linked | C2 | — | Behind carrier-grade NAT, IP alone maps to many subscribers; IP + port + time is what resolves to a person |
| TLS ClientHello fingerprint (JA3/JA4), SNI | Handshake, captured at CDN/WAF | Quasi | C2 | FP | s.6(1) necessity — justified for bot defence, not for analytics |
| Passive OS fingerprint (TTL, window size, TCP options) | TCP stack, at edge | Quasi | C2 | FP | Same as above |
| Geo-IP derivation (country, city, ASN, ISP) | Lookup against IP | Yes (derived) | C1 (routing, localisation) / C9 (profiling) | — | Purpose decides the basis; s.7(a) doesn't stretch to profiling |
| Bytes, status codes, duration, route | Edge and origin | Linked | C2 | — | The core of "traffic data" under Rule 8(3) |
| Authoritative DNS query logs | Your DNS provider (sees resolver IP, sometimes EDNS client subnet) | Depends | C2 | PROC | s.8(2) if the provider logs it for you |

### L2 — HTTP request metadata (sent automatically with every request)

| Data point | How it's collected | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| User-Agent string | Request header | Quasi | C1 | — | Itemise in notice (Rule 3(b)) if stored |
| UA Client Hints — low entropy (brand, mobile, platform) | Sent by default in Chromium | Quasi | C1 | — | — |
| UA Client Hints — high entropy (device model, full version, platform version) | Sent only when the server asks via `Accept-CH` | Quasi | C4 / C5 | FP | Requesting them is a deliberate collection act; s.6(1) needs a purpose |
| Accept-Language | Request header | Quasi | C3 | — | — |
| Referer | Request header; modern default policy sends only the origin cross-site | Depends | C4 | PII-LEAK | Full URL on same-site navigation; third-party scripts read `document.location` anyway |
| Full URL + query string | Request line | Depends | C1 / C6 | PII-LEAK, PRE | UTM tags benign; `gclid`/`fbclid`/`msclkid`/`ttclid` are ad-account click identifiers (C6); emails or reset tokens in URLs are leaks (s.8(5)) |
| Cookie header | Request header | Yes | per cookie | — | See L4 |
| Sec-GPC / DNT | Request header | Signal | C10 | — | Not recognised by DPDP, but arguably an indication of non-consent under s.7(a)'s proviso (see H9) |
| X-Forwarded-For / proxy chain | Proxies, CDN | Yes | C2 | — | Same treatment as IP |
| Authorization header / bearer tokens | API calls from the page | Yes | C1 | PII-LEAK | Never log; Rule 6(1)(a)–(b) |

### L3 — Server and infrastructure records

| Data point | How it's collected | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Access logs (web server, load balancer, CDN edge) | nginx, ALB, Cloudflare, etc. | Yes | C2 | PROC, XFER | Rule 6(1)(c) visibility; Rule 6(1)(e) and Rule 8(3) — keep ≥ 1 year, then erase unless another law requires more |
| Application logs | App code | Depends | C2 | PII-LEAK | Rule 6(1)(a) masking at write time; an exposed log bucket is a notifiable breach |
| Error and crash reports | Sentry, Bugsnag, etc. | Yes (user context, IP, breadcrumbs, request bodies) | C2 | PROC, XFER, PII-LEAK | s.8(2) contract; scrub before send |
| APM / distributed traces | Datadog, New Relic, OpenTelemetry | Depends (headers, bodies, SQL params) | C2 | PROC, XFER, PII-LEAK | Same |
| WAF, bot-management and rate-limit state | Edge or app | Yes | C2 | DEC | s.17(1)(c) candidate; s.8(3) if it blocks a real person |
| Server-side session store | Redis, DB | Yes | C1 | — | s.7(a) |
| Server-side tagging (GTM server container, Meta CAPI, Google Enhanced Conversions relays) | Your backend forwards events to ad platforms | Yes | C6 | 3PF, XFER | Invisible to any browser-based scan; identical obligations; must appear in notice and s.11(1)(b) register |
| Backups and log archives | Object storage, snapshots | Yes | C2 | PROC | Rule 6(1)(d); s.8(7) erasure must eventually reach these |

### L4 — Browser storage (cookies and everything that behaves like them)

DPDP is indifferent to whether an identifier sits in a cookie, `localStorage`, `sessionStorage`, IndexedDB, the Cache API, or a service worker. What matters is whether it identifies someone and what it's used for.

| Data point (example names) | Set by | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Authentication session (`sessionid`, `connect.sid`) | First party | Yes | C1 | — | s.7(a) for a logged-in user; Rule 6(1)(a)–(b): `Secure`, `HttpOnly`, `SameSite` |
| CSRF token | First party | Linked | C1 / C2 | — | — |
| Load-balancer affinity (`AWSALB`, `AWSALBCORS`) | Infra | Linked | C1 | PRE | — |
| Bot-management (`__cf_bm`, `cf_clearance`, `_GRECAPTCHA`) | Security vendor | Yes | C2 | PROC / 3PF, PRE | Vendor role varies — CAPTCHA providers may reuse signals for their own models |
| Consent state (`OptanonConsent`, `CookieConsent`, `euconsent-v2`) | CMP | Yes | C10 | — | The device copy is not proof under s.6(10); mirror it server-side |
| Preferences (language, theme, currency, region) | First party | Linked | C3 | — | s.7(a) where user-set |
| Anonymous cart / wishlist | First party | Linked | C1 | — | s.7(a) |
| First-party analytics IDs (`_ga`, `_ga_*`, `_pk_id`, Mixpanel/Amplitude device IDs in localStorage) | Analytics SDK | Yes | C4 | PROC / 3PF, XFER, PRE | Consent, or s.17(2)(b) only if genuinely aggregate (H3) |
| Attribution and click IDs (`_gcl_au`, `_gcl_aw`, `_fbp`, `_fbc`, stored UTMs) | Ad tags | Yes | C6 | 3PF, XFER, KIDS | Consent; s.9(3) |
| Session replay / heatmap IDs (`_hjSessionUser_*`, `_clck`, `_clsk`) | UX tools | Yes | C5 | PROC / 3PF, XFER, KIDS | Consent |
| Experiment buckets and feature-flag keys | Optimizely, VWO, LaunchDarkly | Yes | C5 (C1 for pure operational rollout with no per-user analysis) | — | — |
| Chat widget identity (`intercom-id-*`, `intercom-session-*`) | Support vendor | Yes | C7 → C8 once identified | PROC, XFER | s.8(2) |
| Payment fraud IDs (`__stripe_mid`, `__stripe_sid`) | Payment provider | Yes | C2 | 3PF, XFER | Sectoral overlay: payment data rules survive under s.16(2) |
| Third-party ad cookies (`IDE` on doubleclick.net, `fr` on facebook.com, LinkedIn `bcookie`/`li_sugr`) | Third-party domains | Yes | C6 | 3PF, XFER, KIDS, PRE | Blocked or partitioned by default in Safari and Firefox, still allowed in Chrome — but browser policy is not a lawful basis |
| Embedded media storage (YouTube `VISITOR_INFO1_LIVE`, `YSC`) | Iframe | Yes | C7 (C6 in effect) | 3PF, XFER, PRE | Use click-to-load facades |
| Covert identifiers (ETag/cache tagging, HSTS "supercookies", favicon cache, IDs parked in service workers) | Abuse of browser caches | Yes | C6 / C9 | FP | Effectively unnoticeable and unwithdrawable; fails s.5 and s.6(1) "informed" |

### L5 — Client-side script telemetry

**A. Device and environment**

| Data point | How it's collected | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Screen resolution, viewport, pixel ratio, colour depth | JS | Quasi | C4 | FP | Responsive layout needs these locally, not on your server |
| Timezone, locale | `Intl` API | Quasi | C3 / C4 | FP | — |
| CPU cores, device memory, touch points, connection type | `navigator.*`, Network Information API | Quasi | C4 | FP | — |
| Canvas, WebGL, AudioContext and font-enumeration fingerprints | Fingerprinting scripts | Yes (built to identify) | C6, or C2 if strictly for fraud | FP, KIDS | Stateless identifiers make s.6(4) withdrawal meaningless; if used for fraud, confine to C2 with a documented necessity limit |

**B. Behaviour**

| Data point | How it's collected | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Page views, navigation path, dwell time, scroll depth | Analytics SDK | Linked | C4 | PROC / 3PF | Consent |
| Clicks, rage clicks, element interactions | Product analytics | Linked | C4 / C5 | — | Consent |
| Session replay (DOM snapshots, mouse paths, keystroke timing) | Hotjar, Clarity, FullStory, LogRocket | Yes | C5 | PII-LEAK, SENS, KIDS, XFER | Consent; masking is a Rule 6(1)(a) control; unmasked capture of passwords or health details is a breach |
| Form-field analytics and pre-submit capture (typed but never sent) | Form tools; some pixels' automatic "advanced matching" | Yes | C5 / C6 | PII-LEAK, SENS | Not s.7(a) — data isn't "voluntarily provided" until submitted (H4) |
| Site search queries | Search box | Yes | C1 (returning results) / C9 (profiling) | SENS | Purpose split matters |
| Core Web Vitals / real-user performance | RUM scripts | Low if aggregated | C0 / C4 | — | Strip identifiers and it can sit in C0 |
| Client-side JS errors | Browser error SDK | Linked | C2 | PII-LEAK | — |

**C. Permission-gated device APIs**

| Data point | How it's collected | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Precise geolocation | Geolocation API | Yes | C1 when user-initiated (store locator) | SENS, KIDS | s.7(a); for children, Fourth Schedule Part B exempts only safety-oriented location tracking |
| Camera, microphone, clipboard | Media and Clipboard APIs | Yes | C1 / C8 | SENS | A browser permission prompt is not DPDP consent — no itemised notice, no purpose, no withdrawal path |
| Web push subscription endpoint | Push API | Yes | C8 (transactional) / C6 (marketing) | — | Separate purposes, separate consents |

### L6 — Third-party tags, pixels and embeds (the vendor layer)

On this layer the decisive question is **role**. The Act's Fiduciary definition — whoever "alone or in conjunction with other persons" determines purpose and means — means that when you embed a vendor that uses the data for its own purposes, you are likely a joint Fiduciary for the disclosure you caused.

| Vendor type | Examples | What it receives | Likely role | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|---|
| Tag manager | GTM, Tealium | Loads everything else | Processor (tool) — but it's a force multiplier | — | PRE | Rule 6(1)(b) and (g): access control and review over who can publish tags; a hijacked container is a breach vector |
| Web and product analytics | GA4, Adobe, Mixpanel, Amplitude, PostHog, Matomo | Events, IDs, URL, IP (received even if the vendor says it doesn't store it) | Processor if contractually confined; 3PF for any vendor reuse | C4 | XFER, PRE | s.8(2); receipt of IP is itself "collection" |
| Ad pixels and conversion APIs | Meta Pixel/CAPI, Google Ads + Enhanced Conversions, LinkedIn Insight, TikTok, X | Events, click IDs, IP, UA, hashed email/phone | Independent or joint Fiduciary | C6 | 3PF, XFER, KIDS, SENS, PRE | Consent; vendor named in notice; s.11(1)(b); s.9(3) |
| Retargeting, DMP, CDP | Criteo, Segment, RudderStack | Profiles, event streams | Fiduciary (retargeters) / Processor (CDPs) | C6 / C9 | 3PF or PROC, XFER | CDP fans data out — its destinations are your sharing register |
| Session replay and heatmaps | Hotjar, Clarity, FullStory | DOM, inputs, movement | Processor, subject to vendor reuse terms | C5 | PII-LEAK, KIDS, XFER | Consent; masking defaults |
| Chat, support, feedback | Intercom, Zendesk, Freshchat, Tawk.to, WhatsApp widget | Identity, message content, page context | Processor | C7 / C8 | XFER | s.8(2) |
| Bot protection / CAPTCHA | reCAPTCHA, Turnstile, hCaptcha | Behavioural and device signals | Processor, or 3PF where signals train vendor models | C2 | FP, XFER, PRE, DEC | Confine to security necessity |
| Payments | Razorpay, PayU, Stripe (checkout iframes) | Card and bank data (to them), device data | Separate regulated Fiduciary | C8 / C2 | 3PF | RBI payment-data localisation survives under s.16(2) |
| Identity and social login | Sign in with Google, OTP/SMS gateways | Identity, phone | Fiduciary (IdP) / Processor (SMS gateway) | C8 | XFER | — |
| Embedded media and maps | YouTube, Vimeo, Google Maps, social post embeds | IP, UA, their own cookies | Independent Fiduciary | C7 (C6 in effect) | 3PF, XFER, PRE, KIDS | Click-to-load facade converts passive load into a user-initiated s.7(a) act |
| Static CDNs and web fonts | Google Fonts, cdnjs, jsDelivr, Font Awesome kits | IP, UA, Referer | Processor at best, usually with no contract | C7 | XFER, PRE | No s.8(2) contract → self-host; Subresource Integrity hashes as a Rule 6(1)(g) control |
| Affiliate and partner tracking | Impact, Admitad, Cuelinks | Click IDs, conversions | Fiduciary | C6 | 3PF | Consent |
| Consent management platform | OneTrust, Cookiebot, CookieYes | Consent records, IP | Processor | C10 | XFER | The ledger must be under your control and exportable — it is your s.6(10) evidence |

### L7 — User-provided and identity data

| Data point | How it's collected | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Contact, demo and newsletter form fields (name, work email, phone, company, message) | Form submit | Yes | C8 | — | s.7(a) for answering the request (the Act's broker illustration); marketing nurture beyond it needs consent; s.6(1) — don't make phone mandatory if it isn't needed |
| Account credentials and profile | Signup | Yes | C8 | — | s.7(a); Rule 6(1)(a) password hashing; Rule 8 excludes account-access data from inactivity erasure |
| OTP and phone verification | SMS gateway | Yes | C8 / C2 | PROC | — |
| Age declaration and age-assurance signals | Age gate | Yes | C8 | KIDS | Fourth Schedule Part B: processing to confirm someone is *not* a child is exempt from parental consent; Rule 10 verification |
| Orders, payment metadata, delivery address | Checkout | Yes | C8 | — | Rule 8(3) e-book illustration: keep ≥ 1 year even after account deletion |
| Uploaded documents and files | Upload | Yes | C8 | — | Often customer data → Processor hat; role-map per field |
| Identity stitching (anonymous ID → user ID via `identify()`/`alias()`) | Analytics SDK | Yes | C9 | SENS | Retroactively attaches all prior browsing to a named person — a new purpose needing consent; s.11(1)(a) summaries must include the stitched history |
| Hashed email/phone sent to ad platforms | Enhanced Conversions, Advanced Matching, CAPI | Yes | C6 | 3PF, XFER | Hashing ≠ anonymisation; the platform matches it to a real account |
| Communication preferences and unsubscribe status | Preference centre | Yes | C10 | — | Must be retained to keep honouring withdrawal |

### L8 — Derived, inferred and linked data

| Data point | How it's produced | PD? | Cat. | Flags | DPDP hooks |
|---|---|---|---|---|---|
| Audience segments and interest categories | Analytics and ad platforms | Yes | C9 | SENS, KIDS, 3PF | Consent — explicitly outside s.7(a) per the guide |
| Lead and propensity scores | Marketing automation | Yes | C9 | DEC | s.8(3) where the score changes what the person is offered |
| Reverse-IP company identification; individual de-anonymisation services | Clearbit-style reveal, 6sense-style intent, person-level reveal tools | Yes at person level; company level is arguable | C9 | 3PF | Third-party enrichment needs consent; person-level reveal of anonymous visitors is the hardest thing on this list to defend |
| Cross-device graphs, probabilistic matching | Ad-tech | Yes | C9 / C6 | FP, 3PF | Consent; practically unwithdrawable |
| Fraud and bot risk scores | WAF, fraud engines | Yes | C2 | DEC | s.8(3) — blocking a real person is a decision affecting her |
| Personalisation, recommendations, dynamic pricing | Recommenders, pricing engines | Yes | C5 / C9 | DEC, KIDS | s.8(3); Rule 13(3) algorithmic due diligence if designated SDF |
| Sensitive inferences from pages visited (health, religion, sexuality, finances, caste) | Any of the above | Yes | C9 | SENS, KIDS | No sensitive category exists, but s.33(2)(b) raises penalties; for children, s.9(2) wellbeing is absolute |

---

## Part 4 — Reverse map: each provision's landing point in the page-visit stack

| Provision | Where it lands on a website | Engineering control |
|---|---|---|
| **s.3(a)–(b)** Territorial scope | Any site offering goods or services to people in India, wherever hosted. No "monitoring behaviour" limb, so pure tracking of Indian visitors by a site not offering them anything is arguably outside — untested | Don't build a geo-split posture on this gap |
| **s.2(t)** Personal data | Every persistent identifier, IP, fingerprint, hashed contact | Default every identifier to "personal data" in the dataset |
| **s.4 + s.7** Lawful basis | Every row in Part 3 needs consent or s.7(a); no legitimate interest, no strictly-necessary exemption | Purpose registry keyed per tag, cookie and log stream |
| **s.5(1), Rule 3** Notice | The banner is the notice: standalone, itemised data, specific purpose, withdrawal link, grievance and Board complaint routes | Generate the notice from the scan inventory; version it in a notice registry |
| **s.5(2)** Legacy consent | Consents gathered by pre-2027 banners need a fresh DPDP notice as soon as practicable | Re-prompt existing visitors and users around commencement |
| **s.5(3), s.6(3)** Language | Option of English or any Eighth Schedule language | Translated notice strings, each version stored |
| **s.6(1)** Consent quality | No walls, no pre-ticks, no bundling, no implied consent; unnecessary data outside valid consent | Tags physically blocked until the affirmative act; per-purpose toggles |
| **s.6(2)** Invalid terms | Banner text can't waive DPDP rights | Lint notices for waiver language |
| **s.6(4)–(6)** Withdrawal | As easy as accepting; stop processing and make processors stop | Persistent "privacy choices" control; on withdrawal stop tags, clear storage, call vendor deletion APIs |
| **s.6(10)** Burden of proof | You must prove notice and consent | Server-side, append-only ledger: pseudonymous ID, notice version, language, per-purpose choices, timestamp, UI state |
| **s.8(1)** Non-delegable responsibility | A vendor's misuse of your pixel data is your liability | — |
| **s.8(2)** Processor contracts | Every PROC script and service | Vendor register with contract status |
| **s.8(3)** Accuracy | Bot scores, personalisation, pricing | Human review path for blocks; data quality on decision inputs |
| **s.8(5), Rule 6** Security | Cookie flags, TLS, CSP, SRI, tag-manager permissions, log masking, access logging, backups | Rule 6(1)(a)–(g) checklist per layer |
| **s.8(6), s.2(u), Rule 7** Breach | Script-injection skimming, a pixel auto-capturing form fields into an ad platform, an exposed log bucket, even an outage — all notifiable, no threshold | Third-party script change monitoring, CSP violation reporting, outbound payload inspection |
| **s.8(7)–(8), Rule 8** Retention | Cookie expiry ≠ retention; server-side copies govern; logs and traffic data kept ≥ 1 year then erased | Retention schedule per category; one-year floor on C2 |
| **s.8(9), Rule 9** Contact | Published on the site and in every rights response | Footer and notice layer |
| **s.9** Children | Parental consent for any processing; C5 and C6 prohibited for under-18s even with consent | Choose an age posture; ship a tracker-free experience for minors if they're in scope |
| **s.11** Access | Summary of data and processing; every Fiduciary and Processor it was shared with | Sharing register generated from L6 inventory and server-side destinations |
| **s.12** Correction and erasure | Includes analytics and ad data tied to the person | Wire vendor user-deletion APIs into the DSR console |
| **s.13, Rule 14(3)** Grievance | Published response period ≤ 90 days | — |
| **Rule 14(5)** Identifiers | Anonymous visitors have no published identifier; cookie IDs are device-bound and shared-device-ambiguous | Decide how (or whether) you honour rights requests for unauthenticated browsing data (H8) |
| **s.16, Rule 15** Transfers | Nearly every third-party script sends data abroad; permitted by default | Record destination country per vendor |
| **Rule 13(4)** SDF localisation | If designated, traffic data about specified categories can't leave India — CDN edges and every third-party tag become transfer channels | Keep a residency seam in the edge and tag architecture |
| **s.17(1)(c)** Offence prevention | Fraud and bot defence | Document it as the basis where relied on |
| **s.17(2)(b), Rule 16** Statistics | Aggregate-only analytics with no per-person decisions | Cookieless, aggregate-at-ingest analytics design |
| **s.33 + Schedule** Penalties | Security ₹250 cr > breach notice ₹200 cr = children ₹200 cr > consent/notice ₹50 cr | Prioritise C2 hardening and KIDS flags before banner polish |

**Adjacent overlay, outside the guide — verify before relying on it:** the CERT-In Directions of April 2022 separately require service providers and body corporates to keep ICT system logs for a rolling 180 days, maintained within Indian jurisdiction, and to report specified incidents within six hours. That sits alongside Rule 8(3)'s one-year floor, adds a location constraint on logs that DPDP itself doesn't impose, and is preserved by s.16(2) as a law providing a higher degree of restriction.

---

## Part 5 — The hard calls specific to web tracking

**H1 — The anonymous visitor's IP address.** Is an IP address "voluntarily provided" under s.7(a) when someone types your URL? The browser has to send it to receive the page, so the argument that she provided it for the specified purpose of getting that page is reasonable. But the Act's illustrations (a pharmacy receipt, a broker enquiry) involve deliberate acts, and s.7(a) also assumes a *specified* purpose — which implies the purpose was communicated. The safer reading is that passive browsing data supports s.7(a) only for delivering the page, and only if the notice layer states that purpose.

**H2 — Security logging has no clean s.7 limb.** Rule 6(1)(c) and (e) and Rule 8(3) *require* you to keep logs for a year, yet s.7 has no general "legal obligation" basis — s.7(d) covers only disclosure obligations to the State. The candidates are s.7(a) (secure delivery is part of delivering the service) and s.17(1)(c) (prevention and detection of offences), which disapplies most of Chapter II while keeping s.8(1) and s.8(5). A regulator is unlikely to penalise you for keeping logs the Rules compel, but the basis should still be written down.

**H3 — Can analytics live under the statistics exemption?** s.17(2)(b) takes processing for statistical purposes outside the Act if it follows the Second Schedule standards and is never used to take a decision specific to a person. Cookieless, aggregate-at-ingest page counting is a plausible fit. Per-user product analytics, funnels tied to IDs, or anything feeding retargeting or personalisation is not — the exemption evaporates the moment output touches an individual. Relying on it for mainstream analytics would be aggressive.

**H4 — Typed but never submitted.** Session replay and some pixels' automatic matching capture form input before the user presses submit. Under s.7(a) nothing is "voluntarily provided" until it's sent. Pre-submit capture therefore needs consent, and if it catches sensitive content without masking it's likely a breach as well.

**H5 — Children you can't see.** s.9(3) prohibits tracking, behavioural monitoring and targeted advertising of children, and consent can't lift it. For anonymous visitors you don't know age. For a site plausibly attractive to minors, loading C5/C6 tags on everyone before any age signal is the exposure; s.8(1) means a visitor's silence about her age doesn't discharge you.

**H6 — Withdrawal after the data has left.** s.6(6) obliges you to cause *processors* to stop. For independent Fiduciaries (ad platforms) there's no direct statutory lever beyond your contract and their deletion APIs, while s.8(1) keeps you answerable. Withdrawal isn't retroactive (s.6(5)), so earlier sharing remains lawful — but continued firing after withdrawal isn't.

**H7 — Withdrawal versus the one-year floor.** Rule 8(3) requires personal data and logs to be kept for a year "irrespective" of erasure triggers. A visitor who withdraws analytics consent can have tags stopped and vendor data deleted, but your access logs of her visits stay for the year. The guide flags this interaction as unresolved; the Rules appear to favour retention.

**H8 — Rights for unauthenticated data.** A cookie ID identifies a browser, not a verified person, and shared devices are common. Honouring an access or erasure request against a cookie ID risks disclosing someone else's browsing (itself a breach). A defensible posture is to honour rights fully for authenticated data and offer device-scoped deletion for anonymous data, with the reasoning documented.

**H9 — Global Privacy Control.** DPDP doesn't mention browser signals. But s.7(a) applies only where she "has not indicated to the Data Fiduciary that she does not consent". A `Sec-GPC: 1` header is arguably exactly such an indication. Honouring it costs little and strengthens every s.7(a) argument you make elsewhere.

---

## Part 6 — What this means for the scanner

A cookie-only scan is too narrow for DPDP. The page scanner has to observe everything in Parts 3 L1–L6 that a browser can see, and flag what it can't. Concretely: capture all storage types, including cookies; record every outbound request by destination domain and country; inspect request payloads for hashed identifiers, click IDs and form values; detect fingerprinting API calls; record what fires *before* any consent interaction (the PRE flag is the single most demonstrable finding for a free tool); and state plainly that server-side tagging, logs and backend relays are invisible to a crawler and need a questionnaire.

A classification record in the maintained dataset could look like this:

```yaml
id: meta-pixel-fbp
vendor: Meta Platforms
match:
  cookies: ["_fbp", "_fbc"]
  domains: ["connect.facebook.net", "facebook.com/tr"]
data_points: [persistent_browser_id, click_id, ip_address, user_agent, page_url, event_name, hashed_email_optional]
category: C6
flags: [3PF, XFER, KIDS, PRE, SENS]
role: independent_or_joint_fiduciary
lawful_basis: consent
provisions: ["s.6(1)", "s.9(3)", "s.11(1)(b)", "s.16", "Rule 3(b)"]
notice_itemisation: "Browser identifier, ad-click identifier, IP address, device and browser details, pages visited and actions taken, and optionally a hashed email address, shared with Meta Platforms for ad measurement and targeting."
destination_countries: [US]
fires_pre_consent_by_default: true
withdrawal_mechanism: "stop firing; clear _fbp/_fbc; request deletion via vendor tools"
```

The `notice_itemisation` field is the bridge: the scanner produces the inventory, and `dpdp notice lint` checks that the published notice itemises each detected item to the Rule 3(b) standard.
