/**
 * Schema migration middleware.
 *
 * Every JSON object persisted by the app carries a top-level `schema_version`.
 * When the backend reads an object whose version is older than the runtime
 * SCHEMA_VERSION, it is passed through `migrate()` which injects missing
 * parameters with safe defaults before the object reaches the execution
 * context. This lets us ship live updates without corrupting active games.
 */

import {
  SCHEMA_VERSION,
  type GlobalStats,
  type SubConfig,
  type ThemeLabels,
} from '../shared/types';
import { defaultTheme, resolveThemeTokens } from '../shared/theme';

/** A migration step transforms an object from `from` to `from + 1`. */
type MigrationStep = (obj: Record<string, unknown>) => Record<string, unknown>;

/** Ordered migration steps keyed by the version they upgrade FROM. */
const STEPS: Record<number, MigrationStep> = {
  1: (obj) => {
    // SubConfig v1 → v2: Arcade Pop labels; drop legacy dark palette colors.
    if (typeof obj.subredditId === 'string' && obj.theme && typeof obj.theme === 'object') {
      const theme = obj.theme as Record<string, unknown>;
      const labels = (theme.labels ?? {}) as Partial<ThemeLabels>;
      return {
        ...obj,
        theme: resolveThemeTokens({
          subredditId: obj.subredditId as string,
          theme: { labels },
        } as Partial<SubConfig>),
        schema_version: 2,
      };
    }
    return { ...obj, schema_version: 2 };
  },
  2: (obj) => {
    // SubConfig v2 → v3: reset persisted dark Reddit palette to Arcade Pop colors.
    if (typeof obj.subredditId === 'string' && obj.theme && typeof obj.theme === 'object') {
      return {
        ...obj,
        theme: resolveThemeTokens(obj as Partial<SubConfig>),
        schema_version: 3,
      };
    }
    return { ...obj, schema_version: 3 };
  },
};

/** Upgrade an arbitrary persisted JSON object to the current schema version. */
export function migrate<T extends { schema_version?: number }>(
  raw: T,
): { value: T; changed: boolean } {
  let current = Number(raw?.schema_version ?? 0);
  let obj = raw as unknown as Record<string, unknown>;
  let changed = false;

  while (current < SCHEMA_VERSION) {
    const step = STEPS[current];
    if (!step) {
      obj = { ...obj, schema_version: current + 1 };
    } else {
      obj = step(obj);
    }
    current = Number(obj.schema_version ?? current + 1);
    changed = true;
  }

  return { value: obj as unknown as T, changed };
}

/** Parse a JSON string from Redis, migrate it, and return the typed object. */
export function parseAndMigrate<T extends { schema_version?: number }>(
  json: string | undefined | null,
): { value: T; changed: boolean } | null {
  if (json == null) return null;
  const parsed = JSON.parse(json) as T;
  return migrate<T>(parsed);
}

// ---------------------------------------------------------------------------
// Default factories - used by AppInstall seeding and field backfill.
// ---------------------------------------------------------------------------

export function defaultSubConfig(subredditId: string): SubConfig {
  return {
    schema_version: SCHEMA_VERSION,
    subredditId,
    theme: defaultTheme(),
    pacing: {
      turnDurationSeconds: 6 * 60 * 60, // 6 hours per turn
      vetoThreshold: 0.2,
      snapshotIntervalSeconds: 10,
    },
    words: {
      lore: [],
    },
    trust: {
      minAccountAgeDays: 30,
      minKarma: 10,
    },
  };
}

export function defaultGlobalStats(userId: string, username: string): GlobalStats {
  return {
    schema_version: SCHEMA_VERSION,
    userId,
    username,
    wins: 0,
    losses: 0,
    votesCast: 0,
    cluesDispatched: 0,
    currentStreak: 0,
    bestStreak: 0,
    trophies: [],
  };
}
