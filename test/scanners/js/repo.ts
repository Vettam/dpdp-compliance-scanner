import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCode, type CodeScan } from "../../../src/scanners/code/index.js";

export const rulesDir = join(process.cwd(), "rules");
export const vendorsDir = join(process.cwd(), "vendors");

export async function scan(files: Record<string, string>, scannedAt = "2026-10-15T00:00:00.000Z"): Promise<CodeScan> {
  const dir = mkdtempSync(join(tmpdir(), "dpdp-js-"));
  try {
    writeRepo(dir, files);
    return await scanCode(dir, { vendorsDir, rulesDir, sourcePath: ".", commit: "fixture", scannedAt });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeRepo(dir: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
}
