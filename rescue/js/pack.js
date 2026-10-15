// /p/ — the pack page (page copy v0.7 §8), opened by the order's private link https://rellony.com/p/#t=…
// The token is kept in this browser and taken out of the address bar at once (api.js orderLink).
//   unfinished questions → /rescue/q/ · being checked · payment pending · refunded · closed after 12 months
//   released → the pack page: dates, "Make your SFBB pack — two steps" (the FSA's own PDF, chosen by the
//   owner and filled in on this device — never uploaded, D4), the Rescue plan PDF (made on this device),
//   and the plan by weeks with the owner's ticks.
//   no link → "Lost your link?", which emails it again to the address used to pay
import { call, orderLink, sleep } from "./api.js";
import { busy, linkAgain, problem, show } from "./cards.js";
import { h, hairline, newTab, skeleton, toast } from "./dom.js";
import { buildDocDefinition, pointerText } from "./rescue-pack-pdf.mjs";
import { loadPdfmake } from "./pdf.js";
import { GET, item, NOT } from "./scope.js";
import { fmt, longDate, phrases, say } from "./text.js";

let link = null;
const WEEK = { 0: "Today", 1: "Week 1", 2: "Week 2", 3: "Week 3" };
const iso = (d) => String(d ?? "").slice(0, 10);
const date = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d ?? "")) ? longDate(iso(d)) : "");

// ---------------------------------------------------------------- a page with one message
function message(title, text, extra = null) {
  document.title = fmt(`${title} · Rellony Rescue`);
  show(h("div", { class: "rx-done" },
    h("h1", { class: "rx-h1", tabindex: "-1" }, fmt(title)),
    hairline(),
    h("section", { class: "rx-card rx-refer" }, typeof text === "string" ? h("p", {}, fmt(text)) : text, extra)));
}

function noLink() {
  document.title = "Your pack page · Rellony Rescue";
  show(h("div", { class: "rx-done" },
    h("h1", { class: "rx-h1", tabindex: "-1" }, "Your pack page"),
    hairline(),
    h("section", { class: "rx-card" },
      h("p", {}, fmt("Your questions and your pack page open from the private link we emailed when you paid. Lost it? We'll email it again to the address you paid with.")),
      linkAgain()),
    h("p", { class: "rx-after" }, h("a", { class: "rx-quiet", href: "/r/" }, "Got our letter? Enter its code"))));
}

function stateScreen(d) {
  const ref = d.ref ? ` Your order: ${d.ref}.` : "";
  if (d.status === "checking") {
    return message("We're checking your plan",
      `We check our first orders by hand before they're released. We'll email ${d.email || "you"} as soon as your pack is ready — within 24 hours of finishing your questions.${ref}`);
  }
  if (d.status === "pending") {
    return message("Your payment is being checked",
      `PayPal is still checking your payment. Please don't pay again — we'll email ${d.email || "you"} as soon as it clears.${ref}`);
  }
  if (d.status === "refunded") {
    return message("This order was refunded", `We've refunded this order in full${d.refundedAt ? ` on ${date(d.refundedAt)}` : ""}. Questions: rescue@rellony.com.${ref}`);
  }
  if (d.status === "expired") {
    return message("Your pack page has closed", `Your plan and its tools were available for 12 months${d.expiresAt ? `, until ${date(d.expiresAt)}` : ""}, and have now been deleted. Your SFBB pack and Rescue plan stay on your device if you saved them.`);
  }
  return message("This payment didn't go through", `Nothing was taken for this order. If you think that's wrong, email rescue@rellony.com.${ref}`);
}

// ---------------------------------------------------------------- the SFBB pack, on this device
function deviceLine() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPhone or iPad: when it opens, tap Share, then Save to Files.";
  if (/Android/.test(ua)) return "Android: it usually saves straight to your Downloads.";
  return "Computer: use the download button at the top of the PDF.";
}

