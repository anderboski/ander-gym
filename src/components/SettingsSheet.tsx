/**
 * Settings sheet — SPEC §5.1 (gear icon) and §3 (export / import).
 *
 * Import is deliberately three-step: pick a file, read what is actually in it,
 * then choose Merge or Replace. The preview is not decoration — Replace wipes
 * the device, and the mistake worth catching (an empty file, last year's
 * export, the wrong file entirely) is one a confirmation dialog cannot see.
 * Parsing on pick also moves a malformed file's error to before that choice
 * rather than after it.
 */
import { useEffect, useRef, useState } from 'react';
import { useGym } from '../data/store';
import {
  BackupError,
  parseBackup,
  summariseBackup,
  type BackupErrorCode,
  type BackupFile,
  type BackupSummary,
  type ExportOutcome,
  type ImportMode,
} from '../data/backup';
import { backupStatus, formatDate } from '../data/derive';
import { useLanguage, type Language, type TranslationKey } from '../data/i18n';
import { ChangelogSheet } from './Changelog';
import { ConfirmSheet, Sheet } from './Sheet';
import { CheckIcon, DownloadIcon, GiftIcon, GitHubIcon, HelpIcon, UploadIcon } from './icons';
import packageJson from '../../package.json';
import { navigate } from '../router';
import '../pages/HomePage.css';

/** Language names are shown as endonyms — always in their own language, never translated. */
const LANGUAGES: { code: Language; flag: string; name: string }[] = [
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
];

/** BackupError has no hook access to translate itself — mapped here instead. */
const BACKUP_ERROR_KEYS: Record<BackupErrorCode, TranslationKey> = {
  'invalid-json': 'backup.invalidJson',
  'not-a-backup': 'backup.notABackup',
  'newer-schema': 'backup.newerSchema',
  'missing-data': 'backup.missingData',
};

/** Same mapping as Home's: a shared backup did not "download" anywhere. */
const EXPORT_MESSAGE_KEYS: Record<Exclude<ExportOutcome, 'cancelled'>, TranslationKey> = {
  shared: 'common.backupShared',
  downloaded: 'common.backupDownloaded',
};

const GOAL_MIN = 1;
const GOAL_MAX = 14;

const GITHUB_URL = 'https://github.com/anderboski/ander-gym';

