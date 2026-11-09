import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, CircleCheck, Database, HardDrive, RefreshCw, Share, ShieldCheck, Smartphone, SquarePlus, Wifi, WifiOff } from 'lucide-react';
import { getStorageEstimate, requestPersistentStorage } from '@/data';
import { checkForUpdates, IOS_INSTALL_HINT, useInstallPrompt, useOnlineStatus, usePwaStatus, useSwUpdate } from '@/pwa';
import { Badge, Button, ProgressBar, Skeleton, toast } from '@/ui';
import { Group, Row, formatBytes } from '../shared';
import styles from '../Ajustes.module.css';

export function AplicacionSection() {
  const install = useInstallPrompt();
  const { updateReady, applyUpdate } = useSwUpdate();
  const pwa = usePwaStatus();
  const online = useOnlineStatus();
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  const loadStorage = useCallback(() => {
    void getStorageEstimate().then(setStorage);
  }, []);
  useEffect(loadStorage, [loadStorage]);

  return (
    <div className={styles.stack}>
      <Group title="Instalar como app" description="Reparo se abre desde tu pantalla de inicio, a pantalla completa y sin internet.">
        {install.installed ? (
          <Row title={<span className={styles.inlineTitle}>Reparo está instalado <Badge tone="success" size="sm" icon={<CircleCheck />}>Instalada</Badge></span>} description="Ábrela desde el ícono en tu pantalla de inicio o escritorio." />
        ) : install.canInstall ? (
          <Row title="Instalar Reparo" description="Agrega un acceso directo con su propio ícono y ventana.">
            <Button
              variant="primary"
              iconLeft={<ArrowDownToLine />}
              onClick={async () => {
                if (await install.install()) toast({ title: '¡Reparo instalado!', tone: 'success' });
              }}
            >
              Instalar app
            </Button>
          </Row>
        ) : install.isIOS ? (
          <div className={styles.iosSteps}>
            <p className={styles.rowDesc}>{IOS_INSTALL_HINT}</p>
            <ol className={styles.steps}>
              <li>
                <span className={styles.stepNum}>1</span>
                <div>
                  Toca <Share className={styles.inlineIcon} aria-label="Compartir" /> <strong>Compartir</strong> en Safari.
                </div>
              </li>
              <li>
                <span className={styles.stepNum}>2</span>
                <div>
                  Elige <SquarePlus className={styles.inlineIcon} aria-hidden /> <strong>Agregar a inicio</strong>.
                </div>
              </li>
              <li>
                <span className={styles.stepNum}>3</span>
                <div>Abre Reparo desde el nuevo ícono.</div>
              </li>
            </ol>
          </div>
        ) : (
          <Row
            title="Instalar desde el navegador"
            description="Usa el menú del navegador → «Instalar app» o «Agregar a pantalla de inicio». En iPhone: Compartir → «Agregar a inicio»."
          >
            <Smartphone className={styles.rowGlyph} aria-hidden />
          </Row>
        )}
      </Group>

      <Group title="Versión y actualizaciones">
        <Row
          title={updateReady ? <span className={styles.inlineTitle}>Hay una versión nueva <Badge tone="brand" size="sm" dot pulse>Lista</Badge></span> : 'Estás al día'}
          description={updateReady ? 'Se aplica en segundos; tus datos no se tocan.' : pwa.version ? `Versión instalada: ${pwa.version}` : 'Las actualizaciones se descargan solas cuando hay internet.'}
        >
          {updateReady ? (
            <Button variant="primary" iconLeft={<RefreshCw />} onClick={applyUpdate}>
              Actualizar ahora
            </Button>
          ) : (
            <Button
              iconLeft={<RefreshCw />}
              loading={checking}
              disabled={!online || pwa.swStatus !== 'ready'}
              onClick={async () => {
                setChecking(true);
                await checkForUpdates(true);
                setChecking(false);
              }}
            >
              Buscar actualizaciones
            </Button>
          )}
        </Row>
      </Group>

      <Group title="Modo sin conexión">
        <div className={styles.offlineCard}>
          <span className={styles.howIcon} data-tone={online ? 'success' : 'warning'}>
            {online ? <Wifi /> : <WifiOff />}
          </span>
          <div>
            <div className={styles.inlineTitle}>
              {online ? 'Conectado a internet' : 'Sin conexión'}
              {pwa.offlineCapable ? (
                <Badge tone="success" size="sm" icon={<ShieldCheck />}>
                  Lista para usarse sin internet
                </Badge>
              ) : (
                <Badge size="sm">{pwa.swStatus === 'registering' ? 'Preparando…' : 'Modo navegador'}</Badge>
              )}
            </div>
            <p className={styles.rowDesc}>
              Todo lo que registras se guarda primero en este dispositivo, así que puedes trabajar sin internet todo el día. Si usas sincronización, los cambios se envían solos cuando vuelve la
              conexión.
            </p>
          </div>
        </div>
      </Group>

      <Group title="Almacenamiento" description="Espacio que ocupan tus datos y fotos en este navegador.">
        {storage ? (
          <>
            <div className={styles.storage}>
              <HardDrive aria-hidden />
              <ProgressBar
                className={styles.storageBar}
                value={storage.usage}
                max={storage.quota || 1}
                tone={storage.quota && storage.usage / storage.quota > 0.8 ? 'warning' : 'brand'}
                label={`${formatBytes(storage.usage)} usados`}
                valueLabel={storage.quota ? `de ${formatBytes(storage.quota)} disponibles` : 'Sin dato del navegador'}
              />
            </div>
            <Row
              title={
                <span className={styles.inlineTitle}>
                  Almacenamiento persistente
                  {storage.persisted ? (
                    <Badge tone="success" size="sm" icon={<CircleCheck />}>
                      Persistente ✓
                    </Badge>
                  ) : (
                    <Badge tone="warning" size="sm">
                      No garantizado
                    </Badge>
                  )}
                </span>
              }
              description={
                storage.persisted ? 'El navegador no borrará tus datos aunque falte espacio.' : 'Pide al navegador que nunca borre tus datos para liberar espacio. Igual descarga respaldos con frecuencia.'
              }
            >
              {!storage.persisted && (
                <Button
                  iconLeft={<Database />}
                  onClick={async () => {
                    const ok = await requestPersistentStorage();
                    loadStorage();
                    toast(ok ? { title: 'Almacenamiento persistente activado', tone: 'success' } : { title: 'El navegador no lo permitió', description: 'Instalar Reparo como app suele habilitarlo.', tone: 'warning' });
                  }}
                >
                  Hacer persistente
                </Button>
              )}
            </Row>
          </>
        ) : (
          <div className={styles.storage}>
            <Skeleton width={18} height={18} radius={4} />
            <div style={{ flex: 1, display: 'grid', gap: 8 }}>
              <Skeleton width="40%" />
              <Skeleton height={6} />
            </div>
          </div>
        )}
      </Group>
    </div>
  );
}