async function sha256(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function saveFile(bytes, name, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const fileName = (business, what) => `${what} — ${String(business || "").replace(/[\\/:*?"<>|]+/g, " ").trim()}.pdf`;

function sfbbCard(d) {
  const until = date(d.expiresAt);
  const out = h("div", { class: "rx-sfbb__out", role: "status", "aria-live": "polite" });
  const input = h("input", { type: "file", id: "sfbb-file", accept: "application/pdf,.pdf", class: "vh" });
  const choose = h("label", { class: "btn", for: "sfbb-file", id: "main-action" }, fmt("Choose the FSA's pack"));
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    out.replaceChildren(h("p", { class: "rx-sfbb__wait" }, fmt("Filling in your pack…")));
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if ((await sha256(bytes)) !== d.sfbb.sha256) throw Object.assign(new Error("version"), { wrong: true });
      const { fillOfficialPack } = await import("./rescue-sfbb-fill.mjs");
      const { bytes: filled, report } = await fillOfficialPack(bytes, d.fill);
      const save = h("button", { type: "button", class: "btn" }, "Save your SFBB pack");
      save.addEventListener("click", () => saveFile(filled, fileName(d.businessName, "SFBB pack")));
      out.replaceChildren(
        h("p", { class: "rx-sfbb__ready" }, h("strong", {}, "Your SFBB pack is ready")),
        save,
        h("p", { class: "btn-note" }, fmt(`Check it page by page and sign each safe method on its completion record. We don't keep a copy; you can make it again here at any time until ${until}.`)));
      save.focus();
      const names = (list) => (list || []).map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean).slice(0, 200);
      call("order", { link, action: "report", report: { text: report.text, check: report.check, replacedChars: report.replacedChars,
        cut: names(report.cut), readOnlySkipped: names(report.readOnlySkipped), wrongType: names(report.wrongType),
        ms: Math.round(performance.now() - t0), filled: report.text + report.check } });
    } catch (e) {
      out.replaceChildren(h("p", { class: "rx-sfbb__wrong" }, fmt(e?.wrong
        ? "This isn't the version of the FSA's pack we fill in. Choose the file you saved from the GOV.UK link in step 1. If that is the one you chose, the FSA may have updated its pack — email rescue@rellony.com, and follow your Rescue plan meanwhile: it gives the page for every step."
        : "We couldn't fill in this file on this device. Try again, or try another browser — and if it keeps happening, email rescue@rellony.com.")));
    }
  });
  return h("section", { class: "panel rx-action rx-olive rx-sfbb", "aria-labelledby": "h-sfbb" },
    h("h2", { id: "h-sfbb" }, fmt("Make your SFBB pack — two steps")),
    h("ol", { class: "rx-sfbb__steps" },
      h("li", {},
        h("p", { class: "rx-sfbb__step" }, h("strong", {}, fmt("Save the FSA's pack from GOV.UK")), " ", fmt("The FSA publishes it as a free PDF — about 8 MB, so Wi-Fi is best.")),
        h("a", { class: "btn btn--secondary", href: d.sfbb.url, target: "_blank", rel: "noopener noreferrer" }, fmt("Open the FSA's pack on GOV.UK ↗"), newTab()),
        h("p", { class: "btn-note" }, fmt(deviceLine()))),
      h("li", {},
        h("p", { class: "rx-sfbb__step" }, h("strong", {}, "Choose it here"), " ", fmt("We check it's the version we fill in, then fill it in from your answers on this device. Nothing is uploaded: the pack and your filled copy stay with you.")),
        input, choose, out)));
}

// ---------------------------------------------------------------- the Rescue plan PDF, on this device
function planButton(d) {
  const b = h("button", { type: "button", class: "btn btn--secondary", id: "plan-pdf" }, "Download your Rescue plan (PDF)");
  const note = h("p", { class: "rx-fine", role: "status" });
  b.addEventListener("click", async () => {
    if (b.getAttribute("aria-busy") === "true") return;
    b.setAttribute("aria-busy", "true");
    note.textContent = "Making your Rescue plan…";
    try {
      const pdfMake = await loadPdfmake();
      pdfMake.createPdf(buildDocDefinition(d.pack, d.fill)).download(fileName(d.businessName, "Rescue plan"));
      note.textContent = "";
    } catch {
      note.textContent = fmt("We couldn't make the PDF on this device — check your connection and try again");
    }
    b.removeAttribute("aria-busy");
  });
  return h("div", { class: "rx-plan-pdf" }, b, note);
}

