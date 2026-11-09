import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Laptop, Link2, RefreshCw, Server, Sparkles, WifiOff } from 'lucide-react';
import type { Settings } from '@/data';
import { detectLocalServer, parseSyncUrl, syncNow, testSyncServer, useSyncStatus, type SyncState } from '@/data/sync';
import { Badge, Button, DateTimeText, Input, Switch, toast, type BadgeTone } from '@/ui';
import { Callout, Group, Row, saveSettings, useTextSetting } from '../shared';
import styles from '../Ajustes.module.css';

const STATE: Record<SyncState, { label: string; tone: BadgeTone }> = {
  disabled: { label: 'Desactivada', tone: 'neutral' },
  idle: { label: 'Al día', tone: 'success' },
  syncing: { label: 'Sincronizando…', tone: 'info' },
  error: { label: 'Con error', tone: 'danger' },
  offline: { label: 'Sin conexión', tone: 'warning' },
};

export function SincronizacionSection({ settings }: { settings: Settings }) {
  const url = useTextSetting(settings, 'syncUrl', 900);
  const status = useSyncStatus();
  const [suggested, setSuggested] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const valid = !!parseSyncUrl(url.value);
  const st = STATE[status.state];

  useEffect(() => {
    let alive = true;
    detectLocalServer().then((s) => alive && setSuggested(s));
    return () => {
      alive = false;
    };
  }, []);

  const test = async () => {
    setTesting(true);
    setResult(null);
    const r = await testSyncServer(url.value);
    setTesting(false);
    setResult(r);
  };

  const runNow = async () => {
    try {
      const r = await syncNow();
      toast({ title: 'Sincronización completa', description: `${r.pushed} enviados · ${r.pulled} recibidos`, tone: 'success' });
    } catch (e) {
      toast({ title: 'No se pudo sincronizar', description: (e as Error).message, tone: 'danger' });
    }
  };

  return (
    <div className={styles.stack}>
      <Callout tone="brand" icon={<Sparkles />} title="Opcional">
        Reparo funciona completo sin servidor. Sincroniza sólo si quieres usar varios dispositivos (mostrador y celular del técnico) con los mismos datos.
      </Callout>

      <Group title="Servidor" description="La dirección de la PC del taller o de tu servidor de Reparo.">
        <div className={styles.fields}>
          <Input
            label="Dirección del servidor"
            prefix={<Link2 />}
            value={url.value}
            onValueChange={(v) => {
              url.onChange(v);
              setResult(null);
            }}
            onBlur={url.onBlur}
            error={url.error ?? (url.value && !valid ? 'Escribe una dirección como http://192.168.1.10:8787' : undefined)}
            placeholder="http://192.168.1.10:8787"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            hint="Si el servidor usa token, agrégalo al final: …:8787/?token=TU_TOKEN"
          />
          {suggested && suggested !== parseSyncUrl(url.value)?.base && (
            <button type="button" className={styles.suggest} onClick={() => url.onChange(suggested)}>
              <Server aria-hidden />
              <span>
                Abriste Reparo desde un servidor: <strong>{suggested}</strong>
              </span>
              <span className={styles.suggestCta}>Usar esta dirección</span>
            </button>
          )}
          <div className={styles.btnRow}>
            <Button iconLeft={<CircleCheck />} loading={testing} disabled={!valid} onClick={test}>
              Probar conexión
            </Button>
          </div>
          {result && (
            <Callout tone={result.ok ? 'success' : 'danger'} icon={result.ok ? <CircleCheck /> : <CircleAlert />}>
              {result.message}
            </Callout>
          )}
        </div>
      </Group>

      <Group title="Estado">
        <Switch
          className={styles.switchRow}
          checked={settings.syncEnabled}
          disabled={!valid && !settings.syncEnabled}
          onChange={(v) => void saveSettings({ syncEnabled: v })}
          label="Sincronizar este dispositivo"
          description={valid ? 'Al iniciar, al volver la conexión, cada 2 minutos y unos segundos después de cada cambio.' : 'Escribe una dirección válida para activarla.'}
        />
        <Row
          title={
            <span className={styles.inlineTitle}>
              Última sincronización
              <Badge tone={st.tone} dot pulse={status.state === 'syncing'} size="sm">
                {st.label}
              </Badge>
            </span>
          }
          description={
            status.lastSyncAt ? (
              <>
                <DateTimeText value={status.lastSyncAt} variant="relative-datetime" />
                {status.lastResult && ` · ${status.lastResult.pushed} enviados, ${status.lastResult.pulled} recibidos`}
              </>
            ) : (
              'Nunca se ha sincronizado este dispositivo.'
            )
          }
        >
          <Button iconLeft={<RefreshCw className={status.state === 'syncing' ? styles.spin : undefined} />} disabled={!settings.syncEnabled || status.state === 'syncing'} onClick={runNow}>
            Sincronizar ahora
          </Button>
        </Row>
        {status.error && (
          <Callout tone="danger" icon={<CircleAlert />}>
            {status.error}
          </Callout>
        )}
        {status.state === 'offline' && (
          <Callout tone="warning" icon={<WifiOff />}>
            Sin conexión de red. Tus cambios quedan guardados aquí y se enviarán al volver la conexión.
          </Callout>
        )}
      </Group>

      <Group title="Usa la PC del taller como servidor" description="Sin internet: basta con que todos estén en la misma WiFi.">
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNum}>1</span>
            <div>
              En la PC del mostrador (con Node.js 22 o superior), dentro de la carpeta de Reparo, ejecuta <code className={styles.code}>npm run build</code> y luego{' '}
              <code className={styles.code}>npm run server</code>.
            </div>
          </li>
          <li>
            <span className={styles.stepNum}>2</span>
            <div>
              La consola muestra la dirección de <strong>Red local</strong>, por ejemplo <code className={styles.code}>http://192.168.1.23:8787</code>. Escríbela arriba en cada dispositivo y pulsa
              «Probar conexión».
            </div>
          </li>
          <li>
            <span className={styles.stepNum}>3</span>
            <div>
              Protege el acceso con un token (<code className={styles.code}>REPARO_TOKEN</code>): los registros incluyen los PIN y patrones de desbloqueo de los equipos.
            </div>
          </li>
        </ol>
        <p className={styles.footnote}>
          <Laptop aria-hidden /> Fotos, notificaciones y ajustes no se sincronizan: son de cada dispositivo.
        </p>
      </Group>
    </div>
  );
}
