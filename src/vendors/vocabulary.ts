import { readFileSync } from "node:fs";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { OVERLAY_FLAGS, TRACKER_CATEGORIES } from "../taxonomy.js";

/** Column and field names the code scanner treats as personal data (spec v2 §7). */
export const PersonalDataEntry = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  category: z.enum(TRACKER_CATEGORIES),
  flags: z.array(z.enum(OVERLAY_FLAGS)).default([]),
  variants: z.array(z.string().min(1)).default([]),
});
export type PersonalDataEntry = z.infer<typeof PersonalDataEntry>;

export const PersonalDataVocabulary = z.object({
  entries: z.array(PersonalDataEntry).min(1),
});

export type PersonalDataVocabulary = z.infer<typeof PersonalDataVocabulary>;

export function loadPersonalDataVocabulary(path: string): PersonalDataVocabulary {
  const parsed = PersonalDataVocabulary.safeParse(parseYaml(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(parsed.error.message);
  return parsed.data;
}
