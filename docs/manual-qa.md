# Manual QA — iPhone

Automated tests cover the pure logic and the storage layer. These are the things
only a real device can tell you. Run the list after any change to the service
worker, the storage layer, or the bottom navigation.

Target: `https://anderboski.github.io/ander-gym/`

## 1. Install to Home Screen

- [ ] Open the URL in **Safari** (not Chrome — only Safari can install a PWA on iOS).
- [ ] Share → *Add to Home Screen*. The icon is a green dumbbell on a dark tile.
- [ ] Launch from the Home Screen. There is **no Safari address bar** — if you can
      see one, `display: standalone` is not being applied.
- [ ] The app name under the icon reads **Gym**.
- [ ] Rotate the phone: it stays portrait.

## 2. Safe areas and layout

- [ ] On a notched device, the page title clears the notch and the tab bar sits
      above the home indicator, with no content trapped underneath it.
- [ ] Nothing scrolls horizontally on any of the five tabs.
- [ ] Every tab bar icon and label is legible and tappable without stretching.
- [ ] Toggle iOS Dark/Light mode. Both themes are fully styled — no white flash,
      no unreadable grey-on-grey.

## 3. Core flow

- [ ] Home shows `0 trainings this week` and an empty state — no trainings exist
      yet on a fresh install.
- [ ] Trainings → **+ Add training day** → name it **Push day** → Save. It appears
      as the only card. Add two more, **Pull day** and **Legs**, the same way.
- [ ] Trainings → open **Push day** → add 3 exercises via the **+** card.
- [ ] Home → tap today's training (**Push day**). It opens Session with those 3
      exercises.
- [ ] Log a set: tap **+**, enter reps and weight, save. The row shows `10x25kg`.
- [ ] Log a second set on the same exercise. Both lines appear.
- [ ] Log a bodyweight set (weight `0`). It reads `12 reps`, not `12x0kg`.
- [ ] **Save session** → lands on History with the session at the top.
- [ ] Home now shows `1 training this week` and today's training has advanced to
      **Pull day**.
- [ ] Exercises → find one of the exercises you logged. Its card shows the date,
      the days-back, and the reps/weight matrix.
- [ ] Tap that card's image → full history sheet opens with the same data.

## 3b. Training management

- [ ] Trainings → tap the pencil on **Pull day** → rename it to **Back & biceps** →
      Save. The card updates immediately.
- [ ] History → the session already logged under the old name **Pull day** still
      shows **Pull day** — renaming does not rewrite past sessions.
- [ ] Trainings → press and drag the grip handle on the left of **Legs** up above
      **Push day**. Release — the list reflects the new order immediately.
- [ ] Home → today's training now follows the new rotation order.
- [ ] Open a training with 3+ exercises → press and drag the grip handle on the
      left of the last exercise's card up above the first. Release — the list
      reflects the new order immediately, and reloading the app keeps it.
- [ ] Session → start that training — the exercises appear in the new order.
- [ ] Confirm there is no way to delete a training day anywhere in the UI.

## 3c. Rest timer

- [ ] Session → the bar under the title reads **Rest 90s** with 60 / 90 / 120
      presets. Tap **120** — it stays selected after leaving and re-entering the
      tab, and only for this training day.
- [ ] Log a set. The countdown starts at 2:00 and the exercise table does not
      move when it appears, or when it later clears.
- [ ] Scroll the exercise list — the bar stays pinned below the status bar,
      clear of the notch.
- [ ] Tap **+30** then **−30** — the countdown and the progress bar agree.
- [ ] Tap **Skip** — the countdown is gone at once and the layout is unchanged.
- [ ] Log a set, switch to another app for ~20 s, come back. The countdown shows
      the *real* time left (not 20 s more), within a second.
- [ ] Log a set with a 60 s rest, background the app and come back after 3+
      minutes. The rest has cleared itself rather than announcing a finished one.
- [ ] Let a rest reach zero with the app open: it reads **Rest done** and clears
      itself after 30 s. On iOS there is no vibration — this is expected, and the
      note under the bar says so.

## 3d. Charts and stats

Only a phone can tell you whether a 320-unit chart is legible in a hand.

- [ ] Exercises → tap the image of an exercise logged in **three or more** sessions.
      The history sheet opens with a line chart above the set matrices: both axis
      bounds readable, the dates under the ends not clipped.
- [ ] Tap **Est. 1RM**, then **Top set**. Each tap lands first time (44 pt) and the
      headline number, the caption and the line all change together.
- [ ] Open an exercise logged **once**. There is no one-point line — a figure and a
      line explaining that a second session starts the trend.
- [ ] Open an exercise logged **only at bodyweight** (weight `0`). One sentence, no
      empty axes.
- [ ] Nothing in the sheet scrolls sideways, and the chart never pushes the page
      wider than the screen.
- [ ] Home → **See all stats**. The bottom tab bar still highlights **Home** — the
      navigation is five tabs and Stats is a push view, not a sixth (D1).
- [ ] The back control returns to Home, and so does the iOS back-swipe / the
      browser back gesture.
