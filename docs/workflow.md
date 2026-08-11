# Contributor workflow — detail and rationale

This is the long-form version of the checklist in [`CLAUDE.md`](../CLAUDE.md#shipping-a-change).
CLAUDE.md has the rules; this has the *why* and the copy-paste commands, so CLAUDE.md doesn't have
to carry both on every task.

## Branching

```bash
git fetch origin
git checkout -b <type>/<short-description> origin/main
```

`<short-description>` is 2–4 kebab-case words: `docs/create-claude-md`, `feature/rest-timer`,
`bug/streak-off-by-one`.

**When you don't control the branch name.** Claude Code on the web (and other task runners) create
the session on a pre-assigned branch — typically `claude/<slug>` — and the session's own instructions
say to develop and push there, overriding this naming scheme. That's fine: keep the assigned branch,
don't rename or recreate it. What matters for the version-bump and changelog rules in CLAUDE.md is the
*kind* of change, not the literal branch prefix — decide bug vs. feature vs. no-bump from what the
diff actually does, the same judgment call the `<type>/` prefix exists to record. About 40% of merged
PRs in this repo's history are on `claude/*` branches for exactly this reason; don't try to force them
into the prefix table.

## Verification

`npm run typecheck && npm test` before every commit. Add tests for anything in `src/data/` — that's
the layer with actual logic to break. If the change touches the service worker, the manifest, or any
caching behaviour, also run `npm run build && npm run preview` — the dev server has the service worker
disabled (`devOptions.enabled: false`), so `npm run dev` cannot exercise it.

## Version + changelog

| Prefix | Bump | Example |
|---|---|---|
| `bug/` | patch | `1.0.0` → `1.0.1` |
| `feature/` | minor (patch resets to 0) | `1.0.0` → `1.1.0` |
| `docs/`, `refactor/`, `chore/`, `test/`, `perf/` | none | — |

```bash
npm version patch --no-git-tag-version   # or: npm version minor --no-git-tag-version
```

`--no-git-tag-version` stops `npm` from creating its own commit/tag; the version change rides along in
the normal commit instead. Major bumps (`1.x.x` → `2.0.0`) are never automatic — Ander does those by
hand.

**Every patch or minor bump adds a matching entry to `src/data/changelog.ts`, in the same commit.**
This is the part that has actually been skipped in practice — `1.13.0` and `1.13.1` both shipped
without one before this was written down as its own step, because the only place it was previously
documented was a comment inside `changelog.ts` itself, which nothing forced anyone to read. The
changelog isn't a nice-to-have: `CHANGELOG` drives the in-app "What's new" popup (`App.tsx`) and the
full changelog sheet reachable from Settings — a bump with no entry means real users get a version-number
change with nothing to show for it. Write both `en` and `es` arrays; one or two sentences, oldest-first
in the array (`unseenEntries` and the popup logic depend on that order).

## Commit

Imperative subject line, blank line, then a body explaining *why* and calling out the decisions a
reviewer should push back on. End with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Push and PR

```bash
git push -u origin <branch>
gh pr create --base main --title "<branch-name> - <short description>" --body "..."
```

Title is always `<branch-name> - <short imperative description>`, e.g.
`feature/rest-timer - Add an inline rest countdown to the session view`. This has held up well in
practice — check past PR titles if in doubt, they're consistently `<head-ref> - <description>` even
on `claude/*` branches.

Body follows [`.github/pull_request_template.md`](../.github/pull_request_template.md) — modelled on
[PR #1](https://github.com/anderboski/ander-gym/pull/1) and
[PR #13](https://github.com/anderboski/ander-gym/pull/13). The template's own inline comments explain
each section; fill in every one rather than leaving placeholders. `gh pr create` picks it up
automatically. End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Never merge to `main` yourself.** Ander reviews and merges. A push to `main` deploys to production
immediately (see below) — that's the whole reason the gate exists.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, typecheck, test, build, then
uploads `dist/` to Pages. A failing typecheck or test blocks the deploy. Live at
<https://anderboski.github.io/ander-gym/>.

One-time setup gotcha: Pages must be enabled as **Settings → Pages → Source = GitHub Actions** before
the *first* deploy, otherwise `actions/configure-pages` fails with `Get Pages site failed … Not Found`
— reads like a build failure but isn't. Re-run the failed workflow after enabling; no new commit
needed.

```bash
gh run list --limit 5
gh run watch
gh run view <run-id> --log-failed
```
