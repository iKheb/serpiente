/* Datos de demostración realistas y deterministas (PRNG con semilla fija),
   relativos a "hoy": ~90 días de un taller de reparación de celulares en México.
   Se cargan en una sola transacción con bulkAdd. Conserva ajustes y deviceId. */
import type {
  AppNotification,
  AuditEntry,
  Client,
  Expense,
  ExpenseCategory,
  FieldChange,
  InventoryItem,
  InventoryMovement,
  PaymentMethod,
  RepairStatus,
  Timestamp,
  UnlockType,
} from './types';
import { db, dbReady, getDeviceId, META_DEVICE_ID, META_FOLIO_SEQ, META_NOTIFIED } from './db';
import {
  SUMMARY,
  diffFields,
  sanitizeClient,
  stockChange,
  summarizeClientEdit,
  summarizeRestock,
  summarizeUse,
  type NameLookup,
} from './audit';
import { clientTitle } from './derive';
import { computeSummary } from './reports';
import { dayRange } from './periods';
import { dailySummaryDraft, previewNotificationDrafts, type NotificationDraft } from './notifications';
import { plural } from './util';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const DAYS_BACK = 89;

/* --------------------------------- PRNG ---------------------------------- */

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Gen {
  constructor(private readonly r: Rng) {}
  next(): number {
    return this.r();
  }
  chance(p: number): boolean {
    return this.r() < p;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.r() * (max - min + 1));
  }
  between(min: number, max: number): number {
    return min + this.r() * (max - min);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length)];
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let x = this.r() * total;
    for (const [v, w] of items) {
      x -= w;
      if (x < 0) return v;
    }
    return items[items.length - 1][0];
  }
  digits(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += String(this.int(0, 9));
    return s;
  }
  uuid(): string {
    const h = () => this.int(0, 15).toString(16);
    let s = '';
    for (let i = 0; i < 32; i++) s += i === 12 ? '4' : i === 16 ? (8 + this.int(0, 3)).toString(16) : h();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
}

const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);
const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
const pesos = (n: number) => Math.round(n) * 100;

/* ------------------------------- Catálogos ------------------------------- */

type Tier = 'basico' | 'medio' | 'premium';

interface ModelSpec {
  modelo: string;
  w: number;
  pantalla: readonly [number, number];
  bateria?: readonly [number, number];
  tier: Tier;
}

const MODELS: Record<string, readonly ModelSpec[]> = {
  Apple: [
    { modelo: 'iPhone 11', w: 8, pantalla: [1800, 2300], bateria: [700, 900], tier: 'medio' },
    { modelo: 'iPhone 11 Pro', w: 2, pantalla: [2400, 2900], bateria: [800, 950], tier: 'medio' },
    { modelo: 'iPhone 12', w: 8, pantalla: [2400, 3200], bateria: [800, 1000], tier: 'medio' },
    { modelo: 'iPhone 12 Pro', w: 3, pantalla: [2600, 3400], bateria: [850, 1050], tier: 'medio' },
    { modelo: 'iPhone 13', w: 9, pantalla: [2800, 3800], bateria: [900, 1200], tier: 'medio' },
    { modelo: 'iPhone 13 Pro', w: 3, pantalla: [3600, 4600], bateria: [1000, 1300], tier: 'premium' },
    { modelo: 'iPhone 14', w: 6, pantalla: [3200, 4300], bateria: [1000, 1300], tier: 'premium' },
    { modelo: 'iPhone 14 Pro', w: 3, pantalla: [4500, 5500], bateria: [1100, 1400], tier: 'premium' },
    { modelo: 'iPhone 14 Pro Max', w: 2, pantalla: [5000, 6000], bateria: [1200, 1500], tier: 'premium' },
    { modelo: 'iPhone 15', w: 4, pantalla: [3900, 4900], bateria: [1100, 1400], tier: 'premium' },
    { modelo: 'iPhone 15 Pro', w: 2, pantalla: [5200, 6100], bateria: [1300, 1500], tier: 'premium' },
    { modelo: 'iPhone 15 Pro Max', w: 2, pantalla: [5600, 6500], bateria: [1400, 1600], tier: 'premium' },
    { modelo: 'iPhone 16', w: 2, pantalla: [4500, 5400], bateria: [1300, 1500], tier: 'premium' },
    { modelo: 'iPhone 16 Pro Max', w: 1, pantalla: [6000, 6500], bateria: [1500, 1600], tier: 'premium' },
    { modelo: 'iPhone XR', w: 3, pantalla: [1500, 1900], bateria: [650, 800], tier: 'basico' },
    { modelo: 'iPhone SE (2022)', w: 2, pantalla: [1300, 1700], bateria: [650, 800], tier: 'basico' },
  ],
  Samsung: [
    { modelo: 'Galaxy A15', w: 6, pantalla: [1200, 1500], tier: 'basico' },
    { modelo: 'Galaxy A25', w: 5, pantalla: [1500, 1900], tier: 'medio' },
    { modelo: 'Galaxy A35', w: 3, pantalla: [1900, 2400], tier: 'medio' },
    { modelo: 'Galaxy A55', w: 3, pantalla: [2300, 2900], tier: 'medio' },
    { modelo: 'Galaxy A05s', w: 4, pantalla: [950, 1200], tier: 'basico' },
    { modelo: 'Galaxy A14', w: 4, pantalla: [1050, 1350], tier: 'basico' },
    { modelo: 'Galaxy A54', w: 2, pantalla: [2200, 2700], tier: 'medio' },
    { modelo: 'Galaxy S23', w: 2, pantalla: [3800, 4600], tier: 'premium' },
    { modelo: 'Galaxy S24', w: 2, pantalla: [4200, 5000], tier: 'premium' },
    { modelo: 'Galaxy S23 Ultra', w: 1, pantalla: [5200, 5800], tier: 'premium' },
    { modelo: 'Galaxy S24 Ultra', w: 1, pantalla: [5500, 5800], tier: 'premium' },
  ],
  Xiaomi: [
    { modelo: 'Redmi Note 13', w: 6, pantalla: [1100, 1450], tier: 'basico' },
    { modelo: 'Redmi Note 13 Pro', w: 3, pantalla: [1600, 2100], tier: 'medio' },
    { modelo: 'Redmi Note 14', w: 4, pantalla: [1200, 1550], tier: 'basico' },
    { modelo: 'Redmi Note 12', w: 4, pantalla: [1050, 1350], tier: 'basico' },
    { modelo: 'Redmi 13C', w: 4, pantalla: [850, 1100], tier: 'basico' },
    { modelo: 'Redmi 14C', w: 2, pantalla: [900, 1150], tier: 'basico' },
    { modelo: 'Poco X6', w: 3, pantalla: [1500, 1900], tier: 'medio' },
    { modelo: 'Poco X6 Pro', w: 2, pantalla: [1700, 2200], tier: 'medio' },
    { modelo: 'Poco F6', w: 1, pantalla: [2100, 2600], tier: 'medio' },
  ],
  Motorola: [
    { modelo: 'Moto G54', w: 5, pantalla: [1000, 1300], tier: 'basico' },
    { modelo: 'Moto G84', w: 4, pantalla: [1300, 1700], tier: 'medio' },
    { modelo: 'Moto G24', w: 4, pantalla: [850, 1100], tier: 'basico' },
    { modelo: 'Moto G34', w: 3, pantalla: [900, 1150], tier: 'basico' },
    { modelo: 'Moto E13', w: 3, pantalla: [750, 950], tier: 'basico' },
    { modelo: 'Edge 40', w: 2, pantalla: [2200, 2800], tier: 'medio' },
    { modelo: 'Edge 50 Fusion', w: 2, pantalla: [1900, 2400], tier: 'medio' },
  ],
  Huawei: [
    { modelo: 'P30 Lite', w: 3, pantalla: [1100, 1400], tier: 'basico' },
    { modelo: 'Nova 9 SE', w: 2, pantalla: [1300, 1600], tier: 'basico' },
    { modelo: 'Y9a', w: 2, pantalla: [1100, 1400], tier: 'basico' },
    { modelo: 'Nova 11i', w: 1, pantalla: [1400, 1700], tier: 'medio' },
  ],
  Oppo: [
    { modelo: 'A58', w: 3, pantalla: [1100, 1400], tier: 'basico' },
    { modelo: 'A78', w: 2, pantalla: [1300, 1600], tier: 'basico' },
    { modelo: 'Reno 10', w: 1, pantalla: [2400, 2900], tier: 'medio' },
    { modelo: 'A18', w: 2, pantalla: [900, 1150], tier: 'basico' },
  ],
  Honor: [
    { modelo: 'X6a', w: 2, pantalla: [900, 1150], tier: 'basico' },
    { modelo: 'X7b', w: 2, pantalla: [1100, 1400], tier: 'basico' },
    { modelo: 'Magic5 Lite', w: 2, pantalla: [1900, 2400], tier: 'medio' },
    { modelo: '90 Lite', w: 1, pantalla: [1500, 1900], tier: 'medio' },
  ],
  Realme: [
    { modelo: 'C55', w: 3, pantalla: [950, 1200], tier: 'basico' },
    { modelo: 'C67', w: 2, pantalla: [1100, 1400], tier: 'basico' },
    { modelo: '11 Pro', w: 1, pantalla: [2100, 2600], tier: 'medio' },
    { modelo: 'Note 50', w: 2, pantalla: [850, 1050], tier: 'basico' },
  ],
  Vivo: [
    { modelo: 'Y17s', w: 2, pantalla: [900, 1150], tier: 'basico' },
    { modelo: 'Y36', w: 2, pantalla: [1100, 1400], tier: 'basico' },
    { modelo: 'V29', w: 1, pantalla: [2300, 2800], tier: 'medio' },
  ],
  Google: [
    { modelo: 'Pixel 7', w: 2, pantalla: [3200, 3900], tier: 'premium' },
    { modelo: 'Pixel 8', w: 1, pantalla: [3800, 4600], tier: 'premium' },
  ],
};

