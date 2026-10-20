import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

const model = `
class users(models.Model):
    phone = models.CharField(max_length=20)
    deleted_at = models.DateTimeField(null=True)
`;

describe("Python retention signals", () => {
  it("attaches a Celery beat deletion to the table the task names", async () => {
    const { emitted } = await scan({
      "app/models.py": model,
      "app/tasks.py": `
def purge():
    crontab(hour=0, minute=0)
    db.execute("delete from users")
`,
    });
    const kinds = emitted.data_points.find((p) => p.id === "dp_users_phone")?.retention.signals.map((s) => s.kind).sort();
    expect(kinds).toEqual(["scheduled_deletion", "soft_delete_column"]);
  });

  it("reads a cron line that runs a Django management command", async () => {
    const { emitted } = await scan({
      "app/models.py": model,
      "app/management/commands/purge_users.py": `
def handle(self):
    delete_expired("users")
`,
      "deploy/crontab": `0 0 * * * python manage.py purge_users\n`,
    });
    expect(
      emitted.data_points.find((p) => p.id === "dp_users_phone")?.retention.signals.map((s) => s.kind),
    ).toContain("scheduled_deletion");
  });
});
