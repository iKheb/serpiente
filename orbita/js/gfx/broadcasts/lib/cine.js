// Auxiliares cinematográficos compartidos (A2b): dirección de planos, cámara,
// encuadre vertical, grafismo DOM (.bc-cine-*), texturas de brillo procedurales.

/* ----------------------------------------------------------------------------
 * Curvas y utilidades
 * ------------------------------------------------------------------------- */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);

/** Deriva orgánica (suma de senos inconmensurables) ∈ ~[-1, 1]. */
export function wobble(t, seed = 0) {
  return (Math.sin(t * 0.71 + seed * 1.3) * 0.5 + Math.sin(t * 1.37 + seed * 2.1) * 0.3 + Math.sin(t * 2.91 + seed * 0.7) * 0.2);
}

/* ----------------------------------------------------------------------------
 * Director: secuencia de planos deterministas en función del tiempo.
 * shots: [{ name, dur, run(cam, u, lt, t, shot) }]  u ∈ [0,1] progreso del plano
 * ------------------------------------------------------------------------- */
export class Director {
  constructor(shots) {
    this.shots = shots;
    this.total = shots.reduce((s, x) => s + x.dur, 0);
    this.index = -1;
    this.cut = false;
  }
  at(t) {
    let lt = ((t % this.total) + this.total) % this.total;
    let i = 0;
    while (i < this.shots.length - 1 && lt >= this.shots[i].dur) { lt -= this.shots[i].dur; i++; }
    const shot = this.shots[i];
    this.cut = i !== this.index;
    this.index = i;
    return { i, shot, lt, u: clamp(lt / shot.dur, 0, 1) };
  }
  run(cam, t) {
    const s = this.at(t);
    s.shot.run(cam, s.u, s.lt, t, s.shot);
    return s;
  }
}

/** Coloca la cámara mirando a un objetivo con alabeo opcional (rad). */
export function aim(cam, px, py, pz, tx, ty, tz, roll = 0) {
  cam.position.set(px, py, pz);
  cam.up.set(Math.sin(roll), Math.cos(roll), 0);
  cam.lookAt(tx, ty, tz);
}

/** FOV vertical que conserva un encuadre razonable en pantallas verticales. */
export function fitFov(baseVFov, aspect) {
  if (aspect >= 1.2) return baseVFov;
  const toR = Math.PI / 180;
  const refAspect = 16 / 9;
  const hLand = 2 * Math.atan(Math.tan(baseVFov * toR / 2) * refAspect);
  const hWant = hLand * (aspect >= 1 ? 0.85 : 0.6);
  const v = 2 * Math.atan(Math.tan(hWant / 2) / aspect) / toR;
  return clamp(Math.max(v, baseVFov), baseVFov, 82);
}

/* ----------------------------------------------------------------------------
 * Texturas procedurales
 * ------------------------------------------------------------------------- */
