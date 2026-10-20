import { readRulesVersion } from "../rules/loader.js";
import { readTrackersVersion } from "../trackers/loader.js";

export interface VersionDeps {
  stdout: { write: (s: string) => void };
  name: string;
  version: string;
  rulesDir: string;
  trackersDir: string;
}

export function executeVersion(deps: VersionDeps): number {
  const rules = readRulesVersion(deps.rulesDir);
  const vendors = readTrackersVersion(deps.trackersDir);
  deps.stdout.write(`${deps.name} ${deps.version}\nrules ${rules}\nvendors ${vendors}\n`);
  return 0;
}
