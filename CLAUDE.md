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

**Trainings are never deleted.** They're fully user-managed (create / rename / drag-reorder,
ids `t-<uuid>`), but a `Session.trainingId` must always resolve or history breaks. Renaming changes
only `label`; the id is stable. Sessions snapshot `trainingLabel` at start time, so past records keep
the old name — that's intended.

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

## Working on a new feature

1. **Update `SPEC.md` first, if the change is user-visible.** New behaviour, changed behaviour, a new
   locked decision, or a changed acceptance criterion all belong in the spec *in the same PR* as the
   code. The spec is the source of truth; code that contradicts it is a bug in one of the two.
   Pure refactors, build tweaks and doc fixes don't need a spec change.
2. **Branch off the latest `main`** — always a brand-new branch, never work directly on `main`:

   ```bash
   git fetch origin
   git checkout -b <type>/<short-description> origin/main
   ```

   `<type>` is one of:

   | Prefix | For |
   |---|---|
   | `feature/` | new user-facing capability |
   | `bug/` | fixing broken behaviour |
   | `docs/` | README, SPEC, CLAUDE.md, manual-qa |
   | `refactor/` | restructuring with no behaviour change |
   | `chore/` | deps, tooling, CI, config |
   | `test/` | tests only |
   | `perf/` | performance work only |

   `<short-description>` is 2–4 kebab-case words: `docs/create-claude-md`, `feature/rest-timer`,
   `bug/streak-off-by-one`.
3. **Verify before committing:** `npm run typecheck && npm test`. Add tests for anything in
   `src/data/`. If it touches the service worker, manifest, or caching, also
   `npm run build && npm run preview`.
4. **Commit.** Imperative subject line, blank line, then a body explaining *why* and calling out the
   decisions a reviewer should push back on. End with:

   ```
   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   ```
5. **Push and open a PR against `main`. Every task ends here — push the branch and raise the PR
   without waiting to be asked, so it's sitting ready for Ander to review the moment the task is
   done:**

   ```bash
   git push -u origin <branch>
   gh pr create --base main --title "<branch-name> - <short description>" --body "..."
   ```

   The title always starts with the branch name, then ` - `, then a short imperative description:
   `feature/rest-timer - Add an inline rest countdown to the session view`.

   The body follows [`.github/pull_request_template.md`](.github/pull_request_template.md) —
   modelled on [PR #1](https://github.com/anderboski/ander-gym/pull/1) and
   [PR #13](https://github.com/anderboski/ander-gym/pull/13): what ships (a table when there are
   several surfaces), how it fits together, **decisions worth reviewing** — including anything you'd
   flag as debatable or as a deviation from the spec — a **verification** section listing exactly
   what was run and what was *not* verified, and anything needed before merge. `gh pr create` picks
   the template up automatically; fill in every section rather than leaving its placeholders. End the
   body with:

   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

### Never merge to main

**Your work ends at the open PR.** Do not merge, do not squash-merge, do not push to `main`, do not
enable auto-merge. Ander reviews and merges. Pushing to `main` also publishes to production
immediately (see below), which is exactly why the gate exists.

## Deployment

`.github/workflows/deploy.yml` — **every push to `main` publishes to production.** The workflow runs
`npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then uploads `dist/` to Pages. A failing
typecheck or test blocks the deploy. Live at <https://anderboski.github.io/ander-gym/>.

Pages must be enabled as **Settings → Pages → Source = GitHub Actions** before the first deploy;
otherwise `actions/configure-pages` fails with `Get Pages site failed … Not Found`, which reads like
a build failure but isn't. Re-run the failed workflow after enabling — no new commit needed.

```bash
gh run list --limit 5
gh run watch
gh run view <run-id> --log-failed
```
