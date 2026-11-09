/**
 * PartThumb — miniatura 3D (isométrica, iluminada, fondo transparente) de una
 * categoría de repuesto. Muestra un placeholder con brillo mientras se
 * renderiza y un ícono vectorial si WebGL no está disponible.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { ExpenseCategory } from '@/data/types';
import s from './three.module.css';
import { isWebGLAvailable, useDocumentTheme, type ThemeName } from './lib/env';
import { peekPartThumbnail, renderPartThumbnail } from './thumbnails';

export const PART_LABELS: Record<ExpenseCategory, string> = {
  pantallas: 'Pantallas',
  baterias: 'Baterías',
  puertos: 'Puertos de carga',
  camaras: 'Cámaras',
  placas: 'Placas',
  carcasas: 'Carcasas',
  herramientas: 'Herramientas',
  accesorios: 'Accesorios',
  otros: 'Otros',
};

export interface PartThumbProps {
  kind: ExpenseCategory;
  /** Lado en px CSS (por defecto 48). */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Fuerza un tema; por defecto sigue `data-theme` del documento. */
  theme?: ThemeName;
  /** Texto accesible; `''` la marca como decorativa. Por defecto la etiqueta de la categoría. */
  label?: string;
}

const ICONS: Record<ExpenseCategory, string> = {
  pantallas: 'M7 2.5h10a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2Z M10 5.5h4',
  baterias: 'M6 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z M20 10v4 M11.5 8.5 9.5 12h3l-2 3.5',
  puertos: 'M5 9h14a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6Z M8 12h8 M12 15v6',
  camaras: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M9 9.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M9 16m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M16 12.5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  placas: 'M7 7h10v10H7Z M10 10h4v4h-4Z M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  carcasas: 'M7 2.5h10a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2Z M8 5.5h4v4H8Z',
  herramientas: 'M14.5 3.5l6 6-3 3-6-6Z M11.5 9.5 4 17l3 3 7.5-7.5',
  accesorios: 'M6 3h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M10 13v3a4 4 0 0 0 4 4h4 M8 3V1 M12 3V1',
  otros: 'M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z M3.5 7 12 11.5 20.5 7 M12 11.5v10',
};

function FallbackIcon({ kind }: { kind: ExpenseCategory }) {
  return (
    <span className={s.thumbIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d={ICONS[kind]} />
      </svg>
    </span>
  );
}

export function PartThumb({ kind, size = 48, className, style, theme: themeProp, label }: PartThumbProps) {
  const docTheme = useDocumentTheme();
  const theme = themeProp ?? docTheme;
  const opts = { size, theme };
  const [src, setSrc] = useState<string | null>(() => peekPartThumbnail(kind, opts));
  const [failed, setFailed] = useState(() => !isWebGLAvailable());

  useEffect(() => {
    if (!isWebGLAvailable()) {
      setFailed(true);
      return;
    }
    let alive = true;
    const cached = peekPartThumbnail(kind, { size, theme });
    setSrc(cached);
    if (!cached) {
      renderPartThumbnail(kind, { size, theme })
        .then((url) => alive && setSrc(url))
        .catch(() => alive && setFailed(true));
    }
    return () => {
      alive = false;
    };
  }, [kind, size, theme]);

  const text = label ?? PART_LABELS[kind];
  const cls = [s.thumb, src && s.loaded, className].filter(Boolean).join(' ');
  return (
    <span
      className={cls}
      style={{ width: size, height: size, ...style }}
      role={text ? 'img' : undefined}
      aria-label={text || undefined}
      aria-hidden={text ? undefined : true}
      data-kind={kind}
    >
      {failed ? (
        <FallbackIcon kind={kind} />
      ) : (
        <>
          <span className={s.thumbPh} aria-hidden="true" />
          {src && <img src={src} alt="" width={size} height={size} draggable={false} />}
        </>
      )}
    </span>
  );
}

export default PartThumb;
