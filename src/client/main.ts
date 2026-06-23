/**

 * Faction Warfare web client.

 *

 * Single-page route machine rendered with plain DOM (no framework) for a small

 * bundle. State flows: GET /api/init -> render -> realtime push / poll refresh.

 */



import { context, navigateTo, connectRealtime } from '@devvit/web/client';

import type { JsonValue } from '@devvit/web/shared';

import { fwApi } from './api';

import { renderActiveWarroom } from './components/ActiveWarroom';

import { renderCommanderConsole, renderCommanderClueSheet, type XrayTile } from './components/CommanderConsole';

import { renderGateView } from './components/GateView';

import { renderVoteConfirmSheet } from './components/VoteConfirmSheet';
import { renderTombstoneView } from './components/TombstoneView';
import { renderEndgameView } from './components/EndgameView';
import { resolveEndgameVariant, endgameVariantToState, type EndgameVariant } from './endgame';
import { playEndgameSfx, warmupAudio } from './audio';

import { el } from './dom';

import { applyThemeTokens, injectPopTokens } from './theme/tokens';
import { popBody, popBtn, popCard, popScreen, popTitle } from './theme/ui';

import type { ClientSession, RealtimeUpdate } from '../shared/api';

import type { BoardSnapshot, RouteState, ThemeTokens } from '../shared/types';

import { resolveThemeTokens } from '../shared/theme';

import { formatRemaining } from '../shared/strings';

import { pickFlickerTileIds, syncBorderGlowLive } from './tileFlicker';



const root = document.getElementById('app')!;

injectPopTokens();



interface UiState {

  session: ClientSession | null;

  snapshot: BoardSnapshot | null;

  theme: ThemeTokens;

  entered: boolean;

  route: RouteState;

  votedTileId: string | null;

  busy: boolean;

  error: string | null;

  pendingTile: { id: string; word: string } | null;

  xrayTiles: XrayTile[] | null;

  xrayLoading: boolean;

  cluePanelOpen: boolean;

  boardDeal: boolean;

  flickerTileIds: string[];

}



const state: UiState = {

  session: null,

  snapshot: null,

  theme: resolveThemeTokens(null),

  entered: false,

  route: 'LOADING',

  votedTileId: null,

  busy: false,

  error: null,

  pendingTile: null,

  xrayTiles: null,

  xrayLoading: false,

  cluePanelOpen: false,

  boardDeal: false,

  flickerTileIds: [],
};



function applyTheme(theme: ThemeTokens): void {
  applyThemeTokens(theme);
}

let boardDealTimer: ReturnType<typeof setTimeout> | null = null;

function triggerBoardDeal(): void {
  state.boardDeal = true;
  if (boardDealTimer) clearTimeout(boardDealTimer);
  boardDealTimer = setTimeout(() => {
    state.boardDeal = false;
    boardDealTimer = null;
  }, 900);
}

function arcadeFlash(kind: 'vote' | 'clue' = 'vote'): void {
  root.classList.remove('arcade-flash--vote', 'arcade-flash--clue');
  void root.offsetWidth;
  root.classList.add(kind === 'clue' ? 'arcade-flash--clue' : 'arcade-flash--vote');
  window.setTimeout(() => {
    root.classList.remove('arcade-flash--vote', 'arcade-flash--clue');
  }, 320);
}

function removeVoteSheet(): void {
  document.getElementById('sheet-backdrop')?.remove();
  document.getElementById('action-sheet')?.remove();
}

function removeCommanderClueSheet(): void {
  document.getElementById('commander-clue-sheet')?.remove();
}

function removeAllSheets(): void {
  removeVoteSheet();
  removeCommanderClueSheet();
}

function renderError(message: string): HTMLElement {
  return popScreen('sky', [
    popCard([
      popTitle('Signal lost'),
      popBody(message),
      popBtn('Retry uplink', { variant: 'primary', onclick: () => boot() }),
    ], 'pop-card--error'),
  ], { class: 'pop-screen--center' });
}



function postUrl(postId: string): string {

  const sub = context.subredditName ?? 'all';

  return `https://reddit.com/r/${sub}/comments/${postId.replace(/^t3_/, '')}`;

}



