// S2, the scope box (page copy §0): "What you get" and "What Rellony does not do", word for word as
// the Terms and the Rescue plan have it — on the web "This Rescue plan" reads "Your Rescue plan" and a
// one-sentence item drops its full stop (the stops rule). Used by the free check and the pack page.
import { h } from "./dom.js";
import { fmt, say } from "./text.js";

const em = (text) => h("em", {}, text);
const PACK = "Safer food, better business for caterers";
export const GET = [
  ["The FSA's own ", em(PACK), " pack, filled in on your device from your answers — you check it, finish it and sign it."],
  ["Your Rescue plan: where you stand, a 4-week plan of the gaps in your answers, and where each fix goes in your SFBB pack."],
  ["An allergen matrix to fill in, and an optional daily fridge and freezer log."],
  ["Your private pack page, where you tick off your steps as you go."],
  ["Answers to your emails about using your plan and your SFBB pack (rescue@rellony.com) within 2 working days, until support ends."],
];
export const NOT = [
  "Visit or inspect your premises, or check the work you do.",
  "Contact your council or act on your behalf.",
  "Decide or check allergen information.",
  "Give legal advice, or professional advice specific to your premises.",
  "Certify or approve your business.",
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
