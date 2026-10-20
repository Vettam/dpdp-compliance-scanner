import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMap, isNode, isSeq, parseDocument, stringify, type Document, type YAMLMap } from "yaml";
import type { DataMap, DataPoint, GeneratedBy, MapQuestion, RightsEndpoint, ScanRecord } from "./schema.js";
import { DataMapSchema } from "./schema.js";

export const DATA_MAP_FILENAME = join(".dpdp", "data-map.yaml");

const TOP_KEYS = [
  "schema_version",
  "repository",
  "generated_by",
  "scans",
  "data_points",
  "consent_gates",
  "rights_endpoints",
  "questions",
] as const;

const POINT_KEYS = [
  "id",
  "name",
  "category",
  "flags",
  "aliases",
  "observed",
  "recipients",
  "consent_gate",
  "purpose",
  "basis",
  "retention",
  "answers",
  "notes",
  "stale",
] as const;

const HUMAN_POINT_KEYS = new Set([
  "name",
  "category",
  "flags",
  "aliases",
  "consent_gate",
  "purpose",
  "basis",
  "answers",
  "notes",
]);

export function emptyDataMap(generated_by: GeneratedBy, repository = ""): DataMap {
  return DataMapSchema.parse({
    schema_version: "1.0.0",
    repository,
    generated_by,
    scans: [],
    data_points: [],
    consent_gates: [],
    questions: [],
  });
}

export function parseDataMap(text: string): DataMap {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((e) => e.message).join("; "));
  }
  return DataMapSchema.parse(doc.toJS());
}

export function loadDataMap(path: string): DataMap {
  return parseDataMap(readFileSync(path, "utf8"));
}

export function saveDataMap(path: string, map: DataMap): void {
  const previous = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeDataMap(map, previous));
}

/** Stable key order. When `previous` is set, comments on untouched keys are kept. */
export function serializeDataMap(map: DataMap, previous?: string): string {
  const canonical = DataMapSchema.parse(map);
  const plain = toPlain(canonical);
  if (previous?.trim()) {
    try {
      if (stable(parseDataMap(previous)) === stable(canonical)) {
        return previous.endsWith("\n") ? previous : previous + "\n";
      }
    } catch {
      // previous YAML is not a data map; rewrite it
    }
    const doc = parseDocument(previous);
    if (doc.errors.length === 0 && isMap(doc.contents)) {
      patchDocument(doc, plain);
      const out = doc.toString({ lineWidth: 0 });
      return out.endsWith("\n") ? out : out + "\n";
    }
  }
  return stringify(plain, { lineWidth: 0 });
}

function patchDocument(doc: Document, map: Record<string, unknown>): void {
  const root = doc.contents;
  if (!isMap(root)) return;
  setIfChanged(root, "schema_version", map.schema_version);
  const repo = root.get("repository");
  if (repo === undefined || repo === null || repo === "") setIfChanged(root, "repository", map.repository);
  setIfChanged(root, "generated_by", map.generated_by);
  setIfChanged(root, "scans", map.scans);
  setIfChanged(root, "questions", map.questions);
  patchDataPoints(doc, root, map.data_points as DataPoint[]);
  setIfChanged(root, "consent_gates", map.consent_gates);
  setIfChanged(root, "rights_endpoints", map.rights_endpoints);
  for (const key of TOP_KEYS) {
    if (!root.has(key)) root.set(key, map[key]);
  }
}

function patchDataPoints(doc: Document, root: YAMLMap, points: DataPoint[]): void {
  const seq = root.get("data_points", true);
  if (!isSeq(seq)) {
    root.set("data_points", points.map((p) => orderPoint(p)));
    return;
  }
  const seen = new Set<string>();
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    const point = matchYamlPoint(item, points);
    if (!point) continue;
    seen.add(point.id);
    patchPoint(doc, item, point);
  }
  for (const point of points) {
    if (seen.has(point.id)) continue;
    seq.add(doc.createNode(orderPoint(point)));
  }
}

function matchYamlPoint(item: YAMLMap, points: DataPoint[]): DataPoint | undefined {
  const id = item.get("id");
  const aliases = jsonValue(item.get("aliases", true));
  const aliasList = Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : [];
  return points.find((p) => {
    if (typeof id === "string" && (p.id === id || p.aliases.includes(id))) return true;
    return aliasList.includes(p.id);
  });
}

function patchPoint(doc: Document, node: YAMLMap, point: DataPoint): void {
  const plain = orderPoint(point);
  for (const key of HUMAN_POINT_KEYS) {
    if (!node.has(key)) node.set(key, plain[key]);
  }
  setIfChanged(node, "observed", plain.observed);
  setIfChanged(node, "stale", plain.stale);
  patchRecipients(doc, node, point);
  patchRetention(node, point);
}

