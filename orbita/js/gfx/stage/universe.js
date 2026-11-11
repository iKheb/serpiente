// =============================================================================
// ÓRBITA · Universo ambiental (A1): cielo profundo + planeta Órbita colocado de
// forma artística (abajo a la derecha, parcialmente fuera de cuadro; centrado
// abajo en vertical), anillo de partículas, luna y deriva lenta de cámara.
// =============================================================================
import * as THREE from 'three';
import { createSky } from './sky.js';
import { createPlanetSystem } from './planet.js';

export class Universe {
  constructor(renderer, { device }) {
    this.device = device;
    const tier = device.tier;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, .1, 2400);
    this.sky = createSky(renderer, { tier, reducedMotion: device.reducedMotion });
    this.scene.add(this.sky.group);
    this.planet = createPlanetSystem({ tier });
    this.scene.add(this.planet.group);
    this.aspect = 16 / 9;
    this.look = new THREE.Vector3();
    this.base = { x: 0, y: 0 };
    this.layout(16 / 9);
  }

  /** Encuadre según proporción de pantalla. */
  layout(aspect) {
    this.aspect = aspect;
    const cam = this.camera;
    cam.aspect = aspect;
    const portrait = aspect < .9;
    // En vertical se abre el FOV para conservar anchura de composición.
    cam.fov = portrait ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17)) / aspect)) : 38;
    cam.updateProjectionMatrix();
    const D = 60;
    const hh = D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const hw = hh * aspect;
    const g = this.planet.group;
    if (portrait) {
      const R = hw * .95;
      g.scale.setScalar(R);
      g.position.set(hw * .32, -hh * .72, -D);
    } else {
      const R = hh * .62;
      g.scale.setScalar(R);
      g.position.set(hw * .58, -hh * .82, -D);
    }
    this.planet.tilt.rotation.z = portrait ? .42 : .3;
  }

  setPalette(c0, c1, c2, k) { this.sky.setPalette(c0, c1, c2, k); }

  update(t, dt, cam, renderH, pr) {
    const c = this.camera;
    const rm = this.device.reducedMotion ? .15 : 1;
    const dx = Math.sin(t * .045) * 1.6 * rm + cam.x * 2.4;
    const dy = Math.cos(t * .033) * .8 * rm + cam.y * 1.4;
    c.position.set(dx, dy, Math.sin(t * .021) * 1.5 * rm);
    this.look.set(dx * .35 + Math.sin(t * .017) * 1.2 * rm, dy * .3, -100);
    c.lookAt(this.look);
    this.sky.group.rotation.y = t * .0025 * rm;
    this.sky.group.rotation.z = Math.sin(t * .01) * .01 * rm;
    this.sky.update(t, pr);
    this.planet.update(t, dt, c, renderH, pr);
  }

  dispose() { this.sky.dispose(); this.planet.dispose(); }
}
