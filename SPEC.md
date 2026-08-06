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
| D3 | Training days | Fully user-managed: create as many as you like, rename anytime, reorder by drag. Never deletable — a training's id must always resolve so session history stays intact. Exercise membership is editable in-app |
| D4 | Home extras | Weekly goal + streak; backup reminder; a month calendar of past sessions. (No last-session recap in v1. PR tracking was deferred in v1 and has since landed — see §4 `personalRecords`) |
| D5 | Offline | Lazy cache-first for images; app shell + `exercises.json` precached |
| D6 | Custom exercise image | Optional photo from camera/library, downscaled, stored as a blob; lettered placeholder otherwise |
| D7 | Session history | Read-only; whole sessions may be deleted with confirmation |
| D8 | Units | Kilograms only in v1 |

**Non-goals for v1:** cross-device sync, accounts, plate calculators,
video/GIF playback, notifications, unit switching, editing past sets.

Rest timers (§5.4) and charts (§5.2, §5.6) were on that list and have since landed. The list records what
v1 shipped without, not what the app is forbidden to grow — an entry leaves it when the feature arrives.

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

### Asset pipeline
`data/` stays at the repo root as the source of truth. Vite must serve it in dev and copy it to
`dist/data/` on build (use `vite-plugin-static-copy`; `publicDir` would flatten the paths). All runtime
URLs are built as `` `${import.meta.env.BASE_URL}data/…` `` so they survive the `/ander-gym/` base path.

---

## 3. Persistence

IndexedDB via `idb`. Database `ander-gym`, version 1.

| Store | Key | Value |
|---|---|---|
| `trainings` | `id` (slug) | `{ id, label, order, exerciseIds: string[], restSeconds? }` |
| `sessions` | `id` (uuid) | `{ id, trainingId, trainingLabel, startedAt, savedAt, entries }` — index on `startedAt` |
| `activeSession` | literal `'current'` | `{ trainingId, trainingLabel, startedAt, entries }` |
| `customExercises` | `id` (`c-<uuid>`) | Exercise fields + `isCustom: true`, `imageBlob?: Blob` |
| `settings` | key string | `weeklyGoal` (default `3`), `lastExportAt`, `favoriteExerciseIds` (default `[]`), `schemaVersion` |

```ts
type SetEntry   = { reps: number; weight: number; at: string };      // weight in kg, 0 allowed
type SessionEntry = { exerciseId: string; sets: SetEntry[] };
```

Rules:
- **Trainings are user-created**, not seeded. A new one gets a fresh id (`t-<uuid>`) and joins the end of
  the rotation with no exercises. Renaming updates only `label` — the id (and therefore every session's
  `trainingId`) never changes, so history stays attributed correctly. Reordering rewrites `order` on every
  training to match the dragged sequence. **Trainings are never deleted** — a `Session.trainingId` must
  always resolve.
- **One active session.** Starting a session while one exists must prompt: resume, or discard and start new.
- `Training.restSeconds` is the rest-timer default for that training day (§5.4), in seconds. It is
  **optional**: absent means the app default of 90 s, so trainings written before the field existed
  stay valid and the store keeps schema version 1. Clamped to 15–600 s on every write.
- Every write to `activeSession` is immediate — a mid-workout app kill must lose nothing.
- Call `navigator.storage.persist()` once, on the first successful session save.
- `entries` in a session snapshot the exercise ids only; names/images are resolved at render time so a
  renamed custom exercise stays consistent.

### Export / import
Reachable from a gear icon on Home (Settings sheet).

- **Export** — one JSON file, `ander-gym-YYYY-MM-DD.json`, containing every store plus
  `{ schemaVersion, exportedAt }`. Custom-exercise blobs are inlined as base64 data URLs. Delivered via
  `Blob` + `<a download>` (works in iOS Safari and standalone mode). On success, write `lastExportAt`.
- `restSeconds` travels inside the trainings array, so it needs no format change. On import a value
  that could not run a countdown (non-numeric, zero, negative, `NaN`) is dropped rather than
  corrected — the training falls back to the default, which is what an absent field already means.
- **Import** — file input, validate `schemaVersion`, then ask **Merge** (union by id, incoming wins on
  conflict) or **Replace** (wipe then load). Replace goes through a second, destructive confirmation
  stating what will be lost. (v1 uses a confirm dialog rather than a typed confirmation; revisit if a
  mis-tap ever actually happens.)

---

## 4. Derived logic (pure functions, unit-tested)

All dates are handled in the device's local timezone.

**`currentWeekCount(sessions, now)`** — number of saved sessions whose `startedAt` falls in the current
ISO week (Monday 00:00 → Sunday 23:59:59).

