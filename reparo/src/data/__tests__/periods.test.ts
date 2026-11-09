import { describe, expect, it } from 'vitest';
import { buildBuckets, getPeriod, lastDaysRange, shiftPeriod } from '../periods';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m, day, h, min).getTime();

describe('getPeriod', () => {
  it('semana que empieza en lunes', () => {
    // Sábado 7 nov 2026 → semana lun 2 – dom 8
    const p = getPeriod('week', d(2026, 10, 7, 14, 32), 1);
    expect(p.start).toBe(d(2026, 10, 2));
    expect(p.end).toBe(d(2026, 10, 9));
    expect(p.label).toBe('Semana del 2 al 8 de nov 2026');
    expect(p.shortLabel).toBe('2–8 nov');
  });

  it('el domingo pertenece a la semana que empezó el lunes anterior', () => {
    const p = getPeriod('week', d(2026, 10, 8, 23, 59), 1);
    expect(p.start).toBe(d(2026, 10, 2));
    const lunes = getPeriod('week', d(2026, 10, 9, 0, 0), 1);
    expect(lunes.start).toBe(d(2026, 10, 9));
  });

  it('semana que empieza en domingo', () => {
    const p = getPeriod('week', d(2026, 10, 7), 0);
    expect(p.start).toBe(d(2026, 10, 1));
    expect(p.end).toBe(d(2026, 10, 8));
    expect(p.label).toBe('Semana del 1 al 7 de nov 2026');
    const dom = getPeriod('week', d(2026, 10, 8, 10), 0);
    expect(dom.start).toBe(d(2026, 10, 8));
  });

  it('semana que cruza meses y años', () => {
    const p = getPeriod('week', d(2026, 9, 30), 1);
    expect(p.label).toBe('Semana del 26 oct al 1 nov 2026');
    expect(p.shortLabel).toBe('26 oct – 1 nov');
    const y = getPeriod('week', d(2026, 11, 31), 1);
    expect(y.label).toBe('Semana del 28 dic 2026 al 3 ene 2027');
  });

  it('mes calendario', () => {
    const p = getPeriod('month', d(2026, 10, 7, 14), 1);
    expect(p.start).toBe(d(2026, 10, 1));
    expect(p.end).toBe(d(2026, 11, 1));
    expect(p.label).toBe('Noviembre 2026');
    expect(p.shortLabel).toBe('nov 2026');
  });

  it('shiftPeriod', () => {
    const p = getPeriod('month', d(2026, 0, 15), 1);
    expect(shiftPeriod(p, -1).label).toBe('Diciembre 2025');
    const w = getPeriod('week', d(2026, 10, 7), 1);
    expect(shiftPeriod(w, 1, 1).start).toBe(d(2026, 10, 9));
    expect(shiftPeriod(w, -1, 1).label).toBe('Semana del 26 oct al 1 nov 2026');
  });
});

describe('buildBuckets', () => {
  it('días de una semana con día de la semana', () => {
    const w = getPeriod('week', d(2026, 10, 7), 1);
    const b = buildBuckets(w, 'day', 1);
    expect(b).toHaveLength(7);
    expect(b[0].label).toBe('lun 2');
    expect(b[6].label).toBe('dom 8');
  });

  it('días de un mes con fecha corta', () => {
    const m = getPeriod('month', d(2026, 10, 7), 1);
    const b = buildBuckets(m, 'day', 1);
    expect(b).toHaveLength(30);
    expect(b[2].label).toBe('3 nov');
  });

  it('semanas recortadas al rango y meses', () => {
    const m = getPeriod('month', d(2026, 10, 7), 1);
    const weeks = buildBuckets(m, 'week', 1);
    expect(weeks[0].start).toBe(m.start);
    expect(weeks[0].label).toBe('26 oct');
    expect(weeks[weeks.length - 1].end).toBe(m.end);
    const months = buildBuckets({ start: d(2026, 5, 1), end: d(2026, 11, 1) }, 'month');
    expect(months.map((x) => x.label)).toEqual(['jun', 'jul', 'ago', 'sep', 'oct', 'nov']);
  });

  it('lastDaysRange incluye hoy', () => {
    const r = lastDaysRange(7, d(2026, 10, 7, 15));
    expect(r.start).toBe(d(2026, 10, 1));
    expect(r.end).toBe(d(2026, 10, 8));
  });
});
