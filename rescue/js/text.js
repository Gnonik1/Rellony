// The site's typographic rules, for the pages' own text and for the question bank's text as it
// is shown. The bank itself is never edited (its wording, capitals
// included, is fixed until the next data revision).

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Typographic quotes: one that opens (after a space, a bracket or a dash) turns left; every other
// one is an apostrophe.
export const curly = (s) => s.replace(/(^|[\s(\[—-])'/g, "$1‘").replace(/'/g, "’");

// Things that must not split across lines: dates, a number and its unit, short compounds
// (re-visit, re-rating, self-check, 4-week, 48-hour); and " — " or " · " never starts a line.
export const nb = (s) => s
  .replace(new RegExp(`(\\d{1,2}) (${MONTHS.join("|")}) (\\d{4})`, "g"), "$1 $2 $3")
  .replace(/(\d+) (minutes?|min|hours?|days?|weeks?|months?|pages?|characters)\b/g, "$1 $2")
  .replace(/\b(re)-(visit|rating)/gi, "$1‑$2")
  .replace(/\b(self)-(check)/gi, "$1‑$2")
  .replace(/(\d+)-(minute|hour|day|week|month)/g, "$1‑$2")
  .replace(/ (—|·)(?= |$)/g, " $1");

// One sentence: no full stop at its end. Two or more: every full stop stays, whatever the element.
const sentenceEnds = (s) => (s.match(/[.!?](?=\s+[A-Z‘“"(]|\s*$)/g) || []).length;
export const stops = (s) => (sentenceEnds(s) >= 2 ? s : s.replace(/\.$/, ""));

// Copy as written (the page's own strings). Spaces at either end stay: a piece of text often sits
// next to a link or a bold figure.
export const fmt = (s) => nb(curly(String(s ?? "")));
// The bank's text as shown: the punctuation rule, then the typography
export const say = (s) => fmt(stops(String(s ?? "").trim()));

export function longDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export const money = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

// A line of phrases joined by " · " that breaks after a dot, never inside a phrase and never before a dot:
// each dot ends its phrase inside the phrase's box (a no-break space next to an inline block doesn't stop
// a break there — CSS Text 3, so the dot alone could start a line, as on an iPhone).
export function phrases(text) {
  const out = document.createDocumentFragment();
  const parts = fmt(text).split(" · ");
  parts.forEach((p, i) => {
    if (i) out.append(" ");
    const span = document.createElement("span");
    span.className = "rx-nw";
    span.textContent = i < parts.length - 1 ? `${p}\u00a0\u00b7` : p;
    out.append(span);
  });
  return out;
}
