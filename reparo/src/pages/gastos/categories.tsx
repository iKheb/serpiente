import type { CSSProperties } from 'react';
import { BatteryCharging, Cable, Camera, Cpu, Headphones, Layers, Smartphone, Tag, Wrench, type LucideIcon } from 'lucide-react';
import type { ExpenseCategory } from '@/data';
import { PartThumb } from '@/three';
import { cx } from '@/ui';
import styles from './gastos.module.css';

/** Color por categoría (tokens de la paleta de gráficos). Fuente única también para Inventario. */
export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  pantallas: 'var(--chart-1)',
  baterias: 'var(--chart-3)',
  puertos: 'var(--chart-4)',
  camaras: 'var(--chart-6)',
  placas: 'var(--chart-2)',
  carcasas: 'var(--chart-7)',
  herramientas: 'var(--chart-5)',
  accesorios: 'color-mix(in oklab, var(--chart-4) 50%, var(--chart-5))',
  otros: 'var(--chart-8)',
};

/** Glifo vectorial mientras llega el sprite 3D (o si no hay WebGL). */
const CATEGORY_GLYPH: Record<ExpenseCategory, LucideIcon> = {
  pantallas: Smartphone,
  baterias: BatteryCharging,
  puertos: Cable,
  camaras: Camera,
  placas: Cpu,
  carcasas: Layers,
  herramientas: Wrench,
  accesorios: Headphones,
  otros: Tag,
};

const SIZE_PX = { xs: 20, sm: 26, md: 40, lg: 56 } as const;

/**
 * Miniatura de categoría: la pieza 3D (misma que en Inventario) sobre una
 * baldosa teñida con el color de la categoría.
 */
export function CategoryIcon({ categoria, size = 'md', className }: { categoria: ExpenseCategory; size?: keyof typeof SIZE_PX; className?: string }) {
  const px = SIZE_PX[size];
  // Un solo tamaño de sprite (caché del renderizador); se ajusta por CSS.
  const bucket = 48;
  const Glyph = CATEGORY_GLYPH[categoria] ?? Tag;
  return (
    <span className={cx(styles.catIcon, styles[`cat-${size}`], className)} style={{ '--cat': CATEGORY_COLOR[categoria] } as CSSProperties} aria-hidden>
      <Glyph className={styles.catGlyph} />
      <span className={styles.catArt} style={{ transform: `scale(${(px * 0.96) / bucket})` }}>
        <PartThumb kind={categoria} size={bucket} label="" />
      </span>
    </span>
  );
}
