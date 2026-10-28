# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A static single-page lookup for MH3U talisman tables. **Browse a Table** lists every talisman a table
can give. **Find a Talisman** shows which tables can give a talisman, or several at once (to find
your own table), exactly or "or better".

No build step, no framework, no modules.
- `docs/data.js` is generated; never hand-edit it.
- `docs/engine.js` is the game's generator (no DOM).
- `docs/app.js` is one IIFE (UI, prefs, theme).
- `docs/styles.css` is hand-written.

GitHub Pages serves `docs/` through the "Deploy Pages" Actions workflow on push to `master`, like
the other MH3U apps.

## The engine — read before changing it

It is the game's own logic, decoded from the 3DS executable. Notes with addresses:
`C:\MH3U-Extract\notes\talisman-tables.md` (generator) and `charm-table.md` (RNG, seed, cycles).

- Tables = the 17 cycles of the charm RNG `x -> (x || 1) * 176 mod 65363`. A table's talismans
  are each charm's roll from each state on its cycle.
- `NAMED` (cycle id -> table number) is the Cursed Table app's mapping. T12/T15/T16/T17 are
  numbered by convention: Raven's call, 2026-10-06.
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
