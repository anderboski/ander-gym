# ander-gym — Specification v1

A local-first PWA for tracking gym sessions on an iPhone. No backend, no login, no app store.
All user data lives in IndexedDB on the device; the app is served as static files from GitHub Pages.

**Source of truth for requirements:** this document. `req.txt` is the original brief and is superseded by
anything written here.

---

## 1. Decisions (locked)

| # | Decision | Value |
|---|---|---|
| D1 | Navigation | 5 bottom tabs: Home · Exercises · Trainings · Session · History |
| D2 | Stack | Vite + React + TypeScript, `vite-plugin-pwa`, deployed to GitHub Pages via Actions. Hash routing, hand-rolled (~50 lines) — every React Router 7.x release carries an open advisory, and hash routing also avoids the Pages reload-404 |
| D3 | Training days | Names fixed, seeded from `data/training_days.txt`. Exercise membership is editable in-app |
| D4 | Home extras | Weekly goal + streak; backup reminder. (No PR tracking, no last-session recap in v1) |
| D5 | Offline | Lazy cache-first for images; app shell + `exercises.json` precached |
| D6 | Custom exercise image | Optional photo from camera/library, downscaled, stored as a blob; lettered placeholder otherwise |
| D7 | Session history | Read-only; whole sessions may be deleted with confirmation |
| D8 | Units | Kilograms only in v1 |

**Non-goals for v1:** cross-device sync, accounts, rest timers, plate calculators, charts/graphs,
video/GIF playback, notifications, unit switching, editing past sets.

---

## 2. Data sources (read-only, ship as static assets)

### `data/exercises.json`
1324 records. Every record has all of these fields:

```json
{
  "id": "0001",
  "name": "3/4 sit-up",
  "category": "waist",
  "body_part": "waist",
  "equipment": "body weight",
  "muscle_group": "hip flexors",
  "secondary_muscles": ["hip flexors", "lower back"],
  "target": "abs",
  "image": "images/0001-2gPfomN.jpg",
  "gif_url": "videos/0001-2gPfomN.gif",
  "created_at": "2026-03-18T12:31:32.854798+00:00"
}
```

Verified facts the implementation must rely on:

- `id` is unique and zero-padded; treat it as an opaque string, never a number.
- `category` and `body_part` are **identical on all 1324 records** (10 distinct values). Use `category`;
  ignore `body_part`.
