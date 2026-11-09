/**
 * Galería 3D (ruta #/ui-3d, sólo desarrollo).
 * Query opcionales: `explode=1|0` fuerza la vista explosionada; `stage=N` el paso del onboarding.
 */
import { useState } from 'react';
import type { ExpenseCategory } from '@/data/types';
import { HeroDevice, OnboardingScene, PartThumb, PART_LABELS, type HeroScreen } from './index';
import g from './ThreeGallery.module.css';

const SCREENS: HeroScreen[] = [
  { title: 'Ganancia del mes', value: '$48,250.00', caption: 'vs. mes anterior', trend: [39, 40.3, 39.7, 41.2, 40.5, 42.1, 41.4, 42.8, 42.2, 43.6, 43, 44.06] },
  { title: 'Cobrado esta semana', value: '$18,940.00', caption: '32 servicios entregados', trend: [12, 15, 11, 18, 16, 21, 24] },
  { title: 'Gastado en repuestos', value: '$7,315.50', caption: 'vs. semana anterior', trend: [9, 8.6, 9.4, 8.1, 7.9, 7.2, 7.4] },
];

const STEPS = [
  { title: 'Bienvenido a Reparo', text: 'Tu servicio técnico, organizado desde el primer día.' },
  { title: 'Cada equipo, a la vista', text: 'Registra clientes, fallas y fotos de evidencia en segundos.' },
  { title: 'Repuestos bajo control', text: 'Inventario, gastos y reposiciones vinculados a cada reparación.' },
  { title: 'Tu ganancia, clara', text: 'Cobrado, gastado y por cobrar, con reportes semanales y mensuales.' },
];

const KINDS = Object.keys(PART_LABELS) as ExpenseCategory[];

export default function ThreeGallery() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const ex = q.get('explode');
  const [exploded, setExploded] = useState<boolean | undefined>(ex === null ? undefined : ex === '1');
  const [screenIdx, setScreenIdx] = useState(0);
  const [stage, setStage] = useState(() => Math.max(0, Math.min(STEPS.length - 1, Number(q.get('stage')) || 0)));
  const screen = SCREENS[screenIdx];
  const only = q.get('only');
  const show = (k: string) => !only || only.split(',').includes(k);

  return (
    <div className={g.page}>
      <header className={g.header}>
        <span className={g.eyebrow}>Sistema 3D</span>
        <h1>Galería 3D</h1>
        <p className={g.lead}>
          Escenas Three.js procedurales (sin descargas): dispositivo héroe con vista explosionada, escena de bienvenida y
          miniaturas de repuestos. Pasa el mouse o toca el teléfono para desarmarlo.
        </p>
      </header>

      {show('hero') && (
      <section className={g.section} aria-labelledby="g-hero">
        <h2 id="g-hero">HeroDevice · variante hero</h2>
        <div className={`${g.card} ${g.heroCard}`}>
          <div className={g.heroText}>
            <span className={g.kpiLabel}>{screen.title}</span>
            <span className={g.kpiValue}>{screen.value}</span>
            <span className={g.delta}>{screen.caption}</span>
            <div className={g.actions}>
              <button className={`${g.btn} ${g.primary}`} onClick={() => setScreenIdx((i) => (i + 1) % SCREENS.length)}>
                Cambiar datos
              </button>
              <button className={g.btn} aria-pressed={exploded === true} onClick={() => setExploded((v) => (v ? undefined : true))}>
                {exploded ? 'Armar' : 'Desarmar'}
              </button>
            </div>
          </div>
          <HeroDevice className={g.heroDevice} screen={screen} exploded={exploded} />
        </div>
      </section>
      )}

      {show('compact') && (
      <section className={g.section} aria-labelledby="g-compact">
        <h2 id="g-compact">HeroDevice · variante compact</h2>
        <div className={g.compactGrid}>
          {SCREENS.slice(1).map((sc) => (
            <div key={sc.title} className={`${g.card} ${g.compactCard}`}>
              <div className={g.heroText}>
                <span className={g.kpiLabel}>{sc.title}</span>
                <span className={g.kpiValue}>{sc.value}</span>
                <span className={g.note}>{sc.caption}</span>
              </div>
              <HeroDevice className={g.compactDevice} variant="compact" screen={sc} exploded={exploded} autoExplode={false} />
            </div>
          ))}
        </div>
      </section>
      )}

      {show('onb') && (
      <section className={g.section} aria-labelledby="g-onb">
        <h2 id="g-onb">OnboardingScene</h2>
        <div className={`${g.card} ${g.onboardingWrap}`}>
          <OnboardingScene stage={stage} />
          <div className={g.onboardingOverlay}>
            <div className={g.steps} role="group" aria-label="Pasos">
              {STEPS.map((st, i) => (
                <button
                  key={st.title}
                  className={g.dot}
                  aria-label={`Paso ${i + 1}: ${st.title}`}
                  aria-current={i === stage ? 'step' : undefined}
                  onClick={() => setStage(i)}
                />
              ))}
            </div>
            <h3>{STEPS[stage].title}</h3>
            <p>{STEPS[stage].text}</p>
            <div className={g.actions}>
              <button className={g.btn} disabled={stage === 0} onClick={() => setStage((s) => Math.max(0, s - 1))}>
                Anterior
              </button>
              <button className={`${g.btn} ${g.primary}`} onClick={() => setStage((s) => (s + 1) % STEPS.length)}>
                {stage === STEPS.length - 1 ? 'Reiniciar' : 'Siguiente'}
              </button>
            </div>
          </div>
        </div>
      </section>
      )}

      {show('thumbs') && (
      <section className={g.section} aria-labelledby="g-thumbs">
        <h2 id="g-thumbs">PartThumb · miniaturas de repuestos</h2>
        <p className={g.note}>Un solo WebGLRenderer compartido fuera de pantalla, con caché por categoría, tamaño, tema y DPR.</p>
        <div className={g.thumbGrid}>
          {KINDS.map((k) => (
            <div key={k} className={`${g.card} ${g.thumbCard}`}>
              <PartThumb kind={k} size={96} />
              <span className={g.thumbLabel}>{PART_LABELS[k]}</span>
              <div className={g.sizes}>
                <PartThumb kind={k} size={48} label="" />
                <PartThumb kind={k} size={32} label="" />
              </div>
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}
