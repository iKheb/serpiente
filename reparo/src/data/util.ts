/** Copia de `o` sin las claves con valor `undefined` (para aplicar parches parciales). */
export function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Plural simple en español: plural(2, 'pieza', 'piezas') → "2 piezas". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
