import type { PersonalDataEntry } from "../../../vendors/vocabulary.js";

export function normColumn(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Longest vocabulary name or variant that the column spells: exact, prefix, or token. */
export function matchColumn(entries: PersonalDataEntry[], column: string): PersonalDataEntry | undefined {
  const norm = normColumn(column);
  if (!norm) return undefined;
  const tokens = norm.split("_").filter((t) => t.length >= 2);
  let best: { entry: PersonalDataEntry; score: number } | undefined;
  for (const entry of entries) {
    for (const raw of [entry.name, ...entry.variants]) {
      const key = normColumn(raw);
      if (!key) continue;
      let score = 0;
      if (norm === key) score = 1000 + key.length;
      else if (norm.startsWith(`${key}_`)) score = 500 + key.length;
      else if (tokens.includes(key)) score = 100 + key.length;
      if (score > 0 && (!best || score > best.score)) best = { entry, score };
    }
  }
  return best?.entry;
}
