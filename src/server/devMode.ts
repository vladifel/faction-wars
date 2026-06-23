/**
 * Playtest detection.
 *
 * `devvit playtest` deploys 4-segment versions (e.g. `0.0.1.8`); published
 * builds are 3-segment (`0.0.1`). We use that to enable solo-testing overrides
 * that must NEVER apply in production (always-active faction + auto-trust).
 */

import { context } from '@devvit/web/server';

/** True only under `devvit playtest`, never for a published app. */
export function isDevPlaytest(): boolean {
  const v = (context as { appVersion?: string }).appVersion ?? '';
  return v.split('.').length >= 4;
}
