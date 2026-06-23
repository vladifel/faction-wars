/** Pick 1–2 random tile ids for neon border sputter (eye-safe cap). */
export function pickFlickerTileIds(tileIds: readonly string[]): string[] {
  if (tileIds.length === 0) return [];
  const count = Math.random() < 0.55 ? 1 : Math.min(2, tileIds.length);
  const pool = [...tileIds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

/** Toggle sputter animation on `.border-glow--live` without full re-render. */
export function syncBorderGlowLive(activeIds: readonly string[]): void {
  const active = new Set(activeIds);
  for (const glow of Array.from(document.querySelectorAll<HTMLElement>('.border-glow'))) {
    const tile = glow.closest<HTMLElement>('[data-tile-id]');
    const id = tile?.dataset.tileId;
    const live = id ? active.has(id) : false;
    glow.classList.toggle('border-glow--live', live);
  }
}
