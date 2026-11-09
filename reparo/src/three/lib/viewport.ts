/**
 * Ciclo de vida de un lienzo WebGL: renderer, tamaño (ResizeObserver),
 * visibilidad (IntersectionObserver + document.hidden), bucle de render con
 * pausa automática, render bajo demanda y liberación completa.
 */
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';
import { maxPixelRatio } from './env';

export interface ViewportOptions {
  container: HTMLElement;
  /** Fotogramas por segundo máximos (0 = sin límite). */
  fps?: number;
  /** Render continuo (animaciones) o sólo bajo demanda. */
  continuous?: boolean;
  exposure?: number;
}

export class Viewport {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  width = 1;
  height = 1;
  pixelRatio = 1;
  /** Llamado en cada frame con (dt en s, tiempo en s). */
  onFrame: (dt: number, time: number) => void = () => {};
  onResize: (w: number, h: number) => void = () => {};
  onContextLost: () => void = () => {};

  private container: HTMLElement;
  private raf = 0;
  private last = 0;
  private time = 0;
  private visible = true;
  private dirty = true;
  private disposed = false;
  private continuous: boolean;
  private minFrameMs: number;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;

  constructor(o: ViewportOptions) {
    this.container = o.container;
    this.continuous = o.continuous ?? true;
    this.minFrameMs = o.fps ? 1000 / o.fps - 1 : 0;
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = o.exposure ?? 1;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    const canvas = renderer.domElement;
    this.canvas = canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    this.container.appendChild(canvas);

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.container);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (entries) => {
          this.visible = entries.some((e) => e.isIntersecting);
          this.kick();
        },
        { rootMargin: '120px' },
      );
      this.io.observe(this.container);
    }
    document.addEventListener('visibilitychange', this.kick);
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    this.onContextLost();
  };

  setContinuous(v: boolean) {
    this.continuous = v;
    this.kick();
  }

  resize() {
    if (this.disposed) return;
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const pr = maxPixelRatio();
    if (w === this.width && h === this.height && pr === this.pixelRatio) return;
    this.width = w;
    this.height = h;
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.onResize(w, h);
    this.invalidate();
  }

  /** Solicita al menos un frame (útil en modo bajo demanda). */
  invalidate() {
    this.dirty = true;
    this.kick();
  }

  private get canRun() {
    return !this.disposed && this.visible && !document.hidden;
  }

  private kick = () => {
    if (!this.canRun) {
      this.stop();
      return;
    }
    if (!this.raf && (this.continuous || this.dirty)) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.canRun) return;
    const elapsed = now - this.last;
    if (this.minFrameMs && elapsed < this.minFrameMs && !this.dirty) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    const dt = Math.min(elapsed / 1000, 1 / 20);
    this.last = now;
    this.time += dt;
    this.dirty = false;
    this.onFrame(dt, this.time);
    if (this.continuous || this.dirty) this.raf = requestAnimationFrame(this.tick);
  };

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.ro?.disconnect();
    this.io?.disconnect();
    document.removeEventListener('visibilitychange', this.kick);
    this.canvas.removeEventListener('webglcontextlost', this.handleLost, false);
    this.renderer.dispose();
    try {
      this.renderer.forceContextLoss();
    } catch {
      /* ignorar */
    }
    this.canvas.remove();
  }
}
