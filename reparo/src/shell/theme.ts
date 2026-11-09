import { useEffect, useLayoutEffect } from 'react';
import { updateSettings } from '@/data';
import type { ThemePreference } from '@/data/types';
import { useMediaQuery, readLocal, writeLocal } from '@/ui';

export type ResolvedTheme = 'dark' | 'light';
const CACHE_KEY = 'reparo:theme';

/** Aplica el tema al <html> y actualiza <meta name="theme-color">. */
export function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', bg);
      m.removeAttribute('media');
    });
  }
}

// Al cargar el módulo aplica el último tema usado (evita un destello antes de leer los ajustes).
if (typeof document !== 'undefined') {
  const cached = readLocal<ResolvedTheme | null>(CACHE_KEY, null);
  if (cached === 'dark' || cached === 'light') document.documentElement.dataset.theme = cached;
}

export function resolveTheme(pref: ThemePreference | undefined, systemDark: boolean): ResolvedTheme {
  if (pref === 'dark' || pref === 'light') return pref;
  return systemDark ? 'dark' : 'light';
}

/** Sincroniza el tema con la preferencia de los ajustes ('system' sigue al sistema). */
export function useApplyTheme(pref: ThemePreference | undefined): ResolvedTheme {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const cached = readLocal<ResolvedTheme | null>(CACHE_KEY, null);
  const resolved = pref ? resolveTheme(pref, systemDark) : (cached ?? 'dark');
  useLayoutEffect(() => {
    applyTheme(resolved);
  }, [resolved]);
  useEffect(() => {
    if (pref) writeLocal(CACHE_KEY, resolved);
  }, [pref, resolved]);
  return resolved;
}

export const THEME_LABEL: Record<ThemePreference, string> = {
  dark: 'Oscuro',
  light: 'Claro',
  system: 'Sistema',
};

/** Alterna entre claro y oscuro según el tema visible ahora (guarda la preferencia). */
export function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  void updateSettings({ theme: current === 'light' ? 'dark' : 'light' });
}
