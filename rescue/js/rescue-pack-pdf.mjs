// Rellony Rescue — the Rescue plan: Rellony's own document that goes with the owner's official SFBB pack.
//   import { buildDocDefinition } from "./pack-pdf.mjs";
//   const pack = buildPack(bank, library, input, fieldmap);
//   const fill = buildFill(bank, fieldmap, input, pack);          // the same fill that went into the official pack
//   pdfMake.createPdf(buildDocDefinition(pack, fill)).download("rescue-plan.pdf");
// The plan never reproduces SFBB pages or safe methods (the FSA asks re-users not to re-write them); it points to
// pages of the owner's own SFBB pack instead. Only pdfmake's built-in Roboto font. No images, no logos.
// Every new page is started with pageBreak:"before".

const C = { accent: "#14532d", soft: "#eef5f0", line: "#9ca3af", muted: "#4b5563", warn: "#7f1d1d", warnSoft: "#fdf2f2" };
const WEEK_NAMES = { 0: "TODAY — urgent", 1: "WEEK 1", 2: "WEEK 2", 3: "WEEK 3" };
const FREQ = { after_use: "After each use", shift: "Every shift", daily: "Daily", weekly: "Weekly", monthly: "Monthly", fortnightly: "Every 2 weeks", quarterly: "Every 3 months" };
const ALLERGEN_ABBR = { celery: "Celery", gluten: "Gluten", crustaceans: "Crust-\naceans", eggs: "Eggs", fish: "Fish", lupin: "Lupin", milk: "Milk",
  molluscs: "Mol-\nluscs", mustard: "Mus-\ntard", tree_nuts: "Nuts", peanuts: "Pea-\nnuts", sesame: "Sesame", soya: "Soya", sulphites: "Sul-\nphites" };

// Characters missing from pdfmake's Roboto subset are replaced.
const t = (s) => String(s ?? "").replace(/−/g, "-").replace(/[→←]/g, "-").replace(/✓/g, "Yes");

const NEW = { pageBreak: "before" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (iso || ""); };
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d; };
const box = () => ({ canvas: [{ type: "rect", x: 0, y: 1.5, w: 8, h: 8, lineWidth: 0.7, lineColor: "#111" }], width: 12 });
const h1 = (text, opts = {}) => ({ text: t(text), style: "h1", tocItem: true, ...opts });
const h3 = (text, opts = {}) => ({ text: t(text), style: "h3", ...opts });
const p = (text, opts = {}) => ({ text: Array.isArray(text) ? text.map((x) => (typeof x === "string" ? t(x) : { ...x, text: t(x.text) })) : t(text), style: "p", ...opts });
const small = (text, opts = {}) => ({ text: t(text), style: "small", ...opts });
const tableLayout = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => C.line, vLineColor: () => C.line,
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
  fillColor: (row) => (row === 0 ? C.soft : null),
};
const th = (s, o = {}) => ({ text: t(s), style: "th", ...o });
const td = (s, o = {}) => ({ text: t(s), style: "td", ...o });
const blankRows = (n, cols, height = 16) =>
  Array.from({ length: n }, () => Array.from({ length: cols }, () => ({ text: " ", style: "td", margin: [0, height / 2 - 4, 0, height / 2 - 4] })));
const banner = (label, color) => ({ table: { widths: ["*"], body: [[{ text: t(label), style: "bannerText", fillColor: color }]] }, layout: "noBorders" });
const framed = (stack, color = C.accent, margin = [0, 10, 0, 0]) => ({
  table: { widths: ["*"], body: [[{ stack, margin: [6, 6, 6, 6] }]] },
  layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => color, vLineColor: () => color }, margin,
});

// Page references into the owner's SFBB pack (PDF page numbers, from the field map).
const partOf = (pack, key) => pack.meta.sfbb?.parts?.[key] || null;
const pagesOf = (pack, key) => {
  const part = partOf(pack, key);
  if (!part) return "";
  const [a, b] = part.pages;
  return b && b !== a ? `pages ${a}–${b}` : `page ${a}`;
};
const pg = (pack, key) => partOf(pack, key)?.pages?.[0] ?? "";
// "58-59" / "66, 82" -> "pages 58–59" / "pages 66 and 82" (a safe method's pages in the SFBB pack).
const mPages = (pack, id) => {
  const raw = pack.meta.sfbb?.methodPages?.[id];
  if (!raw) return "";
  const parts = String(raw).split(",").map((x) => x.trim().replace("-", "–")).filter(Boolean);
  return `${parts.length > 1 || parts[0].includes("–") ? "pages" : "page"} ${parts.join(" and ")}`;
};
const cite = (pack, key) => (pack.meta.sfbb?.cites?.[key] ? `pack page ${pack.meta.sfbb.cites[key]}` : "the pack");
const paren = (s) => (s ? ` (${s})` : "");

