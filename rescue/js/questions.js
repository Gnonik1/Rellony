// The question renderer: one question from bank-client.json → a fieldset of answer tiles.
// Questions are never written into the HTML. Nothing is pre-selected: a tile is chosen only from an answer the owner gave before.
// Every required question can be answered truthfully: checklists end with "None of these yet"; a factual list
// with a "none" option, or one the bank marks `none_ok`, ends with "None of these"; a list that may not
// hold the owner's answer has "Something else", which opens a text box (no placeholder: nothing to delete).
import { h } from "./dom.js";
import { fmt, say } from "./text.js";

const CHECK_LINE = "Tick only what's true today. Anything you leave unticked goes into your 4-week plan, with what to do about it — and its box in your SFBB pack stays blank until you've done it.";
// The bank's help on its checklists is an older form of the line above; it isn't shown twice.
const BANK_CHECK_HELP = "Tick only what is true today. Anything you leave unticked goes into your 4-week plan, with what to do about it.";
const ANSWER = "Choose an answer to carry on";
const TICK = "Tick what's true today, or choose None of these yet";
const OTHER = "Tell us in a few words";
const MENU = "Tick the kinds of dishes you cook, or choose None of these";
const HAS = (() => { try { return CSS.supports("selector(:has(*))"); } catch { return false; } })();

let uid = 0;

// One answer a line, full width — except a tiny set such as Yes · No · Not sure, which sits on one
// line as pills (measured: three pills of up to 8 characters fit at 320 px). Pills of longer labels
// stack ragged on a phone.
function layout(options) {
  const pills = options.length <= 3 && options.every((o) => o.label.length <= 8 && !o.hint);
  return pills ? { wrap: "chips", tile: "chip" } : { wrap: "rx-options", tile: "rx-option" };
}

// Columns for a list of rows on a wide screen: three when the labels are short and fill the rows,
// two for labels up to 28 characters (four answers or more), otherwise one.
function columns(options, n) {
  if (options.some((o) => o.hint || o.label.length > 28)) return 0;
  if (n % 3 === 0 && options.every((o) => o.label.length <= 18)) return 3;
  return n >= 4 ? 2 : 0;
}

// One tile: the mark, the label and, under it, the hint (read after a pause by screen readers).
function tile(cls, type, name, value, label, checked, attrs = {}) {
  return h("label", { class: cls, "data-show-if": attrs.showIf || null },
    h("input", { type, name, value, checked: !!checked, "data-none": attrs.none ? "" : null }),
    h("span", { class: "rx-tile__text" },
      say(label),
      attrs.hint ? [h("span", { class: "vh" }, ", "), h("span", { class: "rx-tile__hint" }, say(attrs.hint))] : null));
}

// Whether a saved answer chose v. "Something else" is { value: "other", other } on a choice and
// { values, other } on a multi (the generator's format).
const has = (answer, v) => Array.isArray(answer) ? answer.includes(v)
  : answer && typeof answer === "object" ? answer.value === v || (answer.values || []).includes(v) || (v === "other" && typeof answer.other === "string")
  : answer === v;

