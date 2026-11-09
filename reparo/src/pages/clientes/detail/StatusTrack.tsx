import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, CircleSlash, RotateCcw } from 'lucide-react';
import { REPAIR_STATUS_LABEL, formatDateTime, updateClient, type AuditEntry, type Client, type RepairStatus } from '@/data';
import { Button, toast, usePrefersReducedMotion, cx } from '@/ui';
import styles from './ClientDetail.module.css';

export const FLOW: Exclude<RepairStatus, 'cancelado'>[] = ['recibido', 'diagnostico', 'reparando', 'listo', 'entregado'];
const STEP_LABEL: Record<RepairStatus, string> = {
  recibido: 'Recibido',
  diagnostico: 'Diagnóstico',
  reparando: 'Reparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Cambia el estado con "Deshacer". Al pasar a Entregado fija la fecha de entrega. */
export async function changeStatus(client: Client, estado: RepairStatus) {
  if (client.estado === estado) return;
  const prev = { estado: client.estado, fechaEntrega: client.fechaEntrega };
  const patch: Partial<Client> = { estado };
  if (estado === 'entregado') patch.fechaEntrega = Date.now();
  else if (client.fechaEntrega) patch.fechaEntrega = null;
  try {
    await updateClient(client.id, patch);
    toast({
      title: `Estado: ${REPAIR_STATUS_LABEL[estado]}`,
      description: estado === 'entregado' ? `Entregado el ${formatDateTime(patch.fechaEntrega as number)}` : undefined,
      tone: estado === 'cancelado' ? 'warning' : 'success',
      action: { label: 'Deshacer', onClick: () => void updateClient(client.id, prev) },
    });
  } catch {
    toast({ title: 'No se pudo cambiar el estado', tone: 'danger' });
  }
}

/** Línea de progreso del servicio: un toque cambia el estado. */
export function StatusTrack({ client, audit }: { client: Client; audit: AuditEntry[] | undefined }) {
  const reduced = usePrefersReducedMotion();
  const [busy, setBusy] = useState<RepairStatus | null>(null);
  const cancelled = client.estado === 'cancelado';
  const current = cancelled ? -1 : FLOW.indexOf(client.estado as (typeof FLOW)[number]);

  // Fecha y hora en que se llegó a cada estado (según el registro de actividad).
  const reachedAt = useMemo(() => {
    const map: Partial<Record<RepairStatus, number>> = { recibido: client.fecha };
    const asc = [...(audit ?? [])].sort((a, b) => a.ts - b.ts);
    for (const e of asc) {
      for (const ch of e.changes) if (ch.field === 'estado' && typeof ch.to === 'string') map[ch.to as RepairStatus] = e.ts;
      if (e.action === 'crear') {
        const snap = e.snapshot as Partial<Client> | null;
        if (snap?.estado && snap.estado !== 'recibido') map[snap.estado] = e.ts;
      }
    }
    if (client.fechaEntrega) map.entregado = client.fechaEntrega;
    return map;
  }, [audit, client.fecha, client.fechaEntrega]);

  const pick = async (s: RepairStatus) => {
    setBusy(s);
    await changeStatus(client, s);
    setBusy(null);
  };

  const pct = current <= 0 ? 0 : current / (FLOW.length - 1);

  return (
    <section className={cx(styles.track, cancelled && styles.trackCancelled)} aria-label="Progreso del servicio">
      {cancelled && (
        <div className={styles.cancelBanner}>
          <CircleSlash aria-hidden />
          <span>
            <strong>Servicio cancelado.</strong> No cuenta en cobrado ni en reportes.
          </span>
          <Button size="sm" variant="secondary" iconLeft={<RotateCcw />} onClick={() => pick('recibido')} loading={busy === 'recibido'}>
            Reactivar
          </Button>
        </div>
      )}
      <ol className={styles.steps}>
        <span className={styles.rail} aria-hidden>
          <motion.span
            className={styles.railFill}
            initial={false}
            animate={{ scaleX: pct }}
            transition={{ duration: reduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
          />
        </span>
        {FLOW.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const at = (done || active) && reachedAt[s];
          return (
            <li key={s} className={styles.stepItem}>
              <button
                type="button"
                className={cx(styles.step, done && styles.stepDone, active && styles.stepActive)}
                data-status={s}
                aria-current={active ? 'step' : undefined}
                aria-label={`${REPAIR_STATUS_LABEL[s]}${active ? ' (estado actual)' : ''}`}
                title={active ? 'Estado actual' : `Cambiar a ${REPAIR_STATUS_LABEL[s]}`}
                disabled={busy !== null || active}
                onClick={() => pick(s)}
              >
                <span className={styles.stepDot}>
                  {done ? <Check aria-hidden /> : <span className={styles.stepNum}>{i + 1}</span>}
                  {active && !reduced && <span className={styles.stepPulse} aria-hidden />}
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepLabel}>{STEP_LABEL[s]}</span>
                  <span className={styles.stepTime}>{at ? formatDateTime(at) : active ? 'Ahora' : ' '}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
