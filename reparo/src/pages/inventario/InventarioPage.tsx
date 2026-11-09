/* Inventario de repuestos: existencias, uso, reposición y lista de compras. */
import { useMemo, useState } from 'react';
import { Boxes, Download, FileSpreadsheet, History, LayoutGrid, List, Package, PackageMinus, PackagePlus, PackageX, Plus, SearchX, ShoppingCart, Wallet } from 'lucide-react';
import { setQuery, useRoute } from '@/app/router';
import {
  Button,
  DropdownMenu,
  EmptyState,
  KpiCard,
  PageHeader,
  SearchField,
  SegmentedControl,
  Select,
  Tabs,
  toast,
  useIsMobile,
  useLocalState,
  useMediaQuery,
} from '@/ui';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  backupFilename,
  downloadBlob,
  exportCSV,
  formatMoney,
  formatNumber,
  needsReorder,
  useInventory,
  useInventoryItem,
  useInventoryStats,
  type ExpenseCategory,
} from '@/data';
import { ActionHost } from './ActionDialogs';
import { InventoryList } from './InventoryList';
import { ItemDetail } from './ItemDetail';
import { ItemForm } from './ItemForm';
import { ShoppingList } from './ShoppingList';
import { UsePicker } from './UsePicker';
import { errorMessage, matchesFiltro, matchesItem, parseFiltro, plural, type Filtro } from './lib';
import styles from './inventario.module.css';

export default function InventarioPage() {
  const route = useRoute();
  const id = route.params[0] ?? null;
  const q = route.query;
  const nuevo = q.get('nuevo') === '1';
  const editar = !!id && q.get('editar') === '1';
  const usar = q.get('usar') === '1';
  const editItem = useInventoryItem(editar ? id : null);

  return (
    <>
      {id ? <ItemDetail id={id} /> : <InventoryOverview />}
      <ItemForm
        open={nuevo || (editar && !!editItem)}
        item={editar ? editItem : null}
        onClose={() => setQuery(editar ? { editar: null } : { nuevo: null })}
      />
      <UsePicker open={usar} clienteId={q.get('cliente')} onClose={() => setQuery({ usar: null, cliente: null })} />
      <ActionHost />
    </>
  );
}

/* --------------------------------- Lista --------------------------------- */

type Vista = 'lista' | 'cuadricula';

