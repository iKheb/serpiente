// =============================================================================
// Órbita · escena de reserva (A2): "señal orbital" con la paleta del contenido.
// Se usa cuando una escena no existe o falla al crearse. Digna, ligera y estable.
// =============================================================================
import { el } from './util.js';
import { tone } from '../../audio/synth.js';

export default {
  id: 'fallback',
  async create({ THREE, device, opts, gfx, rng }) {
    const pal = (opts.palette || ['#0b0f24', '#6d7cff', '#ffffff']).map((c) => new THREE.Color(c));
    const c1 = pal[1] || new THREE.Color('#6d7cff');
    const c2 = pal[2] || new THREE.Color('#ffffff');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color().copy(pal[0]).multiplyScalar(0.18);
    scene.fog = new THREE.FogExp2(scene.background.getHex(), 0.025);
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 400);

    // Núcleo con brillo de borde (fresnel)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: { a: { value: c1 }, b: { value: c2 }, t: { value: 0 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 p = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix*p; }',
        fragmentShader: 'uniform vec3 a,b; uniform float t; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-max(dot(vN,vV),0.0), 3.0); vec3 c = a*0.06 + a*f*2.4 + b*pow(f,6.0)*1.5; gl_FragColor = vec4(c,1.0); }',
      }),
    );
    scene.add(core);

    // Anillos de partículas
    const N = device.tier === 0 ? 2500 : 7000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ph = new Float32Array(N);
    const tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const ring = i % 3;
      const r = 3.4 + ring * 1.3 + (rng() - 0.5) * (0.35 + ring * 0.2);
      const a = rng() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (rng() - 0.5) * 0.12; pos[i * 3 + 2] = Math.sin(a) * r;
      tmp.copy(ring === 1 ? c2 : c1).multiplyScalar(0.8 + rng() * 2.2);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      ph[i] = ring;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pg.setAttribute('ring', new THREE.BufferAttribute(ph, 1));
    const pm = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, px: { value: 1 } },
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float ring; uniform float t; uniform float px; varying vec3 vC;
        void main(){ float sp = 0.08 / (1.0 + ring*0.6); float a = t*sp*(mod(ring,2.0) > 0.5 ? -1.0 : 1.0);
          vec3 p = position; float c = cos(a), s = sin(a); p.xz = mat2(c,-s,s,c)*p.xz;
          vec4 mv = modelViewMatrix*vec4(p,1.0); vC = color; gl_PointSize = px * 2.6 * (14.0 / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.0,0.5,length(d)); gl_FragColor = vec4(vC*a,1.0); }',
    });
    const rings = new THREE.Points(pg, pm);
    rings.rotation.x = 0.32; rings.rotation.z = -0.18;
    scene.add(rings);

    // Estrellas
    const S = 1500, sp = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) {
      const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(120 + rng() * 80);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9aa6ff, size: 0.6, sizeAttenuation: true, fog: false })));

    // Grafismo
    const card = el('div', 'bc-fallback');
    card.append(el('div', 'bc-fallback-kicker', opts.live ? 'Señal en directo' : 'Órbita presenta'));
    card.append(el('div', 'bc-fallback-title'));
    card.lastChild.textContent = opts.title || (typeof opts.program === 'object' ? opts.program?.title : opts.program) || 'Órbita';
    gfx.append(card);

    return {
      scene, camera,
      post: { bloom: { strength: 1.1, radius: 0.7, threshold: 0.6 }, grain: 0.05, vignette: 0.45, aberration: 0.3 },
      resize(w, h) { pm.uniforms.px.value = h / 720; },
      update(dt, t) {
        pm.uniforms.t.value = t;
        const a = t * 0.05;
        camera.position.set(Math.sin(a) * 13, 2.2 + Math.sin(t * 0.13) * 1.2, Math.cos(a) * 13);
        camera.lookAt(0, 0, 0);
        card.style.opacity = String(Math.max(0, Math.min(1, (t - 0.4) * 1.5)));
      },
      sound(ctx, out) {
        const g = ctx.createGain(); g.gain.value = 0.0; g.connect(out);
        g.gain.setTargetAtTime(0.08, ctx.currentTime, 1.5);
        const oscs = [0, 7, 12, 16].map((n, i) => {
          const o = ctx.createOscillator(); o.type = i ? 'sine' : 'triangle';
          o.frequency.value = 110 * Math.pow(2, n / 12); o.detune.value = (i - 1.5) * 4;
          const og = ctx.createGain(); og.gain.value = 0.25 / (i + 1); o.connect(og); og.connect(g); o.start(); return o;
        });
        tone(ctx, out, ctx.currentTime + 0.1, { f: 880, dur: 1.4, gain: 0.03, r: 1.2 });
        return { stop() { oscs.forEach((o) => { try { o.stop(); } catch { /* */ } }); g.disconnect(); } };
      },
      dispose() {},
    };
  },
};
