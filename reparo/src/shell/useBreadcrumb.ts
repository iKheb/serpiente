import type { Route } from '@/app/router';
import { formatFolio, useClient, useExpense, useInventoryItem } from '@/data';
import { NAV_ITEMS, ROUTE_TITLE } from './nav';

export interface ShellCrumb {
  label: string;
  href?: string;
}

/** Migas de pan de la ruta actual: sección y, en detalle, el nombre del registro. */
export function useBreadcrumb(route: Route): ShellCrumb[] {
  const id = route.params[0] ?? null;
  const client = useClient(route.name === 'clientes' ? id : null);
  const expense = useExpense(route.name === 'gastos' ? id : null);
  const item = useInventoryItem(route.name === 'inventario' ? id : null);
  const nav = NAV_ITEMS.find((n) => n.route === route.name);
  const section: ShellCrumb = { label: ROUTE_TITLE[route.name], href: nav?.href ?? `#/${route.name}` };
  if (!id) return [{ label: section.label }];
  let detail = 'Detalle';
  if (route.name === 'clientes' && client) detail = `${client.nombre || 'Cliente'} · ${formatFolio(client.folio)}`;
  else if (route.name === 'gastos' && expense) detail = expense.concepto;
  else if (route.name === 'inventario' && item) detail = item.nombre;
  return [section, { label: detail }];
}
