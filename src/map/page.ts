import type { Observation, ScanResult } from "../types.js";
import type { Tracker } from "../trackers/schema.js";
import { TrackerIndex } from "../trackers/matcher.js";
import type { ConsentGate, DataPoint, GeneratedBy, MapObservation, MapQuestion, RightsEndpoint, ScanRecord } from "./schema.js";
import { apiFamily, deriveBannerGateId, deriveId, deriveScanId } from "./ids.js";

export interface EmittedScan {
  generated_by: GeneratedBy;
  scan: ScanRecord;
  data_points: DataPoint[];
  consent_gates: ConsentGate[];
  rights_endpoints: RightsEndpoint[];
  questions: MapQuestion[];
}

/**
 * Project a page ScanResult's observations into data-map records (spec §5.1).
 * Each observation is stored once: meta on the scan, a detected banner on a
 * consent gate, everything else on one data point.
 */
export function emitPageScan(input: {
  result: ScanResult;
  observations: Observation[];
  vendors: Tracker[];
  packageName: string;
  packageVersion: string;
}): EmittedScan {
  const { result, observations, vendors } = input;
  const index = new TrackerIndex(vendors);
  const scanId = deriveScanId({ kind: "page", url: result.target.url });
  const meta = observations.find((o): o is Extract<Observation, { type: "meta" }> => o.type === "meta");
  const location = meta?.final_url || result.target.final_url || result.target.url;

  const drafts = new Map<string, Draft>();
  const gates: ConsentGate[] = [];
  const rest: Held[] = [];
  let metaHeld: Held | undefined;
  let bannerHeld: Held | undefined;

  observations.forEach((obs, seq) => {
    if (obs.type === "meta") {
      metaHeld = { seq, observation: obs };
      return;
    }
    if (obs.type === "banner") {
      if (!obs.detected) {
        bannerHeld = { seq, observation: obs };
        return;
      }
      const gateId = deriveBannerGateId(result.target.url);
      let gate = gates.find((g) => g.id === gateId);
      if (!gate) {
        gate = { id: gateId, kind: "banner", observed: [], text_excerpt: obs.text_excerpt };
        gates.push(gate);
      }
      if (!gate.text_excerpt) gate.text_excerpt = obs.text_excerpt;
      gate.observed.push(toObs(scanId, "banner", location, obs.detection_confidence, seq, obs));
      return;
    }
    if (obs.type === "cookie") {
      const tracker = index.byCookie(obs.name);
      const id = deriveId({ kind: "cookie", name: obs.name });
      const draft = ensure(drafts, id, obs.name, tracker?.category ?? "UNCLASSIFIED", tracker?.flags ?? []);
      const mapped = toObs(scanId, "cookie", location, "high", seq, obs);
      if (tracker) pushRecipient(draft, tracker, mapped, tracker.destination_countries[0] ?? "");
      else draft.observed.push(mapped);
      return;
    }
    if (obs.type === "storage") {
      const tracker = index.byStorageKey(obs.key);
      const id = deriveId({ kind: "storage", storageKind: obs.kind, key: obs.key });
      const draft = ensure(drafts, id, obs.key, tracker?.category ?? "UNCLASSIFIED", tracker?.flags ?? []);
      const mapped = toObs(scanId, "storage_key", location, "high", seq, obs);
      if (tracker) pushRecipient(draft, tracker, mapped, tracker.destination_countries[0] ?? "");
      else draft.observed.push(mapped);
      return;
    }
    if (obs.type === "api_call") {
      const family = apiFamily(obs.api);
      const id = deriveId({ kind: "api", family });
      const draft = ensure(drafts, id, family, "UNCLASSIFIED", []);
      draft.observed.push(toObs(scanId, "api_call", location, "high", seq, obs));
      return;
    }
    if (obs.type === "request" || obs.type === "embed") {
      const tracker = obs.type === "request" ? index.byRequest(obs.host, obs.path) : index.byEmbed(obs.host);
      // A first-party host with no vendor match is not a data point (spec §5.1).
      // Keep the observation so page findings can still be re-derived.
      if (!tracker && !obs.is_third_party) {
        rest.push({ seq, observation: obs });
        return;
      }
      const kind = obs.type === "request" ? "request" : "embed";
      const mapped = toObs(scanId, kind, location, "high", seq, obs);
      if (tracker) {
        const id = deriveId({ kind: "vendor", id: tracker.id });
        const draft = ensure(drafts, id, tracker.vendor, tracker.category, tracker.flags);
        const country = (obs.type === "request" ? obs.destination_country : "") || tracker.destination_countries[0] || "";
        pushRecipient(draft, tracker, mapped, country);
      } else {
        const id = deriveId({ kind: "host", host: obs.host });
        const draft = ensure(drafts, id, obs.host, "UNCLASSIFIED", []);
        draft.observed.push(mapped);
      }
    }
  });

  const detail: Record<string, unknown> = {};
  if (metaHeld) detail.meta = metaHeld;
  if (bannerHeld) detail.banner = bannerHeld;
  if (rest.length > 0) detail.rest = rest;

  const data_points: DataPoint[] = [...drafts.values()].map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    flags: d.flags,
    aliases: [],
    observed: d.observed,
    recipients: [...d.recipients.values()],
    consent_gate: null,
    purpose: "",
    basis: "unstated",
    retention: { stated: "", signals: [] },
    answers: {},
    notes: "",
    stale: false,
  }));

  return {
    generated_by: {
      package: input.packageName,
      version: input.packageVersion,
      rules_version: result.rules_version,
      vendors_version: result.trackers_version,
    },
    scan: {
      id: scanId,
      source: { kind: "page", url: result.target.url, detail },
      scanned_at: result.scanned_at,
    },
    data_points,
    consent_gates: gates,
    rights_endpoints: [],
    questions: [],
  };
}

interface Held {
  seq: number;
  observation: Observation;
}

interface Draft {
  id: string;
  name: string;
  category: DataPoint["category"];
  flags: DataPoint["flags"];
  observed: MapObservation[];
  recipients: Map<string, DataPoint["recipients"][number]>;
}

function ensure(
  drafts: Map<string, Draft>,
  id: string,
  name: string,
  category: DataPoint["category"],
  flags: DataPoint["flags"],
): Draft {
  const existing = drafts.get(id);
  if (existing) return existing;
  const draft: Draft = { id, name, category, flags: [...flags], observed: [], recipients: new Map() };
  drafts.set(id, draft);
  return draft;
}

function pushRecipient(
  draft: Draft,
  tracker: Tracker,
  obs: MapObservation,
  country: string,
): void {
  const rec = draft.recipients.get(tracker.id) ?? {
    vendor: tracker.id,
    role: tracker.role,
    country,
    observed: [],
  };
  if (!rec.country && country) rec.country = country;
  rec.observed.push(obs);
  draft.recipients.set(tracker.id, rec);
}

function toObs(
  scan: string,
  kind: MapObservation["kind"],
  location: string,
  confidence: MapObservation["confidence"],
  seq: number,
  observation: Observation,
): MapObservation {
  return { scan, kind, location, confidence, seq, detail: { ...observation } };
}
