/**
 * Trainings — SPEC §5.3.
 *
 * Training days are entirely user-managed: create as many as you like, rename
 * anytime (the id never changes, so session history stays attributed
 * correctly), and reorder by dragging the grip on the left of a card — the
 * rotation Home uses is exactly this order.
 *
 * Trainings with history are never deletable, only archivable — archiving
 * drops a training out of Home's rotation and this page's default list
 * without touching `Session.trainingId` resolvability. A training with zero
 * sessions and no session currently in progress has nothing to protect, so
 * it's the one case that can be deleted outright (with undo).
 */
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  daysBetween,
  lastSessionForTraining,
  lastSportSessionForTraining,
  parseLocalDate,
  trainingBadge,
} from '../data/derive';
import { useGym } from '../data/store';
import { daysAgoLabel, formatDay, useLanguage } from '../data/i18n';
import { useDragReorder } from '../hooks/useDragReorder';
import { useTransient } from '../hooks/useTransient';
import { SPORT_KINDS, type Session, type SportSession, type Training, type TrainingKind } from '../data/types';
import { Sheet, Toast } from '../components/Sheet';
import { ArchiveIcon, ChevronRightIcon, GripIcon, PencilIcon, PlusIcon } from '../components/icons';
import { navigate } from '../router';
import './TrainingsPage.css';

/* -------------------------------------------------------------------------- */
/* Card body (shared between the real row and the drag ghost)                  */
/* -------------------------------------------------------------------------- */

function CardBody({
  training,
  sessions,
  sportSessions,
  now,
}: {
  training: Training;
  sessions: Session[];
  sportSessions: SportSession[];
  now: Date;
}) {
  const { t, locale } = useLanguage();
  const isSport = training.kind !== undefined && training.kind !== 'gym';

  let last: string | null = null;
  let count: string;
  if (isSport) {
    const latest = lastSportSessionForTraining(training.id, sportSessions);
    if (latest) last = `${formatDay(locale, parseLocalDate(latest.date), now)} · ${daysAgoLabel(t, daysBetween(parseLocalDate(latest.date), now))}`;
    const n = sportSessions.filter((s) => s.trainingId === training.id).length;
    count = `${n} ${t(n === 1 ? 'trainings.logsCountOne' : 'trainings.logsCountOther')}`;
  } else {
    const latest = lastSessionForTraining(training.id, sessions);
    if (latest) last = `${formatDay(locale, latest.startedAt, now)} · ${daysAgoLabel(t, daysBetween(new Date(latest.startedAt), now))}`;
    const n = training.exerciseIds.length;
    count = `${n} ${t(n === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}`;
  }

  return (
    <span className="tr-card-main-inner">
      <span className="tr-card-label">{training.label}</span>
      <span className="tr-card-sub">{`${count} · ${last ?? t('home.neverDone')}`}</span>
    </span>
  );
}

/** One training row: optional grip, badge, tappable body, edit button. */
function TrainingRow({
  training,
  sessions,
  sportSessions,
  now,
  grip,
  dragging,
  onPickIcon,
  onEdit,
  itemRef,
}: {
  training: Training;
  sessions: Session[];
  sportSessions: SportSession[];
  now: Date;
  grip?: ReactNode;
  dragging?: boolean;
  onPickIcon?: () => void;
  onEdit: () => void;
  itemRef?: (el: HTMLDivElement | null) => void;
}) {
  const { t } = useLanguage();
  const badge = trainingBadge(training);

  return (
    <div ref={itemRef} className={`tr-card${dragging ? ' tr-card-dragging' : ''}`}>
      {grip}
      {onPickIcon ? (
        <button type="button" className="tr-card-badge" aria-label={t('trainings.changeIconAria', { name: training.label })} onClick={onPickIcon}>
          {badge}
        </button>
      ) : (
        <span className="tr-card-badge" aria-hidden="true">
          {badge}
        </span>
      )}
      <button className="tr-card-main" onClick={() => navigate(`/trainings/${training.id}`)}>
        <CardBody training={training} sessions={sessions} sportSessions={sportSessions} now={now} />
        <ChevronRightIcon className="tr-card-chevron" />
      </button>
      <button type="button" className="tr-card-edit" aria-label={t('trainings.editAria', { name: training.label })} onClick={onEdit}>
        <PencilIcon />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                      */
/* -------------------------------------------------------------------------- */

/** Shared shell for the one-field forms below: an error slot, the fields, a submit in the footer. */
function FormSheet({
  title,
  formId,
  canSave,
  saving,
  error,
  onClose,
  onSubmit,
  children,
  after,
}: {
  title: string;
  formId: string;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  after?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button type="submit" form={formId} className="btn btn-primary btn-block" disabled={!canSave}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      }
    >
      <form id={formId} onSubmit={onSubmit}>
        {error && (
          <div className="form-error field" role="alert">
            {error}
          </div>
        )}
        {children}
      </form>
      {after}
    </Sheet>
  );
}

/** Runs a save, keeping the sheet open with the error when it fails. */
function useSave(onSaved: () => void, fallbackError: string) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (save: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await save();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : fallbackError);
      setSaving(false);
    }
  };
  return { saving, error, run };
}