**`nextTraining(trainings, sessions)`** — strict rotation over `order` (the drag-reordered sequence):
- No saved sessions → `trainings[0]`.
- Otherwise take the most recent session by `startedAt`, find its `trainingId` in the ordered list, return
  the next one, wrapping to index 0.
- A session's `trainingId` that isn't in `trainings` (e.g. after a partial import) → fall back to
  `trainings[0]`.

**`weeklyStreak(sessions, goal, now)`** — count of consecutive ISO weeks, walking backwards from last week,
where the session count ≥ `goal`. The current week is included only if it already meets the goal (so a
streak is never broken mid-week).

**`latestFor(exerciseId, sessions)`** — most recent saved session containing that exercise; returns
`{ date, daysAgo, sets }`. `daysAgo` is calendar-day difference, rendered as `-9 days`, `-1 day`, `today`.

**`historyFor(exerciseId, sessions)`** — every session containing the exercise, newest first.

**`personalRecords(exerciseId, sessions)`** — best-ever sets, derived from history; nothing is stored.
Returns `{ heaviest, byReps }` — the heaviest set ever, and the heaviest set at each rep count — or `null`
when the exercise has never been logged with weight. Bodyweight sets (`weight: 0`) are excluded: they are
real training data but carry no load to rank, and a "0 kg" record could never be beaten by weight. On a tie
the earlier set keeps the record, so a repeat performance is not a new PR. Accepts the active session
alongside saved ones — both carry `startedAt` + `entries`, which is all the scan reads.

**`allPersonalRecords(sessions)`** — the same records for every exercise in **one** pass, keyed by exercise
id. The Exercises carousel renders a card per exercise out of 1324; per-card scanning would be
O(cards × sessions) on every scroll. The store memoises this on the identity of `sessions` (which every
mutation replaces wholesale) and exposes it as `useGym().exerciseRecords`.

**`beatsPersonalRecord(set, records)`** — true when a set strictly beats a record that already existed:
heaviest ever, or the best at its own rep count. Deliberately narrower than "sets a record" — a first-ever
set, or the first at some rep count, becomes the record but beat nothing, and announcing those would fire
on nearly every set a new user logs.

**`epley1RM(reps, weight)`** — estimated one-rep max, `weight × (1 + reps/30)`. An estimate whose only job
is to put sets logged at different rep counts on one axis.

**`exerciseProgress(history, metric)`** — the per-session trend for one exercise, **oldest first**, over the
output of `historyFor`. `metric` is `topWeight` (heaviest set) or `e1rm` (best estimated max, which need not
be the same set). One point per session: its best set under the metric, ties going to the earlier set.
Bodyweight sets are skipped, so a session logged entirely at `weight: 0` contributes no point rather than a
zero that would crater the line.

**`weeklySummary(sessions, weeks, now)`** — the last `weeks` ISO weeks ending with the current one, oldest
first, each `{ start, sessions, volume }`. Weeks with nothing logged are present with zeros: a gap is the
point of a consistency chart, and dropping empty weeks would compress a month off training into a flat line.

**`volumeByTarget(sessions, exercises, days, now)`** — volume per muscle `target` over the last `days`
calendar days, heaviest first. `target` lives on the catalogue and never on a `SessionEntry` (§3), so the
lookup is passed in as a map and the function stays pure. An id that resolves to nothing — a custom exercise
lost to a Replace import — is bucketed under `unknown` rather than dropped, so the breakdown still adds up
to what was actually lifted. A target trained only at bodyweight is kept at `volume: 0` with its set count:
no load, but not a skipped day either.

**Rest timer** — a `RestTimer` is `{ targetMs, totalSeconds }`, where `targetMs` is an absolute
wall-clock deadline and never a counter anything decrements: iOS suspends timers in a backgrounded
tab, so everything is re-derived from `Date.now()` instead.
- `startRest(seconds, nowMs)` → the timer for one rest.
- `remainingSeconds(targetMs, nowMs)` — whole seconds left, rounded up, clamped at 0.
- `formatCountdown(seconds)` — `mm:ss`, minutes uncapped, never negative.
- `restPhase(rest, nowMs)` — `running` → `done` → `expired`. `expired` is 30 s past zero: a rest
  nobody came back to clears itself silently instead of announcing one that finished long ago.
- `restProgress(rest, nowMs)` — 0 → 1, clamped, for the progress bar.
- `adjustRest(rest, deltaSeconds, nowMs)` — inline ±30 s. The deadline never moves behind `now`
  (shortening past the remaining time just ends the rest) and `totalSeconds` is re-derived from the
  original start, so the bar stays truthful.
