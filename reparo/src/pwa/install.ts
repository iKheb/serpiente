/* Instalación como app (beforeinstallprompt / appinstalled / iOS). */
import { createStore, useStore } from './store';
import { IS_IOS, isBrowser, isStandalone } from './env';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallState {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
}

const installStore = createStore<InstallState>({ deferred: null, installed: isStandalone() });

// Se captura al importar el módulo: el evento llega muy pronto tras la carga.
if (isBrowser) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // ocultamos la mini-barra del navegador; ofrecemos nuestro botón
    installStore.set((s) => ({ ...s, deferred: e as BeforeInstallPromptEvent }));
  });
  window.addEventListener('appinstalled', () => {
    installStore.set({ deferred: null, installed: true });
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => {
    installStore.set((s) => ({ ...s, installed: isStandalone() || s.installed }));
  });
}

/** Texto de ayuda para iPhone/iPad (Safari no tiene diálogo de instalación). */
export const IOS_INSTALL_HINT =
  'En iPhone o iPad abre Reparo en Safari, toca Compartir (el cuadrado con la flecha hacia arriba) y elige «Agregar a inicio».';

/** Abre el diálogo nativo de instalación. true si el usuario aceptó. */
export async function promptInstall(): Promise<boolean> {
  const e = installStore.get().deferred;
  if (!e) return false;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    const accepted = choice.outcome === 'accepted';
    // El evento sólo sirve una vez.
    installStore.set((s) => ({ deferred: null, installed: accepted || s.installed }));
    return accepted;
  } catch {
    installStore.set((s) => ({ ...s, deferred: null }));
    return false;
  }
}

export function useInstallPrompt(): {
  canInstall: boolean;
  install(): Promise<boolean>;
  installed: boolean;
  isIOS: boolean;
} {
  const s = useStore(installStore);
  return { canInstall: !!s.deferred && !s.installed, install: promptInstall, installed: s.installed, isIOS: IS_IOS };
}