function patchRecipients(doc: Document, node: YAMLMap, point: DataPoint): void {
  const plain = orderPoint(point).recipients as unknown[];
  const seq = node.get("recipients", true);
  if (!isSeq(seq)) {
    node.set("recipients", plain);
    return;
  }
  const seen = new Set<string>();
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    const vendor = item.get("vendor");
    if (typeof vendor !== "string") continue;
    const next = point.recipients.find((r) => r.vendor === vendor);
    if (!next) continue;
    seen.add(vendor);
    if (!item.has("role")) item.set("role", next.role);
    setIfChanged(item, "country", next.country);
    setIfChanged(item, "observed", next.observed.map(orderObs));
  }
  point.recipients.forEach((r, i) => {
    if (!seen.has(r.vendor)) seq.add(doc.createNode(plain[i]));
  });
}

function patchRetention(node: YAMLMap, point: DataPoint): void {
  const retention = node.get("retention", true);
  if (!isMap(retention)) {
    node.set("retention", { stated: point.retention.stated, signals: point.retention.signals });
    return;
  }
  if (!retention.has("stated")) retention.set("stated", point.retention.stated);
  setIfChanged(retention, "signals", point.retention.signals);
}

function setIfChanged(node: YAMLMap, key: string, value: unknown): void {
  if (!node.has(key)) {
    node.set(key, value);
    return;
  }
  if (stable(jsonValue(node.get(key, true))) === stable(value)) return;
  node.set(key, value);
}

function jsonValue(value: unknown): unknown {
  if (isNode(value)) return value.toJSON();
  return value;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function toPlain(map: DataMap): Record<string, unknown> {
  return orderKeys(
    {
      schema_version: map.schema_version,
      repository: map.repository,
      generated_by: orderKeys(map.generated_by, ["package", "version", "rules_version", "vendors_version"]),
      scans: map.scans.map(orderScan),
      data_points: map.data_points.map(orderPoint),
      consent_gates: map.consent_gates.map((g) =>
        orderKeys(
          { id: g.id, kind: g.kind, observed: g.observed.map(orderObs), text_excerpt: g.text_excerpt },
          ["id", "kind", "observed", "text_excerpt"],
        ),
      ),
      rights_endpoints: map.rights_endpoints.map(orderRights),
      questions: map.questions.map(orderQuestion),
    },
    TOP_KEYS,
  );
}

function orderScan(scan: ScanRecord): Record<string, unknown> {
  const source =
    scan.source.kind === "page"
      ? orderKeys(
          { kind: scan.source.kind, url: scan.source.url, detail: orderUnknown(scan.source.detail) },
          ["kind", "url", "detail"],
        )
      : orderKeys(
          { kind: scan.source.kind, path: scan.source.path, commit: scan.source.commit },
          ["kind", "path", "commit"],
        );
  return orderKeys({ id: scan.id, source, scanned_at: scan.scanned_at }, ["id", "source", "scanned_at"]);
}

function orderPoint(point: DataPoint): Record<string, unknown> {
  return orderKeys(
    {
      ...point,
      observed: point.observed.map(orderObs),
      recipients: point.recipients.map((r) =>
        orderKeys(
          { vendor: r.vendor, role: r.role, country: r.country, observed: r.observed.map(orderObs) },
          ["vendor", "role", "country", "observed"],
        ),
      ),
      retention: orderKeys(
        { stated: point.retention.stated, signals: point.retention.signals },
        ["stated", "signals"],
      ),
    },
    POINT_KEYS,
  );
}

function orderObs(obs: DataPoint["observed"][number]): Record<string, unknown> {
  return orderKeys(
    { ...obs, detail: orderUnknown(obs.detail) },
    ["scan", "kind", "location", "confidence", "seq", "detail"],
  );
}

function orderRights(endpoint: RightsEndpoint): Record<string, unknown> {
  return orderKeys(
    { right: endpoint.right, observed: endpoint.observed.map(orderObs) },
    ["right", "observed"],
  );
}

function orderQuestion(q: MapQuestion): Record<string, unknown> {
  return orderKeys({ ...q }, ["id", "data_point", "rule_id", "ask", "scan"]);
}

function orderUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderUnknown);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = orderUnknown((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function orderKeys(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  for (const key of Object.keys(value)) {
    if (out[key] === undefined && value[key] !== undefined) out[key] = value[key];
  }
  return out;
}
