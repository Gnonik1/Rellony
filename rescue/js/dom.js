// Small DOM helpers shared by the Rescue pages. Text always goes in as text, never as HTML.

// h("p", { class: "x", onclick: f }, "text", child, …)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "vars") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, String(val));   // CSSOM: allowed under the page's CSP
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// "(opens in a new tab)" for screen readers, after the link's own words
export const newTab = () => h("span", { class: "vh" }, " (opens in a new tab)");

// The H1 hairline draws once, as on the home page; static under reduced motion.
export function hairline() {
  const rule = h("span", { class: "h1-rule", "aria-hidden": "true" });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.classList.add("motion-ok");
    requestAnimationFrame(() => requestAnimationFrame(() => rule.classList.add("is-drawn")));
  }
  return rule;
}

// While the page fetches its data: shapes of the page to come, holding the screen.
export function skeleton() {
  return h("div", { class: "rx-skel", "aria-hidden": "true" },
    h("div", { class: "rx-skel__line" }), h("div", { class: "rx-skel__card" }), h("div", { class: "rx-skel__card" }));
}

// "Not saved yet — …": shown until the save goes through (null hides it)
export function toast(text) {
  let el = document.getElementById("rx-toast");
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = h("div", { id: "rx-toast", class: "rx-toast", role: "status" });
    document.body.append(el);
  }
  el.textContent = text;
}

// The phone's sticky bar. Two rules:
//   { main }  shown from the start until `main` first comes on screen, then never again on this
//             visit; never if `main` is on screen at load (the personal page)
//   { hide }  shown from the start, hidden while any of `hide` is on screen (the free check: the
//             price panel)
// Both: hidden while the footer is on screen. CSS keeps it off at 64rem and wider.
// It is checked on scroll, on resize, and whenever the page changes height without a scroll
// ("Show fewer", an opened question): a shorter page can bring the footer up under a still finger.
export function stickyBar(bar, { main, hide = [] }) {
  const foot = document.querySelector(".site-foot");
  const visible = (el, inset = 0) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight - inset;
  };
  let mainSeen = main ? visible(main) : false;
  const update = () => {
    let show;
    if (main) {
      // "on screen" means clear of the bar itself
      if (visible(main, bar.hidden ? 0 : bar.offsetHeight)) mainSeen = true;
      show = !mainSeen;
    } else {
      show = !hide.some((el) => visible(el));
    }
    bar.hidden = !show || (foot ? visible(foot) : false);
  };
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  if ("ResizeObserver" in window) new ResizeObserver(() => update()).observe(document.body);
  update();
}
