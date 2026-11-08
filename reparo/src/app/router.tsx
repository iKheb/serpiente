/* Router mínimo basado en hash: funciona en file://, hosting estático y PWA. */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export type RouteName =
  | 'panel'
  | 'clientes'
  | 'gastos'
  | 'inventario'
  | 'reportes'
  | 'actividad'
  | 'ajustes'
  | 'ui' // galería interna del sistema de diseño (sólo desarrollo)
  | 'ui-charts' // galería de gráficos (sólo desarrollo)
  | 'ui-3d'; // galería 3D (sólo desarrollo)

export interface Route {
  name: RouteName;
  /** Segmentos después del nombre: #/clientes/abc → ['abc'] */
  params: string[];
  query: URLSearchParams;
  /** Hash completo normalizado, p. ej. "#/clientes?nuevo=1" */
  href: string;
}

const ROUTES: RouteName[] = ['panel', 'clientes', 'gastos', 'inventario', 'reportes', 'actividad', 'ajustes', 'ui', 'ui-charts', 'ui-3d'];

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const segs = path.split('/').filter(Boolean);
  const name = (ROUTES as string[]).includes(segs[0]) ? (segs[0] as RouteName) : 'panel';
  return { name, params: segs.slice(1), query: new URLSearchParams(qs), href: '#/' + raw };
}

let current = parse(typeof location !== 'undefined' ? location.hash : '');
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parse(location.hash);
    listeners.forEach((l) => l());
  });
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

/** navigate('#/clientes/123') o navigate('/clientes?nuevo=1') */
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = to.startsWith('#') ? to : '#' + (to.startsWith('/') ? to : '/' + to);
  if (opts.replace) {
    history.replaceState(null, '', hash);
    current = parse(hash);
    listeners.forEach((l) => l());
  } else {
    location.hash = hash;
  }
}

/** Actualiza la query de la ruta actual sin crear entrada de historial. */
export function setQuery(patch: Record<string, string | null>) {
  const q = new URLSearchParams(current.query);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const base = '#/' + [current.name, ...current.params].join('/');
  const qs = q.toString();
  navigate(base + (qs ? '?' + qs : ''), { replace: true });
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const href = to.startsWith('#') ? to : '#' + (to.startsWith('/') ? to : '/' + to);
  return (
    <a
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
