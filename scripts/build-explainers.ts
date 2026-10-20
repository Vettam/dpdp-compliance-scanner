/**
 * Emit one JSON document per rule for the Sentinel site.
 * Output is dist/explainers/<rule-id>.json — not committed, not published.
 */
import { EXPLAINER_OUT_DIR, writeExplainers } from "../src/explainers/build.js";

const files = await writeExplainers({
  rulesDir: "rules",
  outDir: EXPLAINER_OUT_DIR,
});

console.log(`wrote ${files.length} explainers to ${EXPLAINER_OUT_DIR}`);
