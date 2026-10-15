// /stop/ — stop letters (page copy §11). The button is a mailto link to stop@rellony.com; this puts
// the letter's code in its subject and body as it is typed (or from ?c=), and holds the button back
// until there is a code. Nothing is sent from the page: the visitor's own email app sends the request.
import { normaliseCode, rawCode } from "./api.js";

const input = document.getElementById("code");
const send = document.getElementById("stop-send");
const error = document.getElementById("code-error");
const plain = send.getAttribute("href");
const mailto = (code) => `mailto:stop@rellony.com?subject=Stop%20letters%20${code}&body=Please%20don't%20write%20to%20us%20again.%20Code%3A%20${code}`;

function update() {
  const code = normaliseCode(input.value);
  send.setAttribute("href", code ? mailto(code) : plain);
  if (code && !error.hidden) {
    error.hidden = true;
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
  return code;
}

// No code (or not the shape of one): say so here instead of opening an email without it.
function ready(e) {
  if (update()) return true;
  e.preventDefault();
  error.hidden = false;
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", "code-error");
  input.focus();
  return false;
}

send.addEventListener("click", ready);
// Enter in the box does what the button does
document.getElementById("stop-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (ready(e)) location.assign(send.getAttribute("href"));
});
input.addEventListener("input", update);

const typed = rawCode();
if (typed) {
  input.value = normaliseCode(typed) ?? typed;
  update();
}
