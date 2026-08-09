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
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  daysBetween,
  formatDate,
  formatShortLocalDate,
  lastSessionForTraining,
  lastSportSessionForTraining,
  parseLocalDate,
} from '../data/derive';
import { useGym } from '../data/store';
import { daysAgoLabel, useLanguage } from '../data/i18n';
import { useDragReorder } from '../hooks/useDragReorder';
import { SPORT_KINDS, type Session, type SportSession, type Training, type TrainingKind } from '../data/types';
import { Sheet, Toast } from '../components/Sheet';
import {
  ArchiveIcon,
  ChevronRightIcon,
  GripIcon,
  PencilIcon,
  PlusIcon,
} from '../components/icons';
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
  const { t } = useLanguage();

  if (training.kind && training.kind !== 'gym') {
    const last = lastSportSessionForTraining(training.id, sportSessions);
    const count = sportSessions.filter((s) => s.trainingId === training.id).length;

    return (
      <span className="tr-card-main-inner">
        <span className="tr-card-label">{training.label}</span>
        <span className="tr-card-sub">
          <span>
            {last
              ? `${formatShortLocalDate(last.date)} · ${daysAgoLabel(t, daysBetween(parseLocalDate(last.date), now))}`
              : t('home.neverDone')}
          </span>
          <span className="sep">·</span>
          <span>
            {count} {t(count === 1 ? 'trainings.logsCountOne' : 'trainings.logsCountOther')}
          </span>
        </span>
      </span>
    );
  }

  const last = lastSessionForTraining(training.id, sessions);
  const count = training.exerciseIds.length;

  return (
    <span className="tr-card-main-inner">
      <span className="tr-card-label">{training.label}</span>
      <span className="tr-card-sub">
        <span>
          {last
            ? `${formatDate(last.startedAt)} · ${daysAgoLabel(t, daysBetween(new Date(last.startedAt), now))}`
            : t('home.neverDone')}
        </span>
        <span className="sep">·</span>
        <span>
          {count} {t(count === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
        </span>
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Add sheet                                                                   */
/* -------------------------------------------------------------------------- */

const NAME_FORM_ID = 'training-name-form';

function TrainingNameSheet({
  title,
  initialName = '',
  onClose,
  onSubmit,
}: {
  title: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string, kind: TrainingKind) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<TrainingKind>('gym');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim(), kind);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('trainings.couldNotSave'));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button type="submit" form={NAME_FORM_ID} className="btn btn-primary btn-block" disabled={!canSave}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      }
    >
      <form id={NAME_FORM_ID} className="tr-name-form" onSubmit={handleSubmit}>
        {error && (
          <div className="tr-name-error" role="alert">
            {error}
          </div>
        )}
        <div className="tr-name-field">
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
        <div className="tr-name-field">
          <label className="label" htmlFor="training-kind">
            {t('trainings.kindLabel')}
          </label>
          <select
            id="training-kind"
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as TrainingKind)}
          >
            <option value="gym">{t('trainingKind.gym')}</option>
            {SPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`trainingKind.${k}`)}
              </option>
            ))}
          </select>
          <p className="tr-emoji-hint">{t('trainings.kindHint')}</p>
        </div>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Icon sheet                                                                  */
/* -------------------------------------------------------------------------- */

const EMOJI_FORM_ID = 'training-emoji-form';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(emoji);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('trainings.couldNotSave'));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={t('trainings.chooseIcon')}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form={EMOJI_FORM_ID}
          className="btn btn-primary btn-block"
          disabled={saving}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      }
    >
      <form id={EMOJI_FORM_ID} className="tr-name-form" onSubmit={handleSubmit}>
        {error && (
          <div className="tr-name-error" role="alert">
            {error}
          </div>
        )}
        <div className="tr-name-field">
          <label className="label" htmlFor="training-emoji">
            {t('trainings.icon')}
          </label>
          {/* No emoji placeholder: browsers don't dim color-emoji glyphs the way
              they dim placeholder text, so one would look identical to a real value. */}
          <input
            id="training-emoji"
            className="input tr-emoji-input"
            type="text"
            autoFocus
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />
          <p className="tr-emoji-hint">{t('trainings.iconHint')}</p>
        </div>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit sheet — rename plus archive/unarchive                                 */
