# Brief común para agentes de PÁGINA (léelo completo)

Reparo = app de gestión para un SERVICIO TÉCNICO DE CELULARES, nivel startup AAA
(referentes visuales: Linear, Stripe Dashboard, Vercel, Raycast; de dominio: RepairDesk, RepairShopr, Fixably).
Todo el texto visible en ESPAÑOL neutro latinoamericano (tú, no vos/vosotros). Funciona 100 % sin internet.

## Lee antes de escribir código
ARCHITECTURE.md · src/data/types.ts · docs/data-api.md (incluida la "Ampliación") · src/data/index.ts (exports REALES) ·
src/ui/index.ts (+ src/ui/Gallery.tsx para ver ejemplos de uso de cada componente) · src/charts/index.ts ·
src/app/router.tsx · src/styles/tokens.css. Si existe, src/three/index.ts.

## Reglas
- Zona: SÓLO tu carpeta `src/pages/<tu-página>/**` (se indica en tu encargo). Otros agentes trabajan EN PARALELO.
  Si necesitas algo de otra zona que no existe, NO lo edites: impleméntalo localmente en tu carpeta o anótalo en tu reporte.
- NO `npm install`. NO git commit/push.
- Usa SIEMPRE los componentes de `@/ui` (Button, Sheet, DataTable, PageHeader, KpiCard, toast, confirm, DateTimeText,
  MoneyInput, DateTimeInput, Combobox, Select, SegmentedControl, FilterChips, EmptyState, Skeleton, Badge, StatusBadge…),
  gráficos de `@/charts`, datos/formatos de `@/data` (hooks reactivos + mutaciones). CSS Modules + tokens; nada de hex sueltos.
- La página es el default export del archivo indicado (App.tsx la carga con lazy). El Shell (sidebar, topbar, reloj,
  navegación móvil) lo pone otro agente: tu página sólo renderiza el contenido, empezando por `<PageHeader>`.
- Respeta los contratos de query del router (ARCHITECTURE.md): p. ej. `?nuevo=1` abre el formulario; al cerrar, limpia la
  query con `setQuery({ nuevo: null })`. Usa `navigate()` para ir a otras páginas.
- SIEMPRE muestra fecha y hora de cada registro (DateTimeText). Dinero con formatMoney/MoneyText, tabular-nums.
- Estados completos: cargando (Skeleton con la forma real), vacío (EmptyState con acción), error de validación por campo,
  éxito (toast con acción "Deshacer" tras eliminar → restore*). Confirmación antes de eliminar.
- Formularios en `Sheet` (panel lateral en escritorio / bottom sheet en móvil): secciones claras, Enter/⌘↵ guarda, Esc cierra,
  aviso si hay cambios sin guardar, foco en el primer campo, botones fijos al pie ("Cancelar" / "Guardar cliente").
- Responsive real: 360 px a 1920 px. En móvil, listas como tarjetas táctiles (≥ 44 px), acciones accesibles con el pulgar.
- Accesibilidad: labels, aria, foco visible, navegación por teclado.
- Microinteracciones con `motion/react` (sutiles, 150–360 ms), respetando reduced-motion.

## Verificación (sé económico: pocas iteraciones bien hechas)
- `npx tsc -b --noEmit 2>&1 | grep src/pages/<tu-página>` → 0 errores.
- Capturas: `node scripts/shot.mjs --routes <tu-ruta>,"<tu-ruta>?nuevo=1" --seed --out shots/<tu-página> --themes dark,light --viewports desktop,mobile`
  (añade `--full` para página completa). Mira los PNG con Read y corrige lo que no esté a nivel Linear/Stripe:
  alineaciones, espaciado, jerarquía, densidad, contraste, estados. 2–4 iteraciones.
- Revisa también la consola: el script lista errores al final; deben ser 0 de tu página.

## Reporte final (máx. 250 palabras)
Archivos, qué quedó implementado, rutas/queries soportadas, y cualquier cosa que el orquestador deba integrar.
