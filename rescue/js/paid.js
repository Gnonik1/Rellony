// /rescue/q/ — the paid questions (brief §0g D5), opened by the order's private link (kept in this
// browser by api.js orderLink; the emailed link opens /p/, which comes here while they're unfinished).
//   #P1 … #P10   the screens that apply to this kitchen, in the bank's order
//   #check       "Check your answers", with Change links, then "Make my plan"
//   #F1.2 #F1.3 #F2   the free answers, still correctable here (never step 1: it decided we could help)
// Each screen saves on Continue; the owner moves on at once, and a save that fails is retried in the
// background ("Not saved yet"), as on the free questions.
import { call, orderLink, sleep } from "./api.js";
import { busy, problem, show } from "./cards.js";
import { h, skeleton, toast } from "./dom.js";
import { applyVisibility, FREQ, firstField, readAnswer, renderQuestion, showError } from "./questions.js";
import { fmt, say } from "./text.js";

// page copy v0.7 §4: the screens' own titles and intros win over the bank's titles
const INTRO = {
  P1: ["Cloths, clear and clean as you go", "Cloths are one of the top causes of cross-contamination"],
  P2: ["Raw and ready-to-eat", "Keeping them apart stops bacteria spreading"],
  P3: ["Allergens", "The legal requirements and your routine for allergy orders"],
  P4: ["Cleaning", "Your two-stage clean and your cleaning schedule"],
  P5: ["Fridges and freezers", "8°C or below by law; set at 5°C or below"],
  P6: ["Cooking, cooling, reheating, hot holding", "How you show food is safe"],
  P7: ["Foods that need extra care", "Rice, eggs, shellfish, fish and acrylamide"],
  P8: ["Pests, premises and equipment", "Including anything that needs repair"],
  P9: ["Daily checks, records and training", "What shows your system is used every day"],
  P10: ["Suppliers, stock, complaints and recalls", "Last one"],
  "F1.2": ["What you cook and serve", "Your free answers — change anything that isn't right"],
  "F1.3": ["Your team, equipment and records", "Your free answers — change anything that isn't right"],
  F2: ["Personal hygiene and handwashing", "Your free answers — change anything that isn't right"],
};
const F_IDS = { "F1.2": ["p.food", "p.proc", "p.svc"], "F1.3": ["p.staff", "p.equip", "p.fridges", "p.freezers", "p.system", "p.records"] };
const NOT_SAVED = "Not saved yet — check your connection, we'll keep trying";

let link = null;
let bank = null;
let state = null;            // { profile, answers, order: { ref, businessName, email }, screens }
let evalCond = null;

// ---------------------------------------------------------------- the bank's questions for a screen
function groupsOf(screen) {
  if (F_IDS[screen]) return [{ title: null, questions: F_IDS[screen].map((id) => bank.profile.find((q) => q.id === id)) }];
  const methods = bank.screens.find((s) => s.id === screen)?.methods ?? [];
  return bank.methods.filter((m) => methods.includes(m.id)).map((m) => ({ title: m.title, applies: m.applies, questions: m.questions }));
}
const into = (screen) => (F_IDS[screen] ? "profile" : "answers");
const ctx = (extra = {}) => ({ profile: { ...state.profile, ...(extra.profile || {}) }, answers: { ...state.answers, ...(extra.answers || {}) } });
const holds = (cond, c) => !cond || cond === "always" || evalCond(cond, c);
const applies = (screen) => groupsOf(screen).some((g) => holds(g.applies, ctx()));
const steps = () => state.screens.filter(applies);

function complete(screen) {
  const held = state[into(screen)];
  const c = ctx();
  return groupsOf(screen).every((g) => !holds(g.applies, c) ||
    g.questions.every((q) => !holds(q.show_if, c) || q.optional || held[q.id] !== undefined));
}
const firstIncomplete = () => steps().find((s) => !complete(s)) ?? null;