const BRAND_WEIGHTS: readonly (readonly [string, number])[] = [
  ['Apple', 30],
  ['Samsung', 25],
  ['Xiaomi', 17],
  ['Motorola', 13],
  ['Huawei', 4],
  ['Oppo', 4],
  ['Honor', 3],
  ['Realme', 2],
  ['Vivo', 1],
  ['Google', 1],
];

const SERVICE_WEIGHTS: readonly (readonly [string, number])[] = [
  ['Cambio de pantalla', 34],
  ['Cambio de batería', 18],
  ['Puerto de carga', 12],
  ['Software / desbloqueo', 8],
  ['Tapa trasera', 6],
  ['Cámara', 5],
  ['Equipo mojado', 4],
  ['Altavoz / micrófono', 4],
  ['Reparación de placa', 3],
  ['Diagnóstico', 3],
  ['Botones', 2],
  ['Otro', 1],
];

const QUICK_SERVICES = new Set(['Software / desbloqueo', 'Diagnóstico', 'Otro', 'Cambio de batería']);

const FALLAS: Record<string, readonly string[]> = {
  'Cambio de pantalla': [
    'Pantalla estrellada tras caída',
    'Pantalla con líneas verdes',
    'El táctil no responde en la parte inferior',
    'Mancha negra que crece en la pantalla',
    'Cristal roto, la imagen sí se ve',
    'Pantalla parpadea y se queda en negro',
    'No da imagen tras caída, sí vibra y suena',
    'Toques fantasma, se abren apps solas',
  ],
  'Cambio de batería': [
    'Se descarga muy rápido',
    'Se apaga solo al 30 %',
    'Batería inflada, la pantalla se levanta',
    'Condición de batería al 74 %',
    'Se calienta mucho al cargar',
    'Sólo enciende conectado al cargador',
  ],
  'Puerto de carga': [
    'No carga, sólo si se mueve el cable',
    'Carga muy lento',
    'No reconoce el cable ni la computadora',
    'Puerto con pelusa y sulfatado',
  ],
  Cámara: [
    'Cámara trasera borrosa, no enfoca',
    'Cámara frontal en negro',
    'Lente de cámara roto',
    'La cámara vibra y hace ruido al abrirla',
  ],
  'Tapa trasera': ['Tapa trasera estrellada', 'Cristal trasero roto por caída', 'Tapa despegada por batería inflada'],
  'Equipo mojado': [
    'Se cayó al agua, no enciende',
    'Se mojó con refresco, el táctil falla',
    'Entró agua y no suena el altavoz',
  ],
  'Altavoz / micrófono': [
    'No se escucha en llamadas',
    'No funciona el micrófono, no lo escuchan',
    'Altavoz suena distorsionado',
  ],
  Botones: ['Botón de encendido hundido', 'Los botones de volumen no responden'],
  'Software / desbloqueo': [
    'Se quedó en el logo',
    'Olvidó la contraseña, requiere restablecer',
    'Actualización fallida, se reinicia solo',
    'Cuenta de Google bloqueada (FRP), trae factura',
    'Muy lento, requiere respaldo y restauración',
  ],
  'Reparación de placa': [
    'No enciende tras caída',
    'No enciende, consume corriente en fuente',
    'Sin señal, falla de baseband',
    'Se reinicia en bucle',
  ],
  Diagnóstico: ['No enciende, revisar', 'Revisión general antes de comprarlo', 'Se calienta mucho sin usarlo'],
  Otro: ['Instalación de mica de cristal y funda', 'Limpieza interna y cambio de mica'],
};

const NOTAS = [
  'Viene con funda y mica',
  'Golpe en la esquina superior',
  'Cliente pide pieza original',
  'Llamar antes de cambiar la pieza',
  'Dejó el cargador',
  'Trae la caja y factura',
  'Revisar también la bocina',
  'Cliente lo necesita para mañana temprano',
];

const NOMBRES_F = [
  'Ana', 'María', 'Guadalupe', 'Fernanda', 'Daniela', 'Valeria', 'Sofía', 'Camila', 'Ximena', 'Andrea', 'Paola',
  'Mariana', 'Gabriela', 'Alejandra', 'Karla', 'Lucía', 'Isabel', 'Rocío', 'Verónica', 'Patricia', 'Itzel',
  'Renata', 'Jimena', 'Natalia', 'Brenda', 'Diana', 'Elena', 'Montserrat',
];
const NOMBRES_M = [
  'José', 'Luis', 'Juan', 'Carlos', 'Jorge', 'Miguel', 'Alejandro', 'Eduardo', 'Fernando', 'Ricardo', 'Diego',
  'Javier', 'Raúl', 'Sergio', 'Héctor', 'Óscar', 'Arturo', 'Emilio', 'Santiago', 'Mateo', 'Iván', 'Rodrigo',
  'Francisco', 'Andrés', 'Manuel', 'Gerardo', 'Ulises', 'Adrián', 'Joel', 'Rubén',
];
const APELLIDOS = [
  'García', 'Hernández', 'López', 'Martínez', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz',
  'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Ruiz', 'Mendoza',
  'Aguilar', 'Ortiz', 'Moreno', 'Castillo', 'Romero', 'Álvarez', 'Méndez', 'Chávez', 'Rivera', 'Juárez', 'Ramos',
  'Domínguez', 'Herrera', 'Medina', 'Castro', 'Vargas', 'Guzmán', 'Velázquez', 'Salazar', 'Rojas', 'Contreras',
  'Luna', 'Ríos', 'Mejía', 'Cortés', 'Navarro', 'Peña', 'Campos', 'Delgado', 'Fuentes', 'Ibarra', 'Escobar',
  'Cervantes', 'Montes', 'Zamora', 'Valencia', 'Robles',
];

const PATRONES: readonly number[][] = [
  [0, 1, 2, 4, 6, 7, 8],
  [0, 3, 6, 7, 8],
  [2, 1, 0, 3, 6, 7, 8],
  [0, 4, 8, 5, 2],
  [6, 3, 0, 1, 2, 5, 8],
  [1, 4, 7, 8],
  [0, 1, 2, 5, 8],
  [3, 4, 5, 8, 7, 6],
  [0, 1, 4, 7, 8],
  [2, 4, 6, 7, 8],
  [6, 7, 8, 5, 2, 1, 0],
  [1, 0, 3, 4, 5, 2],
];
const CONTRASENAS = ['Pato2024', 'maria1987', 'Luna*22', 'Tigres10', 'casa4512'];

const PROVEEDORES = {
  centro: 'Refacciones Celulares del Centro',
  iparts: 'iParts Mayoreo',
  moviltec: 'Distribuidora MóvilTec',
  express: 'TecnoPartes Express',
} as const;

/* ------------------------------- Inventario ------------------------------ */

