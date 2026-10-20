import type { Tracker } from "../../../vendors/schema.js";
import type { PersonalDataEntry } from "../../../vendors/vocabulary.js";
import { TrackerIndex } from "../../../vendors/matcher.js";
import { assemble, type JsContribution } from "../js/scan.js";
import { consentHits } from "./consent.js";
import { httpHits } from "./http.js";
import { inputHits } from "./inputs.js";
import { pythonSignals } from "./retention.js";
import { rightsHits } from "./rights.js";
import { columnsFromPython } from "./schema.js";
import { listPythonFiles } from "./walk.js";

export function scanPython(input: {
  root: string;
  scanId: string;
  vendors: Tracker[];
  vocabulary: { entries: PersonalDataEntry[] };
}): JsContribution {
  const index = new TrackerIndex(input.vendors);
  const files = listPythonFiles(input.root);
  const columns = files.flatMap((file) => columnsFromPython(file));
  const calls = files.flatMap((file) => httpHits(file, index));
  const inputs = files.flatMap((file) => inputHits(file));
  const gateHits: ReturnType<typeof consentHits>["gates"] = [];
  const spans: ReturnType<typeof consentHits>["spans"] = [];
  const rights = files.flatMap((file) => rightsHits(file));
  for (const file of files) {
    const consent = consentHits(file, index);
    gateHits.push(...consent.gates);
    spans.push(...consent.spans);
  }
  for (const call of calls) {
    const span = spans.find((item) => item.file === call.file && call.start >= item.start && call.start < item.end);
    if (span) call.gatedBy = span.gateId;
  }
  return assemble({
    scanId: input.scanId,
    vocabulary: input.vocabulary.entries,
    columns,
    calls,
    inputs,
    gateHits,
    rights,
    signals: pythonSignals(files, columns),
  });
}
