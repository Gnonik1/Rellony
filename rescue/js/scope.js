// S2, the scope box (page copy §0): "What you get" and "What Rellony does not do", word for word as
// the Terms and the Rescue plan have it — on the web "This Rescue plan" reads "Your Rescue plan" and a
// one-sentence item drops its full stop (the stops rule). Used by the free check and the pack page.
import { h } from "./dom.js";
import { fmt, say } from "./text.js";

const em = (text) => h("em", {}, text);
const PACK = "Safer food, better business for caterers";
export const GET = [
  ["The FSA's own ", em(PACK), " pack, filled in on your device from your answers — you check it, finish it and sign it."],
  ["Your Rescue plan: where you stand, a 4-week plan of the gaps in your answers (and in your council's letter, if you tell us what it says), and where each fix goes in your SFBB pack."],
  ["An allergen matrix to fill in, and a daily fridge and freezer log (optional, unless your council's letter raises temperature records)."],
  ["A short email on days 3, 7, 14 and 21, and a final one on day 28 with your self-check."],
  ["A tool that turns your own photos into an evidence PDF, and a draft re-visit request you edit and send yourself."],
  ["Answers to your emails about using your plan and your SFBB pack (rescue@rellony.com) within 2 working days, until support ends (day 35)."],
];
export const NOT = [
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
export function item(pieces) {
  const whole = pieces.map((p) => (typeof p === "string" ? p : p.textContent)).join("");
  const last = pieces.length - 1;
  return h("li", {}, pieces.map((p, i) => (typeof p !== "string" ? p : i === last && say(whole) !== fmt(whole) ? fmt(p.replace(/\.$/, "")) : fmt(p))));
}
