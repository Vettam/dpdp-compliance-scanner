import { describe, expect, it } from "vitest";
import { scan } from "./repo.js";

describe("Python outbound calls", () => {
  it("records a literal requests call to a vendor host as high", async () => {
    const { emitted } = await scan({
      "app/pay.py": `def pay():\n    return requests.post("https://api.razorpay.com/v1/orders")\n`,
    });
    const point = emitted.data_points.find((p) => p.id === "dp_vendor_razorpay");
    expect(point?.recipients[0]?.role).toBe("fiduciary");
    expect(point?.recipients[0]?.observed).toEqual([
      expect.objectContaining({ kind: "http_call", confidence: "high", detail: { host: "api.razorpay.com" } }),
    ]);
  });

  it("records a const URL as medium and a dynamic vendor-looking name as a question", async () => {
    const { emitted } = await scan({
      "app/pay.py": `
RAZORPAY_URL = "https://api.razorpay.com/v1/orders"

def pay(razorpay_url):
    requests.get(RAZORPAY_URL)
    requests.get(razorpay_url)
`,
    });
    const observed = emitted.data_points.find((p) => p.id === "dp_vendor_razorpay")?.recipients[0]?.observed ?? [];
    expect(observed.map((o) => o.confidence)).toEqual(["medium"]);
    expect(emitted.questions.map((q) => q.ask)).toContain(
      "A call builds its URL from `razorpay_url`. Does it send data outside this repository? To whom?",
    );
  });

  it("reads httpx, urllib, and aiohttp", async () => {
    const { emitted } = await scan({
      "app/clients.py": `
import httpx
import urllib.request

def send(session):
    httpx.post("https://api.razorpay.com/v1/orders")
    urllib.request.urlopen("https://api.razorpay.com/v1/payments")
    aiohttp.ClientSession().get("https://checkout.razorpay.com/v1/checkout")
    session = requests.Session()
    session.get("https://api.segment.io/v1/t")
`,
    });
    const razorpay = emitted.data_points.find((p) => p.id === "dp_vendor_razorpay");
    const segment = emitted.data_points.find((p) => p.id === "dp_vendor_segment");
    expect(razorpay?.recipients[0]?.observed).toHaveLength(3);
    expect(razorpay?.recipients[0]?.observed.every((o) => o.confidence === "high")).toBe(true);
    expect(segment?.recipients[0]?.observed[0]?.detail).toEqual({ host: "api.segment.io" });
  });

  it("records a Segment track call from the analytics import", async () => {
    const { emitted } = await scan({
      "app/analytics.py": `
import analytics

def track_signup():
    analytics.track("user", "Signed Up")
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
      "app/pay.py": `
secret = "${secret}"

def pay():
    return requests.post("${long}", headers={"Authorization": secret})
`,
    });
    const dumped = JSON.stringify(emitted);
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain("a".repeat(70));
    expect(emitted.data_points.find((p) => p.id === "dp_vendor_razorpay")?.recipients[0]?.observed[0]?.confidence).toBe("high");
  });
});
