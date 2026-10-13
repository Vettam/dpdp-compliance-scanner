import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function dpdpBin() {
  const entry = fileURLToPath(import.meta.resolve("dpdp-compliance-scanner"));
  const root = join(dirname(entry), "..");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const rel = pkg.bin.dpdp;
  return join(root, rel);
}

export function forward(args) {
  try {
    execFileSync(process.execPath, [dpdpBin(), ...args], { stdio: "inherit" });
  } catch (error) {
    const status = error && typeof error === "object" ? error.status : undefined;
    if (typeof status === "number") process.exit(status);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

function isDiffFlag(arg) {
  return arg === "--diff-from" || arg === "--diff-to" || arg.startsWith("--diff-from=") || arg.startsWith("--diff-to=");
}

export function forwardScan() {
  const args = process.argv.slice(2);
  const sub = args.some(isDiffFlag) ? ["map", "diff"] : ["scan", "page"];
  forward([...sub, ...args]);
}

export function forwardNoticeLint() {
  forward(["notice", "lint", ...process.argv.slice(2)]);
}