/** Textura radial suave (halo) RGBA, en espacio lineal. */
export function glowTexture(THREE, size = 128, { core = 0.35, falloff = 5.5 } = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
    const r = Math.sqrt(dx * dx + dy * dy);
    let v = Math.exp(-r * r * falloff) * (1 - core) + core * Math.exp(-r * r * falloff * 6);
    v *= clamp((1 - r) * 4, 0, 1);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(clamp(v, 0, 1) * 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/* ----------------------------------------------------------------------------
 * Grafismo DOM (.bc-cine-*)
 * ------------------------------------------------------------------------- */
const CSS = `
.bc-cine{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden;font-family:var(--font-display,"Outfit",system-ui,sans-serif);color:#f3f5ff;-webkit-font-smoothing:antialiased}
.bc-cine-bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .9s cubic-bezier(.65,0,.35,1)}
.bc-cine-bar.top{top:0}.bc-cine-bar.bot{bottom:0}
.bc-cine-fade{position:absolute;inset:0;background:#000;opacity:1;transition:opacity 1.6s ease}
.bc-cine-fade.off{opacity:0}
.bc-cine-title{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0;transition:opacity 1.8s ease, letter-spacing 9s cubic-bezier(.16,1,.3,1), filter 1.8s ease;filter:blur(6px);letter-spacing:.32em}
.bc-cine-title.on{opacity:1;filter:blur(0);letter-spacing:.42em}
.bc-cine-title .k{display:block;font-family:var(--font-body,"Inter",system-ui,sans-serif);font-weight:500;font-size:clamp(9px,.85vmin + 4px,15px);letter-spacing:.5em;text-transform:uppercase;opacity:.72;margin-bottom:1.4em}
.bc-cine-title .t{display:block;font-weight:300;font-size:clamp(22px,4.4vmin + 6px,74px);line-height:1.05;text-transform:uppercase;text-shadow:0 0 40px rgba(0,0,0,.6)}
.bc-cine-title .s{display:block;font-family:var(--font-body,"Inter",system-ui,sans-serif);font-weight:400;font-size:clamp(9px,.8vmin + 5px,15px);letter-spacing:.34em;text-transform:uppercase;opacity:.6;margin-top:1.6em}
.bc-cine-lower{position:absolute;left:6%;bottom:12%;opacity:0;transform:translateX(-12px);transition:opacity 1.1s ease,transform 1.4s cubic-bezier(.16,1,.3,1);text-shadow:0 1px 18px rgba(0,0,0,.65)}
.bc-cine-lower.on{opacity:1;transform:none}
.bc-cine-lower .l{width:2.4em;height:2px;background:currentColor;opacity:.85;margin-bottom:.9em;transform-origin:left;transform:scaleX(0);transition:transform 1.2s .25s cubic-bezier(.16,1,.3,1)}
.bc-cine-lower.on .l{transform:scaleX(1)}
.bc-cine-lower .k{font-family:var(--font-body,"Inter",system-ui,sans-serif);font-weight:600;font-size:clamp(9px,.7vmin + 5px,14px);letter-spacing:.32em;text-transform:uppercase;opacity:.75}
.bc-cine-lower .t{font-weight:400;font-size:clamp(17px,2.2vmin + 6px,40px);letter-spacing:.04em;margin-top:.15em}
.bc-cine-lower .s{font-family:var(--font-body,"Inter",system-ui,sans-serif);font-weight:400;font-size:clamp(10px,.8vmin + 5px,16px);letter-spacing:.06em;opacity:.7;margin-top:.35em}
.bc-cine-tag{position:absolute;right:6%;bottom:12%;text-align:right;opacity:0;transition:opacity 1s ease;font-family:var(--font-body,"Inter",system-ui,sans-serif);font-variant-numeric:tabular-nums;text-shadow:0 1px 14px rgba(0,0,0,.7)}
.bc-cine-tag.on{opacity:.9}
.bc-cine-tag .v{font-family:var(--font-display,"Outfit",system-ui,sans-serif);font-weight:300;font-size:clamp(16px,2vmin + 6px,36px);letter-spacing:.04em}
.bc-cine-tag .u{font-size:.5em;opacity:.7;margin-left:.2em;letter-spacing:.1em}
.bc-cine-tag .k{font-size:clamp(8px,.6vmin + 5px,12px);letter-spacing:.3em;text-transform:uppercase;opacity:.7;margin-bottom:.3em}
.bc-cine-sub{position:absolute;left:8%;right:8%;bottom:7%;text-align:center;opacity:0;transition:opacity .5s ease;font-family:var(--font-body,"Inter",system-ui,sans-serif);font-size:clamp(12px,1.5vmin + 5px,28px);font-weight:500;color:#fff;text-shadow:0 0 6px #000,0 2px 10px rgba(0,0,0,.9)}
.bc-cine-sub.on{opacity:1}
.bc-cine-portrait .bc-cine-lower{left:7%;bottom:24%}
.bc-cine-portrait .bc-cine-tag{right:7%;top:14%;bottom:auto}
.bc-cine-portrait .bc-cine-sub{bottom:16%}
html.reduced-motion .bc-cine *{transition-duration:.01s!important}
`;

function injectStyles() {
  if (document.getElementById('bc-cine-styles')) return;
  const s = document.createElement('style');
  s.id = 'bc-cine-styles';
  s.textContent = CSS;
  document.head.append(s);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Capa de grafismo cinematográfico dentro de `gfx`.
 * cues: [{ type:'title'|'lower'|'sub', from, to, k, t, s }]  (segundos de emisión)
 * opts.letterbox: relación (2.39) o 0 · opts.fadeIn: segundos de fundido inicial
 */
export function createOverlay(gfx, { letterbox = 0, cues = [], fadeIn = 1.2, loop = 0 } = {}) {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'bc-cine';
  root.setAttribute('aria-hidden', 'true');
  const top = document.createElement('div'); top.className = 'bc-cine-bar top';
  const bot = document.createElement('div'); bot.className = 'bc-cine-bar bot';
  const fade = document.createElement('div'); fade.className = 'bc-cine-fade';
  const items = cues.map((c) => {
    const el = document.createElement('div');
    el.className = `bc-cine-${c.type}`;
    if (c.type === 'lower') el.innerHTML = `<div class="l"></div>${c.k ? `<div class="k">${esc(c.k)}</div>` : ''}<div class="t">${esc(c.t)}</div>${c.s ? `<div class="s">${esc(c.s)}</div>` : ''}`;
    else if (c.type === 'title') el.innerHTML = `${c.k ? `<span class="k">${esc(c.k)}</span>` : ''}<span class="t">${esc(c.t)}</span>${c.s ? `<span class="s">${esc(c.s)}</span>` : ''}`;
    else el.textContent = c.t;
    root.append(el);
    return { c, el, on: false };
  });
  const tag = document.createElement('div'); tag.className = 'bc-cine-tag';
  tag.innerHTML = '<div class="k"></div><div class="v"></div>';
  const tagK = tag.firstChild, tagV = tag.lastChild;
  root.append(tag, top, bot, fade);
  if (gfx) gfx.append(root);
  let lastTag = '', tagOn = false, ratio = letterbox, faded = false, lastW = 0, lastH = 0;

  const api = {
    root,
    resize(w, h) {
      lastW = w; lastH = h;
      const portrait = h > w * 1.05;
      root.classList.toggle('bc-cine-portrait', portrait);
      const bar = ratio && !portrait && w / h < ratio + 0.01 ? Math.max(0, (h - w / ratio) / 2) : 0;
      top.style.height = bot.style.height = `${Math.round(bar)}px`;
    },
    setLetterbox(r) { ratio = r; if (lastW) api.resize(lastW, lastH); },
    /** Texto de dato (profundidad, altitud…) — key/valor/unidad. */
    setTag(k, v, u = '') {
      const s = `${k}|${v}|${u}`;
      if (s === lastTag) return;
      lastTag = s;
      tagK.textContent = k;
      tagV.innerHTML = `${esc(v)}${u ? `<span class="u">${esc(u)}</span>` : ''}`;
    },
    showTag(on) { if (on !== tagOn) { tagOn = on; tag.classList.toggle('on', on); } },
    update(t) {
      if (!faded && t > 0.05) { faded = true; requestAnimationFrame(() => fade.classList.add('off')); }
      const tt = loop ? t % loop : t;
      for (const it of items) {
        const on = tt >= it.c.from && tt < it.c.to;
        if (on !== it.on) { it.on = on; it.el.classList.toggle('on', on); }
      }
    },
    dispose() { root.remove(); },
  };
  fade.style.transitionDuration = `${fadeIn}s`;
  return api;
}

/* ----------------------------------------------------------------------------
 * Audio procedural (WebAudio)
 * ------------------------------------------------------------------------- */
export function noiseBuffer(ctx, seconds = 4, color = 'white', rng = Math.random) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = rng() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
      } else d[i] = w;
    }
    // fundido cruzado en el bucle para evitar clics
    const f = Math.min(2048, len >> 3);
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k); }
  }
  return buf;
}

