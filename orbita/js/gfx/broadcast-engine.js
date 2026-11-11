// =============================================================================
// Órbita · Motor de emisiones en vivo (A2)
//
//   const eng = new BroadcastEngine(container, { device })
//   await eng.load(sceneId, { seed, palette, title, live, program, channel, duration?, start?, bug? })
//   eng.play() · eng.pause() · eng.seek(s) · eng.time · eng.duration · eng.playing
//   eng.setVolume(0..1) · eng.setMuted(bool) · eng.setQuality('auto'|'4k'|'1080'|'720'|'480')
//   eng.dispose()
//   eng.onTime(t) · eng.onReady() · eng.onBuffering(bool) · eng.onEnded()   (callbacks)
//   Extras: eng.sceneId · eng.quality · eng.resolution {w,h} · eng.fps · eng.snapshot()
//
// Capas DOM dentro de `container`:
//   .bc-root > canvas.bc-canvas + .bc-gfx (grafismo de la escena) + .bc-bug (mosca de canal) + .bc-fade
// Interfaz de escena: ver js/gfx/broadcasts/index.js
// =============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { device as defaultDevice } from '../core/device.js';
import { createFinalPass } from './broadcast/post.js';
import { mulberry32, hashStr, disposeDeep, clamp } from './broadcast/util.js';
import { loadScene } from './broadcasts/index.js';
import { getAudioContext, resumeAudio } from '../audio/context.js';

const QUALITY_H = { '4k': 2160, '1080': 1080, '720': 720, '480': 480 };
const DEFAULT_POST = { bloom: { strength: 0.8, radius: 0.55, threshold: 0.85 }, grain: 0.05, vignette: 0.32, aberration: 0.25, exposure: 1.0, saturation: 1.0 };
const DEFAULT_PALETTE = ['#0b0f24', '#6d7cff', '#ffffff'];

