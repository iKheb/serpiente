import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMediaQuery } from './hooks';
import { Skeleton } from './Skeleton';
import { cx } from './utils';
import styles from './DataTable.module.css';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Valor para ordenar; si se define, el encabezado es ordenable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Primer sentido al ordenar por esta columna (por defecto 'asc'; usa 'desc' en fechas y montos). */
  defaultDir?: SortDir;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Oculta la columna en escritorios estrechos: 'lg' < 1100 px, 'xl' < 1320 px. */
  hideBelow?: 'lg' | 'xl';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  /** Filas; `undefined` muestra el esqueleto de carga. */
  rows: readonly T[] | undefined;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Tarjeta por fila en móvil. Si no se pasa, se genera una a partir de las columnas. */
  renderMobileRow?: (row: T) => ReactNode;
  /** Orden controlado. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Orden inicial (no controlado). */
  defaultSort?: SortState | null;
  loading?: boolean;
  /** Contenido cuando no hay filas (normalmente un <EmptyState />). */
  empty?: ReactNode;
  /** Cabecera fija bajo la barra superior (por defecto true). */
  stickyHeader?: boolean;
  /** Ancho por debajo del cual se usan tarjetas (por defecto 768). */
  mobileBreakpoint?: number;
  selectedId?: string | null;
  /** Acento de color a la izquierda de la fila. */
  rowAccent?: (row: T) => string | undefined;
  /** Sin contenedor con borde (si ya está dentro de una Card). */
  bare?: boolean;
  caption?: string;
  footer?: ReactNode;
  skeletonRows?: number;
  dense?: boolean;
  className?: string;
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base', numeric: true });
}

/**
 * Tabla de datos: encabezados ordenables, cabecera fija, hover y filas
 * clicables (Enter / ↑ ↓). En móvil renderiza tarjetas con `renderMobileRow`.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  renderMobileRow,
  sort: sortProp,
  onSortChange,
  defaultSort = null,
  loading,
  empty,
  stickyHeader = true,
  mobileBreakpoint = 768,
  selectedId,
  rowAccent,
  bare,
  caption,
  footer,
  skeletonRows = 6,
  dense,
  className,
}: DataTableProps<T>) {
  const mobile = useMediaQuery(`(max-width: ${mobileBreakpoint - 1}px)`);
  const [innerSort, setInnerSort] = useState<SortState | null>(defaultSort);
  const sort = sortProp !== undefined ? sortProp : innerSort;
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);

  const setSort = (s: SortState | null) => {
    if (sortProp === undefined) setInnerSort(s);
    onSortChange?.(s);
  };

  const sorted = useMemo(() => {
    if (!rows) return rows;
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const f = col.sortValue;
    const out = [...rows].sort((a, b) => compare(f(a), f(b)));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, columns]);

  const isLoading = loading || rows === undefined;

  const toggleSort = (c: Column<T>) => {
    const first = c.defaultDir ?? 'asc';
    if (!sort || sort.key !== c.key) setSort({ key: c.key, dir: first });
    else if (sort.dir === first) setSort({ key: c.key, dir: first === 'asc' ? 'desc' : 'asc' });
    else setSort(defaultSort);
  };

  const focusRow = (from: HTMLElement, dir: 1 | -1) => {
    const rowsEls = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('tr[tabindex]') ?? []);
    const i = rowsEls.indexOf(from);
    rowsEls[i + dir]?.focus();
  };

  /* ------------------------------- Móvil ------------------------------- */
  if (mobile) {
    if (isLoading) {
      return (
        <div className={cx(styles.cards, className)} aria-busy="true">
          {Array.from({ length: Math.min(skeletonRows, 5) }, (_, i) => (
            <div key={i} className={styles.cardSkeleton}>
              <Skeleton circle height={36} />
              <div className={styles.cardSkeletonText}>
                <Skeleton width="55%" height={12} />
                <Skeleton width="35%" height={10} />
              </div>
              <Skeleton width={56} height={12} />
            </div>
          ))}
        </div>
      );
    }
    if (!sorted || sorted.length === 0) return <div className={className}>{empty}</div>;
    return (
      <div className={className}>
        <ul className={styles.cards} aria-label={caption}>
          {sorted.map((row, i) => {
            const id = getRowId(row);
            const accent = rowAccent?.(row);
            const content = renderMobileRow ? (
              renderMobileRow(row)
            ) : (
              <dl className={styles.autoCard}>
                {columns.map((c) => (
                  <div key={c.key} className={styles.autoRow}>
                    <dt>{c.header}</dt>
                    <dd>{c.cell(row, i)}</dd>
                  </div>
                ))}
              </dl>
            );
            return (
              <li key={id} className={cx(styles.cardItem, selectedId === id && styles.selected)} style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}>
                {onRowClick ? (
                  <button type="button" className={styles.cardButton} onClick={() => onRowClick(row)}>
                    {content}
                  </button>
                ) : (
                  <div className={styles.cardStatic}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
        {footer && <div className={styles.mobileFooter}>{footer}</div>}
      </div>
    );
  }

  /* ----------------------------- Escritorio ----------------------------- */
  const showEmpty = !isLoading && sorted && sorted.length === 0;
  return (
    <div className={cx(styles.wrap, !bare && styles.boxed, className)}>
      <table className={cx(styles.table, dense && styles.dense, stickyHeader && styles.sticky)}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} className={c.hideBelow ? styles[`hide-${c.hideBelow}`] : undefined} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cx(styles[`align-${c.align ?? 'left'}`], c.hideBelow && styles[`hide-${c.hideBelow}`], c.className)}
                >
                  {c.sortValue ? (
                    <button type="button" className={cx(styles.sortBtn, active && styles.sortActive)} onClick={() => toggleSort(c)}>
                      <span>{c.header}</span>
                      {active ? sort!.dir === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden /> : <ChevronsUpDown className={styles.sortIdle} aria-hidden />}
                    </button>
                  ) : (
                    <span className={styles.thText}>{c.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {isLoading &&
            Array.from({ length: skeletonRows }, (_, r) => (
              <tr key={`sk${r}`} className={styles.skeletonRow} aria-hidden>
                {columns.map((c, ci) => (
                  <td key={c.key} className={cx(styles[`align-${c.align ?? 'left'}`], c.hideBelow && styles[`hide-${c.hideBelow}`])}>
                    <Skeleton width={ci === 0 ? '70%' : `${40 + ((r * 17 + ci * 23) % 40)}%`} height={11} style={{ marginLeft: c.align === 'right' ? 'auto' : undefined }} />
                  </td>
                ))}
              </tr>
            ))}
          {!isLoading &&
            sorted!.map((row, i) => {
              const id = getRowId(row);
              const accent = rowAccent?.(row);
              return (
                <tr
                  key={id}
                  className={cx(onRowClick && styles.clickable, selectedId === id && styles.selected, accent && styles.accented)}
                  style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={selectedId != null ? selectedId === id : undefined}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if ((e.target as HTMLElement).closest('button, a, input, [role="menuitem"]')) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            focusRow(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cx(styles[`align-${c.align ?? 'left'}`], c.hideBelow && styles[`hide-${c.hideBelow}`], c.className)}>
                      {c.cell(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
      {showEmpty && <div className={styles.empty}>{empty}</div>}
      {footer && !showEmpty && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
