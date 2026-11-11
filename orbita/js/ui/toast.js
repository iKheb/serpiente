// Notificaciones breves. toast('Texto', { icon:'check', ms:2600 })
import { icon } from './icons.js';
import { esc } from '../core/dom.js';
export function toast(text, { icon: ic = 'info', ms = 2600 } = {}) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(ic, { size: 18 })}<span>${esc(text)}</span>`;
  host.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => { el.classList.remove('is-in'); el.classList.add('is-out'); setTimeout(() => el.remove(), 400); }, ms);
}
