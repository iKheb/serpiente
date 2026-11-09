/**
 * Motor de la escena de bienvenida: las piezas del celular flotan dispersas,
 * se ensamblan, la pantalla se enciende con el isotipo/pulso de Reparo y
 * cada paso (`stage`) mueve la composición de cámara.
 */
import { Euler, Group, MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, Vector3, type Object3D } from 'three';
import { Viewport } from './viewport';
import { buildPhone, buildScrew, DISPLAY_ASPECT, EXPLODE_OFFSETS, LAYER_ORDER, PHONE, type LayerKey, type PhoneModel } from './phone';
import { ScreenPainter } from './screen';
import type { ScreenData } from './screenData';
import { addStudioLights, Bokeh, createGlow, createStudioEnvironment, setGlowTheme, type StudioEnv, type StudioLights } from './studio';
import { disposeObject } from './dispose';
import { whenFontsReady, type ThemeName } from './env';
import { BOARD } from './textures';

export interface OnboardingEngineOptions {
  stage: number;
  theme: ThemeName;
  reducedMotion: boolean;
  screen?: ScreenData;
  onReady?: () => void;
  onAssembled?: () => void;
  onContextLost?: () => void;
}

interface Part {
  obj: Object3D;
  home: { pos: Vector3; quat: Quaternion };
  scatter: { pos: Vector3; quat: Quaternion };
  delay: number;
  seed: number;
  /** Capa cuyo desplazamiento de explosión sigue (para el paso "por dentro"). */
  follows: LayerKey | null;
}

interface Composition {
  yaw: number;
  pitch: number;
  roll: number;
  explode: number;
  side: number;
  fill: number;
  screen: 'boot' | 'dashboard';
}

/** Composiciones por paso (se repite la última si `stage` es mayor). */
export const ONBOARDING_STAGES: Composition[] = [
  { yaw: -0.24, pitch: 0.06, roll: 0.03, explode: 0, side: 0, fill: 0.6, screen: 'boot' },
  { yaw: Math.PI + 0.55, pitch: 0.1, roll: -0.04, explode: 0, side: 0.2, fill: 0.62, screen: 'boot' },
  { yaw: -0.66, pitch: 0.14, roll: 0.05, explode: 1, side: -0.17, fill: 0.56, screen: 'dashboard' },
  { yaw: -0.3, pitch: 0.05, roll: 0.03, explode: 0, side: 0.2, fill: 0.66, screen: 'dashboard' },
];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

const T_FLOAT = 1.1; // s flotando antes de ensamblar
const T_PART = 1.55; // duración del vuelo de cada pieza
const T_STAGGER = 0.13;
const T_BOOT = 1.5;

