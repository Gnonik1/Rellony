// /rescue/preview/ — the free check, or the screen that says we can't help.
//   /rescue/preview/?c=CODE   for that letter's session; no code: a website visitor's own session
// The payment block (email, order summary, S3, PayPal) comes in Phase 5; until then the price panel
// ends with the price and "Not for you right now?".
import { call, normaliseCode, rawCode, session, sleep, startSession } from "./api.js";
import { busy, problem, scoreCard, show } from "./cards.js";
import { h, hairline, newTab, skeleton, stickyBar } from "./dom.js";
import { fmt, say } from "./text.js";

const STEP_OF = { "F1.1": 1, "F1.2": 2, "F1.3": 3, F2: 4 };
const PILL = { "Today": "today", "Do first": "first", "Important": "important", "Good practice": "good" };

let code = null;
const startUrl = (step) => `/rescue/start/${code ? `?c=${code}` : ""}${step ? `#${step}` : ""}`;
const selfUrl = () => `/rescue/preview/${code ? `?c=${code}` : ""}`;

// ---------------------------------------------------------------- the free check
const em = (text) => h("em", {}, text);
const PACK = "Safer food, better business for caterers";
// The scope box, word for word as the Terms and the Rescue plan have it; on the web "This Rescue
// plan" reads "Your Rescue plan" and a one-sentence item drops its full stop (the stops rule)
const GET = [
  ["The FSA's own ", em(PACK), " pack, filled in on your device from your answers — you check it, finish it and sign it."],
  ["Your Rescue plan: where you stand, a 4-week plan of the gaps in your answers (and in your council's letter, if you tell us what it says), and where each fix goes in your SFBB pack."],
  ["An allergen matrix to fill in, and a daily fridge and freezer log (optional, unless your council's letter raises temperature records)."],
  ["A short email on days 3, 7, 14 and 21, and a final one on day 28 with your self-check."],
  ["A tool that turns your own photos into an evidence PDF, and a draft re-visit request you edit and send yourself."],
  ["Answers to your emails about using your plan and your SFBB pack (rescue@rellony.com) within 2 working days, until support ends (day 35)."],
];
const NOT = [
  "Visit or inspect your premises, or check the work you do.",
  "Contact your council or act on your behalf.",
  "Decide or check allergen information.",
  "Give legal advice, or professional advice specific to your premises.",
  "Certify or approve your business — the self-check is your own checklist.",
  "Speak for the Food Standards Agency or your council — Rellony is independent of both.",
  "Promise a rating — only the officer decides. Food safety stays your legal responsibility as the food business operator.",
].map((x) => [x]);

// One list item from its pieces: text pieces get the typography; the last text piece gets the stops
// rule for the whole item.
function item(pieces) {
  const whole = pieces.map((p) => (typeof p === "string" ? p : p.textContent)).join("");
  const last = pieces.length - 1;
  return h("li", {}, pieces.map((p, i) => (typeof p !== "string" ? p : i === last && say(whole) !== fmt(whole) ? fmt(p.replace(/\.$/, "")) : fmt(p))));
}

function gapItem(g) {
  const said = g.said ? `${g.said.kind === "chose" ? "You said" : "Not ticked"}: ${say(g.said.text)}` : null;
  return h("li", { class: "rx-gap" },
    h("span", { class: `rx-tag rx-tag--${PILL[g.pill] ?? "good"}` }, g.pill),
    h("strong", { class: "rx-gap__title" }, say(g.fix)),
    said ? h("p", { class: "rx-gap__said" }, said) : null);
}

function officerSection(gaps) {
  if (!gaps.length) return null;
  return h("section", { class: "rx-card", id: "gaps-officer", "aria-labelledby": "h-officer" },
    h("h2", { id: "h-officer" }, "What the officer looks for"),
    h("p", { class: "rx-card__sub" }, "Where you are, from your answers"),
    h("ul", { class: "rx-gaps" }, gaps.map((g) => h("li", { class: "rx-gap" },
      g.urgent ? h("span", { class: "rx-tag rx-tag--today" }, "Today") : null,
      h("strong", { class: "rx-gap__title" }, say(g.title)),
      g.detail ? h("p", {}, say(g.detail)) : null))));
}

// Scrolls at once, without the page's smooth scrolling (styles.css), in every browser.
function jumpBy(dy) {
  if (Math.abs(dy) < 1) return;
  const root = document.documentElement;
  const was = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  scrollBy(0, dy);
  root.style.scrollBehavior = was;
}