// ---------------------------------------------------------------- saving (one at a time, in order)
const queue = new Map();
let flushing = null;
function save(screen, answers) { queue.set(screen, answers); return flush(); }
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let wait = 1000;
    while (queue.size) {
      const [screen, answers] = queue.entries().next().value;
      const r = await call("order", { link, action: "save", screen, bankVersion: bank.version, answers });
      if (r.status === 200) {
        if (queue.get(screen) === answers) queue.delete(screen);
        toast(null);
        wait = 1000;
        continue;
      }
      if (r.status === 404) { queue.clear(); toast(null); linkLost(); return false; }
      if (r.status === 409 && r.data?.error === "locked") { queue.clear(); toast(null); location.replace("/p/"); return false; }
      if (r.status === 409) { queue.clear(); toast(null); reloadOnce(); return false; }
      if (r.status === 400) { queue.clear(); toast(null); problem(() => location.reload()); return false; }
      toast(fmt(NOT_SAVED));
      await sleep(wait);
      wait = Math.min(wait * 2, 15000);
    }
    return true;
  })().finally(() => { flushing = null; });
  return flushing;
}
function reloadOnce() {
  let tried = false;
  try { tried = sessionStorage.getItem("rx.q.reloaded") === "1"; sessionStorage.setItem("rx.q.reloaded", "1"); } catch { /* no storage */ }
  if (tried) problem(() => location.reload()); else location.reload();
}
addEventListener("beforeunload", (e) => { if (queue.size) { e.preventDefault(); e.returnValue = ""; } });

function linkLost() {
  orderLink.clear();
  location.replace("/p/");
}

// ---------------------------------------------------------------- one screen
function collect(form) {
  const answers = {};
  const missing = [];
  form.querySelectorAll("fieldset.rx-q").forEach((fs) => {
    if (fs.hidden) return;
    const bad = fs.rx?.invalid();
    if (bad) { missing.push([fs, bad]); return; }
    const v = readAnswer(fs);
    if (v !== undefined) answers[fs.dataset.id] = v;
    else if (!fs.hasAttribute("data-optional")) missing.push([fs, true]);
  });
  return { answers, missing };
}

function progress(screen) {
  const list = steps();
  const at = screen === "check" ? list.length : list.indexOf(screen);
  if (at < 0) return { bar: null, label: "Your free answers" };
  const total = list.length + 1;
  return {
    label: `Step ${at + 1} of ${total}`,
    bar: h("ol", { class: "rx-progress rx-progress--paid", "aria-label": "Your full system", vars: { "--n": total } },
      [...list, "check"].map((s, i) => h("li", { class: i < at ? "is-done" : null, "aria-current": i === at ? "step" : null },
        h("span", {}, s === "check" ? "Check your answers" : fmt(INTRO[s][0]))))),
  };
}

function renderScreen(screen, { focus = true } = {}) {
  const [title, sub] = INTRO[screen];
  const held = state[into(screen)];
  const c = ctx();
  const fields = [];
  for (const g of groupsOf(screen)) {
    if (!holds(g.applies, c)) continue;
    if (g.title) fields.push(h("h2", { class: "rx-method" }, say(g.title)));
    for (const q of g.questions) fields.push(renderQuestion(q, held[q.id], { bank, ctx: c, evalCond }));
  }
  const list = steps();
  const correcting = !!F_IDS[screen] || screen === "F2";
  const next = correcting ? "check" : list[list.indexOf(screen) + 1] ?? "check";
  const back = correcting ? "check" : list[list.indexOf(screen) - 1] ?? null;
  const submit = h("button", { type: "submit", class: "btn" }, correcting ? "Save and go back" : next === "check" ? "Check your answers" : "Continue");
  const form = h("form", { class: "panel rx-form", novalidate: true },
    fields,
    h("div", { class: "rx-form__foot" }, submit, back ? h("a", { class: "backlink", href: `#${back}` }, back === "check" ? "Back to your answers" : "Back") : null));
  const { bar, label } = progress(screen);
  const h1 = h("h1", { class: "rx-h1", tabindex: "-1" }, h("span", { class: "vh" }, `${label}: `), fmt(title));
  document.title = fmt(`${title} · Rellony Rescue`);
  show(h("div", { class: "rx-flow rx-screen" },
    bar,
    h("header", { class: "rx-screen-head" },
      h("p", { class: "rx-stepcount", "aria-hidden": "true" }, label),
      h1,
      h("p", { class: "rx-lede" }, fmt(sub))),
    form,
    h("p", { class: "rx-fine rx-q-note" }, fmt("Your answers save as you go — the private link we emailed you opens them on any device"))));

  const refresh = () => {
    const now = ctx({ [into(screen)]: collect(form).answers });
    applyVisibility(form, now, evalCond);
    form.querySelectorAll("fieldset.rx-q").forEach((fs) => fs.rx?.sync(now));
  };
  refresh();
  form.addEventListener("change", refresh);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const { answers, missing } = collect(form);
    form.querySelectorAll("fieldset.rx-q").forEach((fs) => showError(fs, missing.find(([m]) => m === fs)?.[1] ?? false));
    if (missing.length) {
      const fs = missing[0][0];
      firstField(fs).focus({ preventScroll: true });
      fs.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    const ids = new Set([...form.querySelectorAll("fieldset.rx-q")].map((fs) => fs.dataset.id));
    const changed = JSON.stringify(answers) !== JSON.stringify(Object.fromEntries(Object.entries(held).filter(([id]) => ids.has(id))));
    state[into(screen)] = { ...Object.fromEntries(Object.entries(held).filter(([id]) => !ids.has(id))), ...answers };
    if (changed || !savedOnce.has(screen)) { savedOnce.add(screen); save(screen, answers); }
    location.hash = `#${next}`;
  });

  if (focus) { scrollTo(0, 0); h1.focus({ preventScroll: true }); }
}
// a screen whose answers came back unchanged is still saved once (its structured answers start from
// SFBB's suggestions, which count only once the owner has pressed Continue on them)
const savedOnce = new Set();

