import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './hooks';
import { cx } from './utils';

export interface AnimatedNumberProps {
  value: number;
  /** Formateador (p. ej. (n) => formatMoney(n)). Recibe valores intermedios redondeados. */
  format?: (n: number) => string;
  /** Duración en ms (por defecto 900). */
  duration?: number;
  /** Redondea los valores intermedios a enteros (por defecto true; útil para centavos). */
  integer?: boolean;
  className?: string;
  /** Anima desde 0 al montar (por defecto true). */
  fromZero?: boolean;
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Número que cuenta hasta su valor (tabular-nums). Respeta prefers-reduced-motion. */
export function AnimatedNumber({ value, format = (n) => n.toLocaleString('es'), duration = 900, integer = true, className, fromZero = true }: AnimatedNumberProps) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(() => (fromZero && !reduced ? 0 : value));
  const fromRef = useRef(display);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced || duration <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOutExpo(t);
      const out = integer ? Math.round(v) : v;
      fromRef.current = out;
      setDisplay(out);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, integer, reduced]);

  return (
    <span className={cx('tabular-nums', className)}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(display)}</span>
    </span>
  );
}