// For a step that points at one box, the topic line names the whole safe method (its page range).
const relatedWhere = (pack, method, x) => {
  const raw = method ? pack.meta.sfbb?.methodPages?.[method] : null;
  if (!raw) return x.where;
  const parts = String(raw).split(",").map((y) => y.trim().replace("-", "–")).filter(Boolean);
  return `${parts.length > 1 || parts[0].includes("–") ? "pages" : "page"} ${parts.join(" and ")}`;
};

// Every place a step points to: its own, then the places of the answers merged into it (generator 1.3.0).
const placesOf = (s) => [s.sfbb, ...(s.sfbbAlso || [])].filter(Boolean);
const ACT = { tick_yes: "tick 'Yes'", tick: "tick the box", write: "write what you now do in the box" };

// The safe methods a topic's steps belong to, once per topic: ["Cooking safely, pages 50–51", …].
export function topicPlaces(pack, g) {
  return [...new Set(g.steps.flatMap((s) => placesOf(s).map((x, i) => (x.label
    ? `${x.label}, ${x.mode === "related" || x.mode === "part" ? x.where : relatedWhere(pack, i ? x.method : s.method, x)}`
    : null))).filter(Boolean))];
}

// The line under a plan step that tells the owner which box in the SFBB pack it fills (null when the step
// fills no box of its own — the topic's line names the safe method). One box keeps the familiar wording;
// a merged step names each box: "When this is done, in your SFBB pack: tick 'Yes' on page 23 (Pest
// control) and on page 35 (Clear and clean as you go)."
export function boxText(s) {
  const boxes = placesOf(s).filter((x) => ACT[x.mode]);
  if (!boxes.length) return null;
  if (boxes.length === 1) {
    const x = boxes[0];
    return `When this is done: ${ACT[x.mode]} on ${x.where} of your SFBB pack${x.label ? ` (${x.label})` : ""}.`;
  }
  const byAct = new Map();
  for (const x of boxes) byAct.set(x.mode, [...(byAct.get(x.mode) || []), `on ${x.where}${x.label ? ` (${x.label})` : ""}`]);
  return `When this is done, in your SFBB pack: ${[...byAct].map(([mode, at]) => `${ACT[mode]} ${at.join(" and ")}`).join("; ")}.`;
}

// One line under a plan step: the box it fills, else where it belongs in the SFBB pack.
export function pointerText(s) {
  const box = boxText(s);
  if (box) return box;
  const refs = [...new Set(placesOf(s).filter((x) => x.label).map((x) => `${x.label}, ${x.where}`))];
  return refs.length ? `SFBB pack: ${refs.join("; ")}.` : null;
}

// ---------------------------------------------------------------- what Rellony does and doesn't (same wording as the website)
const SCOPE_DOES = [
  "the FSA's own Safer food, better business for caterers pack, filled in on your device from your answers — you check it, finish it and sign it;",
  "this Rescue plan: where you stand, a 4-week plan of the gaps in your answers, and where each fix goes in your SFBB pack;",
  "an allergen matrix to fill in, and an optional daily fridge and freezer log;",
  "your private pack page, where you tick off your steps as you go;",
  "answers to your emails about using your plan and your SFBB pack (rescue@rellony.com) within 2 working days, until support ends.",
];
const SCOPE_DOESNT = [
  "visit or inspect your premises, or check the work you do;",
  "contact your council or act on your behalf;",
  "decide or check allergen information;",
  "give legal advice, or professional advice specific to your premises;",
  "certify or approve your business;",
  "speak for the Food Standards Agency or your council — Rellony is independent of both;",
  "promise a rating — only the officer decides. Food safety stays your legal responsibility as the food business operator.",
];
function scopeBox(pack) {
  const pr = pack.meta.programme;
  const dates = pr ? `Your dates: programme ${fmtDate(pr.day0)} to ${fmtDate(pr.endsAt)} · email support until ${fmtDate(pr.supportEndsAt)} · this plan and its tools stay available until ${fmtDate(pr.accessUntil)}.` : null;
  return {
    table: { widths: ["*"], body: [[{ stack: [
      { text: "What Rellony does — and doesn't", bold: true, margin: [0, 0, 0, 4] },
      { columns: [
        { stack: [{ text: "What you get", style: "small", bold: true }, { ul: SCOPE_DOES.map(t), style: "small" }], width: "*" },
        { stack: [{ text: "What Rellony does not do", style: "small", bold: true }, { ul: SCOPE_DOESNT.map(t), style: "small" }], width: "*" },
      ], columnGap: 12 },
      dates ? { text: t(dates), style: "small", margin: [0, 6, 0, 0] } : null,
    ].filter(Boolean), margin: [6, 6, 6, 6] }]] },
    layout: { hLineWidth: () => 0.7, vLineWidth: () => 0.7, hLineColor: () => C.accent, vLineColor: () => C.accent },
    margin: [0, 12, 0, 0], unbreakable: true,
  };
}