interface ItemSpec {
  nombre: string;
  categoria: ExpenseCategory;
  marca: string;
  modelo: string;
  sku: string;
  proveedor: string;
  costo: number;
  precio: number;
  min: number;
  pedido: number;
  ubicacion: string;
  final: number;
  /** Servicio y modelos con los que se usa en reparaciones. */
  match?: { servicio: string; modelos?: readonly string[]; android?: boolean };
  /** Consumible del taller: se usa periódicamente sin cliente (cada N días). */
  consumoCada?: number;
  /** Accesorio que se instala con cierta probabilidad al entregar. */
  accesorio?: { servicios: readonly string[] | null; p: number };
  pedidoHaceDias?: number;
  reorden?: boolean;
}

const ITEMS: readonly ItemSpec[] = [
  { nombre: 'Pantalla OLED iPhone 13', categoria: 'pantallas', marca: 'Apple', modelo: 'iPhone 13', sku: 'PAN-IP13-OLED', proveedor: PROVEEDORES.iparts, costo: 1450, precio: 3200, min: 2, pedido: 4, ubicacion: 'Cajón A1', final: 3, match: { servicio: 'Cambio de pantalla', modelos: ['iPhone 13'] } },
  { nombre: 'Pantalla incell iPhone 12 / 12 Pro', categoria: 'pantallas', marca: 'Apple', modelo: 'iPhone 12, iPhone 12 Pro', sku: 'PAN-IP12-INC', proveedor: PROVEEDORES.iparts, costo: 780, precio: 2400, min: 2, pedido: 4, ubicacion: 'Cajón A1', final: 4, match: { servicio: 'Cambio de pantalla', modelos: ['iPhone 12', 'iPhone 12 Pro'] } },
  { nombre: 'Pantalla LCD iPhone 11', categoria: 'pantallas', marca: 'Apple', modelo: 'iPhone 11', sku: 'PAN-IP11-LCD', proveedor: PROVEEDORES.iparts, costo: 520, precio: 1800, min: 2, pedido: 5, ubicacion: 'Cajón A1', final: 1, match: { servicio: 'Cambio de pantalla', modelos: ['iPhone 11'] } },
  { nombre: 'Pantalla OLED iPhone 14', categoria: 'pantallas', marca: 'Apple', modelo: 'iPhone 14', sku: 'PAN-IP14-OLED', proveedor: PROVEEDORES.iparts, costo: 1950, precio: 3900, min: 1, pedido: 3, ubicacion: 'Cajón A2', final: 0, match: { servicio: 'Cambio de pantalla', modelos: ['iPhone 14'] }, pedidoHaceDias: 2 },
  { nombre: 'Pantalla Galaxy A15 con marco', categoria: 'pantallas', marca: 'Samsung', modelo: 'Galaxy A15', sku: 'PAN-SA15-MAR', proveedor: PROVEEDORES.moviltec, costo: 640, precio: 1400, min: 2, pedido: 4, ubicacion: 'Cajón A3', final: 5, match: { servicio: 'Cambio de pantalla', modelos: ['Galaxy A15'] } },
  { nombre: 'Pantalla Galaxy A25 con marco', categoria: 'pantallas', marca: 'Samsung', modelo: 'Galaxy A25', sku: 'PAN-SA25-MAR', proveedor: PROVEEDORES.moviltec, costo: 820, precio: 1700, min: 2, pedido: 3, ubicacion: 'Cajón A3', final: 2, match: { servicio: 'Cambio de pantalla', modelos: ['Galaxy A25'] } },
  { nombre: 'Pantalla Redmi Note 13', categoria: 'pantallas', marca: 'Xiaomi', modelo: 'Redmi Note 13', sku: 'PAN-RN13', proveedor: PROVEEDORES.moviltec, costo: 590, precio: 1300, min: 2, pedido: 4, ubicacion: 'Cajón A4', final: 3, match: { servicio: 'Cambio de pantalla', modelos: ['Redmi Note 13'] } },
  { nombre: 'Pantalla Moto G54', categoria: 'pantallas', marca: 'Motorola', modelo: 'Moto G54', sku: 'PAN-MG54', proveedor: PROVEEDORES.centro, costo: 540, precio: 1200, min: 1, pedido: 3, ubicacion: 'Cajón A4', final: 0, match: { servicio: 'Cambio de pantalla', modelos: ['Moto G54'] } },
  { nombre: 'Batería iPhone 11', categoria: 'baterias', marca: 'Apple', modelo: 'iPhone 11', sku: 'BAT-IP11', proveedor: PROVEEDORES.iparts, costo: 240, precio: 800, min: 3, pedido: 6, ubicacion: 'Cajón B1', final: 6, match: { servicio: 'Cambio de batería', modelos: ['iPhone 11'] } },
  { nombre: 'Batería iPhone 12 / 12 Pro', categoria: 'baterias', marca: 'Apple', modelo: 'iPhone 12, iPhone 12 Pro', sku: 'BAT-IP12', proveedor: PROVEEDORES.iparts, costo: 280, precio: 900, min: 3, pedido: 6, ubicacion: 'Cajón B1', final: 4, match: { servicio: 'Cambio de batería', modelos: ['iPhone 12', 'iPhone 12 Pro'] } },
  { nombre: 'Batería iPhone 13', categoria: 'baterias', marca: 'Apple', modelo: 'iPhone 13', sku: 'BAT-IP13', proveedor: PROVEEDORES.iparts, costo: 320, precio: 1000, min: 3, pedido: 6, ubicacion: 'Cajón B1', final: 2, match: { servicio: 'Cambio de batería', modelos: ['iPhone 13'] } },
  { nombre: 'Batería Galaxy A15 / A25', categoria: 'baterias', marca: 'Samsung', modelo: 'Galaxy A15, Galaxy A25', sku: 'BAT-SA15', proveedor: PROVEEDORES.moviltec, costo: 230, precio: 650, min: 2, pedido: 5, ubicacion: 'Cajón B2', final: 5, match: { servicio: 'Cambio de batería', modelos: ['Galaxy A15', 'Galaxy A25'] } },
  { nombre: 'Batería Redmi Note 12 / 13', categoria: 'baterias', marca: 'Xiaomi', modelo: 'Redmi Note 12, Redmi Note 13', sku: 'BAT-RN12', proveedor: PROVEEDORES.moviltec, costo: 210, precio: 600, min: 2, pedido: 5, ubicacion: 'Cajón B2', final: 3, match: { servicio: 'Cambio de batería', modelos: ['Redmi Note 12', 'Redmi Note 13'] } },
  { nombre: 'Batería Moto G54 / G84', categoria: 'baterias', marca: 'Motorola', modelo: 'Moto G54, Moto G84', sku: 'BAT-MG54', proveedor: PROVEEDORES.centro, costo: 220, precio: 650, min: 2, pedido: 4, ubicacion: 'Cajón B2', final: 0, match: { servicio: 'Cambio de batería', modelos: ['Moto G54', 'Moto G84'] }, pedidoHaceDias: 1 },
  { nombre: 'Placa de carga Redmi Note 13', categoria: 'puertos', marca: 'Xiaomi', modelo: 'Redmi Note 13', sku: 'PUE-RN13', proveedor: PROVEEDORES.moviltec, costo: 120, precio: 550, min: 2, pedido: 5, ubicacion: 'Cajón C1', final: 4, match: { servicio: 'Puerto de carga', modelos: ['Redmi Note 13'] } },
  { nombre: 'Centro de carga USB-C (16 pines)', categoria: 'puertos', marca: 'Genérico', modelo: 'Android USB-C', sku: 'PUE-USBC-16', proveedor: PROVEEDORES.centro, costo: 18, precio: 450, min: 10, pedido: 30, ubicacion: 'Cajón C1', final: 25, match: { servicio: 'Puerto de carga', android: true } },
  { nombre: 'Flex de carga iPhone 12', categoria: 'puertos', marca: 'Apple', modelo: 'iPhone 12, iPhone 12 Pro', sku: 'PUE-IP12', proveedor: PROVEEDORES.iparts, costo: 260, precio: 850, min: 2, pedido: 4, ubicacion: 'Cajón C2', final: 2, match: { servicio: 'Puerto de carga', modelos: ['iPhone 12', 'iPhone 12 Pro'] } },
  { nombre: 'Flex de carga iPhone 11', categoria: 'puertos', marca: 'Apple', modelo: 'iPhone 11', sku: 'PUE-IP11', proveedor: PROVEEDORES.iparts, costo: 210, precio: 750, min: 2, pedido: 4, ubicacion: 'Cajón C2', final: 3, match: { servicio: 'Puerto de carga', modelos: ['iPhone 11'] } },
  { nombre: 'Cámara trasera iPhone 12', categoria: 'camaras', marca: 'Apple', modelo: 'iPhone 12', sku: 'CAM-IP12-T', proveedor: PROVEEDORES.iparts, costo: 650, precio: 1600, min: 1, pedido: 2, ubicacion: 'Cajón D1', final: 1, match: { servicio: 'Cámara', modelos: ['iPhone 12'] } },
  { nombre: 'Lente de cámara iPhone 13 / 14', categoria: 'camaras', marca: 'Apple', modelo: 'iPhone 13, iPhone 14', sku: 'CAM-LEN-IP13', proveedor: PROVEEDORES.iparts, costo: 45, precio: 450, min: 5, pedido: 10, ubicacion: 'Cajón D1', final: 12, match: { servicio: 'Cámara', modelos: ['iPhone 13', 'iPhone 14'] } },
  { nombre: 'Tapa trasera iPhone 13 (cristal)', categoria: 'carcasas', marca: 'Apple', modelo: 'iPhone 13', sku: 'TAP-IP13', proveedor: PROVEEDORES.iparts, costo: 210, precio: 1100, min: 2, pedido: 4, ubicacion: 'Cajón E1', final: 3, match: { servicio: 'Tapa trasera', modelos: ['iPhone 13'] } },
  { nombre: 'Tapa trasera Redmi Note 13', categoria: 'carcasas', marca: 'Xiaomi', modelo: 'Redmi Note 13', sku: 'TAP-RN13', proveedor: PROVEEDORES.moviltec, costo: 120, precio: 450, min: 2, pedido: 4, ubicacion: 'Cajón E1', final: 4, match: { servicio: 'Tapa trasera', modelos: ['Redmi Note 13'] } },
  { nombre: 'Altavoz inferior iPhone 11', categoria: 'otros', marca: 'Apple', modelo: 'iPhone 11', sku: 'ALT-IP11', proveedor: PROVEEDORES.iparts, costo: 95, precio: 600, min: 1, pedido: 3, ubicacion: 'Cajón E2', final: 2, match: { servicio: 'Altavoz / micrófono', modelos: ['iPhone 11'] } },
  { nombre: 'Pegamento B-7000 110 ml', categoria: 'herramientas', marca: '', modelo: '', sku: 'CON-B7000', proveedor: PROVEEDORES.express, costo: 65, precio: 0, min: 3, pedido: 6, ubicacion: 'Estante del banco', final: 6, consumoCada: 8 },
  { nombre: 'Alcohol isopropílico 1 L', categoria: 'otros', marca: '', modelo: '', sku: 'CON-ALC-1L', proveedor: PROVEEDORES.express, costo: 180, precio: 0, min: 2, pedido: 4, ubicacion: 'Estante del banco', final: 2, consumoCada: 11, reorden: true },
  { nombre: 'Cinta Kapton 10 mm', categoria: 'herramientas', marca: '', modelo: '', sku: 'CON-KAP-10', proveedor: PROVEEDORES.express, costo: 55, precio: 0, min: 2, pedido: 5, ubicacion: 'Estante del banco', final: 5, consumoCada: 13 },
  { nombre: 'Mica de cristal templado 9D', categoria: 'accesorios', marca: 'Genérico', modelo: 'Varios modelos', sku: 'ACC-MICA-9D', proveedor: PROVEEDORES.centro, costo: 15, precio: 150, min: 20, pedido: 50, ubicacion: 'Vitrina', final: 48, accesorio: { servicios: ['Cambio de pantalla', 'Otro'], p: 0.35 } },
  { nombre: 'Funda transparente antigolpe', categoria: 'accesorios', marca: 'Genérico', modelo: 'Varios modelos', sku: 'ACC-FUNDA-TR', proveedor: PROVEEDORES.centro, costo: 22, precio: 180, min: 10, pedido: 30, ubicacion: 'Vitrina', final: 30, accesorio: { servicios: null, p: 0.08 } },
  { nombre: 'Cable USB-C a Lightning 1 m', categoria: 'accesorios', marca: 'Genérico', modelo: 'iPhone', sku: 'ACC-CAB-LTG', proveedor: PROVEEDORES.centro, costo: 75, precio: 250, min: 5, pedido: 10, ubicacion: 'Vitrina', final: 7, accesorio: { servicios: ['Puerto de carga'], p: 0.25 } },
];

