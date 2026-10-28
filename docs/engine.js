"use strict";
/* MH3U Talisman Tables — the talisman engine. The game's own logic, translated from the 3DS code
   (C:\MH3U-Extract\notes\talisman-tables.md): the charm RNG, its 17 cycles (the tables) and the
   charm generator at 0x897d40. data.js holds the tables the generator reads, taken from the ROM.
   No DOM here, so node can check it against the Python copy (C:\MH3U-Extract\talismans\gen.py). */
(function (root) {
  const D = root.MH3U_TALISMAN_DATA;

  // ── RNG and tables ───────────────────────────────────────────────────────
  // Charm RNG slot 1 steps x -> (x || 1) * 176 mod 65363 (0x590c80). 65363 = 163 * 401, so the
  // 65362 nonzero states fall into 17 cycles: twelve of 5400, two of 200 and three of 54. The save
  // keeps the state and nothing reseeds it, so a save never leaves its cycle: the cycle is the table.
  const MOD = 65363, MUL = 176;
  const step = (x) => ((x || 1) * MUL) % MOD;

  const CYCLE = new Uint16Array(MOD);   // state -> smallest state on its cycle (the cycle id)
  const CYCLES = {};                    // cycle id -> states in step order
  for (let s = 1; s < MOD; s++) {
    if (CYCLE[s]) continue;
    const list = [];
    let x = s;
    do { CYCLE[x] = s; list.push(x); x = step(x); } while (x !== s);
    CYCLES[s] = list;
  }
  CYCLE[0] = 1;   // a zero state steps as 1

  // Cycle id -> the community's table number, as Athena's ASS numbers them (the MH3U save editor uses
  // the same map). The 13 published New Game times agree; T12 is the 54-long cycle 401 and T15 the
  // 200-long 489 (Raven, 2026-10-28; the Cursed Table app still has those two the other way round).
  const NAMED = { 1: 1, 15: 2, 5: 3, 13: 4, 4: 5, 3: 6, 9: 7, 12: 8, 26: 9, 18: 10, 163: 11, 401: 12, 6: 13,
    2: 14, 489: 15, 802: 16, 1203: 17 };

  // ── Charm generator (0x897d40) ───────────────────────────────────────────
  // Every draw steps slot 1 and uses the new value. From state s it returns the talisman and the
  // state after it. Scores are float32 in the game, so every float step goes through fround.
  const f32 = Math.fround, TENTH = f32(0.1);
  function generate(charm, s) {
    const draw = () => (s = step(s));
    const points = (e) => {
      const lo = e[1], hi = e[2];
      let base, span;
      if (hi > 0 && lo <= 0) {            // range crosses zero: a coin flip picks the side first
        if ((draw() & 1) === 0) { base = lo; span = 1 - lo; } else { base = 1; span = hi; }
      } else { base = lo; span = hi - lo + 1; }
      if (span !== 0) base += draw() % span;
      return base;
    };
    const e1 = charm.skill1[draw() % charm.skill1.length];
    let p1 = points(e1), id1 = p1 ? e1[0] : 0;
    let e2 = null, id2 = 0, p2 = 0;
    if (!(charm.noSecond > draw() % 100) && charm.skill2.length) {
      e2 = charm.skill2[draw() % charm.skill2.length];
      p2 = points(e2);
      id2 = p2 ? e2[0] : 0;
    }
    if (id1 === id2) { id2 = 0; p2 = 0; }                         // same skill twice: drop the second
    if (p1 === 0) { id1 = id2; p1 = p2; id2 = 0; p2 = 0; }        // empty first skill: move the second up
    // Score: each skill's points as tenths of its table maximum, clamped to 0..20.
    let sc = 0;
    for (const [e, p] of [[e1, p1], [e2, p2]]) {
      if (!e) continue;
      sc = f32(sc + (p < 0 ? 0 : f32(p / f32(f32(e[2]) * TENTH))));
    }
    sc = sc < 0 ? 0 : sc > 20 ? 20 : sc;
    const r = draw() % 100, row = charm.slots[Math.trunc(sc)];
    let slots = 0, acc = 0;
    while (slots < 4) { acc += row[slots]; if (r < acc) break; slots++; }
    // Talisman name (= rarity) from slots * 2 + score against the charm's thresholds.
    const v = f32(slots * 2 + sc);
    let rarity = charm.rarityFloor;
    for (const [t, rar] of charm.rarity) if (v >= t) { rarity = rar; break; }
    return { rarity, slots, id1, p1, id2, p2, next: s };
  }

  // ── Every talisman on every table ────────────────────────────────────────
  // A charm can be opened at any point on the cycle, so a table's talismans are what each charm
  // gives from each of the table's states. Identical talismans are merged, counting the states
  // that give them per charm.
  const keyOf = (t) => [t.rarity, t.slots, t.id1, t.p1, t.id2, t.p2].join(",");
  const TABLES = [];
  for (const [cid, states] of Object.entries(CYCLES)) {
    const num = NAMED[cid];
    const byKey = new Map();
    for (let c = 0; c < D.charms.length; c++) {
      const charm = D.charms[c];
      for (const s of states) {
        const t = generate(charm, s);
        const k = keyOf(t);
        let row = byKey.get(k);
        if (!row) {
          row = { key: k, rarity: t.rarity, slots: t.slots, id1: t.id1, p1: t.p1, id2: t.id2, p2: t.p2,
            ways: new Array(D.charms.length).fill(0) };
          byKey.set(k, row);
        }
        row.ways[c]++;
      }
    }
    TABLES.push({ num, cycle: +cid, states: states.length, cursed: states.length !== 5400,
      total: states.length * D.charms.length, rows: [...byKey.values()], byKey });
  }
  TABLES.sort((a, b) => a.num - b.num);

  root.MH3U_TALISMAN = { step, generate, CYCLE, CYCLES, NAMED, TABLES, keyOf, data: D };
})(typeof window !== "undefined" ? window : globalThis);
