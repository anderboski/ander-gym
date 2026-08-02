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
- [ ] Confirm there is no way to delete a training day anywhere in the UI.

## 4. Keyboard behaviour

- [ ] Focusing the Exercises search box does **not** zoom the viewport.
      (Any input under 16px causes this — it is the classic iOS Safari bug.)
- [ ] With the keyboard open in the set-entry sheet, the Save button is still
      reachable — the sheet body scrolls, the page behind it does not.
- [ ] The reps field brings up the number pad; the weight field brings up the
      decimal pad.
- [ ] Dismissing the keyboard restores the layout with no leftover gap.

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
- Sessions are immutable once saved; the only correction is delete and re-enter.