/* ------------------------------- Utilidades ------------------------------ */

function luhnImei(g: Gen, prefix: string): string {
  const body = (prefix + g.digits(14 - prefix.length)).slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

function phoneNumber(g: Gen): string {
  const area = g.weighted<string>([
    ['55', 60],
    ['56', 25],
    ['33', 5],
    ['81', 4],
    ['722', 6],
  ]);
  return area.length === 2 ? `${area} ${g.digits(4)} ${g.digits(4)}` : `${area} ${g.digits(3)} ${g.digits(4)}`;
}

function emailFor(g: Gen, nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(' ');
  const user = g.chance(0.5) ? `${base[0]}.${base[1]}` : `${base[0]}${base[1]?.slice(0, 3) ?? ''}${g.int(10, 99)}`;
  return `${user}@${g.weighted<string>([
    ['gmail.com', 70],
    ['hotmail.com', 20],
    ['outlook.com', 10],
  ])}`;
}

/* ------------------------------- Generador ------------------------------- */

interface Person {
  nombre: string;
  telefono: string;
  email: string;
}

interface Use {
  itemIdx: number;
  ts: Timestamp;
  qty: number;
  clienteId: string | null;
  clientName: string | null;
  nota: string;
}

interface DemoData {
  clients: Client[];
  expenses: Expense[];
  inventory: InventoryItem[];
  movements: InventoryMovement[];
  audit: AuditEntry[];
}

function partFor(g: Gen, servicio: string, marca: string, modelo: string, precio: number): { concepto: string; categoria: ExpenseCategory; costo: number; proveedor: string } | null {
  const apple = marca === 'Apple';
  const prov = apple ? (g.chance(0.8) ? PROVEEDORES.iparts : PROVEEDORES.express) : g.chance(0.55) ? PROVEEDORES.moviltec : g.chance(0.7) ? PROVEEDORES.centro : PROVEEDORES.express;
  const cost = (lo: number, hi: number) => round10(precio * g.between(lo, hi));
  switch (servicio) {
    case 'Cambio de pantalla': {
      let concepto: string;
      if (apple) concepto = /iPhone (11|XR|SE)/.test(modelo) && !/Pro/.test(modelo) ? `Pantalla LCD ${modelo}` : g.chance(0.6) ? `Pantalla OLED ${modelo}` : `Pantalla incell ${modelo}`;
      else if (marca === 'Samsung') concepto = /Galaxy S/.test(modelo) ? `Pantalla AMOLED ${modelo}` : `Pantalla ${modelo} con marco`;
      else concepto = `Display ${modelo}`;
      return { concepto, categoria: 'pantallas', costo: cost(0.42, 0.55), proveedor: prov };
    }
    case 'Cambio de batería':
      return { concepto: `Batería ${modelo}`, categoria: 'baterias', costo: cost(0.28, 0.38), proveedor: prov };
    case 'Puerto de carga':
      return { concepto: apple ? `Flex de carga ${modelo}` : `Placa de carga ${modelo}`, categoria: 'puertos', costo: cost(0.16, 0.3), proveedor: prov };
    case 'Cámara':
      return { concepto: g.chance(0.6) ? `Cámara trasera ${modelo}` : `Cámara frontal ${modelo}`, categoria: 'camaras', costo: cost(0.35, 0.5), proveedor: prov };
    case 'Tapa trasera':
      return { concepto: `Tapa trasera ${modelo}`, categoria: 'carcasas', costo: cost(0.2, 0.35), proveedor: prov };
    case 'Altavoz / micrófono':
      return { concepto: g.chance(0.5) ? `Altavoz inferior ${modelo}` : `Flex de micrófono ${modelo}`, categoria: 'otros', costo: cost(0.15, 0.25), proveedor: prov };
    case 'Botones':
      return { concepto: `Flex de encendido ${modelo}`, categoria: 'otros', costo: cost(0.15, 0.25), proveedor: prov };
    case 'Reparación de placa':
      return { concepto: apple ? `IC de carga ${modelo}` : `IC de potencia (PMIC) ${modelo}`, categoria: 'placas', costo: cost(0.12, 0.25), proveedor: PROVEEDORES.express };
    default:
      return null;
  }
}

function priceFor(g: Gen, servicio: string, marca: string, spec: ModelSpec): number {
  const apple = marca === 'Apple';
  const pantallaMid = (spec.pantalla[0] + spec.pantalla[1]) / 2;
  switch (servicio) {
    case 'Cambio de pantalla':
      return round50(g.between(spec.pantalla[0], spec.pantalla[1]));
    case 'Cambio de batería': {
      const r = spec.bateria ?? (spec.tier === 'premium' ? [900, 1100] : spec.tier === 'medio' ? [700, 1000] : [550, 800]);
      return round50(g.between(r[0], r[1]));
    }
    case 'Puerto de carga':
      return round50(apple ? g.between(650, 900) : g.between(450, 750));
    case 'Cámara':
      return round50(Math.min(2800, Math.max(600, pantallaMid * g.between(0.35, 0.5))));
    case 'Tapa trasera':
      return round50(apple ? Math.min(2200, Math.max(900, pantallaMid * 0.35)) : g.between(400, 900));
    case 'Equipo mojado':
      return round50(g.between(500, 1200));
    case 'Altavoz / micrófono':
      return round50(g.between(450, 900));
    case 'Botones':
      return round50(g.between(400, 800));
    case 'Software / desbloqueo':
      return round50(g.between(300, 600));
    case 'Reparación de placa':
      return round50(g.between(1200, 3500));
    case 'Diagnóstico':
      return round50(g.between(150, 300));
    default:
      return round50(g.between(250, 600));
  }
}

function warrantyFor(g: Gen, servicio: string): number {
  switch (servicio) {
    case 'Cambio de pantalla':
      return g.chance(0.2) ? 90 : 30;
    case 'Cambio de batería':
      return 90;
    case 'Puerto de carga':
    case 'Cámara':
    case 'Tapa trasera':
    case 'Altavoz / micrófono':
    case 'Botones':
    case 'Reparación de placa':
      return 30;
    case 'Software / desbloqueo':
      return g.chance(0.5) ? 15 : 0;
    default:
      return 0;
  }
}

function finalStatus(g: Gen, ageDays: number, quick: boolean): RepairStatus {
  const r = g.next();
  if (ageDays >= 7) return r < 0.03 ? 'cancelado' : r < 0.042 ? 'listo' : 'entregado';
  if (ageDays >= 3) return r < 0.03 ? 'cancelado' : r < 0.13 ? 'listo' : r < 0.2 ? 'reparando' : 'entregado';
  if (ageDays >= 1) return r < 0.02 ? 'cancelado' : r < 0.12 ? 'diagnostico' : r < 0.3 ? 'reparando' : r < 0.52 ? 'listo' : 'entregado';
  if (quick) return r < 0.5 ? 'entregado' : r < 0.7 ? 'listo' : 'reparando';
  return r < 0.35 ? 'recibido' : r < 0.6 ? 'diagnostico' : r < 0.85 ? 'reparando' : 'listo';
}

/** Lleva un instante al horario del taller (10:00–20:00). */
function toBusinessHours(g: Gen, ts: number): number {
  const d = new Date(ts);
  const h = d.getHours();
  if (h >= 20) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 10, g.int(0, 90));
    return next.getTime();
  }
  if (h < 10) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, g.int(0, 60)).getTime();
  return ts;
}