// opts (the paid questions): { bank, ctx } — the bank's lists and the owner's answers so far
export function renderQuestion(q, answer, opts = {}) {
  if (STRUCTURED[q.type]) return structured(q, answer, opts);
  const id = `q${++uid}`;
  const help = q.help && !(q.type === "check" && q.help === BANK_CHECK_HELP) ? q.help : null;
  const fs = h("fieldset", { class: "rx-q", id, "data-id": q.id, "data-type": q.type, "data-show-if": q.show_if || null, "data-optional": !!q.optional,
    "aria-describedby": help ? `${id}-help` : null });
  fs.append(h("legend", {}, h("span", { class: "rx-ask", id: `${id}-ask` }, say(q.ask))));
  const body = h("div", { class: "rx-q__body" });
  if (help) body.append(h("p", { class: "rx-help", id: `${id}-help` }, say(help)));

  if (q.type === "choice" || q.type === "multi") {
    const type = q.type === "choice" ? "radio" : "checkbox";
    const multi = type === "checkbox";
    // a factual "None of these" goes last, after a thin rule (multi only)
    const none = multi ? q.options.find((o) => o.v === "none") : null;
    const rest = q.options.filter((o) => o !== none);
    const { wrap, tile: cls } = layout(rest);
    const tileCls = `${cls}${multi && cls === "chip" ? " chip--multi" : ""}`;
    const tiles = rest.map((o) => tile(tileCls, type, id, o.v, o.label, has(answer, o.v), { showIf: o.show_if, hint: o.hint }));
    // "Something else" comes before a choice's own "none" answer (e.g. "Nowhere in particular")
    if (q.other) {
      const otherTile = tile(tileCls, type, id, "other", "Something else", has(answer, "other"));
      const at = multi ? -1 : rest.findIndex((o) => o.v === "none");
      if (at >= 0) tiles.splice(at, 0, otherTile); else tiles.push(otherTile);
    }
    // from 40rem a list of short rows takes two or three columns (never two-and-one)
    const cols = wrap === "rx-options" ? columns(rest, tiles.length) : 0;
    if (none) tiles.push(h("hr", { class: "rx-none-sep" }), tile(tileCls, type, id, "none", none.label, has(answer, "none"), { none: true }));
    // a list where nothing may apply: "None of these" stands for an empty answer
    else if (multi && q.none_ok) tiles.push(h("hr", { class: "rx-none-sep" }), tile(tileCls, type, id, "", "None of these", Array.isArray(answer) && answer.length === 0, { none: true }));
    body.append(h("div", { class: `${wrap}${cols ? ` rx-options--${cols}` : ""}` }, tiles));
    if (q.other) {
      const otherText = answer && typeof answer === "object" ? answer.other ?? "" : "";
      const input = h("input", { type: "text", id: `${id}-other`, maxlength: "200", value: otherText, autocomplete: "off" });
      // typing clears the "Tell us in a few words" error
      input.addEventListener("input", () => { if (input.value.trim()) showError(fs, false); });
      body.append(h("div", { class: "rx-other field", hidden: !has(answer, "other") },
        h("label", { for: `${id}-other` }, "In a few words"), input));
    }
  } else if (q.type === "check") {
    const chosen = Array.isArray(answer) ? answer : null;
    body.append(h("p", { class: "rx-well" }, fmt(CHECK_LINE)));
    body.append(h("div", { class: "rx-options" },
      q.items.map((i) => tile("rx-option", "checkbox", id, i.id, i.label, chosen?.includes(i.id), { showIf: i.show_if })),
      h("hr", { class: "rx-none-sep" }),
      tile("rx-option", "checkbox", id, "", "None of these yet", chosen !== null && chosen.length === 0, { none: true })));
  } else if (q.type === "number") {
    const input = h("input", { type: "number", inputmode: "numeric", min: q.min ?? 0, max: q.max ?? 99, value: answer ?? "",
      placeholder: "–", "aria-labelledby": `${id}-ask` });
    const lo = Number(q.min ?? 0), hi = Number(q.max ?? 99);
    input.addEventListener("change", () => {
      if (input.value !== "") input.value = String(Math.min(hi, Math.max(lo, Math.round(Number(input.value)))));
    });
    const step = (d) => {
      const v = input.value === "" ? (d > 0 ? lo + 1 : lo) : Number(input.value) + d;
      input.value = String(Math.min(hi, Math.max(lo, v)));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    body.append(h("div", { class: "rx-stepper" },
      h("button", { type: "button", "aria-label": "Fewer", onclick: () => step(-1) }, "−"),
      input,
      h("button", { type: "button", "aria-label": "More", onclick: () => step(1) }, "+")));
  } else if (q.type === "text") {
    // no placeholder (nothing in the box to delete): the bank's example is a hint above the box
    const input = h("input", { type: "text", maxlength: String(q.max_len ?? 200), value: answer ?? "", "aria-labelledby": `${id}-ask`,
      "aria-describedby": q.placeholder ? `${id}-eg` : null });
    const box = h("div", { class: "field rx-text" }, q.placeholder ? h("p", { class: "hint", id: `${id}-eg` }, say(q.placeholder)) : null, input);
    // a few usual answers, one tap to fill the box
    if (q.suggest?.length) {
      box.append(h("div", { class: "rx-suggest" }, q.suggest.map((v) => h("button", { type: "button", class: "rx-suggest__b",
        onclick: () => { input.value = v; input.dispatchEvent(new Event("change", { bubbles: true })); input.focus(); } }, say(v)))));
    }
    body.append(box);
  }
  fs.append(body);

  // one "none" pattern; the "other" box follows its tile; a change clears the question's error
  fs.addEventListener("change", (e) => {
    const t = e.target;
    if (t.type === "checkbox") {
      const none = fs.querySelector("input[data-none]");
      if (none && t === none && none.checked) fs.querySelectorAll("input[type=checkbox]").forEach((i) => { if (i !== none) i.checked = false; });
      else if (none && t !== none && t.checked) none.checked = false;
    }
    if (q.other) {
      const box = fs.querySelector(".rx-q__body > .rx-other");
      const was = box.hidden;
      box.hidden = !fs.querySelector('input[value="other"]').checked;
      if (was && !box.hidden && t.value === "other") box.querySelector("input").focus();
    }
    if (!HAS) fs.querySelectorAll("label").forEach((l) => l.classList.toggle("is-on", !!l.querySelector("input:checked")));
    if (t.type !== "text") showError(fs, false);
  });
  if (!HAS) fs.querySelectorAll("label").forEach((l) => l.classList.toggle("is-on", !!l.querySelector("input:checked")));
  return fs;
}

// The "Something else" box when it is open and still empty, or null.
const emptyOther = (fs) => {
  const box = fs.querySelector(".rx-q__body > .rx-other");
  return box && !box.hidden && !box.querySelector("input").value.trim() ? box : null;
};

// The answer a fieldset holds now, in the bank's format, or undefined when unanswered.
// Tiles hidden by show_if don't count.
export function readAnswer(fs) {
  const live = [...fs.querySelectorAll("input")].filter((i) => !i.closest("[hidden]"));
  switch (fs.dataset.type) {
    case "choice": {
      const r = live.find((i) => i.type === "radio" && i.checked);
      if (!r) return undefined;
      if (r.value !== "other") return r.value;
      const text = fs.querySelector(".rx-q__body > .rx-other input")?.value.trim();
      return text ? { value: "other", other: text } : undefined;
    }
    case "multi": {
      const ticked = live.filter((i) => i.type === "checkbox" && i.checked);
      if (ticked.some((i) => i.hasAttribute("data-none") && i.value === "")) return [];      // "None of these" where nothing may apply
      const values = ticked.map((i) => i.value);
      if (!values.includes("other") || !fs.querySelector(".rx-q__body > .rx-other")) return values.length ? values : undefined;
      const text = fs.querySelector(".rx-q__body > .rx-other input").value.trim();
      return text ? { values: values.filter((v) => v !== "other"), other: text } : undefined;
    }
    case "check": {
      const ticked = live.filter((i) => i.checked && !i.hasAttribute("data-none")).map((i) => i.value);
      if (ticked.length) return ticked;
      return fs.querySelector("input[data-none]")?.checked ? [] : undefined;
    }
    case "number": {
      const v = fs.querySelector(".rx-stepper input").value;
      return v === "" ? undefined : Number(v);
    }
    case "text": {
      const v = fs.querySelector(".rx-text input").value.trim();
      return v || undefined;
    }
    default:
      return fs.rx?.read();
  }
}

// Where to send the owner for an unanswered question: the empty "Something else" box, or the first answer.
export function firstField(fs) {
  return emptyOther(fs)?.querySelector("input") || fs.querySelector(".rx-q__body :is(input:not([type=hidden]), textarea, select)") || fs;
}

// Shows or clears a question's error, tied to the question (and to the box it is about) for screen readers.
export function showError(fs, on) {
  const id = `${fs.id}-error`;
  const existing = document.getElementById(id);
  const described = (fs.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== id);
  const otherInput = fs.querySelector(".rx-q__body > .rx-other input");
  if (!on) {
    existing?.remove();
    if (described.length) fs.setAttribute("aria-describedby", described.join(" ")); else fs.removeAttribute("aria-describedby");
    otherInput?.removeAttribute("aria-invalid");
    otherInput?.removeAttribute("aria-describedby");
    return;
  }
  existing?.remove();
  const box = emptyOther(fs);
  const message = typeof on === "string" ? on : box ? OTHER : fs.dataset.type === "check" ? TICK : fs.dataset.type === "menu" ? MENU : ANSWER;
  const error = h("p", { class: "form-error", id }, fmt(message));
  if (box) {
    // GOV.UK's place for it: between the box's label and the box
    box.querySelector("input").before(error);
    otherInput.setAttribute("aria-invalid", "true");
    otherInput.setAttribute("aria-describedby", id);
  } else {
    // under the question and its help, above the answers
    fs.querySelector(".rx-q__body > :is(.rx-options, .chips, .rx-stepper, .rx-text, .rx-struct)").before(error);
  }
  fs.setAttribute("aria-describedby", [...described, id].join(" "));
}

// Questions and answer tiles whose show_if no longer holds are hidden (and don't count).
export function applyVisibility(root, ctx, evalCond) {
  root.querySelectorAll("[data-show-if]").forEach((el) => { el.hidden = !evalCond(el.dataset.showIf, ctx); });
}

// ==========================================================================
// The paid screens' structured answers (bank 1.2.0; formats are the generator's, checked again by the
// server's checkValue). Each fieldset carries fs.rx = { read(), invalid(), sync(ctx) }:
//   read()     the answer in the bank's format, or undefined
//   invalid()  an error to show (a dish name too long, a supplier without a name), or null
//   sync(ctx)  the owner changed an earlier answer on the same screen
// The cleaning schedule, the extra checks and SFBB's own opening and closing checks start from SFBB's
// suggestions (its typical frequencies, its checks): a plan the owner edits, not an answer given for them.
// ==========================================================================
export const FREQ = [["after_use", "After each use"], ["shift", "Every shift"], ["daily", "Daily"], ["weekly", "Weekly"],
  ["fortnightly", "Every 2 weeks"], ["monthly", "Monthly"], ["quarterly", "Every 3 months"]];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GROUPS = { food_contact: "Food-contact surfaces and equipment", touched: "Things people touch often", other: "The rest of the kitchen" };
const STRUCTURED = { list: listQ, schedule: scheduleQ, menu: menuQ, checklist_edit: checksQ, extra_checks: extraQ, suppliers: suppliersQ };

function freqSelect(value, label, attrs = {}) {
  return h("select", { class: "rx-freq", "aria-label": label, ...attrs },
    FREQ.map(([v, l]) => h("option", { value: v, selected: v === value ? true : null }, l)));
}
const ctxHolds = (cond, opts) => !cond || cond === "always" || !opts.evalCond || opts.evalCond(cond, opts.ctx);

function structured(q, answer, opts) {
  const id = `q${++uid}`;
  const fs = h("fieldset", { class: "rx-q rx-q--struct", id, "data-id": q.id, "data-type": q.type, "data-show-if": q.show_if || null,
    "data-optional": !!q.optional, "aria-describedby": q.help ? `${id}-help` : null });
  fs.append(h("legend", {}, h("span", { class: "rx-ask", id: `${id}-ask` }, say(q.ask))));
  const body = h("div", { class: "rx-q__body" });
  if (q.help) body.append(h("p", { class: "rx-help", id: `${id}-help` }, say(q.help)));
  const box = h("div", { class: "rx-struct" });
  body.append(box);
  fs.append(body);
  fs.rx = STRUCTURED[q.type](q, answer, opts, box, id);
  fs.addEventListener("input", () => showError(fs, false));
  fs.addEventListener("change", () => showError(fs, false));
  return fs;
}

// MG4.q9 — dish names for the allergen matrix, one a line (names only: the owner ticks the allergens)
function listQ(q, answer, opts, box, id) {
  const max = q.max_items ?? 80, len = q.max_len ?? 60;
  const area = h("textarea", { id: `${id}-list`, rows: "6", "aria-labelledby": `${id}-ask`, spellcheck: "true" });
  area.value = Array.isArray(answer) ? answer.join("\n") : "";
  box.append(area);
  const lines = () => area.value.split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  return {
    read: () => (lines().length ? lines() : undefined),
    invalid: () => {
      const l = lines();
      if (l.length > max) return `List up to ${max} dishes`;
      const long = l.find((x) => x.length > len);
      return long ? `Keep each dish to ${len} characters — “${long.slice(0, 24)}…” is longer` : null;
    },
    sync() {},
  };
}

// CL4.q1 — the cleaning schedule: SFBB's items for this kitchen, ticked, at their typical frequency;
// untick what you don't have, change how often, add your own (up to 10)
function scheduleQ(q, answer, opts, box, id) {
  const items = (opts.bank?.cleaning_items ?? []).filter((c) => ctxHolds(c.show_if, opts));
  const saved = Array.isArray(answer) ? answer : null;
  const byId = Object.fromEntries((saved ?? []).filter((x) => x.id).map((x) => [x.id, x]));
  const fridgeFreq = () => ({ weekly: "weekly", fortnightly: "fortnightly", monthly: "monthly" })[opts.ctx?.answers?.["CL2.q7"]];
  const rows = [];
  for (const [group, title] of Object.entries(GROUPS)) {
    const mine = items.filter((c) => c.group === group);
    if (!mine.length) continue;
    const list = h("ul", { class: "rx-sched" });
    for (const c of mine) {
      const on = saved ? byId[c.id]?.on ?? !c.optional : !c.optional;
      const freq = byId[c.id]?.freq || (c.id === "fridges" && fridgeFreq()) || c.freq;
      const tick = h("input", { type: "checkbox", id: `${id}-${c.id}`, checked: on });
      const sel = freqSelect(freq, `How often: ${c.item}`, { "data-touched": byId[c.id] ? "" : null });
      sel.addEventListener("change", () => sel.setAttribute("data-touched", ""));
      const row = h("li", { class: "rx-sched__row" }, h("label", { class: "rx-sched__item", for: `${id}-${c.id}` }, tick, h("span", {}, say(c.item))), sel);
      tick.addEventListener("change", () => { sel.disabled = !tick.checked; row.classList.toggle("is-off", !tick.checked); });
      sel.disabled = !on;
      row.classList.toggle("is-off", !on);
      rows.push({ c, tick, sel });
      list.append(row);
    }
    box.append(h("p", { class: "rx-sched__h" }, title), list);
  }
  // the owner's own items
  const own = h("ul", { class: "rx-sched rx-sched--own" });
  const add = h("button", { type: "button", class: "btn btn--secondary rx-add" }, "Add an item");
  const ownRows = [];
  const addRow = (x = {}) => {
    if (ownRows.length >= 10) return;
    const n = ++uid;
    const name = h("input", { type: "text", maxlength: "60", value: x.item ?? "", "aria-label": "Item to clean", id: `own${n}` });
    const sel = freqSelect(x.freq ?? "daily", "How often");
    const dis = h("input", { type: "checkbox", id: `own${n}-d`, checked: x.disinfect ?? true });
    const remove = h("button", { type: "button", class: "linkish rx-remove" }, "Remove", h("span", { class: "vh" }, " this item"));
    const row = h("li", { class: "rx-sched__row rx-sched__row--own" }, name, sel,
      h("label", { class: "rx-sched__dis", for: `own${n}-d` }, dis, h("span", {}, "Disinfect too")), remove);
    const r = { name, sel, dis, row };
    remove.addEventListener("click", () => { ownRows.splice(ownRows.indexOf(r), 1); row.remove(); add.hidden = false; add.focus(); });
    ownRows.push(r);
    own.append(row);
    add.hidden = ownRows.length >= 10;
    return name;
  };
  (saved ?? []).filter((x) => x.custom).forEach((x) => addRow(x));
  add.addEventListener("click", () => addRow()?.focus());
  box.append(h("p", { class: "rx-sched__h" }, "Your own items"), own, add);
  return {
    read: () => [
      ...rows.map(({ c, tick, sel }) => ({ id: c.id, on: tick.checked, freq: sel.value })),
      ...ownRows.filter((r) => r.name.value.trim()).map((r) => ({ custom: true, item: r.name.value.trim(), freq: r.sel.value, disinfect: r.dis.checked })),
    ],
    invalid: () => null,
    // the fridge-cleaning answer above (CL2.q7) sets the fridges' row until the owner changes it
    sync(ctx) {
      const f = ({ weekly: "weekly", fortnightly: "fortnightly", monthly: "monthly" })[ctx?.answers?.["CL2.q7"]];
      const r = rows.find((x) => x.c.id === "fridges");
      if (f && r && !r.sel.hasAttribute("data-touched")) r.sel.value = f;
    },
  };
}

// CK4.q1 — the kinds of cooked dishes on the menu, each with the owner's own examples (optional)
function menuQ(q, answer, opts, box, id) {
  const saved = Array.isArray(answer) ? Object.fromEntries(answer.map((x) => [x.v, x.examples ?? ""])) : null;
  const rows = [];
  const list = h("div", { class: "rx-options" });
  for (const m of opts.bank?.menu_checks ?? []) {
    const tick = h("input", { type: "checkbox", value: m.v, checked: saved ? Object.hasOwn(saved, m.v) : false });
    const eg = h("input", { type: "text", maxlength: "120", value: saved?.[m.v] ?? "", id: `${id}-${m.v}`, "aria-describedby": `${id}-${m.v}-h` });
    const more = h("div", { class: "rx-menu__eg field", hidden: !tick.checked },
      h("label", { for: `${id}-${m.v}` }, "Examples from your menu (optional)"),
      h("p", { class: "hint", id: `${id}-${m.v}-h` }, fmt(`Left empty, your plan says “${m.eg}”`)), eg);
    tick.addEventListener("change", () => { more.hidden = !tick.checked; if (tick.checked) none.checked = false; });
    rows.push({ m, tick, eg });
    list.append(h("div", { class: "rx-menu" }, h("label", { class: "rx-option" }, tick,
      h("span", { class: "rx-tile__text" }, say(m.label), h("span", { class: "vh" }, ", "), h("span", { class: "rx-tile__hint" }, say(m.eg)))), more));
  }
  const none = h("input", { type: "checkbox", value: "", "data-none": "", checked: saved !== null && answer.length === 0 });
  none.addEventListener("change", () => { if (none.checked) rows.forEach((r) => { r.tick.checked = false; r.tick.dispatchEvent(new Event("change")); }); });
  list.append(h("hr", { class: "rx-none-sep" }), h("label", { class: "rx-option" }, none, h("span", { class: "rx-tile__text" }, "None of these")));
  box.append(list);
  return {
    read: () => {
      const chosen = rows.filter((r) => r.tick.checked).map((r) => ({ v: r.m.v, examples: r.eg.value.trim() }));
      return chosen.length ? chosen : none.checked ? [] : undefined;
    },
    invalid: () => null,
    sync() {},
  };
}

// MG1.q1 — SFBB's opening and closing checks (kept), plus the owner's own (up to 8 each)
function checksQ(q, answer, opts, box) {
  const saved = answer && typeof answer === "object" ? answer : {};
  const part = (key, title, defaults) => {
    const own = h("ul", { class: "rx-own" });
    const add = h("button", { type: "button", class: "btn btn--secondary rx-add" }, `Add your own ${title.toLowerCase()} check`);
    const inputs = [];
    const addRow = (v = "") => {
      if (inputs.length >= 8) return null;
      const n = ++uid;
      const input = h("input", { type: "text", maxlength: "80", value: v, id: `chk${n}`, "aria-label": `Your own ${title.toLowerCase()} check` });
      const remove = h("button", { type: "button", class: "linkish rx-remove" }, "Remove", h("span", { class: "vh" }, " this check"));
      const li = h("li", {}, input, remove);
      remove.addEventListener("click", () => { inputs.splice(inputs.indexOf(input), 1); li.remove(); add.hidden = false; add.focus(); });
      inputs.push(input);
      own.append(li);
      add.hidden = inputs.length >= 8;
      return input;
    };
    (saved[key] ?? []).forEach((v) => addRow(v));
    add.addEventListener("click", () => addRow()?.focus());
    box.append(h("div", { class: "rx-checks" },
      h("p", { class: "rx-sched__h" }, `${title} checks in SFBB`),
      h("ul", { class: "rx-checks__sfbb" }, (defaults ?? []).map((t) => h("li", {}, say(t)))),
      own, add));
    return () => inputs.map((i) => i.value.replace(/\s+/g, " ").trim()).filter(Boolean);
  };
  const opening = part("opening_add", "Opening", q.defaults?.opening);
  const closing = part("closing_add", "Closing", q.defaults?.closing);
  return { read: () => ({ opening_add: opening(), closing_add: closing() }), invalid: () => null, sync() {} };
}

// MG2.q1 — the extra checks in SFBB's diary, at its suggested frequency
function extraQ(q, answer, opts, box, id) {
  const saved = answer && typeof answer === "object" ? answer : {};
  const rows = (q.items ?? []).filter((i) => ctxHolds(i.show_if, opts)).map((i) => {
    const sel = freqSelect(saved[i.id] ?? i.default, `How often: ${i.what}`, { id: `${id}-${i.id}` });
    box.append(h("div", { class: "rx-extra" },
      h("div", {}, h("label", { class: "rx-extra__what", for: `${id}-${i.id}` }, say(i.what)), h("p", { class: "rx-extra__detail" }, say(i.detail))), sel));
    return { i, sel };
  });
  return { read: () => Object.fromEntries(rows.map((r) => [r.i.id, r.sel.value])), invalid: () => null, sync() {} };
}

// MG7.q2 — the main suppliers: business names, what they supply, delivery days (optional, up to 12)
function suppliersQ(q, answer, opts, box) {
  const list = h("ul", { class: "rx-suppliers" });
  const add = h("button", { type: "button", class: "btn btn--secondary rx-add" }, "Add a supplier");
  const rows = [];
  const addRow = (x = {}) => {
    if (rows.length >= 12) return null;
    const n = ++uid;
    const name = h("input", { type: "text", maxlength: "60", value: x.name ?? "", id: `sup${n}`, autocomplete: "off" });
    const goods = h("input", { type: "text", maxlength: "60", value: x.goods ?? "", id: `sup${n}-g`, autocomplete: "off" });
    const days = DAYS.map((d) => h("label", { class: "rx-day" }, h("input", { type: "checkbox", value: d, checked: (x.days ?? []).includes(d) }), h("span", {}, d)));
    const remove = h("button", { type: "button", class: "linkish rx-remove" }, "Remove", h("span", { class: "vh" }, " this supplier"));
    const li = h("li", { class: "rx-supplier" },
      h("div", { class: "field" }, h("label", { for: `sup${n}` }, "Business name"), name),
      h("div", { class: "field" }, h("label", { for: `sup${n}-g` }, "What they supply (optional)"), goods),
      h("fieldset", { class: "rx-days" }, h("legend", {}, "Delivery days (optional)"), days),
      remove);
    const r = { name, goods, days, li };
    remove.addEventListener("click", () => { rows.splice(rows.indexOf(r), 1); li.remove(); add.hidden = false; add.focus(); });
    rows.push(r);
    list.append(li);
    add.hidden = rows.length >= 12;
    return name;
  };
  (Array.isArray(answer) ? answer : []).forEach((x) => addRow(x));
  add.addEventListener("click", () => addRow()?.focus());
  box.append(list, add);
  const filled = (r) => r.name.value.trim() || r.goods.value.trim() || r.days.some((d) => d.querySelector("input").checked);
  return {
    read: () => {
      const out = rows.filter((r) => r.name.value.trim()).map((r) => ({ name: r.name.value.trim(), goods: r.goods.value.trim(),
        days: r.days.map((d) => d.querySelector("input")).filter((i) => i.checked).map((i) => i.value) }));
      return out.length ? out : undefined;
    },
    invalid: () => (rows.some((r) => filled(r) && !r.name.value.trim()) ? "Add the supplier's business name, or remove the row" : null),
    sync() {},
  };
}
