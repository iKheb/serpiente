// =============================================================================
// Órbita · dirección de cámara para emisiones (A2) — compartido con A2b.
//
//   import { Director, handheld, setLens } from '../broadcast/camera.js';
//   const dir = new Director({
//     rng,
//     shots: [
//       { name: 'general', weight: 3, min: 7, max: 12,
//         enter(cam, s) {},                 // al cortar a este plano (s = { k, len, start, index, data })
//         update(cam, dt, t, s) {} },       // cada frame (s.k = segundos dentro del plano, s.p = 0..1)
//       ...
//     ],
//     next: (prev, rng, shots) => shot,     // opcional: regla de montaje
//   });
//   dir.update(camera, dt, t)  → true si hubo corte en este frame
//   dir.force('repeticion', t, 6)           // corta ya a un plano concreto durante N s
//   dir.current                              // { shot, start, end, ... }
//
// El montaje es determinista respecto al tiempo (permite seek): la secuencia de
// planos se genera a partir del rng y se amplía según avanza t.
// =============================================================================
import { clamp } from './util.js';

export class Director {
  constructor({ shots, rng = Math.random, next = null, start = 0 }) {
    this.shots = shots;
    this.byName = Object.fromEntries(shots.map((s) => [s.name, s]));
    this.rng = rng;
    this.nextFn = next;
    this.seq = [];
    this.current = null;
    this._lastIndex = -1;
    this._extend(start, start + 60);
  }

  _pickNext(prev) {
    if (this.nextFn) {
      const s = this.nextFn(prev, this.rng, this.shots, this.byName);
      if (s) return typeof s === 'string' ? this.byName[s] : s;
    }
    const pool = this.shots.filter((s) => s !== prev && (s.weight ?? 1) > 0);
    let tot = 0;
    for (const s of pool) tot += s.weight ?? 1;
    let x = this.rng() * tot;
    for (const s of pool) { x -= s.weight ?? 1; if (x <= 0) return s; }
    return pool[pool.length - 1] || this.shots[0];
  }

  _extend(from, until) {
    let t = this.seq.length ? this.seq[this.seq.length - 1].end : from;
    let prev = this.seq.length ? this.seq[this.seq.length - 1].shot : null;
    while (t < until) {
      const shot = this._pickNext(prev);
      const len = (shot.min ?? 6) + this.rng() * ((shot.max ?? 12) - (shot.min ?? 6));
      this.seq.push({ shot, start: t, end: t + len, len, data: {}, seed: this.rng() });
      t += len; prev = shot;
    }
    // recorta historia muy antigua
    if (this.seq.length > 400) this.seq.splice(0, this.seq.length - 300);
  }

  /** Inserta un plano forzado en t durante len segundos; el montaje continúa después */
  force(name, t, len = 6, data = {}) {
    const shot = this.byName[name];
    if (!shot) return;
    // corta la secuencia a partir de t
    let i = this.seq.findIndex((e) => e.end > t);
    if (i < 0) i = this.seq.length;
    if (this.seq[i] && this.seq[i].start < t) { this.seq[i].end = t; this.seq[i].len = t - this.seq[i].start; i++; }
    this.seq.length = i;
    this.seq.push({ shot, start: t, end: t + len, len, data, seed: this.rng(), forced: true });
    this._lastIndex = -1;
  }

  /** Reemplaza el resto del plano actual (desde t) por el montaje normal */
  release(t) {
    const i = this.seq.findIndex((e) => e.start <= t && e.end > t);
    if (i >= 0) { this.seq[i].end = t; this.seq[i].len = t - this.seq[i].start; this.seq.length = i + 1; }
    this._lastIndex = -1;
  }

  at(t) {
    if (!this.seq.length || t >= this.seq[this.seq.length - 1].end) this._extend(t, t + 60);
    // búsqueda binaria
    let lo = 0, hi = this.seq.length - 1;
    if (t < this.seq[0].start) return { entry: this.seq[0], index: 0 };
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.seq[mid].start <= t) lo = mid; else hi = mid - 1;
    }
    return { entry: this.seq[lo], index: lo };
  }

  update(cam, dt, t) {
    const { entry, index } = this.at(t);
    let cut = false;
    if (entry !== this.current) {
      cut = true;
      this.current = entry;
      this._lastIndex = index;
      entry.k = t - entry.start;
      entry.p = clamp(entry.k / entry.len, 0, 1);
      entry.shot.enter?.(cam, entry, t);
    }
    entry.k = t - entry.start;
    entry.p = clamp(entry.k / entry.len, 0, 1);
    entry.shot.update?.(cam, cut ? 0 : dt, t, entry, cut);
    return cut;
  }
}

/**
 * Cámara al hombro: aplica rotaciones de ruido suave (rad) tras orientar la cámara.
 * amp ~0.002 (trípode con viento) · 0.006 (al hombro) · 0.015 (a bordo)
 */
export function handheld(cam, t, amp = 0.004, seed = 0) {
  const s = seed * 17.13;
  const yaw = Math.sin(t * 0.93 + s) * 0.55 + Math.sin(t * 2.31 + s * 1.7) * 0.3 + Math.sin(t * 5.7 + s * 0.3) * 0.15;
  const pitch = Math.sin(t * 1.17 + s * 2.1) * 0.5 + Math.sin(t * 2.83 + s) * 0.32 + Math.sin(t * 6.3 + s * 3.1) * 0.18;
  const roll = Math.sin(t * 0.71 + s * 0.6) * 0.6 + Math.sin(t * 1.9 + s * 2.4) * 0.4;
  cam.rotateY(yaw * amp);
  cam.rotateX(pitch * amp);
  cam.rotateZ(roll * amp * 0.6);
}

/** Cambia el FOV vertical solo si varía (evita recalcular la proyección) */
export function setLens(cam, fov) {
  if (Math.abs(cam.fov - fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
}

/** FOV vertical equivalente a una focal (mm) en sensor de 35 mm (24 mm alto) */
export const focalToFov = (mm) => (2 * Math.atan(12 / mm) * 180) / Math.PI;
