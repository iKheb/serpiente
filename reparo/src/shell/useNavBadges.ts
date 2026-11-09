import { useInventoryStats, useStatusCounts } from '@/data';
import type { RouteName } from '@/app/router';

export interface NavBadge {
  count: number;
  tone: 'brand' | 'warning';
  label: string;
}

/** Conteos de la navegación: equipos en taller y repuestos por pedir. */
export function useNavBadges(): Partial<Record<RouteName, NavBadge>> {
  const counts = useStatusCounts();
  const inv = useInventoryStats();
  const enTaller = counts ? counts.recibido + counts.diagnostico + counts.reparando + counts.listo : 0;
  const porPedir = inv?.porPedir ?? 0;
  const out: Partial<Record<RouteName, NavBadge>> = {};
  if (enTaller > 0) out.clientes = { count: enTaller, tone: 'brand', label: `${enTaller} ${enTaller === 1 ? 'equipo' : 'equipos'} en el taller` };
  if (porPedir > 0) out.inventario = { count: porPedir, tone: 'warning', label: `${porPedir} ${porPedir === 1 ? 'repuesto' : 'repuestos'} por pedir` };
  return out;
}
