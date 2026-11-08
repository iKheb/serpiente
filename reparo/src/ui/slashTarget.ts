/**
 * Registro del buscador de página que responde al atajo "/".
 * Si una página monta un <SearchField shortcut>, "/" lo enfoca; si no,
 * el Shell abre la paleta de comandos.
 */
const targets: HTMLElement[] = [];

export function registerSlashTarget(el: HTMLElement): () => void {
  targets.push(el);
  return () => {
    const i = targets.lastIndexOf(el);
    if (i !== -1) targets.splice(i, 1);
  };
}

/** Enfoca el buscador de la página si existe y es visible. Devuelve true si lo hizo. */
export function focusSlashTarget(): boolean {
  for (let i = targets.length - 1; i >= 0; i--) {
    const el = targets[i];
    if (el.isConnected && el.offsetParent !== null) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
      return true;
    }
  }
  return false;
}
