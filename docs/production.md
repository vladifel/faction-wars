# Production readiness

## Architecture

```text
Reddit post (webview)
    └── client/main.ts          route machine + poll + realtime
            └── /api/*          Hono (src/server/routes/api.ts)

Devvit internal (not webview)
    └── /internal/menu/*        mod: launch war room, sanitize lore, GDPR delete
    └── /internal/triggers/*    install / upgrade lifecycle
    └── /internal/cron/*        turn-tick (10m), word-pool-refresh (weekly)

Redis
    postContext(postId) → { season, turn }   immutable per post URL
    activeSeason(sub)   → current season id
    currentTurn(season) → live turn number
    boards, votes, snapshots, stats, word pool
```

**Post model:** Each Reddit post is a **frame** bound to one `{season, turn}`. When a turn resolves, that post becomes a **tombstone** (`status: RESOLVED`, `nextPostId`). The next turn lives on a **new post** (mod launch or auto-spawn). Lazy resolution (`ensureTurnFresh`) runs on read but must not change which turn a post serves.

**Season end:** assassin flip, score zero, territory majority (≥4 lead), or full-board stalemate → endgame on terminal post → `recordSeasonResults` → RETRY via `/api/retry-target`.

## Dev-only behavior (auto-disabled in production)

| Mechanism | Where | Production |
|-----------|--------|------------|
| `isDevPlaytest()` | `devMode.ts` | `false` when `appVersion` is 3-segment (`0.0.1`) |
| Solo faction + auto-trust | `sessionService`, `api.viewerFaction` | Off |
| All users = moderator | `modAuth.ts` | Off |
| `POST /api/force-resolve` without mod | `api.ts` | **403** |

Published builds never get playtest overrides. Mods retain `force-resolve` and menu tools.

## Game completeness checklist

| Feature | Status |
|---------|--------|
| Gate → war room → vote sheet | ✅ |
| Commander claim, clue, x-ray, veto + strike penalty | ✅ |
| Turn timer + lazy resolve + cron backstop | ✅ |
| Multi-post tombstone + jump to live | ✅ |
| Season end (4 reasons) + endgame UI + SFX | ✅ |
| Career stats on endgame | ✅ |
| RETRY → live war room | ✅ |
| Mod: launch war room, lore sanitize, GDPR delete | ✅ |
| Word pool (Datamuse + fallback + blocklist) | ✅ |
| Realtime + 12s poll fallback | ✅ |
| CI: type-check, test, build | ✅ |

## Pre-ship commands

```bash
npm test && npm run type-check && npm run build
npm run verify:traps
devvit upload
# manual playtest on staging subreddit
devvit publish
```

## Known ops notes

- After season end, mod must **Launch a war room** for the next season (or RETRY falls back to subreddit feed).
- `devvit.json` → `dev.subreddit` is playtest-only config; does not ship to production subreddits.
- No git repo required for deploy; initialize git for CI/PR workflows if desired.
