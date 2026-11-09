/**
 * OnboardingScene — escena a pantalla completa para la bienvenida.
 * Las piezas del celular flotan, se ensamblan y la pantalla se enciende con
 * el isotipo de Reparo. `stage` mueve la cámara/composición en cada paso.
 *
 * Llena su contenedor (usa `position: absolute; inset: 0` o dale alto).
 */
import { useEffect, useRef, useState } from 'react';
import s from './three.module.css';
import { DeviceFallback } from './DeviceFallback';
import { isWebGLAvailable, markWebGLUnavailable, scheduleIdle, useDocumentTheme, useReducedMotion } from './lib/env';
import type { OnboardingEngine } from './lib/onboardingEngine';
import type { ScreenData } from './lib/screenData';

export interface OnboardingSceneProps {
  /** Paso actual (0, 1, 2, 3…). 0: bienvenida · 1: dorso/cámaras · 2: vista por dentro · 3: panel. */
  stage?: number;
  className?: string;
  /** Primer frame dibujado (o fallback mostrado). */
  onReady?: () => void;
  /** El teléfono terminó de ensamblarse y la pantalla se encendió. */
  onAssembled?: () => void;
  /** Datos de la pantalla en los pasos que muestran el panel. */
  screen?: ScreenData;
}

type Status = 'loading' | 'ready' | 'fallback';

export function OnboardingScene({ stage = 0, className, onReady, onAssembled, screen }: OnboardingSceneProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<OnboardingEngine | null>(null);
  const theme = useDocumentTheme();
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<Status>(() => (isWebGLAvailable() ? 'loading' : 'fallback'));
  const live = useRef({ stage, theme, reduced, screen, onReady, onAssembled });
  live.current = { stage, theme, reduced, screen, onReady, onAssembled };
  const screenKey = JSON.stringify(screen ?? null);

  useEffect(() => {
    if (status !== 'fallback') return;
    live.current.onReady?.();
    live.current.onAssembled?.();
  }, [status]);

  useEffect(() => {
    if (status === 'fallback') return;
    const el = stageRef.current;
    if (!el) return;
    let engine: OnboardingEngine | null = null;
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      import('./lib/onboardingEngine')
        .then(({ OnboardingEngine }) => {
          if (cancelled) return;
          const l = live.current;
          try {
            engine = new OnboardingEngine(el, {
              stage: l.stage,
              theme: l.theme,
              reducedMotion: l.reduced,
              screen: l.screen,
              onReady: () => {
                if (cancelled) return;
                setStatus('ready');
                live.current.onReady?.();
              },
              onAssembled: () => !cancelled && live.current.onAssembled?.(),
              onContextLost: () => !cancelled && setStatus('fallback'),
            });
            engineRef.current = engine;
          } catch (err) {
            console.warn('[Reparo 3D] WebGL no disponible, usando ilustración estática.', err);
            markWebGLUnavailable();
            setStatus('fallback');
          }
        })
        .catch(() => !cancelled && setStatus('fallback'));
    });
    return () => {
      cancelled = true;
      cancel();
      engine?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === 'fallback']);

  useEffect(() => engineRef.current?.setStage(stage), [stage]);
  useEffect(() => engineRef.current?.setTheme(theme), [theme]);
  useEffect(() => engineRef.current?.setReducedMotion(reduced), [reduced]);
  useEffect(() => {
    engineRef.current?.setScreen(screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  const cls = [s.onboarding, status === 'ready' && s.ready, className].filter(Boolean).join(' ');
  return (
    <div className={cls} aria-hidden="true" data-status={status} data-stage={stage}>
      {status === 'fallback' ? (
        <DeviceFallback screen={screen} />
      ) : (
        <>
          <div className={s.placeholder} />
          <div ref={stageRef} className={s.stage} />
        </>
      )}
      <div className={s.vignette} />
    </div>
  );
}

export default OnboardingScene;
