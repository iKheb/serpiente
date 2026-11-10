import { openExternal } from '@/app/external';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Mail,
  MessageCircle,
  NotebookPen,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  User,
  Wrench,
} from 'lucide-react';
import {
  AUDIT_ACTION_LABEL,
  EXPENSE_CATEGORY_LABEL,
  UNLOCK_TYPE_LABEL,
  formatMoney,
  formatPercent,
  useClientFinancials,
  useExpenses,
  useInventory,
  useMovements,
  useSettings,
  warrantyExpiresAt,
  whatsappUrl,
  calendarDayDiff,
  type AuditEntry,
  type Client,
} from '@/data';
import { navigate } from '@/app/router';
import { Badge, Button, Card, DateTimeText, IconButton, MoneyText, ProgressBar, Skeleton, cx, toast, usePrefersReducedMotion } from '@/ui';
import { PatternLock } from '../components/PatternLock';
import { copyText } from '../receipt/clipboard';
import styles from './ClientDetail.module.css';

/* ------------------------------ Utilidades -------------------------------- */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      size="sm"
      icon={done ? <Check /> : <Copy />}
      label={done ? 'Copiado' : label}
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } else toast({ title: 'No se pudo copiar', tone: 'danger' });
      }}
    />
  );
}

function Def({ label, children, wide, className }: { label: string; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cx(styles.def, wide && styles.defWide, className)}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/* -------------------------------- Contacto -------------------------------- */

export function ContactCard({ client }: { client: Client }) {
  const settings = useSettings();
  const tel = client.telefono.trim();
  return (
    <Card as="section" className={styles.card} title="Cliente" icon={<User />}>
      <dl className={styles.defs}>
        <Def label="Nombre" wide>
          {client.nombre || '—'}
        </Def>
        <Def label="Teléfono" wide>
          {tel ? (
            <span className={styles.inlineCopy}>
              <a href={`tel:${tel.replace(/[^\d+]/g, '')}`} className={cx(styles.link, styles.tnum)}>
                {tel}
              </a>
              <CopyButton value={tel} label="Copiar teléfono" />
            </span>
          ) : (
            <span className={styles.muted}>Sin teléfono</span>
          )}
        </Def>
        {client.email.trim() && (
          <Def label="Correo" wide>
            <a href={`mailto:${client.email.trim()}`} className={styles.link}>
              <Mail aria-hidden className={styles.inlineIcon} />
              {client.email.trim()}
            </a>
          </Def>
        )}
      </dl>
      {tel && settings && (
        <div className={styles.cardActions}>
          <Button size="sm" iconLeft={<Phone />} onClick={() => (location.href = `tel:${tel.replace(/[^\d+]/g, '')}`)}>
            Llamar
          </Button>
          <Button
            size="sm"
            iconLeft={<MessageCircle />}
            onClick={() => openExternal(whatsappUrl(tel, `Hola ${client.nombre.split(' ')[0] || ''}`.trim(), settings.phoneCountryCode))}
          >
            Abrir chat
          </Button>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------- Equipo --------------------------------- */

export function DeviceCard({ client }: { client: Client }) {
  return (
    <Card as="section" className={styles.card} title="Equipo" icon={<Smartphone />}>
      <dl className={cx(styles.defs, styles.defsDense)}>
        <Def label="Marca">{client.marca || '—'}</Def>
        <Def label="Modelo">{client.modelo || '—'}</Def>
        <Def label="IMEI / serie" className={styles.defImei}>
          {client.imei.trim() ? (
            <span className={styles.inlineCopy}>
              <span className={styles.mono}>{client.imei}</span>
              <CopyButton value={client.imei.trim()} label="Copiar IMEI" />
            </span>
          ) : (
            <span className={styles.muted}>No registrado</span>
          )}
        </Def>
        <Def label="Servicio" className={styles.defServicio}>
          <span className={styles.serviceChip}>
            <Wrench aria-hidden />
            {client.servicio || '—'}
          </span>
        </Def>
        <Def label="Falla reportada" className={styles.defFalla}>
          {client.falla.trim() ? <p className={styles.prose}>{client.falla}</p> : <span className={styles.muted}>Sin descripción</span>}
        </Def>
      </dl>
    </Card>
  );
}

/* ------------------------------- Desbloqueo ------------------------------- */

const AUTO_HIDE_MS = 30_000;

export function UnlockCard({ client }: { client: Client }) {
  const [shown, setShown] = useState(false);
  const reduced = usePrefersReducedMotion();
  const tipo = client.desbloqueoTipo ?? 'ninguno';
  const hasValue = tipo === 'patron' ? client.desbloqueoPatron.length > 0 : !!client.desbloqueoCodigo;

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <Card
      as="section"
      className={styles.card}
      title="Desbloqueo"
      icon={<KeyRound />}
      actions={
        tipo !== 'ninguno' && hasValue ? (
          <Button size="sm" variant="ghost" iconLeft={shown ? <EyeOff /> : <Eye />} onClick={() => setShown((v) => !v)} aria-expanded={shown}>
            {shown ? 'Ocultar' : 'Mostrar'}
          </Button>
        ) : undefined
      }
    >
      {tipo === 'ninguno' ? (
        <p className={styles.muted}>El equipo no tiene bloqueo de pantalla.</p>
      ) : !hasValue ? (
        <p className={styles.muted}>{UNLOCK_TYPE_LABEL[tipo]} sin capturar.</p>
      ) : (
        <div className={styles.unlock}>
          <AnimatePresence mode="wait" initial={false}>
            {shown ? (
              <motion.div
                key="shown"
                className={styles.unlockShown}
                initial={reduced ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {tipo === 'patron' ? (
                  <div className={styles.patternWrap}>
                    <PatternLock value={client.desbloqueoPatron} readOnly animate size={176} />
                  </div>
                ) : (
                  <div className={styles.codeRow}>
                    <span className={styles.codeLabel}>{UNLOCK_TYPE_LABEL[tipo]}</span>
                    <code className={styles.code}>{client.desbloqueoCodigo}</code>
                    <CopyButton value={client.desbloqueoCodigo} label={`Copiar ${UNLOCK_TYPE_LABEL[tipo]}`} />
                  </div>
                )}
                <p className={styles.unlockHint}>Se oculta automáticamente en 30 s.</p>
              </motion.div>
            ) : (
              <motion.button
                key="hidden"
                type="button"
                className={styles.unlockHidden}
                onClick={() => setShown(true)}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <span className={styles.unlockDots} aria-hidden>
                  {tipo === 'patron' ? '• • •\n• • •\n• • •' : '• • • •'}
                </span>
                <span className={styles.unlockText}>
                  <strong>{UNLOCK_TYPE_LABEL[tipo]} guardado</strong>
                  <span>Oculto por privacidad. Toca para mostrar.</span>
                </span>
                <Eye aria-hidden className={styles.unlockEye} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ Rentabilidad ------------------------------ */

export function ProfitCard({ client }: { client: Client }) {
  const f = useClientFinancials(client.id);
  return (
    <Card as="section" className={styles.card} title="Rentabilidad del servicio" icon={<TrendingUp />}>
      {!f ? (
        <Skeleton lines={4} height={14} />
      ) : (
        <>
          <ul className={styles.ledger}>
            <li>
              <span>Cobrado</span>
              <MoneyText cents={f.pagadoCents} tone="income" />
            </li>
            <li>
              <span>Gastos vinculados</span>
              <MoneyText cents={-f.gastosCents} tone={f.gastosCents ? 'expense' : 'muted'} />
            </li>
            <li>
              <span>Piezas del inventario</span>
              <MoneyText cents={-f.piezasCents} tone={f.piezasCents ? 'expense' : 'muted'} />
            </li>
            <li className={styles.ledgerTotal}>
              <span>Ganancia</span>
              <MoneyText cents={f.gananciaCents} tone={f.gananciaCents < 0 ? 'expense' : 'profit'} size="lg" weight="semibold" />
            </li>
          </ul>
          <p className={styles.ledgerNote}>
            {f.pagadoCents > 0
              ? `Margen ${formatPercent(f.gananciaCents / f.pagadoCents)} sobre lo cobrado.`
              : 'Aún no hay cobros: la ganancia se calcula sobre lo efectivamente cobrado.'}
            {f.saldoCents > 0 && <span className={styles.ledgerNoteDue}>Faltan {formatMoney(f.saldoCents)} por cobrar.</span>}
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------------------------- Repuestos usados ---------------------------- */

export function PartsCard({ client }: { client: Client }) {
  const movements = useMovements({ clienteId: client.id });
  const items = useInventory({ includeDeleted: true });
  const names = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const uses = (movements ?? []).filter((m) => m.type === 'uso');
  const go = () => navigate(`#/inventario?usar=1&cliente=${client.id}`);
  return (
    <Card
      as="section"
      className={styles.card}
      title="Repuestos usados"
      icon={<Package />}
      description={uses.length ? `${plural(uses.length, 'movimiento', 'movimientos')} del inventario` : undefined}
      actions={
        uses.length > 0 && (
          <Button size="sm" iconLeft={<Plus />} onClick={go}>
            Usar repuesto
          </Button>
        )
      }
    >
      {!movements || !items ? (
        <Skeleton lines={3} height={14} />
      ) : uses.length === 0 ? (
        <InlineEmpty
          icon={<Package />}
          text="No se han usado piezas del inventario en este servicio."
          action={
            <Button size="sm" iconLeft={<Plus />} onClick={go}>
              Usar repuesto del inventario
            </Button>
          }
        />
      ) : (
        <ul className={styles.list}>
          {uses.map((m) => {
            const it = names.get(m.itemId);
            const qty = Math.abs(m.cantidad);
            return (
              <li key={m.id}>
                <a className={styles.listRow} href={`#/inventario/${m.itemId}`}>
                  <span className={styles.listIcon} data-tone="expense">
                    <Package aria-hidden />
                  </span>
                  <span className={styles.listMain}>
                    <span className={styles.listTitle}>{it?.nombre ?? 'Repuesto eliminado'}</span>
                    <span className={styles.listSub}>
                      {qty} × {formatMoney(m.costoUnitarioCents)} · <DateTimeText value={m.ts} />
                    </span>
                  </span>
                  <MoneyText cents={-(qty * m.costoUnitarioCents)} tone="expense" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------------------- Gastos vinculados --------------------------- */

export function ExpensesCard({ client }: { client: Client }) {
  const expenses = useExpenses({ clienteId: client.id });
  const go = () => navigate(`#/gastos?nuevo=1&cliente=${client.id}`);
  const total = (expenses ?? []).reduce((a, e) => a + e.totalCents, 0);
  return (
    <Card
      as="section"
      className={styles.card}
      title="Gastos vinculados"
      icon={<Receipt />}
      description={expenses?.length ? `${plural(expenses.length, 'gasto', 'gastos')} · ${formatMoney(total)}` : undefined}
      actions={
        !!expenses?.length && (
          <Button size="sm" iconLeft={<Plus />} onClick={go}>
            Registrar gasto
          </Button>
        )
      }
    >
      {!expenses ? (
        <Skeleton lines={3} height={14} />
      ) : expenses.length === 0 ? (
        <InlineEmpty
          icon={<Receipt />}
          text="Sin gastos ligados a este servicio (compras de repuestos, envíos…)."
          action={
            <Button size="sm" iconLeft={<Plus />} onClick={go}>
              Registrar gasto
            </Button>
          }
        />
      ) : (
        <ul className={styles.list}>
          {expenses.map((e) => (
            <li key={e.id}>
              <a className={styles.listRow} href={`#/gastos/${e.id}`}>
                <span className={styles.listIcon} data-tone="expense">
                  <Receipt aria-hidden />
                </span>
                <span className={styles.listMain}>
                  <span className={styles.listTitle}>{e.concepto}</span>
                  <span className={styles.listSub}>
                    {EXPENSE_CATEGORY_LABEL[e.categoria]}
                    {e.cantidad > 1 ? ` · ${e.cantidad} u.` : ''} · <DateTimeText value={e.fecha} />
                  </span>
                </span>
                <MoneyText cents={-e.totalCents} tone="expense" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InlineEmpty({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className={styles.inlineEmpty}>
      <span className={styles.inlineEmptyIcon} aria-hidden>
        {icon}
      </span>
      <p>{text}</p>
      {action}
    </div>
  );
}

/* -------------------------------- Garantía -------------------------------- */

export function WarrantyCard({ client }: { client: Client }) {
  const exp = warrantyExpiresAt(client);
  let body: ReactNode;
  if (!client.garantiaDias) {
    body = <p className={styles.muted}>Este servicio no incluye garantía.</p>;
  } else if (!exp) {
    body = (
      <p className={styles.warrantyLine}>
        <strong>{plural(client.garantiaDias, 'día', 'días')}</strong> a partir de la entrega. Empieza a contar al marcar el equipo como entregado.
      </p>
    );
  } else {
    const left = calendarDayDiff(exp, Date.now());
    const active = left >= 0;
    body = (
      <>
        <div className={styles.warrantyHead}>
          <span>
            Vence el <strong>{<DateTimeText value={exp} variant="date" />}</strong>
          </span>
          <Badge size="sm" tone={!active ? 'danger' : left <= 7 ? 'warning' : 'success'} dot>
            {!active ? `Venció hace ${plural(-left, 'día', 'días')}` : left === 0 ? 'Vence hoy' : `${plural(left, 'día', 'días')} restantes`}
          </Badge>
        </div>
        <ProgressBar
          value={active ? left : 0}
          max={client.garantiaDias}
          tone={!active ? 'danger' : left <= 7 ? 'warning' : 'income'}
          size="xs"
          aria-label="Garantía restante"
        />
        <p className={styles.ledgerNote}>
          {plural(client.garantiaDias, 'día', 'días')} desde la entrega · <DateTimeText value={client.fechaEntrega!} />
        </p>
      </>
    );
  }
  return (
    <Card as="section" className={styles.card} title="Garantía" icon={<ShieldCheck />}>
      {body}
    </Card>
  );
}

/* ---------------------------------- Notas --------------------------------- */

export function NotesCard({ client }: { client: Client }) {
  return (
    <Card
      as="section"
      className={styles.card}
      title="Notas"
      icon={<NotebookPen />}
      actions={<IconButton size="sm" icon={<Pencil />} label="Editar notas" onClick={() => navigate(`#/clientes/${client.id}?editar=1`)} />}
    >
      {client.notas.trim() ? <p className={styles.prose}>{client.notas}</p> : <p className={styles.muted}>Sin notas internas.</p>}
    </Card>
  );
}

/* -------------------------------- Historial ------------------------------- */

const ACTION_TONE: Record<string, string> = {
  crear: 'income',
  editar: 'brand',
  eliminar: 'expense',
  restaurar: 'info',
  purgar: 'expense',
};

export function HistoryCard({ client, audit }: { client: Client; audit: AuditEntry[] | undefined }) {
  const [all, setAll] = useState(false);
  const LIMIT = 6;
  const list = audit ?? [];
  const visible = all ? list : list.slice(0, LIMIT);
  return (
    <Card
      as="section"
      className={styles.card}
      title="Historial del registro"
      icon={<History />}
      description={audit ? `${plural(list.length, 'evento', 'eventos')} · Cada cambio con fecha y hora exactas` : undefined}
      actions={
        <Button size="sm" variant="ghost" iconRight={<ArrowRight />} onClick={() => navigate(`#/actividad?entidad=cliente&id=${client.id}`)}>
          Ver en Actividad
        </Button>
      }
    >
      {!audit ? (
        <Skeleton lines={4} height={14} />
      ) : list.length === 0 ? (
        <p className={styles.muted}>Sin eventos registrados.</p>
      ) : (
        <>
          <ol className={styles.timeline}>
            {visible.map((e) => (
              <li key={e.id} className={styles.event} data-tone={ACTION_TONE[e.action] ?? 'neutral'}>
                <span className={styles.eventDot} aria-hidden />
                <div className={styles.eventBody}>
                  <div className={styles.eventHead}>
                    <span className={styles.eventTitle}>{e.summary || AUDIT_ACTION_LABEL[e.action]}</span>
                    <DateTimeText value={e.ts} variant="relative-datetime" muted className={styles.eventTime} />
                  </div>
                  {e.changes.length > 0 && (
                    <ul className={styles.diffs}>
                      {e.changes.map((c, i) => (
                        <li key={c.field + i}>
                          <span className={styles.diffLabel}>{c.label}</span>
                          <span className={styles.diffVals}>
                            <span className={styles.diffFrom}>{c.fromText || '—'}</span>
                            <ArrowRight aria-label="cambió a" className={styles.diffArrow} />
                            <span className={styles.diffTo}>{c.toText || '—'}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {list.length > LIMIT && (
            <Button size="sm" variant="ghost" fullWidth onClick={() => setAll((v) => !v)} className={styles.moreBtn}>
              {all ? 'Mostrar menos' : `Mostrar ${list.length - LIMIT} eventos más`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