- `parseRestSeconds(value)` (in `parse.ts`) — clamps an untrusted duration into 15–600 s, or `null`.

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
- **"See all stats"** — a row under the week counter, pushing to the Stats view (§5.6). Hidden until at
  least one session exists, so a fresh install keeps its empty state.
- **Calendar** — below Today, a month grid (Monday-start, six fixed rows so paging never changes the card's
  height). Prev/next chevrons above the grid step one month at a time, unbounded in either direction. A day
  with a saved session shows a small circular badge with that training's icon, or its initial if no icon
  has been set; today's cell is outlined.
  At most one training is shown per day — if two sessions were saved on the same date, the later one wins
  (same rule as the "Completed today" badge). Tapping a trained day opens that session in History
  (`#/history/<id>`); untrained days are inert. Hidden until at least one session exists, matching "See all
  stats".
- **Backup banner** — shown when `lastExportAt` is unset (and ≥1 session exists) or older than 30 days.
  Tapping it runs an export immediately.
- **Gear icon** (top right) — Settings sheet: weekly goal, export, import, storage usage
  (`navigator.storage.estimate()`), app version, and a link to the GitHub repo.
- **Theme toggle** (top right, beside the gear icon) — sun/moon icon button that flips between light
  and dark, overriding the OS `prefers-color-scheme`. Persisted in `localStorage` (not the `settings`
  IndexedDB store, so it can be read and applied synchronously before first paint — see the inline
  bootstrap script in `index.html`). Defaults to the OS preference until the user picks explicitly.

**Acceptance:** with zero data and no trainings created yet, the page shows 0/3, no streak, no banner, and
an empty state prompting the user to add a training day from the Trainings tab.

### 5.2 Exercises
Vertical order, exactly as briefed:
1. **Search box**, top of the page, fuzzy, with a clear button. `type="search"`, `font-size: 16px` to stop
   iOS zoom-on-focus. In normal document flow — not sticky — so it scrolls away with the rest of the page;
   an earlier sticky version could stick at the wrong offset and leave a facet chip row rendered on top of
   it.
2. **"PR only" and "Favorites" toggles**, side by side in their own row above the facet chips.
   - "PR only" filters the list down to exercises with at least one personal record
     (`exerciseRecords.has(id)` — same weighted-set-only definition as the personal-record badge below, so
     a bodyweight-only exercise never matches).
   - "Favorites" filters down to exercises starred from their card (`settings.favoriteExerciseIds`).
   Both combine with the search query, every facet, and each other (AND). Both count toward, and are reset
   by, "Clear all" alongside the facet chips.
3. **Facet chips**, three rows in this order: Category → Equipment → Target muscle. Each row scrolls
   horizontally, chips toggle, selected chips are filled. A "Clear all" appears when any is active.
4. **Match count** — "142 exercises".
5. **Card carousel** — horizontally scrollable, scroll-snapped cards of the matching exercises.
   **Default order** (no search query): exercises logged at least once — in any past session, bodyweight
   included — sort before ones that have not, alphabetical within each group. A search query switches to
   relevance order, unchanged. This is broader than the personal-record badge below, which only counts
   weighted sets.
6. **"+ Add exercise"** — opens the custom-exercise form (name, category, equipment, target, optional photo).
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
- **Personal-record badge** — `🏆 8x30kg` from `personalRecords().heaviest`, top-left. Overlaid on the card
  rather than placed in the body flow, so a card with a record is exactly as tall as one without and the
  media aspect ratio is untouched. Hidden entirely when there is no weighted history.
- **Favorite star** — top-right, always present, filled when the exercise's id is in
  `settings.favoriteExerciseIds`. Tapping toggles it immediately (`toggleFavorite`, no confirmation — same
  spirit as everywhere else favoriting is one tap, one undo tap). Feeds the "Favorites" toggle in §5.2's
  finder; has no relationship to the personal-record badge on the opposite corner.
- **Tap the image** → full-screen sheet with the complete history: a progress chart, then each session as a
  datetime heading plus its set matrix, newest first.
- **Progress chart** (top of that sheet) — a line over `exerciseProgress()`, toggling between top-set weight
  and estimated 1RM. Three states, because one data point is not a chart:
  - never logged with weight → no chart, one line saying so;
  - one session → the reading as a figure, not a line, and what it takes to start a trend;
  - two or more → the line, with the latest value as the headline and `n sessions · first → last · ±Δ`.
  The y axis is padded around the data rather than anchored at zero (a 30 → 32.5 kg climb is a flat line on
  a 0-based axis) and both bounds are labelled so the cropped baseline is never a surprise.
