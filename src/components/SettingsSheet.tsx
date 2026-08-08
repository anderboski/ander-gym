/**
 * Settings sheet — SPEC §5.1 (gear icon) and §3 (export / import).
 *
 * Import is deliberately two-step: pick a file, then choose Merge or Replace.
 * Replace wipes the device's data, so it asks a second time before running.
 */
import { useEffect, useRef, useState } from 'react';
import { useGym } from '../data/store';
import { BackupError, type ImportMode } from '../data/backup';
import { formatDate } from '../data/derive';
import { useLanguage, type Language } from '../data/i18n';
import { ConfirmSheet, Sheet } from './Sheet';
import { CheckIcon, DownloadIcon, GitHubIcon, UploadIcon } from './icons';
import packageJson from '../../package.json';
import '../pages/HomePage.css';

/** Language names are shown as endonyms — always in their own language, never translated. */
const LANGUAGES: { code: Language; flag: string; name: string }[] = [
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
];

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

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, setWeeklyGoal, exportNow, importFrom } = useGym();
  const { t, language, setLanguage } = useLanguage();

  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

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

  function clearFile() {
    setPendingFile(null);
    setConfirmReplace(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setErrorText(null);
    setMessage(null);
    setPendingFile(file);
    setConfirmReplace(false);
  }

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    setErrorText(null);
    try {
      await exportNow();
      setMessage(t('common.backupDownloaded'));
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
      await importFrom(pendingFile, mode);
      clearFile();
      setMessage(mode === 'replace' ? t('settings.dataReplaced') : t('settings.backupMerged'));
    } catch (e) {
      setConfirmReplace(false);
      setErrorText(
        e instanceof BackupError || e instanceof Error
          ? e.message
          : t('settings.importFailed'),
      );
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

      {/* --- rest timer ----------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">{t('settings.restTimer')}</div>
        <p className="settings-hint">{t('settings.restTimerHint1')}</p>
        <p className="settings-hint">{t('settings.restTimerHint2')}</p>
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
            onChange={onPickFile}
          />
        </label>

        {pendingFile && (
          <div className="settings-import">
            <div className="settings-file-name">{pendingFile.name}</div>

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
          message={t('settings.confirmReplaceMessage')}
          confirmLabel={t('settings.confirmReplaceLabel')}
          danger
          onConfirm={() => void runImport('replace')}
          onCancel={() => setConfirmReplace(false)}
        />
      )}
    </Sheet>
  );
}
