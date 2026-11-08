import type { Ref, RefCallback } from 'react';

/** Une clases condicionalmente: cx('a', cond && 'b', undefined) → "a b". */
export function cx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Combina varias refs (objeto o callback) en una sola ref callback. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined | null)[]): RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(value);
      else (ref as { current: T | null }).current = value;
    }
  };
}

/** Minúsculas sin acentos ni diacríticos (búsquedas tolerantes). */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Divide `text` en fragmentos marcando las coincidencias de `query`
 * (sin distinguir acentos ni mayúsculas). Útil para resaltar resultados.
 */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const q = fold(query.trim());
  if (!q) return [{ text, match: false }];
  const terms = q.split(/\s+/).filter(Boolean);
  const folded = fold(text);
  // `fold` conserva la longitud para caracteres latinos precompuestos, así que
  // los índices coinciden con el texto original.
  if (folded.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const t of terms) {
    let from = 0;
    while (from <= folded.length) {
      const i = folded.indexOf(t, from);
      if (i === -1) break;
      for (let k = i; k < i + t.length; k++) marks[k] = true;
      from = i + t.length;
    }
  }
  const out: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else out.push({ text: text[i], match: marks[i] });
  }
  return out;
}

/** Hash entero estable de una cadena (FNV-1a de 32 bits). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Iniciales para avatares: "Ana María López" → "AL". */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => /[\p{L}\p{N}]/u.test(p));
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** true si el foco está en un campo editable (para no disparar atajos al escribir). */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'textbox';
}

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null,
  );
}

/** true en Mac/iOS (para mostrar ⌘ en lugar de Ctrl). */
export const isApple =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

export const MOD_KEY_LABEL = isApple ? '⌘' : 'Ctrl';
