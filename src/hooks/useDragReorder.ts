import { useRef, useState, type PointerEvent } from 'react';

export type DragGhost = { top: number; left: number; width: number; height: number };

/**
 * Vertical drag-to-reorder over a list of string ids. Used for both the
 * Trainings rotation and a training's own exercise order — the algorithm has
 * no idea what the ids refer to.
 *
 * Reorders `order` live as the grip is dragged, comparing the dragged item's
 * centre against each neighbour's midpoint and swapping one slot at a time —
 * cheap, and correct regardless of how tall any individual item is. The
 * dragged item itself is rendered by the caller as a fixed-position ghost
 * that tracks the pointer (via `ghost`); the row in the list just dims in
 * place to mark its current slot (via `draggingId`).
 */
export function useDragReorder(
  order: string[],
  setOrder: (next: string[]) => void,
  onCommit: (ids: string[]) => void,
) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const dragMeta = useRef<{ id: string; grabOffset: number; height: number } | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);

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
