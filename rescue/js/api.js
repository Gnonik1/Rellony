// Calls to the Rescue functions, and the one thing Rescue keeps in the browser: the session token
// (privacy notice: "our pages keep a session token in your browser"). No cookies, no answers stored
// here — they live on the server.
import { FUNCTIONS_URL, PUBLISHABLE_KEY } from "./config.js";

// One call. Never throws: { status, data }, with status 0 when the network failed or timed out.
export async function call(fn, body, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: "omit",
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

const KEY = "rellony.rescue";
let held = null;   // this page's copy, for a browser that blocks storage: the visit still works
export const session = {
  get() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null") ?? held; } catch { return held; }
  },
  set(token, code) {
    held = { token, code: code ?? null };
    try { localStorage.setItem(KEY, JSON.stringify(held)); } catch { /* storage blocked: kept for this page only */ }
  },
  clear() {
    held = null;
    try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  },
};

// The private link of an order (Phase 5): the token after #t= in the link we email. It is kept in this
// browser (like the session token) so the owner can come back without the email, and taken out of the
// address bar at once, so it isn't shown, bookmarked or shared by accident.
const ORDER_KEY = "rellony.rescue.order";
let heldLink = null;
export const orderLink = {
  get() {
    try { return JSON.parse(localStorage.getItem(ORDER_KEY) || "null")?.link ?? heldLink; } catch { return heldLink; }
  },
  set(link, ref = null) {
    heldLink = link;
    try { localStorage.setItem(ORDER_KEY, JSON.stringify({ link, ref })); } catch { /* storage blocked: this page only */ }
  },
  clear() {
    heldLink = null;
    try { localStorage.removeItem(ORDER_KEY); } catch { /* nothing to clear */ }
  },
  // #t=<token> in the address: keep it, and drop it from the address (any other hash stays)
  fromAddress() {
    const m = /(?:^#|&)t=([A-Za-z0-9_-]{44})(?:&|$)/.exec(location.hash);
    if (!m) return null;
    this.set(m[1]);
    const rest = location.hash.replace(/(^#|&)t=[A-Za-z0-9_-]{44}/, "$1").replace(/^#&/, "#").replace(/&$/, "");
    history.replaceState(null, "", location.pathname + location.search + (rest === "#" ? "" : rest));
    return m[1];
  },
};

// The letter code in the address bar (?c=…), as typed, or null.
export function rawCode() {
  const c = new URLSearchParams(location.search).get("c");
  return c && c.trim() ? c.trim() : null;
}

// A code in its canonical form (4 or 5 of A–Z and 2–9, without 0, O, 1 or I), or null.
export function normaliseCode(value) {
  const code = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[A-HJ-NP-Z2-9]{4,5}$/.test(code) ? code : null;
}

// Start or resume this browser's session for a letter code (or for none: a website visitor).
// Sends the token we hold only if it belongs to the same code. Keeps whatever token comes back.
export async function startSession(code) {
  const held = session.get();
  const token = held && held.code === (code ?? null) ? held.token : undefined;
  const r = await call("session-start", code ? { code, token } : { token });
  if (r.status === 200 || r.status === 201) session.set(r.data.token, code);
  return r;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
