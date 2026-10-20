import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OVERLAY_FLAGS, TRACKER_CATEGORIES } from "../taxonomy.js";

/**
 * Vendor classification dataset schema (spec v2 §7; web data map Part 6).
 * One YAML file per vendor in vendors/. Categories C0–C10 and overlay flags
 * are defined in the web data map Part 2 and used exactly as defined there.
 */

export const TrackerRole = z.enum([
  "processor",
  "fiduciary",
  "depends_on_configuration",
  // Records written before vendors/ 1.0.0. New records use the three values above.
  "independent_or_joint_fiduciary",
  "processor_or_3pf",
]);

export const PACKAGE_ECOSYSTEMS = [
  "npm",
  "pypi",
  "maven",
  "go",
  "rubygems",
  "cocoapods",
  "cargo",
  "composer",
  "pub",
  "swift",
] as const;

export type PackageEcosystem = (typeof PACKAGE_ECOSYSTEMS)[number];

const packageNames = z.array(z.string().min(1));

export const VendorPackages = z.object({
  npm: packageNames.optional(),
  pypi: packageNames.optional(),
  maven: packageNames.optional(),
  go: packageNames.optional(),
  rubygems: packageNames.optional(),
  cocoapods: packageNames.optional(),
  cargo: packageNames.optional(),
  composer: packageNames.optional(),
  pub: packageNames.optional(),
  swift: packageNames.optional(),
});

export const LawfulBasis = z.enum(["consent", "s7a", "none", "mixed"]);

export const TrackerMatch = z
  .object({
    cookies: z.array(z.string().min(1)).optional(),
    hosts: z.array(z.string().min(1)).optional(),
    domains: z.array(z.string().min(1)).optional(),
    paths: z.array(z.string().min(1)).optional(),
    storage_keys: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (m) => Boolean(m.cookies || m.hosts || m.domains || m.paths || m.storage_keys),
    { message: "a tracker match must specify at least one of cookies, hosts, domains, paths, storage_keys" },
  );

export const TrackerSchema = z.object({
  id: z.string().min(1),
  vendor: z.string().min(1),
  match: TrackerMatch,
  /** SDKs the vendor publishes, keyed by ecosystem (spec v2 §7). */
  packages: VendorPackages.optional(),
  data_points: z.array(z.string().min(1)).default([]),
  category: z.enum(TRACKER_CATEGORIES),
  flags: z.array(z.enum(OVERLAY_FLAGS)).default([]),
  role: TrackerRole,
  lawful_basis: LawfulBasis,
  provisions: z.array(z.string().min(1)).min(1),
  notice_itemisation: z.string(),
  destination_countries: z.array(z.string()).default([]),
  fires_pre_consent_by_default: z.boolean().default(false),
  withdrawal_mechanism: z.string().default(""),
  last_verified: z.string(),
  provenance: z.string().default("direct observation"),
  /** Banner CSS selectors for C10 CMPs (spec §4.3). */
  cmp: z
    .object({
      selectors: z.array(z.string().min(1)).min(1),
      accept_selectors: z.array(z.string().min(1)).default([]),
      reject_selectors: z.array(z.string().min(1)).default([]),
    })
    .optional(),
});

export type Tracker = z.infer<typeof TrackerSchema>;

export type TrackerValidateOk = { ok: true; value: Tracker };
export type TrackerValidateErr = { ok: false; error: z.ZodError };
export type TrackerValidateResult = TrackerValidateOk | TrackerValidateErr;

export function validateTracker(input: unknown): TrackerValidateResult {
  const parsed = TrackerSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error };
}

/** JSON Schema (draft-07) generated from the Zod schema. Published at vendors/schema.json. */
export function trackerJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(TrackerSchema) as Record<string, unknown>;
}