// ---------------------------------------------------------------- cover
function cover(pack) {
  const b = pack.business || {};
  const pr = pack.meta.programme;
  const hasLetter = (pack.findings || []).length > 0;
  const parts = [
    { text: "RELLONY RESCUE · YOUR 4-WEEK PLAN", style: "kicker", margin: [0, 110, 0, 6] },
    { text: t(b.name || "Your business"), style: "title" },
    p([b.address, b.postcode].filter(Boolean).join(", "), { margin: [0, 2, 0, 16] }),
    p(`Made from your answers${hasLetter ? " and what you told us your council's letter says" : ""}. Prepared ${fmtDate(pack.meta.packDate)}${pr ? ` · programme ${fmtDate(pr.day0)} to ${fmtDate(pr.endsAt)}` : ""}.`, { color: C.muted }),
    framed([
      { text: "Two documents, one food safety system", bold: true, margin: [0, 0, 0, 6] },
      { columns: [
        { width: 18, text: "1", style: "bigNum" },
        { stack: [
          { text: "Your SFBB pack", bold: true },
          p("The Food Standards Agency's own Safer food, better business for caterers (100 pages), filled in on your device from your answers. Check it, finish it, sign it and use it every day: it is your written food safety management system."),
        ] },
      ], margin: [0, 0, 0, 6] },
      { columns: [
        { width: 18, text: "2", style: "bigNum" },
        { stack: [
          { text: "This Rescue plan", bold: true },
          p("From Rellony: where you stand, what to fix over the next 4 weeks, and where each fix goes in your SFBB pack. Rellony made this plan; the FSA did not."),
        ] },
      ] },
    ], C.accent, [0, 26, 0, 0]),
    p("Start with the steps marked TODAY on the plan, then work through the weeks. Keep this plan with your SFBB pack in the kitchen.", { margin: [0, 14, 0, 0] }),
    { toc: { title: { text: "In this plan", style: "h3", margin: [0, 18, 0, 4] }, textStyle: "p", numberStyle: "p" } },
  ];
  if (b.fictional) parts.push({ text: "SAMPLE — fictional business, invented answers. Council details are real.", style: "warnBox", margin: [0, 26, 0, 0] });
  return parts;
}

