import { describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, execSync } from "node:child_process";

const root = process.cwd();

describe("shim package", () => {
  it("depends on dpdp-compliance-scanner >=2 and ships three bins", () => {
    const pkg = JSON.parse(readFileSync(join(root, "shim", "package.json"), "utf8")) as {
      name: string;
      version: string;
      bin: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("dpdp-cookie-scanner");
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.dependencies["dpdp-compliance-scanner"]).toBe(">=2");
    expect(pkg.bin).toEqual({
      "dpdp-cookie-scanner": "./bin/dpdp-cookie-scanner.js",
      "dpdp-cookie-scan": "./bin/dpdp-cookie-scan.js",
      "dpdp-notice-lint": "./bin/dpdp-notice-lint.js",
    });
    const readme = readFileSync(join(root, "shim", "README.md"), "utf8");
    expect(readme).toContain("npm publish");
    expect(readme).toContain("npm deprecate");
  });

  it("forwards the three bins when installed from a local tarball", () => {
    expect(existsSync(join(root, "dist", "cli.js")), "run npm run build before this test").toBe(true);
    const tmp = mkdtempSync(join(tmpdir(), "dpdp-shim-"));
    try {
      const packed = JSON.parse(
        execSync("npm pack --ignore-scripts --json --pack-destination " + JSON.stringify(tmp), {
          cwd: root,
          encoding: "utf8",
        }),
      ) as Array<{ filename: string }>;
      const scannerTarball = join(tmp, packed[0]!.filename);

      const shimSrc = join(tmp, "shim");
      cpSync(join(root, "shim"), shimSrc, { recursive: true });
      const shimPkgPath = join(shimSrc, "package.json");
      const shimPkg = JSON.parse(readFileSync(shimPkgPath, "utf8")) as {
        dependencies: Record<string, string>;
      };
      shimPkg.dependencies["dpdp-compliance-scanner"] = `file:${scannerTarball}`;
      writeFileSync(shimPkgPath, JSON.stringify(shimPkg));
      const shimPacked = JSON.parse(
        execSync("npm pack --ignore-scripts --json --pack-destination " + JSON.stringify(tmp), {
          cwd: shimSrc,
          encoding: "utf8",
        }),
      ) as Array<{ filename: string }>;

      const install = join(tmp, "app");
      mkdirSync(install);
      writeFileSync(join(install, "package.json"), JSON.stringify({ private: true }));
      execSync(
        "npm install --ignore-scripts --no-fund --no-audit " + JSON.stringify(join(tmp, shimPacked[0]!.filename)),
        { cwd: install, stdio: "pipe" },
      );

      const bin = (name: string) => join(install, "node_modules", ".bin", name);
      const rules = execFileSync(bin("dpdp-cookie-scan"), ["--rules-version"], { encoding: "utf8" });
      expect(rules.trim()).toMatch(/^\d+\.\d+\.\d+/);
      const alias = execFileSync(bin("dpdp-cookie-scanner"), ["--rules-version"], { encoding: "utf8" });
      expect(alias.trim()).toBe(rules.trim());

      const version = execFileSync(bin("dpdp"), ["version"], { encoding: "utf8" });
      expect(version).toContain("rules ");
      expect(version).toContain("vendors ");

      let lintStatus = 0;
      let lintErr = "";
      try {
        execFileSync(bin("dpdp-notice-lint"), [], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (error) {
        const err = error as { status?: number; stderr?: string };
        lintStatus = err.status ?? 1;
        lintErr = err.stderr ?? "";
      }
      expect(lintStatus).toBe(2);
      expect(lintErr).toContain("dpdp notice lint");

      writeFileSync(join(install, "a.json"), "{}\n");
      writeFileSync(join(install, "b.json"), "{}\n");
      let diffErr = "";
      try {
        execFileSync(bin("dpdp-cookie-scan"), ["--diff-from", "a.json", "--diff-to", "b.json"], {
          cwd: install,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        diffErr = (error as { stderr?: string }).stderr ?? "";
      }
      expect(diffErr).toContain("ScanResult");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 180000);
});
