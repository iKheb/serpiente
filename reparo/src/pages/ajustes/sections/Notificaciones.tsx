import { useState } from 'react';
import { BellOff, BellRing, CircleCheck, CloudOff, Radio, Send, ShieldAlert, Wifi } from 'lucide-react';
import type { Settings } from '@/data';
import { pushUnavailableReason, sendTestNotification, useNotificationPermission, usePushSubscription } from '@/pwa';
import { Badge, Button, NumberStepper, Select, Switch, toast, type BadgeTone } from '@/ui';
import { Callout, Group, Row, saveSettings } from '../shared';
import styles from '../Ajustes.module.css';

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));

const PERMISSION: Record<string, { label: string; tone: BadgeTone }> = {
  granted: { label: 'Permitidas', tone: 'success' },
  denied: { label: 'Bloqueadas', tone: 'danger' },
  default: { label: 'Sin activar', tone: 'warning' },
  unsupported: { label: 'No compatibles', tone: 'neutral' },
};

export function NotificacionesSection({ settings }: { settings: Settings }) {
  const { permission, request } = useNotificationPermission();
  const push = usePushSubscription();
  const [testing, setTesting] = useState(false);
  const [asking, setAsking] = useState(false);
  const on = settings.notificationsEnabled;
  const p = PERMISSION[permission] ?? PERMISSION.default;

  const activate = async () => {
    setAsking(true);
    const r = await request();
    setAsking(false);
    if (r === 'granted') {
      if (!on) void saveSettings({ notificationsEnabled: true });
      toast({ title: 'Notificaciones activadas', tone: 'success' });
    } else if (r === 'denied') toast({ title: 'El navegador bloqueó las notificaciones', description: 'Puedes permitirlas desde el ícono del candado junto a la dirección.', tone: 'warning' });
  };

  const test = async () => {
    setTesting(true);
    const ok = await sendTestNotification();
    setTesting(false);
    if (ok) toast({ title: 'Notificación enviada', description: 'Si no la ves, revisa el modo “No molestar”.', tone: 'success' });
    else toast({ title: 'No se pudo mostrar la notificación', description: permission === 'denied' ? 'Están bloqueadas en el navegador.' : 'Activa el permiso primero.', tone: 'warning' });
  };

  const pushReason = pushUnavailableReason();

  return (
    <div className={styles.stack}>
      <Group>
        <div className={styles.permCard}>
          <span className={styles.permIcon} data-tone={p.tone}>
            {permission === 'granted' ? <BellRing /> : permission === 'denied' ? <BellOff /> : <ShieldAlert />}
          </span>
          <div className={styles.permText}>
            <div className={styles.permTitle}>
              Permiso del sistema <Badge tone={p.tone} dot size="sm">{p.label}</Badge>
            </div>
            <p className={styles.rowDesc}>
              {permission === 'granted'
                ? 'Reparo puede avisarte aunque estés en otra pestaña o app.'
                : permission === 'denied'
                  ? 'Las bloqueaste en el navegador. Permítelas desde el candado junto a la dirección → Notificaciones → Permitir.'
                  : permission === 'unsupported'
                    ? 'Este navegador no muestra notificaciones del sistema. Seguirás viendo los avisos dentro de Reparo.'
                    : 'Activa el permiso para recibir avisos del sistema, no sólo dentro de la app.'}
            </p>
          </div>
          <div className={styles.permActions}>
            {permission === 'default' && (
              <Button variant="primary" iconLeft={<BellRing />} loading={asking} onClick={activate}>
                Activar notificaciones
              </Button>
            )}
            {permission !== 'unsupported' && permission !== 'default' && (
              <Button iconLeft={<Send />} loading={testing} onClick={test} disabled={permission === 'denied'}>
                Probar notificación
              </Button>
            )}
          </div>
        </div>
      </Group>

      <Group title="Qué te avisamos" description="Reparo revisa estas reglas cada cierto tiempo mientras la app está abierta.">
        <Switch
          className={styles.switchRow}
          checked={on}
          onChange={(v) => void saveSettings({ notificationsEnabled: v })}
          label="Notificaciones"
          description="Interruptor general para todos los avisos."
        />
        <div className={styles.subRows} data-disabled={!on || undefined}>
          <Switch className={styles.switchRow} disabled={!on} checked={settings.notifyLowStock} onChange={(v) => void saveSettings({ notifyLowStock: v })} label="Stock bajo" description="Cuando un repuesto llega a su mínimo o se agota." />
          <div className={styles.switchGroup}>
            <Switch
              className={styles.switchRow}
              disabled={!on}
              checked={settings.notifyReadyPickup}
              onChange={(v) => void saveSettings({ notifyReadyPickup: v })}
              label="Equipos listos sin entregar"
              description="Recuerda llamar al cliente si su equipo sigue en el taller."
            />
            {settings.notifyReadyPickup && on && (
              <div className={styles.inlineSetting}>
                <span>Avisar después de</span>
                <NumberStepper value={settings.readyPickupDays} min={1} max={60} unit={settings.readyPickupDays === 1 ? 'día' : 'días'} size="sm" onChange={(v) => void saveSettings({ readyPickupDays: v })} />
              </div>
            )}
          </div>
          <Switch className={styles.switchRow} disabled={!on} checked={settings.notifyPendingPayment} onChange={(v) => void saveSettings({ notifyPendingPayment: v })} label="Pagos pendientes" description="Equipos entregados que todavía tienen saldo por cobrar." />
          <div className={styles.switchGroup}>
            <Switch className={styles.switchRow} disabled={!on} checked={settings.notifyDailySummary} onChange={(v) => void saveSettings({ notifyDailySummary: v })} label="Resumen diario" description="Cobrado, gastado y ganancia del día." />
            {settings.notifyDailySummary && on && (
              <div className={styles.inlineSetting}>
                <span>Enviar a las</span>
                <Select aria-label="Hora del resumen diario" size="sm" width={120} value={String(settings.dailySummaryHour)} options={HOURS} onChange={(v) => void saveSettings({ dailySummaryHour: Number(v) })} />
              </div>
            )}
          </div>
          <Switch className={styles.switchRow} disabled={!on} checked={settings.notifyBackupReminder} onChange={(v) => void saveSettings({ notifyBackupReminder: v })} label="Recordatorio de respaldo" description="Si pasa una semana sin descargar una copia de seguridad." />
        </div>
      </Group>

      <Group title="Cómo llegan los avisos">
        <div className={styles.howGrid}>
          <div className={styles.howCard}>
            <span className={styles.howIcon} data-tone="success">
              <CloudOff />
            </span>
            <strong>Sin internet</strong>
            <p>Las notificaciones locales funcionan siempre, sin conexión, mientras Reparo esté abierto o en segundo plano.</p>
          </div>
          <div className={styles.howCard}>
            <span className={styles.howIcon} data-tone="brand">
              <Radio />
            </span>
            <strong>Con la app cerrada (push)</strong>
            <p>Requieren el servidor de Reparo (sección Sincronización) y abrir la app con HTTPS.</p>
          </div>
        </div>

        <Row
          title={
            <span className={styles.inlineTitle}>
              Notificaciones push en este dispositivo
              {push.subscribed ? (
                <Badge tone="success" size="sm" icon={<CircleCheck />}>
                  Activas
                </Badge>
              ) : (
                <Badge size="sm">Inactivas</Badge>
              )}
            </span>
          }
          description={
            push.supported
              ? settings.syncUrl
                ? `Se suscribe al servidor ${settings.syncUrl.replace(/\?.*$/, '')}.`
                : 'Primero configura la dirección del servidor en Sincronización.'
              : pushReason
          }
          stack
        >
          {push.supported && (
            <div className={styles.btnRow}>
              {push.subscribed ? (
                <>
                  <Button
                    iconLeft={<Send />}
                    loading={push.busy}
                    onClick={async () => {
                      if (await push.sendTest()) toast({ title: 'Push de prueba enviado', tone: 'success' });
                    }}
                  >
                    Enviar push de prueba
                  </Button>
                  <Button variant="ghost" disabled={push.busy} onClick={() => void push.unsubscribe()}>
                    Desactivar
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  iconLeft={<Wifi />}
                  loading={push.busy}
                  disabled={!settings.syncUrl}
                  onClick={async () => {
                    if (await push.subscribe(settings.syncUrl)) toast({ title: 'Notificaciones push activadas', tone: 'success' });
                  }}
                >
                  Activar push
                </Button>
              )}
            </div>
          )}
        </Row>
        {push.error && (
          <Callout tone="danger" icon={<ShieldAlert />}>
            {push.error}
          </Callout>
        )}
      </Group>
    </div>
  );
}
