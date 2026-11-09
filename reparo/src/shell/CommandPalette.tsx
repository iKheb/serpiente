import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CornerDownLeft, Monitor, Moon, Package, Receipt, Search, Sun, SunMoon } from 'lucide-react';
import { navigate } from '@/app/router';
import {
  formatDate,
  formatFolio,
  formatMoney,
  stockStatus,
  updateSettings,
  useClients,
  useExpenses,
  useInventory,
} from '@/data';
import { EXPENSE_CATEGORY_LABEL, type ThemePreference } from '@/data/types';
import {
  Avatar,
  Badge,
  Highlight,
  Kbd,
  KbdGroup,
  Portal,
  StatusBadge,
  cx,
  fold,
  useFocusTrap,
  useLayer,
  useIsMobile,
  usePrefersReducedMotion,
  useScrollLock,
  MOD_KEY_LABEL,
} from '@/ui';
import { NAV_ITEMS, QUICK_ACTIONS } from './nav';
import { closeCommandPalette, useCommandPaletteOpen } from './palette';
import { toggleTheme } from './theme';
import styles from './CommandPalette.module.css';

type SectionId = 'acciones' | 'clientes' | 'inventario' | 'gastos' | 'navegacion' | 'preferencias' | 'recientes';

const SECTION_LABEL: Record<SectionId, string> = {
  acciones: 'Acciones rápidas',
  recientes: 'Clientes recientes',
  clientes: 'Clientes',
  inventario: 'Inventario',
  gastos: 'Gastos',
  navegacion: 'Ir a',
  preferencias: 'Preferencias',
};

interface PaletteItem {
  id: string;
  section: SectionId;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  meta?: ReactNode;
  shortcut?: string[];
  /** Texto extra para buscar (no se muestra). */
  keywords?: string;
  run: () => void;
  score?: number;
}

const THEME_ITEMS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'dark', label: 'Tema oscuro', icon: <Moon /> },
  { value: 'light', label: 'Tema claro', icon: <Sun /> },
  { value: 'system', label: 'Tema del sistema', icon: <Monitor /> },
];

function matchScore(item: PaletteItem, terms: string[], q: string): number | null {
  const title = fold(item.title);
  const hay = `${title} ${fold(item.subtitle ?? '')} ${fold(item.keywords ?? '')}`;
  if (!terms.every((t) => hay.includes(t))) return null;
  if (title.startsWith(q)) return 0;
  if (title.includes(q)) return 1;
  if (terms.every((t) => title.includes(t))) return 2;
  return 3;
}

