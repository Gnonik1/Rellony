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