// ---------------------------------------------------------------- check your answers
const labelOf = (q, v) => say(q.options?.find((o) => o.v === v)?.label ?? v);
function summary(q, a) {
  if (a === undefined) return q.optional ? "Not answered" : null;
  switch (q.type) {
    case "choice": return a && typeof a === "object" ? say(a.other) : labelOf(q, a);
    case "multi": {
      const vals = Array.isArray(a) ? a : a.values || [];
      const parts = vals.filter((v) => v !== "none").map((v) => labelOf(q, v));
      if (!Array.isArray(a) && a.other) parts.push(say(a.other));
      return parts.length ? parts.join(", ") : vals.includes("none") ? labelOf(q, "none") : "None of these";
    }
    case "check": {
      const shown = (q.items || []).filter((i) => holds(i.show_if, ctx())).length;
      return a.length ? `${a.length} of ${shown} true today` : "None of these yet";
    }
    case "number": return String(a);
    case "text": return say(a);
    case "list": return `${a.length} ${a.length === 1 ? "dish" : "dishes"}`;
    case "schedule": {
      const on = a.filter((x) => !x.custom && x.on).length, own = a.filter((x) => x.custom).length;
      return `${on} items${own ? `, and ${own} of your own` : ""}`;
    }
    case "menu": return a.length ? a.map((x) => say(bank.menu_checks.find((m) => m.v === x.v)?.label ?? x.v)).join(", ") : "None of these";
    case "checklist_edit": {
      const n = (a.opening_add?.length ?? 0) + (a.closing_add?.length ?? 0);
      return n ? `SFBB's checks, and ${n} of your own` : "SFBB's checks";
    }
    case "extra_checks": return Object.entries(a).map(([id, f]) => `${say(q.items.find((i) => i.id === id)?.what ?? id)}: ${FREQ.find(([v]) => v === f)?.[1].toLowerCase() ?? f}`).join(" · ");
    case "suppliers": return a.map((s) => s.name).join(", ");
    default: return "";
  }
}