type StorageInfo = {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
};

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A picked file that parsed, held with its counts until a mode is chosen. */
type PendingImport = { name: string; backup: BackupFile; summary: BackupSummary };

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, sessions, setWeeklyGoal, exportNow, importFrom } = useGym();
  const { t, language, setLanguage } = useLanguage();

  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<PendingImport | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);

  /* navigator.storage is missing in older WebKit and in non-secure contexts. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const sm: StorageManager | undefined = navigator.storage;
      if (!sm || typeof sm.estimate !== 'function') return;
      try {
        const estimate = await sm.estimate();
        const persisted = typeof sm.persisted === 'function' ? await sm.persisted() : null;
        if (cancelled) return;
        setStorage({
          usage: estimate.usage ?? null,
          quota: estimate.quota ?? null,
          persisted,
        });
      } catch {
        /* An unavailable estimate is not worth surfacing. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const goal = settings.weeklyGoal;
  const backup = backupStatus(sessions, settings.lastExportAt, new Date());

  function clearFile() {
    setPendingFile(null);
    setConfirmReplace(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  /**
   * Parse on pick, not on import. A file that isn't a backup says so here,
   * before Merge/Replace is even offered, and what survives parsing is what
   * gets applied — the preview and the import can't disagree.
   */
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setErrorText(null);
    setMessage(null);
    setConfirmReplace(false);
    setPendingFile(null);
    if (!file) return;

    try {
      const backup = parseBackup(await file.text());
      setPendingFile({ name: file.name, backup, summary: summariseBackup(backup) });
    } catch (err) {
      setErrorText(describeImportError(err));
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function describeImportError(err: unknown): string {
    if (err instanceof BackupError) return t(BACKUP_ERROR_KEYS[err.code], err.vars);
    return err instanceof Error ? err.message : t('settings.importFailed');
  }

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    setErrorText(null);
    try {
      const outcome = await exportNow();
      if (outcome !== 'cancelled') setMessage(t(EXPORT_MESSAGE_KEYS[outcome]));
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : t('common.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function runImport(mode: ImportMode) {
    if (!pendingFile || busy) return;
    setBusy(true);
    setErrorText(null);
    setMessage(null);
    try {
      await importFrom(pendingFile.backup, mode);
      clearFile();
      setMessage(mode === 'replace' ? t('settings.dataReplaced') : t('settings.backupMerged'));
    } catch (e) {
      setConfirmReplace(false);
      setErrorText(describeImportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('settings.title')} onClose={onClose}>
      {/* --- weekly goal --------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">{t('settings.weeklyGoal')}</div>
        <div className="settings-row">
          <span className="settings-row-label">{t('settings.trainingsPerWeek')}</span>
          <div className="stepper">
            <button
              className="stepper-btn"
              aria-label={t('settings.decreaseGoal')}
              disabled={goal <= GOAL_MIN || busy}
              onClick={() => void setWeeklyGoal(goal - 1)}
            >
              −
            </button>
            <span className="stepper-value num" aria-live="polite">
              {goal}
            </span>
            <button
              className="stepper-btn"
              aria-label={t('settings.increaseGoal')}
              disabled={goal >= GOAL_MAX || busy}
              onClick={() => void setWeeklyGoal(goal + 1)}
            >
              +
            </button>
          </div>
        </div>
      </section>

      {/* --- language -------------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">{t('settings.language')}</div>
        <div className="settings-lang-row">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className="chip settings-lang-chip"
              aria-pressed={language === l.code}
              onClick={() => setLanguage(l.code)}
            >
              <span aria-hidden="true">{l.flag}</span> {l.name}
            </button>
          ))}
        </div>
      </section>

      {/* --- export -------------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">{t('settings.backup')}</div>
        <button className="btn btn-block" disabled={busy} onClick={() => void handleExport()}>
          <DownloadIcon className="settings-btn-icon" />
          {t('settings.exportData')}
        </button>
        <p className="settings-hint">
          {t('settings.lastExport')}{' '}
          <span className="num">
            {settings.lastExportAt ? formatDate(settings.lastExportAt) : t('common.never')}
          </span>
        </p>
        {backup.unsaved > 0 && (
          <p className="settings-hint">
            {t(backup.unsaved === 1 ? 'settings.unsavedOne' : 'settings.unsavedOther', {
              count: backup.unsaved,
            })}
          </p>
        )}
      </section>

      {/* --- import -------------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">{t('settings.import')}</div>

        <label className="btn btn-block settings-file">
          <UploadIcon className="settings-btn-icon" />
          {pendingFile ? t('settings.chooseDifferentFile') : t('settings.chooseBackupFile')}
          <input
            ref={fileInput}
            className="settings-file-input"
            type="file"
            accept="application/json,.json"
            aria-label={t('settings.chooseBackupFile')}
            onChange={(e) => void onPickFile(e)}
          />
        </label>

        {pendingFile && (
          <div className="settings-import">
            <div className="settings-file-name">{pendingFile.name}</div>
            <ImportPreview summary={pendingFile.summary} />

            <button className="btn btn-block" disabled={busy} onClick={() => void runImport('merge')}>
              {t('settings.merge')}
            </button>
            <p className="settings-hint">{t('settings.mergeHint')}</p>

            <button
              className="btn btn-block btn-danger"
              disabled={busy}
              onClick={() => setConfirmReplace(true)}
            >
              {t('settings.replace')}
            </button>
            <p className="settings-hint">{t('settings.replaceHint')}</p>

            <button className="btn btn-block btn-ghost" disabled={busy} onClick={clearFile}>
              {t('sheet.cancel')}
            </button>
          </div>
        )}
      </section>

      {errorText && (
        <p className="settings-error" role="alert">
          {errorText}
        </p>
      )}
      {message && (
        <p className="settings-ok" role="status">
          <CheckIcon className="settings-btn-icon" />
          {message}
        </p>
      )}
      {busy && <div className="spinner" role="status" aria-label={t('settings.working')} />}

      {/* --- storage ------------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">{t('settings.storage')}</div>
        {storage ? (
          <>
            <p className="settings-hint">
              <span className="num">
                {storage.usage === null ? t('common.unknown') : formatMb(storage.usage)}
              </span>{' '}
              {t('settings.used')}
              {storage.quota !== null && (
                <>
                  {' '}
                  {t('settings.of')} <span className="num">{formatMb(storage.quota)}</span>{' '}
                  {t('settings.available')}
                </>
              )}
            </p>
            <p className="settings-hint">
              {storage.persisted === null
                ? t('settings.persistUnavailable')
                : storage.persisted
                  ? t('settings.persisted')
                  : t('settings.notPersisted')}
            </p>
          </>
        ) : (
          <p className="settings-hint">{t('settings.storageUnavailable')}</p>
        )}
      </section>

      <div className="settings-footer">
        <p className="settings-version">{t('settings.version', { version: packageJson.version })}</p>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setChangelogOpen(true)}
          aria-label={t('changelog.viewAria')}
        >
          <GiftIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            onClose();
            navigate('/help');
          }}
          aria-label={t('settings.howToUse')}
        >
          <HelpIcon />
        </button>
        <a
          className="icon-btn"
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('settings.viewSource')}
        >
          <GitHubIcon />
        </a>
      </div>

      {confirmReplace && (
        <ConfirmSheet
          title={t('settings.confirmReplaceTitle')}
          message={`${t('settings.confirmReplaceMessage')} ${t('settings.confirmReplaceCounts', {
            trainings: pendingFile?.summary.trainings ?? 0,
            sessions: pendingFile?.summary.sessions ?? 0,
          })}`}
          confirmLabel={t('settings.confirmReplaceLabel')}
          danger
          onConfirm={() => void runImport('replace')}
          onCancel={() => setConfirmReplace(false)}
        />
      )}

      {changelogOpen && <ChangelogSheet onClose={() => setChangelogOpen(false)} />}
    </Sheet>
  );
}

/**
 * What the picked file holds. Rows with nothing in them are dropped rather
 * than shown as zeros — the same rule the muscle-balance list follows, and it
 * keeps the one number that matters (sessions) from being buried under five
 * empty ones. A file whose every store is empty still renders its own line,
 * because "this backup is empty" is precisely what someone about to tap
 * Replace needs to read.
 */
function ImportPreview({ summary }: { summary: BackupSummary }) {
  const { t } = useLanguage();

  const all: { one: TranslationKey; other: TranslationKey; count: number }[] = [
    { one: 'settings.previewTrainingOne', other: 'settings.previewTrainingOther', count: summary.trainings },
    { one: 'settings.previewSessionOne', other: 'settings.previewSessionOther', count: summary.sessions },
    { one: 'settings.previewSportOne', other: 'settings.previewSportOther', count: summary.sportSessions },
    { one: 'settings.previewCustomOne', other: 'settings.previewCustomOther', count: summary.customExercises },
    { one: 'settings.previewCheckinOne', other: 'settings.previewCheckinOther', count: summary.checkins },
  ];
  const rows = all.filter((row) => row.count > 0);

  return (
    <div className="settings-preview">
      {rows.length === 0 ? (
        <p className="settings-hint">{t('settings.previewEmpty')}</p>
      ) : (
        <ul className="settings-preview-list">
          {rows.map((row) => (
            <li key={row.one}>
              <span className="num">{row.count}</span> {t(row.count === 1 ? row.one : row.other)}
            </li>
          ))}
        </ul>
      )}
      <p className="settings-hint">
        {summary.exportedAt
          ? t('settings.previewExported', { date: formatDate(summary.exportedAt) })
          : t('settings.previewExportedUnknown')}
      </p>
    </div>
  );
}
