/**
 * In-memory stand-in for `@devvit/web/server`.
 *
 * Implements just the slice of the Redis/Reddit/Realtime/context surface the
 * backend actually calls (see grep of `redis.*` in src/server). Tests import the
 * real services unchanged; vitest aliases this file in for the SDK.
 */

type ZSet = Map<string, number>;
type Hash = Map<string, string>;

interface Store {
  str: Map<string, string>;
  hash: Map<string, Hash>;
  zset: Map<string, ZSet>;
}

const store: Store = {
  str: new Map(),
  hash: new Map(),
  zset: new Map(),
};

function getHash(key: string): Hash {
  let h = store.hash.get(key);
  if (!h) {
    h = new Map();
    store.hash.set(key, h);
  }
  return h;
}

function getZSet(key: string): ZSet {
  let z = store.zset.get(key);
  if (!z) {
    z = new Map();
    store.zset.set(key, z);
  }
  return z;
}

interface SetOptions {
  nx?: boolean;
  expiration?: Date;
}

interface ZRangeOptions {
  by?: 'rank' | 'score' | 'lex';
  reverse?: boolean;
}

interface ZMember {
  member: string;
  score: number;
}

interface Txn {
  multi(): Promise<void>;
  hSet(key: string, fields: Record<string, string>): Promise<void>;
  incrBy(key: string, by: number): Promise<void>;
  exec(): Promise<unknown[] | null>;
}

export const redis = {
  async get(key: string): Promise<string | undefined> {
    return store.str.get(key);
  },

  async set(key: string, value: string, opts?: SetOptions): Promise<string | null> {
    if (opts?.nx && store.str.has(key)) return null;
    store.str.set(key, value);
    return 'OK';
  },

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) {
      store.str.delete(k);
      store.hash.delete(k);
      store.zset.delete(k);
    }
  },

  async expire(_key: string, _seconds: number): Promise<void> {
    // TTL is irrelevant to logic correctness in tests.
  },

  async incrBy(key: string, by: number): Promise<number> {
    const next = (parseInt(store.str.get(key) ?? '0', 10) || 0) + by;
    store.str.set(key, String(next));
    return next;
  },

  async hGet(key: string, field: string): Promise<string | undefined> {
    return store.hash.get(key)?.get(field);
  },

  async hSet(key: string, fields: Record<string, string>): Promise<number> {
    const h = getHash(key);
    let added = 0;
    for (const [f, v] of Object.entries(fields)) {
      if (!h.has(f)) added++;
      h.set(f, v);
    }
    return added;
  },

  async hGetAll(key: string): Promise<Record<string, string>> {
    const h = store.hash.get(key);
    if (!h) return {};
    return Object.fromEntries(h.entries());
  },

  async zIncrBy(key: string, member: string, by: number): Promise<number> {
    const z = getZSet(key);
    const next = (z.get(member) ?? 0) + by;
    z.set(member, next);
    return next;
  },

  async zScore(key: string, member: string): Promise<number | undefined> {
    return store.zset.get(key)?.get(member);
  },

  async zRange(
    key: string,
    start: number,
    stop: number,
    _opts?: ZRangeOptions,
  ): Promise<ZMember[]> {
    const z = store.zset.get(key);
    if (!z) return [];
    const arr: ZMember[] = [...z.entries()].map(([member, score]) => ({ member, score }));
    // Redis orders by score asc, ties broken lexicographically by member.
    arr.sort((a, b) => (a.score === b.score ? (a.member < b.member ? -1 : 1) : a.score - b.score));
    if (_opts?.reverse) arr.reverse();
    const n = arr.length;
    const s = start < 0 ? Math.max(0, n + start) : start;
    let e = stop < 0 ? n + stop : stop;
    if (e >= n) e = n - 1;
    if (s > e || s >= n) return [];
    return arr.slice(s, e + 1);
  },

  async watch(..._keys: string[]): Promise<Txn> {
    // No real optimistic locking needed: tests are single-threaded, so the
    // transaction always commits. Writes apply immediately.
    return {
      async multi() {},
      async hSet(key: string, fields: Record<string, string>) {
        const h = getHash(key);
        for (const [f, v] of Object.entries(fields)) h.set(f, v);
      },
      async incrBy(key: string, by: number) {
        const next = (parseInt(store.str.get(key) ?? '0', 10) || 0) + by;
        store.str.set(key, String(next));
      },
      async exec() {
        return [];
      },
    };
  },
};