async function openCommanderConsole(): Promise<void> {

  state.route = 'COMMANDER_CONSOLE';

  state.cluePanelOpen = false;

  state.pendingTile = null;

  syncActionSheet();

  render();



  if (!state.session?.isCommander) {

    state.xrayTiles = null;

    state.xrayLoading = false;

    return;

  }



  state.xrayLoading = true;

  state.xrayTiles = null;

  render();

  try {

    const res = await fwApi.commanderXray();

    state.xrayTiles = res.ok && res.tiles ? res.tiles : null;

    if (!res.ok && res.error) flash(res.error);

  } catch {

    flash('Could not load classified board.');

  } finally {

    state.xrayLoading = false;

    render();

  }

}



/** Swap visible screen; re-attach overlay sheets after every mount. */
let endgameGlitchKey: string | null = null;

function subredditUrl(): string {
  const sub = context.subredditName ?? 'all';
  return `https://reddit.com/r/${sub}`;
}

async function navigateRetryTarget(): Promise<void> {
  try {
    const target = await fwApi.retryTarget();
    navigateTo(target.navigateTo);
  } catch {
    navigateTo(subredditUrl());
  }
}

function mountEndgame(view: HTMLElement, glitchKey: string, sfxKey: string, variant: string): void {
  closeSheets();
  state.flickerTileIds = [];
  syncBorderGlowLive([]);
  state.route = 'ENDGAME';

  const playGlitch = endgameGlitchKey !== glitchKey;
  if (playGlitch) {
    endgameGlitchKey = glitchKey;
    root.classList.add('arcade-endgame-glitch');
    playEndgameSfx(endgameVariantToState(variant as EndgameVariant), sfxKey);
    window.setTimeout(() => {
      root.classList.remove('arcade-endgame-glitch');
      mountScreen(view);
    }, 500);
    return;
  }
  mountScreen(view);
}

function mountScreen(view: HTMLElement): void {
  mountView(view);
  syncActionSheet();
  syncCommanderClueSheet();
  syncBorderGlowLive(state.flickerTileIds);
}

function mountView(view: HTMLElement): void {
  root.replaceChildren(view);
}

function syncCommanderClueSheet(): void {
  removeCommanderClueSheet();
  const session = state.session;
  if (
    !state.cluePanelOpen ||
    state.route !== 'COMMANDER_CONSOLE' ||
    !session?.ok ||
    !session.isCommander
  ) {
    return;
  }

  root.append(
    renderCommanderClueSheet({
      session,
      busy: state.busy,
      onClose: () => {
        state.cluePanelOpen = false;
        render();
      },
      onDispatch: (word, count) => {
        void onClue(word, count).then(() => {
          state.cluePanelOpen = false;
          state.route = 'ACTIVE_WARROOM';
          render();
        });
      },
    }),
  );
}

function closeSheets(): void {
  state.pendingTile = null;
  removeAllSheets();
}

function dismissSheetAndRefreshWarroom(): void {
  closeSheets();
  renderWarroomIfMounted();
}

/** Refresh war room DOM without touching the vote sheet overlay. */
function renderWarroomIfMounted(): void {
  if (
    !state.session?.ok ||
    !state.snapshot ||
    state.snapshot.status !== 'ACTIVE' ||
    !state.entered ||
    state.route !== 'ACTIVE_WARROOM'
  ) {
    return;
  }
  root.replaceChildren(
    renderActiveWarroom({
      session: state.session,
      snap: state.snapshot,
      theme: state.theme,
      votedTileId: state.votedTileId,
      pendingTileId: null,
      boardDeal: state.boardDeal,
      flickerTileIds: state.flickerTileIds,
      onTileSelect: (tile) => {
        state.pendingTile = tile;
        render();
      },
      onCommandOpen: () => void openCommanderConsole(),
    }),
  );
  syncBorderGlowLive(state.flickerTileIds);
}

function syncActionSheet(): void {
  const session = state.session;
  const snap = state.snapshot;
  if (!session || !snap || !state.pendingTile) {
    removeVoteSheet();
    return;
  }

  const tileId = state.pendingTile.id;
  const existing = document.getElementById('action-sheet');
  if (existing?.dataset.tileId === tileId) {
    existing.querySelectorAll('button').forEach((btn) => {
      btn.disabled = state.busy;
    });
    return;
  }

  removeVoteSheet();
  const { id, word } = state.pendingTile;
  const sheet = renderVoteConfirmSheet({
    session,
    snap,
    tileId: id,
    word,
    busy: state.busy,
    onConfirm: () => void confirmVote(id),
    onVeto: () => void confirmVeto(),
    onCancel: dismissSheetAndRefreshWarroom,
  });
  sheet.dataset.tileId = tileId;
  root.append(sheet);
}