export class OnboardingEngine {
  private vp: Viewport;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.5, 400);
  private env: StudioEnv;
  private lights: StudioLights;
  private painter: ScreenPainter;
  private phone: PhoneModel;
  private rig = new Group();
  private parts: Part[] = [];
  private bokeh: Bokeh;
  private nebula: Mesh[] = [];
  private glow: Mesh;
  private flash: Mesh;
  private o: OnboardingEngineOptions;
  private disposed = false;
  private readyFired = false;
  private clock = 0;
  private assemblyEnd = 0;
  private bootDone = false;
  private assembledFired = false;
  private screenMode: 'off' | 'boot' | 'dashboard' = 'off';
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private cur = { x: 0, y: 0, yaw: -0.45, pitch: 0.12, roll: 0, explode: 0, dist: 40 };

  constructor(host: HTMLElement, o: OnboardingEngineOptions) {
    this.o = { ...o };
    this.vp = new Viewport({ container: host, continuous: !o.reducedMotion });
    const renderer = this.vp.renderer;
    this.env = createStudioEnvironment(renderer);
    this.scene.environment = this.env.texture;
    this.lights = addStudioLights(this.scene);

    this.painter = new ScreenPainter(DISPLAY_ASPECT, 720);
    this.painter.texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    this.phone = buildPhone(this.painter.texture);
    this.phone.materials.display.emissiveIntensity = 0;
    this.rig.add(this.phone.root);
    this.scene.add(this.rig);
    this.buildParts();

    // fondo: partículas profundas + nebulosa de marca
    const mobile = this.vp.width < 700;
    this.bokeh = new Bokeh({
      count: mobile ? 220 : 420,
      spread: [30, 18, 26],
      center: [0, 0, -16],
      size: [0.05, 0.3],
      seed: 21,
    });
    this.scene.add(this.bokeh.points);
    const neb: [string, number, [number, number, number]][] = [
      ['iris', 46, [-14, 6, -34]],
      ['cyan', 38, [16, -8, -38]],
      ['iris', 30, [10, 12, -30]],
    ];
    for (const [tone, size, pos] of neb) {
      const m = createGlow(size, tone as 'iris' | 'cyan');
      m.position.set(...pos);
      this.nebula.push(m);
      this.scene.add(m);
    }
    this.glow = createGlow(13, 'iris');
    this.glow.position.set(0, 0, -3.6);
    this.rig.add(this.glow);
    this.flash = createGlow(9, 'cyan');
    this.flash.position.set(0, 0, 0.8);
    (this.flash.material as MeshBasicMaterial).opacity = 0;
    this.rig.add(this.flash);

    this.setTheme(o.theme);
    this.vp.onResize = () => this.updateCamera(true);
    this.vp.onFrame = (dt) => this.frame(dt);
    this.vp.onContextLost = () => o.onContextLost?.();
    window.addEventListener('pointermove', this.onPointer, { passive: true });

    if (o.reducedMotion) this.skipToAssembled();
    else this.applyScatter(0);
    this.snapToTarget();
    whenFontsReady().then(() => {
      if (!this.disposed && this.screenMode !== 'off') this.drawScreen(true);
    });
    this.vp.invalidate();
  }

  /* -------------------------------------------------------------- API */

  setStage(stage: number) {
    this.o.stage = stage;
    if (this.o.reducedMotion) this.snapToTarget();
    this.drawScreen();
    this.vp.invalidate();
  }

  setTheme(theme: ThemeName) {
    this.o.theme = theme;
    const light = theme === 'light';
    this.vp.renderer.toneMappingExposure = light ? 1.06 : 1;
    this.scene.environmentIntensity = light ? 1.12 : 1;
    this.lights.setTheme(theme);
    this.bokeh.setTheme(theme);
    this.nebula.forEach((n, i) => setGlowTheme(n, theme, light ? 0.5 : i === 2 ? 0.45 : 0.7));
    setGlowTheme(this.glow, theme, 0.85);
    setGlowTheme(this.flash, theme, 1);
    this.vp.invalidate();
  }

  setScreen(screen: ScreenData | undefined) {
    this.o.screen = screen;
    this.drawScreen(true);
    this.vp.invalidate();
  }

  setReducedMotion(v: boolean) {
    this.o.reducedMotion = v;
    this.vp.setContinuous(!v);
    if (v) {
      this.skipToAssembled();
      this.snapToTarget();
    }
    this.vp.invalidate();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pointermove', this.onPointer);
    disposeObject(this.scene);
    this.painter.dispose();
    this.env.dispose();
    this.scene.environment = null;
    this.vp.dispose();
  }

  /* ---------------------------------------------------------- piezas */

  private buildParts() {
    const root = this.phone.root;
    root.updateMatrixWorld(true);
    // separar el módulo de cámara para que vuele por su cuenta
    const cam = root.getObjectByName('camera');
    const camPart = new Group();
    root.add(camPart);
    if (cam) camPart.attach(cam);
    // tornillos de la placa
    const screws: Group[] = [];
    const boardY = PHONE.H / 2 - 0.2 - BOARD.h / 2;
    for (const [x, y] of [[-1.5, 1.24], [-1.5, -0.98], [0.02, -1.25], [1.5, -1.25]] as const) {
      const sc = buildScrew(this.phone.materials, 0.05);
      const wrap = new Group();
      sc.position.set(x, boardY + y, 0.016);
      wrap.add(sc);
      root.add(wrap);
      screws.push(wrap);
    }
    const order: [Object3D, LayerKey | null][] = [
      [this.phone.layers.back, 'back'],
      [camPart, 'back'],
      [this.phone.layers.battery, 'battery'],
      [this.phone.layers.board, 'board'],
      ...screws.map((s) => [s, 'board'] as [Object3D, LayerKey]),
      [this.phone.layers.frame, 'frame'],
      [this.phone.layers.display, 'display'],
    ];
    const scatter: [number, number, number, number, number, number][] = [
      [-1.2, -5.6, -3.2, 1.0, -0.3, 0.4],
      [3.6, 4.4, 1.2, -0.6, 2.4, 0.3],
      [5.4, -2.6, 0.8, -0.7, 0.6, -0.5],
      [-5.6, -2.4, 0.4, 0.9, 0.4, 0.6],
      [2.6, 0.6, 3.6, 1.2, 0.4, 0.0],
      [-3.0, 1.2, 3.8, -0.8, 1.0, 0.5],
      [1.2, -3.6, 3.4, 0.5, -1.2, 0.9],
      [-1.2, 4.2, 3.0, 2.0, 0.3, -0.4],
      [5.6, 2.8, -1.4, -0.4, -0.7, 0.35],
      [-5.4, 2.6, 1.6, 0.25, 0.85, -0.22],
    ];
    order.forEach(([obj, follows], i) => {
      const [x, y, z, rx, ry, rz] = scatter[i % scatter.length];
      this.parts.push({
        obj,
        home: { pos: obj.position.clone(), quat: obj.quaternion.clone() },
        scatter: {
          pos: new Vector3(x, y, z),
          quat: new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
        },
        delay: i * T_STAGGER,
        seed: i * 1.731 + 0.4,
        follows,
      });
    });
    this.assemblyEnd = T_FLOAT + (order.length - 1) * T_STAGGER + T_PART;
  }

  private applyScatter(time: number) {
    const tmpQ = new Quaternion();
    const wob = new Euler();
    for (const p of this.parts) {
      const local = time - T_FLOAT - p.delay;
      const k = ease(MathUtils.clamp(local / T_PART, 0, 1));
      // deriva mientras flota
      const drift = 1 - k;
      const s = p.seed;
      p.obj.position.lerpVectors(p.scatter.pos, p.home.pos, k);
      p.obj.position.x += Math.sin(time * 0.6 + s) * 0.22 * drift;
      p.obj.position.y += Math.cos(time * 0.5 + s * 2) * 0.26 * drift;
      p.obj.position.z += Math.sin(Math.PI * k) * 1.4;
      wob.set(Math.sin(time * 0.4 + s) * 0.25 * drift, Math.cos(time * 0.33 + s) * 0.3 * drift, 0);
      tmpQ.setFromEuler(wob);
      p.obj.quaternion.copy(p.scatter.quat).multiply(tmpQ).slerp(p.home.quat, k);
    }
  }

  private applyExplode(amount: number) {
    LAYER_ORDER.forEach((k, i) => {
      const [x, y, z] = EXPLODE_OFFSETS[k];
      const l = this.phone.layers[k];
      l.position.set(x * amount, y * amount, z * amount);
      l.rotation.set(0, (2 - i) * 0.045 * amount, 0);
    });
    const wrappers = Object.values(this.phone.layers) as Object3D[];
    for (const p of this.parts) {
      if (!p.follows || wrappers.includes(p.obj)) continue;
      const [x, y, z] = EXPLODE_OFFSETS[p.follows];
      p.obj.position.copy(p.home.pos).add(new Vector3(x * amount, y * amount, z * amount));
      p.obj.quaternion.copy(p.home.quat);
    }
  }

  private skipToAssembled() {
    this.clock = this.assemblyEnd + T_BOOT + 0.1;
    this.applyScatter(this.clock);
    this.phone.materials.display.emissiveIntensity = 1;
    this.bootDone = true;
    this.screenMode = 'off';
    this.drawScreen(true);
    if (!this.assembledFired) {
      this.assembledFired = true;
      this.o.onAssembled?.();
    }
  }

  /* ----------------------------------------------------------- pantalla */

  private stageComp(): Composition {
    const i = MathUtils.clamp(Math.floor(this.o.stage) || 0, 0, ONBOARDING_STAGES.length - 1);
    return ONBOARDING_STAGES[i];
  }

  private drawScreen(force = false) {
    if (!this.bootDone) return;
    const want = this.stageComp().screen;
    if (!force && want === this.screenMode) return;
    this.screenMode = want;
    if (want === 'dashboard') this.painter.drawDashboard(this.o.screen, 'hero');
    else this.painter.drawBoot(1, 1, 1);
  }

  /* ------------------------------------------------------------- cámara */

  private target() {
    const c = this.stageComp();
    const { width, height } = this.vp;
    const aspect = width / height;
    const t = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    const narrow = aspect < 0.85;
    const fill = narrow ? c.fill * 0.86 : c.fill;
    const halfH = (PHONE.H / 2 + 0.3 + c.explode * 1.3) / fill;
    const halfW = (2.3 + c.explode * 1.9) / fill;
    let dist = Math.max(halfH / t, halfW / (t * aspect));
    // al inicio, encuadre amplio para ver las piezas dispersas
    const asm = this.o.reducedMotion ? 1 : easeOut(MathUtils.clamp((this.clock - T_FLOAT) / (this.assemblyEnd - T_FLOAT), 0, 1));
    const scatterDist = Math.max(8.2 / t, 8.6 / (t * aspect));
    dist = MathUtils.lerp(scatterDist, dist, asm);
    const viewW = 2 * dist * t * aspect;
    const viewH = 2 * dist * t;
    const wide = aspect > 1.15;
    return {
      x: wide ? viewW * c.side * asm : 0,
      y: narrow ? viewH * 0.1 * asm : 0,
      yaw: MathUtils.lerp(-0.42, c.yaw, this.bootDone ? 1 : 0),
      pitch: this.bootDone ? c.pitch : 0.12,
      roll: this.bootDone ? c.roll : 0.02,
      explode: this.bootDone ? c.explode : 0,
      dist,
    };
  }

  private snapToTarget() {
    Object.assign(this.cur, this.target());
    this.updateCamera(true);
  }

  private updateCamera(resize = false) {
    if (resize) {
      this.camera.aspect = this.vp.width / this.vp.height;
      this.camera.updateProjectionMatrix();
    }
    const px = this.o.reducedMotion ? 0 : this.pointer.x;
    const py = this.o.reducedMotion ? 0 : this.pointer.y;
    this.camera.position.set(px * 0.9, 0.6 + py * 0.6, this.cur.dist);
    this.camera.lookAt(0, 0, 0);
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
  };

  /* -------------------------------------------------------------- frame */

  private frame(dt: number) {
    const reduced = this.o.reducedMotion;
    if (!reduced) this.clock += dt;
    const time = this.clock;

    // 1) ensamblaje
    const assembling = !reduced && time < this.assemblyEnd + 0.05;
    if (assembling) this.applyScatter(time);

    // 2) encendido
    const m = this.phone.materials.display;
    if (!reduced && !this.bootDone && time >= this.assemblyEnd) {
      const b = MathUtils.clamp((time - this.assemblyEnd) / T_BOOT, 0, 1);
      m.emissiveIntensity = Math.min(1, b * 3.2) * (1 + 0.25 * Math.exp(-b * 9));
      this.painter.drawBoot(easeOut(MathUtils.clamp((b - 0.15) / 0.65, 0, 1)), Math.min(1, b * 2), MathUtils.clamp((b - 0.45) / 0.45, 0, 1));
      const fm = this.flash.material as MeshBasicMaterial;
      fm.opacity = Math.exp(-b * 5) * (this.o.theme === 'light' ? 0.5 : 0.9) * Math.min(1, b * 12);
      this.flash.scale.setScalar(0.5 + b * 1.6);
      if (b >= 1) {
        this.bootDone = true;
        this.screenMode = 'boot';
        fm.opacity = 0;
        this.drawScreen();
        if (!this.assembledFired) {
          this.assembledFired = true;
          this.o.onAssembled?.();
        }
      }
    }
    if (this.bootDone) this.drawScreen();

    // 3) composición (amortiguada)
    const tg = this.target();
    const c = this.cur;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 2.4);
    c.x += (tg.x - c.x) * k;
    c.y += (tg.y - c.y) * k;
    c.yaw += (tg.yaw - c.yaw) * k;
    c.pitch += (tg.pitch - c.pitch) * k;
    c.roll += (tg.roll - c.roll) * k;
    c.explode += (tg.explode - c.explode) * (reduced ? 1 : 1 - Math.exp(-dt * 2.0));
    c.dist += (tg.dist - c.dist) * (reduced ? 1 : 1 - Math.exp(-dt * (assembling ? 1.6 : 2.2)));
    if (!assembling) this.applyExplode(ease(MathUtils.clamp(c.explode, 0, 1)));

    const float = reduced ? 0 : Math.sin(time * 0.95) * 0.12;
    this.rig.position.set(c.x, c.y + float, 0);
    this.rig.rotation.set(c.pitch, c.yaw + (reduced ? 0 : Math.sin(time * 0.37) * 0.04), c.roll);
    const p = this.pointer;
    p.x = reduced ? 0 : MathUtils.damp(p.x, p.tx, 2.5, dt);
    p.y = reduced ? 0 : MathUtils.damp(p.y, p.ty, 2.5, dt);
    this.updateCamera();

    // pulso de marca (latido) en el halo trasero
    const beat = time % 2.4;
    const hb = this.bootDone && !reduced ? Math.exp(-Math.pow(beat - 0.1, 2) * 90) + 0.6 * Math.exp(-Math.pow(beat - 0.42, 2) * 90) : 0;
    const gm = this.glow.material as MeshBasicMaterial;
    const on = this.bootDone ? 1 : MathUtils.clamp((time - this.assemblyEnd) / T_BOOT, 0, 1);
    gm.opacity = (this.o.theme === 'light' ? 0.32 : 0.5) * (0.35 + 0.65 * on) + hb * 0.22;
    this.glow.scale.setScalar(1 + hb * 0.06 + c.explode * 0.2);
    this.nebula.forEach((n, i) => {
      n.position.x += Math.sin(time * 0.05 + i * 2) * 0.004;
      n.rotation.z = time * 0.01 * (i % 2 ? 1 : -1);
    });

    const scale = this.vp.height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2)));
    this.bokeh.update(reduced ? 0 : time, this.vp.pixelRatio, scale, 1);
    this.vp.renderer.render(this.scene, this.camera);
    if (!this.readyFired) {
      this.readyFired = true;
      this.o.onReady?.();
    }
  }
}
