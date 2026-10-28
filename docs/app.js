"use strict";
/* MH3U Talisman Tables — all app logic (IIFE, no modules). Browse every talisman a table can give,
   or find the tables that can give a talisman. engine.js rolls the talismans; this file is the UI. */
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

  // ── Preferences ──────────────────────────────────────────────────────────
  const PREFS_KEY = "mh3u-talisman-tables-prefs";
  const DEFAULT_F = { table: 1, charm: -1, skill: 0, min: "", skill2: 0, slots: 0, sort: "skill", best: false };
  let prefs = { mode: "browse", f: { ...DEFAULT_F }, rows: [], better: false };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (p && typeof p === "object") {
      if (p.mode === "find") prefs.mode = "find";
      if (p.f && typeof p.f === "object") {
        const f = p.f, n = (v) => (Number.isInteger(v) ? v : null);
        if (byNum[n(f.table)]) prefs.f.table = f.table;
        if (n(f.charm) !== null && f.charm >= -1 && f.charm < D.charms.length) prefs.f.charm = f.charm;
        if (TREE[n(f.skill)]) prefs.f.skill = f.skill;
        if (TREE[n(f.skill2)] || f.skill2 === -1) prefs.f.skill2 = f.skill2;
        if (n(f.min) !== null) prefs.f.min = f.min;
        if ([0, 1, 2, 3].includes(f.slots)) prefs.f.slots = f.slots;
        if (["skill", "points", "slots", "rarity"].includes(f.sort)) prefs.f.sort = f.sort;
        prefs.f.best = f.best === true;
      }
      if (Array.isArray(p.rows)) prefs.rows = p.rows.slice(0, 20).map(cleanRow).filter(Boolean);
      prefs.better = p.better === true;
    }
  } catch (e) {}
  function cleanRow(r) {
    if (!r || typeof r !== "object") return null;
    const int = (v) => (Number.isInteger(v) && v >= -20 && v <= 20 ? v : "");
    return { s1: TREE[r.s1] ? r.s1 : 0, p1: int(r.p1), s2: TREE[r.s2] ? r.s2 : 0, p2: int(r.p2),
      slots: [0, 1, 2, 3].includes(r.slots) ? r.slots : 0 };
  }
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} };

  // ── Modes ────────────────────────────────────────────────────────────────
  function setMode(m) {
    prefs.mode = m;
    $("tabBrowse").classList.toggle("sel", m === "browse");
    $("tabFind").classList.toggle("sel", m === "find");
    $("modeBrowse").classList.toggle("hidden", m !== "browse");
    $("modeFind").classList.toggle("hidden", m !== "find");
    $("browsePanel").classList.toggle("hidden", m !== "browse");
    $("findPanel").classList.toggle("hidden", m !== "find");
    savePrefs();
    if (m === "browse") renderBrowse(); else renderFind();
  }
  $("tabBrowse").addEventListener("click", () => setMode("browse"));
  $("tabFind").addEventListener("click", () => setMode("find"));

  // ── Browse a Table ───────────────────────────────────────────────────────
  for (const t of E.TABLES) $("fTable").append(new Option("T" + t.num + (t.cursed ? " (cursed)" : ""), t.num));
  $("fCharm").append(new Option("All charms", -1));
  D.charms.forEach((c, i) => $("fCharm").append(new Option(c.name, i)));
  fillSkillSelect($("fSkill"), [[0, "Any skill"]]);
  fillSkillSelect($("fSkill2"), [[0, "Any"], [-1, "No second skill"]]);

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

  // Keep a talisman unless another one with the same two skills has at least its points and slots
  // and beats it somewhere. Different talisman names alone don't count as better.
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

  function renderTableCard(t) {
    const card = $("tableCard");
    card.replaceChildren();
    const h = el("h2", null, "Table " + t.num);
    h.append(el("span", "badge " + (t.cursed ? "cursed" : "safe"), t.cursed ? "CURSED" : "NORMAL"));
    card.append(h);
    card.append(el("p", null, t.cursed
      ? "A cursed table: only " + fmt(t.rows.length) + " different talismans, against about 12,900 on a normal table."
      : fmt(t.rows.length) + " different talismans can come out of the four charms on this table."));
    const counts = el("div", "charm-counts");
    D.charms.forEach((c, i) => {
      const n = t.rows.reduce((s, r) => s + (r.ways[i] ? 1 : 0), 0);
      counts.append(el("span", null, c.name + ": " + fmt(n)));
    });
    card.append(counts);
  }

  function renderBrowse() {
    const f = prefs.f, t = byNum[f.table];
    renderTableCard(t);
    let rows = t.rows.filter(r => {
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
    });
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
        el("td", "from col-from", fromText(r)));
      tr.title = "Which tables can give this talisman?";
      tr.addEventListener("click", () => {
        prefs.rows = [{ s1: r.id1, p1: r.p1, s2: r.id2, p2: r.id2 ? r.p2 : "", slots: r.slots }];
        prefs.better = false;
        setMode("find");
      });
      body.append(tr);
    }
    const n = current.length;
    $("listCount").textContent = n === 0 ? "No talismans match these filters on this table."
      : n > shown ? "Showing " + fmt(shown) + " of " + fmt(n) + " talismans" : fmt(n) + " talismans";
    $("moreBtn").classList.toggle("hidden", n <= shown);
  }
  $("moreBtn").addEventListener("click", () => { shown += PAGE; drawRows(); });

  // ── Find a Talisman ──────────────────────────────────────────────────────
  function rowValid(r) {
    if (!r.s1) return false;
    if (prefs.better) return r.p1 === "" || Number.isInteger(r.p1);
    return Number.isInteger(r.p1) && (!r.s2 || Number.isInteger(r.p2));
  }

  // Exact: the talisman as the game shows it. Or better: both skills (either order) with at least
  // those points, at least those slots; with no second skill entered, any second skill goes.
  function matches(t, r) {
    if (!prefs.better) {
      return t.rows.filter(x => x.id1 === r.s1 && x.p1 === r.p1 && x.slots === r.slots &&
        (r.s2 ? x.id2 === r.s2 && x.p2 === r.p2 : x.id2 === 0));
    }
    const need1 = r.p1 === "" ? -99 : r.p1, need2 = r.p2 === "" ? -99 : r.p2;
    const out = t.rows.filter(x => {
      if (x.slots < r.slots) return false;
      const a = ptsOf(x, r.s1);
      if (a === null || a < need1) return false;
      if (r.s2) {
        if (r.s2 === r.s1) return false;
        const b = ptsOf(x, r.s2);
        if (b === null || b < need2) return false;
      }
      return true;
    });
    const score = (x) => ptsOf(x, r.s1) + (r.s2 ? ptsOf(x, r.s2) : 0);
    return out.sort((a, b) => score(b) - score(a) || b.slots - a.slots || b.rarity - a.rarity);
  }

  const rowText = (x) => treeName(x.id1) + " " + signed(x.p1) + (x.id2 ? ", " + treeName(x.id2) + " " + signed(x.p2) : "") +
    "  " + slotText(x.slots);

  function drawFindRows() {
    const box = $("talRows");
    box.replaceChildren();
    if (!prefs.rows.length) prefs.rows.push({ s1: 0, p1: "", s2: 0, p2: "", slots: 0 });
    prefs.rows.forEach((r, i) => {
      const row = el("div", "tal-row");
      const s1 = el("select", "a-s1"), s2 = el("select", "a-s2"), sl = el("select", "a-sl");
      fillSkillSelect(s1, [[0, "Skill 1"]]);
      fillSkillSelect(s2, [[0, prefs.better ? "(any)" : "(none)"]]);
      // 3 slots is the most a talisman can have, so "or better" never reads "3+".
      for (let n = 0; n <= 3; n++) sl.append(new Option((prefs.better && n && n < 3 ? n + "+ " : n + " ") + (n === 1 ? "slot" : "slots"), n));
      const p1 = el("input", "a-p1"), p2 = el("input", "a-p2");
      const ph = prefs.better ? "min" : "pts";
      for (const p of [p1, p2]) { p.type = "number"; p.min = -10; p.max = 13; }
      s1.value = r.s1; s2.value = r.s2; sl.value = r.slots; p1.value = r.p1; p2.value = r.p2;
      lockPoints(p1, r.s1, ph); lockPoints(p2, r.s2, ph);
      s1.setAttribute("aria-label", "Skill 1"); s2.setAttribute("aria-label", "Skill 2");
      p1.setAttribute("aria-label", "Skill 1 points"); p2.setAttribute("aria-label", "Skill 2 points");
      sl.setAttribute("aria-label", "Slots");
      const read = () => {
        const num = (v) => (v.trim() === "" || isNaN(+v) ? "" : Math.trunc(+v));
        lockPoints(p1, +s1.value, ph); lockPoints(p2, +s2.value, ph);
        prefs.rows[i] = { s1: +s1.value, p1: num(p1.value), s2: +s2.value, p2: num(p2.value), slots: +sl.value };
        savePrefs();
        renderResults();
      };
      [s1, s2, sl].forEach(x => x.addEventListener("change", read));
      [p1, p2].forEach(x => x.addEventListener("input", read));
      const x = el("button", "x-btn a-x", "✕");
      x.title = "Remove"; x.setAttribute("aria-label", "Remove this talisman");
      x.addEventListener("click", () => { prefs.rows.splice(i, 1); savePrefs(); renderFind(); });
      row.append(el("span", "num a-n", String(i + 1)), s1, p1, s2, p2, sl, x);
      box.append(row);
    });
  }

  function renderResults() {
    const grid = $("findGrid");
    grid.replaceChildren();
    const rows = prefs.rows.map((r, i) => ({ r, i })).filter(({ r }) => rowValid(r));
    if (!rows.length) {
      $("findVerdict").textContent = prefs.better ? "Pick a skill to start." : "Pick a skill and enter its points to start.";
      return;
    }
    const fits = [];
    for (const t of E.TABLES) {
      const card = el("div", "tcard");
      const head = el("div", "tcard-head");
      head.append(el("span", null, "T" + t.num));
      if (t.cursed) head.append(el("span", "tag", "CURSED"));
      const ul = el("ul");
      let all = true;
      for (const { r, i } of rows) {
        const m = matches(t, r);
        const li = el("li");
        const tag = rows.length > 1 ? "#" + (i + 1) + " " : "";
        if (m.length) {
          const best = m[0];
          li.append(el("span", "ok", "✓ "), el("span", null, tag + (prefs.better
            ? rowText(best) + (m.length > 1 ? " (" + fmt(m.length) + " fit)" : "")
            : talName(best.rarity))));
          li.append(el("div", "from", m.length === 1 || !prefs.better ? "From: " + fromText(best) : "Best from: " + fromText(best)));
        } else {
          all = false;
          li.append(el("span", "bad", "✗ "), el("span", null, tag + "Not on this table"));
        }
        ul.append(li);
      }
      card.classList.add(all ? "yes" : "no");
      card.append(head, ul);
      if (all) fits.push(t);
      grid.append(card);
    }
    // Tables that fit go first.
    [...grid.children].filter(c => c.classList.contains("yes")).reverse().forEach(c => grid.prepend(c));
    const what = (rows.length > 1 ? "all " + rows.length + " talismans" : "this talisman") + (prefs.better ? " or better" : "");
    const names = fits.map(t => "T" + t.num).join(", ");
    $("findVerdict").textContent = !fits.length
      ? "No table can give " + what + ". Check the skills, points and slots against the game."
      : fits.length === E.TABLES.length ? "Every table can give " + what + "."
      : (fits.length === 1 ? "Only " + names + " can give " : fits.length + " tables can give ") + what +
        (fits.length === 1 ? "." : ": " + names + ".");
  }

  function renderFind() {
    $("orBetter").checked = prefs.better;
    drawFindRows();
    renderResults();
  }
  $("addRowBtn").addEventListener("click", () => {
    prefs.rows.push({ s1: 0, p1: "", s2: 0, p2: "", slots: 0 });
    savePrefs(); drawFindRows();
  });
  $("clearRowsBtn").addEventListener("click", () => { prefs.rows = []; savePrefs(); renderFind(); });
  $("orBetter").addEventListener("change", () => { prefs.better = $("orBetter").checked; savePrefs(); renderFind(); });

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

  // Flat backdrops for chroma-keying the app on stream.
  const BG_KEY = "mh3u-talisman-tables-bg";
  const SOLID_BG = [["None", ""], ["Digital Blue", "#0000FF"], ["Digital Green", "#00FF00"]];
  function applyBg(value) {
    if (!SOLID_BG.some(([, v]) => v === value)) value = "";
    $("content").style.background = value;
    try { localStorage.setItem(BG_KEY, value); } catch (e) {}
    document.querySelectorAll(".bg-thumb").forEach(t => t.classList.toggle("sel", t.dataset.value === value));
  }
  for (const [name, value] of SOLID_BG) {
    const d = el("div", "bg-thumb" + (value ? "" : " none-thumb"), value ? null : name);
    d.dataset.value = value;
    d.title = name;
    if (value) d.style.background = value;
    d.addEventListener("click", () => applyBg(value));
    $("bgGrid").appendChild(d);
  }
  let savedBg = "";
  try { savedBg = localStorage.getItem(BG_KEY) || ""; } catch (e) {}
  applyBg(savedBg);

  // ── Start ────────────────────────────────────────────────────────────────
  // On a phone the filters stack above the list, so they start folded away.
  if (window.matchMedia("(max-width:760px)").matches) document.querySelectorAll(".sidebar .panel").forEach(p => (p.dataset.open = "false"));
  syncFilterInputs();
  setMode(prefs.mode);
})();