async function confirmVote(tileId: string): Promise<void> {

  closeSheets();

  arcadeFlash('vote');

  await onVote(tileId);

}



async function confirmVeto(): Promise<void> {

  closeSheets();

  await onVeto();

}



function render(): void {
  const session = state.session;
  const snap = state.snapshot;
  const warroomPending =
    state.pendingTile &&
    session?.ok &&
    snap?.status === 'ACTIVE' &&
    state.entered &&
    state.route === 'ACTIVE_WARROOM' &&
    !state.error;

  if (warroomPending) {
    mountScreen(
      renderActiveWarroom({
        session: session!,
        snap: snap!,
        theme: state.theme,
        votedTileId: state.votedTileId,
        pendingTileId: state.pendingTile!.id,
        boardDeal: state.boardDeal,
        flickerTileIds: state.flickerTileIds,
        onTileSelect: (tile) => {
          state.pendingTile = tile;
          render();
        },
        onCommandOpen: () => void openCommanderConsole(),
      }),
    );
    return;
  }

  if (state.error) {
    closeSheets();
    mountScreen(renderError(state.error));
    return;
  }

  if (!session) {
    closeSheets();
    mountScreen(renderError('No session.'));
    return;
  }

  if (!session.ok) {
    closeSheets();
    mountScreen(renderError(session.error ?? 'Could not load the battlefield.'));
    return;
  }

  if (!snap) {
    closeSheets();
    mountScreen(renderError('No board data yet.'));
    return;
  }

  if (snap.status === 'RESOLVED') {
    const endVariant = resolveEndgameVariant(snap, session.visualFaction);
    if (endVariant) {
      const sfxKey = `${snap.season}:${snap.turn}:${endVariant}`;
      mountEndgame(
        renderEndgameView({
          variant: endVariant,
          session,
          snap,
          theme: state.theme,
          onRetry: () => void navigateRetryTarget(),
          sfxKey,
        }),
        sfxKey,
        sfxKey,
        endVariant,
      );
      return;
    }
    closeSheets();
    mountScreen(
      renderTombstoneView({
        snap,
        onJumpLive: (postId) => navigateTo(postUrl(postId)),
      }),
    );
    return;
  }

  if (!state.entered) {
    closeSheets();
    mountScreen(
      renderGateView({
        session,
        snap,
        theme: state.theme,
        onEnter: () => {
          warmupAudio();
          state.entered = true;
          state.route = 'ACTIVE_WARROOM';
          triggerBoardDeal();
          refreshTileFlicker();
          render();
        },
      }),
    );
    return;
  }

  if (state.route === 'COMMANDER_CONSOLE') {
    mountScreen(
      renderCommanderConsole({
        session,
        snap,
        theme: state.theme,
        xrayTiles: state.xrayTiles,
        loading: state.xrayLoading,
        busy: state.busy,
        cluePanelOpen: state.cluePanelOpen,
        flickerTileIds: state.flickerTileIds,
        onBack: () => {
          state.route = 'ACTIVE_WARROOM';
          state.cluePanelOpen = false;
          render();
        },
        onOpenCluePanel: () => {
          state.cluePanelOpen = true;
          render();
        },
        onClaimCommand: () => {
          void onClaim().then(() => openCommanderConsole());
        },
      }),
    );
    return;
  }

  mountScreen(
    renderActiveWarroom({
      session,
      snap,
      theme: state.theme,
      votedTileId: state.votedTileId,
      pendingTileId: null,
      boardDeal: state.boardDeal,
      flickerTileIds: state.flickerTileIds,
      onTileSelect: (tile) => {
        state.pendingTile = tile;
        render();
      },
      onCommandOpen: () => void openCommanderConsole(),
    }),
  );
}



async function onVote(tileId: string): Promise<void> {

  if (state.busy || state.votedTileId) return;

  state.busy = true;

  state.votedTileId = tileId;

  if (state.snapshot) {

    const t = state.snapshot.tiles.find((x) => x.id === tileId);

    if (t) t.voteCount += 1;

  }

  render();

  try {

    const res = await fwApi.vote(tileId);

    if (res.snapshot) state.snapshot = res.snapshot;

    if (!res.success) state.votedTileId = null;

  } catch {

    state.votedTileId = null;

  } finally {

    state.busy = false;

    render();

  }

}



