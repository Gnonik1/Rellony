/**
 * Rellony Rescue — fill the FSA's official "Safer food, better business for caterers" pack.
 *
 * Principle (FSA SFBB re-use guidance, read 11 Oct 2026): never re-write a safe method and never change
 * the pack's style. This module only sets the values of the pack's own form fields — the same boxes an
 * owner fills in by hand — and builds their appearance so every viewer and printer shows them.
 * Page content, text, layout, icons, colours, images and metadata stay exactly as the FSA published them.
 *
 * Where it runs: in the owner's browser (the filled copy is made on their device from the GOV.UK file,
 * so Rellony never hosts or sends the FSA's PDF, which contains third-party photographs) and in Node for tests.
 *
 * Input `fill` (made by buildFill() in rescue-generator.mjs):
 *   { text: { [fieldName]: string }, check: [fieldName, ...] }
 * Fails closed: if the PDF is not the pinned version (page/field counts) or any target field is missing,
 * it throws and produces nothing — a half-filled pack is worse than none.
 */
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, layoutMultilineText, TextAlignment } from "../vendor/pdf-lib.esm.min.js";

/** The pack version the field map was built against (re-check when the FSA updates the pack). */
export const SFBB_PACK = {
  title: "Safer food, better business for caterers — full pack (100 pages)",
  page: "https://www.gov.uk/government/publications/safer-food-better-business-for-caterers",
  pdf: "https://assets.publishing.service.gov.uk/media/69c5247ecdfd19de13d0f6ca/sfbb-caterers-pack-fixed_0_3.pdf",
  pages: 100,
  fields: 1500,
  checked_on: "2026-10-11",
};

// Standard 14 fonts use WinAnsi encoding. Map common characters outside it; replace anything else.
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const SUBSTITUTE = {
  "−": "-", // minus sign
  "‐": "-", "‑": "-", "‒": "-", "―": "-",
  "≤": "<=", "≥": ">=", "≈": "~", "→": "->", "←": "<-",
  " ": " ", " ": " ", " ": " ", "​": "",
  "′": "'", "″": '"',
};
const inWinAnsi = (cp) => (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WINANSI_EXTRA.has(cp);

/** Make text safe for the pack's standard font. Returns { text, replaced } so callers can log changes. */
export function toWinAnsi(input) {
  let replaced = 0;
  let out = "";
  for (const ch of String(input ?? "").normalize("NFC")) {
    if (ch === "\n") { out += "\n"; continue; }
    if (ch === "\t" || ch === "\r") { out += " "; continue; }
    const cp = ch.codePointAt(0);
    if (inWinAnsi(cp)) { out += ch; continue; }
    if (SUBSTITUTE[ch] !== undefined) { out += SUBSTITUTE[ch]; replaced++; continue; }
    out += "?"; replaced++;
  }
  return { text: out.replace(/[ ]{2,}/g, " ").trim(), replaced };
}

/** Font size from the field's own default appearance ("/Helv 9 Tf 0 g" → 9); 0 means auto. */
function daFontSize(field) {
  const da = field.acroField.getDefaultAppearance() ?? "";
  const m = da.match(/(\d+(?:\.\d+)?)\s+Tf/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Choose a font size so the text fits the field's box (pdf-lib's auto-size is unreliable for multiline
 * fields). Starts at the pack's own size (or 9 pt), never below 6 pt. If it still doesn't fit, the text
 * is cut at a word boundary and reported, so the generator can shorten it.
 */
function fitText(field, font, text) {
  const rect = field.acroField.getWidgets()[0].getRectangle();
  const pad = 2;
  const bounds = { x: pad, y: pad, width: Math.max(1, rect.width - 2 * pad - 2), height: Math.max(1, rect.height - 2 * pad) };
  const start = Math.min(daFontSize(field) || 9, 10);
  const fits = (t, size) => {
    if (field.isMultiline()) {
      const lay = layoutMultilineText(t, { alignment: TextAlignment.Left, fontSize: size, font, bounds });
      // Height must fit, and no single line (e.g. one long word in a narrow column) may run past the box.
      return lay.lines.length * lay.lineHeight <= bounds.height && lay.lines.every((l) => font.widthOfTextAtSize(l.text, size) <= bounds.width + 0.5);
    }
    return !t.includes("\n") && font.widthOfTextAtSize(t, size) <= bounds.width && font.heightAtSize(size) <= bounds.height + pad;
  };
  for (let size = start; size >= 6; size -= 0.5) if (fits(text, size)) return { size, text, cut: false };
  // Still too long at 6 pt: cut at a word boundary with an ellipsis.
  const words = text.split(" ");
  while (words.length > 1) {
    words.pop();
    const t = words.join(" ") + " …";
    if (fits(t, 6)) return { size: 6, text: t, cut: true };
  }
  return { size: 6, text: "", cut: true };
}

/** Check the PDF is the version the field map expects, without changing anything. */
export async function inspectPack(pdfBytes) {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const form = pdf.getForm();
  return { pages: pdf.getPageCount(), fields: form.getFields().length, names: new Set(form.getFields().map((f) => f.getName())) };
}

/**
 * Fill the official pack. Returns { bytes, report }.
 * opts.expect — { pages, fields } to enforce (defaults to SFBB_PACK); pass null to skip (tests only).
 */
export async function fillOfficialPack(pdfBytes, fill, opts = {}) {
  const expect = opts.expect === undefined ? SFBB_PACK : opts.expect;
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const form = pdf.getForm();
  const fields = form.getFields();
  if (expect) {
    if (pdf.getPageCount() !== expect.pages || fields.length !== expect.fields) {
      throw new Error(`SFBB pack version changed: expected ${expect.pages} pages / ${expect.fields} fields, got ${pdf.getPageCount()} / ${fields.length}`);
    }
  }
  const byName = new Map(fields.map((f) => [f.getName(), f]));
  const text = fill?.text || {};
  const check = fill?.check || [];
  const missing = [...Object.keys(text), ...check].filter((n) => !byName.has(n));
  if (missing.length) throw new Error(`Fields not found in the pack: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}`);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const report = { text: 0, check: 0, replacedChars: 0, readOnlySkipped: [], wrongType: [], cut: [] };
  for (const [name, value] of Object.entries(text)) {
    const f = byName.get(name);
    if (!(f instanceof PDFTextField)) { report.wrongType.push(name); continue; }
    if (f.isReadOnly()) { report.readOnlySkipped.push(name); continue; }
    const { text: safe, replaced } = toWinAnsi(value);
    report.replacedChars += replaced;
    const max = f.getMaxLength();
    const limited = max !== undefined && safe.length > max ? safe.slice(0, max) : safe;
    const fitted = fitText(f, font, limited);
    if (fitted.cut) report.cut.push(name);
    f.setFontSize(fitted.size);
    f.setText(fitted.text);
    report.text++;
  }
  for (const name of check) {
    const f = byName.get(name);
    if (!(f instanceof PDFCheckBox)) { report.wrongType.push(name); continue; }
    if (f.isReadOnly()) { report.readOnlySkipped.push(name); continue; }
    f.check();
    report.check++;
  }
  if (report.wrongType.length) throw new Error(`Field type mismatch: ${report.wrongType.slice(0, 10).join(", ")}`);

  // Build appearances with the standard font so the values show in every viewer and print.
  form.updateFieldAppearances(font);
  // Fields stay editable: the owner checks, corrects and completes the pack, then signs it.
  const bytes = await pdf.save({ updateFieldAppearances: false });
  return { bytes, report };
}
