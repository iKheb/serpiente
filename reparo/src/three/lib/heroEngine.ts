/**
 * Motor del HeroDevice (sin React): escena, cámara, teléfono, iluminación,
 * animación de "desarme", flotación y parallax del puntero.
 */
import { Group, MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { Viewport } from './viewport';
import { buildPhone, DISPLAY, DISPLAY_ASPECT, LAYER_ORDER, PHONE, type PhoneModel } from './phone';
import { ScreenPainter, type ScreenData } from './screen';
import { addStudioLights, Bokeh, createContactShadow, createGlow, createStudioEnvironment, setGlowTheme, type StudioEnv, type StudioLights } from './studio';
import { disposeObject } from './dispose';
import { whenFontsReady, type ThemeName } from './env';

export interface HeroEngineOptions {
  variant: 'hero' | 'compact';
  interactive: boolean;
  autoExplode: boolean;
  reducedMotion: boolean;
  theme: ThemeName;
  screen?: ScreenData;
  exploded?: boolean;
  onReady?: () => void;
  onContextLost?: () => void;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (cur: number, target: number, lambda: number, dt: number) => MathUtils.damp(cur, target, lambda, dt);

const POSE = {
  hero: {
    assembled: { x: 0.07, y: -0.42, z: 0.045 },
    exploded: { x: 0.16, y: -0.7, z: 0.07 },
    fill: 0.88,
  },
  compact: {
    assembled: { x: 0.05, y: -0.32, z: 0.035 },
    exploded: { x: 0.12, y: -0.62, z: 0.05 },
    fill: 0.9,
  },
} as const;

export class HeroEngine {
  private vp: Viewport;
  private scene = new Scene();
  private camera = new PerspectiveCamera(24, 1, 0.5, 200);
  private env: StudioEnv;
  private lights: StudioLights;
  private phone: PhoneModel;
  private painter: ScreenPainter;
  private stage = new Group();
  private tilt = new Group();
  private pose = new Group();
  private glow: Mesh;
  private glow2: Mesh;
  private shadow: Mesh;
  private poseOverride: { x: number; y: number; z: number } | null = null;
  private bokeh: Bokeh;
  private host: HTMLElement;
  private o: HeroEngineOptions;

  private explodeT = 0;
  private explodeTarget = 0;
  private hovering = false;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private timers: number[] = [];
  private readyFired = false;
  private disposed = false;
  private fitT = -1;

  constructor(host: HTMLElement, o: HeroEngineOptions) {
    this.host = host;
    this.o = { ...o };
    const compact = o.variant === 'compact';
    this.vp = new Viewport({ container: host, continuous: !o.reducedMotion, fps: compact ? 45 : 0 });
    const renderer = this.vp.renderer;

    this.env = createStudioEnvironment(renderer);
    this.scene.environment = this.env.texture;
    this.lights = addStudioLights(this.scene);

    const texW = compact ? 560 : 760;
    this.painter = new ScreenPainter(DISPLAY_ASPECT, texW);
    this.painter.texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    this.painter.drawDashboard(o.screen, compact ? 'compact' : 'hero');

    this.phone = buildPhone(this.painter.texture, { pcbSize: compact ? 768 : 1024 });
    this.pose.add(this.phone.root);
    this.tilt.add(this.pose);
    this.stage.add(this.tilt);
    this.scene.add(this.stage);

    this.glow = createGlow(compact ? 10 : 12.5, 'iris');
    this.glow.position.set(-0.9, 0.9, -3.4);
    this.scene.add(this.glow);
    this.glow2 = createGlow(compact ? 7.5 : 9.5, 'cyan');
    this.glow2.position.set(1.5, -1.7, -3.8);
    this.scene.add(this.glow2);
    this.shadow = createContactShadow(4.6, 1.05);
    this.shadow.position.set(0.15, -PHONE.H / 2 - 0.85, -0.6);
    this.scene.add(this.shadow);

    this.bokeh = new Bokeh({
      count: compact ? 22 : 64,
      spread: compact ? [4.6, 4.4, 2.5] : [7.5, 5, 3.5],
      center: [0.3, 0, -2.6],
      size: compact ? [0.07, 0.32] : [0.06, 0.42],
      avoidRadius: compact ? 1.6 : 2.2,
      seed: compact ? 9 : 5,
    });
    this.scene.add(this.bokeh.points);

    this.camera.position.set(0, 0.9, 30);
    this.camera.lookAt(0, 0, 0);

    this.setTheme(o.theme);
    this.applyControlled(o.exploded, true);

    this.vp.onResize = () => this.fit(true);
    this.vp.onFrame = (dt, t) => this.frame(dt, t);
    this.vp.onContextLost = () => o.onContextLost?.();
    this.fit(true);
    this.bind();
    if (import.meta.env.DEV) (host as HTMLElement & { __engine?: HeroEngine }).__engine = this;

    if (o.autoExplode && !o.reducedMotion && o.exploded === undefined) {
      this.timers.push(
        window.setTimeout(() => {
          if (this.o.exploded !== undefined) return;
          this.explodeTarget = 1;
          this.timers.push(
            window.setTimeout(() => {
              if (this.o.exploded === undefined && !this.hovering) this.explodeTarget = 0;
              this.vp.invalidate();
            }, 2300),
          );
          this.vp.invalidate();
        }, 700),
      );
    }

    whenFontsReady().then(() => {
      if (this.disposed) return;
      this.painter.drawDashboard(this.o.screen, compact ? 'compact' : 'hero');
      this.vp.invalidate();
    });
    this.vp.invalidate();
  }

  /* ------------------------------------------------------------ API */

  setScreen(screen: ScreenData | undefined) {
    this.o.screen = screen;
    this.painter.drawDashboard(screen, this.o.variant === 'compact' ? 'compact' : 'hero');
    this.vp.invalidate();
  }

  setTheme(theme: ThemeName) {
    this.o.theme = theme;
    const light = theme === 'light';
    this.vp.renderer.toneMappingExposure = light ? 1.08 : 1.0;
    this.scene.environmentIntensity = light ? 1.15 : 1.0;
    this.lights.setTheme(theme);
    this.bokeh.setTheme(theme);
    setGlowTheme(this.glow, theme, this.o.variant === 'compact' ? 0.8 : 1);
    setGlowTheme(this.glow2, theme, this.o.variant === 'compact' ? 0.5 : 0.62);
    (this.shadow.material as MeshBasicMaterial).opacity = light ? 0.32 : 0.7;
    this.vp.invalidate();
  }

  setExploded(v: boolean | undefined) {
    this.applyControlled(v, false);
  }

  setReducedMotion(v: boolean) {
    this.o.reducedMotion = v;
    this.vp.setContinuous(!v);
    if (v) {
      this.explodeT = this.explodeTarget;
      this.pointer.tx = this.pointer.ty = 0;
    }
    this.vp.invalidate();
  }

  setInteractive(v: boolean) {
    this.o.interactive = v;
    if (!v) {
      this.hovering = false;
      this.pointer.tx = this.pointer.ty = 0;
      if (this.o.exploded === undefined) this.explodeTarget = 0;
    }
    this.vp.invalidate();
  }

  /** Depuración / composiciones fijas: fuerza la rotación base del teléfono. */
  setPoseOverride(rot: { x: number; y: number; z: number } | null) {
    this.poseOverride = rot;
    this.vp.invalidate();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.timers.forEach((t) => clearTimeout(t));
    this.unbind();
    disposeObject(this.scene);
    this.painter.dispose();
    this.env.dispose();
    this.scene.environment = null;
    this.vp.dispose();
  }

  /* ---------------------------------------------------------- interno */

  private applyControlled(v: boolean | undefined, initial: boolean) {
    this.o.exploded = v;
    if (v !== undefined) {
      this.explodeTarget = v ? 1 : 0;
      if (initial || this.o.reducedMotion) this.explodeT = this.explodeTarget;
    }
    this.vp?.invalidate();
  }

  private onEnter = (e: PointerEvent) => {
    if (!this.o.interactive || e.pointerType !== 'mouse') return;
    this.hovering = true;
    if (this.o.exploded === undefined && !this.o.reducedMotion) this.explodeTarget = 1;
    this.vp.invalidate();
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    this.hovering = false;
    this.pointer.tx = 0;
    this.pointer.ty = 0;
    if (this.o.exploded === undefined) this.explodeTarget = 0;
    this.vp.invalidate();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.o.interactive || this.o.reducedMotion) return;
    const r = this.host.getBoundingClientRect();
    this.pointer.tx = MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    this.pointer.ty = MathUtils.clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1, 1);
  };

  private onDown = (e: PointerEvent) => {
    if (!this.o.interactive || e.pointerType === 'mouse' || this.o.exploded !== undefined || this.o.reducedMotion) return;
    this.explodeTarget = this.explodeTarget > 0.5 ? 0 : 1;
    this.timers.push(
      window.setTimeout(() => {
        if (this.o.exploded === undefined) this.explodeTarget = 0;
        this.vp.invalidate();
      }, 3200),
    );
    this.vp.invalidate();
  };

  private onTouchEnd = () => {
    this.pointer.tx = 0;
    this.pointer.ty = 0;
  };

  private bind() {
    const h = this.host;
    h.addEventListener('pointerenter', this.onEnter);
    h.addEventListener('pointerleave', this.onLeave);
    h.addEventListener('pointermove', this.onMove, { passive: true });
    h.addEventListener('pointerdown', this.onDown);
    h.addEventListener('pointerup', this.onTouchEnd);
    h.addEventListener('pointercancel', this.onTouchEnd);
  }

  private unbind() {
    const h = this.host;
    h.removeEventListener('pointerenter', this.onEnter);
    h.removeEventListener('pointerleave', this.onLeave);
    h.removeEventListener('pointermove', this.onMove);
    h.removeEventListener('pointerdown', this.onDown);
    h.removeEventListener('pointerup', this.onTouchEnd);
    h.removeEventListener('pointercancel', this.onTouchEnd);
  }

  /** Ajusta la distancia de cámara al tamaño del lienzo y al grado de explosión. */
  private fit(force = false) {
    const e = easeInOutCubic(MathUtils.clamp(this.explodeT, 0, 1));
    if (!force && Math.abs(e - this.fitT) < 1e-4) return;
    this.fitT = e;
    const { width, height } = this.vp;
    const aspect = width / height;
    this.camera.aspect = aspect;
    const P = POSE[this.o.variant];
    const halfH = MathUtils.lerp(PHONE.H / 2 + 0.25, PHONE.H / 2 + 0.95, e) / P.fill;
    const halfW = MathUtils.lerp(2.15, 3.85, e) / P.fill;
    const t = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(halfH / t, halfW / (t * aspect));
    this.camera.position.set(0, dist * 0.035, dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private frame(dt: number, time: number) {
    const reduced = this.o.reducedMotion;
    // explosión (lineal en el tiempo, suavizado por capa con escalonado)
    if (reduced) this.explodeT = this.explodeTarget;
    else {
      const dir = Math.sign(this.explodeTarget - this.explodeT);
      if (dir !== 0) {
        this.explodeT += (dir * dt) / 1.25;
        this.explodeT = dir > 0 ? Math.min(this.explodeT, this.explodeTarget) : Math.max(this.explodeT, this.explodeTarget);
      }
    }
    const n = LAYER_ORDER.length;
    const s = 0.1;
    const amounts = LAYER_ORDER.map((_, i) => easeInOutCubic(MathUtils.clamp(this.explodeT * (1 + s * (n - 1)) - s * i, 0, 1)));
    this.phone.setExplode(amounts);
    const e = easeInOutCubic(MathUtils.clamp(this.explodeT, 0, 1));
    this.fit();

    const P = POSE[this.o.variant];
    if (this.poseOverride) this.pose.rotation.set(this.poseOverride.x, this.poseOverride.y, this.poseOverride.z);
    else this.pose.rotation.set(
      MathUtils.lerp(P.assembled.x, P.exploded.x, e),
      MathUtils.lerp(P.assembled.y, P.exploded.y, e) + (reduced ? 0 : Math.sin(time * 0.42) * 0.045),
      MathUtils.lerp(P.assembled.z, P.exploded.z, e),
    );

    // parallax del puntero
    const p = this.pointer;
    p.x = reduced ? 0 : damp(p.x, p.tx, 4.5, dt);
    p.y = reduced ? 0 : damp(p.y, p.ty, 4.5, dt);
    this.tilt.rotation.set(-p.y * 0.16, p.x * 0.26, 0);

    // flotación
    const fy = reduced ? 0 : Math.sin(time * 1.05) * 0.11;
    this.stage.position.y = fy;
    this.stage.rotation.z = reduced ? 0 : Math.sin(time * 0.63) * 0.012;
    const sm = this.shadow.material as MeshBasicMaterial;
    const base = this.o.theme === 'light' ? 0.32 : 0.7;
    sm.opacity = base * (1 - fy * 1.6) * (1 - e * 0.35);
    this.shadow.scale.set(1 + fy * 0.5 + e * 0.35, 1 + fy * 0.3, 1);
    this.glow.scale.setScalar(1 + e * 0.18 + (reduced ? 0 : Math.sin(time * 0.8) * 0.03));
    this.glow2.scale.setScalar(1 + e * 0.12 + (reduced ? 0 : Math.cos(time * 0.65) * 0.035));

    this.bokeh.update(reduced ? 0 : time, this.vp.pixelRatio, this.vp.height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2))), 1);

    this.vp.renderer.render(this.scene, this.camera);
    if (!this.readyFired) {
      this.readyFired = true;
      this.o.onReady?.();
    }
    // mientras anima la explosión en modo bajo demanda, seguir pidiendo frames
    if (reduced && Math.abs(this.explodeT - this.explodeTarget) > 1e-3) this.vp.invalidate();
  }
}

// Exportado para documentación de proporciones.
export const HERO_DISPLAY = DISPLAY;