- Optional `onRemove` prop renders a trash icon beside the favorite star, top-right (Trainings context only).

### 5.3 Trainings
Training days are fully user-managed — there is no fixed list and nothing is seeded.

- One card per training day, in rotation order: an icon, the label as typed, last session datetime +
  days-back for that training, and the exercise count.
- **Icon.** A tappable icon button sits before each card's body, showing the training's chosen icon or its
  first letter by default. Tapping it opens a dialog with a single text field accepting one letter, symbol,
  or emoji; saving updates the badge immediately (on this page and on Home's calendar), and leaving the
  field blank clears it back to the initial-letter default.
- **Add.** A trailing "+ Add training day" card opens a sheet with a single name field. Saving appends a
  new, empty training to the end of the rotation. Names may repeat; ids are always unique and hidden from
  the user.
- **Rename.** A pencil icon on each card opens the same sheet, prefilled with the current name. Only
  `label` changes — the id is stable, so every session already logged under that training keeps pointing
  at it correctly (a session's `trainingLabel` is a snapshot taken at start time, so past records keep
  showing whatever the name was then).
- **Reorder.** A grip handle on the left edge of each card is a drag handle: press and drag vertically to
  move a card past its neighbours, in either direction. The drop position becomes each training's new
  `order`, and that is exactly the sequence `nextTraining()` rotates through on Home.
- **No delete.** Trainings cannot be removed, ever — only renamed — so a `Session.trainingId` always
  resolves to something. A training day that stops being useful can simply be renamed and left with zero
  exercises, or drag-reordered to the end.
- Tapping a card's body (not the grip or pencil) opens its detail view: the training's exercises rendered
  as `ExerciseCard`s **with** the trash icon (removal is immediate, undoable via a toast for 5 s), and a
  trailing **"+"** card.
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
- **Tapping the row's image** opens the same full-history sheet as Trainings/Exercises (§5.2's
  `ExerciseHistorySheet`, shared) — progress chart plus every past saved session's set matrix. Unresolved
  exercise ids (no catalogue entry) render the plain fallback tile with no tap target, same as elsewhere.
- Tapping an existing set line offers Delete (confirm).
- Saving a set that satisfies `beatsPersonalRecord()` raises a self-dismissing **"🏆 New PR"** toast. The
  baseline is saved sessions **plus the sets already logged in this session**, so three ascending sets
  announce three distinct records rather than the same one three times.
- Exercises may be logged in any order; rows with no sets are kept in the saved record with an empty `sets`
  array.
- A small trash icon on each row removes that exercise (and any sets already logged on it) from the
  session, confirmed first — the message names the exercise and, if it has logged sets, the count that
  would be discarded. This edits `activeSession.entries` only; the training's own `exerciseIds` are
  untouched, so skipping a machine for one session doesn't drop it from the training's plan.

Bottom of the page, above **Save session**:
- **"+ Add exercise"** opens the same search + facet picker as Trainings (§5.3), excluding exercises
  already in this session. Picking one appends a row with an empty `sets` array to `activeSession.entries`
  only — the training's own `exerciseIds` are untouched, so a one-off substitute doesn't pollute future
  sessions of that day.

**Rest timer.** A bar pinned under the session title, both fixed in place above the scrolling table
so neither ever overlaps the other, rendered in both states so a rest starting or ending never moves
the exercise rows.
- Saving a set starts (or restarts) a countdown of that training day's `restSeconds`, defaulting to
  90 s. The deadline is absolute — see §4 — so a backgrounded tab resumes at the right number rather
  than at wherever it froze; the display also re-derives on `visibilitychange`.
- Running: `mm:ss`, a progress bar, **−30 s** / **+30 s**, and **Skip**. The ±30 s applies to that
  rest only; nothing is written.
- Idle: the training day's default with **60 / 90 / 120 s** presets. Picking one writes
  `Training.restSeconds` immediately and is where that default is edited.
- At zero the bar reads "Rest done" until cleared, or for 30 s. `navigator.vibrate()` fires once if
  the device has it — feature-detected, so its absence on iOS is a no-op, not an error.
- Timer state is deliberately ephemeral: it lives in the page, not in `activeSession`. A reload
  clears it; a half-finished rest is not training data.
- The Settings sheet states in full that the countdown is on-screen only (§6); the bar itself
  carries no such note, to keep the fixed header compact.

