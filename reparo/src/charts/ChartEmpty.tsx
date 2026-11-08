import type { ReactNode } from 'react';
import { ChartNoAxesColumn } from 'lucide-react';
import s from './Chart.module.css';

/** Mensaje del estado vacío, centrado sobre una cuadrícula tenue. */
export function ChartEmpty({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className={s.empty}>
      <div className={s.emptyCard} role="status">
        <span className={s.emptyIcon} aria-hidden>
          {icon ?? <ChartNoAxesColumn size={15} strokeWidth={2} />}
        </span>
        <span>{message}</span>
      </div>
    </div>
  );
}
