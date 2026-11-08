import { cx, hashString, initials } from './utils';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Imagen opcional (object URL). */
  src?: string | null;
  className?: string;
  /** Anillo exterior (p. ej. en el pie del sidebar). */
  ring?: boolean;
}

// Parejas de colores de la paleta categórica (tokens, válidos en ambos temas).
const PAIRS: [string, string][] = [
  ['--chart-1', '--chart-2'],
  ['--chart-2', '--chart-3'],
  ['--chart-3', '--chart-7'],
  ['--chart-4', '--chart-5'],
  ['--chart-5', '--chart-6'],
  ['--chart-6', '--chart-1'],
  ['--chart-7', '--chart-1'],
  ['--chart-4', '--chart-3'],
];

/** Avatar con iniciales sobre un degradado determinista por nombre. */
export function Avatar({ name, size = 'md', src, className, ring }: AvatarProps) {
  const [a, b] = PAIRS[hashString(name.trim().toLowerCase()) % PAIRS.length];
  const angle = 120 + (hashString(name) % 90);
  return (
    <span
      className={cx(styles.avatar, styles[size], ring && styles.ring, className)}
      style={{ background: `linear-gradient(${angle}deg, var(${a}), var(${b}))` }}
      role="img"
      aria-label={name}
      title={name}
    >
      {src ? <img src={src} alt="" className={styles.img} /> : <span aria-hidden>{initials(name)}</span>}
    </span>
  );
}
