import { CloudOff, Lock, Smartphone } from 'lucide-react';
import { BRAND_NAME, BRAND_TAGLINE } from '@/app/brand';
import { getDeviceId } from '@/data';
import { usePwaStatus } from '@/pwa';
import { BrandMark } from '@/shell/BrandMark';
import { Badge } from '@/ui';
import { APP_VERSION, Group } from '../shared';
import styles from '../Ajustes.module.css';

function deviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return '—';
  }
}

export function AcercaSection() {
  const pwa = usePwaStatus();
  return (
    <div className={styles.stack}>
      <div className={styles.about}>
        <div className={styles.aboutGlow} aria-hidden />
        <BrandMark size={72} title={BRAND_NAME} />
        <div className={styles.aboutName}>{BRAND_NAME}</div>
        <div className={styles.aboutTag}>{BRAND_TAGLINE}</div>
        <div className={styles.aboutBadges}>
          <Badge tone="brand">Versión {APP_VERSION}</Badge>
          {pwa.version && <Badge>Build {pwa.version}</Badge>}
        </div>
        <p className={styles.aboutLine}>Hecho para funcionar sin internet: tus datos viven en este dispositivo.</p>
      </div>

      <Group>
        <div className={styles.howGrid3}>
          <div className={styles.howCard}>
            <span className={styles.howIcon} data-tone="success">
              <CloudOff />
            </span>
            <strong>Sin internet</strong>
            <p>Todo funciona offline: registro, inventario, reportes y recibos.</p>
          </div>
          <div className={styles.howCard}>
            <span className={styles.howIcon} data-tone="brand">
              <Lock />
            </span>
            <strong>Tus datos son tuyos</strong>
            <p>Nada sale de este dispositivo salvo que actives la sincronización con tu propio servidor.</p>
          </div>
          <div className={styles.howCard}>
            <span className={styles.howIcon} data-tone="info">
              <Smartphone />
            </span>
            <strong>Este dispositivo</strong>
            <p className={styles.mono}>{deviceId()}</p>
          </div>
        </div>
      </Group>
    </div>
  );
}
