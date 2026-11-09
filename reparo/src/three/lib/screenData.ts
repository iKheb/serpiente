/** Datos de la mini‑interfaz del teléfono (sin dependencias de three). */
export interface ScreenData {
  title: string;
  value: string;
  caption?: string;
  trend?: number[];
  /** Variación porcentual a mostrar; si falta se calcula del primer al último punto de `trend`. */
  delta?: number | null;
}

export const DEFAULT_SCREEN = {
  title: 'Ganancia del mes',
  value: '$48,250.00',
  caption: 'vs. mes anterior',
  trend: [39.2, 40.3, 39.7, 41.2, 40.5, 42.1, 41.4, 42.8, 42.2, 43.6, 43.0, 44.06],
} satisfies ScreenData;
