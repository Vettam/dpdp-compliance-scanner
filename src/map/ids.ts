import { createHash } from "node:crypto";

/** Keep underscores so `_ga` and `ga` do not collapse into one id. */
export function idPart(value: string): string {
  const s = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_");
  return s || "unnamed";
}

export type IdShape =
  | { kind: "column"; table: string; column: string }
  | { kind: "cookie"; name: string }
  | { kind: "input"; form: string; field: string }
  | { kind: "vendor"; id: string }
  | { kind: "storage"; storageKind: string; key: string }
  | { kind: "api"; family: string }
  | { kind: "host"; host: string };

/** Stable ids (spec §4.5). A human renames by editing `id` and listing the old one in `aliases`. */
export function deriveId(shape: IdShape): string {
  switch (shape.kind) {
    case "column":
      return `dp_${idPart(shape.table)}_${idPart(shape.column)}`;
    case "cookie":
      return `dp_cookie_${idPart(shape.name)}`;
    case "input":
      return `dp_input_${idPart(shape.form)}_${idPart(shape.field)}`;
    case "vendor":
      return `dp_vendor_${idPart(shape.id)}`;
    case "storage":
      return `dp_storage_${idPart(shape.storageKind)}_${idPart(shape.key)}`;
    case "api":
      return `dp_api_${idPart(shape.family)}`;
    case "host":
      return `dp_host_${idPart(shape.host)}`;
  }
}

export function deriveScanId(source: { kind: "page"; url: string } | { kind: "code"; path: string }): string {
  const key = source.kind === "page" ? source.url : source.path;
  const hash = createHash("sha256").update(`${source.kind}\0${key}`).digest("hex").slice(0, 12);
  return `scan_${source.kind}_${hash}`;
}

export function deriveBannerGateId(url: string): string {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // not a URL; slug the raw string
  }
  return `cg_banner_${idPart(host)}`;
}

/** canvas.toDataURL and canvas.getContext are one family; the rule lists the families. */
export function apiFamily(api: string): string {
  const a = api.toLowerCase();
  if (a.startsWith("canvas")) return "canvas";
  if (a.startsWith("audiocontext") || a.startsWith("offlineaudiocontext")) return "audio";
  if (a.startsWith("webgl")) return "webgl";
  if (a.startsWith("rtcpeerconnection")) return "webrtc";
  if (a.startsWith("navigator.")) return "navigator";
  if (a.startsWith("window.screen.")) return "screen";
  if (a.startsWith("document.fonts")) return "fonts";
  return api;
}
