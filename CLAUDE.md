# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**ander-gym** — a local-first gym session tracker for the iPhone. A static PWA on GitHub Pages:
no backend, no account, no app store, no analytics, no environment variables, no secrets.
Every byte the user creates lives in IndexedDB on their device.

**[`SPEC.md`](SPEC.md) is the source of truth for requirements.** `req.txt` is the original brief
and is superseded by it. Read the relevant SPEC section before changing behaviour — the pages have
per-section acceptance criteria and the "locked decisions" table (§1) records things that were
deliberately chosen, not accidents.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173/ander-gym/  (note the base path)
npm test           # Vitest, run once
npm run test:watch
npm run typecheck  # tsc -b, strict
npm run build      # tsc -b && vite build -> dist/
npm run preview    # serve dist/ — the ONLY way to exercise the service worker
```

There is **no linter configured** (no ESLint, no Prettier) despite SPEC §8 mentioning lint.
`npm run typecheck` is the gate. Don't add a linter as a side effect of another task.

The service worker is disabled in dev (`devOptions.enabled: false`). Any change touching offline
behaviour, caching, or the manifest must be verified with `npm run build && npm run preview`.

Before committing anything: `npm run typecheck && npm test`. CI runs both and a failure blocks the
deploy.

## Architecture

```
data/                  static, read-only, ships as an asset. Source of truth stays at repo root.
  exercises.json       1324 exercise records
  images/              1324 JPEGs, 11 MB
test/fixtures/
  example-export.json  seed data for manual testing — see below
src/
  data/                the entire domain layer
    types.ts           domain types + facet constants
    db.ts              IndexedDB via `idb` — the only file that touches IndexedDB
    derive.ts          pure read models (dates, rotation, streaks, per-exercise history)
    search.ts          Fuse.js fuzzy search + facet filtering
    parse.ts           formatting helpers, no I/O
    backup.ts          JSON export/import
    theme.ts           light/dark override (localStorage, NOT IndexedDB)
    store.tsx          GymProvider + useGym() — the single source of app state
  pages/               one file per route, each with its own .css next to it
  components/          shared UI: Sheet/ConfirmSheet/Toast, ExerciseCard, ExerciseBrowser, icons
  router.ts            ~90-line hash router
  styles.css           design tokens + primitives (imported first, in main.tsx)
```

### Data flow

`useGym()` is the only way pages read state or mutate anything. **No page imports `db.ts`.**
Actions in `store.tsx` write to IndexedDB *first*, then publish to React state, so storage and UI
can never diverge and a force-quit mid-workout loses nothing.

Actions derive their next value by **reading the DB**, not by closing over React state — state
updaters must stay pure because StrictMode invokes them twice, and IndexedDB is the authority anyway.
Follow this pattern when adding a mutation.

### Routing

Hash routing (`#/trainings/t-abc`), hand-rolled, deliberate. GitHub Pages has no rewrite rule, so a
path-based deep link would 404 on reload. **Do not add React Router** — every 7.x release currently
carries an open advisory, and this is a five-tab static app. `npm audit` reports 0 vulnerabilities;
keep it that way.

Adding a route: extend the `Route` union in `router.ts`, handle it in `parseRoute`, map it to a tab
in `tabOf`, and render it in `App.tsx`.

### Seed data for manual testing

[`test/fixtures/example-export.json`](test/fixtures/example-export.json) is a trimmed, obfuscated
export in the `BackupFile` shape (`src/data/backup.ts`) — a couple of trainings/sessions per training
type (gym + each sport kind), a bodyweight set, an in-progress-looking session with empty-set entries,
custom exercises (with and without a photo), two weigh-ins, decimal weights. **Use it instead of
hand-creating trainings and sessions** when you need a populated app to test against: Settings →
Import → pick the file → Replace. Don't add real personal data to it; if a bug needs a shape this file
doesn't cover, extend the fixture instead of typing data into the UI by hand.

## Invariants — break these and something real breaks

