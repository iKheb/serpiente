// =============================================================================
// ÓRBITA · Arranque de la aplicación (compartido — propiedad del líder)
// =============================================================================
import { device, applyDeviceClasses } from './core/device.js';
import { nav } from './core/nav.js';
import { router } from './core/router.js';
import { store } from './core/store.js';
import { bus } from './core/bus.js';
import { mountShell } from './ui/shell.js';
import { toast } from './ui/toast.js';
import { sfx } from './audio/sfx.js';

async function boot() {
  applyDeviceClasses();
  if (store.setting('reducedMotion')) document.documentElement.classList.add('reduced-motion');
  nav.init();
  sfx.init();
  mountShell({ router, store, nav, bus, device });
  try {
    const { stage } = await import('./gfx/hero3d.js');
    stage.mount(document.getElementById('stage'), { device, bus });
  } catch (e) { console.warn('[stage]', e); }

  // Desbloqueo de audio tras el primer gesto
  const unlock = () => { sfx.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);

  // Sonidos de interfaz
  bus.on('nav:focus', () => sfx.play('move'));

  // Salida en TV (atrás en Inicio)
  bus.on('app:exit-request', () => {
    if (device.isTV) toast('Pulsa «Atrás» de nuevo para salir de Órbita', { icon: 'logOut' });
  });

  const wantsRoute = location.hash && !/^#\/?(perfiles)?$/.test(location.hash);

  if (device.dev) {
    if (!store.get('profileId')) store.setProfile('p1');
    if (!wantsRoute) history.replaceState({ idx: 0 }, '', '#/inicio');
    document.getElementById('splash').classList.add('done');
    await router.start();
    return;
  }

  // Intro cinematográfica (cualquier tecla/toque la salta)
  try {
    const { playSplash } = await import('./gfx/splash3d.js');
    await playSplash(document.getElementById('splash'), { device });
  } catch (e) { console.warn('[splash]', e); }
  document.getElementById('splash').classList.add('done');
  document.getElementById('splash').replaceChildren();

  // Selector de perfil en cada arranque (como las grandes plataformas)
  history.replaceState({ idx: 0 }, '', '#/perfiles');
  await router.start();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('view').innerHTML = '<p style="padding:2rem">No se pudo iniciar Órbita. Recarga la página.</p>';
});