// --- Reddit ----------------------------------------------------------------

interface FakeUser {
  createdAt: Date;
  linkKarma: number;
  commentKarma: number;
}

const users = new Map<string, FakeUser>();
let postCounter = 0;
let commentCounter = 0;

export type MockClueComment = {
  id: string;
  postId: string;
  text: string;
  runAs?: string;
  permalink: string;
};

let lastClueComment: MockClueComment | undefined;

/** Default account: old + plenty of karma => clears the trust gate. */
function defaultUser(): FakeUser {
  return {
    createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    linkKarma: 500,
    commentKarma: 500,
  };
}

export const reddit = {
  async getUserById(id: string): Promise<FakeUser | undefined> {
    return users.get(id) ?? defaultUser();
  },
  async getCurrentUser(): Promise<{ id: string; isModerator: boolean } | undefined> {
    if (!context.userId) return undefined;
    return {
      id: context.userId,
      isModerator: context.userId.startsWith('mod_') || context.userId.startsWith('t2_mod'),
    };
  },
  async submitCustomPost(_opts: unknown): Promise<{ id: string }> {
    postCounter += 1;
    return { id: `t3_post${postCounter}` };
  },
  async submitComment(opts: {
    id: string;
    text: string;
    runAs?: string;
  }): Promise<{ id: string; permalink: string }> {
    commentCounter += 1;
    const id = `t1_comment${commentCounter}`;
    const slug = opts.id.replace(/^t3_/, '');
    const permalink = `/r/${context.subredditName ?? 'test'}/comments/${slug}/faction_warfare/${id}/`;
    lastClueComment = {
      id,
      postId: opts.id,
      text: opts.text,
      runAs: opts.runAs,
      permalink,
    };
    return { id, permalink };
  },
  async getCurrentUsername(): Promise<string | undefined> {
    return context.userId ? `user_${context.userId}` : undefined;
  },
};

// --- Realtime --------------------------------------------------------------

interface SentMessage {
  channel: string;
  message: unknown;
}

const sent: SentMessage[] = [];

export const realtime = {
  async send(channel: string, message: unknown): Promise<void> {
    sent.push({ channel, message });
  },
};

// --- Request context -------------------------------------------------------

export const context: {
  subredditId?: string;
  postId?: string;
  userId?: string;
  subredditName?: string;
  appVersion?: string;
} = {
  subredditId: 't5_sub',
  postId: 't3_post0',
  userId: undefined,
  subredditName: 'factionwarfare_dev',
};

// --- Test helpers ----------------------------------------------------------

export const __test = {
  reset(): void {
    store.str.clear();
    store.hash.clear();
    store.zset.clear();
    users.clear();
    sent.length = 0;
    postCounter = 0;
    commentCounter = 0;
    lastClueComment = undefined;
    context.subredditId = 't5_sub';
    context.postId = 't3_post0';
    context.userId = undefined;
    context.subredditName = 'factionwarfare_dev';
    context.appVersion = '0.0.1'; // published-style (3-seg) => dev override OFF
  },
  setUser(id: string, user: Partial<FakeUser>): void {
    users.set(id, { ...defaultUser(), ...user });
  },
  /** Register an untrusted (brand-new, no-karma) account. */
  setUntrusted(id: string): void {
    users.set(id, { createdAt: new Date(), linkKarma: 0, commentKarma: 0 });
  },
  sentMessages(): SentMessage[] {
    return sent;
  },
  get lastClueComment(): MockClueComment | undefined {
    return lastClueComment;
  },
  store,
};