/* -------------------------------------------------------------------------- */

const EDIT_FORM_ID = 'training-edit-form';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('trainings.couldNotSave'));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={t('trainings.editTraining')}
      onClose={onClose}
      footer={
        <button type="submit" form={EDIT_FORM_ID} className="btn btn-primary btn-block" disabled={!canSave}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      }
    >
      <form id={EDIT_FORM_ID} className="tr-name-form" onSubmit={handleSubmit}>
        {error && (
          <div className="tr-name-error" role="alert">
            {error}
          </div>
        )}
        <div className="tr-name-field">
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
      </form>

      <button type="button" className="btn btn-ghost btn-block tr-archive-btn" onClick={onArchiveButtonClick}>
        <ArchiveIcon />
        {training.archived ? t('trainings.unarchiveTraining') : t('trainings.archiveTraining')}
      </button>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Archive-or-delete branch — only offered for a training with no history      */
/* -------------------------------------------------------------------------- */

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
          <button type="button" className="btn btn-danger btn-block" onClick={onDelete}>
            {t('trainings.deleteTraining')}
          </button>
          <button type="button" className="btn btn-primary btn-block" onClick={onArchive}>
            {t('trainings.archiveTraining')}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-dim)', fontSize: 15 }}>
        {t('trainings.archiveOrDeleteMessage', { name: training.label })}
      </p>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Archived trainings list                                                    */
