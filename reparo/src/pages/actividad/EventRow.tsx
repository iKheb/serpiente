import { memo, useId } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  Cpu,
  ExternalLink,
  FileDown,
  FileUp,
  History,
  OctagonX,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react';
import {
  AUDIT_ACTION_LABEL,
  ENTITY_LABEL,
  FIELD_LABELS,
  formatFieldValue,
  formatFolio,
  type AuditAction,
  type AuditEntry,
  type EntityType,
  type FieldChange,
} from '@/data';
import { Badge, Button, Highlight, cx, fullDateTime } from '@/ui';
import { ACTION_TONE, RelativeTime, formatClock, isTrashEntity, plural, recordHref } from './lib';
import styles from './Actividad.module.css';

/** Acciones cuyo resumen ya lo dice (evita "Enviado a la papelera · Envió a la papelera"). */
const REDUNDANT = new Set<AuditAction>(['eliminar', 'restaurar', 'purgar', 'ajustes']);

export type RecordState = 'activo' | 'papelera' | 'purgado' | 'na';

const TONE_CLASS: Record<string, string> = {
  success: styles.tSuccess,
  info: styles.tInfo,
  danger: styles.tDanger,
  'danger-strong': styles.tDangerStrong,
  pending: styles.tPending,
  neutral: styles.tNeutral,
};

const ENTITY_ICON: Record<EntityType, React.ReactNode> = {
  cliente: <Users />,
  gasto: <Receipt />,
  inventario: <Package />,
  ajustes: <Settings2 />,
  sistema: <Cpu />,
};

function actionIcon(e: AuditEntry) {
  const a: AuditAction = e.action;
  switch (a) {
    case 'crear':
      return <Plus />;
    case 'editar':
      return <Pencil />;
    case 'eliminar':
      return <Trash2 />;
    case 'restaurar':
      return <RotateCcw />;
    case 'purgar':
      return <OctagonX />;
    case 'movimiento': {
      const s = e.changes?.find((c) => c.field === 'stock');
      if (s && typeof s.from === 'number' && typeof s.to === 'number') {
        if (s.to > s.from) return <PackagePlus />;
        if (s.to < s.from) return <PackageMinus />;
      }
      return <ArrowLeftRight />;
    }
    case 'importar':
      return <FileUp />;
    case 'exportar':
      return <FileDown />;
    case 'ajustes':
      return <Settings2 />;
    default:
      return <Cpu />;
  }
}

const SNAPSHOT_FIELDS: Record<'cliente' | 'gasto' | 'inventario', string[]> = {
  cliente: ['folio', 'nombre', 'telefono', 'marca', 'modelo', 'servicio', 'estado', 'cobroCents', 'pagadoCents', 'fecha'],
  gasto: ['concepto', 'categoria', 'proveedor', 'cantidad', 'costoUnitarioCents', 'totalCents', 'metodoPago', 'fecha'],
  inventario: ['nombre', 'categoria', 'marca', 'modelo', 'sku', 'stock', 'costoUnitarioCents', 'ubicacion'],
};

function snapshotRows(e: AuditEntry): { label: string; value: string }[] {
  const snap = e.snapshot as Record<string, unknown> | null;
  if (!snap || !isTrashEntity(e.entity)) return [];
  const domain = e.entity;
  const rows: { label: string; value: string }[] = [];
  for (const f of SNAPSHOT_FIELDS[domain]) {
    const v = snap[f];
    if (v == null || v === '') continue;
    const value = f === 'folio' && typeof v === 'number' ? formatFolio(v) : formatFieldValue(domain, f, v);
    rows.push({ label: FIELD_LABELS[domain][f] ?? f, value });
  }
  return rows;
}

/** Vista previa en línea para cambios de un solo campo: "Estado: Recibido → Listo". */
function InlineDiff({ c }: { c: FieldChange }) {
  return (
    <span className={styles.inlineDiff}>
      <span className={styles.inlineLabel}>{c.label}</span>
      <span className={styles.inlineFrom}>{c.fromText}</span>
      <ArrowRight aria-hidden className={styles.inlineArrow} />
      <span className={styles.inlineTo}>{c.toText}</span>
    </span>
  );
}

export interface EventRowProps {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: (id: string) => void;
  state: RecordState;
  query: string;
  reduced: boolean;
  onRestore: (e: AuditEntry) => void;
  onHistory: (e: AuditEntry) => void;
  /** Ya se filtra por este registro (oculta "Ver historial"). */
  scoped: boolean;
}

