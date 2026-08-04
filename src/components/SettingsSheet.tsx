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
import { ConfirmSheet, Sheet } from './Sheet';
import { CheckIcon, DownloadIcon, UploadIcon } from './icons';
import packageJson from '../../package.json';
import '../pages/HomePage.css';

const GOAL_MIN = 1;
const GOAL_MAX = 14;

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
      setMessage('Backup downloaded.');
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Export failed.');
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
      setMessage(mode === 'replace' ? 'Data replaced from backup.' : 'Backup merged in.');
    } catch (e) {
      setConfirmReplace(false);
      setErrorText(
        e instanceof BackupError || e instanceof Error
          ? e.message
          : 'That file could not be imported.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      {/* --- weekly goal --------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">Weekly goal</div>
        <div className="settings-row">
          <span className="settings-row-label">Trainings per week</span>
          <div className="stepper">
            <button
              className="stepper-btn"
              aria-label="Decrease weekly goal"
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
              aria-label="Increase weekly goal"
              disabled={goal >= GOAL_MAX || busy}
              onClick={() => void setWeeklyGoal(goal + 1)}
            >
              +
            </button>
          </div>
        </div>
      </section>

      {/* --- rest timer ----------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">Rest timer</div>
        <p className="settings-hint">
          Rest length is set per training day, from the bar under the session title.
        </p>
        <p className="settings-hint">
          The countdown is visual. iOS Safari has no vibration, and a Home Screen app cannot send
          notifications, so a rest that ends while this app is in the background or the phone is
          locked passes silently. Android devices get a short vibration at zero.
        </p>
      </section>

      {/* --- export -------------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">Backup</div>
        <button className="btn btn-block" disabled={busy} onClick={() => void handleExport()}>
          <DownloadIcon className="settings-btn-icon" />
          Export data
        </button>
        <p className="settings-hint">
          Last export:{' '}
          <span className="num">
            {settings.lastExportAt ? formatDate(settings.lastExportAt) : 'Never'}
          </span>
        </p>
      </section>

      {/* --- import -------------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">Import</div>

        <label className="btn btn-block settings-file">
          <UploadIcon className="settings-btn-icon" />
          {pendingFile ? 'Choose a different file' : 'Choose backup file'}
          <input
            ref={fileInput}
            className="settings-file-input"
            type="file"
            accept="application/json,.json"
            aria-label="Choose backup file"
            onChange={onPickFile}
          />
        </label>

        {pendingFile && (
          <div className="settings-import">
            <div className="settings-file-name">{pendingFile.name}</div>

            <button className="btn btn-block" disabled={busy} onClick={() => void runImport('merge')}>
              Merge
            </button>
            <p className="settings-hint">
              Keeps what is on this device and adds the file’s records; the file wins on conflicts.
            </p>

            <button
              className="btn btn-block btn-danger"
              disabled={busy}
              onClick={() => setConfirmReplace(true)}
            >
              Replace
            </button>
            <p className="settings-hint">
              Deletes every training, session and custom exercise here first, then loads the file.
            </p>

            <button className="btn btn-block btn-ghost" disabled={busy} onClick={clearFile}>
              Cancel
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
      {busy && <div className="spinner" role="status" aria-label="Working" />}

      {/* --- storage ------------------------------------------------------- */}
      <section className="settings-block">
        <div className="section-title">Storage</div>
        {storage ? (
          <>
            <p className="settings-hint">
              <span className="num">
                {storage.usage === null ? 'Unknown' : formatMb(storage.usage)}
              </span>{' '}
              used
              {storage.quota !== null && (
                <>
                  {' '}
                  of <span className="num">{formatMb(storage.quota)}</span> available
                </>
              )}
            </p>
            <p className="settings-hint">
              {storage.persisted === null
                ? 'Persistence status unavailable.'
                : storage.persisted
                  ? 'Storage is persisted — the browser will not evict it automatically.'
                  : 'Storage is not persisted — the browser may evict it. Keep exporting.'}
            </p>
          </>
        ) : (
          <p className="settings-hint">Storage usage is not available on this device.</p>
        )}
      </section>

      <p className="settings-version">ander-gym v{packageJson.version}</p>

      {confirmReplace && (
        <ConfirmSheet
          title="Replace all data?"
          message="This deletes every training, session and custom exercise on this device and loads the backup file in their place. It cannot be undone."
          confirmLabel="Replace everything"
          danger
          onConfirm={() => void runImport('replace')}
          onCancel={() => setConfirmReplace(false)}
        />
      )}
    </Sheet>
  );
}
