/* Modelo estructurado del recibo: una sola fuente para la vista previa (React),
   la imagen PNG (canvas) y la impresión (HTML 80 mm). Nunca incluye el desbloqueo. */
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  REPAIR_STATUS_LABEL,
  deviceFullName,
  formatDate,
  formatDateTime,
  formatFolio,
  formatMoney,
  paymentStatus,
  saldoCents,
  warrantyExpiresAt,
  type Client,
  type PaymentStatus,
  type Settings,
} from '@/data';

export interface ReceiptPiece {
  nombre: string;
  cantidad: number;
}

export interface ReceiptRow {
  label: string;
  value: string;
  /** Valor en tipografía mono (IMEI, montos). */
  mono?: boolean;
  /** Ocupa el ancho completo con el valor debajo (textos largos). */
  block?: boolean;
}

export interface ReceiptModel {
  business: { name: string; phone: string; address: string };
  folio: string;
  dateText: string;
  client: ReceiptRow[];
  device: ReceiptRow[];
  piezas: ReceiptPiece[];
  totals: { total: string; abonado: string; saldo: string; saldoCents: number; status: PaymentStatus; statusLabel: string };
  metodo: string | null;
  garantia: string;
  footer: string;
  missingBusiness: { phone: boolean; address: boolean };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildReceiptModel(c: Client, s: Settings, piezas: ReceiptPiece[] = []): ReceiptModel {
  const money = (cents: number) => formatMoney(cents, { currency: s.currency, locale: s.locale });
  const client: ReceiptRow[] = [{ label: 'Cliente', value: c.nombre.trim() || '—' }];
  if (c.telefono.trim()) client.push({ label: 'Teléfono', value: c.telefono.trim(), mono: true });

  const device: ReceiptRow[] = [{ label: 'Equipo', value: deviceFullName(c) || '—' }];
  if (c.imei.trim()) device.push({ label: 'IMEI / serie', value: c.imei.trim(), mono: true });
  device.push({ label: 'Servicio', value: c.servicio.trim() || '—' });
  if (c.falla.trim()) device.push({ label: 'Falla', value: c.falla.trim(), block: true });
  device.push({ label: 'Estado', value: REPAIR_STATUS_LABEL[c.estado] ?? c.estado });
  if (c.fechaEntrega) device.push({ label: 'Entregado', value: formatDateTime(c.fechaEntrega) });

  const saldo = saldoCents(c);
  const status = paymentStatus(c);

  let garantia = 'Sin garantía';
  if (c.garantiaDias > 0) {
    const exp = warrantyExpiresAt(c);
    const days = plural(c.garantiaDias, 'día', 'días');
    garantia = exp ? `${days} · vence el ${formatDate(exp)}` : `${days} a partir de la entrega`;
  }

  return {
    business: {
      name: s.businessName.trim() || 'Servicio técnico',
      phone: s.businessPhone.trim(),
      address: s.businessAddress.trim(),
    },
    folio: formatFolio(c.folio),
    dateText: formatDateTime(c.fecha),
    client,
    device,
    piezas: piezas.filter((p) => p.nombre && p.cantidad > 0),
    totals: {
      total: money(c.cobroCents),
      abonado: money(c.pagadoCents),
      saldo: money(saldo),
      saldoCents: saldo,
      status,
      statusLabel: PAYMENT_STATUS_LABEL[status],
    },
    metodo: c.pagadoCents > 0 ? PAYMENT_METHOD_LABEL[c.metodoPago] ?? c.metodoPago : null,
    garantia,
    footer: s.receiptFooter.trim(),
    missingBusiness: { phone: !s.businessPhone.trim(), address: !s.businessAddress.trim() },
  };
}

/** Paleta del papel del ticket. Fija a propósito: la vista previa debe verse igual
    que el PNG que recibe el cliente (siempre papel claro), sin importar el tema. */
export const PAPER = {
  backdrop: '#eceef3',
  paper: '#ffffff',
  ink: '#11141b',
  ink2: '#4a5162',
  ink3: '#8a90a0',
  rule: '#d5d9e1',
  income: '#0f9f76',
  pending: '#b97c06',
  chip: '#f2f3f7',
} as const;

/** Variables CSS para la vista previa (se aplican inline sobre el ticket). */
export function paperCssVars(): Record<string, string> {
  return {
    '--paper-bg': PAPER.paper,
    '--paper-ink': PAPER.ink,
    '--paper-ink-2': PAPER.ink2,
    '--paper-ink-3': PAPER.ink3,
    '--paper-rule': PAPER.rule,
    '--paper-income': PAPER.income,
    '--paper-pending': PAPER.pending,
    '--paper-chip': PAPER.chip,
  };
}

export function receiptFilename(c: Pick<Client, 'folio'>): string {
  return `recibo-${formatFolio(c.folio).replace('#', '')}.png`;
}
