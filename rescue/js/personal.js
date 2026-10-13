// /r/ — the personal page a letter's QR code or printed address leads to.
//   /r/?c=CODE  the page for that letter (404.html sends /r/CODE here)
//   /r/         the code box ("Got our letter?"), also shown for a code we can't find
import { call, normaliseCode, rawCode } from "./api.js";
import { busy, problem, scoreCard, show } from "./cards.js";
import { h, hairline, newTab, skeleton, stickyBar } from "./dom.js";
import { fmt, longDate, money, phrases } from "./text.js";

// ---------------------------------------------------------------- the code box
function codeBox(typed, unknown) {
  document.title = "Got our letter? · Rellony Rescue";
  const error = h("p", { class: "form-error", id: "code-error", role: "alert" }, fmt("We can't find that code — check it against your letter (4 or 5 letters and numbers)"));
  const input = h("input", {
    type: "text", id: "code", name: "c", value: typed ?? "", maxlength: "5", autocomplete: "off",
    autocapitalize: "characters", spellcheck: "false", required: true, "aria-describedby": unknown ? "code-error" : null,
    "aria-invalid": unknown ? "true" : null,
  });
  const form = h("form", { class: "rx-card", novalidate: true, action: "/r/", method: "get" },
    h("div", { class: "field" },
      h("label", { for: "code" }, "Enter the code printed on it"),
      h("div", { class: "rx-code__row" }, input, h("button", { type: "submit", class: "btn" }, "Go")),
      unknown ? error : null));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = normaliseCode(input.value);
    if (code) { location.assign(`/r/?c=${code}`); return; }
    // not even the shape of a code: say so here, without a round trip
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", "code-error");
    if (!form.contains(error)) form.querySelector(".field").append(error);
    input.focus();
  });
  show(h("div", { class: "rx-code" }, h("h1", { class: "rx-h1", tabindex: "-1" }, "Got our letter?"), hairline(), form));
  if (unknown) input.focus();
}

// ---------------------------------------------------------------- the personal page
function councilCard(p) {
  const info = p.councilInfo;
  const name = p.council;
  if (!info) {
    return h("section", { class: "rx-card rx-council", "aria-label": name },
      h("p", { class: "eyebrow" }, name),
      h("p", { class: "rx-council__apply" }, fmt(`Your rating letter from ${name} should say whether there's a re-visit fee and how to apply`)));
  }
  const fee = info.feeGbp === null
    ? h("p", { class: "rx-council__apply" }, fmt(`${name} doesn't publish its re-visit fee online — your rating letter should say it`))
    : h("p", { class: "rx-council__fee" }, fmt("Re-visit fee "), h("strong", {}, `£${money(info.feeGbp)}`));
  return h("section", { class: "rx-card rx-council", "aria-label": name },
    h("p", { class: "eyebrow" }, name),
    fee,
    info.apply ? h("p", { class: "rx-council__apply" }, fmt(`How to apply: ${info.apply.replace(/\.$/, "")}`)) : null,
    h("p", { class: "rx-council__links" },
      h("a", { href: info.sourceUrl, target: "_blank", rel: "noopener noreferrer" }, fmt(`${name}'s page ↗`), newTab()),
      " ", h("span", { class: "rx-fine" }, "· ", h("span", { class: "rx-nw" }, fmt(`checked ${longDate(info.checkedOn)}`)))));
}

function render(p) {
  const name = p.businessName;
  document.title = fmt(`${name} — your food hygiene scores · Rellony Rescue`);
  const start = `/rescue/start/?c=${p.code}`;
  const h1 = p.r10 > 1 ? `${name}: one score is holding you at 1` : `${name}, here's where you stand`;

  const action = h("a", { class: "btn btn--two", id: "main-action", href: start },
    h("span", {}, "Check your business free"),
    h("span", { class: "btn__sub" },
      h("span", {}, fmt("About 3 minutes")),
      h("span", { class: "btn__dot", "aria-hidden": "true" }, " · "),
      h("span", { class: "vh" }, ", "),
      h("span", {}, "no payment, no account")));

  const status = h("section", { class: "rx-card rx-status", "aria-label": "Food hygiene rating" },
    h("div", { class: "rx-status__head" },
      h("span", { class: "rx-badge", "aria-hidden": "true" }, String(p.rating)),
      h("div", {},
        h("p", { class: "rx-status__line" }, "Food hygiene rating ", h("strong", {}, String(p.rating))),
        h("p", { class: "rx-status__meta rx-fine" }, phrases(`${p.council} · inspected ${longDate(p.ratingDate)}`)))),
    h("p", { class: "rx-status__source rx-fine" },
      h("span", { class: "rx-nw" }, fmt(`From the FSA's public ratings, ${longDate(p.dataDate)}`)), " · ",
      h("span", { class: "rx-nw" },
        h("a", { href: `https://ratings.food.gov.uk/business/${encodeURIComponent(p.fhrsid)}`, target: "_blank", rel: "noopener noreferrer" }, "View listing ↗", newTab()))));

  show(
    h("h1", { class: "rx-h1", tabindex: "-1" }, fmt(h1)),
    hairline(),
    h("div", { class: "rx-grid" },
      h("div", { class: "rx-stack" }, status, scoreCard(p.scores, p.r10)),
      h("div", { class: "rx-stack rx-aside" },
        // the page's one olive card; the letter-first block joins it in Phase 4
        h("section", { class: "panel rx-action rx-olive", "aria-label": "Your free check" },
          action,
          h("p", { class: "btn-note" }, fmt(`Your answers save under your code — scan the QR again or type rellony.com/r/${p.code} on any device to carry on`))),
        councilCard(p))),
    h("p", { class: "rx-after" },
      h("a", { class: "rx-quiet", href: "/r/" }, "Not your business?"),
      h("a", { class: "rx-quiet", href: "/stop/" }, "Stop letters"),
      h("a", { class: "rx-quiet", href: "/privacy/" }, "Privacy")));

  // the phone's bar: from the start until the main button first comes on screen
  const bar = h("div", { class: "rx-sticky", hidden: true },
    h("a", { class: "btn", href: start }, "Check your business free", h("span", { class: "btn__meta" }, fmt("· 3 min"))));
  document.body.append(bar);
  stickyBar(bar, { main: action });
}

// ---------------------------------------------------------------- load
async function load() {
  const typed = rawCode();
  if (!typed) { codeBox(null, false); return; }
  const code = normaliseCode(typed);
  if (!code) { codeBox(typed, true); return; }
  busy(skeleton());
  const r = await call("letter-lookup", { code });
  if (r.status === 200 && r.data) render(r.data);
  else if (r.status === 404) codeBox(code, true);
  else problem(load);
}

load();
