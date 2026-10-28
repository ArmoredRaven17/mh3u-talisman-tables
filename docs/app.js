"use strict";
/* MH3U Talisman Tables — all app logic (IIFE, no modules). Browse every talisman a table (or every
   table) can give, with the tables each one comes from. engine.js rolls the talismans; this file is the UI. */
(function () {
  const E = window.MH3U_TALISMAN, D = E.data;
  const $ = (id) => document.getElementById(id);
  // All text goes in through textContent, never innerHTML.
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const fmt = (n) => n.toLocaleString("en-US");
  const ICON = (name) => "assets/MonsterIcons/MH3U-" + name + "_Icon.png";

  // ── Names ────────────────────────────────────────────────────────────────
  const TREE = D.trees;
  const treeName = (id) => TREE[id] || "?";
  const SKILL_IDS = Object.keys(TREE).map(Number).sort((a, b) => treeName(a).localeCompare(treeName(b)));
  const CHARM_SHORT = D.charms.map(c => c.name.replace(/ Charm$/, ""));
  const talName = (rar) => D.talismans[rar] || "?";
  const signed = (p) => (p > 0 ? "+" : "") + p;
  const slotText = (n) => "◯".repeat(n) + "–".repeat(3 - n);
  const byNum = Object.fromEntries(E.TABLES.map(t => [t.num, t]));

  const skillCell = (id, p) => {
    const td = el("td");
    if (!id) { td.append(el("span", "none", "—")); return td; }
    td.append(el("span", null, treeName(id)), el("span", "pts" + (p < 0 ? " neg" : ""), signed(p)));
    return td;
  };
  const fromText = (row) => row.ways.map((w, i) => (w ? CHARM_SHORT[i] : null)).filter(Boolean).join(", ");

  // A points box with no skill picked is emptied, locked and shows "---".
  const lockPoints = (input, hasSkill, placeholder) => {
    if (!hasSkill) input.value = "";
    input.disabled = !hasSkill;
    input.placeholder = hasSkill ? placeholder : "---";
  };

  const fillSkillSelect = (sel, first) => {
    sel.replaceChildren();
    for (const [v, label] of first) sel.append(new Option(label, v));
    for (const id of SKILL_IDS) sel.append(new Option(treeName(id), id));
  };

  // ── Every talisman across all tables ─────────────────────────────────────
  // ALL merges identical talismans from every table and records which tables give each one, so
  // every row can list its tables and "All tables" can be browsed like one big table.
  const ALL = new Map();
  for (const t of E.TABLES) {
    for (const r of t.rows) {
      let a = ALL.get(r.key);
      if (!a) {
        a = { ...r, ways: new Array(D.charms.length).fill(0), tables: [] };
        ALL.set(r.key, a);
      }
      r.ways.forEach((w, i) => (a.ways[i] += w));
      a.tables.push(t.num);
      r.tables = a.tables;
    }
  }
  const ALL_ROWS = [...ALL.values()];
  ALL_ROWS.forEach(a => a.tables.sort((x, y) => x - y));
  const NORMAL = E.TABLES.filter(t => !t.cursed).map(t => t.num).sort((x, y) => x - y).join(",");
  const tablesText = (nums) => nums.length === E.TABLES.length ? "All tables"
    : nums.join(",") === NORMAL ? "All normal tables" : nums.map(n => "T" + n).join(", ");

  // ── Preferences ──────────────────────────────────────────────────────────
  // table 0 = All tables.
  const PREFS_KEY = "mh3u-talisman-tables-prefs";
  const DEFAULT_F = { table: 1, charm: -1, skill: 0, min: "", skill2: 0, slots: 0, sort: "skill", best: false };
  let prefs = { f: { ...DEFAULT_F } };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (p && typeof p === "object" && p.f && typeof p.f === "object") {
      const f = p.f, n = (v) => (Number.isInteger(v) ? v : null);
      if (f.table === 0 || byNum[n(f.table)]) prefs.f.table = f.table;
      if (n(f.charm) !== null && f.charm >= -1 && f.charm < D.charms.length) prefs.f.charm = f.charm;
      if (TREE[n(f.skill)]) prefs.f.skill = f.skill;
      if (TREE[n(f.skill2)] || f.skill2 === -1) prefs.f.skill2 = f.skill2;
      if (n(f.min) !== null) prefs.f.min = f.min;
      if ([0, 1, 2, 3].includes(f.slots)) prefs.f.slots = f.slots;
      if (["skill", "points", "slots", "rarity"].includes(f.sort)) prefs.f.sort = f.sort;
      prefs.f.best = f.best === true;
    }
  } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} };

  // ── Browse ───────────────────────────────────────────────────────────────
  $("fTable").append(new Option("All tables", 0));
  for (const t of E.TABLES) $("fTable").append(new Option("T" + t.num + (t.cursed ? " (cursed)" : ""), t.num));
  $("fCharm").append(new Option("All charms", -1));
  D.charms.forEach((c, i) => $("fCharm").append(new Option(c.name, i)));
  fillSkillSelect($("fSkill"), [[0, "Any skill"]]);
  fillSkillSelect($("fSkill2"), [[0, "Any"], [-1, "No second skill"]]);

  // T1-T17 squares: lit when that table can roll a talisman matching the filters. Clicking one
  // shows that table; clicking the shown one again goes back to All tables.
  const SQUARES = {};
  for (const t of E.TABLES) {
    const b = el("button", "tsq" + (t.cursed ? " cursed" : ""), "T" + t.num);
    b.addEventListener("click", () => {
      prefs.f.table = prefs.f.table === t.num ? 0 : t.num;
      $("fTable").value = prefs.f.table;
      savePrefs(); shown = PAGE; renderBrowse();
    });
    SQUARES[t.num] = b;
    $("tableStrip").append(b);
  }

  const PAGE = 200;
  let shown = PAGE, current = [];

  function syncFilterInputs() {
    const f = prefs.f;
    $("fTable").value = f.table; $("fCharm").value = f.charm; $("fSkill").value = f.skill;
    $("fMin").value = f.min; $("fSkill2").value = f.skill2; $("fSlots").value = f.slots;
    $("fSort").value = f.sort; $("fBest").checked = f.best;
    lockPoints($("fMin"), f.skill, "min");
  }
  function readFilters() {
    const f = prefs.f;
    f.table = +$("fTable").value; f.charm = +$("fCharm").value; f.skill = +$("fSkill").value;
    lockPoints($("fMin"), f.skill, "min");
    const min = $("fMin").value.trim();
    f.min = min === "" || isNaN(+min) ? "" : Math.trunc(+min);
    f.skill2 = +$("fSkill2").value; f.slots = +$("fSlots").value; f.sort = $("fSort").value;
    f.best = $("fBest").checked;
    savePrefs();
    shown = PAGE;
    renderBrowse();
  }
  ["fTable", "fCharm", "fSkill", "fSkill2", "fSlots", "fSort", "fBest"].forEach(id => $(id).addEventListener("change", readFilters));
  $("fMin").addEventListener("input", readFilters);
  $("fReset").addEventListener("click", () => {
    prefs.f = { ...DEFAULT_F, table: prefs.f.table };
    syncFilterInputs(); shown = PAGE; savePrefs(); renderBrowse();
  });

  const ptsOf = (r, id) => (r.id1 === id ? r.p1 : r.id2 === id ? r.p2 : null);

  // Keep a talisman unless another one in the list with the same two skills has at least its points
  // and slots and beats it somewhere. Different talisman names alone don't count as better.
  function bestOnly(rows) {
    const groups = new Map();
    for (const r of rows) {
      const k = r.id1 + "," + r.id2;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const out = [];
    for (const g of groups.values()) {
      for (const r of g) {
        const beaten = g.some(o => o.p1 >= r.p1 && o.p2 >= r.p2 && o.slots >= r.slots &&
          (o.p1 > r.p1 || o.p2 > r.p2 || o.slots > r.slots));
        if (!beaten) out.push(r);
      }
    }
    return out;
  }

  function sortRows(rows, f) {
    const nameCmp = (a, b) => treeName(a.id1).localeCompare(treeName(b.id1)) || b.p1 - a.p1 ||
      (a.id2 ? 0 : 1) - (b.id2 ? 0 : 1) || treeName(a.id2).localeCompare(treeName(b.id2)) || b.p2 - a.p2 ||
      b.slots - a.slots || b.rarity - a.rarity;
    const cmp = {
      skill: nameCmp,
      points: f.skill ? (a, b) => ptsOf(b, f.skill) - ptsOf(a, f.skill) || nameCmp(a, b)
                      : (a, b) => b.p1 - a.p1 || b.p2 - a.p2 || nameCmp(a, b),
      slots: (a, b) => b.slots - a.slots || nameCmp(a, b),
      rarity: (a, b) => b.rarity - a.rarity || nameCmp(a, b),
    }[f.sort];
    return rows.sort(cmp);
  }

  function renderTableCard(t, rows) {
    const card = $("tableCard");
    card.replaceChildren();
    if (!t) {
      card.append(el("h2", null, "All tables"));
      const rolls = E.TABLES.reduce((n, tb) => n + tb.total, 0);
      card.append(el("p", null, fmt(rolls) + " rolls across all 17 tables, which come out as " + fmt(rows.length) +
        " different talismans."));
      card.append(el("p", null, "The Tables column shows which tables can give each one."));
    } else {
      const h = el("h2", null, "Table " + t.num);
      h.append(el("span", "badge " + (t.cursed ? "cursed" : "safe"), t.cursed ? "CURSED" : "NORMAL"));
      card.append(h);
      // Rolls = every charm from every point on the table; many rolls give the same talisman.
      card.append(el("p", null, t.cursed
        ? "A cursed table: only " + fmt(t.total) + " rolls, which come out as " + fmt(rows.length) + " different talismans."
        : fmt(t.total) + " rolls across the four charms, which come out as " + fmt(rows.length) +
          " different talismans, since many rolls give the same one."));
      if (t.cursed) card.append(el("p", null, "A normal table has 21,600 rolls and about 12,900 different talismans."));
    }
    const counts = el("div", "charm-counts");
    D.charms.forEach((c, i) => {
      const n = rows.reduce((s, r) => s + (r.ways[i] ? 1 : 0), 0);
      counts.append(el("span", null, c.name + ": " + fmt(n)));
    });
    card.append(counts);
  }

  function renderBrowse() {
    const f = prefs.f, t = byNum[f.table] || null;
    renderTableCard(t, t ? t.rows : ALL_ROWS);
    const pass = (r) => {
      if (f.charm >= 0 && !r.ways[f.charm]) return false;
      if (r.slots < f.slots) return false;
      if (f.skill) {
        const p = ptsOf(r, f.skill);
        if (p === null || (f.min !== "" && p < f.min)) return false;
      }
      if (f.skill2 === -1 && r.id2) return false;
      if (f.skill2 > 0) {
        if (r.id1 !== f.skill2 && r.id2 !== f.skill2) return false;
        if (f.skill && f.skill === f.skill2) return false;
      }
      return true;
    };
    // Squares look at every table, whichever one is shown. The charm filter counts per table, so
    // a table is lit only if it gives a match from that charm.
    const lit = new Set();
    for (const tb of E.TABLES) {
      if (tb.rows.some(pass)) lit.add(tb.num);
    }
    for (const [num, b] of Object.entries(SQUARES)) {
      b.classList.toggle("off", !lit.has(+num));
      b.classList.toggle("sel", +num === f.table);
      b.title = "T" + num + (lit.has(+num) ? ": can roll a talisman matching the filters" : ": can't roll a talisman matching the filters");
    }
    let rows = (t ? t.rows : ALL_ROWS).filter(pass);
    if (f.best) rows = bestOnly(rows);
    current = sortRows(rows, f);
    drawRows();
  }

  function drawRows() {
    const body = $("talBody");
    body.replaceChildren();
    for (const r of current.slice(0, shown)) {
      const tr = el("tr");
      const tal = el("td");
      tal.append(el("span", null, talName(r.rarity)), el("span", "rar", "Rare " + r.rarity));
      tr.append(tal, skillCell(r.id1, r.p1), skillCell(r.id2, r.p2), el("td", "slots", slotText(r.slots)),
        el("td", "from col-from", fromText(r)), el("td", "tables", tablesText(r.tables)));
      body.append(tr);
    }
    const n = current.length;
    $("listCount").textContent = n === 0
      ? "No talismans match these filters" + (prefs.f.table ? " on this table." : " on any table.")
      : n > shown ? "Showing " + fmt(shown) + " of " + fmt(n) + " talismans" : fmt(n) + " talismans";
    $("moreBtn").classList.toggle("hidden", n <= shown);
  }
  $("moreBtn").addEventListener("click", () => { shown += PAGE; drawRows(); });

  // ── Your Save ────────────────────────────────────────────────────────────
  // The file is read and changed here in the browser (save.js); nothing is uploaded or stored.
  let save = null;
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  for (const t of E.TABLES) $("moveTo").append(new Option("T" + t.num + (t.cursed ? " (cursed)" : ""), t.num));

  function renderSave() {
    show("saveInfo", !!save);
    const own = save ? save.table().num : 0;
    for (const [num, b] of Object.entries(SQUARES)) b.classList.toggle("own", +num === own);
    if (!save) return;
    const t = save.table();
    $("saveBadge").className = "badge " + (t.cursed ? "cursed" : "safe");
    $("saveBadge").textContent = "T" + t.num;
    $("saveName").textContent = (save.fileName || "Your save") + " · " + (save.platform === "wiiu" ? "Wii U" : "3DS");
    $("saveNote").textContent = t.cursed
      ? "This save is on a cursed table: its charms can only turn into " + fmt(t.rows.length) +
        " different talismans. Move it to a normal table below."
      : "This save is on a normal table.";
    $("saveWarn").textContent = save.warnings.join(" ");
    show("saveWarn", save.warnings.length > 0);
    $("moveBtn").disabled = +$("moveTo").value === t.num;
  }

  $("openSaveBtn").addEventListener("click", () => $("saveFile").click());
  $("saveFile").addEventListener("change", async () => {
    const file = $("saveFile").files[0];
    $("saveFile").value = "";   // so the same file can be opened again
    if (!file) return;
    show("moveDone", false);
    try {
      save = MH3U_SAVE.open(new Uint8Array(await file.arrayBuffer()), file.name);
      show("saveErr", false);
    } catch (e) {
      save = null;
      $("saveErr").textContent = e.message;
      show("saveErr", true);
    }
    if (save) {
      const num = save.table().num;
      $("moveTo").value = num;
      prefs.f.table = num;          // show the save's own table
      $("fTable").value = num;
      savePrefs(); shown = PAGE; renderBrowse();
    }
    renderSave();
  });
  $("moveTo").addEventListener("change", () => { show("moveDone", false); renderSave(); });

  function downloadMoved() {
    const num = +$("moveTo").value, name = save.fileName || "user1";
    const out = save.movedTo(num);
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([out], { type: "application/octet-stream" }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    save = MH3U_SAVE.open(out, name);   // the panel now describes the downloaded file
    $("moveDone").textContent = "Downloaded " + name + ", now on T" + num + ".";
    show("moveDone", true);
    renderSave();
  }
  $("moveBtn").addEventListener("click", () => {
    const t = byNum[+$("moveTo").value];
    if (!save || !t) return;
    if (!t.cursed) return downloadMoved();
    $("cursedText").textContent = "T" + t.num + " is a cursed table: its charms can only turn into " + fmt(t.rows.length) +
      " different talismans. Move this save there anyway?";
    show("cursedModal", true);
  });
  $("cursedOk").addEventListener("click", () => { show("cursedModal", false); downloadMoved(); });

  // ── Panels and modals ────────────────────────────────────────────────────
  document.querySelectorAll(".panel-head").forEach(h => h.addEventListener("click", () => {
    const p = h.parentElement;
    p.dataset.open = p.dataset.open === "true" ? "false" : "true";
  }));
  const modal = (btnId, modalId, closeId) => {
    if (btnId) $(btnId).addEventListener("click", () => $(modalId).classList.remove("hidden"));
    $(closeId).addEventListener("click", () => $(modalId).classList.add("hidden"));
    $(modalId).addEventListener("click", (e) => { if (e.target.id === modalId) $(modalId).classList.add("hidden"); });
  };
  modal("helpBtn", "helpModal", "helpClose");
  modal("linksBtn", "linksModal", "linksClose");
  modal("aboutBtn", "aboutModal", "aboutClose");
  modal("themeBtn", "themeModal", "themeClose");
  modal(null, "cursedModal", "cursedCancel");

  // ── Theme ────────────────────────────────────────────────────────────────
  // Palette and LEGACY_HEX: the MH3U apps' shared copy (the Hunting Log's). Same 31 hexes as the
  // MHGU family — each one clears the white-text / white-checkbox contrast line, so don't add one
  // without checking it (the MHGU Quest Randomizer's app.js carries the reasoning).
  const COLORS = [
    ["Volvidon", "#570B0B"], ["Rathalos", "#b51717"],
    ["R. Duramboros", "#783E0F", "Rust Duramboros"], ["Agnaktor", "#C7620E"],
    ["Uragaan", "#74631D"], ["G. Rathian", "#9C8328", "Gold Rathian"],
    ["G. Nargacuga", "#436713", "Green Nargacuga"], ["G. Plesioth", "#67922E", "Green Plesioth"],
    ["Deviljho", "#0B570F"], ["Rathian", "#39993E"],
    ["S. Uragaan", "#14503d", "Steel Uragaan"], ["Zinogre", "#279773"],
    ["A. Lagiacrus", "#0C5D68", "Abyssal Lagiacrus"], ["G. Agnaktor", "#118898", "Glacial Agnaktor"],
    ["Nargacuga", "#005984"], ["Plesioth", "#0080c1"],
    ["Brachydios", "#0B2757"], ["Lagiacrus", "#0b3f97"],
    ["Great Wroggi", "#1F0B57"], ["Great Jaggi", "#4e2fa2"],
    ["H. Jhen Mohran", "#62008f", "Hallowed Jhen Mohran"], ["P. Ludroth", "#8e50ab", "Purple Ludroth"],
    ["P. Rathian", "#D4358C", "Pink Rathian"], ["Qurupeco", "#C8679D"],
    ["Duramboros", "#5a411f"], ["Diablos", "#997c54"],
    ["Barroth", "#835A32"], ["Bullfango", "#B17A47"],
    ["S. Rathalos", "#505358", "Silver Rathalos"], ["Barioth", "#7C879B"],
    ["Forbidden", "#1E2025", "Question Mark"],
  ];
  // Retired hexes remap on read (a saved theme is a bare hex). Kept identical to the other apps.
  const LEGACY_HEX = {
    "#C8A319": "#74631D", "#57470B": "#74631D", "#5E4D0C": "#74631D",
    "#574916": "#74631D", "#68581A": "#74631D",
    "#F1D364": "#9C8328", "#B59417": "#9C8328", "#C39F19": "#9C8328",
    "#BEA031": "#9C8328",
    "#C65900": "#783E0F", "#FC933E": "#C7620E",
    "#68360D": "#783E0F", "#B5590D": "#C7620E",
    "#3A9B3F": "#39993E", "#2DAE85": "#279773",
    "#D84696": "#D4358C", "#CE79A8": "#C8679D",
    "#B57C45": "#835A32", "#CFAA87": "#B17A47",
    "#AEB5C1": "#7C879B",
  };
  const migrateHex = (h) => (h && LEGACY_HEX[h.toUpperCase()]) || h;
  const COLORS_HEX = Object.fromEntries(COLORS.map(([name, hex]) => [hex.toUpperCase(), name]));
  const COLORS_ICON = Object.fromEntries(COLORS.filter(c => c[2]).map(([name, , icon]) => [name, icon]));
  const monsterIcon = (name) => ICON(name.replace(/ /g, "_"));

  const hexRgb = (h) => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
            : max === g ? ((b - r) / d + 2) / 6
            :             ((r - g) / d + 4) / 6;
    return [h, s, l];
  };
  const hslToRgb = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x] : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  };
  // darken/lighten only move lightness, so every derived shade keeps the theme's hue and
  // saturation. The factors are the Hunting Log's, so a theme looks like itself in every app.
  const darken = (rgb, f) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l * f)]); };
  const lighten = (rgb, b) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l + (1 - l) * b)]); };
  const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  const THEME_KEY = "mh3u-talisman-tables-theme";
  function applyTheme(hex) {
    const c = hexRgb(hex);
    const vars = {
      "--bg": css(darken(c, .70)), "--bg1": css(darken(c, .80)),
      "--content-bg": css(darken(c, .55)), "--panel-bg": css(darken(c, .40)),
      "--input-bg": css(darken(c, .35)), "--bg2": css(darken(c, .95)),
      "--hover": css(darken(c, .30)), "--accent": css(darken(c, .7)),
      "--accent-hover": css(lighten(c, .4)),
    };
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
    try { localStorage.setItem(THEME_KEY, hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const name = COLORS_HEX[hex.toUpperCase()];
    $("titleIcon").src = monsterIcon(name ? COLORS_ICON[name] || name : "Question Mark");
  }
  for (const [name, hex] of COLORS) {
    const d = el("div", "swatch");
    d.dataset.hex = hex;
    d.style.background = hex;
    d.title = name;
    const img = el("img", "swatch-icon");
    img.src = monsterIcon(COLORS_ICON[name] || name);
    img.alt = "";
    d.append(img, el("span", null, name));
    d.addEventListener("click", () => applyTheme(hex));
    $("swatches").appendChild(d);
  }
  const DEFAULT_THEME = "#1E2025";
  let savedTheme = DEFAULT_THEME;
  try { savedTheme = migrateHex(localStorage.getItem(THEME_KEY)) || savedTheme; } catch (e) {}
  if (!COLORS_HEX[String(savedTheme).toUpperCase()]) savedTheme = DEFAULT_THEME;
  applyTheme(savedTheme);

  // No Content Background picker: this app has no background images, so the digital (chroma-key)
  // colours aren't needed (Raven, 2026-10-28). Drop a choice saved by an earlier version.
  try { localStorage.removeItem("mh3u-talisman-tables-bg"); } catch (e) {}

  // ── Start ────────────────────────────────────────────────────────────────
  // On a phone the filters stack above the list, so they start folded away.
  if (window.matchMedia("(max-width:760px)").matches) document.querySelectorAll(".sidebar .panel").forEach(p => (p.dataset.open = "false"));
  syncFilterInputs();
  renderBrowse();
})();
