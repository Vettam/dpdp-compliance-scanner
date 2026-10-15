import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

const users = {
  phone: "dp_users_phone",
  aadhaar: "dp_users_aadhaar_last4",
  notes: "dp_users_notes",
};

async function expectUsers(files: Record<string, string>, locationIncludes: string) {
  const { emitted } = await scan(files);
  const phone = emitted.data_points.find((p) => p.id === users.phone);
  const aadhaar = emitted.data_points.find((p) => p.id === users.aadhaar);
  const notes = emitted.data_points.find((p) => p.id === users.notes);
  expect(phone?.category).toBe("C8");
  expect(phone?.flags).toEqual([]);
  expect(phone?.observed.some((o) => o.kind === "schema_column" && o.confidence === "high" && o.location.includes(locationIncludes))).toBe(true);
  expect(aadhaar?.category).toBe("C8");
  expect(aadhaar?.flags).toContain("SENS");
  expect(notes?.category).toBe("UNCLASSIFIED");
  expect(emitted.questions.map((q) => q.id)).toContain("q_dp_users_notes_meaning");
  expect(emitted.questions.find((q) => q.id === "q_dp_users_notes_meaning")?.ask).toBe(
    "The column users.notes is free text. Does it hold personal data? What kind?",
  );
  for (const point of [phone, aadhaar, notes]) {
    expect(point?.retention.signals.some((s) => s.kind === "soft_delete_column")).toBe(true);
  }
  expect(emitted.data_points.find((p) => p.id === "dp_users_age")).toBeUndefined();
  expect(emitted.data_points.find((p) => p.id === "dp_users_deleted_at")).toBeUndefined();
  return emitted;
}

const django = `
class users(models.Model):
    phone = models.CharField(
        max_length=20,
    )
    aadhaar_last4 = models.CharField(max_length=4)
    notes = models.TextField()
    age = models.IntegerField()
    deleted_at = models.DateTimeField(null=True)
`;

describe("Python schema columns", () => {
  it("reads a Django model", async () => {
    await expectUsers({ "app/models.py": django }, "app/models.py");
  });

  it("uses Meta.db_table as the table name", async () => {
    const { emitted } = await scan({
      "app/models.py": `
class User(models.Model):
    phone = models.CharField(max_length=20)
    class Meta:
        db_table = "users"
`,
    });
    expect(emitted.data_points.map((p) => p.id)).toContain("dp_users_phone");
  });

  it("reads a SQLAlchemy model", async () => {
    const emitted = await expectUsers(
      {
        "app/models.py": `
class User(Base):
    __tablename__ = "users"
    phone = Column(String)
    aadhaar_last4 = Column(String)
    notes = Column(Text)
    email = mapped_column(String)
    age = Column(Integer)
    deleted_at = Column(DateTime)
`,
      },
      "app/models.py",
    );
    expect(emitted.data_points.map((p) => p.id)).toContain("dp_users_email");
  });

  it("reads a SQLAlchemy Table and an Alembic migration", async () => {
    await expectUsers(
      {
        "app/tables.py": `
users = Table(
    "users",
    metadata,
    Column("phone", String),
    Column("aadhaar_last4", String),
    Column("notes", Text),
    Column("age", Integer),
    Column("deleted_at", DateTime),
)
`,
      },
      "app/tables.py",
    );
    await expectUsers(
      {
        "migrations/001_users.py": `
def upgrade():
    op.create_table(
        "users",
        sa.Column("phone", sa.String()),
        sa.Column("aadhaar_last4", sa.String()),
        sa.Column("notes", sa.Text()),
        sa.Column("age", sa.Integer()),
        sa.Column("deleted_at", sa.DateTime()),
    )
`,
      },
      "migrations/001_users.py",
    );
  });

  it("reads raw SQL once", async () => {
    const { emitted } = await scan({
      "db/users.sql": `
CREATE TABLE users (
  phone varchar(20),
  aadhaar_last4 text,
  notes text,
  age integer,
  deleted_at timestamp
);
`,
    });
    const phone = emitted.data_points.find((p) => p.id === "dp_users_phone");
    expect(phone?.observed.filter((o) => o.kind === "schema_column")).toHaveLength(1);
    expect(phone?.observed[0]?.location).toContain("db/users.sql");
  });
});
