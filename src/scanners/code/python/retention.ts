import { columnSignals, escapeReg, fileSignals, type RetentionHit } from "../js/retention.js";
import type { SchemaColumn } from "../js/schema.js";
import { lineAt } from "./parse.js";
import type { PySource } from "./walk.js";

export function pythonSignals(files: PySource[], columns: SchemaColumn[]): RetentionHit[] {
  const tables = [...new Set(columns.map((col) => col.table))];
  const hits = [
    ...columnSignals(columns),
    ...files.flatMap((file) => fileSignals(file, tables)),
  ];
  hits.push(...cronCommands(files, tables));
  return hits;
}

/** A cron line `manage.py <command>` attaches when that management command deletes a named table. */
function cronCommands(files: PySource[], tables: string[]): RetentionHit[] {
  const commands = new Map<string, PySource>();
  for (const file of files) {
    const stem = /management\/commands\/([^/]+)\.py$/.exec(file.rel)?.[1];
    if (stem) commands.set(stem, file);
  }
  const hits: RetentionHit[] = [];
  for (const file of files) {
    if (file.kind !== "cron") continue;
    const re = /(?:manage\.py|django-admin)\s+([A-Za-z_][\w-]*)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(file.text))) {
      const name = match[1];
      const command = name ? commands.get(name) : undefined;
      if (!command || !/delete|erase|purge|destroy/i.test(command.text)) continue;
      const line = lineAt(file.text, match.index);
      for (const table of tables) {
        if (!new RegExp(`\\b${escapeReg(table)}\\b`).test(command.text)) continue;
        hits.push({ table, kind: "scheduled_deletion", location: `${file.rel}:${line}` });
      }
    }
  }
  return hits;
}
