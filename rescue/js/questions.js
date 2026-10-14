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

export function renderQuestion(q, answer) {
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
    body.append(h("div", { class: "field rx-text" },
      h("input", { type: "text", maxlength: String(q.max_len ?? 200), value: answer ?? "", placeholder: q.placeholder || null, "aria-labelledby": `${id}-ask` })));
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
      return undefined;
  }
}

// Where to send the owner for an unanswered question: the empty "Something else" box, or the first answer.
export function firstField(fs) {
  return emptyOther(fs)?.querySelector("input") || fs.querySelector(".rx-q__body input:not([type=hidden])") || fs;
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
  const error = h("p", { class: "form-error", id }, fmt(box ? OTHER : fs.dataset.type === "check" ? TICK : ANSWER));
  if (box) {
    // GOV.UK's place for it: between the box's label and the box
    box.querySelector("input").before(error);
    otherInput.setAttribute("aria-invalid", "true");
    otherInput.setAttribute("aria-describedby", id);
  } else {
    // under the question and its help, above the answers
    fs.querySelector(".rx-q__body > :is(.rx-options, .chips, .rx-stepper, .rx-text)").before(error);
  }
  fs.setAttribute("aria-describedby", [...described, id].join(" "));
}

// Questions and answer tiles whose show_if no longer holds are hidden (and don't count).
export function applyVisibility(root, ctx, evalCond) {
  root.querySelectorAll("[data-show-if]").forEach((el) => { el.hidden = !evalCond(el.dataset.showIf, ctx); });
}