function renderCheck({ focus = true } = {}) {
  const c = ctx();
  const sections = ["F1.2", "F1.3", "F2", ...steps()].map((screen) => {
    const held = state[into(screen)];
    const rows = [];
    for (const g of groupsOf(screen)) {
      if (!holds(g.applies, c)) continue;
      for (const q of g.questions) {
        if (!holds(q.show_if, c)) continue;
        const v = summary(q, held[q.id]);
        rows.push(h("div", { class: "rx-sum__row" }, h("dt", {}, say(q.ask)), h("dd", { class: v === null ? "is-missing" : null }, fmt(v ?? "Not answered yet"))));
      }
    }
    return h("section", { class: "rx-card rx-sum", "aria-labelledby": `sum-${screen}` },
      h("div", { class: "rx-sum__head" },
        h("h2", { id: `sum-${screen}` }, fmt(INTRO[screen][0])),
        h("a", { href: `#${screen}`, class: "rx-sum__change" }, "Change", h("span", { class: "vh" }, ` ${INTRO[screen][0]}`))),
      h("dl", {}, rows));
  });
  const make = h("button", { type: "button", class: "btn", id: "make" }, "Make my plan");
  const status = h("div", { role: "status", "aria-live": "polite" });
  make.addEventListener("click", () => finish(make, status));
  const { bar, label } = progress("check");
  const h1 = h("h1", { class: "rx-h1", tabindex: "-1" }, h("span", { class: "vh" }, `${label}: `), "Check your answers");
  document.title = "Check your answers · Rellony Rescue";
  show(h("div", { class: "rx-flow rx-screen" },
    bar,
    h("header", { class: "rx-screen-head" },
      h("p", { class: "rx-stepcount", "aria-hidden": "true" }, label),
      h1,
      h("p", { class: "rx-lede" }, fmt("Your SFBB pack is filled in and your plan is made from these answers. Change anything that isn't right, then make your plan."))),
    h("div", { class: "rx-stack" }, sections),
    h("div", { class: "panel rx-make" }, make, status)));
  if (focus) { scrollTo(0, 0); h1.focus({ preventScroll: true }); }
}

async function finish(button, status) {
  if (button.getAttribute("aria-busy") === "true") return;
  button.setAttribute("aria-busy", "true");
  status.replaceChildren(h("p", { class: "rx-well rx-wait" }, fmt("Done — your plan is being made")));
  const saved = await flush();
  if (!saved) return;
  let r = null;
  for (let i = 0; i < 3; i++) {
    r = await call("order", { link, action: "finish" }, 30000);
    if (r.status === 200 || (r.status >= 400 && r.status < 500)) break;
    await sleep(1500 * (i + 1));
  }
  button.removeAttribute("aria-busy");
  if (r.status === 200) { location.replace("/p/"); return; }
  if (r.status === 409 && r.data?.error === "missing" && r.data.screen) { location.hash = `#${r.data.screen}`; return; }
  if (r.status === 409) { location.replace("/p/"); return; }
  if (r.status === 404) { linkLost(); return; }
  status.replaceChildren(h("p", { class: "form-error" }, fmt("We couldn't make your plan just now — your answers are saved. Try again in a minute.")));
}

// ---------------------------------------------------------------- which screen
function route({ initial = false } = {}) {
  const asked = decodeURIComponent(location.hash.slice(1));
  const open = firstIncomplete();
  const known = asked === "check" || INTRO[asked];
  let screen = known ? asked : open ?? "check";
  // never past the first paid screen that still needs answers (corrections are always open)
  const list = steps();
  if (open && (screen === "check" || (list.includes(screen) && list.indexOf(screen) > list.indexOf(open)))) screen = open;
  if (INTRO[screen] && !F_IDS[screen] && screen !== "F2" && !list.includes(screen)) screen = open ?? "check";
  if (screen !== asked) history.replaceState(null, "", `#${screen}`);
  if (screen === "check") renderCheck({ focus: !initial }); else renderScreen(screen, { focus: !initial });
}

async function loadBank() {
  try { const r = await fetch("/rescue/js/bank-client.json", { cache: "no-cache" }); return r.ok ? await r.json() : null; } catch { return null; }
}

async function load() {
  link = orderLink.fromAddress() || orderLink.get();
  if (!link) { location.replace("/p/"); return; }
  busy(skeleton());
  const [r, b] = await Promise.all([call("order", { link, action: "state" }), bank ?? loadBank()]);
  if (r.status === 404) { linkLost(); return; }
  if (r.status !== 200 || !b) { problem(load); return; }
  if (r.data.status !== "open") { location.replace("/p/"); return; }
  if (r.data.bankVersion !== b.version) { reloadOnce(); return; }
  try { sessionStorage.removeItem("rx.q.reloaded"); } catch { /* no storage */ }
  bank = b;
  state = { profile: r.data.profile || {}, answers: r.data.answers || {}, screens: r.data.screens };
  if (!evalCond) {
    try { ({ evalCond } = await import("./rescue-generator.mjs")); } catch { problem(load); return; }
  }
  route({ initial: true });
}

addEventListener("hashchange", () => { if (state) route(); });
load();
