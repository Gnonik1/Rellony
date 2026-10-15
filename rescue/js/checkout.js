// The checkout inside the free check's price panel (page copy v0.7 §5, design v1.5 §11, brief §0g D1).
// Two short stages on the panel's paper:
//   1. "Where should we send your pack?" (and, for a visitor from the website, the business name)
//   2. The order summary (E-Commerce Regs reg 11: correct mistakes before paying), the required S3 tick
//      box, then PayPal's own buttons — PayPal, and "Debit or credit card" where PayPal offers it — and
//      the line saying the payment happens in PayPal's window.
// PayPal's script (JavaScript SDK v6) loads only at stage 2, so PayPal sees nobody who doesn't go on to
// pay. The price is never sent from here: the server's order holds it.
import { call, orderLink, session, sleep } from "./api.js";
import { PAYPAL } from "./config.js";
import { h, newTab } from "./dom.js";
import { fmt } from "./text.js";

export const TERMS_VERSION = "1.1";
const AMOUNT = "79.00";

// ---------------------------------------------------------------- an email address that looks mistyped
// The usual slips in the big providers' names ("gmial.com", "hotmail.co"): suggested in the order
// summary, never forced.
const DOMAINS = ["gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.co.uk", "live.com",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "btinternet.com", "sky.com", "virginmedia.com", "aol.com",
  "talktalk.net", "protonmail.com", "mail.com"];
function distance(a, b) {                          // optimal string alignment distance, small strings
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
export function suggestEmail(value) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(value).trim());
  if (!m) return null;
  const typed = m[2].toLowerCase();
  const domain = typed.replace(/,/g, ".").replace(/\.con$/, ".com").replace(/\.couk$/, ".co.uk");
  if (DOMAINS.includes(domain)) return domain === typed ? null : `${m[1]}@${domain}`;
  let best = null, bestD = 3;
  for (const d of DOMAINS) { const x = distance(domain, d); if (x < bestD) { best = d; bestD = x; } }
  return best && bestD <= 2 ? `${m[1]}@${best}` : null;
}
export const looksLikeEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(String(v).trim()) && String(v).trim().length <= 254;

// ---------------------------------------------------------------- PayPal's script
let sdkPromise = null;
function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.paypal?.createInstance) { resolve(window.paypal); return; }
    const s = document.createElement("script");
    s.src = PAYPAL.sdk;
    s.async = true;
    const timer = setTimeout(() => reject(new Error("timeout")), 20000);
    s.addEventListener("load", () => { clearTimeout(timer); window.paypal?.createInstance ? resolve(window.paypal) : reject(new Error("no paypal")); });
    s.addEventListener("error", () => { clearTimeout(timer); s.remove(); reject(new Error("load")); });
    document.head.append(s);
  }).catch((e) => { sdkPromise = null; throw e; });
  return sdkPromise;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- the checkout
