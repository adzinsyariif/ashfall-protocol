// Synthesized sound effects: every sound is built from oscillators and
// filtered noise at play time, so the game ships no audio files and makes
// no network requests. A single shared AudioContext wakes on the first
// user gesture (the click that locks the pointer).
let ctx = null;
let master = null;

export function wakeAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function noiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'lowpass', sweep = 0.4 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur);
}

function tone({ freq = 440, dur = 0.1, gain = 0.2, type = 'square', slide = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur);
}

// Distance falloff for world sounds: full volume to 12 units, gone by 70.
export function vol(dist) {
  if (dist <= 12) return 1;
  if (dist >= 70) return 0;
  return 1 - (dist - 12) / 58;
}

export const sfx = {
  shot(kind, v = 1) {
    if (!ctx || v <= 0) return;
    if (kind === 'sniper') {
      burst({ dur: 0.34, freq: 3200, gain: 0.85 * v, sweep: 0.12 });
      tone({ freq: 120, dur: 0.22, gain: 0.5 * v, type: 'triangle', slide: -70 });
    } else if (kind === 'scatter') {
      burst({ dur: 0.24, freq: 1400, gain: 0.8 * v, sweep: 0.2 });
      tone({ freq: 90, dur: 0.16, gain: 0.45 * v, type: 'triangle', slide: -40 });
    } else if (kind === 'smg') {
      burst({ dur: 0.09, freq: 2400, gain: 0.42 * v, sweep: 0.35 });
    } else if (kind === 'pistol') {
      burst({ dur: 0.11, freq: 2100, gain: 0.5 * v, sweep: 0.3 });
    } else {
      burst({ dur: 0.15, freq: 1900, gain: 0.6 * v, sweep: 0.25 });
      tone({ freq: 150, dur: 0.08, gain: 0.22 * v, type: 'triangle', slide: -60 });
    }
  },
  dryFire(v = 1) { tone({ freq: 1400, dur: 0.04, gain: 0.12 * v, type: 'square' }); },
  reload(v = 1) {
    tone({ freq: 700, dur: 0.05, gain: 0.16 * v, type: 'square' });
    setTimeout(() => tone({ freq: 500, dur: 0.05, gain: 0.16 * v, type: 'square' }), 140);
    setTimeout(() => tone({ freq: 950, dur: 0.06, gain: 0.2 * v, type: 'square' }), 320);
  },
  hit(v = 1) { tone({ freq: 2100, dur: 0.05, gain: 0.18 * v, type: 'sine' }); },
  kill(v = 1) {
    tone({ freq: 1560, dur: 0.07, gain: 0.22 * v, type: 'sine' });
    setTimeout(() => tone({ freq: 2340, dur: 0.1, gain: 0.22 * v, type: 'sine' }), 60);
  },
  hurt(v = 1) { burst({ dur: 0.1, freq: 500, gain: 0.3 * v, type: 'lowpass' }); },
  plantBeep(v = 1) { tone({ freq: 1180, dur: 0.07, gain: 0.2 * v, type: 'square' }); },
  planted(v = 1) {
    tone({ freq: 880, dur: 0.09, gain: 0.22 * v, type: 'square' });
    setTimeout(() => tone({ freq: 1320, dur: 0.12, gain: 0.22 * v, type: 'square' }), 110);
  },
  explosion(v = 1) {
    burst({ dur: 1.1, freq: 900, gain: 1.0 * v, sweep: 0.05 });
    tone({ freq: 55, dur: 0.9, gain: 0.8 * v, type: 'sine', slide: -25 });
  },
  roundWin(v = 1) {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.16, gain: 0.2 * v, type: 'triangle' }), i * 110));
  },
  roundLose(v = 1) {
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.16, gain: 0.2 * v, type: 'triangle' }), i * 110));
  },
  buy(v = 1) { tone({ freq: 1750, dur: 0.06, gain: 0.16 * v, type: 'sine' }); },
  step(v = 1) { burst({ dur: 0.05, freq: 700, gain: 0.06 * v, sweep: 0.6 }); },
  jump(v = 1) { burst({ dur: 0.06, freq: 900, gain: 0.08 * v, sweep: 0.7 }); },
};
