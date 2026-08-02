# ander-gym

A local-first gym tracker for the iPhone. No backend, no account, no app store —
a static PWA you add to your Home Screen. Your training data never leaves the
device.

**Live:** https://anderboski.github.io/ander-gym/

## What it does

Five tabs:

| Tab | What it is |
|---|---|
| **Home** | Trainings this week against a weekly goal, current streak, and the training you should do today — tap to start it. |
| **Exercises** | 1324 exercises, fuzzy-searchable, filterable by category, equipment and target muscle. Each card shows your latest sets for that exercise; tap the image for full history. |
| **Trainings** | Your training days from `data/training_days.txt`. Open one to add or remove the exercises it contains. |
| **Session** | The workout you're doing right now. Log reps × weight per exercise, then save or discard. |
| **History** | Every saved session, newest first. Read-only — it's the record everything else derives from. |

## Running it

```bash
npm install
npm run dev        # http://localhost:5173/ander-gym/
```

Other scripts:

```bash
npm test           # Vitest — pure logic + storage layer
npm run typecheck  # tsc, strict
npm run build      # production build into dist/
npm run preview    # serve dist/ (needed to exercise the service worker)
```

The service worker is disabled in dev. To test offline behaviour, use
`npm run build && npm run preview`.

## Data

`data/` is the source of truth and ships as static assets:

- **`exercises.json`** — 1324 records. `category` is the filter axis (`body_part`
  is an identical duplicate, `muscle_group` has an inconsistent vocabulary, and
  `gif_url` points at a directory that doesn't exist — all three are ignored).
- **`images/`** — 1324 JPEGs, 11 MB. Deliberately *not* precached; the service
  worker caches each one the first time you view it.
- **`training_days.txt`** — one training day per line. Line order is the rotation
  order used by Home. Editing this file adds, renames or reorders training days on
  the next load; a day you remove keeps its data and moves to the end.

Everything you create — which exercises are in which training, your sessions,
custom exercises, settings — lives in IndexedDB on the phone.

## Backup

There is no server copy. Safari can evict local storage, and a lost phone is a
lost history, so **export regularly**: Home → gear → *Export data* writes a single
JSON file containing everything, with custom-exercise photos inlined. Home nags
you when it's been more than 30 days.

Import offers *Merge* (union, incoming wins on conflict) or *Replace* (wipe
first, double-confirmed).

## Architecture

- **Vite + React 19 + TypeScript**, strict. No UI framework, no CSS framework.
- **`src/data/`** is the whole domain: `types.ts`, `db.ts` (IndexedDB via `idb`),
  `derive.ts` (pure read models), `search.ts` (Fuse.js + facets), `backup.ts`,
  and `store.tsx` — the `useGym()` hook every page reads through. No page talks
  to IndexedDB directly.
- **Hash routing** (`src/router.ts`, ~50 lines). Deliberate: GitHub Pages has no
  rewrite rule, so a path-based deep link would 404 on reload.
- **`src/styles.css`** holds the design tokens and primitives; each page keeps its
  own CSS file next to it.
- Deployed by `.github/workflows/deploy.yml` on every push to `main`, after
  typecheck and tests pass.

See [`SPEC.md`](SPEC.md) for the full specification and
[`docs/manual-qa.md`](docs/manual-qa.md) for the on-device checklist.