// { code, businessName, onPaid({ ref, email }) } → the paper under the price panel's olive head
export function checkout({ code, businessName, onPaid }) {
  const website = !code;
  const box = h("div", { class: "rx-pay", id: "pay" });
  let email = "";
  let business = businessName || "";
  let opening = false;            // a click is creating our order (PayPal's window is opening)

  // ---- stage 1: the email address (and the business name for a website visitor)
  function stageOne(focus = false) {
    const emailInput = h("input", { type: "email", id: "pay-email", name: "email", autocomplete: "email", inputmode: "email",
      autocapitalize: "off", spellcheck: "false", maxlength: "254", value: email, required: true, "aria-describedby": "pay-email-hint" });
    const bizInput = website ? h("input", { type: "text", id: "pay-business", name: "organization", autocomplete: "organization",
      maxlength: "120", value: business, required: true, "aria-describedby": "pay-business-hint" }) : null;
    const form = h("form", { class: "rx-pay__form", novalidate: true },
      website ? h("div", { class: "field" },
        h("label", { for: "pay-business" }, "Your business name"),
        h("p", { class: "hint", id: "pay-business-hint" }, fmt("As it's shown on your food hygiene rating")),
        bizInput) : null,
      h("div", { class: "field" },
        h("label", { for: "pay-email" }, "Where should we send your pack?"),
        h("p", { class: "hint", id: "pay-email-hint" }, fmt("Used only for this service — your pack and our replies, never marketing")),
        emailInput),
      h("button", { type: "submit", class: "btn" }, "Continue to payment"));
    emailInput.addEventListener("input", () => clearError(emailInput));
    bizInput?.addEventListener("input", () => clearError(bizInput));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = emailInput.value.trim();
      const b = bizInput ? bizInput.value.trim().replace(/\s+/g, " ") : business;
      let first = null;
      if (bizInput && b.length < 2) { fieldError(bizInput, "Enter your business name, as it's shown on your food hygiene rating"); first ??= bizInput; }
      if (!v) { fieldError(emailInput, "Enter your email address, like name@business.co.uk"); first ??= emailInput; }
      else if (!looksLikeEmail(v)) { fieldError(emailInput, "Check the email address — it should look like name@business.co.uk"); first ??= emailInput; }
      if (first) { first.focus(); return; }
      email = v;
      business = b;
      stageTwo();
    });
    box.replaceChildren(form);
    if (focus) (website ? bizInput : emailInput).focus();
  }

  // ---- stage 2: what you're buying, S3, PayPal's buttons
  function stageTwo() {
    const s3 = h("input", { type: "checkbox", id: "s3" });
    const terms = (href, text) => h("a", { href, target: "_blank", rel: "noopener" }, text, newTab());
    const s3Tile = h("label", { class: "rx-option rx-s3", for: "s3" }, s3,
      h("span", { class: "rx-tile__text" }, fmt("I'm buying for my business. I've read what Rellony does and doesn't do, and I agree to the "),
        terms("/rescue/terms/", "Terms"), " and ", terms("/rescue/refunds/", "Refund policy"), "."));
    const change = h("button", { type: "button", class: "linkish" }, "Change", h("span", { class: "vh" }, " the email address"));
    change.addEventListener("click", () => stageOne(true));
    const addr = h("strong", { class: "rx-summary__addr" }, email);
    const fix = suggestionLine(addr);
    const editUrl = `/rescue/start/${code ? `?c=${code}` : ""}#2`;
    const summary = h("div", { class: "rx-well rx-summary", id: "pay-summary", tabindex: "-1", "aria-labelledby": "pay-summary-h" },
      h("p", { class: "rx-summary__h", id: "pay-summary-h" }, "Your order"),
      h("p", {}, fmt("You're buying "), h("strong", {}, "Rellony Rescue"), " for ", h("strong", {}, business)),
      h("p", {}, h("strong", {}, "£79 in total"), fmt(" — no VAT or any other charge")),
      h("p", { class: "rx-summary__email" }, fmt("Your confirmation and private link go to "), addr, " ", change),
      fix,
      h("p", { class: "rx-summary__edit" }, h("a", { href: editUrl }, "Edit my answers")));
    const buttons = h("div", { class: "rx-paybuttons", id: "pay-buttons" }, payLoading());
    const status = h("div", { class: "rx-pay__status", role: "status", "aria-live": "polite" });
    const note = h("p", { class: "rx-pay__note" }, fmt("Payment happens in PayPal's window — you stay on this page. PayPal emails you its own receipt."));
    box.replaceChildren(summary, s3Tile, buttons, note, status);
    s3.addEventListener("change", () => { if (s3.checked) clearS3(s3, s3Tile); });
    summary.focus({ preventScroll: true });
    summary.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
    setUpPayPal(buttons, status, s3, s3Tile);
  }

  // "Did you mean name@gmail.com? Use this" — in the summary, where a mistake is corrected before paying
  function suggestionLine(addr) {
    const s = suggestEmail(email);
    if (!s) return null;
    const use = h("button", { type: "button", class: "linkish" }, "Use this");
    const line = h("p", { class: "rx-summary__suggest" }, fmt("Did you mean "), h("strong", {}, s), "? ", use);
    use.addEventListener("click", () => {
      email = s;
      addr.textContent = s;
      line.remove();
      addr.closest(".rx-summary").focus();
    });
    return line;
  }

  const payLoading = () => h("div", { class: "rx-paybuttons__wait", "aria-hidden": "true" }, h("span", {}), h("span", {}));

  async function setUpPayPal(area, status, s3, s3Tile) {
    if (!PAYPAL.clientId) {
      area.replaceChildren(h("p", { class: "rx-well" }, fmt("Payment isn't open yet — please come back soon, or write to rescue@rellony.com")));
      return;
    }
    let instance, methods;
    try {
      const paypal = await loadSdk();
      instance = await paypal.createInstance({
        clientId: PAYPAL.clientId, components: ["paypal-payments", "paypal-guest-payments"], pageType: "checkout", locale: "en-GB",
        // sandbox only: test as a buyer in the UK from wherever the test runs (Giorgi tests from Tbilisi)
        ...(PAYPAL.env === "sandbox" ? { testBuyerCountry: "GB" } : {}),
      });
      methods = await instance.findEligibleMethods({ currencyCode: "GBP", amount: AMOUNT });
    } catch {
      const again = h("button", { type: "button", class: "btn btn--secondary" }, "Try again");
      again.addEventListener("click", () => { area.replaceChildren(payLoading()); setUpPayPal(area, status, s3, s3Tile); });
      area.replaceChildren(h("p", { class: "form-error" }, fmt("PayPal didn't load — check your connection, or turn off a content blocker for this page, then try again")), again);
      return;
    }

    const handlers = () => ({
      onApprove: (data) => approved(data, area, status),
      onCancel: () => { opening = false; say(status, "note", "Payment cancelled — nothing was taken"); },
      onError: () => {
        opening = false;
        // our own message (from creating the order) stays; PayPal's own problem gets this one
        if (status.dataset.kept) delete status.dataset.kept;
        else say(status, "error", "PayPal ran into a problem, so nothing was taken. Try again in a minute.");
      },
    });
    const shown = [];
    const eligible = (m) => { try { return methods.isEligible(m); } catch { return false; } };
    if (eligible("paypal")) {
      try {
        const s = await instance.createPayPalOneTimePaymentSession(handlers());
        const b = document.createElement("paypal-button");
        b.setAttribute("type", "pay");
        b.addEventListener("click", () => start(s, "paypal", status, s3, s3Tile));
        shown.push(b);
      } catch { /* not offered: the card button may still be */ }
    }
    if (eligible("card")) {
      try {
        const g = await instance.createPayPalGuestOneTimePaymentSession(handlers());
        const b = document.createElement("paypal-basic-card-button");
        b.addEventListener("click", () => start(g, "card", status, s3, s3Tile));
        const wrap = document.createElement("paypal-basic-card-container");
        wrap.append(b);
        shown.push(wrap);
      } catch { /* PayPal's window still offers a card */ }
    }
    if (!shown.length) {
      area.replaceChildren(h("p", { class: "form-error" }, fmt("PayPal can't take a payment in this browser right now — please try another browser, or write to rescue@rellony.com")));
      return;
    }
    area.replaceChildren(...shown);
  }

  // A click on one of PayPal's buttons: S3 first, then PayPal's window, with our order on its way.
  function start(session_, method, status, s3, s3Tile) {
    if (opening) return;
    if (!s3.checked) { s3Error(s3, s3Tile); return; }
    clear(status);
    opening = true;
    // PayPal opens its window on this click and waits for the order: never awaited before start()
    const order = createOrder(method, status);
    order.then(() => { opening = false; }, () => { opening = false; });
    Promise.resolve(session_.start({ presentationMode: "auto" }, order)).catch(() => { opening = false; });
  }

  async function createOrder(method, status) {
    const r = await call("checkout", { token: session.get()?.token, action: "create", email, businessName: website ? business : undefined,
      accepted: true, terms: TERMS_VERSION, method });
    if (r.status === 200 && r.data?.orderId) return { orderId: r.data.orderId };
    status.dataset.kept = "1";                      // PayPal closes its window with onError: our message stays
    const err = r.data?.error;
    if (r.status === 409 && (err === "bought" || err === "no_check")) location.reload();
    else if (r.status === 409 && err === "terms") say(status, "error", "Our Terms have just been updated — please reload this page and read them again before you pay.");
    else if (r.status === 400 && (err === "email" || err === "business")) { delete status.dataset.kept; stageOne(true); }
    else if (r.status === 0) say(status, "error", "We couldn't reach our server, so nothing was taken. Check your connection and try again.");
    else say(status, "error", "Something went wrong on our side, so nothing was taken. Try again in a minute.");
    throw new Error("create");
  }

  // PayPal says the buyer approved: our server takes the payment (PayPal's webhook is the backup)
  async function approved({ orderId }, area, status) {
    area.classList.add("is-busy");
    area.setAttribute("aria-busy", "true");
    say(status, "wait", "Confirming your payment…");
    let r = null;
    for (let i = 0; i < 4; i++) {
      r = await call("checkout", { token: session.get()?.token, action: "capture", orderId }, 30000);
      if (r.status === 200 || (r.status >= 400 && r.status < 500)) break;
      await sleep(1500 * (i + 1));
    }
    area.removeAttribute("aria-busy");
    const d = r?.data ?? {};
    if (r?.status === 200 && d.status === "paid" && d.link) {
      orderLink.set(d.link, d.ref);
      onPaid({ ref: d.ref, email: d.email || email });
      return;
    }
    if (r?.status === 200 && d.status === "pending") {
      area.replaceChildren();
      area.classList.remove("is-busy");
      say(status, "note", `PayPal is still checking your payment. Please don't pay again — we'll email ${email} as soon as it clears, with your private link.`);
      return;
    }
    area.classList.remove("is-busy");
    if (r?.status === 200 && d.status === "declined") say(status, "error", "PayPal couldn't take the payment, so nothing was taken. Try again, or use another card or PayPal account.");
    else if (r?.status === 200 && d.status === "not_approved") say(status, "error", "The payment wasn't finished in PayPal, so nothing was taken. Try again.");
    else {
      const again = h("button", { type: "button", class: "btn btn--secondary" }, "Check again");
      again.addEventListener("click", () => approved({ orderId }, area, status));
      area.classList.add("is-busy");
      say(status, "error", "We couldn't confirm your payment yet. If PayPal has taken it, we'll email you within a few minutes — please don't pay again.", again);
    }
  }

  stageOne(false);
  return box;
}