function answersSection(gaps) {
  if (!gaps.length) return null;
  const open = gaps.filter((g) => g.open);
  const more = gaps.filter((g) => !g.open);
  const section = h("section", { class: "rx-card", id: "gaps-answers", "aria-labelledby": "h-answers" },
    h("h2", { id: "h-answers" }, "Hygiene and handwashing"),
    h("p", { class: "rx-card__sub" }, "What to fix, most urgent first"));
  // Today and Do first are open; Important and Good practice fold (shown open when nothing else is)
  if (!open.length || !more.length) {
    section.append(h("ul", { class: "rx-gaps" }, gaps.map(gapItem)));
    return section;
  }
  const rest = h("ul", { class: "rx-gaps", id: "gaps-more", hidden: true }, more.map(gapItem));
  const toggle = h("button", { type: "button", "aria-expanded": "false", "aria-controls": "gaps-more" }, `Show ${more.length} more`);
  toggle.addEventListener("click", () => {
    const opening = rest.hidden;
    const before = toggle.getBoundingClientRect().top;
    rest.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.textContent = opening ? "Show fewer" : `Show ${more.length} more`;
    // Closing shortens the page above the button: scroll with it, so the button stays under the
    // finger and the next card follows (the page's own anchor; the browser's is off in rescue.css)
    if (!opening) jumpBy(toggle.getBoundingClientRect().top - before);
  });
  section.append(h("ul", { class: "rx-gaps" }, open.map(gapItem)), rest, h("p", { class: "rx-more" }, toggle));
  return section;
}

function scopeSection(counts) {
  const { applicableMethods: some, totalMethods: all } = counts;
  const count = some === all
    ? h("p", { class: "rx-scope__count" }, "All ", h("strong", {}, String(all)), fmt(" safe methods in the FSA's pack apply to your kitchen"))
    : h("p", { class: "rx-scope__count" }, "Of the ", h("strong", {}, String(all)), fmt(" safe methods in the FSA's pack, "), h("strong", {}, String(some)), " apply to your kitchen");
  return h("section", { class: "rx-card rx-scope", "aria-labelledby": "h-scope" },
    h("h2", { id: "h-scope" }, fmt("What Rellony does — and doesn't")),
    h("div", { class: "rx-scope__cols" },
      h("div", { class: "rx-scope__does" }, h("h3", {}, "What you get"), count, h("ul", {}, GET.map(item))),
      h("div", {}, h("h3", {}, "What Rellony does not do"), h("ul", {}, NOT.map(item)))),
    h("p", { class: "rx-sample" },
      h("a", { href: "/rescue/sample.pdf", target: "_blank", rel: "noopener" }, "See a sample plan (PDF)", newTab()),
      fmt(" — "), em("our Rescue plan for a fictional business")));
}

function pricePanel() {
  const exit = h("div", { class: "rx-exit" });
  const ask = h("button", { type: "button", class: "linkish" }, "Not for you right now?");
  ask.addEventListener("click", () => exitQuestion(exit));
  exit.append(ask);
  return h("section", { class: "panel rx-price", id: "price", "aria-labelledby": "h-price" },
    h("div", { class: "rx-price__head rx-olive" },
      h("h2", { id: "h-price" }, h("span", {}, fmt("Build your full system —")), " ", h("span", { class: "price__figure" }, "£79")),
      h("ul", { class: "rx-price__points" },
        h("li", {}, fmt("About 12 more minutes of questions")),
        h("li", {}, fmt("Your pack the same day — we check our first orders by hand, so allow up to 24 hours")),
        h("li", {}, fmt("£79 in total — we don't add VAT or any other charge")))),
    exit);
}

// "Not for you right now?": one question, one tap. Stored only as the funnel event
// exit_reason on the session; no email is sent because of it.
function exitQuestion(box) {
  const REASONS = [["price", "The price"], ["trust", "I'm not sure I can trust it"], ["no_need", "I don't need it"], ["other", "Something else"]];
  const options = REASONS.map(([reason, label]) => {
    const b = h("button", { type: "button", class: "rx-option rx-option--button", "data-reason": reason }, fmt(label));
    b.addEventListener("click", () => (reason === "other" ? addNote(b) : send(reason, null, b)));
    return b;
  });
  const group = h("div", { class: "rx-exit-q", role: "group", "aria-labelledby": "exit-ask" },
    h("p", { class: "rx-ask", id: "exit-ask" }, fmt("What's the main reason?")),
    h("div", { class: "rx-options" }, options));
  box.replaceChildren(group);
  options[0].focus();

  function addNote(button) {
    options.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    if (group.querySelector(".rx-exit-note")) return;
    const note = h("textarea", { id: "exit-note", maxlength: "140", rows: "2" });
    const go = h("button", { type: "button", class: "btn" }, "Send");
    go.addEventListener("click", () => send("other", note.value.trim() || null, go));
    group.append(h("div", { class: "rx-exit-note" },
      h("div", { class: "field" }, h("label", { for: "exit-note" }, "Anything to add? (optional)"), note), go));
    note.focus();
  }

  async function send(reason, note, button) {
    if (button.getAttribute("aria-busy") === "true") return;
    button.setAttribute("aria-busy", "true");
    for (let i = 0; i < 3; i++) {
      const r = await call("preview", { token: session.get()?.token, exit: { reason, note } });
      if (r.status === 200 || (r.status >= 400 && r.status < 500)) break;      // a 4xx won't change on a retry
      await sleep(800 * (i + 1));
    }
    const link = h("a", { href: selfUrl() }, `${location.host}${selfUrl()}`);
    const thanks = h("p", { class: "rx-well", tabindex: "-1" }, fmt("Thanks — that helps us improve. Your free check stays here if you change your mind: "), link);
    box.replaceChildren(thanks);
    thanks.focus();
  }
}

