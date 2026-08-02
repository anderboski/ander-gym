/**
 * Trainings — SPEC §5.3.
 *
 * Training days are entirely user-managed: create as many as you like, rename
 * anytime (the id never changes, so session history stays attributed
 * correctly), and reorder by dragging the grip on the left of a card — the
 * rotation Home uses is exactly this order. Trainings are never deletable,
 * which keeps `Session.trainingId` always resolvable.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { daysBetween, formatDate, formatDaysAgo, lastSessionForTraining } from '../data/derive';
import { useGym } from '../data/store';
import type { Session, Training } from '../data/types';
import { Sheet } from '../components/Sheet';
import { ChevronRightIcon, GripIcon, PencilIcon, PlusIcon } from '../components/icons';
import { navigate } from '../router';
import './TrainingsPage.css';

/* -------------------------------------------------------------------------- */
/* Drag-to-reorder                                                             */
/* -------------------------------------------------------------------------- */

type Ghost = { top: number; left: number; width: number; height: number };

/**
 * Reorders `order` live as the grip is dragged, comparing the dragged card's
 * centre against each neighbour's midpoint and swapping one slot at a time —
 * cheap, and correct regardless of how tall any individual card is. The
 * dragged card itself is rendered by a fixed-position ghost that tracks the
 * pointer; the row in the list just dims in place to mark its current slot.
 */
function useTrainingDrag(order: string[], setOrder: (next: string[]) => void, onCommit: (ids: string[]) => void) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const dragMeta = useRef<{ id: string; grabOffset: number; height: number } | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  function setItemRef(id: string) {
    return (el: HTMLDivElement | null) => {
      if (el) itemRefs.current.set(id, el);
      else itemRefs.current.delete(id);
    };
  }

  function onGripDown(id: string, e: PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    const card = itemRefs.current.get(id);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragMeta.current = { id, grabOffset: e.clientY - rect.top, height: rect.height };
    setGhost({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setDraggingId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onGripMove(e: PointerEvent<HTMLButtonElement>) {
    const meta = dragMeta.current;
    if (!meta) return;
    const top = e.clientY - meta.grabOffset;
    setGhost((g) => (g ? { ...g, top } : g));

    const ids = orderRef.current;
    const idx = ids.indexOf(meta.id);
    const draggedCenter = top + meta.height / 2;
    const current = ids[idx];
    if (current === undefined) return;

    const aboveId = idx > 0 ? ids[idx - 1] : undefined;
    if (aboveId !== undefined) {
      const above = itemRefs.current.get(aboveId)?.getBoundingClientRect();
      if (above && draggedCenter < above.top + above.height / 2) {
        const next = [...ids];
        next[idx - 1] = current;
        next[idx] = aboveId;
        setOrder(next);
        return;
      }
    }

    const belowId = idx < ids.length - 1 ? ids[idx + 1] : undefined;
    if (belowId !== undefined) {
      const below = itemRefs.current.get(belowId)?.getBoundingClientRect();
      if (below && draggedCenter > below.top + below.height / 2) {
        const next = [...ids];
        next[idx + 1] = current;
        next[idx] = belowId;
        setOrder(next);
      }
    }
  }

  function onGripUp() {
    if (!dragMeta.current) return;
    dragMeta.current = null;
    setDraggingId(null);
    setGhost(null);
    onCommit(orderRef.current);
  }

  return { draggingId, ghost, setItemRef, onGripDown, onGripMove, onGripUp };
}

/* -------------------------------------------------------------------------- */
/* Card body (shared between the real row and the drag ghost)                  */
/* -------------------------------------------------------------------------- */

function CardBody({ training, sessions, now }: { training: Training; sessions: Session[]; now: Date }) {
  const last = lastSessionForTraining(training.id, sessions);
  const count = training.exerciseIds.length;

  return (
    <span className="tr-card-main-inner">
      <span className="tr-card-label">{training.label}</span>
      <span className="tr-card-sub">
        <span>
          {last
            ? `${formatDate(last.startedAt)} · ${formatDaysAgo(daysBetween(new Date(last.startedAt), now))}`
            : 'Never done'}
        </span>
        <span className="sep">·</span>
        <span>
          {count} {count === 1 ? 'exercise' : 'exercises'}
        </span>
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Add / rename sheet                                                          */
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
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button type="submit" form={NAME_FORM_ID} className="btn btn-primary btn-block" disabled={!canSave}>
          {saving ? 'Saving…' : 'Save'}
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
            Name
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
            placeholder="e.g. Push day"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */

export function TrainingsPage() {
  const { trainings, sessions, status, addTraining, renameTraining, reorderTrainings } = useGym();
  const now = new Date();

  const [order, setOrder] = useState<string[]>(() => trainings.map((t) => t.id));

  // Re-sync only when the set of ids actually changes (add/reorder-commit) —
  // a rename touches `trainings` too, but must not disturb an in-progress
  // drag's local order.
  const ids = trainings.map((t) => t.id).join(',');
  useEffect(() => {
    setOrder(ids.split(',').filter(Boolean));
  }, [ids]);

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Training | null>(null);

  const byId = useMemo(() => new Map(trainings.map((t) => [t.id, t])), [trainings]);
  const ordered = order.map((id) => byId.get(id)).filter((t): t is Training => t !== undefined);

  const drag = useTrainingDrag(order, setOrder, (next) => void reorderTrainings(next));
  const draggingTraining = drag.draggingId ? byId.get(drag.draggingId) : undefined;

  if (status === 'loading') return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Trainings</h1>
        <div className="page-sub">Your training days, in rotation order</div>
      </div>

      <div className="tr-list">
        {ordered.length === 0 && (
          <div className="empty">No training days yet — add one below to get started.</div>
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
              aria-label={`Reorder ${training.label}`}
              onPointerDown={(e) => drag.onGripDown(training.id, e)}
              onPointerMove={drag.onGripMove}
              onPointerUp={drag.onGripUp}
              onPointerCancel={drag.onGripUp}
            >
              <GripIcon />
            </button>

            <button className="tr-card-main" onClick={() => navigate(`/trainings/${training.id}`)}>
              <CardBody training={training} sessions={sessions} now={now} />
              <ChevronRightIcon className="tr-card-chevron" />
            </button>

            <button
              type="button"
              className="tr-card-edit"
              aria-label={`Rename ${training.label}`}
              onClick={() => setRenaming(training)}
            >
              <PencilIcon />
            </button>
          </div>
        ))}

        <button className="tr-add-card" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add training day
        </button>
      </div>

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
            <span className="tr-card-main">
              <CardBody training={draggingTraining} sessions={sessions} now={now} />
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
          title="New training day"
          onClose={() => setAdding(false)}
          onSubmit={(name) => addTraining(name)}
        />
      )}

      {renaming && (
        <TrainingNameSheet
          title="Rename training day"
          initialName={renaming.label}
          onClose={() => setRenaming(null)}
          onSubmit={(name) => renameTraining(renaming.id, name)}
        />
      )}
    </div>
  );
}