**Base path.** `/ander-gym/` is hardcoded in *three* places: `base` in `vite.config.ts`, `start_url`
+ `scope` + icon paths in the PWA manifest, and the `apple-touch-icon` path in `index.html`. It must
match the repo name. All runtime asset URLs are built as `` `${import.meta.env.BASE_URL}data/…` `` —
never hardcode a leading `/`.

**Three fields in `exercises.json` are ignored, on purpose.** `body_part` (byte-identical to
`category` on all 1324 records), `muscle_group` (dirty vocabulary — `traps` *and* `trapezius`,
`lats` *and* `latissimus dorsi`), and `gif_url` (points at `data/videos/`, which does not exist).
The third filter facet is `target` (19 clean values). Don't "fix" this by surfacing them.

**`id` in `exercises.json` is an opaque zero-padded string.** Never parse it as a number.

**A training with any history is never deleted, only archived.** Trainings are fully user-managed
(create / rename / drag-reorder / archive, ids `t-<uuid>`), but a `Session.trainingId` must always
resolve or history breaks. `Training.archived` drops a training out of `nextTraining()`'s rotation and
the default Trainings list without touching its id, exercises, or history — it stays fully resolvable
and can be unarchived. Renaming changes only `label`; the id is stable. Sessions snapshot
`trainingLabel` at start time, so past records keep the old name — that's intended. The one exception:
a training with zero sessions and no session currently active against it has nothing for a
`trainingId` to lose, so it can be deleted outright (`db.deleteTraining`) instead of archived — gated
in the UI, not enforced by the data layer, so any new deletion path must re-check both conditions.

**Saved sessions are immutable.** No editing. The only correction is delete and re-enter. Everything
downstream (week counter, streak, "latest sets" on every card) derives from History, so it has to
stay trustworthy.

**Session `entries` store exercise ids only.** Names and images resolve at render time, so a renamed
custom exercise stays consistent everywhere.

**Every write to `activeSession` is immediate.** A set that has been logged must survive a force-quit.

**Exercise images are excluded from the precache** (11 MB / 1324 files) and cached lazily at runtime
via a `CacheFirst` rule. Don't widen `workbox.globPatterns` to pull in `.jpg`.

**Theme lives in `localStorage`, not the `settings` store.** localStorage is synchronous, so the
inline bootstrap script in `index.html` can apply it before first paint. That script duplicates the
logic in `theme.ts` — if you change one, change both (the storage key is
`THEME_STORAGE_KEY = 'ander-gym-theme'`).

**`DB_VERSION` is 1 with no migrations.** Adding or changing an object store means bumping
`DB_VERSION`, writing the `upgrade` branch, and bumping `SCHEMA_VERSION` + handling it in
`backup.ts` if the export shape changes. Existing users have real data on their phones — there is no
server copy to restore from.

**Custom-exercise object URLs must be revoked.** `customToExercise` creates them; `revokeCustomUrls`
is called before the exercise list is rebuilt. Keep them paired.

## Conventions

**TypeScript.** `strict`, plus `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`. Type-only imports use `import type`. **No `any` in `src/data/`.** Indexed
access returns `T | undefined` — handle it, don't `!` your way past it.

**Comments explain *why*, not *what*.** Every non-obvious decision in this codebase carries a short
comment naming the constraint it works around (StrictMode double-invocation, iOS zoom-on-focus, the
Pages reload-404, DST in day maths). Match that density: silent on the obvious, explicit on the
surprising. File-level docblocks reference the SPEC section they implement (`/** Home — SPEC §5.1. */`).

**CSS.** Tokens and primitives live in `src/styles.css` (`--bg`, `--text-dim`, `--accent`, `--s1`…`--s10`,
`--r-md`, `--tabbar-h`, `--safe-top`/`--safe-bottom`). **Never hardcode a colour or a spacing value.**
Page-specific CSS goes in a sibling file (`HomePage.css`) imported by the page, with classes prefixed
by the page (`home-card`, `history-row`). Shared primitives are unprefixed: `page`, `page-header`,
`page-title`, `page-sub`, `empty`, `btn`, `btn-primary`, `btn-ghost`, `btn-danger`, `chip`, `input`,
`sheet`, `toast`, `num`. Both light and dark themes must be fully styled.