// ---------------------------------------------------------------- where you stand
function whereYouStand(pack) {
  const out = [h1("Where you stand", NEW)];
  const f = pack.fsa;
  if (f?.scores) {
    const s = f.scores;
    out.push({
      table: { widths: ["*", 60, 130], body: [
        [th("Area the officer scored"), th("Your score"), th("Possible (lower is better)")],
        [td("Hygienic food handling"), td(String(s.hygiene), { bold: true }), td("0 · 5 · 10 · 15 · 20 · 25")],
        [td("Structure, cleanliness and facilities"), td(String(s.structure), { bold: true }), td("0 · 5 · 10 · 15 · 20 · 25")],
        [td("Confidence in management"), td(String(s.management), { bold: true }), td("0 · 5 · 10 · 20 · 30")],
      ] }, layout: tableLayout, margin: [0, 4, 0, 8],
    });
    if (pack.counterfactual) {
      const c = pack.counterfactual;
      out.push(p(`Current rating: ${c.current}. Under the FSA's published scoring table, if your management score were ${c.withManagement} and the other two scores stayed the same, the table gives a rating of ${c.result}.`));
      out.push(small("This is how the table works, not a forecast: at a re-visit the officer assesses everything again, and the rating can go up, down or stay the same. Source: FHRS Brand Standard (scoring table; Section 8, Q&A 14).", { margin: [0, 2, 0, 10] }));
    }
  } else {
    out.push(p("Your scores were not available when this plan was made."));
  }
  out.push(h3("What 'confidence in management' looks for"));
  out.push(p("The FSA's guidance for officers says this score is not only about documents: officers also weigh your food safety knowledge, how well you understand the hazards and control them, your attitude to food safety and your track record. A score of 20 describes things like insufficient food safety knowledge, a poor appreciation of hazards and controls, inadequate food safety procedures (for example Safer food, better business) or little progress since the last inspection, and staff not suitably trained. A score of 10 describes satisfactory procedures, or satisfactory progress towards them, with the significant hazards understood and controlled, records generally kept and staff generally trained. Your SFBB pack gives you the written procedures; using them every day, and making sure you and your staff understand them, is what an officer looks for."));
  out.push(small("Source: FHRS Brand Standard — confidence in management guidance and score descriptions, paraphrased.", { margin: [0, 2, 0, 6] }));
  if (pack.council) {
    const k = pack.council;
    out.push(h3("Your council", { margin: [0, 10, 0, 4] }));
    const rows = [[th("Council"), td(k.name)]];
    if (k.revisit_fee) rows.push([th("Re-visit fee"), td(`${k.revisit_fee}${k.revisit_fee_source ? " — " + k.revisit_fee_source : ""}`)]);
    if (k.email) rows.push([th("Email"), td(k.email)]);
    if (k.phone) rows.push([th("Phone"), td(k.phone)]);
    out.push({ table: { widths: [90, "*"], body: rows }, layout: { ...tableLayout, fillColor: (r, n, c) => (c === 0 ? C.soft : null) } });
    out.push(small("Check the fee and how to apply in your own letter or on your council's website before you request a re-visit — fees and forms change.", { margin: [0, 4, 0, 0] }));
  }
  out.push(scopeBox(pack));
  return out;
}