- [ ] Sessions-per-week: weeks that met your goal are green, the rest grey, and a
      week you did not train reads as a flat stub rather than as missing data.
- [ ] Muscle balance: long target names wrap instead of truncating, and every bar
      has its kg value beside it.
- [ ] Toggle iOS Dark/Light while a chart is on screen. Lines, bars, gridlines and
      dot rings all follow — no invisible marks, no white halo on a dark card.
- [ ] With **VoiceOver** on, swipe onto a chart: it is announced as a sentence
      ("…12 kg this week against a 12-week average of…"), not skipped or read as
      "image".
- [ ] Settings → Display → larger text. Captions wrap; no chart card overflows.

## 3e. Sport sessions (Snowboard / Cycling / Climbing)

- [ ] Trainings → **+ Add training day** → set Type to **Cycling**, name it
      **Morning ride** → Save. It appears under a new **Other activities**
      section below the rotation list, with no grip handle (it cannot be
      dragged into the rotation).
- [ ] Open it → **Log a session** → the native date picker defaults to today
      and cannot be pushed into the future. Fill in distance, elevation, and
      heart rate → Save. The log appears in a list on this same page.
- [ ] Home → today's calendar cell shows a dot for it, even though no gym
      training exists yet — and the week counter still reads `0 trainings`
      (a sport session never counts toward the goal or the streak).
- [ ] History → the log appears in the same reverse-chronological list as gym
      sessions, with a one-line summary (`10.0 km · 100 m · 142 bpm`).
- [ ] Tap it → the detail view shows the same fields as stat tiles and a
      **Delete log** button — no way to edit a saved value.
- [ ] Repeat for a **Snowboard** training (Weather / Snow condition dropdowns
      + a Comments field) and a **Climbing** one (a count per grade 3/4/5).
- [ ] Log a gym session and a sport session on the same date. The calendar
      cell shows the gym badge plus a small dot for the sport session
      underneath, rather than only one or the other.
- [ ] Confirm there is no way to change a training's Type after creation.

## 4. Keyboard behaviour

- [ ] Focusing the Exercises search box does **not** zoom the viewport.
      (Any input under 16px causes this — it is the classic iOS Safari bug.)
- [ ] With the keyboard open in the set-entry sheet, the Save button is still
      reachable — the sheet body scrolls, the page behind it does not.
- [ ] The reps field brings up the number pad; the weight field brings up the
      decimal pad.
- [ ] Dismissing the keyboard restores the layout with no leftover gap.
- [ ] The sport-log sheet's distance field brings up the decimal pad; elevation,
      heart rate, and the climbing grade counts bring up the number pad —
      none of them zoom the viewport on focus.

## 5. Crash safety

- [ ] Start a session, log two sets, then **force-quit** the app (swipe up from
      the app switcher).
- [ ] Reopen. The session is still active with both sets intact, and Home offers
      **Resume session**.
- [ ] Start a session and tap **Discard session** → confirm. Home no longer
      offers to resume, and History has no new entry.

## 6. Offline

- [ ] With the app open and a few exercise images already viewed, enable
      **Airplane Mode**.
- [ ] Force-quit and relaunch. The app still loads — shell and `exercises.json`
      are precached.
- [ ] Previously-viewed exercise images still render (runtime cache).
- [ ] Scroll to exercises you have never opened: their images are missing, but
      nothing crashes and the cards still show names and history.
- [ ] Log a full session offline and save it. It appears in History.
- [ ] Re-enable networking. Nothing needs to sync — the data never left the phone.

## 7. Backup

- [ ] Home → gear → **Export data**. Safari offers to save the JSON file.
- [ ] Open the file: it contains `schemaVersion`, your trainings, your sessions,
      and any custom exercises with their photos inlined as base64.
- [ ] Gear → **Import** the same file with **Merge**. Nothing is duplicated.
- [ ] Import a deliberately corrupted file (delete a brace). You get a readable
      error message, not a blank screen.
- [ ] Import with **Replace**. It asks for a second confirmation before wiping.
- [ ] After a save, check the backup banner disappears from Home.

## 8. Custom exercises

- [ ] Exercises → **+ Add exercise**. Create one with a photo from the library.
- [ ] It appears in search results with a **Custom** pill and your photo.
- [ ] Create one **without** a photo. It shows a lettered placeholder tile.
- [ ] Add a custom exercise to a training and log a set against it. History and
      the exercise card both show the data.
- [ ] Export, then confirm the photo survives an import round trip.

## 9. Storage persistence

- [ ] Home → gear → storage line shows a plausible MB figure.
- [ ] After saving your first session, the app requests persistent storage. iOS
      grants this silently for installed PWAs; the gear panel should report
      storage as persisted.

## Known limits

- Exercise images are cached **lazily**. A brand-new install in airplane mode
  shows placeholder-free but image-less cards until it has been online once.
- There is no cross-device sync. The JSON export is the only way to move data.
- Charts have no tap-a-point tooltip. Every value they plot is also written out
  in the set matrices below the chart, or in the caption and the muscle-balance
  list — the picture never holds a number on its own.
- Sessions are immutable once saved; the only correction is delete and re-enter.
