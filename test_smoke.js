/* Headless smoke test of the app using jsdom.
   Verifies: seed data renders, search filters, sort, add flow (via form submit),
   calculator math, CSV/JSON export shape, import. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name); }
}

const dom = new JSDOM(html, {
  runScripts: "outside-only",
  url: "https://example.com/index.html",
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

// minimal stubs jsdom lacks
window.localStorage = (() => {
  let s = {};
  return {
    getItem: k => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: k => { delete s[k]; },
  };
})();
window.confirm = () => true;
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
// capture downloads
const downloads = [];
const origCreate = document.createElement.bind(document);
document.createElement = function (tag) {
  const el = origCreate(tag);
  if (tag === "a") {
    el.click = function () { downloads.push(el.download); };
  }
  return el;
};
window.Blob = class { constructor(parts) { this.parts = parts; } };

// run the app code in the window context
const runScript = new window.Function(appjs);
runScript.call(window);

// fire DOMContentLoaded so the app initializes
const evt = new window.Event("DOMContentLoaded");
document.dispatchEvent(evt);

console.log("\n[1] Seed data renders");
const items = document.querySelectorAll("#list .item");
ok("3 seed items rendered", items.length === 3);
ok("stats shows tins", /3/.test(document.querySelector("#stats").textContent));
ok("empty hidden", document.querySelector("#empty").hidden === true);

console.log("\n[2] Search filter");
const search = document.querySelector("#search");
search.value = "resene";
search.dispatchEvent(new window.Event("input"));
const after = document.querySelectorAll("#list .item").length;
ok("search 'resene' -> 1 item", after === 1);
search.value = "";
search.dispatchEvent(new window.Event("input"));
ok("clear search -> 3 items", document.querySelectorAll("#list .item").length === 3);

console.log("\n[3] Add flow via form submit");
document.querySelector("#btn-add").click();
ok("modal opened", document.querySelector("#modal").hidden === false);
document.querySelector("#f-brand").value = "TestBrand";
document.querySelector("#f-type").value = "Exterior";
document.querySelector("#f-colorName").value = "Test Blue";
document.querySelector("#f-hex").value = "#123456";
document.querySelector("#f-quantity").value = "3.5";
document.querySelector("#form").dispatchEvent(new window.Event("submit"));
ok("item count now 4", document.querySelectorAll("#list .item").length === 4);
ok("modal closed", document.querySelector("#modal").hidden === true);

console.log("\n[4] Validation blocks empty submit");
document.querySelector("#btn-add").click();
document.querySelector("#f-brand").value = "";
document.querySelector("#f-type").value = "";
document.querySelector("#f-colorName").value = "";
document.querySelector("#f-colorCode").value = "";
document.querySelector("#form").dispatchEvent(new window.Event("submit"));
ok("empty submit blocked (still 4)", document.querySelectorAll("#list .item").length === 4);
ok("error shown", document.querySelector("#form-error").hidden === false);

console.log("\n[5] Calculator math");
const area = document.querySelector("#calc-area");
const coats = document.querySelector("#calc-coats");
area.value = "60"; coats.value = "2";
document.querySelector('[data-tab="calc"]').click();
area.dispatchEvent(new window.Event("input"));
// total seeded litres = 2.5+4+1 = 7.5 ; need = 60*2/10 = 12 L -> warn/no
const calcHtml = document.querySelector("#calc-result").innerHTML;
ok("calc reports litres needed", /12\.0 L/.test(calcHtml));
// total litres = 2.5 + 4 + 1 (seed) + 3.5 (added) = 11.0
ok("calc shows have 11.0 L", /11\.0 L/.test(calcHtml));

console.log("\n[6] Export buttons fire (downloads captured)");
document.querySelector('[data-tab="data"]').click();
document.querySelector("#btn-export-json").click();
document.querySelector("#btn-export-csv").click();
ok("JSON + CSV download triggered", downloads.length >= 2);

console.log("\n[7] Persistence to localStorage");
const stored = JSON.parse(window.localStorage.getItem("paintstock.v1") || "[]");
ok("4 items persisted", stored.length === 4);
ok("persisted item has id+updated", stored[0].id && stored[0].updated);

console.log("\n==============================");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
