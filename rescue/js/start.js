// /rescue/start/ — the free questions: F1 in three short steps, then F2.
//   /rescue/start/?c=CODE#n   step n (1–4) for that letter's session; no code: a website visitor
// Each step saves on Continue. The owner moves on at once; a save that fails is retried in the
// background, with a quiet "Not saved yet" until it goes through. Nothing is pre-selected: a tile is
// chosen only from an answer the owner saved before.
import { call, normaliseCode, rawCode, session, sleep, startSession } from "./api.js";
import { busy, problem, show } from "./cards.js";
import { h, skeleton, toast } from "./dom.js";
import { applyVisibility, readAnswer, renderQuestion, renumber, showError } from "./questions.js";
import { fmt, phrases, say } from "./text.js";

const PROGRESS = ["Your business", "What you cook", "Team and records", "Hygiene", "Free check"];
const STEPS = [
  { screen: "F1.1", title: "Your business", sub: "Two quick checks first", lead: "About 3 minutes to your free check · no payment, no account", ids: ["p.type", "p.formal"] },
  { screen: "F1.2", title: "What you cook and serve", sub: "So we only ask what applies to your kitchen", ids: ["p.food", "p.proc", "p.svc"] },
  { screen: "F1.3", title: "Your team, equipment and records", sub: "A few counts, and what you keep today", ids: ["p.staff", "p.equip", "p.fridges", "p.freezers", "p.system", "p.records"] },
  { screen: "F2", title: "Personal hygiene and handwashing", sub: "The basics officers check first" },
];
const NOT_SAVED = "Not saved yet — check your connection, we'll keep trying";

let code = null;          // the letter's code, or null for a website visitor
let bank = null;          // bank-client.json
let state = null;         // { profile, answers } as saved (kept up to date as the owner goes)
let evalCond = null;      // the generator's, loaded only for a screen that has conditions

const previewUrl = () => (code ? `/rescue/preview/?c=${code}` : "/rescue/preview/");

// ---------------------------------------------------------------- the bank's questions for a step
function questionsOf(step) {
  const s = STEPS[step - 1];
  if (s.ids) return [{ title: null, questions: s.ids.map((id) => bank.profile.find((q) => q.id === id)) }];
  const methods = bank.screens.find((x) => x.id === "F2").methods;
  return bank.methods.filter((m) => methods.includes(m.id)).map((m) => ({ title: m.title, applies: m.applies, questions: m.questions }));
}
const into = (step) => (STEPS[step - 1].ids ? "profile" : "answers");

const ctx = (extra = {}) => ({ profile: { ...state.profile, ...(extra.profile || {}) }, answers: { ...state.answers, ...(extra.answers || {}) } });
const holds = (cond, c) => !cond || cond === "always" || (evalCond ? evalCond(cond, c) : true);

// A step is complete when every question on it that can be seen has a saved answer.
function complete(step) {
  const held = state[into(step)];
  const c = ctx();
  return questionsOf(step).every((g) => !holds(g.applies, c) ||
    g.questions.every((q) => !holds(q.show_if, c) || q.optional || held[q.id] !== undefined));
}
const firstIncomplete = () => [1, 2, 3, 4].find((n) => !complete(n)) ?? null;
const hasConditions = () => [1, 2, 3, 4].some((n) => questionsOf(n).some((g) => (g.applies && g.applies !== "always") ||
  g.questions.some((q) => q.show_if || (q.items || q.options || []).some((x) => x.show_if))));

// ---------------------------------------------------------------- saving
// Latest answers per screen, waiting to be saved; one save at a time, in order.
const queue = new Map();
let flushing = null;

function save(screen, answers) {
  queue.set(screen, answers);
  return flush();
}

function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let wait = 1000;
    let retaken = 0;
    while (queue.size) {
      const [screen, answers] = queue.entries().next().value;
      const r = await call("save-answers", { token: session.get()?.token, screen, bankVersion: bank.version, answers });
      if (r.status === 200) {
        if (queue.get(screen) === answers) queue.delete(screen);
        try { sessionStorage.removeItem("rx.reloaded"); } catch { /* no storage */ }
        toast(null);
        wait = 1000;
        continue;
      }
      if (r.status === 401 && code && retaken < 2) {
        // another device took over this letter's session: take it back, then save again
        retaken++;
        const again = await startSession(code);
        if (again.status === 200 || again.status === 201) continue;
      } else if (r.status === 401 && code) {
        queue.clear();
        toast(null);
        problem(() => location.reload());
        return false;
      } else if (r.status === 401) {
        queue.clear();
        toast(null);
        expired();
        return false;
      } else if (r.status === 409) {
        // the questions changed since this page loaded: load them again (once)
        queue.clear();
        toast(null);
        reloadOnce();
        return false;
      } else if (r.status === 400) {
        queue.clear();
        toast(null);
        problem(() => location.reload());
        return false;
      }
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
  try { tried = sessionStorage.getItem("rx.reloaded") === "1"; sessionStorage.setItem("rx.reloaded", "1"); } catch { /* no storage */ }
  if (tried) problem(() => location.reload());
  else location.reload();
}

addEventListener("beforeunload", (e) => {
  if (queue.size) { e.preventDefault(); e.returnValue = ""; }
});