/** Último instante "de taller" (10:00–20:00) que no está en el futuro. */
export function lastBusinessMoment(now: Timestamp): Timestamp {
  const d = new Date(now);
  const h = d.getHours();
  if (h >= 10 && h < 20) return now - 2 * MIN;
  const day = h >= 20 ? d.getDate() : d.getDate() - 1;
  return new Date(d.getFullYear(), d.getMonth(), day, 19, 55).getTime();
}

function generate(now: Timestamp, deviceId: string): DemoData {
  const g = new Gen(mulberry32(0x5eed_2026));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayStart = (k: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - k).getTime();
  const at = (k: number, h: number, m: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - k, h, m).getTime();
  // Ningún evento en el futuro ni de madrugada: todo ocurre antes del último momento de taller.
  const latest = lastBusinessMoment(now);
  const clamp = (ts: number) => Math.min(ts, latest);

  const clients: Client[] = [];
  const expenses: Expense[] = [];
  const audit: AuditEntry[] = [];
  const uses: Use[] = [];
  const people: Person[] = [];
  const clientNames = new Map<string, string>();
  const itemNames = new Map<string, string>();

  const auditEntry = (e: Omit<AuditEntry, 'id' | 'deviceId' | 'changes' | 'snapshot'> & { changes?: FieldChange[]; snapshot?: AuditEntry['snapshot'] }) => {
    audit.push({ id: g.uuid(), deviceId, changes: [], snapshot: null, ...e });
  };

  const addExpense = (x: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deviceId' | 'rev' | 'totalCents'>, summary: string = SUMMARY.crearGasto): Expense => {
    const e: Expense = {
      ...x,
      totalCents: x.cantidad * x.costoUnitarioCents,
      id: g.uuid(),
      createdAt: x.fecha,
      updatedAt: x.fecha,
      deletedAt: null,
      deviceId,
      rev: 1,
    };
    expenses.push(e);
    const names: NameLookup = { clients: clientNames, items: itemNames };
    auditEntry({ ts: e.fecha, action: 'crear', entity: 'gasto', entityId: e.id, title: e.concepto, summary, changes: diffFields('gasto', null, e as unknown as Record<string, unknown>, names), snapshot: e });
    return e;
  };

  /* ------------------------- Artículos (ids primero) ------------------------ */
  const itemIds = ITEMS.map(() => g.uuid());
  ITEMS.forEach((it, i) => itemNames.set(itemIds[i], it.nombre));
  const matchItem = (servicio: string, marca: string, modelo: string): number => {
    let generic = -1;
    for (let i = 0; i < ITEMS.length; i++) {
      const m = ITEMS[i].match;
      if (!m || m.servicio !== servicio) continue;
      if (m.modelos?.includes(modelo)) return i;
      if (m.android && marca !== 'Apple') generic = i;
    }
    return generic;
  };

  /* -------------------------------- Clientes -------------------------------- */
  for (let k = DAYS_BACK; k >= 0; k--) {
    const dow = new Date(dayStart(k)).getDay();
    const count = dow === 0 ? g.int(0, 3) : dow === 6 ? g.int(4, 8) : g.int(3, 9);
    const [open, close] = dow === 0 ? [11, 15] : [10, 19];
    const times: number[] = [];
    for (let i = 0; i < count; i++) times.push(at(k, open, 0) + g.int(0, (close - open) * 60 + 30) * MIN);
    times.sort((a, b) => a - b);

    for (const fecha of times) {
      if (fecha > latest - 6 * MIN) continue;
      const age = k;

      // Persona (algunos clientes regresan)
      let person: Person;
      if (people.length > 20 && g.chance(0.12)) person = g.pick(people);
      else {
        const female = g.chance(0.5);
        const nombre = `${g.pick(female ? NOMBRES_F : NOMBRES_M)} ${g.pick(APELLIDOS)}${g.chance(0.3) ? ' ' + g.pick(APELLIDOS) : ''}`;
        person = { nombre, telefono: g.chance(0.96) ? phoneNumber(g) : '', email: '' };
        person.email = g.chance(0.3) ? emailFor(g, nombre) : '';
        people.push(person);
      }

      const marca = g.weighted(BRAND_WEIGHTS);
      const spec = g.weighted(MODELS[marca].map((m) => [m, m.w] as const));
      const modelo = spec.modelo;
      let servicio = g.weighted(SERVICE_WEIGHTS);
      if (servicio === 'Software / desbloqueo' && marca === 'Apple' && g.chance(0.5)) servicio = 'Cambio de batería';
      const quick = QUICK_SERVICES.has(servicio);
      const cobroPesos = priceFor(g, servicio, marca, spec);
      const cobroCents = pesos(cobroPesos);
      const estadoFinal = finalStatus(g, age, quick);
      const metodoPago = g.weighted<PaymentMethod>([
        ['efectivo', 55],
        ['transferencia', 30],
        ['tarjeta', 13],
        ['otro', 2],
      ]);

      // Desbloqueo
      let desbloqueoTipo: UnlockType = 'ninguno';
      let desbloqueoPatron: number[] = [];
      let desbloqueoCodigo = '';
      const ru = g.next();
      if (marca === 'Apple') {
        if (ru < 0.68) {
          desbloqueoTipo = 'pin';
          desbloqueoCodigo = g.digits(g.chance(0.8) ? 6 : 4);
        } else if (ru < 0.72) {
          desbloqueoTipo = 'contrasena';
          desbloqueoCodigo = g.pick(CONTRASENAS);
        }
      } else if (ru < 0.45) {
        desbloqueoTipo = 'patron';
        desbloqueoPatron = [...g.pick(PATRONES)];
      } else if (ru < 0.7) {
        desbloqueoTipo = 'pin';
        desbloqueoCodigo = g.digits(g.chance(0.6) ? 4 : 6);
      } else if (ru < 0.74) {
        desbloqueoTipo = 'contrasena';
        desbloqueoCodigo = g.pick(CONTRASENAS);
      }

      // Anticipo
      let anticipo = 0;
      if (estadoFinal !== 'cancelado') {
        if (!quick && cobroPesos >= 800 && g.chance(0.45)) anticipo = Math.min(cobroCents, pesos(Math.round((cobroPesos * g.between(0.3, 0.6)) / 100) * 100));
        else if (quick && g.chance(0.15)) anticipo = cobroCents;
      }

      const telefonoReal = person.telefono;
      const typo = telefonoReal && age >= 2 && g.chance(0.01);
      const id = g.uuid();
      const base: Client = {
        id,
        folio: 0,
        nombre: person.nombre,
        telefono: typo ? telefonoReal.slice(0, -2) + telefonoReal.slice(-1) + telefonoReal.slice(-2, -1) : telefonoReal,
        email: person.email,
        marca,
        modelo,
        imei: g.chance(0.6) ? luhnImei(g, marca === 'Apple' || marca === 'Samsung' ? '35' : '86') : '',
        servicio,
        falla: g.pick(FALLAS[servicio] ?? FALLAS.Otro),
        estado: 'recibido',
        cobroCents,
        pagadoCents: anticipo,
        metodoPago,
        fecha,
        fechaEntrega: null,
        garantiaDias: warrantyFor(g, servicio),
        desbloqueoTipo,
        desbloqueoPatron,
        desbloqueoCodigo,
        numFotos: 0,
        notas: g.chance(0.15) ? g.pick(NOTAS) : '',
        createdAt: fecha,
        updatedAt: fecha,
        deletedAt: null,
        deviceId,
        rev: 1,
      };
      clientNames.set(id, clientTitle(base));

      // Línea de tiempo de estados
      const repairDur = quick
        ? g.int(40, 180) * MIN
        : servicio === 'Reparación de placa' || servicio === 'Equipo mojado'
          ? g.int(20, 90) * HOUR
          : g.chance(0.55)
            ? g.int(2, 6) * HOUR
            : g.int(18, 50) * HOUR;
      const tListo = Math.max(fecha + 15 * MIN, toBusinessHours(g, fecha + repairDur));
      const pickupDelay = quick ? g.int(10, 120) * MIN : g.chance(0.6) ? g.int(1, 6) * HOUR : g.int(18, 72) * HOUR;
      const tEntrega = Math.max(tListo + 5 * MIN, toBusinessHours(g, tListo + pickupDelay));

      const events: { ts: number; patch: Partial<Client> }[] = [];
      if (typo) events.push({ ts: fecha + g.int(20, 90) * MIN, patch: { telefono: telefonoReal } });
      const recent = age <= 7;
      switch (estadoFinal) {
        case 'recibido':
          break;
        case 'diagnostico':
          events.push({ ts: fecha + g.int(15, 90) * MIN, patch: { estado: 'diagnostico' } });
          break;
        case 'reparando':
          if (recent && !quick && g.chance(0.6)) events.push({ ts: fecha + g.int(10, 40) * MIN, patch: { estado: 'diagnostico' } });
          events.push({ ts: fecha + g.int(45, 150) * MIN, patch: { estado: 'reparando' } });
          break;
        case 'listo':
          if (recent && g.chance(0.6)) events.push({ ts: fecha + Math.round((tListo - fecha) * 0.3), patch: { estado: 'reparando' } });
          events.push({ ts: tListo, patch: { estado: 'listo' } });
          break;
        case 'entregado': {
          if (recent && !quick && g.chance(0.5)) events.push({ ts: fecha + Math.round((tListo - fecha) * 0.3), patch: { estado: 'reparando' } });
          if (!(quick && g.chance(0.5))) events.push({ ts: tListo, patch: { estado: 'listo' } });
          const rp = g.next();
          let pagado = cobroCents;
          if (age <= 30 ? rp < 0.05 : rp < 0.01) pagado = Math.max(anticipo, Math.min(cobroCents, pesos(Math.round((cobroPesos * 0.5) / 50) * 50)));
          else if (age <= 30 && rp < 0.065) pagado = anticipo;
          events.push({ ts: tEntrega, patch: { estado: 'entregado', fechaEntrega: tEntrega, pagadoCents: pagado } });
          break;
        }
        case 'cancelado':
          events.push({
            ts: toBusinessHours(g, fecha + g.int(2, 30) * HOUR),
            patch: { estado: 'cancelado', notas: base.notas ? `${base.notas}. No aceptó el presupuesto` : 'No aceptó el presupuesto' },
          });
          break;
      }

      auditEntry({
        ts: fecha,
        action: 'crear',
        entity: 'cliente',
        entityId: id,
        title: clientTitle(base),
        summary: SUMMARY.crearCliente,
        changes: diffFields('cliente', null, base as unknown as Record<string, unknown>),
        snapshot: sanitizeClient(base),
      });

      let current = base;
      let lastTs = fecha;
      const applied: typeof events = [];
      events.sort((a, b) => a.ts - b.ts);
      for (const ev of events) {
        const ts = Math.max(ev.ts, lastTs + MIN);
        // Lo que aún no ocurre (sería futuro) se queda pendiente: el equipo sigue en su estado anterior.
        if (ts > latest) break;
        applied.push({ ts, patch: ev.patch });
        const patch = { ...ev.patch };
        if (patch.fechaEntrega != null) patch.fechaEntrega = ts;
        const next: Client = { ...current, ...patch, updatedAt: ts, rev: current.rev + 1 };
        const changes = diffFields('cliente', current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, {}, { ignore: ['folio', 'numFotos'] });
        if (changes.length) {
          auditEntry({ ts, action: 'editar', entity: 'cliente', entityId: id, title: clientTitle(next), summary: summarizeClientEdit(changes, next), changes, snapshot: sanitizeClient(next) });
          current = next;
        }
        lastTs = ts;
      }
      clients.push(current);
      const listoAt = applied.find((e) => e.patch.estado === 'listo')?.ts ?? current.fechaEntrega ?? null;

      // Piezas: inventario o compra directa ligada al cliente
      const repaired = current.estado === 'reparando' || current.estado === 'listo' || current.estado === 'entregado';
      if (repaired) {
        const partTs = clamp(Math.min(fecha + g.int(20, 150) * MIN, (listoAt ?? latest) - 5 * MIN));
        const idx = matchItem(servicio, marca, modelo);
        const part = partFor(g, servicio, marca, modelo, cobroPesos);
        if (idx >= 0 && g.chance(0.55)) {
          uses.push({ itemIdx: idx, ts: Math.max(fecha + MIN, partTs), qty: 1, clienteId: id, clientName: current.nombre, nota: '' });
        } else if (part && g.chance(0.82)) {
          addExpense({
            concepto: part.concepto,
            categoria: part.categoria,
            proveedor: part.proveedor,
            cantidad: 1,
            costoUnitarioCents: pesos(part.costo),
            clienteId: id,
            inventarioId: null,
            metodoPago: g.chance(0.6) ? 'efectivo' : 'transferencia',
            fecha: Math.max(fecha + MIN, partTs),
            notas: '',
          });
        }
      }
      // Accesorios al entregar
      if (current.estado === 'entregado' && current.fechaEntrega) {
        ITEMS.forEach((it, idx) => {
          if (!it.accesorio) return;
          if (it.accesorio.servicios && !it.accesorio.servicios.includes(servicio)) return;
          if (it.nombre.includes('Lightning') && marca !== 'Apple') return;
          if (g.chance(it.accesorio.p)) {
            uses.push({ itemIdx: idx, ts: current.fechaEntrega! - g.int(2, 15) * MIN, qty: 1, clienteId: id, clientName: current.nombre, nota: 'Instalada al entregar' });
          }
        });
      }
    }
  }

  /* ------------------------ Consumibles del taller ------------------------ */
  ITEMS.forEach((it, idx) => {
    if (!it.consumoCada) return;
    for (let k = DAYS_BACK - g.int(2, it.consumoCada); k >= 1; k -= it.consumoCada + g.int(-2, 2)) {
      uses.push({ itemIdx: idx, ts: at(k, g.int(11, 18), g.int(0, 59)), qty: 1, clienteId: null, clientName: null, nota: 'Consumo del taller' });
    }
  });

  /* --------------- Inventario: simulación hacia atrás del stock --------------- */
  const inventory: InventoryItem[] = [];
  const movements: InventoryMovement[] = [];
  const itemCreated = at(DAYS_BACK, 9, 10);
  ITEMS.forEach((it, idx) => {
    const id = itemIds[idx];
    const costoCents = pesos(it.costo);
    const itemUses = uses.filter((u) => u.itemIdx === idx && u.ts > itemCreated).sort((a, b) => b.ts - a.ts);
    const cap = it.min + it.pedido + 1;
    const mvs: InventoryMovement[] = [];
    const restocks: { ts: number; qty: number; before: number }[] = [];
    let s = it.final;
    for (let i = 0; i < itemUses.length; i++) {
      const u = itemUses[i];
      const after = s;
      const before = s + u.qty;
      mvs.push({ id: g.uuid(), itemId: id, type: 'uso', cantidad: -u.qty, stockAntes: before, stockDespues: after, costoUnitarioCents: costoCents, clienteId: u.clienteId, gastoId: null, nota: u.nota, ts: u.ts, deviceId });
      s = before;
      const earlier = itemUses[i + 1]?.ts ?? itemCreated;
      if (s > cap && u.ts - earlier > 30 * MIN) {
        const low = g.int(0, Math.max(0, it.min - 1));
        const qty = s - low;
        const gap = u.ts - earlier;
        let ts = u.ts - Math.round(gap * g.between(0.2, 0.7));
        const d = new Date(ts);
        const morning = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, g.int(0, 90)).getTime();
        if (morning > earlier && morning < u.ts) ts = morning;
        restocks.push({ ts, qty, before: low });
        s = low;
      }
    }
    // Stock inicial
    const initialQty = s;

    const item: InventoryItem = {
      id,
      nombre: it.nombre,
      categoria: it.categoria,
      marca: it.marca,
      modelo: it.modelo,
      sku: it.sku,
      proveedor: it.proveedor,
      stock: initialQty,
      stockMinimo: it.min,
      cantidadPedido: it.pedido,
      costoUnitarioCents: costoCents,
      precioVentaCents: pesos(it.precio),
      ubicacion: it.ubicacion,
      marcadoReorden: false,
      pedidoAt: null,
      notas: '',
      createdAt: itemCreated + idx * 1000,
      updatedAt: itemCreated + idx * 1000,
      deletedAt: null,
      deviceId,
      rev: 1,
    };
    auditEntry({ ts: item.createdAt, action: 'crear', entity: 'inventario', entityId: id, title: item.nombre, summary: SUMMARY.crearInventario, changes: diffFields('inventario', null, item as unknown as Record<string, unknown>), snapshot: { ...item } });
    if (initialQty > 0) {
      const e = addExpense(
        { concepto: it.nombre, categoria: it.categoria, proveedor: it.proveedor, cantidad: initialQty, costoUnitarioCents: costoCents, clienteId: null, inventarioId: id, metodoPago: 'transferencia', fecha: item.createdAt, notas: 'Compra inicial de inventario' },
        `Registró la compra de ${plural(initialQty, 'unidad', 'unidades')}`,
      );
      movements.push({ id: g.uuid(), itemId: id, type: 'entrada', cantidad: initialQty, stockAntes: 0, stockDespues: initialQty, costoUnitarioCents: costoCents, clienteId: null, gastoId: e.id, nota: 'Stock inicial', ts: item.createdAt, deviceId });
    }

    // Eventos en orden cronológico: usos y reposiciones
    type Ev = { ts: number; kind: 'uso'; mv: InventoryMovement } | { ts: number; kind: 'entrada'; qty: number; before: number };
    const timeline: Ev[] = [
      ...mvs.map((mv) => ({ ts: mv.ts, kind: 'uso' as const, mv })),
      ...restocks.map((r) => ({ ts: r.ts, kind: 'entrada' as const, qty: r.qty, before: r.before })),
    ].sort((a, b) => a.ts - b.ts);
    let rev = 1;
    let stock = initialQty;
    let last = item.createdAt;
    for (const ev of timeline) {
      rev += 1;
      last = Math.max(last, ev.ts);
      if (ev.kind === 'uso') {
        movements.push(ev.mv);
        auditEntry({ ts: ev.ts, action: 'movimiento', entity: 'inventario', entityId: id, title: it.nombre, summary: summarizeUse(-ev.mv.cantidad, ev.mv.clienteId ? (clients.find((c) => c.id === ev.mv.clienteId)?.nombre ?? null) : null), changes: [stockChange(ev.mv.stockAntes, ev.mv.stockDespues)], snapshot: null });
        stock = ev.mv.stockDespues;
      } else {
        const e = addExpense(
          { concepto: it.nombre, categoria: it.categoria, proveedor: it.proveedor, cantidad: ev.qty, costoUnitarioCents: costoCents, clienteId: null, inventarioId: id, metodoPago: g.chance(0.7) ? 'transferencia' : 'efectivo', fecha: ev.ts, notas: '' },
          `Registró la compra de ${plural(ev.qty, 'unidad', 'unidades')}`,
        );
        movements.push({ id: g.uuid(), itemId: id, type: 'entrada', cantidad: ev.qty, stockAntes: ev.before, stockDespues: ev.before + ev.qty, costoUnitarioCents: costoCents, clienteId: null, gastoId: e.id, nota: '', ts: ev.ts, deviceId });
        auditEntry({ ts: ev.ts, action: 'movimiento', entity: 'inventario', entityId: id, title: it.nombre, summary: summarizeRestock(ev.qty), changes: [stockChange(ev.before, ev.before + ev.qty)], snapshot: null });
        stock = ev.before + ev.qty;
      }
    }
    item.stock = stock;
    if (it.pedidoHaceDias) {
      const ts = at(it.pedidoHaceDias, 10, g.int(5, 55));
      item.pedidoAt = ts;
      rev += 1;
      last = Math.max(last, ts);
      auditEntry({ ts, action: 'editar', entity: 'inventario', entityId: id, title: it.nombre, summary: SUMMARY.pedido, changes: diffFields('inventario', { pedidoAt: null }, { pedidoAt: ts }) });
    }
    if (it.reorden) {
      const ts = clamp(at(1, 18, g.int(0, 40)));
      item.marcadoReorden = true;
      rev += 1;
      last = Math.max(last, ts);
      auditEntry({ ts, action: 'editar', entity: 'inventario', entityId: id, title: it.nombre, summary: SUMMARY.reorden, changes: diffFields('inventario', { marcadoReorden: false }, { marcadoReorden: true }) });
    }
    item.rev = rev;
    item.updatedAt = last;
    inventory.push(item);
  });

  /* ---------------------- Gastos fijos y herramientas ---------------------- */
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  for (let k = DAYS_BACK; k >= 0; k--) {
    const d = new Date(dayStart(k));
    const fixed = (h: number, m: number) => at(k, h, m);
    if (d.getDate() === 1 && fixed(9, 20) < latest) {
      addExpense({ concepto: `Renta del local — ${MESES[d.getMonth()]}`, categoria: 'otros', proveedor: 'Inmobiliaria Plaza Juárez', cantidad: 1, costoUnitarioCents: pesos(9500), clienteId: null, inventarioId: null, metodoPago: 'transferencia', fecha: fixed(9, 20), notas: '' });
    }
    if (d.getDate() === 5 && fixed(12, 10) < latest) {
      addExpense({ concepto: 'Internet del local (fibra 200 Mbps)', categoria: 'otros', proveedor: '', cantidad: 1, costoUnitarioCents: pesos(549), clienteId: null, inventarioId: null, metodoPago: 'tarjeta', fecha: fixed(12, 10), notas: '' });
    }
    if (d.getDate() === 12 && d.getMonth() % 2 === 0 && fixed(13, 30) < latest) {
      addExpense({ concepto: 'Recibo de luz (bimestral)', categoria: 'otros', proveedor: '', cantidad: 1, costoUnitarioCents: pesos(1180), clienteId: null, inventarioId: null, metodoPago: 'efectivo', fecha: fixed(13, 30), notas: '' });
    }
  }
  const tools: [number, string, number, string][] = [
    [76, 'Estación de calor y cautín 2 en 1', 1850, 'Reemplazo de la estación anterior'],
    [61, 'Kit de destornilladores de precisión 120 en 1', 420, ''],
    [47, 'Separador de pantallas LCD con ventosa', 980, ''],
    [33, 'Puntas de cautín T12 (juego de 5)', 350, ''],
    [19, 'Tapete antiestático de silicón', 290, ''],
    [6, 'Multímetro digital', 460, ''],
  ];
  for (const [k, concepto, precio, notas] of tools) {
    addExpense({ concepto, categoria: 'herramientas', proveedor: PROVEEDORES.express, cantidad: 1, costoUnitarioCents: pesos(precio), clienteId: null, inventarioId: null, metodoPago: 'tarjeta', fecha: at(k, 12, g.int(0, 59)), notas });
  }

  /* -------------------------------- Papelera ------------------------------- */
  // Dos registros duplicados de clientes, un gasto capturado dos veces y un artículo descontinuado.
  const candidates = clients.filter((c) => c.estado === 'entregado' && c.fecha < now - 10 * DAY && c.fecha > now - 40 * DAY);
  for (const orig of [candidates[3], candidates[Math.floor(candidates.length / 2)]].filter(Boolean)) {
    const ts = orig.createdAt + g.int(2, 6) * MIN;
    const dup: Client = { ...orig, id: g.uuid(), estado: 'recibido', pagadoCents: 0, fechaEntrega: null, fecha: ts, createdAt: ts, updatedAt: ts, rev: 1, deletedAt: null };
    auditEntry({ ts, action: 'crear', entity: 'cliente', entityId: dup.id, title: clientTitle(dup), summary: SUMMARY.crearCliente, changes: diffFields('cliente', null, dup as unknown as Record<string, unknown>), snapshot: sanitizeClient(dup) });
    const del = ts + g.int(3, 12) * MIN;
    auditEntry({ ts: del, action: 'eliminar', entity: 'cliente', entityId: dup.id, title: clientTitle(dup), summary: SUMMARY.eliminar, snapshot: sanitizeClient(dup) });
    clients.push({ ...dup, deletedAt: del, updatedAt: del, rev: 2, notas: 'Registro duplicado' });
  }
  const dupSource = expenses.find((e) => e.clienteId && e.fecha > now - 6 * DAY);
  if (dupSource) {
    const ts = dupSource.fecha + 4 * MIN;
    const dup = addExpense({ concepto: dupSource.concepto, categoria: dupSource.categoria, proveedor: dupSource.proveedor, cantidad: 1, costoUnitarioCents: dupSource.costoUnitarioCents, clienteId: dupSource.clienteId, inventarioId: null, metodoPago: dupSource.metodoPago, fecha: ts, notas: '' });
    const del = ts + 7 * MIN;
    Object.assign(dup, { deletedAt: del, updatedAt: del, rev: 2 });
    auditEntry({ ts: del, action: 'eliminar', entity: 'gasto', entityId: dup.id, title: dup.concepto, summary: SUMMARY.eliminar, snapshot: { ...dup, deletedAt: null, updatedAt: ts, rev: 1 } });
  }
  {
    const created = itemCreated + ITEMS.length * 1000;
    const del = at(41, 17, 25);
    const old: InventoryItem = {
      id: g.uuid(), nombre: 'Funda iPhone 8 Plus transparente', categoria: 'accesorios', marca: 'Apple', modelo: 'iPhone 8 Plus', sku: 'ACC-FUN-IP8P', proveedor: PROVEEDORES.centro,
      stock: 2, stockMinimo: 0, cantidadPedido: 0, costoUnitarioCents: pesos(20), precioVentaCents: pesos(120), ubicacion: 'Bodega', marcadoReorden: false, pedidoAt: null,
      notas: 'Modelo descontinuado', createdAt: created, updatedAt: created, deletedAt: null, deviceId, rev: 1,
    };
    auditEntry({ ts: created, action: 'crear', entity: 'inventario', entityId: old.id, title: old.nombre, summary: SUMMARY.crearInventario, changes: diffFields('inventario', null, old as unknown as Record<string, unknown>), snapshot: { ...old } });
    auditEntry({ ts: del, action: 'eliminar', entity: 'inventario', entityId: old.id, title: old.nombre, summary: SUMMARY.eliminar, snapshot: { ...old } });
    inventory.push({ ...old, deletedAt: del, updatedAt: del, rev: 2 });
  }

  /* ------------------------------- Folios ---------------------------------- */
  [...clients].sort((a, b) => a.createdAt - b.createdAt).forEach((c, i) => {
    c.folio = i + 1;
  });
  // La auditoría guarda la copia con folio para las altas.
  const folioById = new Map(clients.map((c) => [c.id, c.folio]));
  for (const a of audit) {
    if (a.entity !== 'cliente' || !a.entityId || !a.snapshot) continue;
    const folio = folioById.get(a.entityId);
    if (folio) (a.snapshot as Client).folio = folio;
    if (a.action === 'crear' && folio) {
      const ch = a.changes.find((x) => x.field === 'folio');
      if (ch) {
        ch.to = folio;
        ch.toText = String(folio);
      }
    }
  }

  return { clients, expenses, inventory, movements, audit };
}

