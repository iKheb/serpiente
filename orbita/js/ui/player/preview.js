// =============================================================================
// A5 · Vista previa en vivo reutilizable (En vivo, Guía).
// Una única instancia de BroadcastEngine que cambia de escena con debounce.
//
//   const pv = new ChannelPreview(hostEl, { device, store, delay: 600 })
//   pv.set(channel)        // debounce → carga la emisión actual del canal
//   pv.set(channel, { immediate: true })
//   pv.pause() · pv.resume() · pv.dispose()
//   pv.onState = (state) => {}   // 'idle' | 'loading' | 'playing' | 'static'
// =============================================================================
import { BroadcastEngine } from '../../gfx/broadcast-engine.js';
import { artwork } from '../../gfx/artwork.js';
import { nowOn } from '../../data/catalog.js';
import { icon } from '../icons.js';
import { esc } from '../../core/dom.js';
import { hashStr, palette3, rgba, setImg } from './tvdata.js';

export class ChannelPreview {
  constructor(host, { device, store, delay = 600, muted } = {}) {
    this.host = host;
    this.device = device;
    this.store = store;
    this.delay = delay;
    this.muted = muted ?? !device?.isTV;
    this.channel = null;
    this.loaded = null;      // id del canal cargado en el motor
    this.engine = null;
    this.timer = 0;
    this.busy = null;
    this.paused = false;
    this.disposed = false;
    this.onState = null;

    host.classList.add('pv');
    host.innerHTML = `
      <div class="pv-poster" aria-hidden="true">
        <div class="pv-poster-glow"></div>
        <img class="pv-poster-logo" alt="">
        <div class="pv-poster-msg"></div>
      </div>
      <div class="pv-stage" aria-hidden="true"></div>
      <div class="pv-noise" aria-hidden="true"></div>
      <div class="pv-spin" aria-hidden="true"><i></i></div>`;
    this.$poster = host.querySelector('.pv-poster');
    this.$logo = host.querySelector('.pv-poster-logo');
    this.$msg = host.querySelector('.pv-poster-msg');
    this.$stage = host.querySelector('.pv-stage');
    this._vis = () => { if (document.hidden) this.engine?.pause(); else if (!this.paused && this.loaded) this.engine?.play(); };
    document.addEventListener('visibilitychange', this._vis);
  }

  get autoplay() { return this.store ? this.store.setting('autoplayPreviews') !== false : true; }

  _state(s) {
    this.host.dataset.state = s;
    try { this.onState?.(s); } catch { /* */ }
  }

  _poster(ch) {
    const [a, b] = palette3(ch.art?.palette);
    this.$poster.style.setProperty('--pv-a', a);
    this.$poster.style.setProperty('--pv-b', b);
    this.$poster.style.setProperty('--pv-glow', rgba(b, 0.55));
    this.$logo.classList.remove('is-loaded');
    this.$logo.removeAttribute('src');
    setImg(this.$logo, artwork.channelLogo(ch));
    this.$msg.innerHTML = this.autoplay ? '' : `${icon('playCircle', { size: 20 })}<span>Vista previa desactivada</span>`;
  }

  set(ch, { immediate = false } = {}) {
    if (this.disposed || !ch) return;
    const changed = this.channel?.id !== ch.id;
    this.channel = ch;
    clearTimeout(this.timer);
    if (changed) {
      this._poster(ch);
      this.host.classList.add('is-switching');
    }
    if (!this.autoplay) { this.host.classList.remove('is-switching'); this._state('static'); this.engine?.pause(); return; }
    if (this.loaded === ch.id && !changed) return;
    this._state('loading');
    this.timer = setTimeout(() => this._load(), immediate ? 0 : this.delay);
  }

  async _load() {
    if (this.disposed) return;
    if (this.busy) { this.again = true; return; }
    const ch = this.channel;
    if (!ch) return;
    this.busy = (async () => {
      try {
        if (!this.engine) {
          this.engine = new BroadcastEngine(this.$stage, { device: this.device });
          try { this.engine.setMuted?.(this.muted); this.engine.setVolume?.(this.muted ? 0 : (this.store?.setting('volume') ?? 0.8) * 0.7); } catch { /* */ }
        }
        const prog = nowOn(ch.id);
        await this.engine.load(prog?.scene || ch.scene, {
          seed: hashStr(prog?.id || ch.id), palette: ch.art?.palette, title: prog?.title || ch.name,
          live: true, program: prog, channel: ch, preview: true,
        });
        if (this.disposed) return;
        this.loaded = ch.id;
        try { this.engine.setQuality?.(this.device?.tier === 0 ? '480' : '720'); } catch { /* */ }
        if (!this.paused && !document.hidden) this.engine.play();
      } catch (e) { console.warn('[preview]', e); }
    })();
    await this.busy;
    this.busy = null;
    if (this.disposed) return;
    if (this.again || this.channel?.id !== this.loaded) { this.again = false; if (this.channel?.id !== this.loaded) return this._load(); }
    this.host.classList.remove('is-switching');
    this._state('playing');
  }

  setMuted(m) {
    this.muted = m;
    try { this.engine?.setMuted?.(m); if (!m) this.engine?.setVolume?.((this.store?.setting('volume') ?? 0.8) * 0.7); } catch { /* */ }
  }

  pause() { this.paused = true; clearTimeout(this.timer); try { this.engine?.pause(); } catch { /* */ } }
  resume() {
    this.paused = false;
    if (!this.autoplay) return;
    if (this.loaded && this.loaded === this.channel?.id) { try { this.engine?.play(); } catch { /* */ } }
    else if (this.channel) this.set(this.channel, { immediate: true });
  }

  /** Mensaje opcional sobre el póster (p. ej. programa no emitido aún) */
  message(html) { this.$msg.innerHTML = html || ''; }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this._vis);
    try { this.engine?.dispose(); } catch { /* */ }
    this.engine = null;
  }
}

export const previewEsc = esc;