function freeCheck(v) {
  document.title = "Your free check · Rellony Rescue";
  const officer = officerSection(v.profileGaps);
  const price = pricePanel();
  // a visitor from the website has no letter, so no published scores: no score card or rule
  show(
    h("h1", { class: "rx-h1", tabindex: "-1" }, "Your free check"),
    h("p", { class: "rx-lede" }, v.scores ? "From your published scores and the answers you just gave" : "From the answers you just gave"),
    hairline(),
    h("div", { class: "rx-grid" },
      h("div", { class: "rx-stack" },
        v.scores ? scoreCard(v.scores, v.r10) : null,
        officer,
        answersSection(v.freeGaps),
        scopeSection(v.counts)),
      h("div", { class: "rx-stack rx-aside" }, price)));

  // the phone's bar: from the start, hidden while the price panel (or the footer) is on screen
  const jump = h("a", { class: "btn", href: "#price" }, fmt("Build your full system — £79"));
  const bar = h("div", { class: "rx-sticky", hidden: true }, jump);
  document.body.append(bar);
  stickyBar(bar, { hide: [price] });
}

// ---------------------------------------------------------------- when we can't help
const REFER = {
  G1: { h1: "This needs direct help", text: (c) => `A rating of 0 means urgent improvement is required. That needs direct help from ${c}'s food team or a food safety professional, not a self-help service. Use the contact details in your council's letter. You haven't been charged.` },
  G2: { h1: "This needs direct help", text: (c) => `You told us the council has served a formal notice or asked you to close. Notices have their own deadlines and rights of appeal, so please contact ${c}'s food team or a food safety professional now. You haven't been charged.`, change: true },
  G6: { h1: "This needs direct help", text: (c) => `You told us your letter mentions illness or an allergic reaction. That needs direct help from ${c}'s food team or a food safety professional. You haven't been charged.` },
  G5: { h1: "This pack isn't the right one", text: null, change: true },
  G8: { h1: "Your rating is already 5", text: () => "Your rating is already 5. You don't need this." },
};

function refer(v) {
  const r = REFER[v.gate] ?? REFER.G2;
  const council = v.council || "your council";
  document.title = fmt(`${r.h1} · Rellony Rescue`);
  const message = r.text
    ? h("p", {}, fmt(r.text(council)))
    : h("p", {}, fmt("Rellony Rescue is built on the FSA's pack for caterers. For shops, manufacturers and care settings there are other "),
      em("Safer food, better business"), fmt(" packs — start with your council's food team. You haven't been charged."));
  show(h("div", { class: "rx-narrow" },
    h("h1", { class: "rx-h1", tabindex: "-1" }, fmt(r.h1)),
    hairline(),
    h("section", { class: "rx-card rx-refer" },
      message,
      // only when an answer brought the owner here (business type, formal notice) — never for a rating
      r.change ? h("a", { class: "rx-quiet", href: startUrl(1) }, "Change my answer") : null)));
}

// ---------------------------------------------------------------- load
async function load(retaken = false) {
  const typed = rawCode();
  code = typed ? normaliseCode(typed) : null;
  if (typed && !code) { location.replace(`/r/?c=${encodeURIComponent(typed)}`); return; }
  busy(skeleton());

  // this browser's token for this letter (or this visitor), taking the session back if another
  // device has it
  const held = session.get();
  if (!held || held.code !== code) {
    if (!code) { location.replace(startUrl()); return; }
    const s = await startSession(code);
    if (s.status === 404) { location.replace(`/r/?c=${code}`); return; }
    if (!(s.status === 200 || s.status === 201)) { problem(() => load()); return; }
  }

  const r = await call("preview", { token: session.get()?.token });
  if (r.status === 200 && r.data?.kind === "check") freeCheck(r.data);
  else if (r.status === 200 && r.data?.kind === "refer") refer(r.data);
  else if (r.status === 409 && r.data?.error === "missing") location.replace(startUrl(STEP_OF[r.data.screen] ?? 1));
  else if (r.status === 401 && code && !retaken) { const s = await startSession(code); if (s.status === 200 || s.status === 201) load(true); else problem(() => load()); }
  else if (r.status === 401) location.replace(startUrl());
  else problem(() => load());
}

load();