/* ---------------------------- Notificaciones ----------------------------- */

function pickDrafts(drafts: NotificationDraft[], anchor: Timestamp, extra: NotificationDraft | null, resumenTs: Timestamp): AppNotification[] {
  const take = (pred: (d: NotificationDraft) => boolean) => drafts.find(pred) ?? null;
  const chosen: { d: NotificationDraft | null; ago: number; read: boolean }[] = [
    { d: take((d) => d.kind === 'stock_bajo' && d.title.startsWith('Se agotó')), ago: 3 * HOUR, read: false },
    { d: take((d) => d.kind === 'listo_sin_entregar'), ago: 5 * HOUR + 12 * MIN, read: false },
    { d: take((d) => d.kind === 'garantia'), ago: 7 * HOUR, read: false },
    { d: take((d) => d.kind === 'stock_bajo' && d.title.startsWith('Stock bajo')), ago: 26 * HOUR, read: false },
    { d: extra, ago: anchor - resumenTs, read: true },
    { d: take((d) => d.kind === 'pago_pendiente'), ago: 2 * DAY + 3 * HOUR, read: true },
    { d: take((d) => d.kind === 'respaldo'), ago: 3 * DAY + 2 * HOUR, read: true },
  ];
  const out: AppNotification[] = [];
  let i = 0;
  for (const c of chosen) {
    if (!c.d) continue;
    const ts = anchor - c.ago;
    out.push({ ...c.d, id: `demo-notif-${++i}`, ts, readAt: c.read ? Math.min(anchor, ts + 40 * MIN) : null });
  }
  return out.slice(0, 6);
}

