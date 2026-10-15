// Rellony Rescue — deterministic pack generator (no AI, no network, no dependencies).
// Runs in the browser, Deno (Supabase Edge Functions) and Node 18+.
//
//   import { buildPreview, buildPack, evalCond, fhrsRating } from "./rescue-generator.mjs";
//
// Inputs are plain JSON. Nothing here decides allergens, ratings or legal outcomes.

// ---------------------------------------------------------------- FHRS table
/** FHRS Brand Standard (Rev 8) Table 3. Verified against 7,631 FSA records, 0 mismatches. */
export function fhrsRating(h, s, c) {
  const t = h + s + c, m = Math.max(h, s, c);
  if (t <= 15 && m <= 5) return 5;
  if (t <= 20 && m <= 10) return 4;
  if (t <= 30 && m <= 10) return 3;
  if (t <= 40 && m <= 15) return 2;
  if (t <= 50 && m <= 20) return 1;
  return 0;
}

/** What the table says if only the management score changed to `c2` (a rule, not a forecast). */
export function managementCounterfactual(scores, c2 = 10) {
  if (!scores) return null;
  const { hygiene: h, structure: s, management: c } = scores;
  if ([h, s, c].some((v) => typeof v !== "number")) return null;
  return { current: fhrsRating(h, s, c), withManagement: c2, result: fhrsRating(h, s, c2) };
}

// ---------------------------------------------------------------- dates
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/**
 * Programme dates from the day the pack is released (day 0).
 * Weekly emails on days 3, 7, 14, 21; final email + self-check on day 28 (programme ends);
 * email support until day 35; pack and tools available for 12 months.
 */
export function programmeDates(day0) {
  if (!day0 || !/^\d{4}-\d{2}-\d{2}$/.test(day0)) return null;
  return {
    day0,
    emails: [3, 7, 14, 21, 28].map((n) => ({ day: n, date: addDays(day0, n) })),
    selfCheckDay: addDays(day0, 28),
    endsAt: addDays(day0, 28),
    supportEndsAt: addDays(day0, 35),
    accessUntil: addMonths(day0, 12),
  };
}

// ---------------------------------------------------------------- conditions
const ATOM = /^(!?)([pa])\.(.+)\.([A-Za-z0-9_+\-]+)$/;

// An answer holds `val`: a plain value, a list, "Something else" on a choice ({ value: "other", other })
// or on a multi ({ values, other } — "other" holds when its text isn't empty).
function has(v, val) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.includes(val);
  if (typeof v === "object" && Array.isArray(v.values)) return v.values.includes(val) || (val === "other" && !!clean(v.other));
  if (typeof v === "object" && v.value !== undefined) return v.value === val;
  return String(v) === val;
}

/** Evaluate "p.proc.rice || a.CC6.q3.yes && !p.equip.probe". */
export function evalCond(expr, ctx) {
  if (!expr || expr === "always") return true;
  return expr.split("||").some((disj) =>
    disj.split("&&").every((raw) => {
      const m = ATOM.exec(raw.trim());
      if (!m) throw new Error(`bad condition atom: ${raw}`);
      const [, neg, kind, ref, val] = m;
      const src = kind === "p" ? ctx.profile?.["p." + ref] : ctx.answers?.[ref];
      const r = has(src, val);
      return neg ? !r : r;
    })
  );
}

