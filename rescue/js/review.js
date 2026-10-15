// /rescue/review/ — Giorgi's page for one order (brief §0g D7, D8): opened from the review email by a
// signed link https://rellony.com/rescue/review/#t=… (valid 7 days; an expired one can ask for a new one).
// The quality hold (the first 10 orders) and any order the checks held come here: Approve releases the
// pack with today as day 0 (the checks run again first); Refund refunds £79 through PayPal with a reason
// the owner is told. The token stays in this tab only (sessionStorage), and leaves the address bar.
import { call } from "./api.js";
import { problem, show } from "./cards.js";
import { h, hairline } from "./dom.js";
import { loadPdfmake } from "./pdf.js";
import { buildDocDefinition } from "./rescue-pack-pdf.mjs";
import { fmt, longDate, say } from "./text.js";

const KEY = "rx.review";
function token() {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{48})(?:&|$)/.exec(location.hash);
  if (m) {
    try { sessionStorage.setItem(KEY, m[1]); } catch { /* this page only */ }
    history.replaceState(null, "", location.pathname);
    return m[1];
  }
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
const review = token();
const day = (d) => (d ? longDate(String(d).slice(0, 10)) : "—");

function row(label, value) { return h("div", { class: "rx-sum__row" }, h("dt", {}, label), h("dd", {}, value ?? "—")); }

function render(d) {
  document.title = `Review ${d.ref} · Rellony Rescue`;
  const status = h("div", { role: "status", "aria-live": "polite" });
  // the quality hold counts down when an order is approved: this order, then the rest (as the review email says)
  const hold = Number(d.holdRemaining);
  const holdText = !Number.isFinite(hold) ? "—" : d.status === "awaiting_review" && hold > 0
    ? `This order, then ${hold - 1} more` : `${hold} more ${hold === 1 ? "order" : "orders"}`;
  const facts = h("section", { class: "rx-card rx-sum rx-review__facts" }, h("dl", {},
    row("Business", d.businessName), row("Email", d.email), row("Letter code", d.code), row("Council", d.council),
    row("Status", d.status), row("Paid", `${day(d.paidAt)} · £${d.amount} · ${d.method ?? ""}`), row("Finished questions", day(d.finishedAt)),
    row("Held by the checks", d.heldReasons?.length ? d.heldReasons.join(", ") : "No"),
    row("Quality hold", holdText),
    d.refundedAt ? row("Refunded", `${day(d.refundedAt)} — ${d.refundReason ?? ""}`) : null,
    d.disputedAt ? row("Dispute opened", day(d.disputedAt)) : null));

  const parts = [h("h1", { class: "rx-h1", tabindex: "-1" }, `Review ${d.ref}`), hairline(), facts];
  // the decision first (Approve, Refund), then the plan, folded
  const actions = [];
  const p = d.pack?.pack;
  if (p) {
    const pdf = h("button", { type: "button", class: "btn btn--secondary" }, "Download the Rescue plan (PDF)");
    pdf.addEventListener("click", async () => {
      try { (await loadPdfmake()).createPdf(buildDocDefinition(p, d.pack.fill)).download(`Rescue plan — ${d.ref}.pdf`); }
      catch { status.replaceChildren(h("p", { class: "form-error" }, "The PDF didn't load — try again")); }
    });
    parts.push(h("section", { class: "rx-card" },
      h("h2", {}, `Plan: ${p.plan.counts.steps} steps in ${p.plan.counts.groups} topics (${p.plan.counts.urgent} today)`),
      h("p", { class: "rx-fine" }, `Bank ${d.pack.versions.bank} · library ${d.pack.versions.library} · ${d.pack.versions.generator} · built ${day(d.pack.builtAt)}`),
      d.pack.validation?.reasons?.length ? h("p", { class: "form-error" }, `Checks: ${d.pack.validation.reasons.join(", ")}`) : null,
      pdf,
      h("details", { class: "rx-fold rx-review__fold" }, h("summary", {}, h("span", {}, "Show every step")),
        h("ol", { class: "rx-review__plan" }, p.plan.groups.map((g) => h("li", {}, h("strong", {}, `${g.week === 0 ? "Today" : `Week ${g.week}`} · ${say(g.title)}`),
          h("ul", {}, g.steps.map((s) => h("li", {}, say(s.text))))))))));
  }
  if (d.status === "awaiting_review" || d.status === "held") {
    const approve = h("button", { type: "button", class: "btn" }, "Approve and release");
    approve.addEventListener("click", async () => {
      if (approve.getAttribute("aria-busy") === "true") return;
      approve.setAttribute("aria-busy", "true");
      const r = await call("admin", { review, action: "approve" }, 30000);
      approve.removeAttribute("aria-busy");
      if (r.status === 200) { status.replaceChildren(h("p", { class: "rx-well" }, "Released — the owner has the “Pack ready” email. Day 0 is today.")); approve.remove(); }
      else if (r.data?.error === "checks") status.replaceChildren(h("p", { class: "form-error" }, `The checks still fail: ${r.data.reasons.join(", ")} — fix the cause, or refund`));
      else status.replaceChildren(h("p", { class: "form-error" }, `Not released (${r.data?.error ?? r.status})`));
    });
    actions.push(h("section", { class: "panel rx-make" }, approve));
  }
  if (["paid", "awaiting_review", "held", "delivered"].includes(d.status)) actions.push(refundForm(d, status));
  const plan = parts.splice(3);
  parts.push(status, ...actions, ...plan);
  show(h("div", { class: "rx-flow" }, parts));
}