// ---------------------------------------------------------------- how to use your SFBB pack
function howToUse(pack, fill) {
  const sm = fill?.summary || {};
  const ov = fill?.overflow?.cleaning?.length || 0;
  const out = [h1("How to use your SFBB pack", NEW)];
  out.push(p(`Your SFBB pack is the Food Standards Agency's Safer food, better business for caterers: ${pack.meta.sfbb?.pages || 100} pages, unchanged except for the answers filled into its boxes. It was filled in on your own device from the FSA's file on GOV.UK — Rellony doesn't keep or send a copy. The page numbers in this plan are the numbers your PDF viewer shows (the pack doesn't print its own).`));

  // What we filled in, and what we left for you.
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const filled = [
    "your business name and address (cover and diary);",
    sm.answers ? `${n(sm.answers, "written answer", "written answers")} in the 'How do you do this?' boxes;` : null,
    sm.yesTicks ? `${n(sm.yesTicks, "tick", "ticks")}, only where you told us you already do exactly what the pack asks;` : null,
    sm.notRelevant?.length ? `'not relevant' on the completion record (${pagesOf(pack, "completion")}) for: ${sm.notRelevant.join(", ")};` : null,
    sm.menuRows ? `your dishes on 'Checking your menu'${paren(mPages(pack, "CK4"))};` : null,
    sm.extraChecks ? `your extra checks and how often${paren(mPages(pack, "MG2"))};` : null,
    (sm.own_opening || sm.own_closing) ? `your own opening or closing checks${paren(mPages(pack, "MG1"))};` : null,
    sm.cleaningRows ? `${n(sm.cleaningRows, "item", "items")} on the cleaning schedule (${pagesOf(pack, "cleaning")})${ov ? ` — ${ov} more ${ov === 1 ? "is" : "are"} on the 'Cleaning schedule — continued' page of this plan` : ""};` : null,
    sm.suppliers ? `${n(sm.suppliers, "supplier", "suppliers")} on the suppliers' list (${pagesOf(pack, "suppliers")});` : null,
    sm.contacts?.length ? `contacts (${pagesOf(pack, "contacts")}): ${sm.contacts.join("; ")};` : null,
  ].filter(Boolean);
  filled[filled.length - 1] = filled[filled.length - 1].replace(/;$/, ".");
  const left = [
    "every 'Yes' your answers didn't support — your plan shows the page; tick it only once it is true;",
    "anything your answers didn't cover;",
    "your name, signatures and dates;",
    "staff names and training dates (Rellony doesn't store staff names);",
    "allergen details — only you can decide them, from your recipes and labels.",
  ];
  out.push({ columns: [
    framed([{ text: "We filled in", bold: true, margin: [0, 0, 0, 3] }, { ul: filled.map(t), style: "small" }], C.accent, [0, 8, 0, 0]),
    framed([{ text: "We left for you", bold: true, margin: [0, 0, 0, 3] }, { ul: left.map(t), style: "small" }], C.accent, [0, 8, 0, 0]),
  ], columnGap: 10 });

  const step = (n, title, body) => ({ columns: [{ width: 18, text: String(n), style: "num" }, { stack: [{ text: t(title), bold: true }, p(body)] }], margin: [0, 6, 0, 0], unbreakable: true });
  const own = sm.own_opening || sm.own_closing ? ", where we added your own checks" : "";
  out.push(h3("This week", { margin: [0, 12, 0, 0] }));
  out.push(step(1, "Make it yours", "Go through each section of the pack. Where we filled something in, check it says what really happens in your kitchen; if it doesn't, change it — every box can still be edited, on screen or by hand once printed."));
  out.push(step(2, "Sign it off", `As you finish each safe method, sign and date it on the safe method completion record (${pagesOf(pack, "completion")}). Check the 'not relevant' ticks there too.`));
  out.push(step(3, "Keep it where it's used", `You don't have to print all ${pack.meta.sfbb?.pages || 100} pages. Keep the pack where you and your staff use it every day and can show it to an officer — on a phone, tablet or computer, or printed. Print the pages you write on by hand: the diary (${pagesOf(pack, "diary")}) and, if you like, the cleaning schedule (${pagesOf(pack, "cleaning")}) for the wall. The FSA says the diary can be kept electronically or on paper.`));
  out.push(step(4, "Train your staff", `On each person's first day: the 'Working with food?' factsheet (${pagesOf(pack, "workingWithFood")}) and 'Washing hands effectively' (${pagesOf(pack, "washingHands")}). Then the safe methods for their work. Record it in the staff training record (${pagesOf(pack, "training")}).`));
  out.push(h3("Every day", { margin: [0, 10, 0, 0] }));
  out.push(step(5, "Checks and diary", `Do the opening and closing checks — the lists are on ${pagesOf(pack, "checksList")}${own}. Fill in the diary (${pagesOf(pack, "diary")}; a filled-in example is on ${pagesOf(pack, "diaryExample")}): tick the checks, write down anything that went wrong or was different and what you did, and sign. SFBB asks for the diary every day as a minimum; it doesn't ask you to keep lots of daily records (${cite(pack, "dailyRecords")}).`));
  out.push(h3("Regularly", { margin: [0, 10, 0, 0] }));
  const cooks = !(pack.notRelevant || []).some((m) => m.id === "CK1");
  out.push(step(6, "Prove it", `Check now and then that your methods work — for example, ${cooks ? "probe a cooked or hot-held dish" : "probe chilled food to check it is at 8°C or below"} with a clean, disinfected probe — and note it on 'Prove it: records' (${pagesOf(pack, "proveIt")}).`));
  out.push(step(7, "Keep the lists up to date", `Suppliers' list (${pagesOf(pack, "suppliers")}), contacts (${pagesOf(pack, "contacts")}) and cleaning schedule (${pagesOf(pack, "cleaning")}).`));
  out.push(h3("Every 4 weeks", { margin: [0, 10, 0, 0] }));
  out.push(step(8, "4-weekly review", `Walk round the kitchen and look back over the diary; write down problems and what you did (${pagesOf(pack, "review")}; a filled-in example is on ${pagesOf(pack, "reviewExample")}). Your first one is in week 4 of this plan. The pack has 4 weeks of diary pages: before they run out, print more blank diary pages from the pack on GOV.UK.`));
  return out;
}