// ---------------------------------------------------------------- text helpers
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const sentence = (s) => {
  s = clean(s);
  if (!s) return "";
  s = s[0].toUpperCase() + s.slice(1);
  return /[.!?]$/.test(s) ? s : s + ".";
};
function joinList(parts) {
  parts = parts.filter(Boolean);
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

// ---------------------------------------------------------------- core evaluation
function ctxOf(input) {
  return { profile: input.profile || {}, answers: input.answers || {} };
}

/**
 * Evaluate one question (whose show_if is already true): the sentences it writes, the gaps it creates,
 * whether it is unanswered, and `parts` — the sentence for each ticked item / chosen option, so the
 * official-pack fill can use exactly the same wording for a single row.
 */
export function evalQuestion(q, ctx) {
  const res = { statements: [], gaps: [], missing: false, parts: [] };
  const a = ctx.answers[q.id];
  const unanswered = a === undefined || a === null || (typeof a === "string" && !a.trim());
  const addGap = (g, extra = {}) => g && res.gaps.push({ ...g, ...extra });
  const say = (id, text) => { const t = sentence(text); if (!t) return; res.statements.push(t); res.parts.push({ id, text: t }); };

  switch (q.type) {
    case "check": {
      if (unanswered) { res.missing = true; break; }
      const ticked = new Set(Array.isArray(a) ? a : []);
      for (const item of q.items) {
        if (!evalCond(item.show_if, ctx)) continue;
        if (ticked.has(item.id)) say(item.id, item.out);
        else addGap(item.gap, { item: item.id, was: item.label });
      }
      break;
    }
    case "choice": {
      if (unanswered) { if (!q.optional) res.missing = true; break; }
      const v = typeof a === "object" ? a.value : a;
      const o = q.options.find((x) => x.v === v);
      if (!o && v === "other" && a.other) { say("other", a.other); break; }
      if (!o) { res.missing = true; break; }
      if (o.out) say(o.v, o.out);
      if (o.gap) addGap(o.gap, { option: o.v, was: o.label });
      break;
    }
    case "multi": {
      if (unanswered) { if (!q.optional) res.missing = true; break; }
      const vals = Array.isArray(a) ? a : (a.values || []);
      const other = typeof a === "object" && !Array.isArray(a) ? clean(a.other) : "";
      const chosen = q.options.filter((o) => vals.includes(o.v) && evalCond(o.show_if, ctx));
      if (!chosen.length && !other) {
        if (q.gap_if_none) addGap(q.gap_if_none, { option: "none" });
        break;
      }
      if (q.out_prefix) {
        const parts = chosen.map((o) => o.out || o.label);
        if (other) parts.push(other);
        const t = sentence(q.out_prefix + joinList(parts));
        res.statements.push(t);
        chosen.forEach((o) => res.parts.push({ id: o.v, text: sentence(o.out || o.label) }));
        if (other) res.parts.push({ id: "other", text: sentence(other) });
      } else {
        chosen.forEach((o) => o.out && say(o.v, o.out));
        if (other) say("other", other);
      }
      chosen.forEach((o) => o.gap && addGap(o.gap, { option: o.v }));
      break;
    }
    case "text": {
      if (unanswered) {
        if (q.gap_if_empty) addGap(q.gap_if_empty, { option: "empty" });
        else if (!q.optional) res.missing = true;
        break;
      }
      const v = clean(a).slice(0, q.max_len || 200);
      say("value", q.out.replace("{value}", v));
      res.value = v;
      break;
    }
    default:
      // structured types (schedule, menu, checklist_edit, extra_checks, suppliers) are rendered elsewhere
      break;
  }
  return res;
}

/** Evaluate one method: is it relevant, what we write, what gaps it creates, what is unanswered. */
function evalMethod(m, ctx) {
  const out = { id: m.id, title: m.title, section: m.section, applies: evalCond(m.applies, ctx), statements: [], gaps: [], missing: [] };
  if (!out.applies) return out;
  for (const q of m.questions) {
    if (!evalCond(q.show_if, ctx)) continue;
    const r = evalQuestion(q, ctx);
    out.statements.push(...r.statements);
    for (const g of r.gaps) out.gaps.push({ ...g, method: m.id, methodTitle: m.title, question: q.id });
    if (r.missing) out.missing.push(q.id);
  }
  return out;
}

/** Special gap rule for acrylamide (CK7): each missing core step becomes an action. */
function acrylamideGaps(m, ctx) {
  if (m.id !== "CK7" || !evalCond(m.applies, ctx)) return [];
  const a = ctx.answers["CK7.q1"];
  const vals = Array.isArray(a) ? a : a?.values || [];
  const core = [
    ["golden", "Cook potato and bakery products to a golden yellow or lighter colour."],
    ["below175", "Deep-fry below 175°C (check the fryer thermostat)."],
    ["oil_change", "Filter and change oil, and clean fryers, as often as needed."],
  ];
  if (!ctx.profile["p.proc"]?.includes?.("fry_chips")) core.splice(1, 2);
  return core
    .filter(([v]) => !vals.includes(v))
    .map(([v, fix]) => ({ sev: 2, fix, method: "CK7", methodTitle: m.title, question: "CK7.q1", option: v }));
}

// ---------------------------------------------------------------- "How we do this" when there are no statements
/**
 * A released pack is only made after every question is answered, so "not answered" is never true.
 * Some methods keep their answers on their own page (schedule, menu, extra checks); otherwise an empty
 * "How we do this" means nothing is in place yet (the steps are in "Still to do"), or the owner writes it in.
 */
const HOW_ELSEWHERE = {
  CL4: "Your cleaning schedule is on its own page in this pack (\"Cleaning schedule\").",
  CK4: "Your dishes and how you check each type are on the \"Checking your menu\" page in this pack.",
  MG2: "Your extra checks and how often you do them are on the \"Opening and closing checks\" page in this pack.",
};
function howNote(m, actions) {
  if (m.statements.length) return null;
  if (HOW_ELSEWHERE[m.id]) return HOW_ELSEWHERE[m.id];
  if (actions.length) return "Nothing is in place for this yet — the steps are under \"Still to do\".";
  return "Your answers didn't describe this. Write here how you do it:";
}

// ---------------------------------------------------------------- letter hints
/**
 * Which questionnaire screens a confirmed council-letter finding relates to (via shared library IDs).
 * Answers are NEVER pre-filled from the letter: the system must describe the kitchen today, and the
 * letter describes what the officer saw on the day. The hint just reminds the owner while answering.
 */
/**
 * v1 letter path (no AI, decided 12 Oct 2026): the owner ticks what their council's letter says
 * (`rescue-letter-checklist.json`). Returns findings for buildPack/findingHints and the gate flags for buildPreview.
 * ticks = { items: { H01: { note?, deadline? }, ... }, other: ["..."], gates: { notice: bool, harm: bool } }
 */
export function findingsFromChecklist(checklist, ticks) {
  const known = new Map(checklist.groups.flatMap((g) => g.items.map((i) => [i.lib, { ...i, element: g.element }])));
  const max = (x, n) => clean(x).slice(0, n);
  const findings = [];
  let n = 0;
  for (const [libId, v] of Object.entries(ticks?.items || {})) {
    const it = known.get(libId);
    if (!it) continue;                                   // only the checklist's own topics
    const f = { id: `F${++n}`, lib: [libId], element: it.element, text: max(v?.note, checklist.per_item?.note?.max || 140) };
    if (v?.deadline) f.deadline = max(v.deadline, 40);
    findings.push(f);
  }
  for (const o of (ticks?.other || []).slice(0, checklist.other?.repeatable || 3)) {
    const text = max(o, checklist.other?.max || 140);
    if (text) findings.push({ id: `F${++n}`, lib: [], element: null, text });   // plan: follow the officer's instructions
  }
  return { findings, letter: { formalAction: !!ticks?.gates?.notice, harmMentioned: !!ticks?.gates?.harm } };
}

export function findingHints(bank, findings) {
  const out = {};
  for (const sc of bank.screens) {
    const libs = new Set();
    for (const m of bank.methods.filter((x) => sc.methods.includes(x.id))) {
      (m.lib || []).forEach((l) => libs.add(l));
      for (const q of m.questions) {
        [...(q.items || []), ...(q.options || [])].forEach((x) => x.gap?.lib && libs.add(x.gap.lib));
        if (q.gap_if_none?.lib) libs.add(q.gap_if_none.lib);
      }
    }
    const hits = (findings || []).filter((f) => (f.lib || []).some((l) => libs.has(l)));
    if (hits.length) out[sc.id] = hits.map((f) => ({ id: f.id, text: clean(f.text) }));
  }
  return out;
}

// ---------------------------------------------------------------- preview (free part)
/**
 * @param bank   rescue-sfbb-bank.json
 * @param input  { profile, answers, fsa: {rating, scores:{hygiene,structure,management}}, letter: {formalAction, ratingOnLetter} }
 */
export function buildPreview(bank, input) {
  const ctx = ctxOf(input);
  const gates = [];
  const type = bank.profile.find((q) => q.id === "p.type").options.find((o) => o.v === ctx.profile["p.type"]);
  if (type?.scope === "out") gates.push({ id: "G5", reason: "out_of_scope", detail: type.label });
  if (ctx.profile["p.formal"] === "yes" || input.letter?.formalAction) gates.push({ id: "G2", reason: "formal_action" });
  if (input.letter?.harmMentioned) gates.push({ id: "G6", reason: "harm_mentioned" });
  const rating = input.fsa?.rating ?? input.letter?.ratingOnLetter;
  if (rating === 0) gates.push({ id: "G1", reason: "rating_0" });
  if (rating === 5) gates.push({ id: "G8", reason: "rating_5" });

  // A profile gap becomes urgent (and joins the officer's topic) when a confirmed letter finding raises it,
  // e.g. no probe thermometer + the officer's point about how cooking is checked (H09).
  const findingLibs = new Set((input.findings || []).flatMap((f) => f.lib || []));
  const profileGaps = bank.profile_gaps.filter((g) => evalCond(g.when, ctx)).map((g) => {
    const hit = (g.urgent_if_finding || []).find((id) => findingLibs.has(id));
    return hit ? { ...g, urgent: true, lib: hit, raisedBy: hit } : g;
  });
  const free = bank.screens.filter((s) => s.free).flatMap((s) => s.methods);
  const evaluated = bank.methods.filter((m) => free.includes(m.id)).map((m) => evalMethod(m, ctx));
  const freeGaps = evaluated.flatMap((e) => e.gaps);
  const applicable = bank.methods.filter((m) => evalCond(m.applies, ctx));
  return {
    canBuy: gates.length === 0,
    gates,
    scores: input.fsa?.scores || null,
    counterfactual: managementCounterfactual(input.fsa?.scores),
    profileGaps,
    freeGaps,
    counts: {
      urgent: [...profileGaps, ...freeGaps].filter((g) => g.urgent).length,
      sev1: [...profileGaps, ...freeGaps].filter((g) => g.sev === 1).length,
      applicableMethods: applicable.length,
      totalMethods: bank.methods.length,
    },
    missing: evaluated.flatMap((e) => e.missing),
  };
}

// ---------------------------------------------------------------- full pack
/**
 * @param bank    rescue-sfbb-bank.json
 * @param library rescue-library.json
 * @param input   {
 *   business: {name, address, postcode, type},
 *   council:  {name, email, phone, revisit_fee, revisit_fee_source, form_url} | null,
 *   fsa:      {rating, ratingDate, scores:{hygiene,structure,management}} | null,
 *   profile, answers,
 *   findings: [{id, text, element, lib:[ids], deadline?}]   // owner-confirmed, from the council letter (optional)
 *   dishes:   ["Chicken tikka masala", ...]                  // names only (optional)
 *   suppliers:[{name, goods, days}]                          // business names only (optional)
 *   packDate: "2026-10-23"
 * }
 */
export function buildPack(bank, library, input, fieldmap = null) {
  const ctx = ctxOf(input);
  const lib = Object.fromEntries(library.entries.map((e) => [e.id, e]));
  const preview = buildPreview(bank, input);

  const methods = bank.methods.map((m) => {
    const e = evalMethod(m, ctx);
    e.gaps.push(...acrylamideGaps(m, ctx));
    return { def: m, ...e };
  });
  const missing = methods.flatMap((m) => m.missing);

  // ---- plan: every gap (profile, answers, letter) is grouped by topic (library entry, else safe method)
  const groups = new Map();
  const allSteps = new Set();
  const repeats = new WeakSet();   // steps whose words another topic already has (merged below)
  const groupFor = (key, title, libId, methodId) => {
    if (!groups.has(key)) {
      groups.set(key, { key, title, lib: libId || null, methods: new Set(), sev: 3, urgent: false, escalate: false,
                        steps: [], findings: [], sources: new Set(), deadlines: [] });
    }
    const g = groups.get(key);
    if (methodId) g.methods.add(methodId);
    return g;
  };
  const addStep = (g, text, sev, urgent, source, methodId = null, ref = null) => {
    const t = sentence(text);
    g.sev = Math.min(g.sev, sev);
    g.urgent = g.urgent || !!urgent;
    g.sources.add(source);
    // The same words twice in one topic: one step, both answers (merged across topics further down).
    const same = g.steps.find((s) => s.text === t);
    if (same) { same.also = [...(same.also || []), { method: methodId, ref }]; same.urgent ||= !!urgent; same.sev = Math.min(same.sev, sev); return; }
    const step = { text: t, sev, urgent: !!urgent, source, method: methodId, ref };
    if (allSteps.has(t)) repeats.add(step);
    allSteps.add(t);
    // ref = the answer that created the step (question + item/option), so the plan can point to the
    // matching box in the official SFBB pack ("tick Yes on page N when done").
    g.steps.push(step);
  };
  const keyOf = (libId, methodId) => (libId && lib[libId] ? "L:" + libId : "M:" + methodId);
  const titleOf = (libId, fallback) => (libId && lib[libId] ? lib[libId].title : fallback);

  for (const g of preview.profileGaps) {
    const grp = groupFor(keyOf(g.lib, g.id), titleOf(g.lib, g.title), g.lib, null);
    grp.escalate = grp.escalate || !!g.escalate;
    addStep(grp, g.action || g.detail, g.sev, g.urgent, "profile", null, g.pack_part ? { part: g.pack_part } : null);
  }
  for (const m of methods) {
    for (const g of m.gaps) {
      const grp = groupFor(keyOf(g.lib, m.id), titleOf(g.lib, m.title), g.lib, m.id);
      grp.escalate = grp.escalate || !!g.escalate;
      addStep(grp, g.fix, g.sev, g.urgent, "answers", m.id, { q: g.question, opt: g.item || g.option || null });
    }
  }
  for (const f of input.findings || []) {
    const ids = (f.lib || []).filter((id) => lib[id]);
    const primary = ids[0] || null;
    const grp = groupFor(keyOf(primary, "LETTER"), primary ? lib[primary].title : "From your inspection letter", primary, null);
    grp.findings.push({ id: f.id, text: clean(f.text), element: f.element || null });
    grp.sources.add("letter");
    if (f.deadline) grp.deadlines.push(clean(f.deadline));
    grp.sev = Math.min(grp.sev, primary ? lib[primary].priority : 2);
    if (!ids.length) {
      addStep(grp, "Follow the officer's instructions in your letter for this point; ask the officer if anything is unclear.", 2, false, "letter");
    }
    // Library steps only where the owner's answers produced no specific steps for this topic.
    for (const id of ids) {
      const target = groupFor(keyOf(id, "LETTER"), lib[id].title, id, null);
      if (target !== grp) { target.sources.add("letter"); target.sev = Math.min(target.sev, lib[id].priority); }
      // C01 (written system) is what this pack delivers, so its generic library steps are never added.
      if (id !== "C01" && !target.steps.some((s) => !repeats.has(s))) {
        for (const d of lib[id].do_now || []) addStep(target, d, lib[id].priority, false, "letter");
      }
      // Steps the letter itself calls for are always added, even when the answers already gave steps for this
      // topic (e.g. the officer noted missing temperature records, which SFBB alone would not require).
      for (const s of lib[id].on_finding || []) addStep(target, s.text, 1, false, "letter", null, s.part ? { part: s.part } : null);
    }
  }

  // Week rule: urgent -> today; food-safety topics (library priority 1) with a sev-1 step -> week 1;
  // other sev-1/sev-2 topics -> week 2; the rest -> week 3. Keeps week 1 focused on risk.
  const prio = (g) => (g.lib && lib[g.lib] ? lib[g.lib].priority : 2);
  const weekOf = (g) => (g.urgent ? 0 : g.sev === 1 && prio(g) === 1 ? 1 : g.sev <= 2 ? 2 : 3);
  const ordered = [...groups.values()]
    .map((g) => ({
      ...g,
      methods: [...g.methods],
      sources: [...g.sources],
      week: weekOf(g),
      steps: g.steps.sort((a, b) => (b.urgent - a.urgent) || a.sev - b.sev),
      evidence: g.lib && lib[g.lib] ? lib[g.lib].evidence : null,
      libPriority: g.lib && lib[g.lib] ? lib[g.lib].priority : 3,
    }))
    .sort((a, b) => a.week - b.week || a.libPriority - b.libPriority || a.title.localeCompare(b.title));
  // One action, one step: SFBB gives some advice under several safe methods (bank 1.2.1 words it the same
  // way each time), so the same step can come from several answers. It is listed once, in the earliest
  // topic of the plan, and keeps every answer it came from — its pointer names each box it fills.
  const firstOf = new Map();
  for (const g of ordered) {
    g.steps = g.steps.filter((s) => {
      const first = firstOf.get(s.text);
      if (!first) { firstOf.set(s.text, s); return true; }
      first.also = [...(first.also || []), { method: s.method, ref: s.ref }, ...(s.also || [])];
      first.urgent ||= s.urgent;
      first.sev = Math.min(first.sev, s.sev);
      return false;
    });
  }
  const planGroups = ordered.filter((g) => g.steps.length || g.findings.length);
  planGroups.forEach((g, i) => (g.n = i + 1));
  // Flat list of steps, numbered within groups (e.g. 3.2), for web checkboxes and the method pages.
  // Each step points to its place in the owner's official SFBB pack (when a fieldmap is given); a merged
  // step also lists the other places (sfbbAlso), each once.
  const placeKey = (x) => `${x.mode}|${x.where}|${x.label}`;
  for (const g of planGroups) for (const s of g.steps) {
    s.sfbb = sfbbPointer(fieldmap, bank, s);
    const seen = new Set(s.sfbb ? [placeKey(s.sfbb)] : []);
    const also = (s.also || []).map((a) => {
      const x = sfbbPointer(fieldmap, bank, a);
      return x && { ...x, method: a.method || null };
    }).filter((x) => x && !seen.has(placeKey(x)) && seen.add(placeKey(x)));
    delete s.also;
    if (also.length) s.sfbbAlso = also;
  }
  const items = planGroups.flatMap((g) =>
    g.steps.map((s, j) => ({ n: `${g.n}.${j + 1}`, group: g.n, week: g.week, action: s.text, urgent: s.urgent, sev: s.sev,
                             source: s.source, method: s.method, ref: s.ref || null, sfbb: s.sfbb || null,
                             ...(s.sfbbAlso ? { sfbbAlso: s.sfbbAlso } : {}), lib: g.lib, title: g.title }))
  );

  // ---- structured parts
  const cleaning = buildCleaning(bank, ctx);
  const menu = buildMenu(bank, ctx);
  const checks = buildChecks(bank, ctx);
  const extra = bank.diary.extra_checks
    .filter((x) => evalCond(x.show_if, ctx))
    .map((x) => ({ ...x, freq: ctx.answers["MG2.q1"]?.[x.id] || x.default }));

  const staffBand = ctx.profile["p.staff"] || "2-3";
  const staffSlots = { "1": 2, "2-3": 4, "4-6": 6, "7+": 10 }[staffBand] || 4;

  const applicable = methods.filter((m) => m.applies);
  const evidence = planGroups.filter((g) => g.evidence).map((g) => ({ group: g.n, title: g.title, evidence: g.evidence }));

  return {
    meta: {
      generator: "rellony-rescue-generator 1.3.0",
      bankVersion: bank.version,
      packDate: input.packDate,
      programme: programmeDates(input.packDate),
      attribution: bank.source.attribution,
      sourcePage: bank.source.page,
      // The official pack this plan points to (page numbers are the PDF's own page numbers).
      sfbb: fieldmap ? { file: fieldmap.pack.file, url: fieldmap.pack.url, page: fieldmap.pack.page, pages: fieldmap.pack.pages,
                         mapVersion: fieldmap.version, parts: fieldmap.parts, cites: fieldmap.cites || {},
                         methodPages: Object.fromEntries(bank.methods.map((m) => [m.id, m.sfbb_pages])) } : null,
    },
    business: input.business,
    council: input.council || null,
    fsa: input.fsa || null,
    counterfactual: managementCounterfactual(input.fsa?.scores),
    gates: preview.gates,
    missing,
    plan: {
      groups: planGroups,
      items,
      weeks: [0, 1, 2, 3].map((w) => ({ week: w, groups: planGroups.filter((g) => g.week === w) })),
      counts: { groups: planGroups.length, steps: items.length, urgent: items.filter((i) => i.urgent).length },
      programme: bank.programme,
    },
    sections: bank.sections.map((s) => ({
      ...s,
      methods: applicable.filter((m) => m.section === s.id).map((m) => {
        const actions = items.filter((i) => i.method === m.id).map((i) => ({ n: i.n, week: i.week, action: i.action, urgent: i.urgent }));
        return {
          id: m.id, title: m.title, pages: m.def.sfbb_pages, pdf: m.def.pdf, intro: m.def.intro,
          points: m.def.points, statements: m.statements, how_note: howNote(m, actions),
          actions,
          if_wrong: m.def.if_wrong, stop_again: m.def.stop_again,
          check_it: m.def.check_it || null, prove_it: m.def.prove_it || null,
          think_twice: m.def.think_twice || [], manage: m.def.manage || [],
        };
      }),
    })).filter((s) => s.methods.length),
    notRelevant: methods.filter((m) => !m.applies).map((m) => ({ id: m.id, title: m.title })),
    completion: bank.methods.map((m) => ({ id: m.id, title: m.title, section: m.section,
      relevant: !!methods.find((x) => x.id === m.id)?.applies })),
    menu,
    cleaning,
    cleaningMethods: bank.cleaning_methods,
    checks,
    extraChecks: extra,
    fourWeekly: bank.diary.four_weekly_review,
    briefings: bank.briefings,
    allergens: bank.allergens_14,
    // dish names: the owner's list on P3 (bank 1.2.0, MG4.q9), or input.dishes where a caller passes them
    allergenMatrix: { dishes: dishNames(input.dishes || ctx.answers["MG4.q9"]), blankRows: 20 },
    records: {
      fridges: Math.max(0, Number(ctx.profile["p.fridges"] ?? 2)),
      freezers: Math.max(0, Number(ctx.profile["p.freezers"] ?? 1)),
      staffSlots,
      suppliers: (input.suppliers || ctx.answers["MG7.q2"] || []).map((s) => ({ name: clean(s.name), goods: clean(s.goods), days: s.days || [] })).filter((s) => s.name),
      pestContractor: clean(ctx.answers["CC6.q4"] || ""),
      diaryWeeks: 4,
    },
    evidence,
    findings: (input.findings || []).map((f) => ({ ...f, text: clean(f.text) })),
  };
}

// Dish names for the allergen matrix: names only, each once (ignoring case), at most 80.
function dishNames(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(clean).filter((d) => {
    const k = d.toLowerCase();
    if (!d || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 80);
}

function buildCleaning(bank, ctx) {
  const ans = ctx.answers["CL4.q1"]; // [{id, on, freq}] or undefined
  const byId = Object.fromEntries((Array.isArray(ans) ? ans : []).map((x) => [x.id, x]));
  const product = clean(ctx.answers["CL2.q3"] || "");
  // Keep the schedule consistent with the owner's fridge-cleaning answer (CL2.q7).
  const fridgeFreq = { weekly: "weekly", fortnightly: "fortnightly", monthly: "monthly" }[ctx.answers["CL2.q7"]];
  const chem = (disinfect) => (disinfect
    ? (product ? `Detergent, then ${product} (contact time as the label says)` : "Detergent, then disinfectant/sanitiser (BS EN 1276 or 13697)")
    : "Detergent");
  const rows = bank.cleaning_items
    .filter((c) => evalCond(c.show_if, ctx))
    .filter((c) => (byId[c.id] ? byId[c.id].on !== false : !c.optional))
    .map((c) => ({
      item: c.item,
      freq: byId[c.id]?.freq || (c.id === "fridges" && fridgeFreq) || c.freq,
      disinfect: c.disinfect,
      precautions: c.disinfect ? "Wear gloves" : "",
      method: bank.cleaning_methods[c.method],
      methodKey: c.method,
      chemical: chem(c.disinfect),
    }));
  // The owner's own items: the same wording as the listed items (never "as above" — rows can move to another page).
  for (const x of Array.isArray(ans) ? ans : []) {
    if (x.custom && x.item) rows.push({ item: clean(x.item), freq: x.freq || "daily", disinfect: !!x.disinfect, precautions: x.disinfect ? "Wear gloves" : "",
                                        method: bank.cleaning_methods.general, methodKey: "general", chemical: chem(!!x.disinfect) });
  }
  return rows;
}

function buildMenu(bank, ctx) {
  const ans = ctx.answers["CK4.q1"]; // [{v, examples}]
  if (!Array.isArray(ans)) return [];
  return ans
    .map((x) => {
      const def = bank.menu_checks.find((m) => m.v === x.v);
      return def ? { type: def.label, examples: clean(x.examples) || def.eg, check: def.check, note: def.note || null } : null;
    })
    .filter(Boolean);
}

function buildChecks(bank, ctx) {
  const ans = ctx.answers["MG1.q1"] || {};
  const add = (arr) => (Array.isArray(arr) ? arr.map(clean).filter(Boolean).slice(0, 8) : []);
  return {
    opening: [...bank.diary.opening_checks, ...add(ans.opening_add)],
    closing: [...bank.diary.closing_checks, ...add(ans.closing_add)],
  };
}

// ---------------------------------------------------------------- official SFBB pack: fill instructions
/**
 * What to write into the FSA's official "Safer food, better business for caterers" pack for this owner.
 * Applied on the owner's device by rescue-sfbb-fill.mjs. Integrity rules (rescue-sfbb-fieldmap.json):
 *  - "Yes" only where the owner says they already do exactly what the pack asks; gaps stay blank and go to the plan;
 *  - "No" only for neutral facts (e.g. no dishwasher); text = the generator's own sentences for that answer;
 *  - methods that don't apply get the pack's own "not relevant" tick; nothing else is invented.
 * Returns { text: {field: value}, check: [field], overflow: {cleaning: [...], suppliers: [...]}, refs }.
 */
const FREQ_LABEL = { after_use: "After each use", shift: "Every shift", daily: "Daily", weekly: "Weekly", fortnightly: "Every 2 weeks", monthly: "Monthly", quarterly: "Every 3 months" };
const DAY_KEYS = { mon: "Mon", monday: "Mon", tue: "Tue", tues: "Tue", tuesday: "Tue", wed: "Wed", wednesday: "Wed", thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu", fri: "Fri", friday: "Fri", sat: "Sat", saturday: "Sat", sun: "Sun", sunday: "Sun" };

export function buildFill(bank, fieldmap, input, pack) {
  const ctx = ctxOf(input);
  const applies = Object.fromEntries(bank.methods.map((m) => [m.id, evalCond(m.applies, ctx)]));
  const qInfo = new Map(bank.methods.flatMap((m) => m.questions.map((q) => [q.id, { q, m }])));
  const cache = new Map();
  const result = (qid) => {
    if (!cache.has(qid)) {
      const info = qInfo.get(qid);
      const shown = info && applies[info.m.id] && evalCond(info.q.show_if, ctx);
      cache.set(qid, shown ? evalQuestion(info.q, ctx) : null);
    }
    return cache.get(qid);
  };
  const extraFreq = Object.fromEntries((pack.extraChecks || []).map((x) => [x.id, x.freq]));
  const atom = (raw) => {
    const t = raw.trim();
    const neg = t.startsWith("!");
    const a = neg ? t.slice(1) : t;
    let r;
    if (a.startsWith("$applies.")) r = !!applies[a.slice(9)];
    else if (a.startsWith("$extra.")) r = !!extraFreq[a.slice(7)];
    else if (a === "$cleaning") r = (pack.cleaning || []).length > 0;
    else {
      const m = ATOM.exec(a);
      if (!m) throw new Error(`bad fill condition: ${raw}`);
      const [, , kind, ref, val] = m;
      r = has(kind === "p" ? ctx.profile?.["p." + ref] : ctx.answers?.[ref], val);
    }
    return neg ? !r : r;
  };
  const cond = (expr) => !expr || expr.split("||").some((d) => d.split("&&").every(atom));
  const textOf = (src) => {
    if (!src) return "";
    if (src.value !== undefined) return src.value;
    if (src.all) return src.all.map(textOf).filter(Boolean).join(" ");
    if (src.first) return src.first.map(textOf).find(Boolean) || "";
    if (src.other) { const a = ctx.answers[src.other]; return a && typeof a === "object" && !Array.isArray(a) ? sentence(a.other) : ""; }
    if (src.value_of) return clean(ctx.answers[src.value_of]);
    if (src.extra) { const f = extraFreq[src.extra]; return f ? sentence(src.template.replace("{Freq}", FREQ_LABEL[f] || f)) : ""; }
    if (src.q) {
      const r = result(src.q);
      if (!r) return "";
      return (src.parts ? r.parts.filter((p) => src.parts.includes(p.id)).map((p) => p.text) : r.statements).join(" ");
    }
    return "";
  };

  const fill = { text: {}, check: [], overflow: { cleaning: [], suppliers: [] }, summary: {} };
  const put = (field, value) => { const v = clean(value); if (field && v) fill.text[field] = v; };
  const tick = (field) => { if (field && !fill.check.includes(field)) fill.check.push(field); };

  for (const r of fieldmap.rules) {
    if (!applies[r.m]) continue;                 // method not relevant: its rows stay blank
    if (r.when && !cond(r.when)) continue;
    if (r.kind === "check") tick(r.field);
    else put(r.field, textOf(r.src));
  }
  // What the safe-method rules filled (for the plan's "what we filled in" box).
  fill.summary.answers = fieldmap.rules.filter((r) => r.kind === "text" && fill.text[r.field]).length;
  fill.summary.yesTicks = fieldmap.rules.filter((r) => r.kind === "check" && !r.neutralNo && fill.check.includes(r.field)).length;

  // Who the pack belongs to (cover and diary). The owner's own name and dates are left for them.
  const b = input.business || {};
  put(fieldmap.identity.cover_business, b.name);
  put(fieldmap.identity.diary_business, b.name);
  put(fieldmap.identity.diary_address, [b.address, b.town, b.postcode].filter(Boolean).join(", "));

  // Safe methods that don't apply to this kitchen: the pack's own "not relevant" box.
  for (const [mid, field] of Object.entries(fieldmap.notRelevant)) if (applies[mid] === false) tick(field);
  fill.summary.notRelevant = bank.methods.filter((m) => applies[m.id] === false && fieldmap.notRelevant[m.id]).map((m) => m.title);

  // Checking your menu: the owner's dishes in the row for their type of dish.
  const menuText = {};
  for (const x of Array.isArray(ctx.answers["CK4.q1"]) ? ctx.answers["CK4.q1"] : []) {
    const field = fieldmap.menuRows[x.v];
    const ex = clean(x.examples);
    if (field && ex) menuText[field] = menuText[field] ? `${menuText[field]}; ${ex}` : ex;
  }
  if (applies.CK4) for (const [f, v] of Object.entries(menuText)) put(f, v);
  fill.summary.menuRows = applies.CK4 ? Object.keys(menuText).length : 0;

  // Extra checks: how often, in the pack's "How often?" column.
  if (applies.MG2) for (const [id, fields] of Object.entries(fieldmap.extraChecks)) {
    const f = extraFreq[id];
    if (f) for (const field of fields) put(field, FREQ_LABEL[f] || f);
  }
  fill.summary.extraChecks = applies.MG2 ? Object.keys(fieldmap.extraChecks).filter((id) => extraFreq[id]).length : 0;

  // The owner's own extra opening/closing checks (safe method page and diary page).
  for (const kind of ["opening", "closing"]) {
    const extra = (pack.checks?.[kind] || []).slice((bank.diary[`${kind}_checks`] || []).length);
    extra.slice(0, fieldmap.ownChecks[kind].length).forEach((t, i) => fieldmap.ownChecks[kind][i].forEach((field) => put(field, t)));
    fill.summary[`own_${kind}`] = Math.min(extra.length, fieldmap.ownChecks[kind].length);
  }

  // Cleaning schedule (the pack has 11 rows; anything more goes to the companion's continuation sheet).
  const rows = pack.cleaning || [];
  rows.forEach((row, i) => {
    const slot = fieldmap.cleaningRows[i];
    if (!slot) { fill.overflow.cleaning.push(row); return; }
    put(slot.item, row.item);
    const col = { after_use: "after_use", shift: "shift", daily: "daily", weekly: "weekly" }[row.freq];
    if (col) put(slot[col], "X"); else put(slot.other, FREQ_LABEL[row.freq] || row.freq);
    put(slot.precautions, row.precautions);
    put(slot.method, row.chemical);
  });

  // Suppliers' list (5 blocks) and contacts (council's food team; pest contractor if named).
  (pack.records?.suppliers || []).forEach((s, i) => {
    const blk = fieldmap.supplierBlocks[i];
    if (!blk) { fill.overflow.suppliers.push(s); return; }
    put(blk.name, s.name);
    put(blk.goods, s.goods);
    for (const d of s.days || []) { const k = DAY_KEYS[String(d).toLowerCase()]; if (k) tick(blk.days[k]); }
  });
  const contacts = [];
  if (pack.council) contacts.push({ name: `${pack.council.name} — food safety team`, telephone: pack.council.phone, email: pack.council.email, useful: "Food hygiene, re-visits, pests, drainage" });
  if (pack.records?.pestContractor) contacts.push({ name: pack.records.pestContractor, useful: "Pest control" });
  contacts.forEach((c, i) => {
    const blk = fieldmap.contactBlocks[i];
    if (!blk) return;
    put(blk.name, c.name); put(blk.telephone, c.telephone); put(blk.email, c.email); put(blk.useful, c.useful);
  });
  fill.summary.cleaningRows = Math.min(rows.length, fieldmap.cleaningRows.length);
  fill.summary.suppliers = Math.min((pack.records?.suppliers || []).length, fieldmap.supplierBlocks.length);
  fill.summary.contacts = contacts.slice(0, fieldmap.contactBlocks.length).map((c) => c.name);

  return fill;
}

/**
 * Where a plan step's box is in the official pack: for an answer (question + item/option) find the rule
 * that would fill it once the owner does it. Returns { page, field } or null.
 */
export function packRef(fieldmap, ref) {
  if (!ref?.q) return null;
  const atoms = (r) => (r.when || "").split(/\|\||&&/).map((a) => a.trim());
  // "Exact" only when doing this one thing is enough for the box: some alternative of the rule's condition
  // has this answer as its only owner action (conditions on the business profile or method don't count).
  const action = (a) => !a.startsWith("$") && !a.startsWith("p.") && !a.startsWith("!p.");
  const soleAction = (r, atom) => (r.when || "").split("||").some((d) => {
    const acts = d.split("&&").map((a) => a.trim()).filter(action);
    return acts.length === 1 && acts[0] === atom;
  });
  const atom = `a.${ref.q}.${ref.opt}`;
  const exact = ref.opt ? fieldmap.rules.find((r) => soleAction(r, atom)) : null;
  // A choice that is a gap (e.g. "bleach") has no box of its own: point to the row for that question.
  const row = exact
    || (ref.opt && fieldmap.rules.find((r) => atoms(r).includes(atom)))
    || fieldmap.rules.find((r) => atoms(r).some((a) => a.startsWith(`a.${ref.q}.`)) || JSON.stringify(r.src || {}).includes(`"${ref.q}"`));
  return row ? { page: fieldmap.pageOf[row.field], field: row.field, kind: row.kind, exact: !!exact,
                 box: row.kind === "check" ? fieldmap.checkKind?.[row.field] || null : null } : null;
}

const pageRange = (pages) => (pages.length > 1 && pages[1] !== pages[0] ? `pages ${pages[0]}–${pages[1]}` : `page ${pages[0]}`);
// "13-14" / "36-37, 91-92" -> "pages 13–14" / "pages 36–37 and 91–92"
const methodPages = (s) => {
  const parts = String(s || "").split(",").map((x) => x.trim().replace("-", "–")).filter(Boolean);
  if (!parts.length) return null;
  const many = parts.length > 1 || parts[0].includes("–");
  return `${many ? "pages" : "page"} ${parts.join(" and ")}`;
};

/**
 * Where a plan step points in the owner's SFBB pack:
 *  - tick_yes / tick: doing this step is exactly what a box asks — tick it when done (never before);
 *  - write: the step fills a "How do you do this?" box — write what you now do;
 *  - related: the safe method the step belongs to (our answer and the pack's box don't match one to one);
 *  - part: a records part of the pack (diary, training record, cleaning schedule, completion record).
 */
export function sfbbPointer(fieldmap, bank, step) {
  if (!fieldmap) return null;
  if (step.ref?.part && fieldmap.parts?.[step.ref.part]) {
    const p = fieldmap.parts[step.ref.part];
    return { mode: "part", label: p.label, where: pageRange(p.pages) };
  }
  const r = packRef(fieldmap, step.ref);
  const m = step.method ? bank.methods.find((x) => x.id === step.method) : null;
  if (r && r.exact && r.kind === "check" && (r.box === "yes" || r.box === "tick")) {
    return { mode: r.box === "yes" ? "tick_yes" : "tick", label: m?.title || null, where: `page ${r.page}`, page: r.page, field: r.field };
  }
  if (r && r.exact && r.kind === "text") return { mode: "write", label: m?.title || null, where: `page ${r.page}`, page: r.page, field: r.field };
  if (m) return { mode: "related", label: m.title, where: methodPages(m.sfbb_pages) };
  return null;
}
