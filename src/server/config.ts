/**
 * Subreddit configuration service.
 *
 * Reads `config:subreddit:{id}` (migrating older payloads on the fly) and seeds
 * a default config the first time the app runs in a subreddit.
 */

import { redis } from '@devvit/web/server';
import type { SubConfig } from '../shared/types';
import { sanitizeLoreWords } from '../shared/validators';
import { keys } from './keys';
import { defaultSubConfig, migrate, parseAndMigrate } from './migrations';

function withSanitizedWords(config: SubConfig): { config: SubConfig; changed: boolean } {
  const { words, changed } = sanitizeLoreWords(config.words.lore);
  if (!changed) return { config, changed: false };
  return { config: { ...config, words: { lore: words } }, changed: true };
}

/**
 * Fetch the active config for a subreddit. Seeds a default when absent and
 * writes back migrated payloads when the schema version advanced.
 */
export async function getSubConfig(subredditId: string): Promise<SubConfig> {
  const raw = await redis.get(keys.config(subredditId));
  const parsed = parseAndMigrate<SubConfig>(raw);

  if (!parsed) {
    const seeded = defaultSubConfig(subredditId);
    await redis.set(keys.config(subredditId), JSON.stringify(seeded));
    return seeded;
  }

  let config = parsed.value;
  let changed = parsed.changed;

  const sanitized = withSanitizedWords(config);
  if (sanitized.changed) {
    config = sanitized.config;
    changed = true;
  }

  if (changed) {
    await redis.set(keys.config(subredditId), JSON.stringify(config));
  }
  return config;
}

/** Persist a full config object. */
export async function writeSubConfig(config: SubConfig): Promise<void> {
  const sanitized = withSanitizedWords(migrate(config).value);
  await redis.set(keys.config(sanitized.config.subredditId), JSON.stringify(sanitized.config));
}