/** Pequeño gestor de nodos y temporizadores para `sound()`; stop() lo libera todo. */
export function soundKit(ctx, out) {
  const nodes = [], timers = new Set(), sources = [];
  let alive = true;
  const kit = {
    ctx, out,
    get alive() { return alive; },
    node(n) { nodes.push(n); return n; },
    gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; nodes.push(g); return g; },
    filter(type, freq, q = 0.7) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; nodes.push(f); return f; },
    osc(type, freq) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; nodes.push(o); sources.push(o); return o; },
    loop(buffer, rate = 1) { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate; nodes.push(s); sources.push(s); return s; },
    panner(p = 0) { const n = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (n.pan) n.pan.value = p; nodes.push(n); return n; },
    /** Programa fn() cada [min,max] s mientras siga vivo. */
    every(min, max, fn, rnd = Math.random) {
      const go = () => {
        if (!alive) return;
        const id = setTimeout(() => { timers.delete(id); if (!alive) return; try { fn(); } catch {} go(); }, (min + rnd() * (max - min)) * 1000);
        timers.add(id);
      };
      go();
    },
    after(sec, fn) { const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, sec * 1000); timers.add(id); },
    /** Fuente efímera: se desconecta sola al acabar. */
    oneShot(src, stopAt) {
      src.start(); src.stop(stopAt);
      src.onended = () => { try { src.disconnect(); } catch {} };
      return src;
    },
    stop() {
      if (!alive) return;
      alive = false;
      timers.forEach((id) => clearTimeout(id)); timers.clear();
      const now = ctx.currentTime;
      try { master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, now + 0.25); } catch {}
      setTimeout(() => {
        for (const s of sources) { try { s.stop(); } catch {} }
        for (const n of nodes) { try { n.disconnect(); } catch {} }
        try { master.disconnect(); } catch {}
      }, 320);
    },
  };
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
  master.connect(out);
  kit.master = master;
  return kit;
}
