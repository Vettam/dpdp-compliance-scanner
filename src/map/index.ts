export { deriveId, deriveScanId, deriveBannerGateId, apiFamily, idPart } from "./ids.js";
export type { IdShape } from "./ids.js";
export {
  DataMapSchema,
  DataMapDiffSchema,
  dataMapJsonSchema,
  dataMapDiffJsonSchema,
  DATA_MAP_SCHEMA_VERSION,
} from "./schema.js";
export type {
  DataMap,
  DataMapDiff,
  DataPoint,
  ConsentGate,
  MapQuestion,
  RightsEndpoint,
  GeneratedBy,
  ScanRecord,
} from "./schema.js";
export { emptyDataMap, loadDataMap, saveDataMap, parseDataMap, serializeDataMap, DATA_MAP_FILENAME } from "./io.js";
export { mergeScan } from "./merge.js";
export { emitPageScan } from "./page.js";
export type { EmittedScan } from "./page.js";
export { diffDataMaps, renderDataMapDiff, renderDataMapDiffMarkdown } from "./diff.js";
export { openQuestions, renderMapShow, renderMapShowJson } from "./show.js";