export const EventRow = memo(function EventRow({ entry: e, expanded, onToggle, state, query, reduced, onRestore, onHistory, scoped }: EventRowProps) {
  const detailId = useId();
  const tone = ACTION_TONE[e.action];
  const changes = e.changes ?? [];
  const href = state === 'activo' || state === 'na' ? recordHref(e.entity, e.entityId) : null;
  const isCreate = e.action === 'crear';
  const isRemoval = e.action === 'eliminar' || e.action === 'purgar';
  const snap = isRemoval || (changes.length === 0 && e.action === 'restaurar') ? snapshotRows(e) : [];
  const hasDetail = changes.length > 0 || snap.length > 0 || state === 'papelera' || (!!e.entityId && !scoped);
  const single = changes.length === 1 && !isCreate ? changes[0] : null;

  return (
    <li className={cx(styles.event, expanded && styles.eventOpen)}>
      <span className={cx(styles.node, TONE_CLASS[tone])} aria-hidden>
        {actionIcon(e)}
      </span>
      <div className={styles.card}>
        {hasDetail && (
          <button
            type="button"
            className={styles.hit}
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalle: ${e.title} — ${e.summary}`}
            onClick={() => onToggle(e.id)}
          />
        )}
        <div className={styles.head}>
          <div className={styles.main}>
            <div className={styles.titleLine}>
              {href ? (
                <a className={cx(styles.title, styles.titleLink)} href={href}>
                  <Highlight text={e.title} query={query} className={styles.mark} />
                </a>
              ) : (
                <span className={styles.title}>
                  <Highlight text={e.title} query={query} className={styles.mark} />
                </span>
              )}
              <Badge size="sm" icon={ENTITY_ICON[e.entity]} className={styles.entityBadge}>
                {ENTITY_LABEL[e.entity]}
              </Badge>
              {state === 'papelera' && (
                <Badge size="sm" tone="danger" dot>
                  En papelera
                </Badge>
              )}
              {state === 'purgado' && e.action !== 'purgar' && (
                <Badge size="sm" tone="neutral">
                  Ya no existe
                </Badge>
              )}
            </div>
            <p className={styles.summary}>
              {!REDUNDANT.has(e.action) && (
                <>
                  <span className={cx(styles.actionLabel, TONE_CLASS[tone])}>{AUDIT_ACTION_LABEL[e.action]}</span>
                  <span className={styles.dotSep} aria-hidden>
                    ·
                  </span>
                </>
              )}
              <Highlight text={e.summary} query={query} className={styles.mark} />
              {single && (
                <>
                  <span className={styles.dotSep} aria-hidden>
                    ·
                  </span>
                  <InlineDiff c={single} />
                </>
              )}
            </p>
          </div>
          <div className={styles.when}>
            <time className={styles.clock} dateTime={new Date(e.ts).toISOString()} title={fullDateTime(e.ts)}>
              {formatClock(e.ts)}
            </time>
            <RelativeTime ts={e.ts} className={styles.rel} />
          </div>
          {hasDetail && (
            <ChevronRight aria-hidden className={cx(styles.chev, expanded && styles.chevOpen)} />
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={detailId}
              key="detail"
              className={styles.detailWrap}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.detail}>
                {changes.length > 0 && (
                  <div className={styles.diff} role="table" aria-label="Cambios campo por campo">
                    <div className={styles.diffHead} role="row">
                      <span role="columnheader">Campo</span>
                      {isCreate ? (
                        <span role="columnheader" className={styles.diffSpan}>
                          Valor inicial
                        </span>
                      ) : (
                        <>
                          <span role="columnheader">Antes</span>
                          <span aria-hidden />
                          <span role="columnheader">Después</span>
                        </>
                      )}
                    </div>
                    {changes.map((c) => (
                      <div key={c.field} className={styles.diffRow} role="row">
                        <span role="rowheader" className={styles.diffField}>
                          {c.label}
                        </span>
                        {isCreate ? (
                          <span role="cell" className={cx(styles.diffTo, styles.diffSpan)}>
                            {c.toText}
                          </span>
                        ) : (
                          <>
                            <span role="cell" className={styles.diffFrom}>
                              {c.fromText === '—' ? <span className={styles.empty}>vacío</span> : <del>{c.fromText}</del>}
                            </span>
                            <ArrowRight aria-hidden className={styles.diffArrow} />
                            <span role="cell" className={styles.diffTo}>
                              {c.toText === '—' ? <span className={styles.empty}>vacío</span> : <ins>{c.toText}</ins>}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {snap.length > 0 && (
                  <div className={styles.snapshot}>
                    <p className={styles.snapTitle}>
                      {e.action === 'restaurar' ? 'Registro restaurado' : 'Instantánea al eliminar'}
                    </p>
                    <dl className={styles.snapGrid}>
                      {snap.map((r) => (
                        <div key={r.label} className={styles.snapItem}>
                          <dt>{r.label}</dt>
                          <dd>{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <div className={styles.detailFoot}>
                  <span className={styles.footMeta}>
                    {fullDateTime(e.ts)}
                    {changes.length > 0 && ` · ${plural(changes.length, 'campo', 'campos')}`}
                  </span>
                  <div className={styles.footActions}>
                    {e.entityId && !scoped && isTrashEntity(e.entity) && (
                      <Button size="sm" variant="ghost" iconLeft={<History />} onClick={() => onHistory(e)}>
                        Historial del registro
                      </Button>
                    )}
                    {href && e.entity !== 'ajustes' && (
                      <Button size="sm" variant="ghost" iconLeft={<ExternalLink />} onClick={() => (location.hash = href)}>
                        Abrir
                      </Button>
                    )}
                    {state === 'papelera' && (
                      <Button size="sm" variant="secondary" iconLeft={<RotateCcw />} onClick={() => onRestore(e)}>
                        Restaurar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
});

export { ENTITY_ICON };