- `image` is a repo-relative path under `data/`. All 1324 files exist (11 MB total).
- `gif_url` points at `data/videos/`, **which does not exist**. Ignore the field entirely.
- `muscle_group` is dirty (29 values, with `traps` vs `trapezius`, `lats` vs `latissimus dorsi`,
  `quadriceps` vs target's `quads`). **Do not surface it.** The third filter facet is `target` (19 clean values).

Facet cardinalities: `category` 10 · `equipment` 28 · `target` 19.

### `data/training_days.txt`
Newline-separated, no trailing newline:

```
Shoulder-bicep-tricep
Leg-abs
Pecs-back
```

Parsing rules:
- Trim each line, drop empty lines. Line order **is** the rotation order.
- `id` = slug of the line, lowercased, non-alphanumerics collapsed to `-` (`shoulder-bicep-tricep`).
- Display label = the raw line.
- **Body parts** = split the raw line on `-`, drop empty segments (note `Pecs-back` and the double
  hyphen risk), title-case each: `Shoulder-bicep-tricep` → `Shoulder · Bicep · Tricep`.

### Asset pipeline
`data/` stays at the repo root as the source of truth. Vite must serve it in dev and copy it to
`dist/data/` on build (use `vite-plugin-static-copy`; `publicDir` would flatten the paths). All runtime
URLs are built as `` `${import.meta.env.BASE_URL}data/…` `` so they survive the `/ander-gym/` base path.

---

## 3. Persistence

IndexedDB via `idb`. Database `ander-gym`, version 1.

| Store | Key | Value |
|---|---|---|
| `trainings` | `id` (slug) | `{ id, label, order, exerciseIds: string[] }` |
| `sessions` | `id` (uuid) | `{ id, trainingId, trainingLabel, startedAt, savedAt, entries }` — index on `startedAt` |
| `activeSession` | literal `'current'` | `{ trainingId, trainingLabel, startedAt, entries }` |
| `customExercises` | `id` (`c-<uuid>`) | Exercise fields + `isCustom: true`, `imageBlob?: Blob` |
| `settings` | key string | `weeklyGoal` (default `3`), `lastExportAt`, `schemaVersion` |

```ts
type SetEntry   = { reps: number; weight: number; at: string };      // weight in kg, 0 allowed
type SessionEntry = { exerciseId: string; sets: SetEntry[] };
```

Rules:
- **Seeding.** On boot, reconcile `trainings` against `training_days.txt`: insert missing lines, update
  `label`/`order` on existing ones by `id`, and never delete a training that has `exerciseIds`.
- **One active session.** Starting a session while one exists must prompt: resume, or discard and start new.
- Every write to `activeSession` is immediate — a mid-workout app kill must lose nothing.
- Call `navigator.storage.persist()` once, on the first successful session save.
- `entries` in a session snapshot the exercise ids only; names/images are resolved at render time so a
  renamed custom exercise stays consistent.

### Export / import
Reachable from a gear icon on Home (Settings sheet).

- **Export** — one JSON file, `ander-gym-YYYY-MM-DD.json`, containing every store plus
  `{ schemaVersion, exportedAt }`. Custom-exercise blobs are inlined as base64 data URLs. Delivered via
  `Blob` + `<a download>` (works in iOS Safari and standalone mode). On success, write `lastExportAt`.
- **Import** — file input, validate `schemaVersion`, then ask **Merge** (union by id, incoming wins on
  conflict) or **Replace** (wipe then load). Replace goes through a second, destructive confirmation
  stating what will be lost. (v1 uses a confirm dialog rather than a typed confirmation; revisit if a
  mis-tap ever actually happens.)

---

## 4. Derived logic (pure functions, unit-tested)

All dates are handled in the device's local timezone.

**`currentWeekCount(sessions, now)`** — number of saved sessions whose `startedAt` falls in the current
ISO week (Monday 00:00 → Sunday 23:59:59).

**`nextTraining(trainings, sessions)`** — strict rotation over `order`:
- No saved sessions → `trainings[0]`.
- Otherwise take the most recent session by `startedAt`, find its `trainingId` in the ordered list, return
  the next one, wrapping to index 0.
- A training that has since been removed from the file → fall back to `trainings[0]`.

**`weeklyStreak(sessions, goal, now)`** — count of consecutive ISO weeks, walking backwards from last week,
where the session count ≥ `goal`. The current week is included only if it already meets the goal (so a
streak is never broken mid-week).

**`latestFor(exerciseId, sessions)`** — most recent saved session containing that exercise; returns
`{ date, daysAgo, sets }`. `daysAgo` is calendar-day difference, rendered as `-9 days`, `-1 day`, `today`.

**`historyFor(exerciseId, sessions)`** — every session containing the exercise, newest first.

**`search(query, facets, exercises)`** —
- Facets: multi-select **within** a facet is OR, **across** facets is AND.
- Query is fuzzy over `name` using Fuse.js (`threshold: 0.4`, `ignoreLocation: true`, `minMatchCharLength: 2`).
  Empty query = no text constraint. Facets are applied before the fuzzy pass.
- Results keep Fuse's score order when a query is present, otherwise alphabetical by `name`.

---

## 5. Pages

Every page has a title area that respects the iOS safe-area inset at the top, and content padded to clear
the fixed bottom nav.

### 5.1 Home
- **Week counter** — "N trainings this week", with a progress ring against `weeklyGoal`.
- **Streak** — "🔥 3 weeks" when `weeklyStreak ≥ 1`; hidden at 0.
- **Today's training card** — the result of `nextTraining()`: label, body parts, and last-done date +
  days-back. Tapping it starts a new session for that training and navigates to Session.
  - If a session was already saved today, show a "Completed today" badge above the card; the card still
    offers the next training in rotation.
  - If a session is currently active, the card is replaced by "Resume session →".
- **Backup banner** — shown when `lastExportAt` is unset (and ≥1 session exists) or older than 30 days.
  Tapping it runs an export immediately.
- **Gear icon** (top right) — Settings sheet: weekly goal, export, import, storage usage
  (`navigator.storage.estimate()`), app version.

**Acceptance:** with zero data the page shows 0/3, no streak, no banner, and "Shoulder-bicep-tricep" as
today's training.

### 5.2 Exercises
Vertical order, exactly as briefed:
1. **Search box**, sticky at the top, fuzzy, with a clear button. `type="search"`, `font-size: 16px` to stop
   iOS zoom-on-focus.
2. **Facet chips**, three rows in this order: Category → Equipment → Target muscle. Each row scrolls
   horizontally, chips toggle, selected chips are filled. A "Clear all" appears when any is active.
3. **Match count** — "142 exercises".
4. **Card carousel** — horizontally scrollable, scroll-snapped cards of the matching exercises.
5. **"+ Add exercise"** — opens the custom-exercise form (name, category, equipment, target, optional photo).
   Saved to `customExercises` and immediately searchable, tagged with a "Custom" pill.

> **Review point for the user:** a single horizontal strip is being built as specified, but with an
> unfiltered 1324 matches it is a long swipe. Implemented with lazy image loading and windowing so it stays
> fast; if it feels wrong in the hand, switching to a vertical grid is a one-component change.

**ExerciseCard (shared component, also used by Trainings):**
- Exercise name.
- Image (`loading="lazy"`, fixed aspect ratio to prevent layout shift, placeholder for custom exercises
  without a photo).
- Latest training data: `2026-07-23 · -9 days`, then a 2-column matrix — one row per set, reps × weight.
  When the exercise has never been logged: "No history yet".
- **Tap the image** → full-screen sheet with the complete history: each session as a datetime heading plus
  its set matrix, newest first.
- Optional `onRemove` prop renders a trash icon in the top-right (Trainings context only).

### 5.3 Trainings
- One card per training day, in file order: body parts (title-cased), and last session datetime + days-back
  for that training, plus the exercise count.
- Tapping a card opens its detail view: the training's exercises rendered as `ExerciseCard`s **with** the
  trash icon (removal is immediate, undoable via a toast for 5 s), and a trailing **"+"** card.
- The "+" card opens an exercise picker — the same search + facet UI as the Exercises page in selection
  mode. Picking one appends it to `exerciseIds`. Already-included exercises are shown as disabled.
- Duplicate exercises within one training are rejected.

### 5.4 Session
**No active session:** a single "New Session" box listing the training days; picking one creates the active
session (`startedAt` = now) with an empty `sets` array per exercise in that training.

**Active session:** header shows training label and a running elapsed time. Then a table, one row per
exercise:

| small image | name | reps | + |
|---|---|---|---|

- **reps** starts empty and accumulates one line per logged set: `10x25kg`.
- **"+"** opens a bottom sheet asking reps and weight. Numeric keypads (`inputmode="numeric"` /
  `"decimal"`), prefilled from that exercise's previous set in this session, or from its last recorded set
  historically. **Save** appends the set; a small **"×"** top-right dismisses without saving.
- Tapping an existing set line offers Delete (confirm).
- Exercises may be logged in any order; rows with no sets are kept in the saved record with an empty `sets`
  array.

Bottom of the page, above the nav:
- **"Save session"** — large, full-width, green. Writes to `sessions` with `savedAt`, clears
  `activeSession`, navigates to History. Blocked with an explanatory message if zero sets were logged.
- **"Discard session"** — small, red, text-style. Confirmation dialog, then clears `activeSession`.

### 5.5 History
- Reverse-chronological list of saved sessions: date + time, training label, and a summary line
  (set count · total volume in kg).
- Tapping a record opens the same detail layout as an active session, **read-only** — no "+", no editing.
- The detail view has a destructive "Delete session" action with confirmation. Deleting recomputes
  everything downstream (Home counter, latest-training data on cards) reactively.
- Empty state: "No sessions yet — start one from Home."

---

## 6. iOS / PWA requirements

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; all fixed
  chrome uses `env(safe-area-inset-*)`.
- Web app manifest: `display: standalone`, portrait, theme + background colours, 180×180 apple-touch-icon,
  192/512 PNG icons, maskable variant.
- Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`):
  - Precache: app shell, CSS/JS, `data/exercises.json`, `data/training_days.txt`, icons.
  - Runtime: `data/images/**` → `CacheFirst`, 30-day expiration, max 1500 entries.
  - An "update available" toast when a new SW takes control.
- Minimum 44×44 pt tap targets; `-webkit-tap-highlight-color: transparent`; `user-select: none` on controls.
- All inputs ≥16 px font size.
- Dark mode via `prefers-color-scheme`, both themes fully styled.
- Momentum scrolling in the card carousel; `overscroll-behavior: contain` in sheets to stop rubber-banding
  the page behind them.
- The app must be fully usable with the network off, for any exercise whose image has been viewed once.

---

## 7. Deployment

- `vite.config.ts`: `base: '/ander-gym/'`.
- `.github/workflows/deploy.yml` — on push to `main`: checkout, Node 22, `npm ci`, `npm run build`,
  upload `dist/` as a Pages artifact, deploy. Pages source set to "GitHub Actions".
- Live at `https://anderboski.github.io/ander-gym/`, added to the Home Screen from Safari.
- No secrets, no environment variables, no analytics.

---

## 8. Quality bar

- **Vitest** unit tests covering every function in §4, the `training_days.txt` parser, the seeding
  reconciliation, and an export→import round trip (including a custom-exercise blob).
- **Typecheck + lint** clean; `strict: true` in `tsconfig`.
- No `any` in the data layer; a single `Exercise` type covers built-in and custom records.
- Lighthouse (mobile) PWA installable, performance ≥ 90 on a filtered Exercises view.
- A manual iPhone checklist in `docs/manual-qa.md`: install to Home Screen, airplane-mode run,
  force-quit mid-session, export → wipe → import.

---

## 9. Build phases

Each phase is independently reviewable and leaves the app in a working state.

1. **Scaffold** — Vite + React + TS, tab shell with the 5 routes, asset pipeline for `data/`, PWA manifest
   + SW, GitHub Actions deploy. Deliverable: empty tabs live on Pages.
2. **Data layer** — types, IndexedDB stores, seeding, exercise loader/merger, all §4 pure functions,
   export/import, unit tests. No UI.
3. **Exercises page** — search, facets, count, carousel, `ExerciseCard`, history sheet, custom-exercise form.
4. **Trainings page** — cards, detail view, exercise picker, removal.
5. **Session page** — new-session flow, set logging sheet, active-session persistence, save/discard.
6. **History page** — list, read-only detail, delete.
7. **Home** — week counter, rotation card, weekly goal + streak, backup banner, Settings sheet.
8. **Polish** — iOS chrome, offline verification, dark mode, a11y labels, perf pass, manual QA doc.

Phases 3–6 depend only on phase 2 and can run in parallel; phase 7 depends on 2 and 6.