export class BroadcastEngine {
  constructor(container, { device } = {}) {
    this.container = container;
    this.device = device && typeof device.pixelRatio === 'function' ? device : defaultDevice;
    this.time = 0;
    this.playing = false;
    this.quality = 'auto';
    this.sceneId = null;
    this.volume = 0.8;
    this.muted = false;
    this.fps = 60;
    this.resolution = { w: 0, h: 0 };
    this.onTime = null; this.onReady = null; this.onBuffering = null; this.onEnded = null;

    this._opts = {};
    this._active = null;
    this._token = 0;
    this._raf = 0;
    this._last = 0;
    this._dyn = 1;          // escala dinámica (calidad auto)
    this._ft = 16;          // tiempo de frame suavizado (ms)
    this._visible = true;
    this._inView = true;
    this._disposed = false;
    this._sound = null;
    this._sceneBus = null;
    this._timeAcc = 0;

    // DOM
    const root = document.createElement('div');
    root.className = 'bc-root';
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bc-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.gfx = document.createElement('div');
    this.gfx.className = 'bc-gfx';
    this.bug = document.createElement('div');
    this.bug.className = 'bc-bug';
    this.fade = document.createElement('div');
    this.fade.className = 'bc-fade is-on';
    root.append(this.canvas, this.gfx, this.bug, this.fade);
    container.append(root);

    // Renderer
    this.gl = false;
    try {
      if (this.device.webgl === false) throw new Error('sin WebGL');
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: false, alpha: false, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false,
      });
      this.renderer.setPixelRatio(1);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.NoToneMapping; // ACES en la pasada final
      this.renderer.shadowMap.enabled = this.device.tier >= 1;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setClearColor(0x000000, 1);
      this.gl = true;
      this._buildComposer();
    } catch (e) {
      console.warn('[emisión] WebGL no disponible:', e?.message || e);
      root.classList.add('bc-nogl');
    }

    // Observadores
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(root);
    try {
      this._io = new IntersectionObserver((ents) => {
        this._inView = ents.some((e) => e.isIntersecting);
        this._kick();
      }, { threshold: 0.01 });
      this._io.observe(root);
    } catch { this._io = null; }
    this._onVis = () => {
      this._visible = !document.hidden;
      if (!this._visible) this._applyGain(0, 0.05);
      else this._applyGain();
      this._kick();
    };
    document.addEventListener('visibilitychange', this._onVis);
    this._onLost = (e) => { e.preventDefault(); this._lost = true; };
    this._onRestored = () => { this._lost = false; if (this.sceneId) this.load(this.sceneId, this._opts); };
    this.canvas.addEventListener('webglcontextlost', this._onLost);
    this.canvas.addEventListener('webglcontextrestored', this._onRestored);

    this._loop = this._loop.bind(this);
    this._resize();
  }

  // ---------------------------------------------------------------------------
  get duration() {
    const d = Number(this._opts.duration);
    if (d > 0) return d;
    return this._opts.live ? Infinity : 0;
  }

  _buildComposer() {
    const r = this.renderer;
    const tier = this.device.tier;
    const isGL2 = r.capabilities.isWebGL2;
    const rt = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType,
      samples: isGL2 && tier >= 2 ? 4 : 0,
    });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(1);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.85);
    // En gama baja el bloom trabaja a media resolución
    const bloomScale = tier === 0 ? 0.5 : tier === 1 ? 0.75 : 1;
    const origSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h) => origSize(Math.max(64, Math.round(w * bloomScale)), Math.max(64, Math.round(h * bloomScale)));
    this.composer.addPass(this.bloom);
    this.finalPass = createFinalPass();
    this.composer.addPass(this.finalPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  // ---------------------------------------------------------------------------
  _targetSize() {
    const cw = Math.max(2, this.root.clientWidth || this.container.clientWidth || 640);
    const ch = Math.max(2, this.root.clientHeight || this.container.clientHeight || 360);
    const aspect = cw / ch;
    const dpr = window.devicePixelRatio || 1;
    const tier = this.device.tier;
    let h;
    if (this.quality === 'auto') {
      h = ch * this.device.pixelRatio() * this._dyn * (tier === 0 ? 0.9 : 1);
      h = Math.min(h, tier >= 2 ? 2160 : tier === 1 ? 1440 : 1080);
    } else {
      const H = QUALITY_H[this.quality] || 1080;
      const phys = ch * Math.min(dpr, 2);
      if (this.quality === '4k') h = Math.min(H, phys * 1.5, tier >= 2 ? 2160 : tier === 1 ? 1440 : 1080);
      else h = Math.min(H, Math.max(phys, 240));
    }
    h = Math.max(120, Math.round(h));
    const w = Math.max(160, Math.round(h * aspect));
    return { w, h, cw, ch };
  }

  _resize() {
    if (this._disposed) return;
    const { w, h, ch } = this._targetSize();
    this.root.style.setProperty('--bc-u', `${(ch / 100).toFixed(3)}px`);
    this.root.classList.toggle('bc-small', ch < 300);
    if (!this.gl) return;
    if (w === this.resolution.w && h === this.resolution.h) return;
    this.resolution = { w, h };
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.finalPass.uniforms.uRes.value.set(w, h);
    if (this._active) {
      const cam = this._active.camera;
      if (cam?.isPerspectiveCamera) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
      try { this._active.resize?.(w, h); } catch (e) { console.error(e); }
      if (!this.playing) this._render(0);
    }
  }

  // ---------------------------------------------------------------------------
  async load(sceneId, opts = {}) {
    if (this._disposed) return;
    const token = ++this._token;
    this._buffering(true);
    const had = !!this._active;
    if (had) {
      this.fade.classList.add('is-on');
      await new Promise((r) => setTimeout(r, 280));
      if (token !== this._token || this._disposed) return;
    }
    this._teardown();

    const palette = Array.isArray(opts.palette) && opts.palette.length ? opts.palette : DEFAULT_PALETTE;
    const seed = Number.isFinite(+opts.seed) ? +opts.seed : 1;
    this._opts = { ...opts, seed, palette, title: opts.title || '', live: !!opts.live };
    this.sceneId = sceneId;
    this.time = Number(opts.start) || 0;
    this._ended = false;
    this.gfx.replaceChildren();
    this.gfx.dataset.scene = sceneId;
    this.root.dataset.scene = sceneId;
    this._renderBug();

    if (!this.gl) {
      this.root.style.setProperty('--bc-c1', palette[0]);
      this.root.style.setProperty('--bc-c2', palette[1] || palette[0]);
      this.fade.classList.remove('is-on');
      this._buffering(false);
      this.onReady?.();
      this._kick();
      return;
    }

    let inst = null;
    const ctxArgs = () => ({
      THREE, renderer: this.renderer, device: this.device, opts: { ...this._opts }, gfx: this.gfx,
      rng: mulberry32((seed * 2654435761) ^ hashStr(sceneId)),
    });
    try {
      const mod = await loadScene(sceneId);
      if (token !== this._token || this._disposed) return;
      inst = await mod.create(ctxArgs());
    } catch (e) {
      console.warn(`[emisión] la escena «${sceneId}» falló; uso la de reserva`, e);
      try {
        this.gfx.replaceChildren();
        const fb = (await import('./broadcast/fallback.js')).default;
        inst = await fb.create(ctxArgs());
      } catch (e2) { console.error(e2); }
    }
    if (token !== this._token || this._disposed) { this._disposeInstance(inst); return; }
    if (!inst || !inst.scene || !inst.camera) { this._buffering(false); return; }

    this._active = inst;
    this.renderPass.scene = inst.scene;
    this.renderPass.camera = inst.camera;
    const { w, h } = this.resolution;
    if (inst.camera.isPerspectiveCamera && w && h) { inst.camera.aspect = w / h; inst.camera.updateProjectionMatrix(); }
    try { inst.resize?.(w, h); } catch (e) { console.error(e); }

    // Primer estado + precompilación de shaders (evita tirones al empezar)
    try { inst.update(0, this.time); } catch (e) { console.error(e); }
    try { if (this.renderer.compileAsync) await this.renderer.compileAsync(inst.scene, inst.camera); } catch { /* */ }
    if (token !== this._token || this._disposed) return;
    this._render(0);

    if (this.playing) this._startSound();
    this._last = performance.now();
    this.fade.classList.remove('is-on');
    this._buffering(false);
    this.onReady?.();
    this._kick();
  }

  _renderBug() {
    const ch = this._opts.channel;
    const show = this._opts.live && ch && this._opts.bug !== false;
    this.bug.replaceChildren();
    this.bug.hidden = !show;
    if (!show) return;
    const name = typeof ch === 'string' ? ch : (ch.name || '');
    const glyph = typeof ch === 'string' ? ch.slice(0, 2) : (ch.art?.glyph || ch.short || name.slice(0, 2));
    const pal = (typeof ch === 'object' && ch.art?.palette) || this._opts.palette;
    const g = document.createElement('span');
    g.className = 'bc-bug-glyph';
    g.textContent = glyph;
    g.style.setProperty('--bc-bug-a', pal[0]);
    g.style.setProperty('--bc-bug-b', pal[1] || pal[0]);
    const n = document.createElement('span');
    n.className = 'bc-bug-name';
    n.textContent = name;
    this.bug.append(g, n);
  }

  _teardown() {
    this._stopSound();
    if (this._active) {
      this._disposeInstance(this._active);
      this._active = null;
    }
    if (this.renderPass) { this.renderPass.scene = new THREE.Scene(); }
  }

  _disposeInstance(inst) {
    if (!inst) return;
    try { inst.dispose?.(); } catch (e) { console.error(e); }
    try { disposeDeep(inst.scene); } catch { /* */ }
  }

  // ---------------------------------------------------------------------------
  play() {
    if (this._disposed) return;
    if (!this._opts.live && this.duration && this.time >= this.duration - 0.05) this.time = 0;
    this.playing = true;
    resumeAudio();
    if (this._active && !this._sound) this._startSound();
    this._applyGain();
    this._last = performance.now();
    this._kick();
  }

  pause() {
    this.playing = false;
    this._applyGain(0, 0.04);
    this._kick();
  }

  seek(s) {
    s = Math.max(0, Number(s) || 0);
    if (this.duration && Number.isFinite(this.duration)) s = Math.min(s, this.duration);
    const jump = s - this.time;
    if (this._active) {
      try {
        if (jump > 0 && jump <= 20) {
          // simula hacia delante (física/IA) sin renderizar
          let t = this.time;
          const step = 1 / 30;
          while (t < s - 1e-6) { const d = Math.min(step, s - t); t += d; this._active.update(d, t); }
        } else {
          this._active.update(1 / 60, s);
        }
      } catch (e) { console.error(e); }
    }
    this.time = s;
    this._ended = false;
    this._render(0);
    this.onTime?.(this.time);
  }

  setVolume(v) { this.volume = clamp(Number(v) || 0, 0, 1); this._applyGain(); }
  setMuted(b) { this.muted = !!b; this._applyGain(); }

  setQuality(q) {
    q = String(q || 'auto').toLowerCase();
    if (q === '2160' || q === 'uhd') q = '4k';
    if (!['auto', '4k', '1080', '720', '480'].includes(q)) q = 'auto';
    if (q === this.quality) return;
    this.quality = q;
    this._dyn = 1;
    // Cambio de calidad: breve "rebuffer" como un reproductor real
    this._buffering(true);
    setTimeout(() => this._buffering(false), 320);
    this._resize();
    if (this.finalPass) this.finalPass.uniforms.uCompress.value = this._compressFor();
  }

  _compressFor() {
    if (this.quality === '480') return 1;
    if (this.quality === '720') return 0.45;
    return 0;
  }

  _buffering(b) {
    this.root.classList.toggle('is-buffering', b);
    try { this.onBuffering?.(b); } catch { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Audio
  _ensureMaster() {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (!this._master) {
      this._master = ctx.createGain();
      this._master.gain.value = 0;
      this._limiter = ctx.createDynamicsCompressor();
      this._limiter.threshold.value = -6; this._limiter.knee.value = 6; this._limiter.ratio.value = 8;
      this._limiter.attack.value = 0.003; this._limiter.release.value = 0.2;
      this._master.connect(this._limiter);
      this._limiter.connect(ctx.destination);
    }
    return ctx;
  }

  _startSound() {
    if (!this._active?.sound || this._sound) return;
    const ctx = this._ensureMaster();
    if (!ctx) return;
    try {
      this._sceneBus = ctx.createGain();
      this._sceneBus.gain.value = 1;
      this._sceneBus.connect(this._master);
      this._sound = this._active.sound(ctx, this._sceneBus) || { stop() {} };
    } catch (e) { console.warn('[emisión] audio', e); this._sound = { stop() {} }; }
    this._applyGain();
  }

  _stopSound() {
    const s = this._sound, bus = this._sceneBus;
    this._sound = null; this._sceneBus = null;
    if (!bus) return;
    const ctx = getAudioContext();
    try { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch { /* */ }
    setTimeout(() => { try { s?.stop?.(); } catch { /* */ } try { bus.disconnect(); } catch { /* */ } }, 260);
  }

  _applyGain(v, tc = 0.12) {
    if (!this._master) return;
    const ctx = getAudioContext();
    const target = v ?? (this.playing && this._visible && !this.muted ? this.volume * this.volume : 0);
    try { this._master.gain.setTargetAtTime(target, ctx.currentTime, tc); } catch { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Bucle
  _kick() {
    if (this._disposed) return;
    const want = this.playing && this._visible && this._inView && !this._lost;
    if (want && !this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame(this._loop); }
    else if (!want && this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
  }

  _loop(now) {
    this._raf = 0;
    if (this._disposed || !this.playing || !this._visible || !this._inView) return;
    const dtRaw = (now - this._last) / 1000;
    this._last = now;
    const dt = Math.min(0.1, Math.max(0, dtRaw));
    this.time += dt;
    let end = false;
    if (!this._opts.live && this.duration && this.time >= this.duration) { this.time = this.duration; end = true; }

    if (this._active) {
      try { this._active.update(dt, this.time); } catch (e) { console.error('[emisión]', e); }
      this._render(dt);
    }
    // ritmo de frame + resolución dinámica (calidad auto)
    const ms = dtRaw * 1000;
    if (ms > 0 && ms < 500) this._ft += (ms - this._ft) * 0.05;
    this.fps = Math.round(1000 / Math.max(1, this._ft));
    if (this.quality === 'auto' && this.gl) this._adapt(now);

    this._timeAcc += dt;
    if (this._timeAcc > 0.25) { this._timeAcc = 0; try { this.onTime?.(this.time); } catch { /* */ } }
    if (end && !this._ended) {
      this._ended = true;
      this.pause();
      try { this.onTime?.(this.time); this.onEnded?.(); } catch { /* */ }
      return;
    }
    this._raf = requestAnimationFrame(this._loop);
  }

  _adapt(now) {
    if (!this._adaptAt) this._adaptAt = now + 2500;
    if (now < this._adaptAt) return;
    this._adaptAt = now + 1500;
    const min = this.device.tier === 0 ? 0.55 : 0.6;
    let d = this._dyn;
    if (this._ft > 24) d = Math.max(min, d * 0.85);
    else if (this._ft < 15 && d < 1) d = Math.min(1, d * 1.08);
    if (Math.abs(d - this._dyn) > 0.01) { this._dyn = d; this._resize(); }
  }

  _render(dt) {
    if (!this.gl || !this._active || this._lost) return;
    const inst = this._active;
    const p = inst.post || {};
    const b = p.bloom || {};
    const D = DEFAULT_POST;
    if (b === false || p.bloom === false) this.bloom.enabled = false;
    else {
      this.bloom.enabled = true;
      this.bloom.strength = b.strength ?? D.bloom.strength;
      this.bloom.radius = b.radius ?? D.bloom.radius;
      this.bloom.threshold = b.threshold ?? D.bloom.threshold;
    }
    const u = this.finalPass.uniforms;
    u.uTime.value = (u.uTime.value + (dt || 0.016)) % 1000;
    u.uGrain.value = (p.grain ?? D.grain) * (this.device.tier === 0 ? 0.8 : 1);
    u.uVignette.value = p.vignette ?? D.vignette;
    u.uAberration.value = p.aberration ?? D.aberration;
    u.uExposure.value = p.exposure ?? D.exposure;
    u.uSaturation.value = p.saturation ?? D.saturation;
    u.uFade.value = p.fade ?? 0;
    if (p.lift) u.uLift.value.set(p.lift[0], p.lift[1], p.lift[2]); else u.uLift.value.set(0, 0, 0);
    if (p.gain) u.uGain.value.set(p.gain[0], p.gain[1], p.gain[2]); else u.uGain.value.set(1, 1, 1);
    u.uCompress.value = this._compressFor();
    if (inst.camera !== this.renderPass.camera) this.renderPass.camera = inst.camera;
    if (inst.scene !== this.renderPass.scene) this.renderPass.scene = inst.scene;
    this.composer.render(dt);
  }

  /** Captura del frame actual como dataURL (miniaturas) */
  snapshot(type = 'image/jpeg', q = 0.82) {
    if (!this.gl) return null;
    this._render(0);
    try { return this.canvas.toDataURL(type, q); } catch { return null; }
  }

  // ---------------------------------------------------------------------------
  dispose() {
    if (this._disposed) return;
    this.pause();
    this._disposed = true;
    this._token++;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._teardown();
    document.removeEventListener('visibilitychange', this._onVis);
    this._ro?.disconnect();
    this._io?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    if (this._master) {
      const m = this._master, l = this._limiter;
      setTimeout(() => { try { m.disconnect(); l.disconnect(); } catch { /* */ } }, 300);
    }
    if (this.gl) {
      try {
        this.composer.renderTarget1.dispose();
        this.composer.renderTarget2.dispose();
        for (const p of this.composer.passes) p.dispose?.();
      } catch { /* */ }
      try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch { /* */ }
    }
    this.root.remove();
    this.onTime = this.onReady = this.onBuffering = this.onEnded = null;
  }
}

export default BroadcastEngine;
