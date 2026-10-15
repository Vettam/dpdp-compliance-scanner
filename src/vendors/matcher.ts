import type { Tracker } from "./schema.js";

/**
 * Indexes the tracker dataset for fast lookup by the fields a scan observation
 * exposes: request host/path, cookie name, storage key, embed host.
 *
 * Host matching is exact or subdomain: a declared host `example.com` matches
 * `example.com` and `sub.example.com`. Cookie/storage matching supports glob
 * patterns with `*` (e.g. `_ga_*`, `_hjSessionUser_*`).
 */
export class TrackerIndex {
  private trackers: Tracker[];
  private packages = new Map<string, Tracker>();

  constructor(trackers: Tracker[]) {
    this.trackers = trackers;
    for (const t of trackers) {
      if (!t.packages) continue;
      for (const [ecosystem, names] of Object.entries(t.packages)) {
        for (const name of names ?? []) {
          const key = packageKey(ecosystem, name);
          if (!this.packages.has(key)) this.packages.set(key, t);
        }
      }
    }
  }

  /** Match a manifest dependency. PyPI treats `-`, `_`, and case as the same name. */
  byPackage(ecosystem: string, name: string): Tracker | undefined {
    return this.packages.get(packageKey(ecosystem, name));
  }

  all(): Tracker[] {
    return this.trackers;
  }

  byRequest(host: string, path: string): Tracker | undefined {
    for (const t of this.trackers) {
      const hosts = t.match.hosts ?? t.match.domains ?? [];
      for (const entry of hosts) {
        const [h, p] = splitHostPath(entry);
        if (hostMatches(host, h) && pathAllowed(path, p, t.match.paths)) {
          return t;
        }
      }
    }
    return undefined;
  }

  byEmbed(host: string): Tracker | undefined {
    for (const t of this.trackers) {
      const hosts = t.match.hosts ?? t.match.domains ?? [];
      for (const entry of hosts) {
        const [h] = splitHostPath(entry);
        if (hostMatches(host, h)) return t;
      }
    }
    return undefined;
  }

  byCookie(name: string): Tracker | undefined {
    return this.findByPatterns(name, (t) => t.match.cookies);
  }

  byStorageKey(key: string): Tracker | undefined {
    return this.findByPatterns(key, (t) => t.match.storage_keys);
  }

  private findByPatterns(
    value: string,
    select: (t: Tracker) => string[] | undefined,
  ): Tracker | undefined {
    for (const t of this.trackers) {
      const patterns = select(t);
      if (!patterns) continue;
      for (const p of patterns) {
        if (globMatch(p, value)) return t;
      }
    }
    return undefined;
  }
}

function splitHostPath(entry: string): [string, string | undefined] {
  const i = entry.indexOf("/");
  if (i === -1) return [entry, undefined];
  return [entry.slice(0, i), entry.slice(i)];
}

function hostMatches(host: string, declared: string): boolean {
  return host === declared || host.endsWith("." + declared);
}

function pathAllowed(
  path: string,
  hostEntryPath: string | undefined,
  declaredPaths: string[] | undefined,
): boolean {
  if (hostEntryPath && !path.startsWith(hostEntryPath)) return false;
  if (declaredPaths && declaredPaths.length > 0) {
    return declaredPaths.some((p) => path.startsWith(p));
  }
  return true;
}

/** Registry identity for a package name. PyPI normalises case and `[-_.]` (PEP 503). */
export function packageKey(ecosystem: string, name: string): string {
  const eco = ecosystem.toLowerCase();
  const raw = name.trim();
  const normalised = eco === "pypi" ? raw.toLowerCase().replace(/[-_.]+/g, "-") : raw.toLowerCase();
  return `${eco}\0${normalised}`;
}

/** Minimal glob: `*` matches any run of characters. */
export function globMatch(pattern: string, value: string): boolean {
  if (!pattern.includes("*")) return pattern === value;
  const regex = "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
  return new RegExp(regex).test(value);
}