// ---------------------------------------------------------------- messages and errors
function say(status, kind, text, extra = null) {
  const cls = kind === "error" ? "form-error" : kind === "wait" ? "rx-well rx-wait" : "rx-well";
  status.replaceChildren(h("p", { class: cls }, fmt(text)), extra);
}
function clear(status) { status.replaceChildren(); delete status.dataset.kept; }

function fieldError(input, text) {
  clearError(input);
  const id = `${input.id}-error`;
  input.before(h("p", { class: "form-error", id }, fmt(text)));
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", `${input.getAttribute("aria-describedby") || ""} ${id}`.trim());
}
function clearError(input) {
  const id = `${input.id}-error`;
  document.getElementById(id)?.remove();
  input.removeAttribute("aria-invalid");
  const rest = (input.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== id);
  if (rest.length) input.setAttribute("aria-describedby", rest.join(" ")); else input.removeAttribute("aria-describedby");
}
function s3Error(s3, tile) {
  if (!document.getElementById("s3-error")) tile.before(h("p", { class: "form-error", id: "s3-error" }, fmt("Tick the box to confirm you're buying for your business")));
  s3.setAttribute("aria-invalid", "true");
  s3.setAttribute("aria-describedby", "s3-error");
  tile.classList.add("is-invalid");
  s3.focus({ preventScroll: true });
  tile.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
}
function clearS3(s3, tile) {
  document.getElementById("s3-error")?.remove();
  s3.removeAttribute("aria-invalid");
  s3.removeAttribute("aria-describedby");
  tile.classList.remove("is-invalid");
}