// ---------------------------------------------------------------- the plan
function plan(pack) {
  const hasLetter = (pack.findings || []).length > 0;
  const out = [h1("Your 4-week plan", NEW),
    p(`Every gap found in your answers${hasLetter ? " (and in your inspection letter, as you told us)" : ""} is listed here once, by topic, in our practical wording of official guidance — mainly the FSA's Safer food, better business. If your officer told you something different, follow the officer. Tick each step when done and write the date; keep photos and receipts as evidence.`),
    p([{ text: "Your SFBB pack: ", bold: true }, "under each topic, the safe method it belongs to. Where a step says 'When this is done: tick Yes on page …', we left that box blank because your answers showed a gap — tick it only when the step really is done."], { margin: [0, 2, 0, 0] })];
  if (!pack.plan.items.length) {
    out.push(framed([p("Your answers showed no gaps to fix. Follow the weekly routine below, use your SFBB pack every day, and keep it up to date when anything in your kitchen changes.")], C.accent, [0, 10, 0, 0]));
  }
  for (const w of pack.plan.weeks) {
    if (!w.groups.length) continue;
    const prog = pack.plan.programme.find((x) => x.week === w.week);
    const label = w.week === 0 ? WEEK_NAMES[0] : `${WEEK_NAMES[w.week]}${prog ? " — " + prog.title : ""}`;
    // The week's banner travels with its first topic, so a banner never ends a page on its own.
    const bannerBlock = { ...banner(label, w.week === 0 ? C.warn : C.accent), margin: [0, w.week === 0 ? 8 : 12, 0, 2] };
    w.groups.forEach((g, gi) => {
      const head = gi === 0 ? [bannerBlock] : [];
      head.push({ text: t(`${g.n}. ${g.title}`), style: "h3", margin: [0, 6, 0, 2] });
      // The owner's own account of the letter (their note, or just the ticked topic) — never the officer's words, so no quotation marks.
      for (const f of g.findings) head.push(small(f.text ? `From your inspection letter (as you told us): ${f.text}` : "Your inspection letter raised this (as you told us).", { italics: true, margin: [0, 0, 0, 2] }));
      if (g.deadlines?.length) head.push(small(`Council deadline: ${g.deadlines.join("; ")}`, { bold: true, color: C.warn }));
      // The safe methods this topic belongs to, once per topic (each step only adds the box to tick, if any).
      const related = topicPlaces(pack, g);
      if (related.length) head.push({ text: t(`In your SFBB pack: ${related.join(" · ")}`), style: "ptr", margin: [0, 0, 0, 2] });
      const rows = g.steps.map((s, j) => {
        const ptr = boxText(s);
        return {
          stack: [
            { columns: [box(), { text: t(`${g.n}.${j + 1}  ${s.text}`), style: "p" }, { text: "Done: ________", style: "small", width: 70 }], columnGap: 4 },
            ptr ? { text: t(ptr), style: "ptr", margin: [16, 0, 74, 0] } : null,
          ].filter(Boolean),
          unbreakable: true, margin: [0, 1, 0, 2],
        };
      });
      out.push({ stack: [...head, ...rows.slice(0, 1)], unbreakable: true });
      out.push(...rows.slice(1));
      if (g.escalate) out.push(small("Ask your council's food team if you are unsure what they expect for this.", { color: C.warn }));
    });
  }
  out.push({ stack: [h3("Every week, alongside the plan", { margin: [0, 14, 0, 4] }),
    { table: { widths: [92, "*"], body: pack.plan.programme.map((w) => [
      { stack: [{ text: `Week ${w.week}`, bold: true, style: "td" }, { text: t(w.title), style: "small", color: C.muted }] },
      { ul: w.fixed_tasks.map(t), style: "td" },
    ]) }, layout: { ...tableLayout, fillColor: (r, n, c) => (c === 0 ? C.soft : null) } }], unbreakable: true });
  return out;
}

// ---------------------------------------------------------------- cleaning schedule overflow
function cleaningContinued(pack, fill) {
  const rows = fill?.overflow?.cleaning || [];
  if (!rows.length) return [];
  return [
    h1("Cleaning schedule — continued", NEW),
    p(`The cleaning schedule in your SFBB pack (${pagesOf(pack, "cleaning")}) has room for 11 items. These are the rest of the items from your answers, in the same columns. Keep this page with the schedule and follow both.`),
    { table: { widths: [120, 75, 70, "*"], headerRows: 1, dontBreakRows: true, body: [
      [th("Item"), th("Frequency of cleaning"), th("Precautions"), th("Method of cleaning")],
      ...rows.map((r) => [td(r.item, { bold: true }), td(FREQ[r.freq] || r.freq), td(r.precautions), td(r.chemical)]),
      ...blankRows(Math.max(3, 14 - rows.length), 4, 18),
    ] }, layout: tableLayout, margin: [0, 6, 0, 0] },
    small(`Two-stage clean = clean first, then disinfect and leave for the contact time on the label. Dilute chemicals exactly as the label says. The 'Cleaning effectively' safe method in your SFBB pack${paren(mPages(pack, "CL2"))} explains it.`, { margin: [0, 6, 0, 0] }),
  ];
}

