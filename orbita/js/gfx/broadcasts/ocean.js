// Emisión «Bajo la superficie» (canal Abisal) — documental submarino procedural.
// Cáusticas en el fondo, rayos de luz volumétricos, nieve marina con bokeh,
// medusas bioluminiscentes animadas por vértice, banco de peces (boids instanciados),
// bosque de algas, ventana de Snell y caída al abismo.
import { GLSL_NOISE, simplex2, fbm, ridged, smoothstep, lerp } from './lib/noise.js';
import { Director, aim, fitFov, easeInOut, smooth, wobble, createOverlay, noiseBuffer, soundKit } from './lib/cine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WATER = /* glsl */`
uniform float uTime; uniform vec3 uDeep, uShallow, uSunDir, uSunCol; uniform float uFogDen;
vec3 waterColor(vec3 dir, float y){
  float up = dir.y;
  vec3 c = mix(uDeep, uShallow, smoothstep(-.6, 1., up));
  float s = max(dot(dir, uSunDir), 0.);
  c += uSunCol * (pow(s, 5.) * .22 + pow(s, 40.) * .55) * smoothstep(-.3, .7, up);
  return c * exp(min(y, 0.) * .021);
}
vec3 sunAtten(float y){ return exp(min(y, 0.) * vec3(.075, .03, .021)); }
vec3 waterFog(vec3 col, vec3 wp){
  vec3 d = wp - cameraPosition; float dist = length(d); vec3 dir = d / max(dist, 1e-4);
  vec3 absorb = exp(-dist * vec3(.14, .04, .028));
  float f = 1. - exp(-dist * uFogDen);
  return mix(col * absorb, waterColor(dir, mix(cameraPosition.y, wp.y, .35)), f);
}
float fogKeep(vec3 wp){ return exp(-distance(wp, cameraPosition) * uFogDen * 1.1); }
`;

const CAUSTIC = /* glsl */`
float causticL(vec2 p, float t){
  vec2 i = p; float c = 1.; const float inten = .006;
  for (int n = 0; n < 4; n++){
    float tt = t * (1. - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 7.);
}
float caustics(vec2 xz, float t){
  vec2 p = mod(xz * .16, 6.2831853) - 250.;
  float a = causticL(p, t * .5 + 23.);
  float b = causticL(mod(xz * .23 + 1.7, 6.2831853) - 250., t * .43 + 7.);
  return min(a + b * .6, 2.2);
}
`;

export default {
  id: 'ocean',
  async create({ THREE, renderer, device, opts, gfx, rng }) {
    const tier = device.tier;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 900);
    const disposables = [];
    const keep = (o) => { disposables.push(o); return o; };
    const n2 = simplex2(rng);

    const pal = opts.palette || ['#021a2c', '#18d6c9', '#9fe7ff'];
    const U = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0.0006, 0.006, 0.016) },
      uShallow: { value: new THREE.Color(0.02, 0.2, 0.27) },
      uSunDir: { value: new THREE.Vector3(0.28, 1, 0.16).normalize() },
      uSunCol: { value: new THREE.Color(1.0, 0.97, 0.88) },
      uFogDen: { value: 0.028 },
    };
    const sunDir = U.uSunDir.value;

    // ---------------------------------------------------------------- Fondo
    const SEA_EDGE = 46;
    function seabed(x, z) {
      let h = -30 + fbm(n2, x * 0.011 + 3.1, z * 0.011 - 1.7, 4) * 7 + fbm(n2, x * 0.05, z * 0.05, 3) * 1.2;
      const e = SEA_EDGE + n2(z * 0.025, 7.1) * 7;
      const d = smoothstep(e, e + 30, x);
      const wall = ridged(n2, x * 0.03 + 9.3, z * 0.05 - 4.2, 4);
      h = lerp(h, -250, Math.pow(d, 0.8)) + wall * 16 * Math.sin(Math.PI * Math.min(1, d * 1.4));
      return h;
    }

    // Cúpula de agua (gradiente profundidad + dispersión hacia el sol)
    const domeMat = keep(new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.); gl_Position = p.xyww; }',
      fragmentShader: WATER + 'varying vec3 vD; void main(){ vec3 d = normalize(vD); gl_FragColor = vec4(waterColor(d, cameraPosition.y), 1.); }',
    }));
    const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(10, 32, 16)), domeMat);
    dome.frustumCulled = false; dome.renderOrder = -10;
    scene.add(dome);

    // Lecho marino
    const SEG = tier >= 2 ? 220 : tier === 1 ? 160 : 110;
    const bedGeo = keep(new THREE.PlaneGeometry(380, 380, SEG, SEG));
    bedGeo.rotateX(-Math.PI / 2); bedGeo.translate(30, 0, 0);
    {
      const p = bedGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, seabed(p.getX(i), p.getZ(i)));
      bedGeo.computeVertexNormals();
    }
    const groundFrag = /* glsl */`
      varying vec3 vW; varying vec3 vN; uniform float uRock;
      void main(){
        vec3 n = normalize(vN);
        float slope = 1. - n.y;
        float g = fbm2(vW.xz * .7);
        float rip = sin(vW.x * 2.1 + vW.z * .6 + fbm2(vW.xz * .25) * 6.) * .5 + .5;
        vec3 sand = vec3(.62, .56, .44) * (.72 + .28 * g) * (.9 + .1 * rip);
        vec3 rock = mix(vec3(.16, .17, .15), vec3(.30, .27, .22), fbm2(vW.xz * 1.6 + vW.y));
        rock = mix(rock, vec3(.20, .28, .17), smoothstep(.55, .8, fbm2(vW.xz * 3.1)) * .7); // algas incrustantes
        float rk = max(smoothstep(.22, .5, slope), uRock);
        vec3 alb = mix(sand, rock, rk);
        vec3 sa = sunAtten(vW.y);
        float ndl = max(dot(n, uSunDir), 0.);
        vec2 proj = vW.xz - uSunDir.xz / uSunDir.y * vW.y;
        float ca = caustics(proj, uTime) * smoothstep(-110., -22., vW.y) * (.55 + .45 * n.y);
        vec3 light = uSunCol * sa * ndl * (.35 + 1.9 * ca) + waterColor(n, vW.y) * 1.3;
        float ao = mix(1., .55, rk * (1. - g));
        vec3 col = alb * light * ao;
        gl_FragColor = vec4(waterFog(col, vW), 1.);
      }`;
    const groundVert = /* glsl */`
      varying vec3 vW; varying vec3 vN;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.);
        #ifdef USE_INSTANCING
          wp = modelMatrix * instanceMatrix * vec4(position, 1.);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          vN = normalize(mat3(modelMatrix) * normal);
        #endif
        vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
      }`;
    const bedMat = keep(new THREE.ShaderMaterial({ uniforms: { ...U, uRock: { value: 0 } }, vertexShader: groundVert, fragmentShader: WATER + GLSL_NOISE + CAUSTIC + groundFrag }));
    scene.add(new THREE.Mesh(bedGeo, bedMat));

    // Rocas
    {
      const variants = 3, perV = tier >= 1 ? 22 : 12;
      const rockMat = keep(new THREE.ShaderMaterial({ uniforms: { ...U, uRock: { value: 1 } }, vertexShader: groundVert, fragmentShader: WATER + GLSL_NOISE + CAUSTIC + groundFrag }));
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pp = new THREE.Vector3();
      for (let v = 0; v < variants; v++) {
        const g = keep(new THREE.IcosahedronGeometry(1, tier >= 1 ? 4 : 3));
        const p = g.attributes.position;
        const o = v * 13.7;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const k = 1 + 0.35 * n2(x * 1.3 + o, y * 1.3 + z) + 0.14 * n2(x * 3.1 - z + o, y * 3.3) + 0.06 * n2(x * 7 + o, z * 7);
          p.setXYZ(i, x * k, y * k * 0.62, z * k);
        }
        g.computeVertexNormals();
        const im = new THREE.InstancedMesh(g, rockMat, perV);
        for (let j = 0; j < perV; j++) {
          let x, z;
          if (j % 3 === 0) { x = SEA_EDGE - 6 + rng() * 14; z = -50 + rng() * 100; }
          else { const a = rng() * 6.283, r = 6 + rng() * 46; x = -12 + Math.cos(a) * r; z = 4 + Math.sin(a) * r; }
          const sc = 0.8 + Math.pow(rng(), 2) * 5.5;
          pp.set(x, seabed(x, z) - sc * 0.25, z);
          e.set(rng() * 0.4, rng() * 6.28, rng() * 0.4); q.setFromEuler(e); s.set(sc * (0.8 + rng() * 0.6), sc, sc * (0.8 + rng() * 0.6));
          im.setMatrixAt(j, m4.compose(pp, q, s));
        }
        scene.add(im);
      }
    }

    // ---------------------------------------------------------------- Bosque de algas
    {
      const count = tier >= 2 ? 190 : tier === 1 ? 130 : 70;
      const base = new THREE.PlaneGeometry(1, 1, 1, tier >= 1 ? 28 : 18); base.translate(0, 0.5, 0);
      const g = keep(new THREE.InstancedBufferGeometry());
      g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
      const aPos = new Float32Array(count * 4), aPar = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const a = rng() * 6.283, r = Math.sqrt(rng()) * 34;
        const x = -16 + Math.cos(a) * r * 1.2, z = 2 + Math.sin(a) * r;
        aPos.set([x, seabed(x, z) - 0.3, z, 8 + rng() * 12], i * 4);
        aPar.set([rng() * 6.283, 0.5 + rng() * 0.9, rng() * 6.283, rng()], i * 4);
      }
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 4));
      g.setAttribute('aPar', new THREE.InstancedBufferAttribute(aPar, 4));
      g.instanceCount = count;
      const m = keep(new THREE.ShaderMaterial({
        uniforms: U, side: THREE.DoubleSide,
        vertexShader: /* glsl */`
          uniform float uTime; attribute vec4 aPos; attribute vec4 aPar; varying vec3 vW; varying vec2 vUv; varying float vH; varying float vShade;
          void main(){
            float h = position.y; float H = aPos.w;
            float sway = sin(uTime * .55 + aPar.x + h * 2.4) * .9 + sin(uTime * 1.21 + aPar.x * 2. + h * 5.) * .25;
            float bend = h * h;
            float w = aPar.y * (.25 + .75 * sin(min(h * 1.25, 1.) * 3.1416)) * (1. - h * .35);
            float tw = aPar.z + h * 2.5 + sin(uTime * .4 + aPar.x) * .6;
            vec3 p = vec3(position.x * w, h * H, 0.);
            float c = cos(tw), s = sin(tw);
            p.xz = vec2(p.x * c, p.x * s);
            p.x += sway * bend * 3.;
            p.z += cos(uTime * .47 + aPar.x * 1.7 + h * 1.9) * bend * 1.8;
            p.y -= bend * abs(sway) * .6;
            vW = aPos.xyz + p; vUv = uv; vH = h; vShade = aPar.w;
            gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
          }`,
        fragmentShader: WATER + GLSL_NOISE + /* glsl */`
          varying vec3 vW; varying vec2 vUv; varying float vH; varying float vShade;
          void main(){
            float edge = abs(vUv.x - .5) * 2.;
            float ruff = .82 + .18 * sin(vH * 90. + vShade * 20.);
            if (edge > ruff) discard;
            vec3 base = mix(vec3(.16, .13, .04), vec3(.33, .28, .07), vShade);
            float vein = smoothstep(.12, 0., abs(vUv.x - .5)) * .4;
            float n = fbm2_3(vec2(vUv.x * 6., vH * 40.));
            vec3 sa = sunAtten(vW.y);
            float transl = .35 + .65 * smoothstep(.1, 1., vH);
            vec3 col = base * (.6 + .4 * n + vein) * (uSunCol * sa * (.25 + .9 * transl) + waterColor(vec3(0., 1., 0.), vW.y) * 1.2);
            col += vec3(.5, .45, .12) * sa * pow(transl, 3.) * .25 * (1. - edge);
            gl_FragColor = vec4(waterFog(col, vW), 1.);
          }`,
      }));
      const kelp = new THREE.Mesh(g, m); kelp.frustumCulled = false;
      scene.add(kelp);
    }

    // ---------------------------------------------------------------- Superficie vista desde abajo (ventana de Snell)
    {
      const m = keep(new THREE.ShaderMaterial({
        uniforms: U, side: THREE.DoubleSide, depthWrite: false,
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: WATER + GLSL_NOISE + /* glsl */`
          varying vec3 vW;
          void main(){
            vec3 d = normalize(vW - cameraPosition);
            vec2 q = vW.xz * .09; float t = uTime * .35;
            float e = .06;
            float h0 = fbm2_3(q + vec2(t, t * .6)) + .5 * fbm2_3(q * 2.3 - vec2(t * .8, -t));
            float hx = fbm2_3(q + vec2(e, 0.) + vec2(t, t * .6)) + .5 * fbm2_3((q + vec2(e, 0.)) * 2.3 - vec2(t * .8, -t));
            float hz = fbm2_3(q + vec2(0., e) + vec2(t, t * .6)) + .5 * fbm2_3((q + vec2(0., e)) * 2.3 - vec2(t * .8, -t));
            vec3 n = normalize(vec3((hx - h0) / e * .5, -1., (hz - h0) / e * .5));
            float cosI = dot(d, -n);
            float win = smoothstep(.62, .70, cosI);
            vec3 sky = vec3(.55, .78, .9) * 1.6 + uSunCol * pow(max(dot(refract(d, n, 1.33), uSunDir), 0.), 120.) * 18.;
            vec3 refl = waterColor(reflect(d, n), cameraPosition.y) * 1.1;
            vec3 rimc = vec3(.6, .9, 1.) * smoothstep(.06, 0., abs(cosI - .66)) * .8;
            vec3 col = mix(refl, sky, win) + rimc;
            float dist = length(vW - cameraPosition);
            col = mix(col, waterColor(d, cameraPosition.y * .5), 1. - exp(-dist * uFogDen * .8));
            gl_FragColor = vec4(col, 1.);
          }`,
      }));
      const surf = new THREE.Mesh(keep(new THREE.PlaneGeometry(900, 900)), m);
      surf.rotation.x = Math.PI / 2; surf.position.y = 0;
      scene.add(surf);
    }

    // ---------------------------------------------------------------- Rayos de luz volumétricos
    {
      const count = tier >= 2 ? 46 : tier === 1 ? 34 : 22;
      const cyl = keep(new THREE.CylinderGeometry(1, 1.9, 1, 18, 1, true)); cyl.translate(0, -0.5, 0);
      const g = keep(new THREE.InstancedBufferGeometry());
      g.index = cyl.index; g.attributes.position = cyl.attributes.position; g.attributes.normal = cyl.attributes.normal; g.attributes.uv = cyl.attributes.uv;
      const aR = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const x = -55 + rng() * 140, z = -50 + rng() * 100;
        aR.set([x, z, 0.8 + rng() * 3.2, rng() * 100], i * 4);
      }
      g.setAttribute('aR', new THREE.InstancedBufferAttribute(aR, 4));
      g.instanceCount = count;
      const m = keep(new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: /* glsl */`
          uniform vec3 uSunDir; attribute vec4 aR; varying vec3 vW; varying vec3 vN; varying float vH; varying float vSeed; varying vec2 vUv;
          void main(){
            float L = 95.;
            vec3 p = position; p.xz *= aR.z; p.y *= L;
            vec3 dir = normalize(vec3(uSunDir.x * .55, uSunDir.y, uSunDir.z * .55));
            vec3 w = vec3(aR.x, 0., aR.y) + vec3(p.x, 0., p.z) + dir * p.y;
            vW = w; vN = normal; vH = -position.y; vSeed = aR.w; vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
          }`,
        fragmentShader: WATER + GLSL_NOISE + /* glsl */`
          varying vec3 vW; varying vec3 vN; varying float vH; varying float vSeed; varying vec2 vUv;
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            vec3 nn = normalize(vec3(vN.x, 0., vN.z));
            float facing = abs(dot(nn, normalize(vec3(V.x, 0., V.z))));
            float a = pow(facing, 3.);
            float fade = pow(1. - vH, 1.4) * smoothstep(0., .04, vH);
            float flick = .55 + .45 * sin(uTime * .61 + vSeed) * sin(uTime * .37 + vSeed * 1.7);
            float streak = .55 + .45 * vnoise2(vec2(vUv.x * 18. + vSeed, vH * 2. - uTime * .05));
            float dc = distance(cameraPosition, vW);
            float near = smoothstep(1.5, 9., dc);
            vec3 col = vec3(.55, .85, .9) * a * fade * flick * streak * near * fogKeep(vW) * .11 * exp(min(vW.y, 0.) * .02);
            gl_FragColor = vec4(col, 1.);
          }`,
      }));
      const rays = new THREE.Mesh(g, m); rays.frustumCulled = false; rays.renderOrder = 5;
      scene.add(rays);
    }

    // ---------------------------------------------------------------- Medusas
    const JN = tier >= 2 ? 16 : tier === 1 ? 12 : 8;
    const jelly = [];
    const HERO = new THREE.Vector3(60, -21, 6);
    for (let i = 0; i < JN; i++) {
      let p;
      if (i === 0) p = HERO.clone();
      else if (i < 5) p = new THREE.Vector3(HERO.x - 8 + rng() * 22, HERO.y - 6 + rng() * 12, HERO.z - 14 + rng() * 26);
      else p = new THREE.Vector3(56 + rng() * 60, -30 - rng() * 70, -30 + rng() * 60);
      jelly.push({ base: p, scale: i === 0 ? 1.25 : 0.5 + rng() * 1.0, phase: rng(), period: 2.4 + rng() * 1.6, hue: i === 0 ? 0.05 : rng(), tilt: rng() * 6.283 });
    }
    const aJ = new THREE.InstancedBufferAttribute(new Float32Array(JN * 4), 4);
    const aP = new THREE.InstancedBufferAttribute(new Float32Array(JN * 4), 4);
    aJ.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < JN; i++) { const j = jelly[i]; aP.setXYZW(i, j.phase, j.period, j.hue, j.tilt); }
    const jellyPos = new THREE.Vector3();
    function jellyAt(i, t, out) {
      const j = jelly[i];
      const ph = t / j.period + j.phase;
      const f = ph - Math.floor(ph);
      const heave = f < 0.28 ? smoothstep(0, 0.28, f) : 1 - smoothstep(0.28, 1, f);
      return out.set(j.base.x + Math.sin(t * 0.05 + j.tilt) * 1.6, j.base.y + Math.sin(t * 0.09 + j.tilt * 2) * 0.9 + heave * 0.18 * j.scale, j.base.z + Math.cos(t * 0.04 + j.tilt) * 1.6);
    }
    const PULSE = /* glsl */`
      uniform float uTime; attribute vec4 aJ; attribute vec4 aP;
      float pulse(float ph){ float f = fract(ph); return f < .28 ? smoothstep(0., .28, f) : 1. - smoothstep(.28, 1., f); }
      mat3 tiltM(float a, float ang){ vec3 ax = vec3(cos(a), 0., sin(a)); float s = sin(ang), c = cos(ang), oc = 1. - c;
        return mat3(oc*ax.x*ax.x + c, oc*ax.x*ax.y + ax.z*s, oc*ax.z*ax.x - ax.y*s,
                    oc*ax.x*ax.y - ax.z*s, oc*ax.y*ax.y + c, oc*ax.y*ax.z + ax.x*s,
                    oc*ax.z*ax.x + ax.y*s, oc*ax.y*ax.z - ax.x*s, oc*ax.z*ax.z + c); }
    `;
    const glowB = new THREE.Color(0.75, 0.25, 1.0);
    const JU = { ...U, uGlowA: { value: new THREE.Color(0.15, 0.95, 0.85) }, uGlowB: { value: glowB }, uWarm: { value: new THREE.Color(1.0, 0.45, 0.6) } };
    // Campana
    {
      const sph = new THREE.SphereGeometry(1, tier >= 1 ? 56 : 36, tier >= 1 ? 24 : 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
      const g = keep(new THREE.InstancedBufferGeometry());
      g.index = sph.index; g.attributes.position = sph.attributes.position; g.attributes.normal = sph.attributes.normal;
      g.setAttribute('aJ', aJ); g.setAttribute('aP', aP); g.instanceCount = JN;
      const m = keep(new THREE.ShaderMaterial({
        uniforms: JU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: PULSE + /* glsl */`
          varying vec3 vW; varying vec3 vN; varying float vV; varying float vHue; varying float vC; varying float vAz;
          void main(){
            vec3 p = position;
            float v = acos(clamp(p.y, -1., 1.)) / (3.1416 * .56);
            float ph = uTime / aP.y + aP.x;
            float c = pulse(ph - v * .14);
            float az = atan(p.z, p.x);
            float sq = (1. - .26 * c * pow(v, 1.2)) * (1. + .04 * sin(az * 16.) * pow(v, 6.));
            p.xz *= sq;
            p.y = p.y * (.66 + .16 * c) - pow(v, 5.) * .1;
            vec3 nn = normalize(normal * vec3(1., 1.4, 1.));
            mat3 R = tiltM(aP.w, .18 + .06 * sin(uTime * .3 + aP.w));
            vec3 w = aJ.xyz + R * p * aJ.w;
            vW = w; vN = R * nn; vV = v; vHue = aP.z; vC = c; vAz = az;
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
          }`,
        fragmentShader: WATER + /* glsl */`
          uniform vec3 uGlowA, uGlowB, uWarm;
          varying vec3 vW; varying vec3 vN; varying float vV; varying float vHue; varying float vC; varying float vAz;
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            float fres = 1. - abs(dot(normalize(vN), V));
            vec3 glow = mix(uGlowA, uGlowB, vHue);
            float canals = pow(abs(cos(vAz * 4.)), 60.) * smoothstep(.05, .9, vV) * .9;
            float fine = pow(abs(cos(vAz * 16.)), 30.) * smoothstep(.5, .95, vV) * .35;
            float rim = smoothstep(.84, .99, vV) * (1.6 + 2.2 * vC);
            float lobes = pow(abs(cos(vAz * 2.)), 5.) * smoothstep(.12, .25, vV) * smoothstep(.5, .3, vV);
            float body = .05 + pow(fres, 2.6) * 1.1;
            vec3 col = glow * (body + canals + fine + rim) * (.8 + .5 * vC) + uWarm * lobes * .9;
            col += vec3(.7, .9, 1.) * waterColor(vec3(0.,1.,0.), vW.y) * pow(fres, 4.) * 2.;
            gl_FragColor = vec4(col * fogKeep(vW) * .85, 1.);
          }`,
      }));
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8;
      scene.add(mesh);
    }
    // Tentáculos (líneas instanciadas)
    {
      const T = tier >= 1 ? 28 : 18, S = tier >= 1 ? 26 : 16;
      const pos = [], at = [];
      for (let k = 0; k < T; k++) {
        const ang = (k / T) * Math.PI * 2 + rng() * 0.1, len = 0.6 + rng() * 0.8;
        for (let s = 0; s < S; s++) {
          for (const a of [s / S, (s + 1) / S]) { pos.push(0, 0, 0); at.push(ang, a, len); }
        }
      }
      const g = keep(new THREE.InstancedBufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 3));
      g.setAttribute('aJ', aJ); g.setAttribute('aP', aP); g.instanceCount = JN;
      const m = keep(new THREE.ShaderMaterial({
        uniforms: JU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: PULSE + /* glsl */`
          attribute vec3 aT; varying float vA; varying float vHue; varying vec3 vW;
          void main(){
            float ang = aT.x, along = aT.y, len = aT.z;
            float ph = uTime / aP.y + aP.x; float c = pulse(ph - .2 - along * .6);
            float r = (1. - .26 * c) * .95;
            vec3 p = vec3(cos(ang) * r, -.12, sin(ang) * r);
            p.xz *= 1. - along * (.45 - .25 * c);
            p.y -= along * len * 5.5;
            p.x += sin(uTime * .8 + ang * 3. + along * 5.) * along * .55;
            p.z += cos(uTime * .63 + ang * 2. + along * 4.) * along * .55;
            mat3 R = tiltM(aP.w, .18 + .06 * sin(uTime * .3 + aP.w));
            vW = aJ.xyz + R * p * aJ.w; vA = along; vHue = aP.z;
            gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
          }`,
        fragmentShader: WATER + /* glsl */`
          uniform vec3 uGlowA, uGlowB; varying float vA; varying float vHue; varying vec3 vW;
          void main(){ vec3 g = mix(uGlowA, uGlowB, vHue); gl_FragColor = vec4(g * (1. - vA) * (1. - vA) * .9 * fogKeep(vW), 1.); }`,
      }));
      const lines = new THREE.LineSegments(g, m); lines.frustumCulled = false; lines.renderOrder = 7;
      scene.add(lines);
    }
    // Brazos orales (cintas onduladas)
    {
      const parts = [];
      for (let k = 0; k < 4; k++) {
        const pg = new THREE.PlaneGeometry(1, 1, 3, tier >= 1 ? 40 : 24);
        const n = pg.attributes.position.count;
        pg.setAttribute('aArm', new THREE.Float32BufferAttribute(new Float32Array(n).fill(k), 1));
        parts.push(pg);
      }
      const merged = mergeGeometries(parts);
      const g = keep(new THREE.InstancedBufferGeometry());
      g.index = merged.index; g.attributes.position = merged.attributes.position; g.attributes.uv = merged.attributes.uv; g.attributes.aArm = merged.attributes.aArm;
      g.setAttribute('aJ', aJ); g.setAttribute('aP', aP); g.instanceCount = JN;
      const m = keep(new THREE.ShaderMaterial({
        uniforms: JU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: PULSE + /* glsl */`
          attribute float aArm; varying vec2 vUv; varying float vHue; varying vec3 vW;
          void main(){
            float along = .5 - position.y; float side = position.x;
            float a = aArm * 1.5708 + .4;
            float ph = uTime / aP.y + aP.x; float c = pulse(ph - .3 - along * .5);
            float w = (.22 - along * .12) * (1. + .5 * sin(along * 34. + uTime * 1.3 + aArm));
            vec3 center = vec3(cos(a) * (.12 + along * .25), -.15 - along * 2.6 * (1. - .1 * c), sin(a) * (.12 + along * .25));
            center.x += sin(uTime * .7 + along * 4. + aArm) * along * .3;
            center.z += cos(uTime * .5 + along * 3. + aArm) * along * .3;
            float tw = along * 6. + aArm + uTime * .2;
            vec3 dir = vec3(cos(tw), 0., sin(tw));
            vec3 p = center + dir * side * w;
            mat3 R = tiltM(aP.w, .18 + .06 * sin(uTime * .3 + aP.w));
            vW = aJ.xyz + R * p * aJ.w; vUv = vec2(side + .5, along); vHue = aP.z;
            gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
          }`,
        fragmentShader: WATER + /* glsl */`
          uniform vec3 uGlowA, uGlowB, uWarm; varying vec2 vUv; varying float vHue; varying vec3 vW;
          void main(){
            float e = abs(vUv.x - .5) * 2.;
            float frill = pow(e, 3.) * 1.2 + .12;
            vec3 g = mix(uGlowA, uGlowB, vHue * .6 + .2);
            vec3 col = mix(g, uWarm, .35) * frill * (1. - vUv.y * .7) * smoothstep(1., .9, e) * .55;
            gl_FragColor = vec4(col * fogKeep(vW), 1.);
          }`,
      }));
      const arms = new THREE.Mesh(g, m); arms.frustumCulled = false; arms.renderOrder = 7;
      scene.add(arms);
    }
    // Halo de dispersión alrededor de cada medusa (billboards)
    {
      const q = new THREE.PlaneGeometry(1, 1);
      const g = keep(new THREE.InstancedBufferGeometry());
      g.index = q.index; g.attributes.position = q.attributes.position; g.attributes.uv = q.attributes.uv;
      g.setAttribute('aJ', aJ); g.setAttribute('aP', aP); g.instanceCount = JN;
      const m = keep(new THREE.ShaderMaterial({
        uniforms: JU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: PULSE + /* glsl */`
          varying vec2 vUv; varying float vHue; varying float vK; varying float vC;
          void main(){
            vec3 c = aJ.xyz + vec3(0., -.1 * aJ.w, 0.);
            vec4 mv = viewMatrix * vec4(c, 1.);
            float s = aJ.w * 7.;
            mv.xy += position.xy * s;
            vUv = uv; vHue = aP.z; vC = pulse(uTime / aP.y + aP.x);
            vK = exp(-length(c - cameraPosition) * .034);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 uGlowA, uGlowB; varying vec2 vUv; varying float vHue; varying float vK; varying float vC;
          void main(){ float r = length(vUv - .5) * 2.; float a = exp(-r * r * 5.) * (1. - r); if (r > 1.) discard;
            gl_FragColor = vec4(mix(uGlowA, uGlowB, vHue) * a * (.10 + .05 * vC) * vK, 1.); }`,
      }));
      const halos = new THREE.Mesh(g, m); halos.frustumCulled = false; halos.renderOrder = 6;
      scene.add(halos);
    }

    // ---------------------------------------------------------------- Banco de peces (boids)
    const FN = tier >= 2 ? 420 : tier === 1 ? 300 : 170;
    const fp = new Float32Array(FN * 3), fv = new Float32Array(FN * 3), fs = new Float32Array(FN);
    for (let i = 0; i < FN; i++) {
      const a = rng() * 6.283, b = rng() * 2 - 1, r = Math.cbrt(rng()) * 4;
      fp[i * 3] = Math.cos(a) * r * Math.sqrt(1 - b * b); fp[i * 3 + 1] = b * r * 0.7; fp[i * 3 + 2] = Math.sin(a) * r * Math.sqrt(1 - b * b);
      fv[i * 3] = 3; fv[i * 3 + 1] = 0; fv[i * 3 + 2] = 0;
      fs[i] = 0.75 + rng() * 0.5;
    }
    const fishGeo = (() => {
      const prof = [];
      const L = 1, segs = 14;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs; // 0 nariz → 1 cola
        const r = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.9) * 0.13 * (1 - u * 0.55) + 0.004;
        prof.push(new THREE.Vector2(r, (0.5 - u) * L));
      }
      const body = new THREE.LatheGeometry(prof, tier >= 1 ? 10 : 7);
      body.rotateZ(-Math.PI / 2); // eje → x (nariz en +x)
      body.scale(1, 1, 0.42);
      const tail = new THREE.BufferGeometry();
      const tv = new Float32Array([-0.46, 0, 0, -0.68, 0.16, 0, -0.62, 0, 0, -0.46, 0, 0, -0.62, 0, 0, -0.68, -0.15, 0]);
      tail.setAttribute('position', new THREE.BufferAttribute(tv, 3));
      tail.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(18).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
      tail.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2));
      const b2 = body.index ? body.toNonIndexed() : body;
      const merged = mergeGeometries([b2, tail]);
      return merged;
    })();
    keep(fishGeo);
    const aFish = new THREE.InstancedBufferAttribute(new Float32Array(FN), 1);
    for (let i = 0; i < FN; i++) aFish.setX(i, rng() * 6.283);
    fishGeo.setAttribute('aPh', aFish);
    const fishMat = keep(new THREE.ShaderMaterial({
      uniforms: U, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        uniform float uTime; attribute float aPh; varying vec3 vW; varying vec3 vN; varying float vY;
        void main(){
          vec3 p = position;
          float k = clamp((.35 - p.x) / .95, 0., 1.);
          p.z += sin(uTime * 13. + aPh - p.x * 7.) * .09 * k * k;
          vec4 w = instanceMatrix * vec4(p, 1.);
          vW = (modelMatrix * w).xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vY = position.y / .13;
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
        }`,
      fragmentShader: WATER + /* glsl */`
        varying vec3 vW; varying vec3 vN; varying float vY;
        void main(){
          vec3 n = normalize(vN); vec3 V = normalize(cameraPosition - vW);
          if (dot(n, V) < 0.) n = -n;
          vec3 r = reflect(-V, n);
          vec3 sa = sunAtten(vW.y);
          vec3 env = waterColor(r, vW.y) * 2.2 + uSunCol * sa * pow(max(dot(r, uSunDir), 0.), 16.) * 2.5;
          float fres = .3 + .7 * pow(1. - max(dot(n, V), 0.), 2.5);
          vec3 alb = mix(vec3(.55, .62, .66), vec3(.015, .05, .07), smoothstep(-.1, .6, vY));
          float stripe = smoothstep(.06, 0., abs(vY - .1)) * .3;
          vec3 col = alb * (waterColor(n, vW.y) * 1.4 + uSunCol * sa * max(dot(n, uSunDir), 0.) * .55) + env * fres * (.55 - .4 * smoothstep(.2, .8, vY)) + stripe * env;
          gl_FragColor = vec4(waterFog(col, vW), 1.);
        }`,
    }));
    const fish = new THREE.InstancedMesh(fishGeo, fishMat, FN);
    fish.frustumCulled = false; fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(fish);
    const goal = new THREE.Vector3(), center = new THREE.Vector3(), centerS = new THREE.Vector3();
    // Rejilla espacial (hash) para vecinos
    const CELL = 2.2, TBL = 2048;
    const cellStart = new Int32Array(TBL + 1), cellIdx = new Int32Array(FN), cellOf = new Int32Array(FN);
    const hashCell = (x, y, z) => (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % TBL;
    function boids(dt) {
      cellStart.fill(0);
      for (let i = 0; i < FN; i++) {
        const h = hashCell(Math.floor(fp[i * 3] / CELL), Math.floor(fp[i * 3 + 1] / CELL), Math.floor(fp[i * 3 + 2] / CELL));
        cellOf[i] = h; cellStart[h + 1]++;
      }
      for (let i = 0; i < TBL; i++) cellStart[i + 1] += cellStart[i];
      const fill = cellIdx; const cursor = boids.cursor || (boids.cursor = new Int32Array(TBL));
      cursor.set(cellStart.subarray(0, TBL));
      for (let i = 0; i < FN; i++) fill[cursor[cellOf[i]]++] = i;
      const maxS = 6.2, minS = 2.6;
      for (let i = 0; i < FN; i++) {
        const ix = i * 3, px = fp[ix], py = fp[ix + 1], pz = fp[ix + 2];
        let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
        const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL), gz = Math.floor(pz / CELL);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const h = hashCell(gx + dx, gy + dy, gz + dz);
          for (let q = cellStart[h]; q < cellStart[h + 1]; q++) {
            const j = fill[q]; if (j === i) continue;
            const jx = j * 3, ex = fp[jx] - px, ey = fp[jx + 1] - py, ez = fp[jx + 2] - pz;
            const d2 = ex * ex + ey * ey + ez * ez;
            if (d2 > CELL * CELL) continue;
            if (d2 < 0.55) { const k = 1 / (d2 + 0.05); sx -= ex * k; sy -= ey * k; sz -= ez * k; }
            ax += fv[jx]; ay += fv[jx + 1]; az += fv[jx + 2]; cx += ex; cy += ey; cz += ez; n++;
          }
        }
        let fx = sx * 0.9, fy = sy * 0.9, fz = sz * 0.9;
        if (n) { fx += (ax / n - fv[ix]) * 1.6 + cx / n * 1.0; fy += (ay / n - fv[ix + 1]) * 1.6 + cy / n * 1.0; fz += (az / n - fv[ix + 2]) * 1.6 + cz / n * 1.0; }
        const gx2 = goal.x - px, gy2 = goal.y - py, gz2 = goal.z - pz;
        const gd = Math.sqrt(gx2 * gx2 + gy2 * gy2 + gz2 * gz2) + 1e-3;
        const gk = Math.min(1.6, gd * 0.12) / gd * 2.4;
        fx += gx2 * gk; fy += gy2 * gk * 0.8; fz += gz2 * gk;
        let vx = fv[ix] + fx * dt, vy = fv[ix + 1] + fy * dt, vz = fv[ix + 2] + fz * dt;
        vy *= 0.98;
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6;
        const cl = Math.min(maxS, Math.max(minS, sp)) / sp;
        vx *= cl; vy *= cl; vz *= cl;
        fv[ix] = vx; fv[ix + 1] = vy; fv[ix + 2] = vz;
        fp[ix] += vx * dt; fp[ix + 1] += vy * dt; fp[ix + 2] += vz * dt;
      }
    }
    function writeFish() {
      const a = fish.instanceMatrix.array;
      center.set(0, 0, 0);
      for (let i = 0; i < FN; i++) {
        const ix = i * 3; let x = fv[ix], y = fv[ix + 1], z = fv[ix + 2];
        const l = Math.sqrt(x * x + y * y + z * z) || 1; x /= l; y /= l; z /= l;
        let zx = -z, zy = 0, zz = x; const zl = Math.sqrt(zx * zx + zz * zz) || 1; zx /= zl; zz /= zl;
        const yx = zy * z - zz * y, yy = zz * x - zx * z, yz = zx * y - zy * x;
        const s = fs[i] * 0.42, o = i * 16;
        a[o] = x * s; a[o + 1] = y * s; a[o + 2] = z * s; a[o + 3] = 0;
        a[o + 4] = yx * s; a[o + 5] = yy * s; a[o + 6] = yz * s; a[o + 7] = 0;
        a[o + 8] = zx * s; a[o + 9] = zy * s; a[o + 10] = zz * s; a[o + 11] = 0;
        a[o + 12] = fp[ix]; a[o + 13] = fp[ix + 1]; a[o + 14] = fp[ix + 2]; a[o + 15] = 1;
        center.x += fp[ix]; center.y += fp[ix + 1]; center.z += fp[ix + 2];
      }
      center.multiplyScalar(1 / FN);
      fish.instanceMatrix.needsUpdate = true;
    }
    function moveSchool(to) {
      writeFishCenterOnly();
      const dx = to.x - center.x, dy = to.y - center.y, dz = to.z - center.z;
      for (let i = 0; i < FN; i++) { fp[i * 3] += dx; fp[i * 3 + 1] += dy; fp[i * 3 + 2] += dz; }
      centerS.copy(to);
    }
    function writeFishCenterOnly() {
      center.set(0, 0, 0);
      for (let i = 0; i < FN; i++) { center.x += fp[i * 3]; center.y += fp[i * 3 + 1]; center.z += fp[i * 3 + 2]; }
      center.multiplyScalar(1 / FN);
    }

    // ---------------------------------------------------------------- Nieve marina (bokeh)
    const SN = tier >= 2 ? 5200 : tier === 1 ? 3400 : 1800;
    const snowU = { ...U, uFocus: { value: 8 }, uPx: { value: 1 }, uBox: { value: 34 } };
    {
      const g = keep(new THREE.BufferGeometry());
      const p = new Float32Array(SN * 3), s = new Float32Array(SN);
      for (let i = 0; i < SN; i++) { p[i * 3] = rng(); p[i * 3 + 1] = rng(); p[i * 3 + 2] = rng(); s[i] = rng(); }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
      const m = keep(new THREE.ShaderMaterial({
        uniforms: snowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
          uniform float uTime, uFocus, uPx, uBox; uniform vec3 uSunCol; attribute float aS; varying float vA; varying float vR; varying vec3 vC;
          vec3 sunAttenV(float y){ return exp(min(y, 0.) * vec3(.075, .03, .021)); }
          void main(){
            vec3 drift = vec3(sin(uTime * .1 + aS * 30.) * .3, -uTime * .07 * (.4 + aS), cos(uTime * .08 + aS * 20.) * .3);
            vec3 rel = mod(position * uBox + drift - cameraPosition + uBox * .5, uBox) - uBox * .5;
            vec3 w = cameraPosition + rel;
            vec4 mv = viewMatrix * vec4(w, 1.);
            float z = max(-mv.z, .05);
            float coc = abs(z - uFocus) / max(z, .5) * 1.4;
            float sz = (.035 + aS * .05) * uPx / z * 1.0;
            float px = clamp(sz * 900. + coc * 7. * uPx, 1., 64.);
            gl_PointSize = px;
            float e = clamp(sz * 900. / px, 0., 1.);
            vA = e * e * (.5 + .5 * aS) * smoothstep(uBox * .5, uBox * .3, length(rel)) * smoothstep(.15, .8, z);
            vR = px;
            vC = (vec3(.55, .8, .85) * sunAttenV(w.y) + .08) * 1.4;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          varying float vA; varying float vR; varying vec3 vC;
          void main(){
            float r = length(gl_PointCoord - .5) * 2.;
            if (r > 1.) discard;
            float soft = smoothstep(1., mix(.2, .82, smoothstep(2., 12., vR)), r);
            float ring = vR > 6. ? smoothstep(.65, .95, r) * .5 : 0.;
            gl_FragColor = vec4(vC * vA * (soft + ring * soft), 1.);
          }`,
      }));
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 20;
      scene.add(pts);
    }

    // ---------------------------------------------------------------- Plano a plano
    const v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), tmpJ = new THREE.Vector3();
    let baseFov = 50, aspect = 16 / 9, focus = 10, schoolGoal = null;
    const lift = (x, z, m) => Math.max(seabed(x, z) + m, -200);
    const shots = [
      { name: 'Descenso', dur: 12, depth: true, school: () => goal.set(-4, -14, 14),
        run(cam, u, lt) {
          const e = easeInOut(u);
          const y = lerp(-5.5, -13, e);
          aim(cam, -30 + e * 10, y, -26 + e * 8, lerp(-6, -12, e), lerp(-1, -24, e), lerp(14, 6, e), wobble(lt * 0.3, 1) * 0.02);
          baseFov = 52; focus = 12;
        } },
      { name: 'Bosque de algas', dur: 13, school: (t) => goal.set(-4 + Math.sin(t * 0.2) * 6, -19, 22),
        run(cam, u, lt) {
          const x = lerp(-38, -14, u), z = lerp(-14, -2, u);
          const y = lift(x, z, 3.2) + wobble(lt * 0.4, 2) * 0.25;
          aim(cam, x, y, z, x + 22, y + 4.5 + Math.sin(u * 2) * 0.5, z + 14, wobble(lt * 0.25, 3) * 0.03);
          baseFov = 46; focus = 9;
        } },
      { name: 'Banco', dur: 11, school: (t) => goal.set(10 + t * 0.5, -17 + Math.sin(t * 0.5) * 1.5, -2 + Math.cos(t * 0.31) * 6),
        run(cam, u, lt) {
          const c = centerS;
          const a = -0.4 + u * 0.9;
          aim(cam, c.x + Math.sin(a) * 9, c.y - 1.2 + wobble(lt * 0.3, 4) * 0.4, c.z + Math.cos(a) * 9, c.x, c.y + 0.4, c.z, wobble(lt * 0.3, 5) * 0.025);
          baseFov = 44; focus = 9;
        } },
      { name: 'Contraluz', dur: 9, school: (t) => goal.set(4 + Math.sin(t * 0.3) * 4, -7.5, 2 + Math.cos(t * 0.27) * 4),
        run(cam, u, lt) {
          const r = lerp(0.2, 0.75, easeInOut(u));
          aim(cam, 0 + Math.sin(r) * 2, -21, 0, 4 + Math.sin(lt * 0.1) * 1.5, -3, 2.5 + r * 2.5, r * 0.35);
          baseFov = 62; focus = 14;
        } },
      { name: 'Medusa', dur: 14, school: () => goal.set(-10, -16, 20),
        run(cam, u, lt, t) {
          const j = jellyAt(0, t, tmpJ);
          const a = 2.4 + u * 0.95, r = lerp(5.2, 3.6, easeInOut(u));
          aim(cam, j.x + Math.cos(a) * r, j.y - 0.8 + Math.sin(u * 3) * 0.4, j.z + Math.sin(a) * r, j.x, j.y - 1.3, j.z, wobble(lt * 0.2, 6) * 0.02);
          baseFov = 40; focus = r;
        } },
      { name: 'El abismo', dur: 13, depth: true, school: () => goal.set(-10, -16, 20),
        run(cam, u, lt) {
          const e = easeInOut(u);
          const x = lerp(42, 66, e), y = lerp(-25, -52, e * e), z = lerp(-6, 2, e);
          aim(cam, x, y, z, x + 26, y - lerp(6, 40, e), z + 6, wobble(lt * 0.25, 7) * 0.03);
          baseFov = 54; focus = 16;
        } },
    ];
    const director = new Director(shots);

    // ---------------------------------------------------------------- Grafismo
    const ep = opts.program?.episode;
    const overlay = createOverlay(gfx, {
      letterbox: 0, loop: director.total,
      cues: [
        { type: 'lower', from: 2.5, to: 9.5, k: opts.title || 'Bajo la superficie', t: ep?.title || 'Zona crepuscular', s: 'Documental original · Abisal' },
        { type: 'lower', from: 52.5, to: 59, k: 'Medusa luna abisal', t: 'Luz propia a 60 metros', s: 'Bioluminiscencia: luz fría producida por reacción química' },
      ],
    });

    // ---------------------------------------------------------------- Ciclo
    let lastShot = -1;
    const state = { shot: '' };
    return {
      scene, camera,
      post: { bloom: { strength: 0.85, radius: 0.75, threshold: 0.62 }, grain: 0.045, vignette: 0.55, aberration: 0.35, exposure: 1.05 },
      update(dt, t) {
        U.uTime.value = t;
        const s = director.at(t);
        if (s.i !== lastShot) {
          lastShot = s.i;
          s.shot.school(s.lt);
          moveSchool(goal);
        }
        s.shot.school(s.lt);
        // simulación (subpasos estables)
        let rem = Math.min(dt, 0.1);
        while (rem > 1e-5) { const st = Math.min(rem, 1 / 30); boids(st); rem -= st; }
        writeFish();
        centerS.lerp(center, 1 - Math.exp(-dt * 2.5));
        for (let i = 0; i < JN; i++) { jellyAt(i, t, jellyPos); aJ.setXYZW(i, jellyPos.x, jellyPos.y, jellyPos.z, jelly[i].scale); }
        aJ.needsUpdate = true;
        s.shot.run(camera, s.u, s.lt, t, s.shot);
        const f = fitFov(baseFov, aspect);
        if (Math.abs(camera.fov - f) > 1e-3) { camera.fov = f; camera.updateProjectionMatrix(); }
        snowU.uFocus.value = focus;
        state.shot = s.shot.name;
        overlay.update(t);
        const depth = Math.max(0, -camera.position.y);
        overlay.setTag('Profundidad', `${Math.round(depth)}`, 'm');
        overlay.showTag(t % director.total > 11 && !(s.shot.name === 'Medusa'));
      },
      resize(w, h) {
        aspect = w / h; camera.aspect = aspect; camera.fov = fitFov(baseFov, aspect); camera.updateProjectionMatrix();
        snowU.uPx.value = h / 1080 * (renderer.getPixelRatio ? renderer.getPixelRatio() : 1);
        overlay.resize(w, h);
      },
      debug: () => state.shot,
      sound(ctx, out) {
        const k = soundKit(ctx, out);
        // Rumor submarino: ruido marrón muy filtrado con respiración lenta
        const brown = noiseBuffer(ctx, 6, 'brown');
        const rumble = k.loop(brown, 0.9);
        const lp = k.filter('lowpass', 180, 0.5);
        const rg = k.gain(0.55);
        rumble.connect(lp).connect(rg).connect(k.master);
        const lfo = k.osc('sine', 0.07); const lfoG = k.gain(0.18); lfo.connect(lfoG).connect(rg.gain);
        // Presión: dos senos graves con batido
        const o1 = k.osc('sine', 43), o2 = k.osc('sine', 43.6), og = k.gain(0.05);
        o1.connect(og); o2.connect(og); og.connect(k.master);
        // Agua en movimiento (rosa, banda media muy baja)
        const pink = k.loop(noiseBuffer(ctx, 5, 'pink'), 1);
        const bp = k.filter('bandpass', 520, 0.6), pg = k.gain(0.05);
        pink.connect(bp).connect(pg).connect(k.master);
        const lfo2 = k.osc('sine', 0.05), l2g = k.gain(240); lfo2.connect(l2g).connect(bp.frequency);
        // Reverberación sencilla (retardo realimentado filtrado)
        const dl = k.node(ctx.createDelay(1)); dl.delayTime.value = 0.23;
        const fb = k.gain(0.55), dlf = k.filter('lowpass', 1400);
        dl.connect(dlf).connect(fb).connect(dl); const wet = k.gain(0.5); dlf.connect(wet).connect(k.master);
        // Burbujas: chasquidos con barrido ascendente
        const bubble = (when, f0, vol) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          o.type = 'sine'; o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f0 * 2.2, when + 0.06);
          g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
          o.connect(g);
          if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(k.master); pan.connect(dl); } else { g.connect(k.master); g.connect(dl); }
          o.start(when); o.stop(when + 0.09);
          o.onended = () => { try { o.disconnect(); g.disconnect(); pan?.disconnect(); } catch {} };
        };
        k.every(0.6, 3.2, () => {
          const n = 1 + Math.floor(Math.random() * 6), t0 = ctx.currentTime + 0.02;
          for (let i = 0; i < n; i++) bubble(t0 + i * (0.03 + Math.random() * 0.09), 380 + Math.random() * 900, 0.02 + Math.random() * 0.05);
        });
        // Canto lejano de cetáceo (muy esporádico)
        k.every(14, 26, () => {
          const t0 = ctx.currentTime + 0.1, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 3;
          const f0 = 160 + Math.random() * 120;
          o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f0 * 1.4, t0 + 1.4); o.frequency.linearRampToValueAtTime(f0 * 0.7, t0 + 3.2);
          g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.025, t0 + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
          o.connect(f).connect(g); g.connect(dl); g.connect(k.master);
          o.start(t0); o.stop(t0 + 3.5); o.onended = () => { try { o.disconnect(); f.disconnect(); g.disconnect(); } catch {} };
        });
        return { stop: () => k.stop() };
      },
      dispose() {
        overlay.dispose();
        for (const d of disposables) d.dispose?.();
        fish.dispose();
        scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      },
    };
  },
};