function TrainingNameSheet({
  title,
  onClose,
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (name: string, kind: TrainingKind) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TrainingKind>('gym');
  const { saving, error, run } = useSave(onClose, t('trainings.couldNotSave'));
  const canSave = name.trim().length > 0 && !saving;

  return (
    <FormSheet
      title={title}
      formId="training-name-form"
      canSave={canSave}
      saving={saving}
      error={error}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void run(() => onSubmit(name.trim(), kind));
      }}
    >
      <div className="field">
        <label className="label" htmlFor="training-name">
          {t('common.name')}
        </label>
        <input
          id="training-name"
          className="input"
          type="text"
          required
          autoFocus
          value={name}
          autoCapitalize="words"
          autoCorrect="off"
          placeholder={t('trainings.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="training-kind">
          {t('trainings.kindLabel')}
        </label>
        <select id="training-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as TrainingKind)}>
          <option value="gym">{t('trainingKind.gym')}</option>
          {SPORT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`trainingKind.${k}`)}
            </option>
          ))}
        </select>
        <p className="hint">{t('trainings.kindHint')}</p>
      </div>
    </FormSheet>
  );
}

function TrainingEmojiSheet({
  initialEmoji = '',
  onClose,
  onSubmit,
}: {
  initialEmoji?: string;
  onClose: () => void;
  onSubmit: (emoji: string) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [emoji, setEmoji] = useState(initialEmoji);
  const { saving, error, run } = useSave(onClose, t('trainings.couldNotSave'));

  return (
    <FormSheet
      title={t('trainings.chooseIcon')}
      formId="training-emoji-form"
      canSave={!saving}
      saving={saving}
      error={error}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => onSubmit(emoji));
      }}
    >
      <div className="field">
        <label className="label" htmlFor="training-emoji">
          {t('trainings.icon')}
        </label>
        {/* No emoji placeholder: browsers don't dim color-emoji glyphs the way
            they dim placeholder text, so one would look identical to a real value. */}
        <input id="training-emoji" className="input tr-emoji-input" type="text" autoFocus value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        <p className="hint">{t('trainings.iconHint')}</p>
      </div>
    </FormSheet>
  );
}