// ---------------------------------------------------------------- allergen matrix
function allergenMatrix(pack) {
  const al = pack.allergens;
  const dishes = pack.allergenMatrix.dishes;
  const rows = dishes.map((d) => [td(d), ...al.map(() => td(""))]);
  // Fill whole landscape pages so no page carries only a header and the "Checked by" line.
  // Measured on the sample: 19 rows fit on the first page, 20 on each next one; keep one row of slack for long dish names.
  const FIRST = 18, NEXT = 19, MIN_BLANK = 6;
  let total = FIRST;
  while (total < dishes.length + MIN_BLANK) total += NEXT;
  rows.push(...blankRows(total - dishes.length, al.length + 1, 14));
  return [
    h1("Allergen matrix", { pageBreak: "before", pageOrientation: "landscape" }),
    { table: { widths: ["*"], body: [[{ text: t("Fill this in yourself from your recipes and the labels of every ingredient (including oils, sauces and garnishes). Put an X where a dish contains the allergen. Update it whenever a recipe, ingredient or supplier changes. Rellony does not decide which allergens are in your food. The 'Managing food allergen information' safe method in your SFBB pack" + paren(mPages(pack, "MG4")) + " explains what you must do."), style: "warnText", fillColor: C.warnSoft }]] }, layout: "noBorders", margin: [0, 0, 0, 6] },
    { table: { headerRows: 1, widths: [160, ...al.map(() => "*")], body: [[th("Dish"), ...al.map((a) => th(ALLERGEN_ABBR[a.id] || a.name, { fontSize: 6.5, alignment: "center" }))], ...rows] }, layout: tableLayout },
    small("Checked by: ____________________   Date: ____________   Next review: ____________", { margin: [0, 6, 0, 0] }),
  ];
}

// ---------------------------------------------------------------- optional fridge and freezer log
function optionalLog(pack) {
  const r = pack.records || {};
  const nF = Math.max(0, r.fridges ?? 0), nZ = Math.max(0, r.freezers ?? 0);
  let cols = [];
  for (let i = 1; i <= nF; i++) cols.push(`Fridge ${i}`);
  for (let i = 1; i <= nZ; i++) cols.push(`Freezer ${i}`);
  if (!cols.length || cols.length > 8) cols = Array.from({ length: Math.min(8, Math.max(4, cols.length)) }, () => "Unit: ______");
  const day0 = pack.meta.programme?.day0;
  const dayLabel = (i) => {
    if (!day0) return "____/____";
    const d = addDays(day0, i);
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
  };
  // A general recommendation and the officer's own point are kept apart: when the confirmed letter mentions
  // temperature records (library C03), this log is part of the plan, not optional.
  const asked = (pack.findings || []).some((f) => (f.lib || []).includes("C03"));
  const intro = asked
    ? `Your inspection letter (as you told us) raises temperature records, so keep this log every day — it is a step in your plan. If your officer asked for something more, follow the officer. For reference, SFBB itself asks you to check your fridges and chilled displays at least once a day, starting with your opening checks (${cite(pack, "fridgeDaily")}), and to write in the diary when something goes wrong.`
    : `SFBB doesn't require this log: it asks you to check your fridges and chilled displays at least once a day, starting with your opening checks (${cite(pack, "fridgeDaily")}), and to write in the diary when something goes wrong. Some owners also write down one reading a day as extra evidence of their checks.`;
  return [
    h1(asked ? "Daily fridge and freezer log" : "Optional: daily fridge and freezer log", { pageBreak: "before", pageOrientation: "landscape" }),
    small(`${intro} Fridges: food at 8°C or below (set at 5°C or below). Freezers: -18°C or below.`, { margin: [0, 0, 0, 4], bold: asked }),
    { table: { headerRows: 1, widths: [62, ...cols.map(() => "*"), 150, 32], body: [
      [th("Day"), ...cols.map((c) => th(c, { alignment: "center" })), th("If out of range: what you did"), th("Init.")],
      ...Array.from({ length: 28 }, (_, i) => [td(dayLabel(i), { fontSize: 7 }), ...cols.map(() => td("")), td(""), td("")]),
    ] }, layout: { ...tableLayout, paddingTop: () => 2.2, paddingBottom: () => 2.2 } },
  ];
}

