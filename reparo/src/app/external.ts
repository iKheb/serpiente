/**
 * Abre un enlace externo (p. ej. https://wa.me/…) en una pestaña nueva.
 * Algunos entornos embebidos bloquean window.open (devuelve null); en ese caso
 * se usa un <a target="_blank"> real, que sí se permite.
 */
export function openExternal(url: string): void {
  let win: Window | null = null;
  try {
    win = window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    win = null;
  }
  if (win) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
