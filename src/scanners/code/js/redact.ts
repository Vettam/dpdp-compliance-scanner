import { redactBannerText } from "../../../engine/redact.js";

/** Spec §5.3: never store a secret-shaped literal or more than 80 characters of one. */
const SECRET =
  /(?:sk_(?:live|test)_|rk_(?:live|test)_|pk_(?:live|test)_|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|github_pat_|xox[baprs]-|AIza[0-9A-Za-z\-_]{20,}|ya29\.|-----BEGIN |eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/;

export function safeExcerpt(text: string): string {
  const cleaned = redactBannerText(text.replace(/\s+/g, " ").trim());
  if (!cleaned || SECRET.test(cleaned)) return "";
  return cleaned.length > 80 ? cleaned.slice(0, 80) : cleaned;
}

export function hostOf(url: string): { host: string; path: string } | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    return undefined;
  }
}
