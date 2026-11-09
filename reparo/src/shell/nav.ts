import {
  Activity,
  ChartColumn,
  LayoutDashboard,
  Package,
  PackageMinus,
  PackagePlus,
  Receipt,
  Settings,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { RouteName } from '@/app/router';

export interface NavItem {
  route: RouteName;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Tecla de atajo para ir a la sección. */
  key: string;
  group: 'general' | 'analisis' | 'sistema';
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { route: 'panel', label: 'Panel', href: '#/panel', icon: LayoutDashboard, key: '1', group: 'general', description: 'Resumen del negocio' },
  { route: 'clientes', label: 'Clientes', href: '#/clientes', icon: Users, key: '2', group: 'general', description: 'Servicios y equipos' },
  { route: 'gastos', label: 'Gastos', href: '#/gastos', icon: Receipt, key: '3', group: 'general', description: 'Compras y repuestos' },
  { route: 'inventario', label: 'Inventario', href: '#/inventario', icon: Package, key: '4', group: 'general', description: 'Existencias y pedidos' },
  { route: 'reportes', label: 'Reportes', href: '#/reportes', icon: ChartColumn, key: '5', group: 'analisis', description: 'Ganancias por semana y mes' },
  { route: 'actividad', label: 'Actividad', href: '#/actividad', icon: Activity, key: '6', group: 'analisis', description: 'Registro de cambios' },
  { route: 'ajustes', label: 'Ajustes', href: '#/ajustes', icon: Settings, key: '7', group: 'sistema', description: 'Negocio, respaldo y notificaciones' },
];

export const ROUTE_TITLE: Record<RouteName, string> = {
  panel: 'Panel',
  clientes: 'Clientes',
  gastos: 'Gastos',
  inventario: 'Inventario',
  reportes: 'Reportes',
  actividad: 'Actividad',
  ajustes: 'Ajustes',
  ui: 'Sistema de diseño',
  'ui-charts': 'Gráficos',
  'ui-3d': 'Escenas 3D',
};

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Atajo de una tecla. */
  key: string;
  tone: 'brand' | 'expense' | 'income' | 'info';
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'nuevo-cliente', label: 'Nuevo cliente', description: 'Registrar un equipo que llega al taller', href: '#/clientes?nuevo=1', icon: UserPlus, key: 'C', tone: 'brand' },
  { id: 'nuevo-gasto', label: 'Nuevo gasto', description: 'Compra de repuestos u otro gasto', href: '#/gastos?nuevo=1', icon: Receipt, key: 'G', tone: 'expense' },
  { id: 'nuevo-repuesto', label: 'Nuevo repuesto', description: 'Agregar un artículo al inventario', href: '#/inventario?nuevo=1', icon: PackagePlus, key: 'I', tone: 'income' },
  { id: 'usar-repuesto', label: 'Usar repuesto', description: 'Descontar una pieza del stock', href: '#/inventario?usar=1', icon: PackageMinus, key: 'U', tone: 'info' },
];
