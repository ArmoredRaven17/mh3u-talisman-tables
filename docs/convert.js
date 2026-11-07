"use strict";
/* MH3U Talisman Tables — convert a hunter between 3DS and Wii U. Ported from the MH3U Save Editor
   (mh3u-editor/src/core/convert.ts, notes in C:\MH3U-Extract\notes\SAVE_FORMAT.md). No DOM here.

   Both versions store a hunter as the same 0x8a00-byte payload, a raw copy of the game's save object.
   What differs:
   - byte order: every u16 / u32 field is little-endian on 3DS, big-endian on Wii U. Text, u8 fields
     and byte-addressed bit arrays are the same on both.
   - packed C bitfields: PowerPC fills them from the top bit, ARM from the bottom, so the monster-log
     crown byte and the arena run word are laid out mirrored.
   LAYOUT lists every multi-byte field and the known byte fields. Uncovered bytes copy as they are.
   Keep it in step with the editor's copy. */
(function (root) {
  const USER_PAYLOAD = 0x8a00;
  const B = (off) => 4 + off;            // block offset -> payload offset
  const T = (off) => 0x7a04 + off;       // guild-card tail offset -> payload offset

  // One equipment record (0x10): u8 type, u8, u16 id, +4 (u32 pigment, or 4 talisman bytes),
  // 3 x u16 decorations, u16.
  const EQUIP = 0x10;

  // [payload offset, kind, count]. u8 = known single bytes or text (copied as they are).
  const LAYOUT = [
    [0, "u32", 1], // version 0x2c

    // ── Known single bytes and text (no conversion) ──
    [B(0x00), "u8", 0x1c], // gender, face, hair, name[25]
    [B(0xa6), "u8", 2], // clothing type, voice
    ...Array.from({ length: 24 }, (_, k) => [B(0x4fa8 + 0x4c * k + 0x38), "u8", 0x14]), // set names
    [B(0x5708), "u8", 0x40 + 2], // Combo List known combinations (byte bits), 0x5748/9
    [B(0x575a), "u8", 12 + 2], // shop "bought" flags (byte bits), pigment override, 0x5767
    [B(0x5a22), "u8", 5], // appearance bytes, scene state, pending event, boats owned
    [B(0x5b2c), "u8", 2], // online-profile bytes
    ...Array.from({ length: 3 }, (_, k) => [[B(0x5b44 + 12 * k), "u8", 6], [B(0x5b44 + 12 * k + 0xa), "u8", 2]]).flat(), // boat bytes
    [B(0x5b68), "u8", 4], // farm Felyne names, 0x5b6b
    ...Array.from({ length: 41 }, (_, k) => [B(0x5b6c + 16 * k), "u8", 8]), // Moga Woods table bytes
    ...[0x5dfc, 0x5eca, 0x5ed6].map((d) => [B(d), "u8", 4]), // Moga Woods day picks
    [B(0x5e1d), "u8", 1], // VE ticket counter
    [B(0x5e24), "u8", 4], // farm plot levels
    ...Array.from({ length: 3 }, (_, k) => [B(0x5e28 + 8 * k + 4), "u8", 2]), // farm slot days
    [B(0x5e40), "u8", 6], // farm slot count, 0x5e41-0x5e45
    [B(0x5eba), "u8", 4], // Argosy route mask, routes, s8 days, flag
    [B(0x5ec2), "u8", 6], // Poogie name, look, house decorations, 0x5ec7
    [B(0x617c), "u8", 0xcf5], // equipment flags
    [B(0x6eb4), "u8", 20 + 2], // tavern combos (byte bits), paid-meal counter, 0x6ec9
    [B(0x6ed4), "u8", 4], // random at new save
    ...[0x6f40, 0x7088].flatMap((r) => [[B(r), "u8", 4], [B(r + 0xea), "u8", 23 * 4]]), // Shakalaka mask / dances
    [B(0x71d0), "u8", 0x192], // two custom sort orders (flag + 200-byte permutation)
    ...Array.from({ length: 6 }, (_, k) => [B(0x7362 + 0xe * k + 0xc), "u8", 2]), // panel layout valid byte
    [B(0x73da), "u8", 3], // edited with 0x73d8; flags
    [B(0x73e4), "u8", 4], // 0x73e4
    ...Array.from({ length: 3 }, (_, k) => [B(0x7464 + 4 * k), "u8", 2]), // notice dates: day, month
    [B(0x7470), "u8", 6], // notice quest indexes, 0x7473
    [B(0x753e), "u8", 1 + 26 + 26 + 1], // milestones, quests per map offline / online, hidden-area count
    ...Array.from({ length: 3 }, (_, k) => [[B(0x7590 + 0x70 * k + 0x48), "u8", 8], [B(0x7590 + 0x70 * k + 0x54), "u8", 1], [B(0x7590 + 0x70 * k + 0x6d), "u8", 2]]).flat(), // hire records
    [B(0x7836), "u8", 4 + 24], // hire job bytes, recent hunter IDs
    [T(0x00), "u8", 2], // card grade
    [T(0x04), "u8", 2], // title extra byte
    [T(0x0a), "u8", 0x1a], // name
    [T(0xa8), "u8", 0x50], // greeting
    [T(0xf8), "u8", 12], // appearance copies
    [T(0x10c), "u8", 12], // pose, background, hunter ID, Shakalaka masks
    ...Array.from({ length: 10 }, (_, k) => {
      const j = 0x16c + 0xa0 * k; // Hunter's Journal entry
      return [[T(j), "u8", 2], [T(j + 8), "u8", 4], [T(j + 0x24), "u8", 0x4b + 0x2b], [T(j + 0x9a), "u8", 6]]; // day, month; highlight types; names, quest name; member flags
    }).flat(),
    [T(0xb88), "u8", 24 * 0x19], // arena partners' hunter IDs

    // ── Character header (block 0x0000) ──
    [B(0x1c), "u32", 3], // hair colour RGBA, zenny, play time
    [B(0x28), "equip", 7], // equipped gear (cached records)
    [B(0x98), "u16", 7], // equipped box indexes
    [B(0xa8), "u16", 2 * (24 + 32 + 1000)], // Blademaster's Pouch, Gunner's Pouch, Item Box: {u16 item, u16 count}
    [B(0x1128), "equip", 1000], // Equipment Box
    ...Array.from({ length: 24 }, (_, k) => [B(0x4fa8 + 0x4c * k), "u16", 7 + 21]), // sets: indexes + decoration snapshot; name is text

    // ── Village, records, rank (block 0x56c8) ──
    [B(0x56c8), "u16", 32], // New Game time seeds / RNG slots
    [B(0x574a), "u16", 8], // 0xffff at new save
    [B(0x5768), "u32", 1], // clothing colour RGBA
    [B(0x576c), "u16", 86 * 2 + 86 * 2], // slain, captured, size records {small, large}
    [B(0x5a1c), "u32", 1], // HR points
    [B(0x5a20), "u16", 1], // Hunter Rank
    [B(0x5b28), "u32", 1], // Resources
    [B(0x5b30), "u32", 1 + 4], // total Resources earned, 4 x f32 (as u32)
    ...Array.from({ length: 3 }, (_, k) => [B(0x5b44 + 12 * k + 6), "u16", 2]), // fleet boat: tackle item, haul seed
    ...Array.from({ length: 41 }, (_, k) => [B(0x5b6c + 16 * k + 8), "u16", 4]), // Moga Woods table rows (+8..+0xe)
    ...[0x5dfc, 0x5eca, 0x5ed6].map((d) => [B(d + 4), "u16", 4]), // Moga Woods day records (+4..+0xa)
    [B(0x5e1e), "u16", 2], // VE ticket tier, counter
    [B(0x5e22), "u8", 2], // ? (bytes by the data: Wii U 2a 00)
    ...Array.from({ length: 3 }, (_, k) => [[B(0x5e28 + 8 * k), "u16", 2], [B(0x5e28 + 8 * k + 6), "u16", 1]]).flat(), // farm order slots
    [B(0x5e46), "u16", 58], // story / unlock flags (u16 words)
    [B(0x5ebe), "u16", 2], // Argosy seed, tackle item
    [B(0x5ec8), "u16", 1], // meal RNG seed
    [B(0x5ee2), "u16", 60], // Moga Woods / Argosy goods box {u16 item, u16 count}
    [B(0x5f5a), "u16", 86 * 2], // Moga Woods kills, second count
    [B(0x60b4), "u32", 50], // item obtained (u32 words)
    [B(0x6e74), "u32", 16], // quest clears (u32 words)
    [B(0x6eca), "u16", 1], // tavern daily roll
    [B(0x6edc), "u16", 4], // random at new save
    [B(0x6f3e), "u16", 1], // one-time quest flags

    // ── Cha-Cha (0x6f40) and Kayamba (0x7088), 0x148 each ──
    ...[0x6f40, 0x7088].flatMap((r) => [
      [B(r + 0x04), "u32", 3], // dances unlocked, seen copy, EXP
      [B(r + 0x10), "u16", 1 + 23], // counter, per-mask counters
      [B(r + 0x42), "u16", 2 * (12 + 30)], // items brought back, item stock {u16 item, u16 count}
    ]),

    // ── Block 0x7000-0x7a00 ──
    ...Array.from({ length: 6 }, (_, k) => [B(0x7362 + 0xe * k), "u16", 6]), // panel layouts: 6 cells (+ u8 valid)
    [B(0x73b8), "u32", 1], // ?
    ...Array.from({ length: 2 }, (_, k) => [[B(0x73bc + 12 * k), "u16", 2], [B(0x73bc + 12 * k + 4), "u32", 2]]).flat(), // s16 x, y; f32 x2
    [B(0x73d8), "u16", 1], // 0..999 (card +0xa4)
    [B(0x73e0), "u32", 1], // skin colour
    [B(0x73e8), "u32", 2 + 5 + 24], // feature colours, armour pigments, arena best times
    ...Array.from({ length: 3 }, (_, k) => [B(0x7464 + 4 * k + 2), "u16", 1]), // notice dates: u16 year
    [B(0x7478), "u32", 18 + 2 + 1 + 18 + 3], // title bits, backgrounds, 0x74c8, seen copies (0x74cc, 0x7514)
    [B(0x7520), "u16", 12], // weapons forged per class
    [B(0x7538), "u32", 1], // total faints
    [B(0x753c), "u16", 1], // quests abandoned
    [B(0x7574), "u32", 2 + 1], // awards, 0x757c
    [B(0x758c), "u32", 1], // ? (u32 by the data: Wii U 00 00 02 2a, 3DS 6b 00 00 00)
    [B(0x7830), "u16", 1],
    [B(0x7832), "u32", 1],
    [B(0x7862), "u16", 1], // hire job seed
    [B(0x7890), "u32", 1], // bond points (s32)
    [B(0x7904), "u32", 1], // ? (u32 by the data: Wii U 00 00 02 05, 3DS 07 00 00 00)

    // ── Own guild card (tail, 0xe00) ──
    [T(0x02), "u16", 1], // title word 1
    [T(0x06), "u16", 2], // title word 2, HR
    [T(0x24), "u16", 6], // quests completed
    [T(0x30), "equip", 7], // equipped gear
    [T(0xa0), "u32", 2], // friend points, = block 0x73d8
    [T(0x104), "u32", 2], // clothing colour, hair colour
    [T(0x118), "u32", 2], // ?, skin colour
    [T(0x120), "u16", 36], // weapon use [Village, Port, Arena][class]
    [T(0x168), "u32", 1], // play time
    ...Array.from({ length: 10 }, (_, k) => {
      const j = 0x16c + 0xa0 * k; // Hunter's Journal entry
      return [[T(j + 2), "u16", 3], [T(j + 0x0c), "u32", 6]]; // year, kind, quest id; line parameters A, B
    }).flat(),
    [T(0x7ac), "u32", 2], // awards
    ...Array.from({ length: 50 }, (_, k) => [[T(0x7b4 + 10 * k), "u16", 4], [T(0x7b4 + 10 * k + 8), "crown", 1]]).flat(), // monster log
    [T(0x9a8), "arena", 24 * 5], // arena log
    [T(0xde0), "u32", 2], // feature colours
  ];

  // Packed bitfields, as field widths from the low bit on 3DS (the Wii U order is the reverse).
  const CROWN_FIELDS = [1, 2, 2, 3];     // ?, large crown (1 silver, 2 gold), mini crown, rest
  const ARENA_FIELDS = [15, 17];         // party weapons (base 13), time in 1/30 s

  // Move bitfields between LSB-first (3DS) and MSB-first (Wii U) packing.
  function mirrorFields(v, bits, widths, toWiiU) {
    let out = 0, lo = 0;
    for (const w of widths) {
      const hi = bits - lo - w;          // where this field sits on Wii U
      const [from, to] = toWiiU ? [lo, hi] : [hi, lo];
      const f = Math.floor(v / 2 ** from) % 2 ** w;
      out += f * 2 ** to;
      lo += w;
    }
    return out >>> 0;
  }

  // A hunter payload converted from one platform's encoding to the other's ("3ds" / "wiiu").
  function payload(src, from, to) {
    if (src.length !== USER_PAYLOAD) throw new Error("Not a hunter payload.");
    const out = src.slice();
    if (from === to) return out;
    const le = from === "3ds", toWiiU = to === "wiiu";
    const r = new DataView(src.buffer, src.byteOffset, src.byteLength), w = new DataView(out.buffer);
    const u16 = (o) => w.setUint16(o, r.getUint16(o, le), !le);
    const u32 = (o) => w.setUint32(o, r.getUint32(o, le), !le);
    for (const [off, kind, n] of LAYOUT) {
      for (let k = 0; k < n; k++) {
        if (kind === "u16") u16(off + 2 * k);
        else if (kind === "u32") u32(off + 4 * k);
        else if (kind === "crown") out[off + k] = mirrorFields(src[off + k], 8, CROWN_FIELDS, toWiiU);
        else if (kind === "arena") w.setUint32(off + 4 * k, mirrorFields(r.getUint32(off + 4 * k, le), 32, ARENA_FIELDS, toWiiU), !le);
        else if (kind === "equip") {
          const e = off + EQUIP * k;
          u16(e + 2);
          if (src[e] !== 6) u32(e + 4);  // a talisman's +4..+7 are four single bytes
          for (let d = 0; d < 4; d++) u16(e + 8 + 2 * d);
        }
      }
    }
    return out;
  }

  root.MH3U_CONVERT = { payload };
})(typeof window !== "undefined" ? window : globalThis);
