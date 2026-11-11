// STUB — interfaz principal (subagente UI). Contrato:
//   mountShell(ctx) monta barra superior (escritorio/tablet), riel lateral (TV) y barra inferior (móvil)
//   en #shell-top / #shell-nav. Escucha bus 'route' para marcar la sección activa y ocultarse
//   cuando html.no-shell o hay reproductor abierto. Expone shell.setSolid(bool) para el scroll.
import { icon } from './icons.js';
export const SECTIONS = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'envivo', label: 'En vivo', icon: 'live' },
  { id: 'peliculas', label: 'Películas', icon: 'film' },
  { id: 'series', label: 'Series', icon: 'series' },
  { id: 'deportes', label: 'Deportes', icon: 'sport' },
  { id: 'infantil', label: 'Infantil', icon: 'kids' },
  { id: 'milista', label: 'Mi lista', icon: 'list' },
  { id: 'guia', label: 'Guía TV', icon: 'guide' },
  { id: 'buscar', label: 'Buscar', icon: 'search' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
];
export const shell = { setSolid() {} };
export function mountShell({ router, bus }) {
  const nav = document.getElementById('shell-nav');
  nav.innerHTML = SECTIONS.map((s) => `<button class="focusable" data-go="${s.id}">${icon(s.icon, { size: 18 })}${s.label}</button>`).join('');
  nav.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:40;display:flex;gap:12px;padding:12px;background:#0008';
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) router.go(b.dataset.go); });
}
