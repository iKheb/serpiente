# Órbita en cada pantalla

Un solo código web, empaquetado con la herramienta nativa de cada plataforma. Primero `node tools/build.mjs` → `dist/`.

| Plataforma | Equivalente | Cómo |
|---|---|---|
| Navegador (Chrome, Edge, Safari, Firefox) | Web app | Sirve `dist/` en cualquier hosting estático HTTPS. |
| Android / iOS (móvil y tablet) | PWA instalable | Abre la web → «Añadir a pantalla de inicio». Manifest + service worker incluidos (pantalla completa, sin conexión). Para tiendas: Capacitor (`npx cap init Órbita tv.orbita.app --web-dir=dist`). |
| Android TV / Google TV / Fire TV | TWA (Trusted Web Activity) | `npx @bubblewrap/cli init --manifest=…/manifest.webmanifest` con `platforms/android-tv/twa-manifest.json`; añade la categoría `LEANBACK_LAUNCHER` y el banner 320×180 al `AndroidManifest.xml`. |
| Samsung (Tizen) | Web app `.wgt` | Copia `dist/` + `platforms/tizen/config.xml` y empaqueta con Tizen Studio. La tecla Atrás (10009) ya está mapeada. |
| LG (webOS) | Web app `.ipk` | Copia `dist/` + `platforms/webos/appinfo.json` y ejecuta `ares-package`. La tecla Atrás (461) ya está mapeada. |
| Consolas / mandos | Gamepad API | Cruceta, A = OK, B = Atrás. |

El modo TV se activa solo por User-Agent; también puedes forzarlo con `?modo=tv`.
