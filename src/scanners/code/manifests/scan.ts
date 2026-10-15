import { execFileSync } from "node:child_process";
import type { Tracker } from "../../../vendors/schema.js";
import { TrackerIndex } from "../../../vendors/matcher.js";
import { deriveId, deriveScanId, idPart } from "../../../map/ids.js";
import type { DataPoint, GeneratedBy, MapObservation, MapQuestion, ScanRecord } from "../../../map/schema.js";
import type { EmittedScan } from "../../../map/page.js";
import { readManifestDependencies, type ManifestDependency } from "./parse.js";

/** Spec v2 §5.2: an unmatched dependency whose name suggests data leaving the repo. */
const OUTBOUND_TOKENS = new Set([
  "analytics",
  "tracking",
  "pixel",
  "telemetry",
  "crm",
  "email",
  "sms",
  "push",
  "payment",
  "auth",
  "ads",
  "logging",
]);

export function emitManifestScan(input: {
  root: string;
  sourcePath: string;
  vendors: Tracker[];
  packageName: string;
  packageVersion: string;
  rulesVersion: string;
  vendorsVersion: string;
  commit?: string;
  scannedAt?: string;
}): EmittedScan {
  const scanId = deriveScanId({ kind: "code", path: input.sourcePath });
  const index = new TrackerIndex(input.vendors);
  const buckets = new Map<string, { vendor: Tracker; observed: MapObservation[] }>();
  const questions: MapQuestion[] = [];
  const seenQuestions = new Set<string>();
  let seq = 0;

  for (const dep of readManifestDependencies(input.root)) {
    const vendor = index.byPackage(dep.ecosystem, dep.name);
    if (vendor) {
      const bucket = buckets.get(vendor.id) ?? { vendor, observed: [] };
      bucket.observed.push(packageObservation(scanId, dep, seq));
      seq += 1;
      buckets.set(vendor.id, bucket);
      continue;
    }
    if (!suggestsOutbound(dep.name, dep.description)) continue;
    const id = `q_pkg_${idPart(dep.ecosystem)}_${idPart(dep.name)}`;
    if (seenQuestions.has(id)) continue;
    seenQuestions.add(id);
    questions.push({
      id,
      rule_id: null,
      ask: `The dependency \`${dep.name}\` is not in the vendor dataset. Does it send data outside this repository? To whom?`,
      scan: scanId,
    });
  }

  const generated_by: GeneratedBy = {
    package: input.packageName,
    version: input.packageVersion,
    rules_version: input.rulesVersion,
    vendors_version: input.vendorsVersion,
  };
  const scan: ScanRecord = {
    id: scanId,
    source: {
      kind: "code",
      path: input.sourcePath,
      commit: input.commit ?? readCommit(input.root),
    },
    scanned_at: input.scannedAt ?? new Date().toISOString(),
  };

  return {
    generated_by,
    scan,
    data_points: [...buckets.values()].map((b) => dataPoint(b.vendor, b.observed)),
    consent_gates: [],
    rights_endpoints: [],
    questions,
  };
}

export function suggestsOutbound(name: string, description: string): boolean {
  const tokens = `${name} ${description}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((t) => OUTBOUND_TOKENS.has(t));
}

function packageObservation(scan: string, dep: ManifestDependency, seq: number): MapObservation {
  return {
    scan,
    kind: "package",
    location: dep.location,
    confidence: "medium",
    seq,
    detail: { ecosystem: dep.ecosystem, name: dep.name },
  };
}

function dataPoint(vendor: Tracker, observed: MapObservation[]): DataPoint {
  return {
    id: deriveId({ kind: "vendor", id: vendor.id }),
    name: vendor.vendor,
    category: vendor.category,
    flags: [...vendor.flags],
    aliases: [],
    observed: [],
    recipients: [
      {
        vendor: vendor.id,
        role: vendor.role,
        country: vendor.destination_countries[0] ?? "",
        observed,
      },
    ],
    consent_gate: null,
    purpose: "",
    basis: "unstated",
    retention: { stated: "", signals: [] },
    answers: {},
    notes: "",
    stale: false,
  };
}

function readCommit(root: string): string {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
