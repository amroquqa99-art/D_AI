/** Process-local owner ordering for the native Director wake coordinator. */

/**
 * Resume after the last successfully admitted owner in stable identity order.
 * Removing that owner preserves its position; new owners join the same cycle.
 * The caller advances the cursor only after a wake is successfully enqueued.
 * @param owners - Current live owners, without changing their registry order.
 * @param lastAdmittedOwnerId - Process-local cursor; omit for the first scan.
 * @returns Frozen owner list, rotated after the cursor and wrapped at the end.
 */
export function orderDirectorOwnersForFairness<T extends { readonly id: string }>(
  owners: readonly T[],
  lastAdmittedOwnerId?: string,
): readonly T[] {
  const ordered = [...owners].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  if (lastAdmittedOwnerId === undefined) return Object.freeze(ordered)

  const next = ordered.findIndex(owner => owner.id > lastAdmittedOwnerId)
  if (next <= 0) return Object.freeze(ordered)
  return Object.freeze([...ordered.slice(next), ...ordered.slice(0, next)])
}