Bottom of the page, above the nav:
- **"Save session"** — large, full-width, green. Writes to `sessions` with `savedAt`, clears
  `activeSession`, navigates to History. Blocked with an explanatory message if zero sets were logged.
  If the final set of exercises differs from the training's `exerciseIds` when the session started —
  because of mid-session **"+ Add exercise"**, the row trash icon, or both — a confirmation sheet names
  what changed and asks whether to update the training to match before navigating to History; declining
  still saves the session as-is and navigates on.
- **"Discard session"** — small, red, text-style. Confirmation dialog, then clears `activeSession`.

### 5.5 History
- Reverse-chronological list of saved sessions: date + time, training label, and a summary line
  (set count · total volume in kg).
- Tapping a record opens the same detail layout as an active session, **read-only** — no "+", no editing.
- The detail view has a destructive "Delete session" action with confirmation. Deleting recomputes
  everything downstream (Home counter, latest-training data on cards) reactively.
- Empty state: "No sessions yet — start one from Home."

### 5.6 Stats
A push view off Home (`#/stats`), **not** a sixth tab: D1 locks the navigation at five, so `tabOf()` maps
this route to `home` and the tab bar stays lit on Home while it is open — the same arrangement as a training
or a session detail. Reached from the "See all stats" row in §5.1; a back control returns to Home.

Three views, all derived from `sessions`, nothing stored:
- **Weekly volume** — a line over the last 12 weeks (`weeklySummary`), headlined with this week's kg and
  captioned with the 12-week average and the best week.
- **Sessions per week** — a bar strip over the same 12 weeks, with the weekly goal as a reference line.
  Weeks that met the goal wear the accent; the rest go recessive, so "did I hit it?" is answered by the
  picture. A week with nothing logged is drawn as a flat stub, not a gap.
- **Muscle balance** — `volumeByTarget` over the last 30 days as a ranked bar list, labels and values as
  real text. A muscle never trained in the window is absent from the list rather than shown at zero; the
  caption says so, since "what is missing" is the question this view exists to answer.

Both aggregates walk every session, so both are memoised on the `sessions` identity and on a `now` captured
once per mount.

**Charts** are hand-rolled inline SVG in `components/Chart.tsx` — `Plot` owns the box, the scales, the
gridlines and the axis labels; `LineChart` and `BarStrip` are marks-only layers on top of it; `BarList` is
the HTML ranked list, where the category labels must wrap and stay selectable. No charting dependency: one
would cost more bundle than the three charts are worth against the Lighthouse target in §8. Every chart is
a single series in `--accent` — no categorical palette to keep colourblind-safe — carries `role="img"` with
an `aria-label` stating the trend in words, and scrolls inside its own container rather than widening the
page. Colours and spacing come only from the tokens in `styles.css`, so both themes follow automatically.

---

## 6. iOS / PWA requirements

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; all fixed
  chrome uses `env(safe-area-inset-*)`.
- Web app manifest: `display: standalone`, portrait, theme + background colours, 180×180 apple-touch-icon,
  192/512 PNG icons, maskable variant.
- Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`):
  - Precache: app shell, CSS/JS, `data/exercises.json`, icons.
  - Runtime: `data/images/**` → `CacheFirst`, 30-day expiration, max 1500 entries.
  - An "update available" toast when a new SW takes control.
- Minimum 44×44 pt tap targets; `-webkit-tap-highlight-color: transparent`; `user-select: none` on controls.
- All inputs ≥16 px font size.
- Dark mode via `prefers-color-scheme`, both themes fully styled, with a manual override toggle on
  Home (§5.1) for users who want light or dark regardless of the OS setting.
- Momentum scrolling in the card carousel; `overscroll-behavior: contain` in sheets to stop rubber-banding
  the page behind them.
- The app must be fully usable with the network off, for any exercise whose image has been viewed once.
- **The rest timer cannot alert.** iOS Safari implements no Vibration API, and a standalone PWA gets
  no notifications, so a rest that ends while the app is backgrounded or the phone is locked ends
  silently. Stated in the UI (§5.4) rather than failed silently. `navigator.vibrate()` is still
  called where it exists (Android Chrome), behind a feature check.

---

## 7. Deployment

- `vite.config.ts`: `base: '/ander-gym/'`.
- `.github/workflows/deploy.yml` — on push to `main`: checkout, Node 22, `npm ci`, `npm run build`,
  upload `dist/` as a Pages artifact, deploy. Pages source set to "GitHub Actions".
- Live at `https://anderboski.github.io/ander-gym/`, added to the Home Screen from Safari.
- No secrets, no environment variables, no analytics.

---

## 8. Quality bar

- **Vitest** unit tests covering every function in §4, training creation/rename/reorder, and an
  export→import round trip (including a custom-exercise blob).
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
