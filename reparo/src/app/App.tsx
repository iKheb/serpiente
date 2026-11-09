import { lazy, Suspense, useEffect } from 'react';
import { startAutoSync } from '@/data/sync';
import { useRoute, type RouteName } from './router';
import { AppShell } from '@/shell/AppShell';

const pages: Record<RouteName, React.LazyExoticComponent<React.ComponentType>> = {
  panel: lazy(() => import('@/pages/panel/PanelPage')),
  clientes: lazy(() => import('@/pages/clientes/ClientesPage')),
  gastos: lazy(() => import('@/pages/gastos/GastosPage')),
  inventario: lazy(() => import('@/pages/inventario/InventarioPage')),
  reportes: lazy(() => import('@/pages/reportes/ReportesPage')),
  actividad: lazy(() => import('@/pages/actividad/ActividadPage')),
  ajustes: lazy(() => import('@/pages/ajustes/AjustesPage')),
  ui: lazy(() => import('@/ui/Gallery')),
  'ui-charts': lazy(() => import('@/charts/ChartsGallery')),
  'ui-3d': lazy(() => import('@/three/ThreeGallery')),
};

export function App() {
  const route = useRoute();
  useEffect(() => startAutoSync(), []);
  const Page = pages[route.name];
  return (
    <AppShell route={route}>
      <Suspense fallback={null}>
        <Page key={route.name} />
      </Suspense>
    </AppShell>
  );
}
