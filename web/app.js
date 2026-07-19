/* Paint Stock — native (Capacitor) app logic.
   - Stock stored per-device in localStorage (no server, offline-first).
   - "Scan tin": camera photo -> OpenAI vision extracts brand/type/colour ->
     pre-fills the form; user only enters litres.
   - API key held in Capacitor Preferences (Android Keystore) when available,
     else localStorage fallback. Never hardcoded, never leaves the device except
     to OpenAI per the user's action. */
(function () {
  "use strict";

  var STORE_KEY = "paintstock.v1";
  var META_KEY = "paintstock.meta.v1";
  var KEY_KEY = "paintstock.openaikey";
  var MODEL_KEY = "paintstock.openaimodel";
  var COVERAGE_PER_LITRE = 10;

  var items = [];
  var editingId = null;
  var apiKey = "";
  var apiModel = "gpt-4o-mini";
  var Cap = (typeof window !== "undefined" && window.Capacitor) ? window.Capacitor : null;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  // Capacitor v6 exposes plugins at Capacitor.Plugins.<Name>, NOT window.<Name>.
  // (window.Camera / window.Preferences are undefined with a plain, non-bundled app.js,
  //  which silently forced the browser fallback so the real camera never opened.)
  function plugin(name) {
    if (Cap && Cap.Plugins && Cap.Plugins[name]) return Cap.Plugins[name];
    if (typeof window !== "undefined" && window[name]) return window[name]; // legacy fallback
    return null;
  }

  /* ---------- storage ---------- */
  function load() {
    try { items = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(items)); }
    catch (e) { toast("Storage failed — device may be full."); }
  }

  /* ---------- settings (API key) ---------- */
  async function loadKey() {
    try {
      var Preferences = plugin("Preferences");
      if (isNative && Preferences) {
        const k = await Preferences.get({ key: KEY_KEY });
        if (k && k.value) apiKey = k.value;
        const m = await Preferences.get({ key: MODEL_KEY });
        if (m && m.value) apiModel = m.value;
      } else {
        apiKey = localStorage.getItem(KEY_KEY) || "";
        apiModel = localStorage.getItem(MODEL_KEY) || "gpt-4o-mini";
      }
    } catch (e) {}
  }
  async function persistKey() {
    try {
      var Preferences = plugin("Preferences");
      if (isNative && Preferences) {
        await Preferences.set({ key: KEY_KEY, value: apiKey });
        await Preferences.set({ key: MODEL_KEY, value: apiModel });
      } else {
        if (apiKey) localStorage.setItem(KEY_KEY, apiKey); else localStorage.removeItem(KEY_KEY);
        localStorage.setItem(MODEL_KEY, apiModel);
      }
    } catch (e) {}
  }

  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- helpers ---------- */
  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtQty(n) {
    if (n == null || isNaN(n)) return "";
    return (Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(2)) + " L";
  }
  function parseQty(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function validHex(v) { return /^#([0-9a-fA-F]{6})$/.test(v || ""); }

  /* ---------- rendering (unchanged from verified v1) ---------- */
  function getFilters() {
    return { q: $("#search").value.trim().toLowerCase(), brand: $("#filter-brand").value, sort: $("#filter-sort").value };
  }
  function visibleItems() {
    var f = getFilters();
    var out = items.filter(function (it) {
      if (f.brand && it.brand !== f.brand) return false;
      if (f.q) {
        var hay = [it.brand, it.type, it.colorName, it.colorCode, it.finish, it.notes].join(" ").toLowerCase();
        if (hay.indexOf(f.q) === -1) return false;
      }
      return true;
    });
    out.sort(function (a, b) {
      if (f.sort === "brand") return (a.brand || "").localeCompare(b.brand || "");
      if (f.sort === "quantity") return (b.quantity || 0) - (a.quantity || 0);
      if (f.sort === "color") return (a.colorName || "").localeCompare(b.colorName || "");
      return (b.updated || 0) - (a.updated || 0);
    });
    return out;
  }
  function render() {
    var brandSel = $("#filter-brand"), prev = brandSel.value, brands = {};
    items.forEach(function (it) { if (it.brand) brands[it.brand] = 1; });
    brandSel.innerHTML = '<option value="">All brands</option>' +
      Object.keys(brands).sort().map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + "</option>"; }).join("");
    if (brands[prev]) brandSel.value = prev;

    var totalL = items.reduce(function (s, it) { return s + (parseFloat(it.quantity) || 0); }, 0);
    $("#stats").innerHTML =
      "<span><b>" + items.length + "</b> tins</span>" +
      "<span><b>" + (totalL % 1 === 0 ? totalL : totalL.toFixed(1)) + "</b> L total</span>" +
      "<span><b>" + Object.keys(brands).length + "</b> brands</span>";

    var list = visibleItems(), ul = $("#list");
    if (list.length === 0) { ul.innerHTML = ""; $("#empty").hidden = false; }
    else { $("#empty").hidden = true; ul.innerHTML = list.map(renderItem).join(""); }
  }
  function renderItem(it) {
    var hex = validHex(it.hex) ? it.hex : "#2c3a35";
    var swatch = '<div class="item__swatch" style="background:' + esc(hex) + '"></div>';
    var name = esc(it.colorName || it.colorCode || "Untitled");
    var code = it.colorCode ? '<span class="item__code">· ' + esc(it.colorCode) + "</span>" : "";
    var meta = [];
    if (it.brand) meta.push(esc(it.brand));
    if (it.type) meta.push(esc(it.type));
    var finish = it.finish ? '<span class="item__finish">' + esc(it.finish) + "</span>" : "";
    var notes = it.notes ? '<div class="item__notes">' + esc(it.notes) + "</div>" : "";
    return '<li class="item" data-id="' + esc(it.id) + '">' + swatch +
      '<div class="item__body">' +
        '<div class="item__top">' +
          '<div><span class="item__color">' + name + "</span>" + code + finish + "</div>" +
          '<div class="item__qty">' + fmtQty(it.quantity) + "</div>" +
        "</div>" +
        '<div class="item__meta">' + meta.join(" · ") + "</div>" + notes +
      "</div></li>";
  }

  /* ---------- form modal ---------- */
  function openModal(item, prefill) {
    editingId = item ? item.id : null;
    $("#form-title").textContent = item ? "Edit paint" : "Add paint";
    var d = prefill || item || {};
    $("#f-brand").value = d.brand || "";
    $("#f-type").value = d.type || "";
    $("#f-colorName").value = d.colorName || "";
    $("#f-colorCode").value = d.colorCode || "";
    $("#f-hex").value = d.hex || "";
    $("#f-finish").value = d.finish || "";
    $("#f-quantity").value = (d.quantity != null && d.quantity !== "") ? d.quantity : "";
    $("#f-container").value = d.container || "";
    $("#f-notes").value = d.notes || "";
    $("#form-error").hidden = true;
    refreshBrandDatalist();
    $("#modal").hidden = false;
    setTimeout(function () { $("#f-quantity").focus(); }, 60);
  }
  function closeModal() { $("#modal").hidden = true; editingId = null; }
  function refreshBrandDatalist() {
    var brands = {}; items.forEach(function (it) { if (it.brand) brands[it.brand] = 1; });
    $("#brand-list").innerHTML = Object.keys(brands).sort().map(function (b) { return '<option value="' + esc(b) + '">'; }).join("");
  }
  function submitForm(e) {
    e.preventDefault();
    var data = {
      brand: $("#f-brand").value.trim(), type: $("#f-type").value.trim(),
      colorName: $("#f-colorName").value.trim(), colorCode: $("#f-colorCode").value.trim(),
      hex: $("#f-hex").value.trim(), finish: $("#f-finish").value,
      quantity: parseQty($("#f-quantity").value), container: $("#f-container").value.trim(),
      notes: $("#f-notes").value.trim()
    };
    if (!data.brand && !data.type && !data.colorName && !data.colorCode) {
      return showFormErr("Add at least a brand, type or colour so you can find it later.");
    }
    if (data.hex && !validHex(data.hex)) return showFormErr("Swatch must be 6-digit hex like #e8e2d0 (or leave blank).");
    if (editingId) {
      var it = items.find(function (x) { return x.id === editingId; });
      if (it) { Object.keys(data).forEach(function (k) { it[k] = data[k]; }); it.updated = Date.now(); }
      toast("Updated");
    } else {
      data.id = uid(); data.created = Date.now(); data.updated = Date.now();
      items.push(data); toast("Added");
    }
    save(); closeModal(); render();
  }
  function showFormErr(msg) { var e = $("#form-error"); e.textContent = msg; e.hidden = false; }

  /* ---------- calculator (unchanged) ---------- */
  function runCalc() {
    var area = parseFloat($("#calc-area").value) || 0, coats = parseFloat($("#calc-coats").value) || 1;
    var match = $("#calc-color").value.trim().toLowerCase();
    var need = area * coats / COVERAGE_PER_LITRE, box = $("#calc-result");
    if (area <= 0) { box.innerHTML = '<p class="muted">Enter the wall/ceiling area to get an estimate.</p>'; return; }
    var matched = items.filter(function (it) {
      if (!match) return true;
      return [it.colorName, it.colorCode, it.type, it.brand].join(" ").toLowerCase().indexOf(match) !== -1;
    });
    var have = matched.reduce(function (s, it) { return s + (parseFloat(it.quantity) || 0); }, 0);
    var status, cls, pool = match ? "matching" : "total";
    var haveLabel = match ? ("matching stock (" + matched.length + " tins)") : ("all stock (" + items.length + " tins)");
    if (need <= have) { cls = "ok"; status = "✓ Enough " + pool + " stock"; }
    else if (have > 0) { cls = "warn"; status = "≈ " + pool + " stock covers ~" + Math.floor(have / need * 100) + "%"; }
    else { cls = "bad"; status = "✗ No matching stock"; }
    var html = '<p class="muted">Job needs about <b>' + need.toFixed(1) + " L</b> (" + area + " m² × " + coats +
      " coat" + (coats === 1 ? "" : "s") + " ÷ " + COVERAGE_PER_LITRE + " m²/L).</p>" +
      '<p class="' + cls + '">' + status + ". You have <b>" + have.toFixed(1) + " L</b> in " + haveLabel + ".</p>";
    if (match && matched.length) {
      html += "<ul>" + matched.slice(0, 8).map(function (it) {
        return "<li>" + esc(it.colorName || it.colorCode || "untitled") + (it.brand ? " (" + esc(it.brand) + ")" : "") + " — " + fmtQty(it.quantity) + "</li>";
      }).join("") + "</ul>";
    }
    box.innerHTML = html;
  }

  /* ============================================================
     SCAN FLOW — camera -> OpenAI vision -> prefill form
     ============================================================ */
  function openScan() {
    $("#scan").hidden = false;
    $("#scan-preview").innerHTML = '<span class="scan-hint">Point the camera at the label, then tap Capture.</span>';
    $("#scan-loading").hidden = true;
    $("#scan-error").hidden = true;
  }
  function closeScan() { $("#scan").hidden = true; }

  async function captureAndRead() {
    // 1. ensure key
    if (!apiKey) {
      closeScan();
      switchTab("settings");
      $("#set-status").textContent = "Add your OpenAI key to enable AI scanning, then tap 📷 Scan again.";
      toast("OpenAI key needed");
      return;
    }
    // 2. capture photo via Capacitor Camera (native) or file input (browser/test)
    var photo;
    try {
      $("#scan-loading").hidden = false;
      $("#scan-loading-text").textContent = "Taking photo…";
      photo = await takePhoto();
    } catch (e) {
      $("#scan-loading").hidden = true;
      return showScanErr("Camera cancelled or unavailable: " + (e && e.message ? e.message : e));
    }
    if (photo && (typeof photo === "string" || (photo.data) || (photo instanceof Blob))) {
      var src = photo instanceof Blob ? URL.createObjectURL(photo)
        : (typeof photo === "string" ? photo : ("data:image/jpeg;base64," + photo.data));
      $("#scan-preview").innerHTML = '<img class="scan-img" src="' + esc(src) + '" alt="captured label" />';
    }
    // 3. send to OpenAI vision
    $("#scan-loading").hidden = false;
    $("#scan-loading-text").textContent = "Reading label…";
    try {
      var base64 = await photoToBase64(photo);
      var info = await readPaintLabel(base64);
      $("#scan-loading").hidden = true;
      closeScan();
      openModal(null, Object.assign({ quantity: "" }, info));
      toast("Label read — add litres & save");
    } catch (e) {
      $("#scan-loading").hidden = true;
      showScanErr("Could not read label: " + (e && e.message ? e.message : e) + ". You can still add manually.");
    }
  }

  function takePhoto() {
    var Camera = plugin("Camera");
    if (isNative && Camera) {
      return Camera.getPhoto({
        quality: 70, allowEditing: false, resultType: "base64",
        source: "CAMERA", correctOrientation: true, saveToGallery: false
      });
    }
    // Browser / test fallback: synthetic 1x1 png so logic can be exercised
    return Promise.resolve("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC");
  }

  function photoToBase64(photo) {
    if (typeof photo === "string") {
      // data URI or already base64
      if (photo.indexOf("data:") === 0) return photo.split(",")[1];
      return photo;
    }
    if (photo && photo.data) return photo.data; // Capacitor base64 result
    if (photo instanceof Blob) return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res((r.result.split(",")[1])); }; r.onerror = rej; r.readAsDataURL(photo);
    });
    return Promise.reject(new Error("no photo data"));
  }

  async function readPaintLabel(base64) {
    var url = "https://api.openai.com/v1/chat/completions";
    var body = {
      model: apiModel,
      messages: [
        { role: "system", content: "You read paint product labels. Return ONLY compact JSON: " +
          '{ "brand": string, "type": string, "colorName": string, "colorCode": string, ' +
          '"finish": string|null, "hex": string|null } where hex is the paint colour as #rrggbb ' +
          "(no quotes). If a field is unknown use empty string. No prose." },
        { role: "user", content: [
          { type: "text", text: "Read this paint label." },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + base64 } }
        ] }
      ],
      max_tokens: 300, temperature: 0.1
    };
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      var err = await res.text().catch(function () { return ""; });
      throw new Error("OpenAI " + res.status + (err ? " " + err.slice(0, 120) : ""));
    }
    var json = await res.json();
    var text = json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : "";
    var clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    var parsed = JSON.parse(clean);
    return {
      brand: s(parsed.brand), type: s(parsed.type), colorName: s(parsed.colorName),
      colorCode: s(parsed.colorCode), finish: s(parsed.finish), hex: validHex(parsed.hex) ? parsed.hex : (s(parsed.hex) ? parsed.hex : "")
    };
  }
  function s(v) { return v == null ? "" : String(v); }
  function showScanErr(msg) { var e = $("#scan-error"); e.textContent = msg; e.hidden = false; }

  /* ---------- import / export (unchanged) ---------- */
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 100);
  }
  function exportJSON() {
    download("paintstock-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify({ app: "paintstock", version: 2, items: items }, null, 2), "application/json");
  }
  function exportCSV() {
    var head = ["brand","type","colorName","colorCode","finish","quantity","container","hex","notes"];
    var rows = items.map(function (it) {
      return head.map(function (k) { var v = it[k] == null ? "" : String(it[k]); return '"' + v.replace(/"/g,'""') + '"'; }).join(",");
    });
    download("paintstock-" + new Date().toISOString().slice(0, 10) + ".csv", head.join(",") + "\n" + rows.join("\n"), "text/csv");
  }
  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var arr = Array.isArray(data) ? data : (data && data.items);
        if (!Array.isArray(arr)) throw new Error("bad");
        arr.forEach(function (it) { if (!it.id) it.id = uid(); if (!it.updated) it.updated = Date.now(); });
        items = arr; save(); render();
        $("#data-msg").textContent = "Imported " + items.length + " tins."; toast("Imported");
      } catch (e) { $("#data-msg").textContent = "That file isn't a valid Paint Stock backup."; }
    };
    reader.readAsText(file);
  }

  /* ---------- tabs ---------- */
  function switchTab(name) {
    $all(".tab").forEach(function (t) { t.classList.toggle("tab--active", t.getAttribute("data-tab") === name); });
    ["stock","calc","data","settings"].forEach(function (n) { var p = $("#tab-" + n); if (p) p.hidden = (n !== name); });
  }

  /* ---------- events ---------- */
  function bind() {
    $("#btn-add").addEventListener("click", function () { openModal(null); });
    $("#btn-scan").addEventListener("click", openScan);
    $all(".tab").forEach(function (t) { t.addEventListener("click", function () { switchTab(t.getAttribute("data-tab")); }); });

    $("#search").addEventListener("input", render);
    $("#filter-brand").addEventListener("change", render);
    $("#filter-sort").addEventListener("change", render);

    $("#list").addEventListener("click", function (e) {
      var li = e.target.closest(".item"); if (!li) return;
      var it = items.find(function (x) { return x.id === li.getAttribute("data-id"); });
      if (it) openModal(it);
    });

    $all("[data-close]").forEach(function (el) { el.addEventListener("click", function (e) { e.preventDefault(); closeModal(); }); });
    $all("[data-scan-close]").forEach(function (el) { el.addEventListener("click", function (e) { e.preventDefault(); closeScan(); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); if (!$("#scan").hidden) closeScan(); }
    });

    $("#form").addEventListener("submit", submitForm);
    $("#btn-capture").addEventListener("click", captureAndRead);

    ["calc-area","calc-coats","calc-color"].forEach(function (id) { $("#" + id).addEventListener("input", runCalc); });

    $("#btn-export-json").addEventListener("click", exportJSON);
    $("#btn-export-csv").addEventListener("click", exportCSV);
    $("#btn-import").addEventListener("change", function (e) { if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; });
    $("#btn-clear").addEventListener("click", function () {
      if (!items.length) return toast("Nothing to delete");
      if (confirm("Delete ALL " + items.length + " tins from this device?")) { items = []; save(); render(); $("#data-msg").textContent = "All stock deleted."; toast("Deleted"); }
    });

    // settings
    $("#set-key").value = apiKey;
    $("#set-model").value = apiModel;
    $("#btn-save-key").addEventListener("click", async function () {
      apiKey = $("#set-key").value.trim(); apiModel = $("#set-model").value;
      await persistKey();
      $("#set-status").textContent = apiKey ? "Key saved on this device." : "Cleared.";
      toast(apiKey ? "Key saved" : "Key cleared");
    });
    $("#btn-clear-key").addEventListener("click", async function () {
      apiKey = ""; apiModel = "gpt-4o-mini"; $("#set-key").value = ""; $("#set-model").value = apiModel;
      await persistKey(); $("#set-status").textContent = "Key cleared.";
    });
  }

  /* ---------- seed demo (first run only) ---------- */
  function maybeSeed() {
    if (localStorage.getItem(META_KEY)) return;
    localStorage.setItem(META_KEY, "1");
    if (items.length) return;
    items = [
      { id: uid(), brand: "Resene", type: "Interior low sheen", colorName: "Alabaster", colorCode: "NN40-001", hex: "#e8e2d0", finish: "Low Sheen", quantity: 2.5, container: "leftover", notes: "Spare from lounge job", created: Date.now(), updated: Date.now() },
      { id: uid(), brand: "Dulux", type: "Ceiling flat", colorName: "Vivid White", colorCode: "", hex: "#f4f3ef", finish: "Flat", quantity: 4, container: "4L tin (part)", notes: "", created: Date.now(), updated: Date.now() },
      { id: uid(), brand: "Wattyl", type: "Exterior acrylic", colorName: "Gull Grey", colorCode: "E16", hex: "#8d97a0", finish: "Low Sheen", quantity: 1, container: "leftover", notes: "Trim touch-ups", created: Date.now(), updated: Date.now() }
    ];
    save();
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await loadKey();
    load(); maybeSeed(); bind(); render();
  });
})();
