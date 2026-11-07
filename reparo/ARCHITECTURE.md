# Reparo — Arquitectura y reglas del equipo

App de gestión para **servicio técnico de celulares**, nivel startup (referentes:
RepairDesk, RepairShopr, Fixably, Orderry; calidad visual de Linear, Stripe, Vercel, Raycast).
Todo en **español**. **Local-first**: funciona 100 % sin internet; el servidor es opcional.

## Stack
- Vite 8 + React 19 + TypeScript (strict). Alias `@/` → `src/`.
- Base de datos local: **IndexedDB vía Dexie 4** (`dexie-react-hooks` para consultas reactivas).
- Animación: `motion` (`import { motion, AnimatePresence } from 'motion/react'`).
- 3D: `three` (sin @react-three). Íconos: `lucide-react`. Fechas: `date-fns` + locale `es`.
- Validación: `zod`. Fuentes locales: Geist / Geist Mono (`@fontsource-variable/*`).
- Estilos: **CSS Modules** (`Componente.module.css`) + tokens en `src/styles/tokens.css`.
  Nunca colores hex sueltos en componentes: usa `var(--token)`.
- Build: un solo `index.html` autocontenido en `../app/` (vite-plugin-singlefile) + `sw.js`,
  `manifest.webmanifest` e íconos copiados desde `public/`.
- **Prohibido** cargar recursos de red (CDN, Google Fonts, APIs externas). Todo va empaquetado.

## Carpetas y dueños (cada subagente sólo edita lo suyo)
| Ruta | Dueño | Contenido |
|---|---|---|
| `src/data/**` | Datos | Dexie, repositorios, auditoría, reportes, respaldo, demo, motor de notificaciones, formato |
| `src/ui/**`, `src/shell/**`, `src/styles/global.css` | UI + Shell | Sistema de diseño, layout, navegación, paleta de comandos, notificaciones in-app |
| `src/charts/**` | Gráficos | Gráficos SVG animados (área, barras, dona, sparkline, anillo) |
| `src/three/**` | 3D | Escenas Three.js (dispositivo héroe, onboarding, miniaturas 3D de repuestos) |
| `src/pwa/**`, `public/**` | PWA | Service worker, manifest, íconos, offline, instalación, notificaciones del sistema, Web Push (cliente) |
| `server/**`, `src/data/sync.ts` | Servidor | Servidor Node opcional: sirve la app, API de sincronización (node:sqlite), Web Push (VAPID) |
| `src/pages/<pagina>/**` | Página | Una por agente: panel, clientes, gastos, inventario, reportes, actividad, ajustes (+ onboarding) |
| `src/app/**`, `src/data/types.ts`, `src/styles/tokens.css` | Orquestador | Contratos compartidos. **No editar** sin coordinar (si necesitas algo, añádelo en tu carpeta). |

## Contratos de navegación (router por hash, `src/app/router.tsx`)
- Rutas: `#/panel`, `#/clientes`, `#/clientes/<id>`, `#/gastos`, `#/gastos/<id>`, `#/inventario`,
  `#/inventario/<id>`, `#/reportes`, `#/actividad`, `#/ajustes`.
- Acciones por query (las páginas DEBEN soportarlas; el shell y otras páginas las usan):
  - `#/clientes?nuevo=1` abre el formulario de nuevo cliente. `#/clientes/<id>?editar=1` lo edita.
  - `#/gastos?nuevo=1` (opcional `&cliente=<id>`), `#/gastos/<id>?editar=1`.
  - `#/inventario?nuevo=1`, `#/inventario/<id>?editar=1`,
    `#/inventario?usar=1&cliente=<clienteId>` abre el selector "usar repuesto" ligado a ese cliente,
    `#/inventario?filtro=pedir` muestra la lista "Por pedir".
  - `#/reportes?periodo=week|month`.
  - `#/actividad?entidad=cliente|gasto|inventario&id=<id>`.
- `useRoute()`, `navigate()`, `setQuery()`, `<Link to>` vienen de `@/app/router`.

## Reglas de negocio
- Dinero SIEMPRE en centavos enteros (`*Cents`). Formatear con `formatMoney` de `@/data`.
- **Cobrado** = suma de `pagadoCents` de clientes (no cancelados) por su `fecha`.
  **Facturado** = suma de `cobroCents`. **Por cobrar** = facturado − cobrado.
  **Gastado** = suma de `totalCents` de gastos por su `fecha`. **Ganancia** = cobrado − gastado.
- Inventario: reponer stock puede crear un gasto (vinculado con `inventarioId`); usar una pieza
  NO crea gasto, sólo descuenta stock (movimiento `uso`, opcionalmente ligado a un cliente).
  Un artículo está "Por pedir" si `stock <= stockMinimo` o `marcadoReorden`; "Pedido" si `pedidoAt`.
- Semana empieza en lunes por defecto (`settings.weekStartsOn`).
- Eliminar = enviar a papelera (restaurable). Toda alta/edición/baja/restauración/movimiento
  queda en el **Registro de actividad** con fecha y hora exacta y el detalle campo por campo.
- **Siempre mostrar fecha y hora** de cada registro (p. ej. "7 nov 2026 · 14:32").

## Calidad (AAA)
- Responsive real: 360 px → 1920 px. Móvil con barra inferior y hojas (bottom sheets).
- Temas oscuro (por defecto) y claro, ambos impecables.
- Estados completos: carga (skeleton), vacío (ilustrado), error, éxito (toast con "Deshacer").
- Accesible: foco visible, navegación por teclado, `aria-*`, contraste AA, `prefers-reduced-motion`.
- Microinteracciones con `motion` (transiciones de 150–360 ms, easing `--ease-out`).
- Números con `font-variant-numeric: tabular-nums`.

## Herramientas
- `npm run dev` · `npm run build` · `npx tsc -b --noEmit` · `npm test`.
- Capturas: `node scripts/shot.mjs --routes panel,clientes --out shots/mi-carpeta [--seed] [--themes dark,light] [--viewports desktop,mobile]`
  (levanta su propio servidor Vite en un puerto libre; `--seed` carga datos demo).
