import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("Python input shapes", () => {
  it("reads a Django form and links it to a column of the same name", async () => {
    const { emitted } = await scan({
      "app/models.py": `
class users(models.Model):
    phone = models.CharField(max_length=20)
`,
      "app/forms.py": `
class SignupForm(forms.Form):
    phone = forms.CharField()
    company = forms.CharField()
`,
    });
    const phone = emitted.data_points.find((p) => p.id === "dp_users_phone");
    expect(phone?.observed.map((o) => o.kind).sort()).toEqual(["input_field", "schema_column"]);
    expect(emitted.data_points.find((p) => p.id === "dp_input_signup_phone")).toBeUndefined();
    const company = emitted.data_points.find((p) => p.id === "dp_input_signup_company");
    expect(company?.category).toBe("UNCLASSIFIED");
    expect(company?.observed[0]?.kind).toBe("input_field");
  });

  it("reads Pydantic, WTForms, and DRF serializers", async () => {
    const { emitted } = await scan({
      "app/schemas.py": `
class Signup(BaseModel):
    email: str
`,
      "app/wtforms.py": `
class ProfileForm(FlaskForm):
    phone = StringField()
`,
      "app/serializers.py": `
class SignupSerializer(serializers.Serializer):
    address = serializers.CharField()
    dob = serializers.DateField()
`,
    });
    const ids = emitted.data_points.map((p) => p.id).sort();
    expect(ids).toEqual([
      "dp_input_profile_phone",
      "dp_input_signup_address",
      "dp_input_signup_dob",
      "dp_input_signup_email",
    ]);
    expect(emitted.data_points.find((p) => p.id === "dp_input_signup_email")?.category).toBe("C8");
  });
});
