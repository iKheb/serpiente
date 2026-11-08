import type { ReactNode } from 'react';
import { cx } from './utils';
import styles from './Kbd.module.css';

export interface KbdProps {
  children: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/** Tecla de atajo: <Kbd>⌘</Kbd><Kbd>K</Kbd> o <Kbd keys={['⌘','K']} />. */
export function Kbd({ children, size = 'md', className }: KbdProps) {
  return <kbd className={cx(styles.kbd, size === 'sm' && styles.sm, className)}>{children}</kbd>;
}

/** Combinación de teclas. */
export function KbdGroup({ keys, size = 'md', className }: { keys: string[]; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={cx(styles.group, className)}>
      {keys.map((k, i) => (
        <Kbd key={i} size={size}>
          {k}
        </Kbd>
      ))}
    </span>
  );
}
