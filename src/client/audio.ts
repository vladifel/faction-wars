/**
 * Nano Arcade Audio Engine — Web Audio API 8-bit synth SFX.
 */

export type SfxId = 'sfx_victory_fanfare' | 'sfx_crt_shutdown' | 'sfx_low_buzz';

type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

const played = new Set<string>();

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;

  const Ctx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  audioCtx = new Ctx();
  return audioCtx;
}

function playTone(
  freq: number,
  type: OscillatorType,
  duration: number,
  ramp = 0,
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (ramp) {
    osc.frequency.exponentialRampToValueAtTime(ramp, ctx.currentTime + duration);
  }

  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
}

/** Low-level SFX router — synthesizes retro tones by id. */
export const audio = {
  play(id: string): void {
    switch (id) {
      case 'sfx_victory_fanfare':
        [440, 554, 659, 880].forEach((f, i) => {
          window.setTimeout(() => playTone(f, 'square', 0.2), i * 150);
        });
        break;

      case 'sfx_crt_shutdown':
        playTone(880, 'sawtooth', 0.5, 50);
        break;

      case 'sfx_low_buzz':
        playTone(110, 'triangle', 0.8);
        break;
    }
  },
};

/** Prime AudioContext after a user gesture (gate enter, vote, etc.). */
export function warmupAudio(): void {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume();
  }
}

/** Play a named SFX once per session key (avoids double-fire on re-render). */
export function playSfx(id: SfxId, sessionKey?: string): void {
  const key = sessionKey ? `${id}:${sessionKey}` : id;
  if (played.has(key)) return;
  played.add(key);

  try {
    audio.play(id);
  } catch {
    /* autoplay policy / missing engine */
  }
}

export function playEndgameSfx(
  state: 'WIN' | 'LOSS' | 'GLITCH' | 'STALEMATE',
  sessionKey: string,
): void {
  switch (state) {
    case 'WIN':
      playSfx('sfx_victory_fanfare', sessionKey);
      break;
    case 'STALEMATE':
      playSfx('sfx_low_buzz', sessionKey);
      break;
    case 'LOSS':
    case 'GLITCH':
      playSfx('sfx_crt_shutdown', sessionKey);
      break;
  }
}

/** Test helper — reset dedupe guard. */
export function resetSfxGuard(): void {
  played.clear();
}

/** Test helper — close and drop audio context. */
export function resetAudioEngine(): void {
  played.clear();
  if (audioCtx) {
    void audioCtx.close();
    audioCtx = null;
  }
}
