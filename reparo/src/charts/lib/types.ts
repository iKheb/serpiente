/* Tipos compartidos por todos los gráficos de Reparo. */
import type { ReactNode } from 'react';

/** Formatea un número para mostrarlo (moneda, conteo, %...). */
export type ValueFormatter = (value: number) => string;

/** Una serie dibujable. `color` debe ser un token CSS: `var(--income)`. */
export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  /** Sólo AreaChart: `false` dibuja sólo la línea (sin relleno). Por defecto `true`. */
  area?: boolean;
  /** Línea discontinua (p. ej. "periodo anterior"). */
  dashed?: boolean;
  /** Color para valores negativos (BarChart). P. ej. ganancia < 0 → `var(--expense)`. */
  negativeColor?: string;
}

/** Línea de referencia horizontal (meta, promedio, umbral). */
export interface ReferenceLine {
  value: number;
  label?: string;
  /** Token de color. Por defecto `var(--text-3)`. */
  color?: string;
}

/** Propiedades comunes de los gráficos cartesianos (área y barras). */
export interface CartesianProps<T> {
  data: readonly T[];
  series: readonly ChartSeries[];
  /** Clave del dato con la etiqueta del eje X. Por defecto `label`. */
  xKey?: keyof T & string;
  /** Alternativa a `xKey` para construir la etiqueta. */
  getLabel?: (datum: T, index: number) => string;
  /** Alto del SVG (zona de trazado + eje X) en px. Por defecto 260. */
  height?: number;
  /** Valor completo (tooltip, tabla accesible). P. ej. `$12,450.00`. */
  formatValue?: ValueFormatter;
  /** Valor compacto para el eje Y. P. ej. `$12.4 k`. */
  formatAxisValue?: ValueFormatter;
  /** Título del tooltip (p. ej. fecha larga "sábado, 7 nov 2026"). */
  formatTooltipLabel?: (label: string, datum: T, index: number) => string;
  /** Contenido extra al pie del tooltip (margen, total...). */
  tooltipFooter?: (datum: T, index: number) => ReactNode;
  /** Mensaje del estado vacío. */
  emptyMessage?: string;
  /** Descripción accesible. Se completa con un resumen automático de los datos. */
  ariaLabel?: string;
  /** Leyenda (siempre recomendada con ≥ 2 series). Por defecto `top` si hay ≥ 2 series. */
  legend?: 'top' | 'bottom' | 'none';
  /** Permite ocultar/mostrar series desde la leyenda. Por defecto `true`. */
  toggleable?: boolean;
  /** Líneas de referencia (meta). */
  referenceLines?: readonly ReferenceLine[];
  /** Notifica el índice activo (hover/teclado) para sincronizar KPIs externos. */
  onActiveChange?: (index: number | null) => void;
  /** Desactiva las animaciones de entrada y de transición. */
  animate?: boolean;
  className?: string;
}