/**
 * Borra los datos (conserva ajustes y deviceId) y carga ~90 días de datos
 * realistas relativos a hoy, en una sola transacción.
 */
export async function seedDemoData(): Promise<void> {
  await dbReady();
  const now = Date.now();
  const data = generate(now, getDeviceId());
  const maxFolio = data.clients.reduce((m, c) => Math.max(m, c.folio), 0);

  await db.transaction(
    'rw',
    [db.clients, db.expenses, db.inventory, db.movements, db.audit, db.notifications, db.meta, db.photos, db.settings],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.expenses.clear(),
        db.inventory.clear(),
        db.movements.clear(),
        db.audit.clear(),
        db.notifications.clear(),
        db.photos.clear(),
      ]);
      await db.meta.where('key').notEqual(META_DEVICE_ID).delete();
      await db.clients.bulkAdd(data.clients);
      await db.expenses.bulkAdd(data.expenses);
      await db.inventory.bulkAdd(data.inventory);
      await db.movements.bulkAdd(data.movements);
      await db.audit.bulkAdd(data.audit);
      await db.meta.put({ key: META_FOLIO_SEQ, value: maxFolio });

      // Notificaciones coherentes con los datos y registro de alertas ya vistas
      // (para que la primera revisión tras cargar la demo no genere una avalancha).
      const drafts = await previewNotificationDrafts(now);
      const yesterday = dayRange(now - DAY);
      const ySummary = computeSummary(yesterday, data.clients, data.expenses);
      const yDraft = dailySummaryDraft(yesterday.start, ySummary);
      const anchor = lastBusinessMoment(now);
      const notifs = pickDrafts(drafts, anchor, yDraft, Math.min(anchor - HOUR, yesterday.start + 20 * HOUR + MIN));
      await db.notifications.bulkAdd(notifs.sort((a, b) => a.ts - b.ts));
      const ledger: Record<string, number> = {};
      for (const d of drafts) ledger[d.dedupeKey] = now;
      for (const n of notifs) ledger[n.dedupeKey] = n.ts;
      await db.meta.put({ key: META_NOTIFIED, value: ledger });
    },
  );
}
