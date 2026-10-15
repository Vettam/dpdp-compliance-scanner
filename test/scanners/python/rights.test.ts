import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("Python rights endpoints", () => {
  it("reads a Django URL", async () => {
    const { emitted } = await scan({
      "app/urls.py": `
from django.urls import path

urlpatterns = [
    path("api/account/delete", views.delete_account),
]
`,
    });
    expect(emitted.rights_endpoints.map((r) => r.right)).toEqual(["erase"]);
    expect(emitted.rights_endpoints[0]?.observed[0]).toEqual(
      expect.objectContaining({ kind: "rights_endpoint", detail: { path: "api/account/delete", right: "erase" } }),
    );
  });

  it("reads FastAPI and Flask routes", async () => {
    const { emitted } = await scan({
      "app/api.py": `
@app.get("/download-my-data")
def export_data():
    return {}

@app.route("/update-profile", methods=["POST"])
def update_profile():
    return {}

@router.delete("/api/account/delete")
def remove_account():
    return {}
`,
    });
    expect(emitted.rights_endpoints.map((r) => r.right).sort()).toEqual(["access", "correct", "erase"]);
  });
});
