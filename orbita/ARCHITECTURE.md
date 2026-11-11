# Órbita — Arquitectura y contratos

Plataforma de streaming (TV en vivo + películas + series) original, en español, para **navegador, móvil, tablet y Smart TV**, construida con **Three.js** y JavaScript nativo (módulos ES, sin build en desarrollo).

> Todo el contenido es ficticio y original. No se incluyen marcas, obras ni emisiones reales. Las "emisiones" son escenas 3D procedurales en tiempo real; el reproductor está preparado para sustituirlas por flujos con licencia.

## Equivalencias por plataforma

| Plataforma | Cómo se cubre | Detección |
|---|---|---|
| Navegador (escritorio) | Web app, ratón + teclado, barra superior | `device-desktop` |
| Móvil (iOS / Android) | Web app / PWA instalable, táctil, barra inferior | `device-mobile` |
| Tablet (iPad / Android) | Web app / PWA, táctil, layout intermedio | `device-tablet` |
| Smart TV (Android TV / Google TV, Fire TV, Tizen, webOS, consolas) | Interfaz "10 pies", navegación D-pad con memoria de foco, teclas Atrás nativas (Tizen 10009, webOS 461), teclas multimedia y canal ±, gamepad | `device-tv` |

Forzar modo: `?modo=tv|mobile|tablet|desktop`. Calidad gráfica: `?calidad=baja|media|alta`. Desarrollo: `?dev` (salta intro y perfiles).

## Estructura

```
index.html              importmap (three, three/addons/, cannon-es) + capas raíz
css/tokens.css          tokens de diseño (LÍDER)
css/base.css            reset, tipografía, utilidades (LÍDER)
css/components.css      A4 · componentes UI (tarjetas, botones, filas, toasts, barra)
css/screens.css         A4 · inicio, detalle, perfiles
css/player.css          A5 · reproductor
css/guide.css           A5 · guía EPG y página En vivo
css/search-settings.css A5 · búsqueda, teclado en pantalla, ajustes
css/stage.css           A1 · intro y escenario 3D
css/broadcast.css       A2 · grafismo de canal dentro de la emisión
js/main.js              arranque (LÍDER)
js/core/*               bus, store, router, nav espacial, device, dom (LÍDER)
js/ui/icons.js          iconos SVG (LÍDER) — icon(name,{size,fill,stroke,cls})
js/ui/brand.js          marca (LÍDER) — markSVG(), logoHTML()
js/data/catalog.js      A3 · catálogo, canales, EPG, filas por sección
js/gfx/artwork.js       A3 · arte procedural (pósters, fondos, capas, logos, avatares)
js/gfx/art/*            A3 · auxiliares
js/gfx/hero3d.js        A1 · singleton `stage` (universo Three.js en #stage)
js/gfx/splash3d.js      A1 · intro cinematográfica
js/gfx/stage/*          A1 · auxiliares
js/gfx/broadcast-engine.js  A2 · motor de emisiones
js/gfx/broadcasts/*     A2 · escenas (fútbol, noticias, océano, cosmos, naturaleza, noir, motor, infantil, música, fantasía)
js/audio/*              A2 · sfx de interfaz + audio procedural de emisiones (WebAudio)
js/ui/shell.js          A4 · barra superior / riel TV / barra inferior móvil
js/ui/home.js           A4 · Inicio y secciones (hero + filas)
js/ui/detail.js         A4 · ficha de título
js/ui/profiles.js       A4 · "¿Quién está viendo?"
js/ui/toast.js          A4 · notificaciones
js/ui/components/*      A4 · tarjetas, filas, etc.
js/ui/player.js         A5 · reproductor VOD / en vivo
js/ui/live.js           A5 · página En vivo (lista de canales + vista previa)
js/ui/guide.js          A5 · guía de programación (EPG)
js/ui/search.js         A5 · búsqueda (+ teclado en pantalla en TV)
js/ui/settings.js       A5 · ajustes
js/ui/keyboard.js       A5 · teclado en pantalla
tools/serve.cjs         servidor estático: node tools/serve.cjs 8084
tools/shot.cjs          capturas Playwright (ver cabecera del archivo)
vendor/                 three r170, cannon-es 0.20 (no editar)
```

## Reglas para todos