/* -------------------------------------------------------------------------- */

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
          <div key={training.id} className="tr-card">
            <span className="tr-card-emoji" aria-hidden="true">
              {training.emoji ?? training.label.charAt(0).toUpperCase()}
            </span>

            <button className="tr-card-main" onClick={() => navigate(`/trainings/${training.id}`)}>
              <CardBody training={training} sessions={sessions} sportSessions={sportSessions} now={now} />
              <ChevronRightIcon className="tr-card-chevron" />
            </button>

            <button
              type="button"
              className="tr-card-edit"
              aria-label={t('trainings.editAria', { name: training.label })}
              onClick={() => onEdit(training)}
            >
              <PencilIcon />
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */

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
  const isGym = (t: Training) => (t.kind ?? 'gym') === 'gym';
  const activeTrainings = useMemo(() => trainings.filter((t) => !t.archived && isGym(t)), [trainings]);
  const sportTrainings = useMemo(
    () => trainings.filter((t) => !t.archived && !isGym(t)),
    [trainings],
  );
  const archivedTrainings = useMemo(() => trainings.filter((t) => t.archived), [trainings]);

  const [order, setOrder] = useState<string[]>(() => activeTrainings.map((t) => t.id));

  // Re-sync only when the set of active ids actually changes (add/archive/
  // reorder-commit) — a rename touches `trainings` too, but must not disturb
  // an in-progress drag's local order.
  const activeIds = activeTrainings.map((t) => t.id).join(',');
  useEffect(() => {
    setOrder(activeIds.split(',').filter(Boolean));
  }, [activeIds]);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Training | null>(null);
  const [pickingEmojiFor, setPickingEmojiFor] = useState<Training | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deleteChoiceFor, setDeleteChoiceFor] = useState<Training | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const byId = useMemo(() => new Map(trainings.map((t) => [t.id, t])), [trainings]);
  const ordered = order.map((id) => byId.get(id)).filter((t): t is Training => t !== undefined);

  const drag = useDragReorder(order, setOrder, (next) => void reorderTrainings(next));
  const draggingTraining = drag.draggingId ? byId.get(drag.draggingId) : undefined;

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

    await archiveTraining(training.id, true);
    setToast({
      message: t('trainings.archivedToast'),
      actionLabel: t('common.undo'),
      onAction: () => void archiveTraining(training.id, false),
    });
  }

  async function handleConfirmArchive(training: Training) {
    setDeleteChoiceFor(null);
    await archiveTraining(training.id, true);
    setToast({
      message: t('trainings.archivedToast'),
      actionLabel: t('common.undo'),
      onAction: () => void archiveTraining(training.id, false),
    });
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

  if (status === 'loading') return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <header className="page-header tr-header">
        <div>
          <h1 className="page-title">{t('trainings.title')}</h1>
          <div className="page-sub">{t('trainings.subtitle')}</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('trainings.archivedTrainings')}
          onClick={() => setArchivedOpen(true)}
        >
          <ArchiveIcon />
        </button>
      </header>

      <div className="tr-list">
        {ordered.length === 0 && (
          <div className="empty">
            {t('trainings.emptyMain')}
            {archivedTrainings.length > 0 &&
              t('trainings.emptyArchivedHint', { count: archivedTrainings.length })}
          </div>
        )}

        {ordered.map((training) => (
          <div
            key={training.id}
            ref={drag.setItemRef(training.id)}
            className={`tr-card${drag.draggingId === training.id ? ' tr-card-dragging' : ''}`}
          >
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

            <button
              type="button"
              className="tr-card-emoji"
              aria-label={t('trainings.changeIconAria', { name: training.label })}
              onClick={() => setPickingEmojiFor(training)}
            >
              {training.emoji ?? training.label.charAt(0).toUpperCase()}
            </button>

            <button className="tr-card-main" onClick={() => navigate(`/trainings/${training.id}`)}>
              <CardBody training={training} sessions={sessions} sportSessions={sportSessions} now={now} />
              <ChevronRightIcon className="tr-card-chevron" />
            </button>

            <button
              type="button"
              className="tr-card-edit"
              aria-label={t('trainings.editAria', { name: training.label })}
              onClick={() => setEditing(training)}
            >
              <PencilIcon />
            </button>
          </div>
        ))}

        <button className="tr-add-card tr-add-card-compact" onClick={() => setAdding(true)}>
          <PlusIcon />
          {t('trainings.addTrainingDay')}
        </button>
      </div>

      {sportTrainings.length > 0 && (
        <div className="section">
          <div className="section-title">{t('trainings.otherActivities')}</div>
          <p className="tr-emoji-hint" style={{ marginTop: 0 }}>
            {t('trainings.otherActivitiesHint')}
          </p>
          <div className="tr-list">
            {sportTrainings.map((training) => (
              <div key={training.id} className="tr-card">
                <button
                  type="button"
                  className="tr-card-emoji"
                  aria-label={t('trainings.changeIconAria', { name: training.label })}
                  onClick={() => setPickingEmojiFor(training)}
                >
                  {training.emoji ?? training.label.charAt(0).toUpperCase()}
                </button>

                <button className="tr-card-main" onClick={() => navigate(`/trainings/${training.id}`)}>
                  <CardBody training={training} sessions={sessions} sportSessions={sportSessions} now={now} />
                  <ChevronRightIcon className="tr-card-chevron" />
                </button>

                <button
                  type="button"
                  className="tr-card-edit"
                  aria-label={t('trainings.editAria', { name: training.label })}
                  onClick={() => setEditing(training)}
                >
                  <PencilIcon />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {drag.ghost &&
        draggingTraining &&
        createPortal(
          <div
            className="tr-card tr-card-ghost"
            style={{
              top: drag.ghost.top,
              left: drag.ghost.left,
              width: drag.ghost.width,
              height: drag.ghost.height,
            }}
          >
            <span className="tr-card-grip" aria-hidden="true">
              <GripIcon />
            </span>
            <span className="tr-card-emoji" aria-hidden="true">
              {draggingTraining.emoji ?? draggingTraining.label.charAt(0).toUpperCase()}
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

      {adding && (
        <TrainingNameSheet
          title={t('trainings.newTrainingDay')}
          onClose={() => setAdding(false)}
          onSubmit={(name, kind) => addTraining(name, kind)}
        />
      )}

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
          onArchive={() => void handleConfirmArchive(deleteChoiceFor)}
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

      {toast && (
        <Toast message={toast.message} actionLabel={toast.actionLabel} onAction={toast.onAction} />
      )}
    </div>
  );
}
