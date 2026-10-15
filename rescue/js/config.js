// Where the Rescue pages find their functions.
//   Live: the project's Edge Functions, with the publishable key — public by design; the secret key
//   never leaves Supabase.
//   On this laptop (the page served from 127.0.0.1 or localhost): the local dev server instead,
//   with its own fake key. Add ?api=live once to try the live functions from here (it holds for
//   the tab).
const LIVE = {
  url: "https://ajuuvsrqmqtzpahmlubl.supabase.co/functions/v1",
  key: "sb_publishable_8vKzRXjIqmyd9vSMmDZEEg_0702eWUL",
};
const LOCAL = { url: "http://127.0.0.1:54321/functions/v1", key: "sb_publishable_local_dev" };

function pick() {
  const host = location.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") return LIVE;
  try {
    const asked = new URLSearchParams(location.search).get("api");
    if (asked) sessionStorage.setItem("rx.api", asked);
    return sessionStorage.getItem("rx.api") === "live" ? LIVE : LOCAL;
  } catch {
    return LOCAL;
  }
}

const chosen = pick();
export const FUNCTIONS_URL = chosen.url;
export const PUBLISHABLE_KEY = chosen.key;

// PayPal (Phase 5, brief §0g D1): the JavaScript SDK v6 and the app's client ID, which PayPal says is
// safe in front-end code (the secret stays in Supabase). Sandbox until go-live (Phase 7): then `env`
// becomes "live", `sdk` https://www.paypal.com/web-sdk/v6/core and `clientId` the live app's ID.
// With the local functions (127.0.0.1 or localhost, no ?api=live) the pages use a stand-in SDK the local
// test server serves (/__dev/, never deployed), and nothing reaches PayPal.
const PAYPAL_SITE = { env: "sandbox", sdk: "https://www.sandbox.paypal.com/web-sdk/v6/core", clientId: "BAAiHMfI06ZnDFJoQiBQc_e6BZBN8m5Ru0uI6qomc3itHWu3vvbjj4VDcP3JrR80Fp-qiSL0Po6QoZiz2E" };
const PAYPAL_LOCAL = { env: "dev", sdk: "/__dev/paypal-v6.js", clientId: "dev" };
export const PAYPAL = chosen === LIVE ? PAYPAL_SITE : PAYPAL_LOCAL;