function TileIcon({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={cx(styles.tile, styles[`tone-${tone}`])}>{children}</span>;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const clients = useClients();
  const expenses = useExpenses();
  const inventory = useInventory();

  const go = (href: string) => () => {
    onClose();
    navigate(href);
  };

  const base = useMemo(() => {
    const actions: PaletteItem[] = QUICK_ACTIONS.map((a) => ({
      id: a.id,
      section: 'acciones',
      title: a.label,
      subtitle: a.description,
      icon: (
        <TileIcon tone={a.tone}>
          <a.icon />
        </TileIcon>
      ),
      shortcut: [a.key],
      keywords: 'crear agregar registrar alta',
      run: go(a.href),
    }));
    actions.push(
      {
        id: 'por-pedir',
        section: 'acciones',
        title: 'Ver repuestos por pedir',
        subtitle: 'Artículos con stock bajo o marcados para pedir',
        icon: (
          <TileIcon tone="warning">
            <Package />
          </TileIcon>
        ),
        keywords: 'inventario reorden comprar stock bajo',
        run: go('#/inventario?filtro=pedir'),
      },
      {
        id: 'reporte-semana',
        section: 'acciones',
        title: 'Reporte de esta semana',
        subtitle: 'Cobrado, gastado y ganancia',
        icon: (
          <TileIcon tone="neutral">
            <Receipt />
          </TileIcon>
        ),
        keywords: 'ganancias semanal reportes',
        run: go('#/reportes?periodo=week'),
      },
      {
        id: 'reporte-mes',
        section: 'acciones',
        title: 'Reporte de este mes',
        subtitle: 'Cobrado, gastado y ganancia',
        icon: (
          <TileIcon tone="neutral">
            <Receipt />
          </TileIcon>
        ),
        keywords: 'ganancias mensual reportes',
        run: go('#/reportes?periodo=month'),
      },
    );
    const nav: PaletteItem[] = NAV_ITEMS.map((n) => ({
      id: `nav-${n.route}`,
      section: 'navegacion',
      title: n.label,
      subtitle: n.description,
      icon: (
        <TileIcon tone="neutral">
          <n.icon />
        </TileIcon>
      ),
      shortcut: [n.key],
      keywords: 'ir abrir ver pagina seccion',
      run: go(n.href),
    }));
    const prefs: PaletteItem[] = [
      {
        id: 'tema-alternar',
        section: 'preferencias',
        title: 'Alternar tema claro / oscuro',
        subtitle: 'Cambiar la apariencia',
        icon: (
          <TileIcon tone="neutral">
            <SunMoon />
          </TileIcon>
        ),
        shortcut: ['T'],
        keywords: 'tema apariencia modo color oscuro claro',
        run: () => {
          onClose();
          toggleTheme();
        },
      },
      ...THEME_ITEMS.map<PaletteItem>((t) => ({
        id: `tema-${t.value}`,
        section: 'preferencias',
        title: t.label,
        subtitle: 'Cambiar la apariencia',
        icon: <TileIcon tone="neutral">{t.icon}</TileIcon>,
        keywords: 'tema apariencia modo color oscuro claro sistema',
        run: () => {
          onClose();
          void updateSettings({ theme: t.value });
        },
      })),
    ];
    return { actions, nav, prefs };
  }, []);

  const q = fold(query.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  const folioQuery = /^#?\d{1,7}$/.test(query.trim()) ? parseInt(query.trim().replace('#', ''), 10) : null;

  const items = useMemo<PaletteItem[]>(() => {
    const clientItem = (c: NonNullable<typeof clients>[number], section: SectionId): PaletteItem => {
      const device = [c.marca, c.modelo].filter(Boolean).join(' ');
      return {
        id: `c-${c.id}`,
        section,
        title: c.nombre || 'Sin nombre',
        subtitle: [formatFolio(c.folio), device, c.telefono].filter(Boolean).join(' · '),
        icon: <Avatar name={c.nombre || '?'} size="sm" />,
        meta: <StatusBadge status={c.estado} size="sm" short />,
        keywords: `${c.telefono.replace(/\D/g, '')} ${c.email} ${c.imei} ${c.servicio} ${c.folio} ${String(c.folio).padStart(6, '0')}`,
        run: go(`#/clientes/${c.id}`),
      };
    };

    if (!q) {
      const recent = (clients ?? []).slice(0, 5).map((c) => clientItem(c, 'recientes'));
      return [...base.actions.slice(0, 4), ...recent, ...base.nav, ...base.prefs.slice(0, 1)];
    }

    const out: PaletteItem[] = [];
    const push = (list: PaletteItem[], limit: number) => {
      const scored: PaletteItem[] = [];
      for (const it of list) {
        const s = matchScore(it, terms, q);
        if (s != null) scored.push({ ...it, score: (it.score ?? 0) + s });
      }
      scored.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      out.push(...scored.slice(0, limit));
    };

    const clientList = (clients ?? []).map((c) => {
      const it = clientItem(c, 'clientes');
      if (folioQuery != null && c.folio === folioQuery) it.score = -10;
      return it;
    });
    push(clientList, 6);
    push(
      (inventory ?? []).map((i) => {
        const st = stockStatus(i);
        const tone = st === 'agotado' ? 'danger' : st === 'bajo' ? 'warning' : st === 'pedido' ? 'info' : 'neutral';
        return {
          id: `i-${i.id}`,
          section: 'inventario' as const,
          title: i.nombre,
          subtitle: [[i.marca, i.modelo].filter(Boolean).join(' '), i.sku, i.ubicacion].filter(Boolean).join(' · ') || EXPENSE_CATEGORY_LABEL[i.categoria],
          icon: (
            <TileIcon tone="income">
              <Package />
            </TileIcon>
          ),
          meta: (
            <Badge size="sm" tone={tone} dot={st !== 'ok'}>
              {i.stock} en stock
            </Badge>
          ),
          keywords: `${i.proveedor} ${EXPENSE_CATEGORY_LABEL[i.categoria]} repuesto pieza`,
          run: go(`#/inventario/${i.id}`),
        };
      }),
      5,
    );
    push(
      (expenses ?? []).map((e) => ({
        id: `g-${e.id}`,
        section: 'gastos' as const,
        title: e.concepto,
        subtitle: [EXPENSE_CATEGORY_LABEL[e.categoria], e.proveedor, formatDate(e.fecha)].filter(Boolean).join(' · '),
        icon: (
          <TileIcon tone="expense">
            <Receipt />
          </TileIcon>
        ),
        meta: <span className={styles.money}>{formatMoney(e.totalCents)}</span>,
        keywords: `${e.notas} gasto compra`,
        run: go(`#/gastos/${e.id}`),
      })),
      4,
    );
    push(base.actions, 6);
    push(base.nav, 7);
    push(base.prefs, 4);
    return out;
  }, [q, clients, expenses, inventory, base]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const loading = q && (clients === undefined || expenses === undefined || inventory === undefined);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Home' && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && e.ctrlKey) {
      e.preventDefault();
      setActive(items.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    }
  };

  let lastSection: SectionId | null = null;
  return (
    <>
      <div className={styles.inputRow}>
        <Search className={styles.searchIcon} aria-hidden />
        <input
          ref={inputRef}
          data-autofocus
          className={styles.input}
          placeholder={mobile ? 'Buscar clientes, folios, repuestos…' : 'Busca clientes, folios, teléfonos, IMEI, repuestos o acciones…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="paleta-resultados"
          aria-activedescendant={items[active] ? `paleta-${items[active].id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
        <Kbd size="sm">Esc</Kbd>
      </div>
      <div ref={listRef} id="paleta-resultados" role="listbox" aria-label="Resultados" className={styles.results}>
        {items.length === 0 && !loading && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Sin resultados para «{query.trim()}»</p>
            <p className={styles.emptyText}>Prueba con el nombre, el teléfono, el folio (p. ej. 123) o el modelo del equipo.</p>
          </div>
        )}
        {items.map((it, i) => {
          const header = it.section !== lastSection ? SECTION_LABEL[it.section] : null;
          lastSection = it.section;
          return (
            <div key={it.id}>
              {header && (
                <div className={styles.section} role="presentation">
                  {header}
                </div>
              )}
              <div
                id={`paleta-${it.id}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                className={cx(styles.item, i === active && styles.active)}
                onPointerMove={() => active !== i && setActive(i)}
                onClick={() => it.run()}
              >
                <span className={styles.itemIcon}>{it.icon}</span>
                <span className={styles.itemText}>
                  <span className={styles.itemTitle}>
                    <Highlight text={it.title} query={query} className={styles.mark} />
                  </span>
                  {it.subtitle && (
                    <span className={styles.itemSub}>
                      <Highlight text={it.subtitle} query={query} className={styles.mark} />
                    </span>
                  )}
                </span>
                {it.meta && <span className={styles.itemMeta}>{it.meta}</span>}
                {it.shortcut && <KbdGroup keys={it.shortcut} size="sm" className={styles.itemKbd} />}
                {i === active && <CornerDownLeft className={styles.enter} aria-hidden />}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.footer}>
        <span className={styles.hint}>
          <KbdGroup keys={['↑', '↓']} size="sm" /> Navegar
        </span>
        <span className={styles.hint}>
          <Kbd size="sm">↵</Kbd> Abrir
        </span>
        <span className={cx(styles.hint, styles.hideSm)}>
          <KbdGroup keys={[MOD_KEY_LABEL, 'K']} size="sm" /> o <Kbd size="sm">/</Kbd> Buscar
        </span>
        <span className={cx(styles.hint, styles.right, styles.hideSm)}>
          Atajos: <KbdGroup keys={['C', 'G', 'I', 'U']} size="sm" /> crear · <KbdGroup keys={['1', '–', '7']} size="sm" /> ir a
        </span>
      </div>
    </>
  );
}

/** Paleta de comandos global (⌘K / Ctrl+K / "/"). */
export function CommandPalette() {
  const open = useCommandPaletteOpen();
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useLayer(open, { onEscape: closeCommandPalette });

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className={styles.root} data-ui-modal="true">
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={closeCommandPalette}
              aria-hidden
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Paleta de comandos"
              className={styles.panel}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.98, y: reduced ? 0 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.985, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 560, damping: 40 }}
            >
              <PaletteBody onClose={closeCommandPalette} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
