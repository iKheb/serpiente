import type { CSSProperties } from 'react';
import { cx } from './utils';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  circle?: boolean;
  /** Varias líneas de texto (la última más corta). */
  lines?: number;
  className?: string;
  style?: CSSProperties;
}

/** Marcador de carga con brillo. */
export function Skeleton({ width = '100%', height = 12, radius = 6, circle, lines, className, style }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <span className={styles.lines} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={cx(styles.skeleton, className)} style={{ width: i === lines - 1 ? '62%' : '100%', height, borderRadius: radius }} />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cx(styles.skeleton, className)}
      style={{ width: circle ? height : width, height, borderRadius: circle ? '50%' : radius, ...style }}
    />
  );
}