// ---------------------------------------------------------------- about
function about(pack) {
  const sf = pack.meta.sfbb;
  const hasLetter = (pack.findings || []).length > 0;
  return [h1("About this plan", { pageBreak: "before", pageOrientation: "portrait" }),
    p(pack.meta.attribution),
    p(`Safer food, better business for caterers: ${pack.meta.sourcePage}`),
    p(`This plan was made by Rellony's software, using fixed rules, from your answers${hasLetter ? " (and what you told us your council's letter says)" : ""}. No one from Rellony has seen or assessed your premises. It is information to help you comply, not legal advice, and it cannot guarantee any food hygiene rating — the officer decides at inspection. Where your officer's instructions differ from this plan, follow the officer.`),
    p("Your SFBB pack is the FSA's own PDF from GOV.UK, unaltered: only its form boxes were filled in, on your device, from your answers. You, as the food business operator, are responsible for checking that it describes what really happens in your kitchen, completing it and following it."),
    p("Allergen information is never decided by Rellony or by software: fill in the allergen matrix from your own recipes and labels."),
    scopeBox(pack),
    small(`Made by ${pack.meta.generator} (question bank ${pack.meta.bankVersion}${sf ? `, SFBB map ${sf.mapVersion} for ${sf.file}` : ""}) on ${fmtDate(pack.meta.packDate)}.`, { color: C.muted, margin: [0, 8, 0, 0] })];
}

// ---------------------------------------------------------------- document
export function buildDocDefinition(pack, fill = null) {
  const name = t(pack.business?.name || "");
  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [40, 46, 40, 46],
    info: { title: `${name} — Rescue plan`, author: "Rellony", subject: "4-week plan to go with the owner's Safer food, better business pack" },
    header: (page) => (page === 1 ? null : { columns: [{ text: `${name} — Rescue plan`, style: "hdr" }, { text: "Keep with your SFBB pack", style: "hdr", alignment: "right" }], margin: [40, 20, 40, 0] }),
    footer: (page, pages) => ({ columns: [
      { text: "Made by Rellony from your answers. Not produced or endorsed by the Food Standards Agency.", style: "ftr", width: "*" },
      { text: `${page} / ${pages}`, style: "ftr", alignment: "right", width: 50 },
    ], margin: [40, 12, 40, 0] }),
    content: [
      ...cover(pack), ...whereYouStand(pack), ...howToUse(pack, fill), ...plan(pack), ...cleaningContinued(pack, fill),
      ...allergenMatrix(pack), ...optionalLog(pack), ...about(pack),
    ],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.18, color: "#111" },
    styles: {
      kicker: { fontSize: 8, bold: true, color: C.accent, characterSpacing: 1 },
      title: { fontSize: 26, bold: true, color: "#111", margin: [0, 0, 0, 2] },
      h1: { fontSize: 16, bold: true, color: C.accent, margin: [0, 0, 0, 8] },
      h3: { fontSize: 9.5, bold: true, margin: [0, 6, 0, 2] },
      bannerText: { fontSize: 10.5, bold: true, color: "#ffffff", margin: [4, 2, 4, 2] },
      p: { fontSize: 9, margin: [0, 0, 0, 3] },
      small: { fontSize: 7.5, color: "#222" },
      ptr: { fontSize: 7, color: C.accent, italics: true },
      num: { fontSize: 11, bold: true, color: C.accent },
      bigNum: { fontSize: 16, bold: true, color: C.accent },
      th: { fontSize: 7.5, bold: true },
      td: { fontSize: 8 },
      hdr: { fontSize: 7, color: C.muted },
      ftr: { fontSize: 6.5, color: C.muted },
      warnBox: { fontSize: 8.5, bold: true, color: C.warn },
      warnText: { fontSize: 8.5, bold: true, color: C.warn, margin: [6, 4, 6, 4] },
    },
  };
}