function refundForm(d, status) {
  const select = h("select", { id: "refund-reason" }, h("option", { value: "" }, "Choose a reason"),
    Object.entries(d.reasons || {}).map(([k, v]) => h("option", { value: k }, v)), h("option", { value: "other" }, "Something else (write it)"));
  const note = h("textarea", { id: "refund-note", maxlength: "300", rows: "3" });
  const noteField = h("div", { class: "field", hidden: true }, h("label", { for: "refund-note" }, "The reason the owner will read (at least 10 characters)"), note);
  select.addEventListener("change", () => { noteField.hidden = select.value !== "other"; });
  const sure = h("input", { type: "checkbox", id: "refund-sure" });
  const go = h("button", { type: "submit", class: "btn btn--secondary" }, `Refund £${d.amount ?? 79}`);
  const form = h("form", { class: "rx-card", novalidate: true },
    h("h2", {}, "Refund this order"),
    h("div", { class: "field" }, h("label", { for: "refund-reason" }, "Reason (the owner reads it in the refund email)"), select),
    noteField,
    h("label", { class: "rx-option", for: "refund-sure" }, sure, h("span", { class: "rx-tile__text" }, fmt(`I've checked: refund the full £${d.amount ?? 79} to ${d.businessName} through PayPal. This stops the programme emails.`))),
    go);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (go.getAttribute("aria-busy") === "true") return;
    if (!select.value || !sure.checked || (select.value === "other" && note.value.trim().length < 10)) {
      status.replaceChildren(h("p", { class: "form-error" }, "Choose a reason (write it if it's something else) and tick the box"));
      return;
    }
    go.setAttribute("aria-busy", "true");
    const r = await call("admin", { review, action: "refund", reason: select.value, note: note.value }, 30000);
    go.removeAttribute("aria-busy");
    if (r.status === 200) { form.replaceWith(h("p", { class: "rx-well" }, `Refunded (PayPal: ${r.data.paypal ?? "sent"}). The owner has the refund email.`)); }
    else status.replaceChildren(h("p", { class: "form-error" }, `Not refunded (${r.data?.error ?? r.status}${r.data?.detail ? `: ${r.data.detail}` : ""})`));
  });
  return form;
}

function expired() {
  document.title = "Review link expired · Rellony Rescue";
  const again = h("button", { type: "button", class: "btn" }, "Email me a new link");
  const done = h("div", { role: "status" });
  again.addEventListener("click", async () => {
    const r = await call("admin", { review, action: "renew" });
    done.replaceChildren(h("p", { class: "rx-well" }, r.status === 200 ? "Sent — check the admin inbox" : `Not sent (${r.status})`));
  });
  show(h("div", { class: "rx-flow" }, h("h1", { class: "rx-h1" }, "This review link has expired"), hairline(),
    h("section", { class: "rx-card" }, h("p", {}, "Review links work for 7 days."), again, done)));
}

async function load() {
  if (!review) { show(h("div", { class: "rx-flow" }, h("h1", { class: "rx-h1" }, "No review link"), h("p", { class: "rx-lede" }, "Open this page from a review email."))); return; }
  const r = await call("admin", { review, action: "state" }, 20000);
  if (r.status === 200) render(r.data);
  else if (r.status === 410) expired();
  else if (r.status === 404) show(h("div", { class: "rx-flow" }, h("h1", { class: "rx-h1" }, "This review link doesn't open an order")));
  else problem(load);
}
load();
