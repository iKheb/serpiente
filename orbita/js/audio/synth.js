// =============================================================================
// Órbita · utilidades de síntesis WebAudio (A2) — compartido con A2b.
//   noiseBuffer(ctx, sec, 'white'|'pink'|'brown')     búfer de ruido (cacheado por ctx)
//   reverb(ctx, { seconds, decay, wet })              → { input, output } convolución procedural
//   loopNoise(ctx, out, { type, gain, filter })       → { src, gain, filter, stop() }
//   env(param, t, { a, d, s, r, peak, hold })         envolvente ADSR sobre un AudioParam
//   tone(ctx, out, t, { f, type, dur, gain, a, r, glide, detune })   nota breve
//   pluck(ctx, out, t, f, dur, gain)                   cuerda/marimba suave
//   kick / snare / hat(ctx, out, t, gain)              percusión sintetizada
//   Scheduler: programa notas por tiempo de escena (sincroniza imagen y sonido)
// =============================================================================
const cache = new WeakMap();

export function noiseBuffer(ctx, seconds = 2, type = 'white') {
  let c = cache.get(ctx);
  if (!c) { c = {}; cache.set(ctx, c); }
  const key = type + seconds;
  if (c[key]) return c[key];
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
      } else d[i] = w;
    }
    // fundido en los extremos para bucles sin clic
    const f = Math.min(2000, len >> 3);
    for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[len - 1 - i] *= k; }
  }
  c[key] = buf;
  return buf;
}

export function reverb(ctx, { seconds = 2.4, decay = 2.8, wet = 0.3, pre = 0.01 } = {}) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const conv = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  const preN = Math.floor(pre * ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = preN; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - preN) / (len - preN), decay);
  }
  conv.buffer = ir;
  const w = ctx.createGain(); w.gain.value = wet;
  input.connect(conv); conv.connect(w); w.connect(output);
  return { input, output, conv, wet: w };
}

export function loopNoise(ctx, out, { type = 'pink', gain = 0.2, filter = 'lowpass', freq = 1200, q = 0.7, seconds = 3 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds, type);
  src.loop = true;
  src.loopStart = Math.random() * 0.5;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(out);
  src.start(ctx.currentTime, Math.random() * seconds * 0.8);
  return { src, gain: g, filter: f, stop() { try { src.stop(); } catch { /* */ } src.disconnect(); g.disconnect(); } };
}

export function env(param, t, { a = 0.005, d = 0.1, s = 0, r = 0.1, peak = 1, hold = 0, floor = 0.0001 } = {}) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(floor, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (hold) param.setValueAtTime(peak, t + a + hold);
  param.setTargetAtTime(Math.max(floor, s * peak), t + a + hold, d / 3);
  return t + a + hold + d + r;
}

/** Nota simple con envolvente; se autodestruye */
export function tone(ctx, out, t, { f = 440, type = 'sine', dur = 0.3, gain = 0.2, a = 0.005, r = 0.2, glide = 0, detune = 0, filter = 0, q = 1 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * glide), t + dur);
  if (detune) o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur - r), r / 3);
  let last = o;
  if (filter) {
    const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = filter; bf.Q.value = q;
    o.connect(bf); last = bf;
  }
  last.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + r * 2 + 0.05);
  o.onended = () => { g.disconnect(); };
  return { osc: o, gain: g };
}

/** Pulsación tipo marimba / campanita (FM suave) */
export function pluck(ctx, out, t, f, dur = 0.5, gain = 0.15, { ratio = 4, index = 1.2, type = 'sine' } = {}) {
  const car = ctx.createOscillator(); car.type = type; car.frequency.value = f;
  const mod = ctx.createOscillator(); mod.frequency.value = f * ratio;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.01 + 0.01, t + dur * 0.5);
  mod.connect(mg); mg.connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g); g.connect(out);
  car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  car.onended = () => { g.disconnect(); mg.disconnect(); };
}

export function kick(ctx, out, t, gain = 0.9, { f0 = 150, f1 = 45, len = 0.42 } = {}) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + len + 0.02);
  // clic de ataque
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 1, 'white');
  const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2500;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(gain * 0.25, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
  n.connect(nf); nf.connect(ng); ng.connect(out); n.start(t, Math.random() * 0.5); n.stop(t + 0.03);
  o.onended = () => { g.disconnect(); ng.disconnect(); };
}

export function snare(ctx, out, t, gain = 0.4, { tone: tf = 190, len = 0.22, hp = 900 } = {}) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 1, 'white');
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.6); n.stop(t + len + 0.02);
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(tf, t); o.frequency.exponentialRampToValueAtTime(tf * 0.6, t + 0.08);
  const og = ctx.createGain(); og.gain.setValueAtTime(gain * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12);
  n.onended = () => { g.disconnect(); og.disconnect(); };
}

export function hat(ctx, out, t, gain = 0.12, len = 0.05, freq = 8000) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 1, 'white');
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.8); n.stop(t + len + 0.02);
  n.onended = () => g.disconnect();
}

export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Programador sincronizado con el reloj de la escena.
 * Llama a sched.run(t) desde update(); para cada paso de rejilla entre el último
 * programado y t + ahead invoca cb(step, ctxTime, sceneTime). Si la escena se
 * pausa (no hay update), no se programa nada → silencio natural.
 */
export class Scheduler {
  constructor(ctx, stepSec, cb, { ahead = 0.12 } = {}) {
    this.ctx = ctx; this.step = stepSec; this.cb = cb; this.ahead = ahead;
    this.next = -1; this.lastT = -1;
  }
  run(t) {
    if (!this.ctx || this.ctx.state !== 'running') { this.next = -1; return; }
    const now = this.ctx.currentTime;
    // salto de tiempo (seek) o primer uso → reengancha
    if (this.next < 0 || t < this.lastT - 0.05 || t - this.lastT > 0.5) this.next = Math.ceil((t + 0.02) / this.step);
    this.lastT = t;
    while (this.next * this.step < t + this.ahead) {
      const st = this.next * this.step;
      const at = now + (st - t);
      if (at >= now - 0.01) this.cb(this.next, Math.max(now, at), st);
      this.next++;
    }
  }
}
