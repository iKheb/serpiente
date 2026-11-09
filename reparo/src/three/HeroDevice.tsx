/**
 * HeroDevice — smartphone premium en 3D con la interfaz de Reparo en pantalla.
 * Se "desarma" en capas al pasar el mouse / tocar (y una vez al aparecer).
 *
 * Llena su contenedor: dale alto con `className` o con el padre.
 */
import { useEffect, useRef, useState } from 'react';
import s from './three.module.css';
import { DeviceFallback } from './DeviceFallback';
import { isWebGLAvailable, markWebGLUnavailable, scheduleIdle, useDocumentTheme, useReducedMotion } from './lib/env';
import type { HeroEngine } from './lib/heroEngine';
import type { ScreenData } from './lib/screenData';

export type HeroScreen = ScreenData;

export interface HeroDeviceProps {
  className?: string;
  /** Datos de la mini‑interfaz (p. ej. "Ganancia del mes", "$48,250.00", sparkline). */
  screen?: HeroScreen;
  /** Parallax del puntero y desarme al pasar el mouse / tocar. Por defecto `true`. */
  interactive?: boolean;
  /** Desarma y vuelve a armar una vez al aparecer. Por defecto `true`. */
  autoExplode?: boolean;
  /** `hero` (tarjeta grande, pantalla con lista) o `compact` (KPI grande, menos partículas). */
  variant?: 'hero' | 'compact';
  /** Control externo de la vista explosionada (anula hover/auto). */
  exploded?: boolean;
  /** Texto accesible; por defecto describe los datos de la pantalla. */
  'aria-label'?: string;
}

type Status = 'loading' | 'ready' | 'fallback';

export function HeroDevice({
  className,
  screen,
  interactive = true,
  autoExplode = true,
  variant = 'hero',
  exploded,
  'aria-label': ariaLabel,
}: HeroDeviceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HeroEngine | null>(null);
  const theme = useDocumentTheme();
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<Status>(() => (isWebGLAvailable() ? 'loading' : 'fallback'));
  const screenKey = JSON.stringify(screen ?? null);

  // Valores actuales para la inicialización diferida sin recrear la escena.
  const live = useRef({ screen, theme, reduced, interactive, exploded });
  live.current = { screen, theme, reduced, interactive, exploded };

  useEffect(() => {
    if (status === 'fallback') return;
    const el = stageRef.current;
    if (!el) return;
    let engine: HeroEngine | null = null;
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      import('./lib/heroEngine')
        .then(({ HeroEngine }) => {
          if (cancelled) return;
          const l = live.current;
          try {
            engine = new HeroEngine(el, {
              variant,
              interactive: l.interactive,
              autoExplode,
              reducedMotion: l.reduced,
              theme: l.theme,
              screen: l.screen,
              exploded: l.exploded,
              onReady: () => !cancelled && setStatus('ready'),
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
    // La escena se recrea sólo si cambia la variante (o tras un fallo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, status === 'fallback']);

  useEffect(() => {
    engineRef.current?.setScreen(screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);
  useEffect(() => engineRef.current?.setTheme(theme), [theme]);
  useEffect(() => engineRef.current?.setReducedMotion(reduced), [reduced]);
  useEffect(() => engineRef.current?.setInteractive(interactive), [interactive]);
  useEffect(() => engineRef.current?.setExploded(exploded), [exploded]);

  const label =
    ariaLabel ??
    `Celular en 3D mostrando ${screen?.title ?? 'Ganancia del mes'}: ${screen?.value ?? '$48,250.00'}${
      screen?.caption ? ` (${screen.caption})` : ''
    }`;

  const cls = [s.host, variant === 'compact' && s.compact, status === 'ready' && s.ready, className].filter(Boolean).join(' ');

  return (
    <div className={cls} role="img" aria-label={label} data-status={status}>
      {status === 'fallback' ? (
        <DeviceFallback screen={screen} />
      ) : (
        <>
          <div className={s.placeholder} aria-hidden="true" />
          <div ref={stageRef} className={s.stage} />
        </>
      )}
    </div>
  );
}

export default HeroDevice;
