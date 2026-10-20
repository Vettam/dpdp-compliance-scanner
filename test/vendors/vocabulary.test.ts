import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPersonalDataVocabulary } from "../../src/vendors/vocabulary.js";

describe("personal-data vocabulary", () => {
  it("seeds the names the code scanner will match", () => {
    const vocab = loadPersonalDataVocabulary(join(process.cwd(), "vendors", "vocabulary", "personal-data.yaml"));
    const names = new Set(vocab.entries.map((e) => e.name));
    for (const name of [
      "name",
      "phone",
      "email",
      "address",
      "dob",
      "gender",
      "pan",
      "aadhaar",
      "passport",
      "ip",
      "device_id",
      "geolocation",
      "health",
      "income",
      "caste",
      "religion",
      "biometric",
    ]) {
      expect(names.has(name), name).toBe(true);
    }
    for (const id of ["pan", "aadhaar", "passport", "health", "income", "caste", "religion", "biometric"]) {
      expect(vocab.entries.find((e) => e.name === id)?.flags).toContain("SENS");
    }
  });
});
