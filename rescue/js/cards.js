// What more than one Rescue page shows: the page frame, the "can't load" card, the score card and
// "Email my link again".
import { call } from "./api.js";
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

// "Email my link again" (brief §0g D10): the private link goes only to the address the order was paid
// with, and the answer never says whether there is an order. With a letter code: one button. Without
// one (the pack page, a visitor from the website): the address they paid with.
//   { code, olive } → the block; `olive` when it sits in the page's olive card
export function linkAgain({ code = null, olive = false } = {}) {
  const box = h("div", { class: "rx-again" });
  const done = () => {
    const p = h("p", { class: olive ? "rx-again__done" : "rx-well rx-again__done", tabindex: "-1", role: "status" },
      fmt(code ? "We've sent your link to the address used to pay (at most three times a day). It can take a few minutes — check your spam folder too."
        : "If there's an order for that address, we've emailed its link to it. It can take a few minutes — check your spam folder too."));
    box.replaceChildren(p);
    p.focus();
  };
  const failed = (where) => {
    document.getElementById("again-error")?.remove();
    where.before(h("p", { class: "form-error", id: "again-error", role: "alert" }, fmt("We couldn't reach our server — check your connection and try again")));
  };
  if (code) {
    const send = h("button", { type: "button", class: "btn" }, "Email my link again");
    send.addEventListener("click", async () => {
      if (send.getAttribute("aria-busy") === "true") return;
      send.setAttribute("aria-busy", "true");
      const r = await call("resend-link", { code });
      send.removeAttribute("aria-busy");
      if (r.status === 200) done(); else failed(send);
    });
    box.append(send);
    return box;
  }
  const input = h("input", { type: "email", id: "again-email", autocomplete: "email", inputmode: "email", autocapitalize: "off",
    spellcheck: "false", maxlength: "254", required: true });
  const send = h("button", { type: "submit", class: "btn" }, "Email my link");
  const form = h("form", { class: "rx-again__form", novalidate: true },
    h("div", { class: "field" }, h("label", { for: "again-email" }, "The email address you paid with"), input), send);
  input.addEventListener("input", () => { document.getElementById("again-error")?.remove(); input.removeAttribute("aria-invalid"); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (send.getAttribute("aria-busy") === "true") return;
    const v = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(v)) {
      document.getElementById("again-error")?.remove();
      input.before(h("p", { class: "form-error", id: "again-error" }, fmt("Enter the email address you paid with, like name@business.co.uk")));
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "again-error");
      input.focus();
      return;
    }
    send.setAttribute("aria-busy", "true");
    const r = await call("resend-link", { email: v });
    send.removeAttribute("aria-busy");
    if (r.status === 200) done(); else failed(send);
  });
  box.append(form);
  return box;
}
