/* Piezas visuales compartidas: miniatura, número de stock animado, medidor y estado. */
import { useEffect, useRef, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Truck } from 'lucide-react';
import { Badge, cx, usePrefersReducedMotion } from '@/ui';
import { PartThumb } from '@/three';
import { STOCK_STATUS_LABEL, stockStatus, type ExpenseCategory, type InventoryItem } from '@/data';
import { CATEGORY_COLOR, STATUS_TONE, meterScale } from './lib';
import styles from './parts.module.css';

/* -------------------------------- Miniatura ------------------------------- */

export interface ItemThumbProps {
  categoria: ExpenseCategory;
  /** Lado en px. */
  size?: number;
  className?: string;
}

/** Miniatura 3D del repuesto (PartThumb de '@/three') sobre una baldosa tintada por categoría. */
export function ItemThumb({ categoria, size = 40, className }: ItemThumbProps) {
  // Pocos tamaños de render (caché del renderizador 3D); se escala por CSS.
  const bucket = size <= 48 ? 48 : size <= 96 ? 96 : 160;
  return (
    <span
      className={cx(styles.thumb, size >= 96 && styles.thumbLg, className)}
      style={{ width: size, height: size, '--thumb-color': CATEGORY_COLOR[categoria] } as CSSProperties}
      aria-hidden
    >
      <span className={styles.thumbGlow} />
      <span className={styles.thumbArt} style={{ transform: `scale(${(size * 0.94) / bucket})` }}>
        <PartThumb kind={categoria} size={bucket} label="" />
      </span>
    </span>
  );
}

/* --------------------------- Número de stock ------------------------------ */

/** Número que se desliza (arriba al bajar, abajo al subir) y destella al cambiar. */
export function StockNumber({ value, className }: { value: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const prev = useRef(value);
  const dir = value < prev.current ? -1 : value > prev.current ? 1 : 0;
  useEffect(() => {
    prev.current = value;
  }, [value]);
  const offset = reduced ? 0 : 0.6;
  return (
    <span className={cx(styles.stockNum, className)} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className={cx(styles.stockDigit, dir < 0 && styles.flashDown, dir > 0 && styles.flashUp)}
          initial={{ y: `${dir > 0 ? offset * 100 : -offset * 100}%`, opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: `${dir > 0 ? -offset * 100 : offset * 100}%`, opacity: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* --------------------------------- Medidor -------------------------------- */

export interface StockMeterProps {
  item: InventoryItem;
  size?: 'sm' | 'md' | 'lg';
  /** Oculta el número (sólo barra). */
  barOnly?: boolean;
  className?: string;
}

/** Stock vs. mínimo: número animado + barra con la zona de alerta sombreada y marca del mínimo. */
export function StockMeter({ item, size = 'md', barOnly, className }: StockMeterProps) {
  const reduced = usePrefersReducedMotion();
  const status = stockStatus(item);
  const scale = meterScale(item);
  const pct = Math.max(0, Math.min(1, item.stock / scale));
  const minPct = Math.max(0, Math.min(1, item.stockMinimo / scale)) * 100;
  const label = `${item.stock} en stock, mínimo ${item.stockMinimo}`;
  return (
    <div className={cx(styles.meter, styles[`m-${size}`], className)} data-status={status} title={label}>
      {!barOnly && (
        <div className={styles.meterHead}>
          <StockNumber value={item.stock} className={styles.meterValue} />
          <span className={styles.meterMin}>/ mín {item.stockMinimo}</span>
        </div>
      )}
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={item.stock}
        style={{ '--min-pct': `${minPct}%` } as CSSProperties}
      >
        {item.stockMinimo > 0 && <span className={styles.zone} />}
        <motion.span
          className={styles.fill}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: pct }}
          transition={{ duration: reduced ? 0 : 0.55, ease: [0.16, 1, 0.3, 1] }}
        />
        {item.stockMinimo > 0 && <span className={styles.tick} />}
      </div>
    </div>
  );
}

/* --------------------------------- Estado -------------------------------- */

export function StockBadge({ item, size = 'sm', showFlag = true }: { item: InventoryItem; size?: 'sm' | 'md'; showFlag?: boolean }) {
  const status = stockStatus(item);
  return (
    <span className={styles.badges}>
      <Badge tone={STATUS_TONE[status]} dot={status !== 'pedido'} pulse={status === 'agotado'} icon={status === 'pedido' ? <Truck /> : undefined} size={size}>
        {STOCK_STATUS_LABEL[status]}
      </Badge>
      {showFlag && item.marcadoReorden && status === 'ok' && (
        <Badge tone="pending" size={size} icon={<Bell />} title="Marcado para volver a pedir">
          Por pedir
        </Badge>
      )}
    </span>
  );
}
