/**
 * Devvit Web / mobile UX trap verification.
 *
 * Static assertions on CSS + devMode gating. Viewport overflow is checked by
 * `npm run verify:viewport` (headless browser, iPhone SE + tall sizes).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDevPlaytest } from '../src/server/devMode';
import { context } from './mocks/devvitServer';

const css = readFileSync(resolve('src/client/styles.css'), 'utf8');
const html = readFileSync(resolve('src/client/index.html'), 'utf8');
const mainTs = readFileSync(resolve('src/client/main.ts'), 'utf8');
const tokensTs = readFileSync(resolve('src/client/theme/tokens.ts'), 'utf8');
const voteSheetTs = readFileSync(resolve('src/client/components/VoteConfirmSheet.ts'), 'utf8');
const warroomTs = readFileSync(resolve('src/client/components/ActiveWarroom.ts'), 'utf8');
const uiTs = readFileSync(resolve('src/client/theme/ui.ts'), 'utf8');

describe('trap: zero-scroll / no scroll-jacking', () => {
  it('locks root overflow so feed scroll passes through', () => {
    expect(css).toMatch(/html,\s*\nbody[\s\S]*overflow:\s*hidden/);
    expect(css).toMatch(/\.app[\s\S]*overflow:\s*hidden/);
  });

  it('uses dvh cap on app shell', () => {
    expect(css).toContain('100dvh');
  });

  it('sheet uses overscroll-behavior contain (local scroll only)', () => {
    expect(css).toMatch(/\.pop-sheet[\s\S]*overscroll-behavior:\s*contain/);
  });
});

describe('trap: fluid viewport packing (no hardcoded tile px)', () => {
  it('grid rows/cols use minmax(0, 1fr) not fixed heights', () => {
    expect(css).toContain('grid-template-rows: repeat(5, minmax(0, 1fr))');
    expect(css).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
    expect(css).not.toMatch(/\.grid-tile[\s\S]*aspect-ratio/);
  });

  it('warroom stage uses flex shrink (min-height: 0)', () => {
    expect(css).toMatch(/\.warroom__stage[\s\S]*min-height:\s*0/);
    expect(css).toMatch(/\.board[\s\S]*min-height:\s*0/);
  });
});

describe('trap: compact stacked HUD (no overlay on tiles)', () => {
  it('top bar is single row; clue sits between faction badges', () => {
    expect(css).toMatch(/\.warroom__hud[\s\S]*justify-content:\s*space-between/);
    expect(css).toMatch(/\.pop-clue--inline/);
    expect(warroomTs).toContain('warroom__hud-center');
    expect(warroomTs).toContain('warroom__hud-right');
    expect(warroomTs).toContain('popClueHud');
    expect(warroomTs).toContain('pop-clue--inline');
    expect(warroomTs).toContain('CLUE');
    expect(css).not.toMatch(/\.hud-overlay/);
  });

  it('command button lives in hud right cluster, not floating over grid', () => {
    expect(warroomTs).toContain('warroom__hud-right');
    expect(warroomTs).toContain('popIconBtn');
    expect(uiTs).toContain('bar-cmd');
    expect(mainTs).not.toContain('command-fab');
  });
});

describe('trap: progressive disclosure', () => {
  it('vote goes through action sheet confirm, not instant cast', () => {
    expect(mainTs).toContain('pendingTile');
    expect(voteSheetTs).toContain('LOCK IN');
    expect(voteSheetTs).toContain('renderVoteConfirmSheet');
    expect(mainTs).toContain('confirmVote');
    expect(mainTs).not.toMatch(/onclick:\s*\(\)\s*=>\s*onVote\(/);
  });

  it('commander console is top-bar button + full-screen x-ray, not permanent footer', () => {
    expect(warroomTs).toContain('popIconBtn');
    expect(mainTs).toContain('COMMANDER_CONSOLE');
    expect(mainTs).toContain('renderCommanderConsole');
    expect(mainTs).not.toContain('renderCommandBar');
  });

  it('veto lives in tile action sheet', () => {
    expect(voteSheetTs).toContain("VETO COMMANDER'S CLUE");
  });
});

describe('trap: touch / zoom / keyboard', () => {
  it('viewport disables pinch zoom', () => {
    expect(html).toContain('user-scalable=no');
    expect(html).toContain('maximum-scale=1.0');
  });

  it('touch-action manipulation on body', () => {
    expect(css).toContain('touch-action: manipulation');
  });

  it('inputs use ≥16px to avoid iOS focus zoom', () => {
    expect(css).toMatch(/\.field[\s\S]*font-size:\s*16px/);
  });

  it('sheet has safe-area padding for notched devices', () => {
    expect(css).toContain('safe-area-inset-bottom');
  });
});

describe('trap: horizontal overflow', () => {
  it('grid and flex children can shrink below content width', () => {
    expect(css).toMatch(/\.grid-tile[\s\S]*min-width:\s*0/);
    expect(css).toContain('minmax(0, 1fr)');
  });
});

describe('trap: tile affordance', () => {
  it('votable tiles show pointer cursor and ring', () => {
    expect(css).toMatch(/\.grid-tile--open:not\(:disabled\)[\s\S]*cursor:\s*pointer/);
    expect(css).toContain('.grid-tile--pending');
  });

  it('locked tiles read disabled', () => {
    expect(css).toMatch(/\.grid-tile:disabled[\s\S]*cursor:\s*not-allowed/);
    expect(css).toContain('.grid-tile--open:disabled:not(.grid-tile--voted)');
  });
});

describe('trap: playtest dev override gated off in production', () => {
  beforeEach(() => {
    context.appVersion = '0.0.1';
  });

  it('isDevPlaytest false for 3-segment published version', () => {
    expect(isDevPlaytest()).toBe(false);
  });

  it('isDevPlaytest true only for 4-segment playtest build', () => {
    context.appVersion = '0.0.1.8';
    expect(isDevPlaytest()).toBe(true);
  });
});

describe('trap: pop UI class merging', () => {
  it('popScreen merges modifier classes instead of replacing base layout', () => {
    expect(uiTs).toContain('const { class: extraClass, ...rest } = extra');
    expect(uiTs).toContain("cls('pop-screen', `pop-screen--${bg}`, extraClass as string)");
  });
});

describe('trap: theme tokens + sheets', () => {
  it('applyThemeTokens maps subreddit colors into --pop-* vars', () => {
    expect(tokensTs).toContain('export function applyThemeTokens');
    expect(tokensTs).toContain("--pop-pink', theme.redColor");
    expect(mainTs).toContain('applyThemeTokens(theme)');
  });

  it('vote and commander sheets are torn down independently', () => {
    expect(mainTs).toContain('function removeVoteSheet');
    expect(mainTs).toContain('function removeCommanderClueSheet');
    expect(mainTs).toContain('syncCommanderClueSheet');
    expect(readFileSync(resolve('src/client/components/CommanderConsole.ts'), 'utf8')).toContain(
      "id: 'commander-clue-sheet'",
    );
  });

  it('vote sheet has back affordances like commander clue sheet', () => {
    expect(voteSheetTs).toContain('popSheetBack');
    expect(voteSheetTs).toContain('popSheetHandle(onCancel)');
  });
});

describe('trap: devvit manifest', () => {
  it('uses tall entry height for full webview', () => {
    const manifest = readFileSync(resolve('devvit.json'), 'utf8');
    expect(manifest).toContain('"height": "tall"');
  });

  it('ships a 1024 marketing icon for app listing', () => {
    const manifest = JSON.parse(readFileSync(resolve('devvit.json'), 'utf8')) as {
      marketingAssets?: { icon?: string };
    };
    expect(manifest.marketingAssets?.icon).toBe('assets/icon.png');
    const icon = readFileSync(resolve('assets/icon.png'));
    expect(icon.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(icon.length).toBeLessThan(500 * 1024);
  });

  it('posts commander clues as attributable Reddit comments', () => {
    expect(readFileSync(resolve('src/server/ugcService.ts'), 'utf8')).toContain("runAs: 'USER'");
    expect(readFileSync(resolve('src/server/routes/api.ts'), 'utf8')).toContain('publishClueComment');
    expect(warroomTs).toContain('pop-clue__report');
  });
});
