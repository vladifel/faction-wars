# Faction Warfare

![Faction Warfare — async tactical word voting on Reddit](https://raw.githubusercontent.com/vladifel/faction-wars/main/assets/icon-source.png)

Asynchronous, massively-multiplayer Codenames-style tactical voting for Reddit — built on [Devvit Web](https://developers.reddit.com).

**Live on Reddit:** [r/NanoArcade](https://www.reddit.com/r/nanoarcade/) · [App listing](https://developers.reddit.com/apps/faction-warfare)

Two factions compete turn-by-turn on a shared 5×5 board. Players vote on tiles; the community aggregate drives each flip. State lives in Devvit Redis; the client polls snapshots and listens on realtime channels.

## Tech stack

| Layer | Stack |
|-------|--------|
| Client | Vanilla TypeScript + DOM, Vite, **Nano Arcade** CRT theme |
| Server | Hono on Devvit Web, Redis, scheduled cron |
| Shared | Types, validators, endgame logic |

No React. No Blocks UI. Full in-feed webview (`height: tall`).

## Project layout

```text
src/
├── client/           # Webview entry (main.ts, components, styles.css, audio)
├── server/           # Hono routes, turn/board/faction services
└── shared/           # Types, API contracts, validators, endgameLogic
tests/                # Vitest unit + e2e (in-memory Devvit mock)
devvit.json           # App manifest, cron, menu items
```

## Scripts

```bash
npm install
npm test                 # Vitest (95+ tests)
npm run type-check       # tsc --build
npm run build            # Vite → dist/
npm run verify:viewport  # Headless mobile overflow check (local Chrome/Edge)
npm run verify:traps     # Trap tests + viewport
npm run dev              # devvit playtest (requires devvit login)
npm run deploy           # type-check + devvit upload
npm run launch           # deploy + devvit publish
```

## Getting started

1. `npm install -g devvit` and `devvit login`
2. `npm install`
3. `npm run dev` — opens playtest in `r/factionwarfare_dev` (see `devvit.json`)

## Game flow

1. **Install / mod menu** — moderator creates a war-room post (or app install auto-creates one).
2. **Gate** — viewer sees match score, taps **Enter War Room**.
3. **War room** — vote on tiles; commander dispatches clues via console.
4. **Turn resolve** — timer expires or cron backstop; lazy evaluation on any read.
5. **Tombstone** — old post shows resolved turn + jump to live post.
6. **Season end** — assassin, score wipe, board majority, or stalemate → **Endgame** CRT screen + stats + RETRY.
7. **New season** — moderator launches another war room from subreddit menu; RETRY jumps there when available.

## Moderator ops

| Menu item | Action |
|-----------|--------|
| Launch a war room | New post → new season |
| Sanitize lore words | Clean subreddit word list |
| Delete my data | GDPR stats scrub (user) |

After a season ends, players on the old post see endgame. **Launch a new war room** to start the next season; RETRY navigates to it when `activeSeason` points at the new post.

## Pre-release checklist

```bash
npm test && npm run type-check && npm run build
npm run dev    # playtest: gate, vote, resolve, force game over, endgame SFX
devvit upload  # staging
devvit publish # production
```

## Permissions

Redis, realtime, HTTP fetch (Datamuse word API), Reddit moderator scope — see `devvit.json`.
