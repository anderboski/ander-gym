<!--
Title convention: "<branch-name> - <short imperative description>"
e.g. "feature/rest-timer - Add an inline rest countdown to the session view"

Fill in every section below — delete these HTML comments, not the headings.
Modelled on PR #1 and PR #13. See CLAUDE.md "Working on a new feature" for
the full workflow this template supports.
-->

## What ships

<!--
A short lead-in sentence, then — if the change touches more than one surface
— a table like this:

| Surface | Behaviour |
|---|---|
| ... | ... |
-->

## How it fits together

<!--
How the change connects to the existing architecture and conventions (data
flow through useGym()/store.tsx, derive.ts helpers added or reused, routing,
CSS/component conventions, etc). Note any accompanying SPEC.md update and
which section it lives in.
-->

## Decisions worth reviewing

<!--
Anything debatable, a deviation from SPEC.md, or a trade-off worth a second
look. Say so plainly, even if you'd defend the choice. Write "None" if there
genuinely aren't any.
-->

## Verification

<!--
Exactly what was run, and — just as important — what was *not*. Don't imply
device testing happened if it didn't.
-->

- [ ] `npm run typecheck && npm test`
- [ ] `npm run build` (add `npm run preview` if the change touches the service worker, manifest, or caching)
- [ ] Manual check in a browser (state which flows/themes were exercised)
- [ ] On-device (iPhone) verification — call out explicitly if this was skipped, and update `docs/manual-qa.md` if the change affects install, offline, keyboard, or crash-safety behaviour
- [ ] Version bumped in `package.json` per the branch prefix (CLAUDE.md "Working on a new feature"
      step 4) — patch for `bug/`, minor for `feature/`, unchanged for everything else

🤖 Generated with [Claude Code](https://claude.com/claude-code)