1. **Solo editas tus archivos.** Si necesitas un cambio en un archivo ajeno o compartido, descríbelo en tu informe final (el líder lo integra). Excepción: puedes *leer* todo.
2. **Nada de red externa.** Todo local (fuentes, librerías). No uses CDNs.
3. **Español** en todo texto visible. Español neutro (válido en España y Latinoamérica).
4. **Rendimiento**: 60 fps en escritorio; respeta `device.tier` (0 bajo — TV/móvil modesto, 1 medio, 2 alto) y `device.pixelRatio()`. Pausa RAF cuando no se ve. Libera WebGL/listeners en `dispose()/unmount()`.
5. **Foco TV**: todo lo interactivo lleva `.focusable` (y es `<button>` o tiene `tabindex="-1"`). El motor añade `.is-focus`; estilízalo de forma espectacular y legible a 3 m. `html.kbd-nav` indica navegación por teclado/mando (siempre en TV). Usa `data-nav-group` en filas/listas para memoria de foco y `data-nav-scroll` en contenedores desplazables.
6. **Almacenamiento**: usa `store` (js/core/store.js), nunca `localStorage` directo.
7. **Accesibilidad**: contraste AA, `aria-label` en botones de icono, `prefers-reduced-motion` / `html.reduced-motion`.
8. **No hagas commit ni push.** El líder integra.
9. Usa tu puerto propio para probar: A1 8081 · A2 8082 · A3 8083 · A4 8084 · A5 8085.
   `node tools/serve.cjs 808X &` y `node tools/shot.cjs --url "http://localhost:808X/?dev#/inicio" --preset desktop --out <scratch>/x.png`.
   El navegador de pruebas usa SwiftShader (GPU software): las capturas son lentas pero fieles.

## Contratos

### Router (`js/core/router.js`)
Rutas hash: `#/inicio #/envivo #/peliculas #/series #/deportes #/infantil #/milista #/buscar #/guia #/ajustes #/perfiles`, overlays `#/titulo/:id`, `#/ver/:id[/:ep]` (ep = `s1e2`), `#/canal/:id`.
Módulo de pantalla: `export default { async mount(root, params, ctx), unmount(), onBack?() → bool, onParams?(params) }`.
`ctx = { router, store, nav, bus, device }`. `router.go('titulo/t-x')`, `router.back()`.
Bus `'route'` → `{ page, section, overlays, name, params, player }`.
Clases que el router pone: página `section.screen.screen-NAME` (+`.screen-enter` al entrar, `.screen-leave` al salir); overlay `div.overlay.overlay-NAME` (+`.overlay-player` para reproductor, `.is-open` al abrir, `.is-closing` al cerrar). `html.no-shell` en perfiles.

### Navegación espacial (`js/core/nav.js`)
Ver cabecera del archivo. `nav.intercept(fn)` para que el reproductor capture flechas/OK/espacio/teclas multimedia. Bus `'key:action'` {action} para teclas no consumidas (chup/chdown/info/digitN…), `'key:back'`.

### Datos (`js/data/catalog.js`) — A3
Esquema en la cabecera. Funciones: `getTitle, getChannel, byType, byGenre, kidsTitles, search(q,{kids}), featured(section), rowsFor(section), programsFor(channelId, from, to), nowOn(channelId)`. Constantes: `TITLES, CHANNELS, GENRES, LIVE_CATEGORIES, SCENES`.

### Arte (`js/gfx/artwork.js`) — A3
`poster(t)`, `backdrop(t)`, `layers(t) → {bg, mid, fg}`, `logo(t)`, `thumb(t, s, e)`, `channelLogo(c)`, `avatar(p)` → `Promise<url>`. Cache, generación perezosa, sin bloquear el hilo.

### Escenario 3D (`js/gfx/hero3d.js`) — A1
Singleton `stage` en `#stage` (fijo, detrás de la app):
`mount(el,{device,bus})`, `setMode('carousel'|'ambient'|'off')` (además decide solo con bus `'route'`: perfiles→ambient, inicio/secciones→carousel, envivo/guía/búsqueda/ajustes→ambient atenuado u off, reproductor→off),
`setItems([{id,title,palette,layers}])`, `show(i,{direction})`, `setScroll(p 0..1)`, `setPalette(pal)`, `pointer(nx,ny)`.
Composición del hero: el destacado ocupa todo el fondo (cinemático, paralaje 2.5D por capas); el tercio izquierdo (escritorio/TV) debe quedar suficientemente oscuro para texto; en móvil vertical el foco visual está en la mitad superior.
Intro: `playSplash(container,{device}) → Promise` (≤ 4,5 s, saltable, libera WebGL).

### Emisiones (`js/gfx/broadcast-engine.js`) — A2
`new BroadcastEngine(container,{device})`, `await load(sceneId,{seed,palette,title,live,program,channel})`, `play() pause() seek(s)`, `time`, `duration` (VOD), `playing`, `setVolume(v) setMuted(b) setQuality(q)`, `dispose()`, callbacks `onTime(t)`, `onReady()`. Grafismo de canal (marcador, rótulos, cintillo) como DOM dentro del contenedor con prefijo `.bc-`.
Física: `cannon-es` disponible vía importmap.
Audio: `js/audio/sfx.js` → `sfx.init() play(name) setEnabled(b) unlock()`; nombres: `move select back open close error toggle whoosh tick startup`.

### Interfaz — A4 / A5
`js/ui/shell.js` exporta `mountShell(ctx)`, `SECTIONS`, `shell`.
Distribución: escritorio = barra superior transparente → cristal al hacer scroll; TV = riel lateral izquierdo de iconos que se expande con etiquetas al recibir foco; tablet = barra superior compacta; móvil = barra superior mínima + barra inferior de pestañas.
