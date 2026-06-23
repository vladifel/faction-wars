/**
 * Aggregated funnel telemetry.
 *
 * Counters are plain integer STRINGs incremented atomically. Failures here must
 * never break gameplay, so writes are best-effort.
 */

import { redis } from '@devvit/web/server';
import type { FunnelStep } from '../shared/types';
import { keys } from './keys';

/** Best-effort increment of a funnel counter. Swallows errors. */
export async function incrFunnel(
  subredditId: string,
  step: FunnelStep,
  by = 1,
): Promise<void> {
  try {
    await redis.incrBy(keys.metricFunnel(subredditId, step), by);
  } catch {
    // Telemetry is non-critical; never surface to gameplay.
  }
}

/** Read all funnel counters for the dashboard. */
export async function readFunnel(
  subredditId: string,
): Promise<Record<FunnelStep, number>> {
  const steps: FunnelStep[] = [
    'post_view',
    'gate_enter',
    'vote_cast',
    'clue_dispatched',
    'faction_assigned',
  ];
  const values = await Promise.all(
    steps.map((s) => redis.get(keys.metricFunnel(subredditId, s))),
  );
  const out = {} as Record<FunnelStep, number>;
  steps.forEach((s, i) => {
    out[s] = parseInt(values[i] ?? '0', 10);
  });
  return out;
}