**Components.** Bottom sheets go through `<Sheet>` / `<ConfirmSheet>` (portal-rendered, scroll-locked,
Escape-closable, dismiss "×" top-right). Destructive actions always confirm. Undoable removals use
`<Toast>` with a 5 s action. Icons are stroke SVGs in `components/icons.tsx`, 24×24 viewBox, sized by CSS.

**Tests.** Vitest, Node environment, `src/**/*.test.ts` colocated with the source. `src/test/setup.ts`
loads `fake-indexeddb/auto`, so `db.ts` is testable directly — `db.test.ts` deletes the database in
`beforeEach`. Build dates with local-time helpers so tests don't depend on the runner's timezone.
Test the pure logic in `derive.ts`/`search.ts`/`parse.ts`, the storage layer, and backup round trips;
there is no component-testing setup and adding one is a decision, not a detail.

**iOS constraints** (SPEC §6, and the source of most "why is it like that"):
inputs ≥ 16 px or Safari zooms on focus · tap targets ≥ 44×44 pt · `env(safe-area-inset-*)` on all
fixed chrome · `overscroll-behavior: contain` in sheets · numeric keypads via `inputmode` ·
`-webkit-tap-highlight-color: transparent`.

**Anything only a real device can prove** goes in [`docs/manual-qa.md`](docs/manual-qa.md), and that
checklist must be updated when a feature changes install, offline, keyboard, or crash-safety behaviour.
State plainly in the PR that on-device verification hasn't been done — don't imply it has.

## Shipping a change

Full rationale, commands, and edge cases for each step live in
[`docs/workflow.md`](docs/workflow.md) — this is the checklist version. Every step below is
mandatory; none are optional extras.

1. **Spec.** If the change is user-visible, update `SPEC.md` in the same PR — new/changed behaviour,
   a new locked decision, a changed acceptance criterion. Skip only for pure refactors, build tweaks,
   or doc fixes.
2. **Branch.** New branch off latest `main`, never work on `main` directly. Name it
   `<type>/<short-description>` (`feature/`, `bug/`, `docs/`, `refactor/`, `chore/`, `test/`, `perf/`)
   by what the change actually does — no PR in this repo ships from a `claude/<slug>` branch.
   **If the session already has a branch assigned** (Claude Code web / a task runner — typically
   `claude/<slug>`), that's a starting point only: once you know the type, create the correctly
   prefixed branch from the current work and push there instead, then open the PR from that branch.
   See [`docs/workflow.md`](docs/workflow.md#branching) for the exact commands and why doing this
   without asking first is safe.
3. **Verify.** `npm run typecheck && npm test` before every commit; add tests for anything in
   `src/data/`. Touches the service worker, manifest, or caching → also `npm run build && npm run preview`.
4. **Version + changelog, together, same commit:**
   - Bug fix → patch (`npm version patch --no-git-tag-version`). New feature → minor
     (`npm version minor --no-git-tag-version`). Docs/refactor/chore/test/perf → no bump.
   - **Every patch or minor bump adds an entry to `src/data/changelog.ts`** (both `en` and `es`).
     This drives the in-app "What's new" popup and the Settings changelog sheet — a version bump
     with no entry is a real gap users see, not a formality. Do this now, don't defer it.
5. **Commit.** Imperative subject, body explains *why*, ends with:
   ```
   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   ```
6. **Push and open a PR against `main` — every task ends here, unprompted.** Title:
   `<branch-name> - <short imperative description>`. Body: fill in every section of
   [`.github/pull_request_template.md`](.github/pull_request_template.md); `gh pr create` attaches it
   automatically. End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Never merge to `main` yourself** — no merge, squash-merge, or auto-merge. Ander reviews and merges;
a push to `main` deploys to production immediately via `.github/workflows/deploy.yml`, which is the
whole reason the gate exists. Deployment troubleshooting: [`docs/workflow.md`](docs/workflow.md).
