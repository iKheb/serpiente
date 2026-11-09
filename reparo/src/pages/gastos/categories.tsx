import { BatteryCharging, Cable, Camera, Cpu, Headphones, Layers, Smartphone, Tag, Wrench, type LucideIcon } from 'lucide-react';
import type { ExpenseCategory } from '@/data';
import { cx } from '@/ui';
import styles from './gastos.module.css';

export const CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
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

/** Color por categoría (tokens de la paleta de gráficos). */
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

/** Miniatura de categoría: ícono en un contenedor teñido con el color de la categoría. */
export function CategoryIcon({ categoria, size = 'md', className }: { categoria: ExpenseCategory; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = CATEGORY_ICON[categoria] ?? Tag;
  return (
    <span className={cx(styles.catIcon, styles[`cat-${size}`], className)} style={{ '--cat': CATEGORY_COLOR[categoria] } as React.CSSProperties} aria-hidden>
      <Icon />
    </span>
  );
}
