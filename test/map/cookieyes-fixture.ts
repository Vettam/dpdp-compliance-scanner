import type { Observation } from "../../src/types.js";

/** Canned scan of the DoD page: GTM, GA4, Meta Pixel, Hotjar, and a CookieYes banner. */
export const COOKIEYES_URL = "https://fixture.acme.test/cookieyes";

const base = {
  timestamp_ms: 0,
  before_first_paint: true,
  before_banner_detected: true,
};

export function cookieyesObservations(opts: { omitHost?: string } = {}): Observation[] {
  const requests: Observation[] = [
    request("www.googletagmanager.com", "/gtm.js", 100),
    request("www.google-analytics.com", "/g/collect", 200),
    request("www.facebook.com", "/tr", 300),
    request("static.hotjar.com", "/c/hotjar-0.js", 400),
    request("cdn-cookieyes.com", "/client_data/fixture/script.js", 500),
  ].filter((r) => r.type === "request" && r.host !== opts.omitHost);

  return [
    {
      type: "meta",
      ...base,
      url: COOKIEYES_URL,
      final_url: `${COOKIEYES_URL}/`,
      page_language: "en",
      title: "Acme staging",
      scan_started_at: "2026-10-13T09:00:00.000Z",
      engine_version: "1.0.0",
      rules_version: "0.4.0",
      trackers_version: "0.3.0",
      geo_source: "DB-IP Lite",
      geo_date: "2026-09-01",
    },
    ...requests,
    {
      type: "cookie",
      ...base,
      timestamp_ms: 600,
      name: "cookieyes-consent",
      domain: ".fixture.acme.test",
      path: "/",
      expires: null,
      secure: true,
      httpOnly: false,
      sameSite: "Lax",
      first_party: true,
      set_by: "cdn-cookieyes.com",
    },
    {
      type: "banner",
      timestamp_ms: 2000,
      before_first_paint: false,
      before_banner_detected: false,
      detected: true,
      has_accept: true,
      has_reject: false,
      has_settings: false,
      has_pre_ticked: false,
      has_language_switcher: false,
      mentions_legitimate_interest: false,
      implies_consent_by_browsing: true,
      text_excerpt: "We use cookies to improve your experience.",
      detection_confidence: "high",
      notice_url: "",
    },
  ];
}

function request(host: string, path: string, timestamp_ms: number): Observation {
  return {
    type: "request",
    ...base,
    timestamp_ms,
    method: "GET",
    host,
    path,
    initiator_host: "fixture.acme.test",
    resource_type: "script",
    is_third_party: true,
    destination_country: "US",
  };
}
