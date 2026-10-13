// What more than one Rescue page shows: the page frame, the "can't load" card and the score card.
import { h } from "./dom.js";
import { fmt } from "./text.js";

const main = document.getElementById("main");
const app = document.getElementById("app");

// The page's content, replacing the skeleton (the frame stops reserving the screen).
export function show(...nodes) {
  main.removeAttribute("aria-busy");
  app.replaceChildren(...nodes);
}

// While the page fetches what it shows: the frame holds the screen.
export function busy(placeholder) {
  main.setAttribute("aria-busy", "true");
  app.replaceChildren(placeholder);
}

// When the page can't load, or can't go on: one line and a way to try again.
export function problem(retry, text = "We couldn't load your page — check your connection and try again", label = "Try again") {
  document.title = "Rellony Rescue";
  const again = h("button", { type: "button", class: "btn" }, label);
  again.addEventListener("click", retry);
  show(h("div", { class: "rx-card rx-problem", role: "alert" }, h("p", {}, fmt(text)), again));
}

// The three published scores on a 0–30 bar with the tick at 15, and the table's rule.
export function scoreCard(scores, r10) {
  const row = (name, v, first) => h("li", { class: `rx-score${v > 15 ? " is-high" : ""}` },
    h("span", { class: "rx-score__name" }, name),
    h("span", { class: "rx-score__value" }, String(v)),
    h("span", { class: "rx-score__bar", "aria-hidden": "true", vars: { "--v": v } },
      first ? h("span", { class: "rx-score__mark" }, fmt("15 — the highest a 2 allows")) : null));
  return h("section", { class: "rx-card rx-scores", id: "scores", "aria-label": "Your three scores" },
    h("div", { class: "rx-label" }, h("p", { class: "eyebrow" }, "Your three scores"), h("p", { class: "rx-fine" }, "lower is better")),
    h("ul", { class: "rx-scores__list" },
      row("Hygienic food handling", scores.hygiene, true),
      row("Structure and cleaning", scores.structure),
      row("Confidence in management", scores.management)),
    h("div", { class: "rx-rule" },
      h("p", {}, "A 2 needs no single score above 15 and a total of 40 or less. With your management score at 10 and the other two unchanged, the table gives ",
        h("strong", { class: "rx-rule__result" }, String(r10)), "."),
      h("p", { class: "rx-fine" }, fmt("This is how the table works — the officer scores everything again at a re-visit"))));
}
