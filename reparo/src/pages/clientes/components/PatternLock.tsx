import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Eraser, Keyboard, RotateCcw } from 'lucide-react';
import { Button, Input, usePrefersReducedMotion, cx } from '@/ui';
import styles from './PatternLock.module.css';

export interface PatternLockProps {
  /** Secuencia de puntos 0..8 (izq→der, arriba→abajo). */
  value: number[];
  onChange?: (v: number[]) => void;
  readOnly?: boolean;
  /** Lado del cuadro en px (por defecto 240). */
  size?: number;
  /** En modo lectura, reproduce el trazo animado. */
  animate?: boolean;
}

const POS_LABEL = ['arriba a la izquierda', 'arriba al centro', 'arriba a la derecha', 'en medio a la izquierda', 'centro', 'en medio a la derecha', 'abajo a la izquierda', 'abajo al centro', 'abajo a la derecha'];

const rc = (i: number) => ({ r: Math.floor(i / 3), c: i % 3 });

/** Punto intermedio que Android agrega automáticamente entre a y b (o null). */
function between(a: number, b: number): number | null {
  const A = rc(a);
  const B = rc(b);
  if ((A.r + B.r) % 2 !== 0 || (A.c + B.c) % 2 !== 0) return null;
  const m = ((A.r + B.r) / 2) * 3 + (A.c + B.c) / 2;
  return m === a || m === b ? null : m;
}

/** Agrega `dot` a la secuencia con su punto intermedio (si falta). */
function append(path: number[], dot: number): number[] {
  if (path.includes(dot)) return path;
  const last = path[path.length - 1];
  const next = [...path];
  if (last != null) {
    const mid = between(last, dot);
    if (mid != null && !next.includes(mid)) next.push(mid);
  }
  next.push(dot);
  return next;
}

/** "1 5 9 6" / "1-5-9" → [0, 4, 8, 5] aplicando puntos intermedios. */
function parseSequence(text: string): number[] {
  let out: number[] = [];
  for (const ch of text) {
    const n = Number(ch);
    if (ch >= '1' && ch <= '9') out = append(out, n - 1);
  }
  return out;
}

function vibrate() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* sin vibración */
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Patrón de desbloqueo 3×3. Se dibuja con el dedo o el mouse (puntos
 * intermedios automáticos como en Android) o con el teclado (flechas + Enter).
 * En `readOnly` muestra el trazo numerado y, con `animate`, lo reproduce.
 */
