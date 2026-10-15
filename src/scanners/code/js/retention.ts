import { lineAt } from "./ast.js";
import type { SchemaColumn } from "./schema.js";
import { normColumn } from "./vocab.js";

export interface RetentionHit {
  table: string;
  kind: string;
  location: string;
}

export function retentionKind(column: string): string | undefined {
  const n = normColumn(column);
  if (n === "deleted_at" || n === "soft_deleted" || n === "is_deleted") return "soft_delete_column";
  if (n === "expires_at" || n === "expire_at" || n === "expired_at" || n === "expiry") return "expiry_column";
  if (n === "ttl" || n === "ttl_seconds" || n === "expire_after") return "ttl";
  return undefined;
}

export function columnSignals(columns: SchemaColumn[]): RetentionHit[] {
  const hits: RetentionHit[] = [];
  for (const col of columns) {
    const kind = col.signal ?? retentionKind(col.column);
    if (!kind) continue;
    hits.push({ table: col.table, kind, location: col.location });
  }
  return hits;
}

/**
 * Cron, TTL indexes, and bucket lifecycle config. Attached only to a table the
 * same file names, so an unrelated delete helper does not mark every column.
 */
export function fileSignals(file: { rel: string; text: string }, tables: string[]): RetentionHit[] {
  const mentioned = tables.filter((table) => new RegExp(`\\b${escapeReg(table)}\\b`).test(file.text));
  if (mentioned.length === 0) return [];
  const hits: RetentionHit[] = [];
  const push = (kind: string, pattern: RegExp) => {
    const line = firstLine(file.text, pattern);
    if (line === undefined) return;
    for (const table of mentioned) hits.push({ table, kind, location: `${file.rel}:${line}` });
  };
  if (/delete|erase|purge|destroy/i.test(file.text)) push("scheduled_deletion", /cron|CronJob|schedule\s*\(/i);
  push("lifecycle_config", /LifecycleConfiguration|lifecycle_rule|BucketLifecycle/);
  push("ttl", /expireAfterSeconds/);
  return hits;
}

function firstLine(text: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return undefined;
  return lineAt(text, match.index);
}

export function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
