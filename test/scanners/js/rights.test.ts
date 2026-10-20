import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("JS rights endpoints", () => {
  it("reads a Next.js app route", async () => {
    const { emitted } = await scan({
      "app/api/account/delete/route.ts": `export async function DELETE() {\n  return Response.json({ ok: true });\n}\n`,
    });
    expect(emitted.rights_endpoints.map((r) => r.right)).toEqual(["erase"]);
    expect(emitted.rights_endpoints[0]?.observed[0]).toEqual(
      expect.objectContaining({ kind: "rights_endpoint", detail: { path: "/api/account/delete", right: "erase" } }),
    );
  });

  it("reads Express, Fastify, and Hono route calls", async () => {
    const { emitted } = await scan({
      "src/routes.ts": `
export function routes(app, fastify, hono) {
  app.delete("/api/account/delete", () => {});
  fastify.get("/download-my-data", () => {});
  hono.put("/update-profile", () => {});
}
`,
    });
    expect(emitted.rights_endpoints.map((r) => r.right).sort()).toEqual(["access", "correct", "erase"]);
  });

  it("reads NestJS controller routes and a pages router file", async () => {
    const { emitted } = await scan({
      "src/account.controller.ts": `
@Controller("account")
export class AccountController {
  @Delete("delete")
  remove() {}
  @Get("export")
  exportData() {}
}
`,
      "pages/api/profile/update-profile.ts": `export default function handler() {}\n`,
    });
    expect(emitted.rights_endpoints.map((r) => r.right).sort()).toEqual(["access", "correct", "erase"]);
  });
});
