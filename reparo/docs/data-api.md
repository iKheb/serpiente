# Contrato de la API de datos (`import { … } from '@/data'`)

Lo implementa el agente de Datos. Todos los demás lo consumen. Los nombres y firmas
de abajo son **obligatorios** (se pueden añadir extras, no cambiar estos).

## Base de datos (Dexie) — `@/data/db`
`export const db` con tablas (nombres fijos, los usa también la sincronización):
`clients`, `expenses`, `inventory`, `movements`, `audit`, `notifications`, `settings`, `meta` (clave/valor: `{ key, value }`).
`export function getDeviceId(): string` (persistido en `meta`).

## Hooks reactivos (devuelven `undefined` mientras cargan)
```ts
useSettings(): Settings | undefined
useClients(opts?: { includeDeleted?: boolean }): Client[] | undefined          // orden: fecha desc
useClient(id: ID | null | undefined): Client | null | undefined                // null = no existe
useExpenses(opts?: { includeDeleted?: boolean; clienteId?: ID }): Expense[] | undefined
useExpense(id): Expense | null | undefined
useInventory(opts?: { includeDeleted?: boolean }): InventoryItem[] | undefined // orden: nombre asc
useInventoryItem(id): InventoryItem | null | undefined
useMovements(opts?: { itemId?: ID; clienteId?: ID; limit?: number }): InventoryMovement[] | undefined // ts desc
useAudit(opts?: { entity?: EntityType; entityId?: ID; action?: AuditAction; limit?: number }): AuditEntry[] | undefined // ts desc
useNotifications(opts?: { unreadOnly?: boolean; limit?: number }): AppNotification[] | undefined // ts desc
useUnreadCount(): number
useTrash(): { clients: Client[]; expenses: Expense[]; inventory: InventoryItem[] } | undefined
useSummary(range: DateRange): Summary | undefined
useSeries(range: DateRange, bucket: 'day' | 'week' | 'month'): SeriesPoint[] | undefined
usePeriodHistory(kind: PeriodKind, count: number, anchor?: Timestamp): { period: Period; summary: Summary }[] | undefined // más reciente primero
useCategoryBreakdown(range: DateRange): { categoria: ExpenseCategory; label: string; totalCents: number; count: number }[] | undefined
useServiceBreakdown(range: DateRange): { servicio: string; cobradoCents: number; count: number }[] | undefined
useStatusCounts(): Record<RepairStatus, number> | undefined   // clientes activos (no borrados)
useClientFinancials(clientId: ID): { cobroCents: number; pagadoCents: number; saldoCents: number; gastosCents: number; piezasCents: number; gananciaCents: number } | undefined
useCustomerDirectory(): { nombre: string; telefono: string; visitas: number; ultimaVisita: Timestamp }[] | undefined
useInventoryStats(): { articulos: number; unidades: number; valorCents: number; porPedir: number; agotados: number; pedidos: number } | undefined
useFormatters(): { money(c: number, o?: MoneyFormatOptions): string; dateTime(ts: number): string; date(ts: number): string; time(ts: number): string; relative(ts: number): string } // re-renderiza al cambiar moneda/locale
```

## Mutaciones (async; cada una registra auditoría en la MISMA transacción)
```ts
createClient(input: ClientInput): Promise<Client>
updateClient(id: ID, patch: Partial<ClientInput>): Promise<Client>   // sin cambios reales → no audita
deleteClient(id: ID): Promise<void>        // papelera
restoreClient(id: ID): Promise<void>
purgeClient(id: ID): Promise<void>         // definitivo

createExpense(input: ExpenseInput): Promise<Expense>                 // calcula totalCents
updateExpense(id: ID, patch: Partial<ExpenseInput>): Promise<Expense>
deleteExpense / restoreExpense / purgeExpense (id: ID): Promise<void>

createInventoryItem(input: InventoryItemInput, opts?: { registrarGasto?: boolean; metodoPago?: PaymentMethod }): Promise<InventoryItem>
updateInventoryItem(id: ID, patch: Partial<InventoryItemInput>): Promise<InventoryItem>
deleteInventoryItem / restoreInventoryItem / purgeInventoryItem (id: ID): Promise<void>
consumeInventory(itemId: ID, o: { cantidad: number; clienteId?: ID | null; nota?: string; ts?: Timestamp }): Promise<InventoryMovement>   // "uso"
restockInventory(itemId: ID, o: { cantidad: number; costoUnitarioCents?: number; registrarGasto: boolean; proveedor?: string; metodoPago?: PaymentMethod; nota?: string; ts?: Timestamp }): Promise<{ movement: InventoryMovement; expense: Expense | null }>  // limpia pedidoAt y marcadoReorden
adjustInventory(itemId: ID, o: { nuevoStock: number; nota?: string }): Promise<InventoryMovement>
registerWaste(itemId: ID, o: { cantidad: number; nota?: string }): Promise<InventoryMovement>   // "merma"
markOrdered(itemId: ID, ordered: boolean): Promise<void>       // pedidoAt = now | null
setReorderFlag(itemId: ID, flag: boolean): Promise<void>

updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings>   // audita como 'ajustes'
markNotificationRead(id: ID): Promise<void>
markAllNotificationsRead(): Promise<void>
deleteNotification(id: ID): Promise<void>
clearNotifications(): Promise<void>
```
Errores de validación: `class ValidationError extends Error { fields: Record<string, string> }` (mensajes en español).