// ---------------------------------------------------------------- one step
function renderStep(step, { focus = true } = {}) {
  const s = STEPS[step - 1];
  const groups = questionsOf(step);
  const held = state[into(step)];
  const c = ctx();
  const fields = [];
  for (const g of groups) {
    if (!holds(g.applies, c)) continue;
    if (g.title) fields.push(h("h2", { class: "rx-method" }, say(g.title)));
    for (const q of g.questions) fields.push(renderQuestion(q, held[q.id]));
  }

  const submit = h("button", { type: "submit", class: "btn" }, step === 4 ? "See your free check" : "Continue");
  const form = h("form", { class: "panel rx-form", novalidate: true },
    fields,
    h("div", { class: "rx-form__foot" }, submit, step > 1 ? h("a", { class: "backlink", href: `#${step - 1}` }, "Back") : null));

  const title = h("h1", { class: "rx-h1", tabindex: "-1" }, h("span", { class: "vh" }, `Step ${step} of 5: `), fmt(s.title));
  document.title = fmt(`${s.title} · Rellony Rescue`);
  show(h("div", { class: "rx-flow rx-screen" },
    h("ol", { class: "rx-progress", "aria-label": "Your free check" },
      PROGRESS.map((p, i) => h("li", { class: i < step - 1 ? "is-done" : null, "aria-current": i === step - 1 ? "step" : null }, h("span", {}, fmt(p))))),
    h("header", { class: "rx-screen-head" },
      h("p", { class: "rx-stepcount", "aria-hidden": "true" }, `Step ${step} of 5`),
      title,
      h("p", { class: "rx-lede" }, fmt(s.sub)),
      s.lead ? h("p", { class: "rx-start-note" }, phrases(s.lead)) : null),
    form));

  // F1's questions number 01–11 across its three steps; F2's from 01
  const first = s.ids ? bank.profile.findIndex((q) => q.id === s.ids[0]) + 1 : 1;
  const refresh = () => {
    if (evalCond) applyVisibility(form, ctx({ [into(step)]: collect(form).answers }), evalCond);
    renumber(form, first);
  };
  refresh();
  form.addEventListener("change", refresh);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submit.getAttribute("aria-busy") === "true") return;
    const { answers, missing } = collect(form);
    form.querySelectorAll("fieldset.rx-q").forEach((fs) => showError(fs, missing.includes(fs)));
    if (missing.length) {
      const fs = missing[0];
      (fs.querySelector(".rx-q__body input:not([type=hidden])") || fs).focus();
      fs.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    const changed = Object.keys(answers).some((id) => JSON.stringify(answers[id]) !== JSON.stringify(held[id])) ||
      Object.keys(held).some((id) => form.querySelector(`fieldset[data-id="${CSS.escape(id)}"]`) && answers[id] === undefined);
    // what the owner sees from now on is what they answered, saved or not yet
    const ids = new Set([...form.querySelectorAll("fieldset.rx-q")].map((fs) => fs.dataset.id));
    state[into(step)] = { ...Object.fromEntries(Object.entries(held).filter(([id]) => !ids.has(id))), ...answers };
    // unchanged answers aren't sent again (a save still waiting in the queue goes on trying)
    const saving = changed ? save(s.screen, answers) : Promise.resolve(true);

    // a business we can't help, or a formal notice: straight to the screen that says so
    const gate = step === 1 && (scopeOf("p.type", answers["p.type"]) === "out" || scopeOf("p.formal", answers["p.formal"]) === "refer");
    if (step === 4 || gate) {
      submit.setAttribute("aria-busy", "true");
      const ok = (await saving) && (await flush());
      submit.removeAttribute("aria-busy");
      if (ok) location.assign(previewUrl());
      return;
    }
    location.hash = `#${step + 1}`;
  });

  if (focus) {
    scrollTo(0, 0);
    title.focus({ preventScroll: true });
  }
}

const scopeOf = (id, v) => bank.profile.find((q) => q.id === id)?.options?.find((o) => o.v === v)?.scope;

// The answers on a step, and the questions that still need one.
function collect(form) {
  const answers = {};
  const missing = [];
  form.querySelectorAll("fieldset.rx-q").forEach((fs) => {
    if (fs.hidden) return;
    const v = readAnswer(fs);
    if (v !== undefined) answers[fs.dataset.id] = v;
    else if (!fs.hasAttribute("data-optional")) missing.push(fs);
  });
  return { answers, missing };
}

// ---------------------------------------------------------------- which step to show
function stepFromHash() {
  const n = Number(location.hash.slice(1));
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

function route({ initial = false } = {}) {
  const asked = stepFromHash();
  const open = firstIncomplete();
  if (initial && !asked && open === null) { location.replace(previewUrl()); return; }
  // never past the first step that still needs answers
  const step = Math.min(asked ?? open ?? 4, open ?? 4);
  if (step !== asked) history.replaceState(null, "", `#${step}`);
  renderStep(step, { focus: !initial });
}

// ---------------------------------------------------------------- an old website session
function expired() {
  problem(() => { session.clear(); history.replaceState(null, "", location.pathname + location.search); load(); },
    "These answers are no longer saved — unpaid answers are deleted after 30 days", "Start again");
}

// ---------------------------------------------------------------- load
async function loadBank() {
  try {
    const res = await fetch("/rescue/js/bank-client.json", { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function load() {
  const typed = rawCode();
  code = typed ? normaliseCode(typed) : null;
  if (typed && !code) { location.replace(`/r/?c=${encodeURIComponent(typed)}`); return; }
  busy(skeleton());
  const [r, b] = await Promise.all([startSession(code), bank ?? loadBank()]);
  if (r.status === 404) { location.replace(`/r/?c=${code}`); return; }
  if (r.status === 410) { expired(); return; }
  if (!(r.status === 200 || r.status === 201) || !b) { problem(load); return; }
  bank = b;
  state = { profile: r.data.profile || {}, answers: r.data.answers || {} };
  if (!evalCond && hasConditions()) {
    try { ({ evalCond } = await import("./rescue-generator.mjs")); } catch { problem(load); return; }
  }
  route({ initial: true });
}

addEventListener("hashchange", () => { if (state) route(); });
load();
