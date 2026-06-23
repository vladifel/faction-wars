/** Stateless string helpers - label truncation & conversion tools. */

/** Truncate to `max` chars with an ellipsis. Safe on short strings. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}

/** Human-readable countdown from now until an epoch-ms deadline. */
export function formatRemaining(turnEndTime: number, now = Date.now()): string {
  const ms = turnEndTime - now;
  if (ms <= 0) return 'resolving...';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

/** Title-case a single token (used for faction labels etc). */
export function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
