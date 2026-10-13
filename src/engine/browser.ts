import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * System-browser detection and Playwright Chromium fallback (spec §3.2).
 * playwright-core does not ship a browser; `channel: "chromium"` is not a
 * valid launch channel, so the fallback must actually run
 * `playwright-core install chromium`.
 */

export const CHROMIUM_FALLBACK_MESSAGE =
  "dpdp: no system Chrome/Edge found; downloading Chromium as a fallback (one-time).\n";

export interface DetectBrowserOptions {
  existsSync?: (path: string) => boolean;
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
}

export function detectSystemBrowser(
  browserPath?: string,
  opts: DetectBrowserOptions = {},
): string | undefined {
  const exists = opts.existsSync ?? existsSync;
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  if (browserPath && exists(browserPath)) return browserPath;
  for (const candidate of systemBrowserCandidates(platform, env)) {
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

function systemBrowserCandidates(platform: string, env: NodeJS.ProcessEnv): string[] {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  if (platform === "win32") {
    const pf = env["PROGRAMFILES"] ?? "C:\\Program Files";
    const pf86 = env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    return [
      join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ];
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ];
}

export function launchOptions(executablePath?: string): { headless: true; executablePath?: string } {
  if (executablePath) return { headless: true, executablePath };
  return { headless: true };
}

export function playwrightChromiumInstalled(
  executablePath: string,
  exists: (path: string) => boolean = existsSync,
): boolean {
  return Boolean(executablePath) && exists(executablePath);
}

export async function ensureChromium(opts: {
  installed: boolean;
  write?: (s: string) => void;
  install?: () => void | Promise<void>;
}): Promise<void> {
  if (opts.installed) return;
  (opts.write ?? ((s) => process.stderr.write(s)))(CHROMIUM_FALLBACK_MESSAGE);
  await (opts.install ?? installPlaywrightChromium)();
}

export function playwrightCoreCliPath(
  resolve: (id: string) => string = createRequire(import.meta.url).resolve,
): string {
  return join(dirname(resolve("playwright-core/package.json")), "cli.js");
}

export function installPlaywrightChromium(): void {
  const result = spawnSync(process.execPath, [playwrightCoreCliPath(), "install", "chromium"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error("failed to download Chromium (playwright-core install chromium)");
  }
}
