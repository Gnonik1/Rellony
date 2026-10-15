// pdfmake (vendored in /rescue/vendor/, with its Roboto font), loaded only when a Rescue plan PDF is made
// on this device — on the pack page and on Giorgi's review page.
let ready = null;
const script = (src) => new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = src;
  s.addEventListener("load", resolve);
  s.addEventListener("error", () => { s.remove(); reject(new Error(src)); });
  document.head.append(s);
});
export function loadPdfmake() {
  ready ??= script("/rescue/vendor/pdfmake.min.js").then(() => script("/rescue/vendor/vfs_fonts.js")).then(() => window.pdfMake)
    .catch((e) => { ready = null; throw e; });
  return ready;
}
