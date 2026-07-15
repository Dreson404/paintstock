/* Headless smoke test for the NATIVE (Capacitor) app in web/.
   Verifies: seed renders, search, add flow, validation, calc, export,
   AND the new scan flow with a MOCKED camera + MOCKED OpenAI vision. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = "/home/hermes/paintstock";
let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS", name)) : (fail++, console.log("  FAIL", name)); }

const html = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "web/app.js"), "utf8");

(async function main() {

const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://localhost/", pretendToBeVisual: true });
const { window } = dom; const { document } = window;

// localStorage
const store = {};
window.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] };
window.confirm = () => true;
window.URL.createObjectURL = () => "blob:x"; window.URL.revokeObjectURL = () => {};
let dl = 0; const oc = document.createElement.bind(document);
document.createElement = function (t) { const e = oc(t); if (t === "a") e.click = () => dl++; return e; };
window.Blob = class { constructor(p) { this.parts = p; } };

// ---- MOCK CAPACITOR native APIs ----
window.Capacitor = { isNativePlatform: () => true };
const _prefs = {};
window.Preferences = {
  get: async ({ key }) => ({ value: _prefs[key] || "" }),
  set: async ({ key, value }) => { _prefs[key] = value; },
  remove: async ({ key }) => { delete _prefs[key]; }
};
// camera returns a base64 string (resultType base64)
window.Camera = { getPhoto: async () => ({ data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }) };

// ---- MOCK fetch -> OpenAI vision ----
const MOCK_LABEL = {
  brand: "Resene", type: "Kitchen & Bathroom", colorName: "Sea Fog",
  colorCode: "R23", finish: "Low Sheen", hex: "#9fb3b0"
};
window.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  // echo back a faux model reply
  return {
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(MOCK_LABEL) } }] }),
    text: async () => ""
  };
};

// run app
new window.Function(appjs).call(window);
document.dispatchEvent(new window.Event("DOMContentLoaded"));

console.log("\n[1] Seed + base features");
await new Promise(r => setTimeout(r, 20));
ok("3 seed items", document.querySelectorAll("#list .item").length === 3);
const s = document.querySelector("#search"); s.value = "dulux"; s.dispatchEvent(new window.Event("input"));
ok("search dulux -> 1", document.querySelectorAll("#list .item").length === 1);
s.value = ""; s.dispatchEvent(new window.Event("input"));
ok("clear -> 3", document.querySelectorAll("#list .item").length === 3);

console.log("\n[2] Add flow + validation");
document.querySelector("#btn-add").click();
ok("modal opens", document.querySelector("#modal").hidden === false);
document.querySelector("#f-brand").value = "BrandX"; document.querySelector("#f-type").value = "Interior";
document.querySelector("#f-colorName").value = "Blue"; document.querySelector("#f-hex").value = "#abcdef";
document.querySelector("#f-quantity").value = "2";
document.querySelector("#form").dispatchEvent(new window.Event("submit"));
ok("add -> 4 items", document.querySelectorAll("#list .item").length === 4);
document.querySelector("#btn-add").click();
["#f-brand","#f-type","#f-colorName","#f-colorCode"].forEach(sel => document.querySelector(sel).value = "");
document.querySelector("#form").dispatchEvent(new window.Event("submit"));
ok("empty submit blocked", document.querySelectorAll("#list .item").length === 4);
ok("error shown", document.querySelector("#form-error").hidden === false);

console.log("\n[3] Calculator");
const area = document.querySelector("#calc-area"), coats = document.querySelector("#calc-coats");
document.querySelector('[data-tab="calc"]').click();
area.value = "60"; coats.value = "2"; area.dispatchEvent(new window.Event("input"));
const ch = document.querySelector("#calc-result").innerHTML;
ok("need 12.0 L", /12\.0 L/.test(ch));
ok("have 9.5 L", /9\.5 L/.test(ch)); // 7.5 seed + 2 added

console.log("\n[4] Export");
document.querySelector('[data-tab="data"]').click();
document.querySelector("#btn-export-json").click();
document.querySelector("#btn-export-csv").click();
ok("export fired", dl >= 2);

console.log("\n[5] SCAN FLOW (mock camera + mock OpenAI)");
// set API key via settings
document.querySelector('[data-tab="settings"]').click();
document.querySelector("#set-key").value = "sk-test-key";
document.querySelector("#btn-save-key").click();
await new Promise(r => setTimeout(r, 20));
ok("key persisted to Preferences", (await window.Preferences.get({ key: "paintstock.openaikey" })).value === "sk-test-key");

document.querySelector('[data-tab="stock"]').click();
document.querySelector("#btn-scan").click();
ok("scan modal opens", document.querySelector("#scan").hidden === false);
document.querySelector("#btn-capture").click();
// wait for async capture+read+prefill
await new Promise(r => setTimeout(r, 80));
ok("scan modal closed after read", document.querySelector("#scan").hidden === true);
ok("add modal opened with prefill", document.querySelector("#modal").hidden === false);
ok("brand prefilled from AI (Resene)", document.querySelector("#f-brand").value === "Resene");
ok("colour name prefilled (Sea Fog)", document.querySelector("#f-colorName").value === "Sea Fog");
ok("colour code prefilled (R23)", document.querySelector("#f-colorCode").value === "R23");
ok("hex prefilled (#9fb3b0)", document.querySelector("#f-hex").value.toLowerCase() === "#9fb3b0");
ok("quantity left EMPTY for user", document.querySelector("#f-quantity").value === "");
// user enters litres and saves
document.querySelector("#f-quantity").value = "4";
document.querySelector("#form").dispatchEvent(new window.Event("submit"));
ok("scan result saved -> 5 items", document.querySelectorAll("#list .item").length === 5);

console.log("\n[6] Persistence");
const savedRaw = window.localStorage.getItem("paintstock.v1");
const saved = savedRaw ? JSON.parse(savedRaw) : [];
ok("5 items persisted", saved.length === 5);
ok("persisted scanned item has hex", saved.some(i => i.hex && i.hex.toLowerCase() === "#9fb3b0"));

console.log("\n==============================");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
