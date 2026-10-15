import { listFiles } from "../js/walk.js";

export interface PySource {
  rel: string;
  text: string;
  kind: "python" | "template" | "cron";
}

export function listPythonFiles(root: string): PySource[] {
  return listFiles(root, kindOf);
}

function kindOf(name: string): PySource["kind"] | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".html") || lower.endsWith(".jinja") || lower.endsWith(".jinja2")) return "template";
  if (lower === "crontab" || lower.endsWith(".cron")) return "cron";
  return undefined;
}
