import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("JS outbound calls", () => {
  it("records a literal fetch to a vendor host as high", async () => {
    const { emitted } = await scan({
      "src/pay.ts": `export function pay() { return fetch("https://api.razorpay.com/v1/orders"); }\n`,
    });
    const point = emitted.data_points.find((p) => p.id === "dp_vendor_razorpay");
    expect(point?.recipients[0]?.role).toBe("fiduciary");
    expect(point?.recipients[0]?.observed).toEqual([
      expect.objectContaining({ kind: "http_call", confidence: "high", detail: { host: "api.razorpay.com" } }),
    ]);
  });

  it("records a const URL as medium and a dynamic vendor-looking name as a question", async () => {
    const { emitted } = await scan({
      "src/pay.ts": `
const RAZORPAY_URL = "https://api.razorpay.com/v1/orders";
export function pay(razorpayUrl: string) {
  fetch(RAZORPAY_URL);
  fetch(razorpayUrl);
}
`,
    });
    const observed = emitted.data_points.find((p) => p.id === "dp_vendor_razorpay")?.recipients[0]?.observed ?? [];
    expect(observed.map((o) => o.confidence)).toEqual(["medium"]);
    expect(emitted.questions.map((q) => q.ask)).toContain(
      "A call builds its URL from `razorpayUrl`. Does it send data outside this repository? To whom?",
    );
  });

  it("reads axios, got, XHR, and sendBeacon", async () => {
    const { emitted } = await scan({
      "src/clients.ts": `
export function send() {
  axios.post("https://api.razorpay.com/v1/orders");
  got("https://api.razorpay.com/v1/payments");
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "https://checkout.razorpay.com/v1/checkout");
  navigator.sendBeacon("https://api.segment.io/v1/t");
}
`,
    });
    const razorpay = emitted.data_points.find((p) => p.id === "dp_vendor_razorpay");
    const segment = emitted.data_points.find((p) => p.id === "dp_vendor_segment");
    expect(razorpay?.recipients[0]?.observed).toHaveLength(3);
    expect(razorpay?.recipients[0]?.observed.every((o) => o.confidence === "high")).toBe(true);
    expect(segment?.recipients[0]?.observed[0]?.detail).toEqual({ host: "api.segment.io" });
  });

  it("records a Segment track call from the SDK import", async () => {
    const { emitted } = await scan({
      "src/analytics.ts": `
import { AnalyticsBrowser } from "@segment/analytics-next";
const analytics = AnalyticsBrowser.load({ writeKey: "wk" });
export function trackSignup() {
  analytics.track("Signed Up");
}
`,
    });
    const segment = emitted.data_points.find((p) => p.id === "dp_vendor_segment");
    expect(segment?.consent_gate).toBeNull();
    expect(segment?.recipients[0]?.observed).toEqual([
      expect.objectContaining({ kind: "http_call", confidence: "high", detail: { call: "track" } }),
    ]);
  });

  it("does not copy long literals or secret-shaped tokens", async () => {
    const long = `https://api.razorpay.com/${"a".repeat(70)}`;
    const secret = "sk_live_example";
    expect(long.length).toBeGreaterThan(80);
    const { emitted } = await scan({
      "src/pay.ts": `
const secret = "${secret}";
export function pay() {
  return fetch("${long}", { headers: { Authorization: secret } });
}
`,
    });
    const dumped = JSON.stringify(emitted);
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain("a".repeat(70));
    expect(emitted.data_points.find((p) => p.id === "dp_vendor_razorpay")?.recipients[0]?.observed[0]?.confidence).toBe("high");
  });
});
