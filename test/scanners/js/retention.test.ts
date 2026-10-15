import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

const prisma = `
model users {
  phone String
  deleted_at DateTime?
}
`;

describe("JS retention signals", () => {
  it("attaches a scheduled deletion to the table the job names", async () => {
    const { emitted } = await scan({
      "prisma/schema.prisma": prisma,
      "src/jobs.ts": `
export function purge() {
  cron.schedule("0 0 * * *", () => {
    db.query("delete from users");
  });
}
`,
    });
    const kinds = emitted.data_points.find((p) => p.id === "dp_users_phone")?.retention.signals.map((s) => s.kind).sort();
    expect(kinds).toEqual(["scheduled_deletion", "soft_delete_column"]);
  });

  it("reads an S3 lifecycle config", async () => {
    const { emitted } = await scan({
      "prisma/schema.prisma": prisma,
      "infra/bucket-lifecycle.json": `{ "LifecycleConfiguration": { "Rules": [{ "Prefix": "users/" }] } }\n`,
    });
    expect(
      emitted.data_points.find((p) => p.id === "dp_users_phone")?.retention.signals.map((s) => s.kind),
    ).toContain("lifecycle_config");
  });

  it("reads a TTL index", async () => {
    const { emitted } = await scan({
      "prisma/schema.prisma": prisma,
      "src/ttl.ts": `db.collection("users").createIndex({ created: 1 }, { expireAfterSeconds: 3600 });\n`,
    });
    expect(
      emitted.data_points.find((p) => p.id === "dp_users_phone")?.retention.signals.map((s) => s.kind),
    ).toContain("ttl");
  });
});
