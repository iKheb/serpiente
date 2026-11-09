import { useSyncExternalStore } from 'react';

/** Estado global de la paleta de comandos (para abrirla desde cualquier página). */
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openCommandPalette() {
  open = true;
  emit();
}

export function closeCommandPalette() {
  open = false;
  emit();
}

export function toggleCommandPalette() {
  open = !open;
  emit();
}

export function useCommandPaletteOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );
}
