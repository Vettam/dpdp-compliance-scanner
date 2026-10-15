# Vendor dataset — provenance

The directory was `trackers/` through 0.3.0. `trackers/` remains a symlink for one release.

Every record in this directory cites where its classification came from in its
`provenance` field. Acceptable sources are: vendor documentation, direct
observation by the maintainers, or a named third-party list whose licence terms
have been checked and recorded below.

## Sources used for the v0.1 seed

| Source | Use | Licence | Date first used |
|---|---|---|---|
| Direct observation / vendor documentation | Primary classification for all seed records | n/a (vendor-published facts) | 2026-09-15 |

We deliberately do **not** seed from EasyPrivacy, the Open Cookie Database,
DuckDuckGo Tracker Radar, or similar public lists until their licence terms have
been checked and recorded here. Each such list, if adopted, gets a row above
with its licence and the date of adoption.

## Package names (1.0.0)

`packages` lists SDKs the vendor publishes. On 2026-10-14 each name was checked against the public registry it belongs to (npm, PyPI, Maven Central, the Go module proxy, RubyGems, CocoaPods trunk, or Packagist). A name was kept only when the registry listing showed the vendor as publisher or the source repository under the vendor's organisation. Community wrappers that merely exist on a registry were left out. Segment's set includes the names in spec v2 §7; each of those resolved on that date.

Embeds and CDNs with no vendor-published SDK (CookieYes, OneTrust, Google Tag Manager, font and video embeds, and similar) have no `packages` block.

## IP-to-country dataset

| Source | Use | Licence | Date bundled |
|---|---|---|---|
| DB-IP Lite (`dbip-country-lite-2026-09.csv.gz`) | Offline IP-to-country lookup for request `destination_country`. Packed into `data/geo/dbip-country.bin.gz`; no network call at runtime. | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) — attribution required | 2026-09-01 |

Attribution for DB-IP Lite: "This product includes DB-IP Lite data created by
DB-IP (https://db-ip.com/), licensed under CC BY 4.0. The dataset is bundled
as a compact binary; see `data/geo/` for the bundled copy and its version."

The bundled copy records its source date (the DB-IP Lite release month) in
`data/geo/VERSION`. Rebuild with `npx tsx scripts/build-geo.ts <csv.gz>`.
