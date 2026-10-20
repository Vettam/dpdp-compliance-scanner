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
}

describe("JS schema columns", () => {
  it("reads a Prisma model", async () => {
    await expectUsers(
      {
        "prisma/schema.prisma": `
model users {
  id            Int       @id
  phone         String
  aadhaar_last4 String
  notes         String
  age           Int
  deleted_at    DateTime?
}
`,
      },
      "schema.prisma",
    );
  });

  it("uses @@map as the table name", async () => {
    const { emitted } = await scan({
      "prisma/schema.prisma": `
model User {
  phone String
  @@map("users")
}
`,
    });
    expect(emitted.data_points.map((p) => p.id)).toContain("dp_users_phone");
  });

  it("reads Drizzle", async () => {
    await expectUsers(
      {
        "src/db.ts": `
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  phone: text("phone"),
  aadhaar_last4: text("aadhaar_last4"),
  notes: text("notes"),
  age: integer("age"),
  deletedAt: timestamp("deleted_at"),
});
`,
      },
      "src/db.ts",
    );
  });

  it("reads TypeORM", async () => {
    await expectUsers(
      {
        "src/user.ts": `
import { Entity, Column, DeleteDateColumn } from "typeorm";
@Entity("users")
export class User {
  @Column()
  phone: string;
  @Column({ type: "varchar" })
  aadhaar_last4: string;
  @Column({ type: "text" })
  notes: string;
  @Column()
  age: number;
  @DeleteDateColumn()
  deletedAt: Date;
}
`,
      },
      "src/user.ts",
    );
  });

  it("reads Sequelize", async () => {
    await expectUsers(
      {
        "src/user.js": `
sequelize.define("User", {
  phone: { type: DataTypes.STRING },
  aadhaar_last4: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
  age: { type: DataTypes.INTEGER },
  deleted_at: { type: DataTypes.DATE },
}, { tableName: "users" });
`,
      },
      "src/user.js",
    );
  });

  it("reads a Knex migration", async () => {
    await expectUsers(
      {
        "migrations/001_users.ts": `
export async function up(knex) {
  await knex.schema.createTable("users", (table) => {
    table.string("phone");
    table.string("aadhaar_last4");
    table.text("notes");
    table.integer("age");
    table.timestamp("deleted_at");
  });
}
`,
      },
      "migrations/001_users.ts",
    );
  });

  it("reads raw SQL", async () => {
    await expectUsers(
      {
        "db/users.sql": `
CREATE TABLE users (
  phone varchar(20),
  aadhaar_last4 text,
  notes text,
  age integer,
  deleted_at timestamp
);
`,
      },
      "db/users.sql",
    );
  });
});