/** Rename plus archive/unarchive. */
function TrainingEditSheet({
  training,
  onClose,
  onSave,
  onArchiveButtonClick,
}: {
  training: Training;
  onClose: () => void;
  onSave: (name: string) => Promise<unknown>;
  onArchiveButtonClick: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(training.label);
  const { saving, error, run } = useSave(onClose, t('trainings.couldNotSave'));
  const canSave = name.trim().length > 0 && !saving;

  return (
    <FormSheet
      title={t('trainings.editTraining')}
      formId="training-edit-form"
      canSave={canSave}
      saving={saving}
      error={error}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void run(() => onSave(name.trim()));
      }}
      after={
        <button type="button" className="btn btn-block tr-archive-btn" onClick={onArchiveButtonClick}>
          <ArchiveIcon />
          {training.archived ? t('trainings.unarchiveTraining') : t('trainings.archiveTraining')}
        </button>
      }
    >
      <div className="field">
        <label className="label" htmlFor="training-edit-name">
          {t('common.name')}
        </label>
        <input
          id="training-edit-name"
          className="input"
          type="text"
          required
          autoFocus
          value={name}
          autoCapitalize="words"
          autoCorrect="off"
          placeholder={t('trainings.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </FormSheet>
  );
}

/** Archive-or-delete branch — only offered for a training with no history. */
function ArchiveOrDeleteSheet({
  training,
  onClose,
  onArchive,
  onDelete,
}: {
  training: Training;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();

  return (
    <Sheet
      title={t('trainings.noSessionsYetTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            {t('trainings.deleteTraining')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onArchive}>
            {t('trainings.archiveTraining')}
          </button>
        </>
      }
    >
      <p className="sheet-text">{t('trainings.archiveOrDeleteMessage', { name: training.label })}</p>
    </Sheet>
  );
}

function ArchivedTrainingsSheet({
  trainings,
  sessions,
  sportSessions,
  now,
  onClose,
  onEdit,
}: {
  trainings: Training[];
  sessions: Session[];
  sportSessions: SportSession[];
  now: Date;
  onClose: () => void;
  onEdit: (training: Training) => void;
}) {
  const { t } = useLanguage();
  const ordered = [...trainings].sort((a, b) => a.order - b.order);

  return (
    <Sheet title={t('trainings.archivedTrainings')} onClose={onClose} full>
      <div className="tr-list">
        {ordered.length === 0 && <div className="empty">{t('trainings.noArchivedTrainings')}</div>}
        {ordered.map((training) => (
          <TrainingRow
            key={training.id}
            training={training}
            sessions={sessions}
            sportSessions={sportSessions}
            now={now}
            onEdit={() => onEdit(training)}
          />
        ))}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */

type ToastState = { message: string; actionLabel?: string; onAction?: () => void };

export function TrainingsPage() {
  const {
    trainings,
    sessions,
    sportSessions,
    active,
    status,
    addTraining,
    renameTraining,
    setTrainingEmoji,
    archiveTraining,
    deleteTraining,
    restoreTraining,
    reorderTrainings,
  } = useGym();
  const { t } = useLanguage();
  const now = new Date();

  // Only 'gym' trainings take part in Home's rotation and this page's drag
  // reorder — sport trainings are a separate, non-draggable list below.
  const isGym = (tr: Training) => (tr.kind ?? 'gym') === 'gym';
  const activeTrainings = useMemo(() => trainings.filter((tr) => !tr.archived && isGym(tr)), [trainings]);
  const sportTrainings = useMemo(() => trainings.filter((tr) => !tr.archived && !isGym(tr)), [trainings]);
  const archivedTrainings = useMemo(() => trainings.filter((tr) => tr.archived), [trainings]);

  const [order, setOrder] = useState<string[]>(() => activeTrainings.map((tr) => tr.id));

  // Re-sync only when the set of active ids actually changes (add/archive/
  // reorder-commit) — a rename touches `trainings` too, but must not disturb
  // an in-progress drag's local order.
  const activeIds = activeTrainings.map((tr) => tr.id).join(',');
  useEffect(() => {
    setOrder(activeIds.split(',').filter(Boolean));
  }, [activeIds]);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Training | null>(null);
  const [pickingEmojiFor, setPickingEmojiFor] = useState<Training | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deleteChoiceFor, setDeleteChoiceFor] = useState<Training | null>(null);
  const [toast, setToast] = useTransient<ToastState>(5000);

  const byId = useMemo(() => new Map(trainings.map((tr) => [tr.id, tr])), [trainings]);
  const ordered = order.map((id) => byId.get(id)).filter((tr): tr is Training => tr !== undefined);

  const drag = useDragReorder(order, setOrder, (next) => void reorderTrainings(next));
  const draggingTraining = drag.draggingId ? byId.get(drag.draggingId) : undefined;

  const archiveWithUndo = async (training: Training) => {
    await archiveTraining(training.id, true);
    setToast({
      message: t('trainings.archivedToast'),
      actionLabel: t('common.undo'),
      onAction: () => void archiveTraining(training.id, false),
    });
  };

  async function handleArchiveButtonClick(training: Training) {
    setEditing(null);

    if (training.archived) {
      await archiveTraining(training.id, false);
      setToast({ message: t('trainings.unarchivedToast') });
      return;
    }

    const hasHistory = isGym(training)
      ? sessions.some((s) => s.trainingId === training.id)
      : sportSessions.some((s) => s.trainingId === training.id);
    const hasActiveSession = active?.trainingId === training.id;
    if (!hasHistory && !hasActiveSession) {
      setDeleteChoiceFor(training);
      return;
    }

    await archiveWithUndo(training);
  }

  async function handleConfirmDelete(training: Training) {
    setDeleteChoiceFor(null);
    const deleted = await deleteTraining(training.id);
    if (!deleted) return;
    setToast({
      message: t('trainings.deletedToast'),
      actionLabel: t('common.undo'),
      onAction: () => void restoreTraining(deleted),
    });
  }

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  const gripFor = (training: Training) => (
    <button
      type="button"
      className="tr-card-grip"
      aria-label={t('trainings.reorderAria', { name: training.label })}
      onPointerDown={(e) => drag.onGripDown(training.id, e)}
      onPointerMove={drag.onGripMove}
      onPointerUp={drag.onGripUp}
      onPointerCancel={drag.onGripUp}
    >
      <GripIcon />
    </button>
  );

  return (
    <div className="page">
      <header className="page-header tr-header">
        <div>
          <h1 className="page-title">{t('trainings.title')}</h1>
          <div className="page-sub">{t('trainings.subtitle')}</div>
        </div>
        <div className="tr-header-actions">
          {archivedTrainings.length > 0 && (
            <button type="button" className="icon-btn icon-btn-filled" aria-label={t('trainings.archivedTrainings')} onClick={() => setArchivedOpen(true)}>
              <ArchiveIcon />
            </button>
          )}
          <button type="button" className="icon-btn icon-btn-filled tr-add-btn" aria-label={t('trainings.addTrainingDay')} onClick={() => setAdding(true)}>
            <PlusIcon />
          </button>
        </div>
      </header>

      <div className="tr-list">
        {ordered.length === 0 && (
          <div className="empty">
            {t('trainings.emptyMain')}
            {archivedTrainings.length > 0 && t('trainings.emptyArchivedHint', { count: archivedTrainings.length })}
          </div>
        )}

        {ordered.map((training) => (
          <TrainingRow
            key={training.id}
            itemRef={drag.setItemRef(training.id)}
            training={training}
            sessions={sessions}
            sportSessions={sportSessions}
            now={now}
            grip={gripFor(training)}
            dragging={drag.draggingId === training.id}
            onPickIcon={() => setPickingEmojiFor(training)}
            onEdit={() => setEditing(training)}
          />
        ))}

        <button className="btn btn-tinted btn-block" onClick={() => setAdding(true)}>
          <PlusIcon />
          {t('trainings.addTrainingDay')}
        </button>
      </div>

      {sportTrainings.length > 0 && (
        <div className="section tr-sports">
          <div className="section-title">{t('trainings.otherActivities')}</div>
          <p className="hint tr-sports-hint">{t('trainings.otherActivitiesHint')}</p>
          <div className="tr-list">
            {sportTrainings.map((training) => (
              <TrainingRow
                key={training.id}
                training={training}
                sessions={sessions}
                sportSessions={sportSessions}
                now={now}
                onPickIcon={() => setPickingEmojiFor(training)}
                onEdit={() => setEditing(training)}
              />
            ))}
          </div>
        </div>
      )}

      {drag.ghost &&
        draggingTraining &&
        createPortal(
          <div className="tr-card tr-card-ghost" style={{ top: drag.ghost.top, left: drag.ghost.left, width: drag.ghost.width, height: drag.ghost.height }}>
            <span className="tr-card-grip" aria-hidden="true">
              <GripIcon />
            </span>
            <span className="tr-card-badge" aria-hidden="true">
              {trainingBadge(draggingTraining)}
            </span>
            <span className="tr-card-main">
              <CardBody training={draggingTraining} sessions={sessions} sportSessions={sportSessions} now={now} />
              <ChevronRightIcon className="tr-card-chevron" />
            </span>
            <span className="tr-card-edit" aria-hidden="true">
              <PencilIcon />
            </span>
          </div>,
          document.body,
        )}

      {adding && <TrainingNameSheet title={t('trainings.newTrainingDay')} onClose={() => setAdding(false)} onSubmit={(name, kind) => addTraining(name, kind)} />}

      {editing && (
        <TrainingEditSheet
          training={editing}
          onClose={() => setEditing(null)}
          onSave={(name) => renameTraining(editing.id, name)}
          onArchiveButtonClick={() => void handleArchiveButtonClick(editing)}
        />
      )}

      {pickingEmojiFor && (
        <TrainingEmojiSheet
          initialEmoji={pickingEmojiFor.emoji ?? ''}
          onClose={() => setPickingEmojiFor(null)}
          onSubmit={(emoji) => setTrainingEmoji(pickingEmojiFor.id, emoji)}
        />
      )}

      {deleteChoiceFor && (
        <ArchiveOrDeleteSheet
          training={deleteChoiceFor}
          onClose={() => setDeleteChoiceFor(null)}
          onArchive={() => {
            setDeleteChoiceFor(null);
            void archiveWithUndo(deleteChoiceFor);
          }}
          onDelete={() => void handleConfirmDelete(deleteChoiceFor)}
        />
      )}

      {archivedOpen && (
        <ArchivedTrainingsSheet
          trainings={archivedTrainings}
          sessions={sessions}
          sportSessions={sportSessions}
          now={now}
          onClose={() => setArchivedOpen(false)}
          onEdit={(training) => {
            setArchivedOpen(false);
            setEditing(training);
          }}
        />
      )}

      {toast && <Toast message={toast.message} actionLabel={toast.actionLabel} onAction={toast.onAction} />}
    </div>
  );
}
