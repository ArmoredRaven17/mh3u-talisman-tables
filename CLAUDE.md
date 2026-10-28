# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A static single-page lookup for MH3U talisman tables. Pick a table (or All tables) to see every
talisman it can give. Each row lists its charms and the tables that give it. The T1–T17 squares
above the list light up for the tables that can roll a talisman matching the filters; clicking one
shows that table. There is no separate "find" mode: Raven folded it into the browse view on
2026-10-28.

No build step, no framework, no modules.
- `docs/data.js` is generated; never hand-edit it.
- `docs/engine.js` is the game's generator (no DOM).
- `docs/save.js` reads a hunter save's table and writes a copy moved to another table (no DOM).
  It is ported from the MH3U save editor (`mh3u-editor/src/core/save.ts`, `charm.ts`):
  - Wii U files are 0x8a24 bytes, big-endian, behind a wrapper whose name key is ~crc32(file name).
  - 3DS files are 0x8a00 bytes, little-endian.
  - There is no checksum.
  - The table is RNG slot 1 at block 0x56c8. Moving a save writes all 32 seed words, as the editor does.
  - Test it with `node C:\MH3U-Extract\talismans\check_save_js.js docs "<save folder>"`.
- `docs/app.js` is one IIFE (UI, prefs, theme).
- `docs/styles.css` is hand-written.

GitHub Pages serves `docs/` through the "Deploy Pages" Actions workflow on push to `master`, like
the other MH3U apps.

## The engine — read before changing it

It is the game's own logic, decoded from the 3DS executable. Notes with addresses:
`C:\MH3U-Extract\notes\talisman-tables.md` (generator) and `charm-table.md` (RNG, seed, cycles).

- Tables = the 17 cycles of the charm RNG `x -> (x || 1) * 176 mod 65363`. A table's talismans
  are each charm's roll from each state on its cycle.
- `NAMED` (cycle id -> table number) follows Athena's ASS, as the MH3U save editor does: cycle
  401 = T12, 489 = T15 (Raven, 2026-10-28). The Cursed Table app still has those two swapped.
- Scores are float32 in the game; keep `Math.fround` on every float step.
- Regenerate data: `python C:\MH3U-Extract\talismans\build_data.py`.
- Check after any engine/data change:
  - `python C:\MH3U-Extract\talismans\check_js.py`: JS == Python on all 261,448 rolls, expect 0
    mismatches.
  - `check_save.py`: user1's 258 talismans, all on T1.

## Critical: cache busting

Bump the `?v=N` on `styles.css`, `data.js`, `engine.js` or `app.js` in `docs/index.html` whenever
that file changes.

## Conventions

- All text goes into the DOM via `textContent`, never `innerHTML`.
- Stored prefs are read back as untrusted shape. Storage keys are `mh3u-talisman-tables-*`.
- The theme palette and LEGACY_HEX are the MH3U apps' shared copy.
- A new MH3U app needs a row in every MH3U app's Links modal, in the hub's order.
- Player-facing text reads hunter to hunter: no code talk, no addresses. Sources go in the About
  modal only.

Nothing is pushed until Raven has validated it.
