import { ArrowUpRight, Copy, History, Package, Pencil, Receipt, Trash2, User } from 'lucide-react';
import { Link } from '@/app/router';
import {
  AUDIT_ACTION_LABEL,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  deviceFullName,
  formatFolio,
  formatMoney,
  formatNumber,
  useAudit,
  type Client,
  type Expense,
  type InventoryItem,
} from '@/data';
import { Badge, Button, DateTimeText, EmptyState, Sheet, Skeleton } from '@/ui';
import { CategoryIcon } from './categories';
import styles from './gastos.module.css';

export interface ExpenseDetailSheetProps {
  open: boolean;
  /** undefined = cargando, null = no existe. */
  expense: Expense | null | undefined;
  client?: Client;
  item?: InventoryItem;
  onClose: () => void;
  onEdit: (e: Expense) => void;
  onDuplicate: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}

export function ExpenseDetailSheet({ open, expense, client, item, onClose, onEdit, onDuplicate, onDelete }: ExpenseDetailSheetProps) {
  const audit = useAudit({ entity: 'gasto', entityId: expense?.id ?? '__none__' });
  const e = expense;
  const deleted = !!e?.deletedAt;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      icon={<Receipt />}
      title={e ? e.concepto : 'Gasto'}
      description={e ? <>Registrado el <DateTimeText value={e.createdAt} /></> : undefined}
      footer={
        e && !deleted ? (
          <div className={styles.formFooter}>
            <Button variant="danger-ghost" iconLeft={<Trash2 />} onClick={() => onDelete(e)} className={styles.footLeft}>
              Eliminar
            </Button>
            <Button variant="secondary" iconLeft={<Copy />} onClick={() => onDuplicate(e)}>
              Duplicar
            </Button>
            <Button variant="primary" iconLeft={<Pencil />} onClick={() => onEdit(e)}>
              Editar
            </Button>
          </div>
        ) : undefined
      }
    >
      {e === undefined ? (
        <div className={styles.detailSkeleton}>
          <Skeleton height={96} radius={14} />
          <Skeleton lines={6} height={14} />
        </div>
      ) : e === null ? (
        <EmptyState icon={<Receipt />} title="Este gasto no existe" description="Quizá se eliminó definitivamente o el enlace es incorrecto." tone="neutral" size="sm" action={<Button onClick={onClose}>Volver a gastos</Button>} />
      ) : (
        <div className={styles.detail}>
          {deleted && (
            <Badge tone="danger" dot>
              En la papelera desde <DateTimeText value={e.deletedAt!} />
            </Badge>
          )}
          <div className={styles.detailHero}>
            <CategoryIcon categoria={e.categoria} size="lg" />
            <div className={styles.detailHeroText}>
              <span className={styles.detailCat}>{EXPENSE_CATEGORY_LABEL[e.categoria]}</span>
              <span className={styles.detailTotal}>{formatMoney(e.totalCents)}</span>
              <span className={styles.detailCalc}>
                {formatNumber(e.cantidad)} {e.cantidad === 1 ? 'unidad' : 'unidades'} × {formatMoney(e.costoUnitarioCents)}
              </span>
            </div>
          </div>

          <dl className={styles.dl}>
            <div>
              <dt>Fecha y hora de compra</dt>
              <dd>
                <DateTimeText value={e.fecha} />
              </dd>
            </div>
            <div>
              <dt>Proveedor</dt>
              <dd>{e.proveedor || <span className={styles.muted}>Sin proveedor</span>}</dd>
            </div>
            <div>
              <dt>Método de pago</dt>
              <dd>{PAYMENT_METHOD_LABEL[e.metodoPago]}</dd>
            </div>
            <div>
              <dt>Última modificación</dt>
              <dd>
                <DateTimeText value={e.updatedAt} />
              </dd>
            </div>
          </dl>

          <div className={styles.detailBlock}>
            <h3 className={styles.blockTitle}>Vínculos</h3>
            <div className={styles.linkCards}>
              {client ? (
                <Link to={`#/clientes/${client.id}`} className={styles.linkCard}>
                  <span className={styles.linkIcon}>
                    <User />
                  </span>
                  <span className={styles.linkText}>
                    <span className={styles.linkTitle}>
                      <span className={styles.chipFolio}>{formatFolio(client.folio)}</span> {client.nombre}
                    </span>
                    <span className={styles.linkMeta}>{[deviceFullName(client), client.servicio].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ArrowUpRight className={styles.linkArrow} aria-hidden />
                </Link>
              ) : (
                <div className={styles.linkEmpty}>
                  <User aria-hidden /> Sin cliente vinculado
                </div>
              )}
              {item ? (
                <Link to={`#/inventario/${item.id}`} className={styles.linkCard}>
                  <span className={styles.linkIcon}>
                    <Package />
                  </span>
                  <span className={styles.linkText}>
                    <span className={styles.linkTitle}>{item.nombre}</span>
                    <span className={styles.linkMeta}>Inventario · {formatNumber(item.stock)} en stock</span>
                  </span>
                  <ArrowUpRight className={styles.linkArrow} aria-hidden />
                </Link>
              ) : (
                <div className={styles.linkEmpty}>
                  <Package aria-hidden /> Sin artículo de inventario
                </div>
              )}
            </div>
          </div>

          {e.notas && (
            <div className={styles.detailBlock}>
              <h3 className={styles.blockTitle}>Notas</h3>
              <p className={styles.notes}>{e.notas}</p>
            </div>
          )}

          <div className={styles.detailBlock}>
            <h3 className={styles.blockTitle}>
              <History aria-hidden /> Historial
            </h3>
            {!audit ? (
              <Skeleton lines={3} height={12} />
            ) : audit.length === 0 ? (
              <p className={styles.muted}>Sin movimientos registrados.</p>
            ) : (
              <ol className={styles.timeline}>
                {audit.map((a) => (
                  <li key={a.id} className={styles.tlItem} data-action={a.action}>
                    <span className={styles.tlDot} aria-hidden />
                    <div className={styles.tlBody}>
                      <div className={styles.tlHead}>
                        <span className={styles.tlTitle}>{a.summary || AUDIT_ACTION_LABEL[a.action]}</span>
                        <DateTimeText value={a.ts} muted className={styles.tlTime} />
                      </div>
                      {a.action === 'editar' && a.changes.length > 0 && (
                        <ul className={styles.tlChanges}>
                          {a.changes
                            .filter((c) => c.field !== 'totalCents')
                            .map((c) => (
                              <li key={c.field}>
                                <span className={styles.tlField}>{c.label}</span>
                                <span className={styles.tlFrom}>{c.fromText || '—'}</span>
                                <span aria-hidden>→</span>
                                <span className={styles.tlTo}>{c.toText || '—'}</span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