function InventoryOverview() {
  const route = useRoute();
  const filtro = parseFiltro(route.query.get('filtro'));
  const items = useInventory();
  const stats = useInventoryStats();
  const mobile = useIsMobile();
  const narrow = useMediaQuery('(max-width: 767px)');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<ExpenseCategory | 'todas'>('todas');
  const [vista, setVista] = useLocalState<Vista>('reparo.inventario.vista', 'lista');

  const base = useMemo(() => items?.filter((i) => (cat === 'todas' || i.categoria === cat) && matchesItem(i, search)), [items, cat, search]);
  const counts = useMemo(() => {
    const c = { todos: 0, pedir: 0, pedidos: 0, agotados: 0 };
    for (const i of base ?? []) {
      c.todos++;
      if (needsReorder(i)) c.pedir++;
      if (i.pedidoAt != null) c.pedidos++;
      if (i.stock <= 0) c.agotados++;
    }
    return c;
  }, [base]);
  const rows = useMemo(() => base?.filter((i) => matchesFiltro(i, filtro)), [base, filtro]);
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items ?? []) m.set(i.categoria, (m.get(i.categoria) ?? 0) + 1);
    return m;
  }, [items]);

  const setFiltro = (f: Filtro) => setQuery({ filtro: f === 'todos' ? null : f });
  const filtersActive = !!search.trim() || cat !== 'todas';
  const clearFilters = () => {
    setSearch('');
    setCat('todas');
  };

  const exportar = async (kind: 'inventario' | 'movimientos') => {
    try {
      const blob = await exportCSV(kind);
      downloadBlob(blob, backupFilename('csv', kind));
      toast.success(kind === 'inventario' ? 'Inventario exportado' : 'Movimientos exportados', { description: 'Archivo CSV listo para Excel o Google Sheets.' });
    } catch (err) {
      toast.error('No se pudo exportar', { description: errorMessage(err) });
    }
  };

  const empty =
    items && items.length === 0 ? (
      <EmptyState
        icon={<Package />}
        accent={<Plus />}
        size="lg"
        title="Tu inventario está vacío"
        description="Agrega los repuestos que tienes en el taller. Al usarlos se descuentan solos y, cuando lleguen al mínimo, pasan a tu lista de compras."
        action={
          <Button variant="primary" iconLeft={<PackagePlus />} onClick={() => setQuery({ nuevo: '1' })}>
            Agregar primer artículo
          </Button>
        }
      />
    ) : filtersActive ? (
      <EmptyState
        icon={<SearchX />}
        tone="neutral"
        title="Sin resultados"
        description={search.trim() ? `Ningún artículo coincide con «${search.trim()}»${cat !== 'todas' ? ` en ${EXPENSE_CATEGORY_LABEL[cat]}` : ''}.` : `No hay artículos en ${EXPENSE_CATEGORY_LABEL[cat as ExpenseCategory]} con este filtro.`}
        action={<Button onClick={clearFilters}>Limpiar filtros</Button>}
      />
    ) : filtro === 'agotados' ? (
      <EmptyState icon={<Boxes />} tone="success" title="Nada agotado" description="Todos tus artículos tienen al menos una unidad en stock." />
    ) : (
      <EmptyState icon={<Package />} tone="neutral" title="Sin artículos" description="No hay artículos que mostrar con este filtro." />
    );

  const tabs = [
    { value: 'todos' as const, label: 'Todos', count: counts.todos },
    { value: 'pedir' as const, label: 'Por pedir', count: counts.pedir },
    { value: 'pedidos' as const, label: 'Pedidos', count: counts.pedidos },
    { value: 'agotados' as const, label: 'Agotados', count: counts.agotados },
  ];

  const catOptions = [
    { value: 'todas' as const, label: 'Todas las categorías', meta: <span className={styles.optCount}>{items?.length ?? 0}</span> },
    ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c], meta: <span className={styles.optCount}>{catCounts.get(c) ?? 0}</span> })),
  ];

  const unidades = stats?.unidades ?? 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Inventario"
        subtitle={stats ? `${plural(stats.articulos, 'artículo', 'artículos')} · ${plural(unidades, 'unidad', 'unidades')} en existencia` : 'Repuestos y consumibles del taller'}
        actions={
          <>
            <DropdownMenu
              trigger={
                <Button iconLeft={<Download />} aria-label="Exportar">
                  <span className={styles.hideSm}>Exportar</span>
                </Button>
              }
              align="end"
              width={250}
              label="Exportar"
              items={[
                { type: 'label', label: 'Exportar a CSV' },
                { label: 'Inventario', description: 'Artículos, stock, costos y estado', icon: <FileSpreadsheet />, onSelect: () => void exportar('inventario') },
                { label: 'Movimientos', description: 'Entradas, usos, ajustes y mermas', icon: <History />, onSelect: () => void exportar('movimientos') },
              ]}
            />
            <Button iconLeft={<PackageMinus />} onClick={() => setQuery({ usar: '1' })}>
              Usar repuesto
            </Button>
            <Button variant="primary" iconLeft={<Plus />} onClick={() => setQuery({ nuevo: '1' })}>
              Nuevo artículo
            </Button>
          </>
        }
      />

      <div className={styles.kpis}>
        <KpiCard label="Artículos" icon={<Package />} value={stats?.articulos ?? 0} format={(n) => formatNumber(n)} loading={!stats} footer={<span>{plural(EXPENSE_CATEGORIES.filter((c) => catCounts.get(c)).length, 'categoría', 'categorías')}</span>} />
        <KpiCard label="Unidades" icon={<Boxes />} value={unidades} format={(n) => formatNumber(n)} loading={!stats} footer={<span>piezas en existencia</span>} />
        <KpiCard label="Valor del inventario" tone="brand" icon={<Wallet />} value={stats?.valorCents ?? 0} format={(n) => formatMoney(n, { decimals: false })} loading={!stats} footer={<span>a costo de compra</span>} />
        <KpiCard
          label="Por pedir"
          tone="pending"
          icon={<ShoppingCart />}
          value={stats?.porPedir ?? 0}
          format={(n) => formatNumber(n)}
          loading={!stats}
          onClick={() => setFiltro('pedir')}
          footer={<span>{stats?.pedidos ? `${plural(stats.pedidos, 'pedido', 'pedidos')} en camino` : 'en o bajo el mínimo'}</span>}
        />
        <KpiCard label="Agotados" tone="expense" icon={<PackageX />} value={stats?.agotados ?? 0} format={(n) => formatNumber(n)} loading={!stats} onClick={() => setFiltro('agotados')} footer={<span>{stats?.agotados ? 'sin unidades' : 'todo con stock'}</span>} />
      </div>

      <div className={styles.controls}>
        <Tabs value={filtro} onChange={setFiltro} items={tabs} aria-label="Vistas del inventario" idPrefix="inv" className={styles.tabs} />
        <div className={styles.toolbar} role="toolbar" aria-label="Buscar y filtrar">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar nombre, modelo, SKU, proveedor…" containerClassName={styles.search} />
          <Select value={cat} onChange={(v) => setCat(v)} options={catOptions} containerClassName={styles.catSelect} width="100%" aria-label="Categoría" />
          {filtro !== 'pedir' && filtro !== 'pedidos' && (
            <SegmentedControl
              aria-label="Vista"
              value={vista}
              onChange={setVista}
              size="sm"
              options={[
                { value: 'lista', label: '', icon: <List />, ariaLabel: 'Lista' },
                { value: 'cuadricula', label: '', icon: <LayoutGrid />, ariaLabel: 'Cuadrícula' },
              ]}
            />
          )}
        </div>
      </div>

      <div id="inv-panel-content" role="tabpanel" aria-labelledby={`inv-tab-${filtro}`}>
        {filtro === 'pedir' ? (
          <ShoppingList items={base} />
        ) : filtro === 'pedidos' ? (
          filtersActive && rows?.length === 0 ? empty : <ShoppingList items={rows} onlyOrdered />
        ) : (
          <InventoryList rows={rows} q={search} view={vista} mobile={narrow} empty={empty} />
        )}
      </div>

    </div>
  );
}

