export const COMMENT_MARKER = "<!-- dpdp-cookie-scan -->";

const LIMIT = 60000;

/**
 * Pull-request comment: drift table, then findings. The CLI writes both;
 * this only concatenates them.
 */
export function buildComment({ summary, drift, findings }) {
  const parts = [COMMENT_MARKER, summary, ""];
  if (drift && drift.trim()) parts.push(drift.trimEnd(), "");
  for (const md of findings ?? []) {
    if (md && md.trim()) parts.push(md.trimEnd(), "");
  }
  let body = parts.join("\n");
  if (body.length > LIMIT) {
    body = body.slice(0, LIMIT) + "\n\n…truncated. Full report is in the `dpdp-scan` artifact.\n";
  }
  return body;
}
