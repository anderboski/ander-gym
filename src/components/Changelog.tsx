/**
 * "What's new" popup (auto-shown after an update) and the full changelog
 * sheet reachable from Settings. Both read from data/changelog.ts.
 */
import { useEffect, useState } from 'react';
import {
  CHANGELOG,
  getLastSeenVersion,
  setLastSeenVersion,
  unseenEntries,
  type ChangelogEntry,
} from '../data/changelog';
import { formatDate } from '../data/derive';
import { useLanguage } from '../data/i18n';
import { Sheet } from './Sheet';
import './Changelog.css';

function notesFor(entry: ChangelogEntry, language: 'en' | 'es'): string[] {
  return language === 'es' ? entry.es : entry.en;
}

/**
 * Mounted once at the app root (App.tsx). Queues up every unseen version's
 * notes, oldest first, and shows them one sheet at a time — dismissing one
 * (via the button, the "×", Escape, or the backdrop) advances to the next
 * and persists progress, so a partially-worked-through queue survives the
 * app being closed mid-way.
 */
export function WhatsNewGate() {
  const { language, t } = useLanguage();
  // Read once, via a lazy initializer — a pure read, so it stays correct
  // even though StrictMode invokes it twice in dev. The queue derives from
  // this captured value rather than re-reading localStorage, so the
  // baseline-persisting effect below (which itself runs twice under
  // StrictMode) can't clobber it by reading back its own first write.
  const [lastSeenAtLoad] = useState<string | null>(() => getLastSeenVersion());
  const [queue, setQueue] = useState<ChangelogEntry[]>(() => unseenEntries(lastSeenAtLoad));

  useEffect(() => {
    if (lastSeenAtLoad !== null) return;
    // First run of this feature (new install, or an existing install that
    // predates it) — baseline to the latest version so old history isn't
    // dumped on the user, but still show that one entry (queued above) so
    // the feature (and whatever shipped alongside it) gets announced once.
    const latest = CHANGELOG[CHANGELOG.length - 1];
    if (latest) setLastSeenVersion(latest.version);
  }, [lastSeenAtLoad]);

  const current = queue[0];
  if (!current) return null;

  function dismiss() {
    setLastSeenVersion(current!.version);
    setQueue((q) => q.slice(1));
  }

  return (
    <Sheet title={t('changelog.whatsNewTitle', { version: current.version })} onClose={dismiss}>
      <ul className="changelog-notes">
        {notesFor(current, language).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <button className="btn btn-primary btn-block changelog-dismiss" onClick={dismiss}>
        {t('changelog.gotIt')}
      </button>
    </Sheet>
  );
}

/** Full release history, newest first, opened from the Settings footer. */
export function ChangelogSheet({ onClose }: { onClose: () => void }) {
  const { language, t } = useLanguage();
  const entries = [...CHANGELOG].reverse();

  return (
    <Sheet title={t('changelog.title')} onClose={onClose} full>
      {entries.map((entry) => (
        <section className="changelog-entry" key={entry.version}>
          <div className="changelog-entry-head">
            <span className="changelog-entry-version num">v{entry.version}</span>
            <span className="changelog-entry-date num">{formatDate(entry.date)}</span>
          </div>
          <ul className="changelog-notes">
            {notesFor(entry, language).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
