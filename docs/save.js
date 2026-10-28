"use strict";
/* MH3U Talisman Tables — read a hunter save's talisman table and move it to another table.
   Ported from the MH3U Save Editor (mh3u-editor/src/core/save.ts and charm.ts). No DOM here.

   A hunter file is user1, user2 or user3. The Wii U stores it big-endian behind a 0x24-byte
   wrapper (0x8a24 bytes); the 3DS little-endian with no wrapper (0x8a00). Neither has a checksum.
   Block offset 0x56c8 holds 32 u16 seed words: [0..3] are the game's four RNG slots, loaded on load
   and written back on save; [4..31] keep the New Game seed. The charm generator draws from slot 1,
   so slot 1's cycle is the save's table. Nothing in the game reseeds it, which is why a save never
   leaves its table. Writing a state from another cycle moves the save there; like the editor, all
   32 words take the new state, as a New Game with that seed would have left them. */
(function (root) {
  const E = root.MH3U_TALISMAN;
  const USER_PAYLOAD = 0x8a00, WIIU_WRAPPER = 0x24, PAYLOAD_VERSION = 0x2c;
  const BLOCK = 4, RNG_SEEDS = 0x56c8, SEED_WORDS = 32, SLOT_CHARM = 1;

  let CRC = null;
  function crc32(bytes) {
    if (!CRC) {
      CRC = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC[i] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  // The Wii U wrapper keeps ~crc32(file name), so a renamed file is caught (and won't load on console).
  const wiiuKey = (name) => (crc32(new TextEncoder().encode(name)) ^ 0xffffffff) >>> 0;

  // Throws a player-readable Error when the file is not a hunter save.
  function open(bytes, fileName) {
    bytes = new Uint8Array(bytes).slice();
    const v = new DataView(bytes.buffer);
    const name = String(fileName || "").replace(/^.*[\\/]/, "");
    const warnings = [];
    let platform, base, originalName = name;
    if (bytes.length === WIIU_WRAPPER + USER_PAYLOAD && v.getUint32(0x10, false) === 0x14 &&
        v.getUint32(0x18, false) === 0xc && v.getUint32(0x1c, false) === USER_PAYLOAD &&
        v.getUint32(WIIU_WRAPPER, false) === PAYLOAD_VERSION) {
      platform = "wiiu"; base = WIIU_WRAPPER;
      const key = v.getUint32(0x14, false);
      if (name && key !== wiiuKey(name)) {
        // The key says which hunter file it really is, so the download can carry that name.
        const real = ["user1", "user2", "user3"].find(n => wiiuKey(n) === key);
        warnings.push(real
          ? "This file was renamed; it's really " + real + ". The changed save downloads as " + real + "."
          : "This file was renamed. Give it back its original name (user1, user2 or user3) before putting it on the Wii U.");
        if (real) originalName = real;
      }
    } else if (bytes.length === USER_PAYLOAD && v.getUint32(0, true) === PAYLOAD_VERSION) {
      platform = "3ds"; base = 0;
    } else if (bytes.length === WIIU_WRAPPER + 0x3000 || bytes.length === 0x3000) {
      throw new Error("That's the system file (game options). Open a hunter file instead: user1, user2 or user3.");
    } else {
      throw new Error("That's not an MH3U hunter save. Open user1, user2 or user3 from your Wii U or 3DS save folder.");
    }
    const le = platform === "3ds";
    const at = (k) => base + BLOCK + RNG_SEEDS + 2 * k;
    const word = (k) => v.getUint16(at(k), le);
    const tableOf = (state) => E.TABLES.find(t => t.cycle === E.CYCLE[state % 65363]);
    return {
      platform, fileName: originalName, warnings,
      slots: () => [0, 1, 2, 3].map(word),
      table: () => tableOf(word(SLOT_CHARM)),
      // A copy of the file moved to table `num`; the opened bytes stay as they were.
      movedTo(num) {
        const t = E.TABLES.find(x => x.num === num);
        if (!t) throw new Error("No table " + num);
        const out = bytes.slice(), w = new DataView(out.buffer);
        for (let k = 0; k < SEED_WORDS; k++) w.setUint16(at(k), t.cycle, le);
        return out;
      },
    };
  }

  root.MH3U_SAVE = { open, crc32, wiiuKey };
})(typeof window !== "undefined" ? window : globalThis);