// ---------------------------------------------------------------- the plan, with the owner's ticks
function planSection(d) {
  const ticks = { ...(d.ticks || {}) };
  let timer = null, saving = false;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (saving) { persist(); return; }
      saving = true;
      let wait = 1000;
      for (;;) {
        const r = await call("order", { link, action: "ticks", ticks });
        if (r.status === 200 || (r.status >= 400 && r.status < 500)) break;
        toast(fmt("Not saved yet — check your connection, we'll keep trying"));
        await sleep(wait);
        wait = Math.min(wait * 2, 15000);
      }
      toast(null);
      saving = false;
    }, 700);
  };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });   // YYYY-MM-DD, UK day
  const weeks = d.pack.plan.weeks.filter((w) => w.groups.length).map((w) => {
    const prog = d.pack.plan.programme?.find((x) => x.week === w.week);
    return h("section", { class: `rx-card rx-week${w.week === 0 ? " rx-week--today" : ""}`, "aria-labelledby": `wk-${w.week}` },
      h("h3", { id: `wk-${w.week}` }, WEEK[w.week], w.week && prog ? h("span", { class: "rx-week__sub" }, fmt(` — ${prog.title}`)) : null),
      w.groups.map((g) => h("div", { class: "rx-topic" },
        h("h4", {}, say(g.title)),
        h("ul", { class: "rx-steps" }, g.steps.map((s, i) => {
          const key = `${g.n}.${i}`;
          const id = `t-${g.n}-${i}`;
          const box = h("input", { type: "checkbox", id, checked: !!ticks[key] });
          const when = h("span", { class: "rx-step__when" }, ticks[key] ? fmt(`done ${longDate(ticks[key])}`) : "");
          box.addEventListener("change", () => {
            if (box.checked) ticks[key] = today; else delete ticks[key];
            when.textContent = ticks[key] ? fmt(`done ${longDate(ticks[key])}`) : "";
            persist();
          });
          const pointer = pointerText(s);
          return h("li", { class: "rx-step" },
            h("label", { class: "rx-option", for: id }, box,
              h("span", { class: "rx-tile__text" }, say(s.text), pointer ? h("span", { class: "rx-tile__hint" }, say(pointer)) : null, when)));
        })),
        g.evidence ? h("p", { class: "rx-topic__ev rx-fine" }, fmt(`Keep as evidence: ${g.evidence.replace(/\.$/, "")}`)) : null)));
  });
  return h("section", { class: "rx-plan", "aria-labelledby": "h-plan" },
    h("h2", { id: "h-plan" }, "Your 4-week plan"),
    h("p", { class: "rx-plan__intro" }, fmt("Every gap found in your answers (and in your inspection letter, if you told us what it says) is listed here once, by topic, in our practical wording of official guidance — mainly the FSA's Safer food, better business. If your officer told you something different, follow the officer.")),
    d.pack.plan.items.length ? weeks
      : h("p", { class: "rx-well" }, fmt("Your answers showed no gaps to fix. Follow the weekly routine in your Rescue plan, use your SFBB pack every day, and keep it up to date when anything in your kitchen changes.")),
    h("p", { class: "rx-fine" }, fmt("Your ticks are saved with your plan — only you can see them")));
}

function delivered(d) {
  const name = d.businessName;
  document.title = fmt(`${name} — your food safety system · Rellony Rescue`);
  const strip = phrases(`Programme ${date(d.day0)}–${date(d.endsAt)} · Self-check ${date(d.endsAt)} · Email support until ${date(d.supportEndsAt)} · Pack available until ${date(d.expiresAt)}`);
  const scope = h("details", { class: "rx-card rx-scope rx-scope--fold" },
    h("summary", {}, fmt("What Rellony does — and doesn't")),
    h("div", { class: "rx-scope__cols" },
      h("div", { class: "rx-scope__does" }, h("h3", {}, "What you get"), h("ul", {}, GET.map(item))),
      h("div", {}, h("h3", {}, "What Rellony does not do"), h("ul", {}, NOT.map(item)))));
  const o = d.order || {};
  show(
    h("h1", { class: "rx-h1", tabindex: "-1" }, fmt(`${name} — your food safety system`)),
    h("p", { class: "rx-lede rx-dates" }, strip),
    hairline(),
    h("div", { class: "rx-grid" },
      h("div", { class: "rx-stack" },
        h("section", { class: "rx-card rx-intro" },
          h("p", {}, fmt("Two documents. Your SFBB pack is the FSA's own pack, filled in on this device from your answers. Your Rescue plan shows what to fix and where each fix goes in the pack. Start with Today. Check the pack page by page, sign each safe method on its completion record, and keep it where you and your staff use it every day — on a device or printed (you only need to print the pages you write on, such as the diary). Tick your steps here as you go — only you can see them.")),
          planButton(d)),
        planSection(d),
        scope),
      h("div", { class: "rx-stack rx-aside" }, sfbbCard(d))),
    h("p", { class: "rx-after rx-order" },
      h("span", { class: "rx-fine" }, phrases([`Order ${d.ref}`, o.paidAt ? `paid ${date(o.paidAt)}` : null, o.amount ? `£${o.amount}` : null].filter(Boolean).join(" · "))),
      h("a", { class: "rx-quiet", href: "/rescue/terms/", target: "_blank", rel: "noopener" }, fmt(`Terms${o.termsVersion ? ` (version ${o.termsVersion})` : ""}`), newTab()),
      h("a", { class: "rx-quiet", href: "mailto:rescue@rellony.com" }, "rescue@rellony.com")));
}

// ---------------------------------------------------------------- load
async function load() {
  link = orderLink.fromAddress() || orderLink.get();
  if (!link) { noLink(); return; }
  busy(skeleton());
  const r = await call("order", { link, action: "pack" }, 20000);
  if (r.status === 404) { orderLink.clear(); noLink(); return; }
  if (r.status !== 200) { problem(load); return; }
  if (r.data.status === "open") { location.replace("/rescue/q/"); return; }
  if (r.data.status === "delivered") delivered(r.data); else stateScreen(r.data);
}

load();
