// STUB — será sustituido por el subagente de emisiones (ver ARCHITECTURE.md).
// Contrato:
//   const eng = new BroadcastEngine(container, { device })
//   await eng.load(sceneId, { seed, palette, title, live:boolean })  // crea/cambia escena
//   eng.play() · eng.pause() · eng.seek(seconds) · eng.time (s) · eng.playing
//   eng.setVolume(0..1) · eng.setMuted(bool) · eng.setQuality('auto'|'4k'|'1080'|'720'|'480')
//   eng.dispose()
//   eng.onTime = (t) => {} · eng.onReady = () => {}
export class BroadcastEngine {
  constructor(container) {
    this.container = container; this.time = 0; this.playing = false;
    this.canvas = document.createElement('canvas'); this.canvas.style.cssText = 'width:100%;height:100%';
    container.append(this.canvas); this._raf = 0; this._last = 0;
  }
  async load(sceneId, opts = {}) { this.scene = sceneId; this.opts = opts; this.onReady?.(); }
  play() { this.playing = true; this._last = performance.now(); const tick = (now) => { if (!this.playing) return; this.time += (now - this._last) / 1000; this._last = now; this._draw(); this.onTime?.(this.time); this._raf = requestAnimationFrame(tick); }; this._raf = requestAnimationFrame(tick); }
  pause() { this.playing = false; cancelAnimationFrame(this._raf); }
  seek(t) { this.time = t; this._draw(); }
  setVolume() {} setMuted() {} setQuality() {}
  _draw() { const c = this.canvas, g = c.getContext('2d'); c.width = c.clientWidth || 640; c.height = c.clientHeight || 360; const p = this.opts?.palette || ['#111', '#333']; g.fillStyle = p[0]; g.fillRect(0, 0, c.width, c.height); g.fillStyle = p[1]; g.beginPath(); g.arc(c.width / 2 + Math.sin(this.time) * 100, c.height / 2, 60, 0, 7); g.fill(); }
  dispose() { this.pause(); this.canvas.remove(); }
}
