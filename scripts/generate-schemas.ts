/**
 * Build-time generator: emits JSON Schemas from the Zod schemas so they can be
 * published in the repo (spec §3.2). Run via `npm run gen:schemas`.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { explainerJsonSchema } from "../src/explainers/schema.js";
import { dataMapDiffJsonSchema, dataMapJsonSchema } from "../src/map/schema.js";
import { noticeChangeJsonSchema, noticeInputsJsonSchema } from "../src/notice/index.js";
import { ruleJsonSchema } from "../src/rules/schema.js";
import { trackerJsonSchema } from "../src/trackers/schema.js";
import { scanResultJsonSchema, scanResultDiffJsonSchema } from "../src/types.js";

mkdirSync("rules", { recursive: true });
mkdirSync("vendors", { recursive: true });
mkdirSync("schema", { recursive: true });

writeFileSync("rules/schema.json", JSON.stringify(ruleJsonSchema(), null, 2) + "\n");
writeFileSync(
  "vendors/schema.json",
  JSON.stringify(trackerJsonSchema(), null, 2) + "\n",
);
writeFileSync(
  "schema/scanresult.schema.json",
  JSON.stringify(scanResultJsonSchema(), null, 2) + "\n",
);
writeFileSync(
  "schema/scanresult-diff.schema.json",
  JSON.stringify(scanResultDiffJsonSchema(), null, 2) + "\n",
);
writeFileSync(
  "schema/explainer.schema.json",
  JSON.stringify(explainerJsonSchema(), null, 2) + "\n",
);
writeFileSync(
  "schema/datamap.schema.json",
  JSON.stringify(dataMapJsonSchema(), null, 2) + "\n",
);
writeFileSync(
  "schema/datamap-diff.schema.json",
  JSON.stringify(dataMapDiffJsonSchema(), null, 2) + "\n",
);
writeFileSync(
  "schema/notice-inputs.schema.json",
  JSON.stringify(noticeInputsJsonSchema(), null, 2) + "\n",
);
writeFileSync(
  "schema/notice-change.schema.json",
  JSON.stringify(noticeChangeJsonSchema(), null, 2) + "\n",
);

console.log(
  "schemas written: rules/schema.json, vendors/schema.json, schema/scanresult.schema.json, schema/scanresult-diff.schema.json, schema/explainer.schema.json, schema/datamap.schema.json, schema/datamap-diff.schema.json, schema/notice-inputs.schema.json, schema/notice-change.schema.json",
);
