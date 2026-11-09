import { BrandMark } from './BrandMark';
import styles from './Splash.module.css';

/** Pantalla de carga mientras se leen los ajustes (aparece tras 150 ms para no parpadear). */
export function Splash() {
  return (
    <div className={styles.splash} role="status" aria-label="Cargando Reparo">
      <div className={styles.inner}>
        <div className={styles.markWrap}>
          <span className={styles.halo} aria-hidden />
          <BrandMark size={64} animated />
        </div>
        <span className={styles.word}>Reparo</span>
      </div>
    </div>
  );
}
