import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cli = join(process.cwd(), "dist", "cli.js");

describe("built CLI flags", () => {
  it("rejects --fail-on values other than settled before scanning", () => {
    expect(existsSync(cli), "run npm run build before this test").toBe(true);
    const result = spawnSync(
      process.execPath,
      [cli, "scan", "page", "--fail-on", "arguable", "https://example.invalid"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("settled");
  });

  it("reads --diff-from and --diff-to", () => {
    expect(existsSync(cli), "run npm run build before this test").toBe(true);
    const dir = mkdtempSync(join(tmpdir(), "dpdp-argv-"));
    try {
      writeFileSync(join(dir, "a.json"), "{}\n");
      writeFileSync(join(dir, "b.json"), "{}\n");
      const result = spawnSync(
        process.execPath,
        [cli, "map", "diff", "--diff-from", "a.json", "--diff-to", "b.json"],
        { cwd: dir, encoding: "utf8" },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("ScanResult");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
