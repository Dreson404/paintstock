/* Paint Stock — local-first PWA.
   Stock is stored per-device in localStorage. No server, no account. */
(function () {
  "use strict";

  var STORE_KEY = "paintstock.v1";
  var META_KEY = "paintstock.meta.v1";
  var COVERAGE_PER_LITRE = 10; // m² per litre, per coat (typical interior)

  var items = [];
  var editingId = null;

  /* ---------- storage ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) items = [];
    } catch (e) {
      items = [];
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(items));
    } catch (e) {
      toast("Storage failed — your device may be full.");
    }
  }

  function uid() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- helpers ---------- */
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtQty(n) {
    if (n == null || isNaN(n)) return "";
    return (Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(2)) + " L";
  }

  function parseQty(v) {
    var n = parseFloat(v);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function validHex(v) {
    return /^#([0-9a-fA-F]{6})$/.test(v || "");
  }

  /* ---------- rendering ---------- */
  function getFilters() {
    return {
      q: $("#search").value.trim().toLowerCase(),
      brand: $("#filter-brand").value,
      sort: $("#filter-sort").value
    };
  }

  function visibleItems() {
    var f = getFilters();
    var out = items.filter(function (it) {
      if (f.brand && it.brand !== f.brand) return false;
      if (f.q) {
        var hay = [it.brand, it.type, it.colorName, it.colorCode, it.finish, it.notes]
          .join(" ").toLowerCase();
        if (hay.indexOf(f.q) === -1) return false;
      }
      return true;
    });
    out.sort(function (a, b) {
      if (f.sort === "brand") return (a.brand || "").localeCompare(b.brand || "");
      if (f.sort === "quantity") return (b.quantity || 0) - (a.quantity || 0);
      if (f.sort === "color") return (a.colorName || "").localeCompare(b.colorName || "");
      return (b.updated || 0) - (a.updated || 0); // updated
    });
    return out;
  }

  function render() {
    // brand filter options
    var brandSel = $("#filter-brand");
    var prev = brandSel.value;
    var brands = {};
    items.forEach(function (it) { if (it.brand) brands[it.brand] = 1; });
    brandSel.innerHTML = '<option value="">All brands</option>' +
      Object.keys(brands).sort().map(function (b) {
        return '<option value="' + esc(b) + '">' + esc(b) + "</option>";
      }).join("");
    if (brands[prev]) brandSel.value = prev;

    // stats
    var totalL = items.reduce(function (s, it) { return s + (parseFloat(it.quantity) || 0); }, 0);
    $("#stats").innerHTML =
      "<span><b>" + items.length + "</b> tins</span>" +
      "<span><b>" + (totalL % 1 === 0 ? totalL : totalL.toFixed(1)) + "</b> L total</span>" +
      "<span><b>" + Object.keys(brands).length + "</b> brands</span>";

    var list = visibleItems();
    var ul = $("#list");
    if (list.length === 0) {
      ul.innerHTML = "";
      $("#empty").hidden = false;
    } else {
      $("#empty").hidden = true;
      ul.innerHTML = list.map(renderItem).join("");
    }
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
    return '<li class="item" data-id="' + esc(it.id) + '">' +
      swatch +
      '<div class="item__body">' +
        '<div class="item__top">' +
          '<div><span class="item__color">' + name + "</span>" + code + finish + "</div>" +
          '<div class="item__qty">' + fmtQty(it.quantity) + "</div>" +
        "</div>" +
        '<div class="item__meta">' + meta.join(" · ") + "</div>" +
        notes +
      "</div>" +
      "</li>";
  }

  /* ---------- modal ---------- */
  function openModal(item) {
    editingId = item ? item.id : null;
    $("#form-title").textContent = item ? "Edit paint" : "Add paint";
    $("#f-brand").value = item ? (item.brand || "") : "";
    $("#f-type").value = item ? (item.type || "") : "";
    $("#f-colorName").value = item ? (item.colorName || "") : "";
    $("#f-colorCode").value = item ? (item.colorCode || "") : "";
    $("#f-hex").value = item ? (item.hex || "") : "";
    $("#f-finish").value = item ? (item.finish || "") : "";
    $("#f-quantity").value = item ? (item.quantity != null ? item.quantity : "") : "";
    $("#f-container").value = item ? (item.container || "") : "";
    $("#f-notes").value = item ? (item.notes || "") : "";
    $("#form-error").hidden = true;
    refreshBrandDatalist();
    $("#modal").hidden = false;
    setTimeout(function () { $("#f-brand").focus(); }, 50);
  }
  function closeModal() {
    $("#modal").hidden = true;
    editingId = null;
  }
  function refreshBrandDatalist() {
    var brands = {};
    items.forEach(function (it) { if (it.brand) brands[it.brand] = 1; });
    $("#brand-list").innerHTML = Object.keys(brands).sort().map(function (b) {
      return '<option value="' + esc(b) + '">';
    }).join("");
  }

  function submitForm(e) {
    e.preventDefault();
    var data = {
      brand: $("#f-brand").value.trim(),
      type: $("#f-type").value.trim(),
      colorName: $("#f-colorName").value.trim(),
      colorCode: $("#f-colorCode").value.trim(),
      hex: $("#f-hex").value.trim(),
      finish: $("#f-finish").value,
      quantity: parseQty($("#f-quantity").value),
      container: $("#f-container").value.trim(),
      notes: $("#f-notes").value.trim()
    };
    if (!data.brand && !data.type && !data.colorName && !data.colorCode) {
      var err = $("#form-error");
      err.textContent = "Add at least a brand, type or colour so you can find it later.";
      err.hidden = false;
      return;
    }
    if (data.hex && !validHex(data.hex)) {
      var err2 = $("#form-error");
      err2.textContent = "Swatch must be a 6-digit hex like #e8e2d0 (or leave blank).";
      err2.hidden = false;
      return;
    }
    if (editingId) {
      var it = items.find(function (x) { return x.id === editingId; });
      if (it) {
        Object.keys(data).forEach(function (k) { it[k] = data[k]; });
        it.updated = Date.now();
      }
      toast("Updated");
    } else {
      data.id = uid();
      data.created = Date.now();
      data.updated = Date.now();
      items.push(data);
      toast("Added");
    }
    save();
    closeModal();
    render();
  }

  /* ---------- calculator ---------- */
  function runCalc() {
    var area = parseFloat($("#calc-area").value) || 0;
    var coats = parseFloat($("#calc-coats").value) || 1;
    var match = $("#calc-color").value.trim().toLowerCase();
    var need = area * coats / COVERAGE_PER_LITRE;
    var box = $("#calc-result");

    if (area <= 0) {
      box.innerHTML = '<p class="muted">Enter the wall/ceiling area to get an estimate.</p>';
      return;
    }

    // matching stock
    var matched = items.filter(function (it) {
      if (!match) return true;
      var hay = [it.colorName, it.colorCode, it.type, it.brand].join(" ").toLowerCase();
      return hay.indexOf(match) !== -1;
    });
    var have = matched.reduce(function (s, it) { return s + (parseFloat(it.quantity) || 0); }, 0);

    var status, cls;
    var pool = match ? "matching" : "total";
    var haveLabel = match ? ('matching stock (' + matched.length + ' tins)') : ("all stock (" + items.length + " tins)");
    if (need <= have) {
      cls = "ok"; status = "✓ Enough " + pool + " stock";
    } else if (have > 0) {
      cls = "warn"; status = "≈ " + pool + " stock covers ~" + Math.floor(have / need * 100) + "%";
    } else {
      cls = "bad"; status = "✗ No matching stock";
    }

    var html = '<p class="muted">Job needs about <b>' + need.toFixed(1) + " L</b> (" +
      area + " m² × " + coats + " coat" + (coats === 1 ? "" : "s") + " ÷ " + COVERAGE_PER_LITRE + " m²/L).</p>" +
      '<p class="' + cls + '">' + status + ". You have <b>" + have.toFixed(1) + " L</b> in " + haveLabel + ".</p>";

    if (match && matched.length) {
      html += "<ul>" + matched.slice(0, 8).map(function (it) {
        return "<li>" + esc(it.colorName || it.colorCode || "untitled") +
          (it.brand ? " (" + esc(it.brand) + ")" : "") + " — " + fmtQty(it.quantity) + "</li>";
      }).join("") + "</ul>";
    }
    box.innerHTML = html;
  }

  /* ---------- import / export ---------- */
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  function exportJSON() {
    download("paintstock-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify({ app: "paintstock", version: 1, items: items }, null, 2), "application/json");
  }
  function exportCSV() {
    var head = ["brand", "type", "colorName", "colorCode", "finish", "quantity", "container", "hex", "notes"];
    var rows = items.map(function (it) {
      return head.map(function (k) {
        var v = it[k] == null ? "" : String(it[k]);
        return '"' + v.replace(/"/g, '""') + '"';
      }).join(",");
    });
    download("paintstock-" + new Date().toISOString().slice(0, 10) + ".csv",
      head.join(",") + "\n" + rows.join("\n"), "text/csv");
  }
  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var arr = Array.isArray(data) ? data : (data && data.items);
        if (!Array.isArray(arr)) throw new Error("bad file");
        // basic shape check + id backfill
        arr.forEach(function (it) {
          if (!it.id) it.id = uid();
          if (!it.updated) it.updated = Date.now();
        });
        items = arr;
        save(); render();
        $("#data-msg").textContent = "Imported " + items.length + " tins.";
        toast("Imported");
      } catch (e) {
        $("#data-msg").textContent = "That file isn't a valid Paint Stock backup.";
      }
    };
    reader.readAsText(file);
  }

  /* ---------- tabs ---------- */
  function switchTab(name) {
    $all(".tab").forEach(function (t) {
      var on = t.getAttribute("data-tab") === name;
      t.classList.toggle("tab--active", on);
    });
    ["stock", "calc", "data"].forEach(function (n) {
      var p = $("#tab-" + n);
      if (p) p.hidden = (n !== name);
    });
  }

  /* ---------- events ---------- */
  function bind() {
    $("#btn-add").addEventListener("click", function () { openModal(null); });

    $all(".tab").forEach(function (t) {
      t.addEventListener("click", function () { switchTab(t.getAttribute("data-tab")); });
    });

    $("#search").addEventListener("input", render);
    $("#filter-brand").addEventListener("change", render);
    $("#filter-sort").addEventListener("change", render);

    // list item click → edit
    $("#list").addEventListener("click", function (e) {
      var li = e.target.closest(".item");
      if (!li) return;
      var id = li.getAttribute("data-id");
      var it = items.find(function (x) { return x.id === id; });
      if (it) openModal(it);
    });

    // modal close
    $all("[data-close]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault(); closeModal();
      });
    });
    // swipe/esc to close
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("#modal").hidden) closeModal();
    });

    $("#form").addEventListener("submit", submitForm);

    // calc
    ["calc-area", "calc-coats", "calc-color"].forEach(function (id) {
      $("#" + id).addEventListener("input", runCalc);
    });

    // data
    $("#btn-export-json").addEventListener("click", exportJSON);
    $("#btn-export-csv").addEventListener("click", exportCSV);
    $("#btn-import").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });
    $("#btn-clear").addEventListener("click", function () {
      if (items.length === 0) { toast("Nothing to delete"); return; }
      if (confirm("Delete ALL " + items.length + " tins from this device? Export first if unsure.")) {
        items = []; save(); render(); $("#data-msg").textContent = "All stock deleted.";
        toast("Deleted");
      }
    });

    // register service worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }
  }

  /* ---------- seed demo data on first run (so the app isn't empty) ---------- */
  function maybeSeed() {
    if (localStorage.getItem(META_KEY)) return;
    localStorage.setItem(META_KEY, "1");
    if (items.length) return;
    items = [
      { id: uid(), brand: "Resene", type: "Interior low sheen", colorName: "Alabaster", colorCode: "NN40-001",
        hex: "#e8e2d0", finish: "Low Sheen", quantity: 2.5, container: "leftover", notes: "Spare from lounge job", created: Date.now(), updated: Date.now() },
      { id: uid(), brand: "Dulux", type: "Ceiling flat", colorName: "Vivid White", colorCode: "",
        hex: "#f4f3ef", finish: "Flat", quantity: 4, container: "4L tin (part)", notes: "", created: Date.now(), updated: Date.now() },
      { id: uid(), brand: "Wattyl", type: "Exterior acrylic", colorName: "Gull Grey", colorCode: "E16",
        hex: "#8d97a0", finish: "Low Sheen", quantity: 1, container: "leftover", notes: "Trim touch-ups", created: Date.now(), updated: Date.now() }
    ];
    save();
  }

  document.addEventListener("DOMContentLoaded", function () {
    load();
    maybeSeed();
    bind();
    render();
  });
})();
