import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeCode } from "../../src/cli/code.js";
import type { CliDeps } from "../../src/cli/execute.js";
import { parseDataMap, serializeDataMap } from "../../src/map/io.js";
import { scanCode } from "../../src/scanners/code/index.js";

const rulesDir = join(process.cwd(), "rules");
const vendorsDir = join(process.cwd(), "trackers");

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dpdp-manifest-"));
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
  return dir;
}

const sliceFixture = {
  "package.json": JSON.stringify({
    dependencies: {
      "@segment/analytics-next": "^1.0.0",
      "acme-telemetry": "1.0.0",
      "left-pad": "1.0.0",
    },
  }),
  "requirements.txt": "razorpay==1.4.0\n",
  "go.mod": "module example.com/app\n\ngo 1.22\n\nrequire gopkg.in/segmentio/analytics-go.v3 v3.1.0\n",
};

describe("dpdp scan code manifests", () => {
  it("records Segment and Razorpay as package recipients and questions acme-telemetry", async () => {
    const dir = repo(sliceFixture);
    try {
      const result = await scanCode(dir, { vendorsDir, rulesDir, sourcePath: "." });
      const points = result.emitted.data_points;
      const segment = points.find((dp) => dp.recipients.some((r) => r.vendor === "segment"));
      const razorpay = points.find((dp) => dp.recipients.some((r) => r.vendor === "razorpay"));
      expect(segment?.id).toBe("dp_vendor_segment");
      expect(segment?.recipients[0]?.role).toBe("processor");
      expect(segment?.recipients[0]?.observed.map((o) => o.location).sort()).toEqual(["go.mod", "package.json"]);
      expect(segment?.recipients[0]?.observed.every((o) => o.kind === "package" && o.confidence === "medium")).toBe(true);
      // The dataset classifies Razorpay as a separate fiduciary (web data map, payments).
      expect(razorpay?.recipients[0]?.role).toBe("fiduciary");
      expect(razorpay?.recipients[0]?.observed.map((o) => ({ kind: o.kind, location: o.location }))).toEqual([
        { kind: "package", location: "requirements.txt" },
      ]);
      expect(result.emitted.questions.map((q) => q.ask)).toEqual([
        "The dependency `acme-telemetry` is not in the vendor dataset. Does it send data outside this repository? To whom?",
      ]);
      expect(ruleCounts(result.findings)).toEqual({
        "DPDP-C-094": 1,
        "DPDP-C-095": 2,
      });
      const transfer = result.findings.find((finding) => finding.rule_id === "DPDP-C-094");
      expect(transfer?.tracker?.id).toBe("segment");
      expect(transfer?.detection_confidence).toBe("medium");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads every manifest ecosystem and ignores node_modules", async () => {
    const dir = repo({
      "package.json": JSON.stringify({ dependencies: { "left-pad": "1.0.0" } }),
      "package-lock.json": JSON.stringify({ packages: { "node_modules/lock-telemetry": {} } }),
      "yarn.lock": "yarn-telemetry@^1.0.0:\n  version \"1.0.0\"\n",
      "pnpm-lock.yaml": "packages:\n  \"pnpm-telemetry@1.0.0\": {}\n",
      "bun.lock": JSON.stringify({ workspaces: { "": { dependencies: { "bun-telemetry": "1.0.0" } } } }),
      "requirements-dev.txt": "req-telemetry==1\n",
      "pyproject.toml": "[project]\ndependencies = [\"pyproject-telemetry>=1\"]\n",
      "poetry.lock": "[[package]]\nname = \"poetry-telemetry\"\n",
      "Pipfile.lock": JSON.stringify({ default: { "pipfile-telemetry": {} } }),
      "Gemfile.lock": "GEM\n  specs:\n    gem-telemetry (1.0.0)\n",
      "go.mod": "module example.com/app\n\nrequire github.com/acme/gomod-telemetry v1.0.0\n",
      "go.sum": "github.com/acme/gosum-telemetry v1.0.0 h1:abc\n",
      "pom.xml": "<dependencies><dependency><groupId>com.acme</groupId><artifactId>pom-telemetry</artifactId></dependency></dependencies>\n",
      "build.gradle": "dependencies { implementation 'com.acme:gradle-telemetry:1.0.0' }\n",
      "build.gradle.kts": "dependencies { implementation(\"com.acme:kts-telemetry:1.0.0\") }\n",
      "Cargo.lock": "[[package]]\nname = \"cargo-telemetry\"\n",
      "Podfile.lock": "PODS:\n  - pod-telemetry (1.0.0)\n",
      "Package.swift": ".package(url: \"https://github.com/acme/swift-telemetry.git\", from: \"1.0.0\")\n",
      "composer.lock": JSON.stringify({
        packages: [{ name: "acme/widgets", description: "customer telemetry export" }],
      }),
      "pubspec.lock": "packages:\n  pub_telemetry:\n    dependency: direct main\n",
      "node_modules/package.json": JSON.stringify({ dependencies: { "hidden-telemetry": "1.0.0" } }),
    });
    try {
      const result = await scanCode(dir, { vendorsDir, rulesDir });
      const asks = result.emitted.questions.map((q) => q.ask);
      for (const name of [
        "lock-telemetry",
        "yarn-telemetry",
        "pnpm-telemetry",
        "bun-telemetry",
        "req-telemetry",
        "pyproject-telemetry",
        "poetry-telemetry",
        "pipfile-telemetry",
        "gem-telemetry",
        "github.com/acme/gomod-telemetry",
        "github.com/acme/gosum-telemetry",
        "com.acme:pom-telemetry",
        "com.acme:gradle-telemetry",
        "com.acme:kts-telemetry",
        "cargo-telemetry",
        "pod-telemetry",
        "swift-telemetry",
        "acme/widgets",
        "pub_telemetry",
      ]) {
        expect(asks.some((ask) => ask.includes(`\`${name}\``)), name).toBe(true);
      }
      expect(asks.some((ask) => ask.includes("hidden-telemetry") || ask.includes("left-pad"))).toBe(false);
      expect(asks).toHaveLength(19);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dpdp scan code command", () => {
  function deps(dir: string) {
    const out: string[] = [];
    const err: string[] = [];
    const files = new Map<string, string>();
    const mapPath = join(dir, ".dpdp", "data-map.yaml");
    const cli: CliDeps = {
      stdout: { write: (s) => out.push(s) },
      stderr: { write: (s) => err.push(s) },
      exit: () => {},
      writeFile: (path, data) => files.set(path, data),
      readFile: (path) => {
        const data = files.get(path);
        if (data === undefined) throw new Error(`ENOENT: ${path}`);
        return data;
      },
      mkdir: () => {},
      rulesDir,
      trackersDir: vendorsDir,
      mapPath,
    };
    return { out, err, files, mapPath, cli };
  }

  it("writes the map, keeps a hand-edited purpose, and gates only on settled", async () => {
    const dir = repo(sliceFixture);
    try {
      const { out, err, files, mapPath, cli } = deps(dir);
      const code = await executeCode(
        { path: dir, json: false, md: false, out: dir, ci: false, failOn: "settled", noMap: false },
        cli,
      );
      expect(code).toBe(0);
      expect(out.join("")).toContain("2 recipients · 1 open question · 3 findings");
      const map = parseDataMap(files.get(mapPath) ?? "");
      const segment = map.data_points.find((dp) => dp.id === "dp_vendor_segment");
      expect(segment).toBeDefined();
      segment!.purpose = "To bill the order.";
      files.set(mapPath, serializeDataMap(map));
      const again = await executeCode(
        { path: dir, json: true, md: false, out: dir, ci: false, failOn: "", noMap: false },
        cli,
      );
      expect(again).toBe(0);
      const kept = parseDataMap(files.get(mapPath) ?? "");
      expect(kept.data_points.find((dp) => dp.id === "dp_vendor_segment")?.purpose).toBe("To bill the order.");
      const bad = await executeCode(
        { path: dir, json: false, md: false, out: dir, ci: false, failOn: "arguable", noMap: true },
        cli,
      );
      expect(bad).toBe(2);
      expect(err.join("")).toContain("settled");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads the committed basis, so a s.7(a) claim on Segment is a settled finding", async () => {
    const dir = repo(sliceFixture);
    try {
      const { files, mapPath, cli } = deps(dir);
      expect(
        await executeCode(
          { path: dir, json: false, md: false, out: dir, ci: false, failOn: "", noMap: false },
          cli,
        ),
      ).toBe(0);
      const map = parseDataMap(files.get(mapPath) ?? "");
      const segment = map.data_points.find((dp) => dp.id === "dp_vendor_segment");
      expect(segment?.category).toBe("C9");
      segment!.basis = "voluntarily_provided";
      files.set(mapPath, serializeDataMap(map));
      const outDir = join(dir, "out");
      const code = await executeCode(
        { path: dir, json: true, md: true, out: outDir, ci: false, failOn: "settled", noMap: true },
        cli,
      );
      expect(code).toBe(1);
      const written = JSON.parse(files.get(join(outDir, "findings.json")) ?? "{}") as {
        findings: Array<{ id: string; rule_id: string }>;
        catalogue_questions: Array<{ rule_id: string }>;
      };
      expect(written.findings.map((finding) => finding.rule_id)).toContain("DPDP-C-093");
      expect(written.findings.map((finding) => finding.id)).not.toContain("f_dpdp_c_095_dp_vendor_segment");
      expect(written.catalogue_questions.map((question) => question.rule_id)).toContain("DPDP-C-090");
      const md = files.get(join(outDir, "findings.md")) ?? "";
      expect(md).toContain("DPDP-C-093 Twilio Segment");
      expect(md).toContain("DPDP-C-090");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 3 when the repository cannot be read", async () => {
    const { err, cli } = deps(join(tmpdir(), "dpdp-missing"));
    const code = await executeCode(
      { path: join(tmpdir(), "dpdp-no-such-repo"), json: false, md: false, out: ".", ci: false, failOn: "", noMap: true },
      cli,
    );
    expect(code).toBe(3);
    expect(err.join("")).toContain("unreadable repository");
  });
});

function ruleCounts(findings: { rule_id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.rule_id] = (counts[finding.rule_id] ?? 0) + 1;
  return counts;
}
