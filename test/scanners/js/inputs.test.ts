import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("JS input shapes", () => {
  it("reads a JSX input and links it to a column of the same name", async () => {
    const { emitted } = await scan({
      "prisma/schema.prisma": `model users {\n  phone String\n}\n`,
      "app/signup/page.tsx": `
export default function SignupPage() {
  return (
    <form name="signup">
      <input name="phone" />
      <input name="company" />
    </form>
  );
}
`,
    });
    const phone = emitted.data_points.find((p) => p.id === "dp_users_phone");
    expect(phone?.observed.map((o) => o.kind).sort()).toEqual(["input_field", "schema_column"]);
    expect(emitted.data_points.find((p) => p.id === "dp_input_signup_phone")).toBeUndefined();
    const company = emitted.data_points.find((p) => p.id === "dp_input_signup_company");
    expect(company?.category).toBe("UNCLASSIFIED");
    expect(company?.observed[0]?.kind).toBe("input_field");
  });

  it("reads Zod, Yup, react-hook-form, and Formik", async () => {
    const { emitted } = await scan({
      "src/zod.ts": `
import { z } from "zod";
export const signupSchema = z.object({ email: z.string().email() });
`,
      "src/yup.ts": `
import yup from "yup";
export const profileSchema = yup.object({ phone: yup.string() });
`,
      "src/hook.tsx": `
export function Signup() {
  return <input {...register("address")} />;
}
`,
      "src/formik.tsx": `
export function Signup() {
  return <Field name="dob" />;
}
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
