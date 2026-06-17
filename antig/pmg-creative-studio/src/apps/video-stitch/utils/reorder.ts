/**
 * reorder — immutable array move for the Arrange filmstrip.
 *
 * Tested independently of @dnd-kit so the reorder logic has coverage without
 * driving the drag library. dnd-kit's onDragEnd calls arrayMove(order, from, to).
 */

/** Return a new array with the item at `from` moved to `to`. Out-of-range → copy. */
export function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = arr.slice();
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
