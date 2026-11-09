/* Reloj local del panel (estable: no re-suscribe en cada render). */
import { useEffect, useState } from 'react';

/** Hora actual que se actualiza cada `interval` ms, alineada al reloj. */
export function useClock(interval = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const t = Date.now();
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, interval - (t % interval) + 5);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [interval]);
  return now;
}