async function onClue(word: string, count: number): Promise<void> {

  if (state.busy) return;

  state.busy = true;

  render();

  try {

    const res = await fwApi.clue(word, Number.isFinite(count) ? count : 1);

    if (res.snapshot) state.snapshot = res.snapshot;

    if (res.success) arcadeFlash('clue');

    if (!res.success && res.error) flash(res.error);

  } finally {

    state.busy = false;

    render();

  }

}



async function onVeto(): Promise<void> {

  if (state.busy) return;

  state.busy = true;

  render();

  try {

    const res = await fwApi.veto();

    if (res.snapshot) state.snapshot = res.snapshot;

  } finally {

    state.busy = false;

    render();

  }

}



async function onClaim(): Promise<void> {

  if (state.busy) return;

  state.busy = true;

  render();

  try {

    const res = await fwApi.claimCommander();

    if (res.isCommander && state.session) state.session.isCommander = true;

    else if (res.error) flash(res.error);

  } finally {

    state.busy = false;

    render();

  }

}



let flashTimer: ReturnType<typeof setTimeout> | null = null;

function flash(message: string): void {

  let toast = document.querySelector<HTMLElement>('.toast');

  if (!toast) {

    toast = el('div', { class: 'toast' });

    document.body.append(toast);

  }

  toast.textContent = message;

  toast.classList.add('toast--show');

  if (flashTimer) clearTimeout(flashTimer);

  flashTimer = setTimeout(() => toast?.classList.remove('toast--show'), 3000);

}



async function refreshState(): Promise<void> {

  try {

    const res = await fwApi.state();

    if (res.snapshot) {

      const changed = res.snapshot.versionHash !== state.snapshot?.versionHash;

      if (state.snapshot && res.snapshot.turn !== state.snapshot.turn) {

        state.votedTileId = null;

      }

      state.snapshot = res.snapshot;

      if (changed) render();

    }

  } catch {

    /* transient; next tick retries */

  }

}



function startCountdown(): void {

  setInterval(() => {

    const snap = state.snapshot;

    if (!snap || snap.status !== 'ACTIVE' || !state.entered) return;

    const clock = document.querySelector('.pop-bar__time');

    if (clock) clock.textContent = formatRemaining(snap.turnEndTime);

    if (snap.turnEndTime - Date.now() <= 0) refreshState();

  }, 1000);

}

function refreshTileFlicker(): void {
  let pool: string[] = [];
  if (state.entered && state.route === 'ACTIVE_WARROOM' && state.snapshot) {
    pool = state.snapshot.tiles.map((t) => t.id);
  } else if (state.route === 'COMMANDER_CONSOLE' && state.xrayTiles) {
    pool = state.xrayTiles.map((t) => t.id);
  }
  state.flickerTileIds = pool.length > 0 ? pickFlickerTileIds(pool) : [];
  syncBorderGlowLive(state.flickerTileIds);
}

function startTileFlicker(): void {
  setInterval(refreshTileFlicker, 2000);
}



function subscribeRealtime(): void {

  const postId = context.postId;

  if (!postId) return;

  connectRealtime<JsonValue>({

    channel: `fw_${postId}`,

    onMessage: (raw) => {

      const msg = raw as unknown as RealtimeUpdate;

      if (msg.snapshot) {

        if (state.snapshot && msg.snapshot.turn !== state.snapshot.turn) {

          state.votedTileId = null;

        }

        if (msg.snapshot.versionHash === state.snapshot?.versionHash) return;

        state.snapshot = msg.snapshot;

        render();

      } else {

        refreshState();

      }

    },

  });

}



async function boot(): Promise<void> {

  state.error = null;

  try {

    const session = await fwApi.init();

    state.session = session;

    state.snapshot = session.snapshot;

    state.theme = resolveThemeTokens(session.config);

    applyTheme(state.theme);

    if (session.snapshot?.status === 'RESOLVED') {

      state.entered = true;

      state.route = 'TOMBSTONE';

    } else {

      state.route = session.snapshot ? 'GATE' : 'LOADING';

    }

    render();

  } catch (err) {

    state.error = err instanceof Error ? err.message : 'Failed to reach the server.';

    render();

  }

}



boot();

subscribeRealtime();

setInterval(refreshState, 12_000);

startCountdown();

startTileFlicker();