export function PatternLock({ value, onChange, readOnly = false, size = 240, animate = false }: PatternLockProps) {
  const uid = useId().replace(/:/g, '');
  const reduced = usePrefersReducedMotion();
  const padRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState(4);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [announce, setAnnounce] = useState('');

  const cell = size / 3;
  const center = (i: number) => ({ x: (i % 3) * cell + cell / 2, y: Math.floor(i / 3) * cell + cell / 2 });
  const hitR = cell * 0.34;

  const path = draft ?? value;

  /* ------------------------- Reproducción animada ------------------------- */
  const valueKey = value.join(',');
  const [progress, setProgress] = useState<number>(() => (readOnly && animate && !reduced ? -1 : Math.max(0, value.length - 1)));
  const [playToken, setPlayToken] = useState(0);
  useEffect(() => {
    const n = value.length;
    if (!readOnly || !animate || reduced || n < 2) {
      setProgress(Math.max(0, n - 1));
      return;
    }
    let raf = 0;
    const per = 420;
    const delay = 280;
    const start = performance.now();
    setProgress(-1);
    const tick = (now: number) => {
      const t = now - start - delay;
      if (t < 0) {
        setProgress(t > -delay / 2 ? 0 : -1);
        raf = requestAnimationFrame(tick);
        return;
      }
      const seg = Math.floor(t / per);
      if (seg >= n - 1) {
        setProgress(n - 1);
        return;
      }
      setProgress(seg + easeInOut((t % per) / per));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey, readOnly, animate, reduced, playToken]);

  const shownProgress = readOnly ? progress : Math.max(0, path.length - 1);

  /* ------------------------------ Puntero ------------------------------- */
  const local = (e: PointerEvent) => {
    const rect = padRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * size, y: ((e.clientY - rect.top) / rect.height) * size };
  };

  const hitsAlong = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }, current: number[]) => {
      let next = current;
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(1, Math.ceil(dist / (cell / 6)));
      for (let s = 1; s <= steps; s++) {
        const px = from.x + ((to.x - from.x) * s) / steps;
        const py = from.y + ((to.y - from.y) * s) / steps;
        for (let i = 0; i < 9; i++) {
          if (next.includes(i)) continue;
          const c = { x: (i % 3) * cell + cell / 2, y: Math.floor(i / 3) * cell + cell / 2 };
          if (Math.hypot(px - c.x, py - c.y) <= hitR) {
            next = append(next, i);
            vibrate();
          }
        }
      }
      return next;
    },
    [cell, hitR],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (readOnly || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    lastPt.current = p;
    setPointer(p);
    setDraft(hitsAlong(p, p, []));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (draft == null) return;
    const p = local(e);
    const from = lastPt.current ?? p;
    lastPt.current = p;
    setPointer(p);
    setDraft((d) => (d ? hitsAlong(from, p, d) : d));
  };

  const finish = () => {
    if (draft == null) return;
    if (draft.length > 0) {
      onChange?.(draft);
      setAnnounce(`Patrón de ${draft.length} puntos: ${draft.map((d) => d + 1).join(', ')}`);
    }
    setDraft(null);
    setPointer(null);
    lastPt.current = null;
  };

  /* ------------------------------ Teclado ------------------------------- */
  const addDot = (i: number) => {
    if (readOnly) return;
    const next = append(value, i);
    if (next !== value) {
      onChange?.(next);
      setAnnounce(`Punto ${i + 1} agregado. Secuencia: ${next.map((d) => d + 1).join(', ')}`);
    } else setAnnounce(`El punto ${i + 1} ya está en el patrón`);
  };

  const onDotKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const { r, c } = rc(i);
    let n: number | null = null;
    if (e.key === 'ArrowLeft') n = r * 3 + Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') n = r * 3 + Math.min(2, c + 1);
    else if (e.key === 'ArrowUp') n = Math.max(0, r - 1) * 3 + c;
    else if (e.key === 'ArrowDown') n = Math.min(2, r + 1) * 3 + c;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = 8;
    else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (value.length) {
        onChange?.(value.slice(0, -1));
        setAnnounce(`Se quitó el punto ${value[value.length - 1] + 1}`);
      }
      return;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      addDot(i);
      return;
    }
    if (n != null) {
      e.preventDefault();
      setFocusIdx(n);
      btnRefs.current[n]?.focus();
    }
  };

  const clear = () => {
    onChange?.([]);
    setTyped('');
    setAnnounce('Patrón borrado');
  };

  /* ------------------------------- Dibujo -------------------------------- */
  const visible = useMemo(() => {
    if (shownProgress < 0) return [] as number[];
    return path.slice(0, Math.floor(shownProgress) + 1);
  }, [path, shownProgress]);

  const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    if (shownProgress < i) break;
    const a = center(path[i]);
    const b = center(path[i + 1]);
    const f = Math.min(1, shownProgress - i);
    if (f <= 0) break;
    segs.push({ x1: a.x, y1: a.y, x2: a.x + (b.x - a.x) * f, y2: a.y + (b.y - a.y) * f });
  }
  if (draft && pointer && draft.length) {
    const a = center(draft[draft.length - 1]);
    segs.push({ x1: a.x, y1: a.y, x2: pointer.x, y2: pointer.y });
  }
  const segPath = segs.map((s) => `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`).join('');

  const seqText = path.length ? path.map((d) => d + 1).join(' → ') : '';
  const label = readOnly
    ? path.length
      ? `Patrón de desbloqueo de ${path.length} puntos: ${path.map((d) => d + 1).join(', ')}`
      : 'Sin patrón de desbloqueo'
    : 'Patrón de desbloqueo. Dibuja con el dedo o usa las flechas y Enter para unir puntos; Retroceso quita el último.';

  const dotR = Math.max(4, size * 0.022);
  const activeR = Math.max(9, size * 0.05);
  const fontSize = Math.max(10, size * 0.05);

  return (
    <div className={styles.root} style={{ width: size, maxWidth: '100%' }}>
      <div
        ref={padRef}
        className={cx(styles.pad, readOnly && styles.readOnly, draft && styles.drawing)}
        style={{ aspectRatio: '1 / 1' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        role={readOnly ? 'img' : 'group'}
        aria-label={label}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className={styles.svg} aria-hidden>
          <defs>
            <linearGradient id={`g${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size} y2={size}>
              <stop offset="0" className={styles.stopA} />
              <stop offset="1" className={styles.stopB} />
            </linearGradient>
          </defs>
          {/* Guías sutiles */}
          {Array.from({ length: 9 }, (_, i) => {
            const c = center(i);
            return <circle key={`h${i}`} cx={c.x} cy={c.y} r={cell * 0.3} className={styles.halo} />;
          })}
          {segPath && <path d={segPath} className={styles.glow} stroke={`url(#g${uid})`} />}
          {segPath && <path d={segPath} className={styles.line} stroke={`url(#g${uid})`} />}
          {Array.from({ length: 9 }, (_, i) => {
            const c = center(i);
            const order = visible.indexOf(i);
            const on = order !== -1;
            return (
              <g key={i}>
                {on && order === 0 && <circle cx={c.x} cy={c.y} r={activeR + 6} className={styles.startRing} />}
                {on && <circle cx={c.x} cy={c.y} r={activeR + 4} className={styles.activeHalo} />}
                <circle cx={c.x} cy={c.y} r={on ? activeR : dotR} className={on ? styles.dotOn : styles.dot} fill={on ? `url(#g${uid})` : undefined} />
                {on && (
                  <text x={c.x} y={c.y} dy="0.35em" textAnchor="middle" className={styles.num} style={{ fontSize }}>
                    {order + 1}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {!readOnly && (
          <div className={styles.keys}>
            {Array.from({ length: 9 }, (_, i) => {
              const order = value.indexOf(i);
              return (
                <button
                  key={i}
                  ref={(el) => {
                    btnRefs.current[i] = el;
                  }}
                  type="button"
                  tabIndex={i === focusIdx ? 0 : -1}
                  className={styles.key}
                  aria-label={`Punto ${i + 1}, ${POS_LABEL[i]}${order !== -1 ? `, paso ${order + 1}` : ''}`}
                  aria-pressed={order !== -1}
                  onFocus={() => setFocusIdx(i)}
                  onKeyDown={(e) => onDotKey(e, i)}
                  onClick={(e) => {
                    // Sólo clics de teclado (detail 0); el puntero dibuja.
                    if (e.detail === 0) addDot(i);
                  }}
                />
              );
            })}
          </div>
        )}
        {readOnly && path.length === 0 && <span className={styles.emptyText}>Sin patrón</span>}
      </div>

      <div className={styles.meta}>
        <span className={cx(styles.seq, !seqText && styles.seqEmpty)} aria-hidden={!readOnly ? undefined : true}>
          {seqText || (readOnly ? 'Sin patrón' : 'Une al menos 4 puntos')}
        </span>
        {!readOnly && (
          <div className={styles.actions}>
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<Keyboard />}
              aria-expanded={typing}
              onClick={() => {
                setTyping((t) => !t);
                setTyped(value.map((d) => d + 1).join(' '));
              }}
            >
              Números
            </Button>
            <Button size="sm" variant="ghost" iconLeft={<Eraser />} onClick={clear} disabled={!value.length}>
              Borrar
            </Button>
          </div>
        )}
        {readOnly && animate && path.length > 1 && (
          <Button size="sm" variant="ghost" iconLeft={<RotateCcw />} onClick={() => setPlayToken((t) => t + 1)}>
            Repetir
          </Button>
        )}
      </div>

      {!readOnly && typing && (
        <Input
          size="sm"
          inputMode="numeric"
          autoComplete="off"
          label="Secuencia en números"
          hint="Puntos del 1 al 9, de izquierda a derecha y de arriba abajo. Ej.: 1 5 9 6"
          value={typed}
          onValueChange={(t) => {
            setTyped(t);
            onChange?.(parseSequence(t));
          }}
          className="mono"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
