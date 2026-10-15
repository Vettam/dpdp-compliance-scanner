import { parseDataMap } from "../map/io.js";
import { mapDataMap } from "../mapper/data-map.js";
import { noticeChanges, noticeInputs } from "../notice/index.js";
import { loadRules } from "../rules/loader.js";
import { loadTrackers } from "../trackers/loader.js";
import { readMap, readMapSource, type MapCommandDeps } from "./map.js";

export async function executeNoticeInputs(
  args: { json: boolean; map?: string },
  deps: MapCommandDeps,
): Promise<number> {
  const map = readMap(args.map ? { ...deps, mapPath: args.map } : deps);
  if (!map) return 2;
  const rules = await loadRules(deps.rulesDir);
  const vendors = await loadTrackers(deps.trackersDir);
  const reading = mapDataMap(map, rules, vendors);
  const inputs = noticeInputs(map, vendors, { rules, findings: reading.findings, questions: reading.questions });
  if (args.json) {
    deps.stdout.write(JSON.stringify(inputs, null, 2) + "\n");
    return 0;
  }
  const lines = inputs.lines.map((line) => `${line.id}  ${line.name}`);
  deps.stdout.write((lines.join("\n") || "no data points") + "\n");
  return 0;
}

export async function executeNoticeChanges(
  args: { from: string; to: string; json: boolean },
  deps: MapCommandDeps,
): Promise<number> {
  if (!args.from || !args.to) {
    deps.stderr.write("usage: dpdp notice changes --from <ref|file> --to <ref|file>\n");
    deps.exit(2);
    return 2;
  }
  let fromText: string;
  let toText: string;
  try {
    fromText = readMapSource(args.from, deps);
    toText = readMapSource(args.to, deps);
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(2);
    return 2;
  }
  try {
    const changes = noticeChanges(parseDataMap(fromText), parseDataMap(toText));
    if (args.json) deps.stdout.write(JSON.stringify(changes, null, 2) + "\n");
    else deps.stdout.write(`fresh consent: ${changes.fresh_consent ? "yes" : "no"}\n`);
    return 0;
  } catch (e) {
    deps.stderr.write(`error: ${(e as Error).message}\n`);
    deps.exit(2);
    return 2;
  }
}
