// The question renderer: one question from bank-client.json → a fieldset of answer tiles.
// Questions are never written into the HTML. Nothing is pre-selected: a tile is chosen only from an answer the owner gave before.
import { h } from "./dom.js";
import { fmt, say } from "./text.js";

const CHECK_LINE = "Tick only what's true today. Anything you leave unticked goes into your 4-week plan, with what to do about it — and its box in your SFBB pack stays blank until you've done it.";
// The bank's help on its checklists is an older form of the line above; it isn't shown twice.
const BANK_CHECK_HELP = "Tick only what is true today. Anything you leave unticked goes into your 4-week plan, with what to do about it.";
const ANSWER = "Choose an answer to carry on";
const TICK = "Tick what's true today, or choose None of these yet";
const HAS = (() => { try { return CSS.supports("selector(:has(*))"); } catch { return false; } })();

let uid = 0;

// Short answers sit two to a row (three from 40rem when there are only three short ones); longer
// ones get a full-width row each.
function layout(options) {
  const short = options.every((o) => o.label.length <= 28) && options.length <= 14;
  if (!short) return { wrap: "rx-options", tile: "rx-option" };
  const three = options.length <= 3 && options.every((o) => o.label.length <= 10);
  return { wrap: `chips${three ? " chips--3" : ""}`, tile: "chip" };
}

function tile(cls, type, name, value, label, checked, attrs = {}) {
  return h("label", { class: cls, "data-show-if": attrs.showIf || null },
    h("input", { type, name, value, checked: !!checked, "data-none": attrs.none ? "" : null }),
    h("span", {}, say(label)));
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
  fs.append(h("legend", {}, h("span", { class: "rx-ask", id: `${id}-ask` },
    h("span", { class: "rx-ask__no" }), h("span", {}, say(q.ask)))));
  const body = h("div", { class: "rx-q__body" });
  if (help) body.append(h("p", { class: "rx-help", id: `${id}-help` }, say(help)));

  if (q.type === "choice" || q.type === "multi") {
    const type = q.type === "choice" ? "radio" : "checkbox";
    const options = q.options;
    const none = type === "checkbox" ? options.find((o) => o.v === "none") : null;   // a factual "None of these" goes last
    const rest = options.filter((o) => o !== none);
    const { wrap, tile: cls } = layout(rest);
    const tiles = rest.map((o) => tile(`${cls}${type === "checkbox" && cls === "chip" ? " chip--multi" : ""}`, type, id, o.v, o.label, has(answer, o.v), { showIf: o.show_if }));
    if (q.other) tiles.push(tile(cls, type, id, "other", "Something else", has(answer, "other")));
    if (none) tiles.push(h("hr", { class: "rx-none-sep" }), tile(`${cls}${cls === "chip" ? " chip--multi" : ""}`, type, id, "none", none.label, has(answer, "none"), { none: true }));
    body.append(h("div", { class: wrap }, tiles));
    if (q.other) {
      const otherText = answer && typeof answer === "object" ? answer.other ?? "" : "";
      body.append(h("div", { class: "rx-other field", hidden: !has(answer, "other") },
        h("label", { for: `${id}-other` }, "In a few words"),
        h("input", { type: "text", id: `${id}-other`, maxlength: "200", value: otherText })));
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
    showError(fs, false);
  });
  if (!HAS) fs.querySelectorAll("label").forEach((l) => l.classList.toggle("is-on", !!l.querySelector("input:checked")));
  return fs;
}

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
      const values = live.filter((i) => i.type === "checkbox" && i.checked).map((i) => i.value);
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

// Shows or clears a question's error, tied to the question for screen readers.
export function showError(fs, on) {
  const id = `${fs.id}-error`;
  const existing = document.getElementById(id);
  const described = (fs.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== id);
  if (!on) {
    existing?.remove();
    if (described.length) fs.setAttribute("aria-describedby", described.join(" ")); else fs.removeAttribute("aria-describedby");
    return;
  }
  // under the question and its help, above the answers (as GOV.UK places it)
  const answers = fs.querySelector(".rx-q__body > :is(.rx-options, .chips, .rx-stepper, .rx-text)");
  if (!existing) answers.before(h("p", { class: "form-error", id }, fmt(fs.dataset.type === "check" ? TICK : ANSWER)));
  fs.setAttribute("aria-describedby", [...described, id].join(" "));
}

// Questions and answer tiles whose show_if no longer holds are hidden (and don't count).
export function applyVisibility(root, ctx, evalCond) {
  root.querySelectorAll("[data-show-if]").forEach((el) => { el.hidden = !evalCond(el.dataset.showIf, ctx); });
}

// Numbers the questions that can be seen, 01, 02, … from `from`.
export function renumber(root, from = 1) {
  let n = from;
  root.querySelectorAll("fieldset.rx-q").forEach((fs) => {
    if (fs.hidden) return;
    fs.querySelector(".rx-ask__no").textContent = String(n++).padStart(2, "0");
  });
}