## Utilidades puras
```ts
// formato (usan la moneda/locale de los ajustes en caché si no se pasan)
type MoneyFormatOptions = { compact?: boolean; sign?: boolean; currency?: string; locale?: string; decimals?: boolean }
formatMoney(cents: number, o?: MoneyFormatOptions): string        // "$1,250.00"; compact → "$12.5 k"
parseMoneyToCents(input: string | number): number                 // "1.250,50" | "1,250.50" | 1250.5 → 125050
formatDateTime(ts): string   // "7 nov 2026 · 14:32"
formatDate(ts): string       // "7 nov 2026"
formatTime(ts): string       // "14:32"
formatRelative(ts): string   // "justo ahora", "hace 5 min", "ayer · 14:32"
formatDayHeading(ts): string // "Hoy · sábado 7 de noviembre"
// periodos
getPeriod(kind: PeriodKind, anchor?: Timestamp, weekStartsOn?: 0 | 1): Period
shiftPeriod(p: Period, delta: number, weekStartsOn?: 0 | 1): Period
// derivados
paymentStatus(c: Pick<Client, 'cobroCents' | 'pagadoCents'>): PaymentStatus
stockStatus(i: InventoryItem): StockStatus      // 'pedido' tiene prioridad si pedidoAt
needsReorder(i: InventoryItem): boolean
normalizeText(s: string): string                // minúsculas sin acentos (búsquedas)
matchesQuery(text: string, q: string): boolean
// formularios
emptyClientInput(): ClientInput; emptyExpenseInput(): ExpenseInput; emptyInventoryInput(): InventoryItemInput
clientInputSchema / expenseInputSchema / inventoryItemInputSchema   (zod)
validateClientInput(i) / validateExpenseInput(i) / validateInventoryInput(i): Record<string, string>  // {} si es válido
FIELD_LABELS: Record<'cliente' | 'gasto' | 'inventario', Record<string, string>>
```

## Respaldo, demo y sistema
```ts
exportBackup(): Promise<Blob>                                  // JSON versionado de todas las tablas
importBackup(file: File | Blob, mode: 'merge' | 'replace'): Promise<{ clients: number; expenses: number; inventory: number; movements: number; audit: number }>
exportCSV(kind: 'clientes' | 'gastos' | 'inventario' | 'movimientos' | 'actividad'): Promise<Blob>  // UTF-8 con BOM, separador ","
downloadBlob(blob: Blob, filename: string): void
seedDemoData(): Promise<void>      // borra y carga ~90 días de datos realistas (determinista respecto a "hoy")
wipeAllData(): Promise<void>       // borra todo menos deviceId
requestPersistentStorage(): Promise<boolean>
getStorageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean }>
// notificaciones
runNotificationChecks(now?: Timestamp): Promise<AppNotification[]>   // evalúa reglas, crea (con dedupe) y devuelve las nuevas
onNotificationCreated(cb: (n: AppNotification) => void): () => void  // para mostrarlas como notificación del sistema
// Global para pruebas/capturas:
window.__reparo = { db, seedDemoData, wipeAllData, updateSettings, runNotificationChecks }
```

## Ampliación (nuevos requisitos del cliente): fotos, patrón de desbloqueo, folio y recibo WhatsApp
Tipos nuevos en types.ts: `Client.folio`, `Client.desbloqueoTipo/desbloqueoPatron/desbloqueoCodigo`, `Client.numFotos`,
`ClientPhoto`, `PhotoKind`, `PHOTO_KIND_LABEL`, `UnlockType`, y en `Settings`: `businessPhone`, `businessAddress`, `receiptFooter`, `phoneCountryCode`.
- Tabla Dexie nueva `photos` ('id, clientId, ts') — por eso la versión de esquema incluye `photos`.
- `createClient` asigna `folio` consecutivo (contador en `meta` 'folioSeq', transaccional) y `numFotos = 0`.
- Auditoría: los campos de desbloqueo se registran ENMASCARADOS ("Patrón actualizado", "PIN ••••"); nunca el valor en claro.
```ts
addClientPhotos(clientId: ID, files: (File | Blob)[], o?: { kind?: PhotoKind; caption?: string }): Promise<ClientPhoto[]>  // comprime (≤1600px, JPEG 0.82) + miniatura (≤360px) con createImageBitmap/canvas; actualiza numFotos; audita
deleteClientPhoto(id: ID): Promise<void>        // actualiza numFotos; audita
updateClientPhoto(id: ID, patch: { caption?: string; kind?: PhotoKind }): Promise<void>
useClientPhotos(clientId: ID | null | undefined): ClientPhoto[] | undefined   // ts asc
usePhotoURL(blob: Blob | null | undefined): string | null    // object URL con revoke automático
formatFolio(folio: number): string                          // "#000123"
// Recibo (puro, src/data/receipt.ts)
buildReceiptText(c: Client, s: Settings, o?: { piezas?: { nombre: string; cantidad: number }[] }): string   // texto estilo recibo con *negritas* de WhatsApp, emojis sobrios, folio, fecha y hora, equipo, servicio, total, abonado, saldo, garantía, pie
normalizePhoneForWhatsApp(phone: string, countryCode: string): string    // solo dígitos con código de país
whatsappUrl(phone: string, text: string, countryCode: string): string    // https://wa.me/<num>?text=…  (si no hay teléfono: https://wa.me/?text=…)
```
Respaldo: `exportBackup` incluye `photos` (blobs como data URL base64); `importBackup` las restaura. `wipeAllData` también las borra. Las fotos NO se sincronizan con el servidor (sólo locales).
