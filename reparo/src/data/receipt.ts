/* Recibo de servicio en texto (estilo ticket) para compartir por WhatsApp.
   Usa *negritas* de WhatsApp y emojis sobrios. Nunca incluye datos de desbloqueo. */
import type { Client, Settings } from './types';
import { PAYMENT_METHOD_LABEL, REPAIR_STATUS_LABEL } from './types';
import { formatDate, formatDateTime, formatFolio, formatMoney } from './format';
import { deviceFullName, paymentStatus, saldoCents, warrantyExpiresAt } from './derive';
import { PAYMENT_STATUS_LABEL } from './types';
import { plural } from './util';

const SEPARATOR = '────────────────';

/** Escapa los marcadores de formato de WhatsApp en textos capturados por el usuario. */
function clean(text: string): string {
  return String(text ?? '')
    .replace(/[*_~`]/g, (m) => (m === '*' ? '∗' : m === '_' ? 'ˍ' : m === '~' ? '∼' : 'ˋ'))
    .replace(/\s+/g, ' ')
    .trim();
}

function line(label: string, value: string): string {
  return `*${label}:* ${value}`;
}

export function buildReceiptText(
  c: Client,
  s: Settings,
  o: { piezas?: { nombre: string; cantidad: number }[] } = {},
): string {
  const money = (cents: number) => formatMoney(cents, { currency: s.currency, locale: s.locale });
  const out: string[] = [];

  // Encabezado del negocio
  out.push(`*${clean(s.businessName) || 'Servicio técnico'}*`);
  if (s.businessPhone.trim()) out.push(`📞 ${clean(s.businessPhone)}`);
  if (s.businessAddress.trim()) out.push(`📍 ${clean(s.businessAddress)}`);
  out.push(SEPARATOR);

  out.push(`🧾 *Recibo de servicio ${formatFolio(c.folio)}*`);
  out.push(`🗓️ ${formatDateTime(c.fecha)}`);
  out.push('');

  // Cliente y equipo
  out.push(line('Cliente', clean(c.nombre) || '—'));
  if (c.telefono.trim()) out.push(line('Teléfono', clean(c.telefono)));
  const equipo = deviceFullName(c);
  out.push(line('Equipo', clean(equipo) || '—'));
  if (c.imei.trim()) out.push(line('IMEI / serie', clean(c.imei)));
  out.push(line('Servicio', clean(c.servicio) || '—'));
  if (c.falla.trim()) out.push(line('Falla', clean(c.falla)));
  out.push(line('Estado', REPAIR_STATUS_LABEL[c.estado] ?? c.estado));
  if (c.fechaEntrega) out.push(line('Entregado', formatDateTime(c.fechaEntrega)));

  const piezas = (o.piezas ?? []).filter((p) => p && p.nombre && p.cantidad > 0);
  if (piezas.length) {
    out.push('');
    out.push('🔧 *Piezas utilizadas*');
    for (const p of piezas) out.push(`• ${p.cantidad} × ${clean(p.nombre)}`);
  }

  // Importes
  out.push(SEPARATOR);
  const saldo = saldoCents(c);
  out.push(`💰 ${line('Total', money(c.cobroCents))}`);
  out.push(`✅ ${line('Abonado', money(c.pagadoCents))}`);
  out.push(
    saldo > 0
      ? `⏳ ${line('Saldo pendiente', money(saldo))}`
      : `✔️ ${line('Saldo', `${money(0)} · ${PAYMENT_STATUS_LABEL[paymentStatus(c)]}`)}`,
  );
  if (c.pagadoCents > 0) out.push(line('Método de pago', PAYMENT_METHOD_LABEL[c.metodoPago] ?? c.metodoPago));

  // Garantía
  if (c.garantiaDias > 0) {
    const expires = warrantyExpiresAt(c);
    const days = plural(c.garantiaDias, 'día', 'días');
    out.push(
      `🛡️ ${line('Garantía', expires ? `${days} (vence el ${formatDate(expires)})` : `${days} a partir de la entrega`)}`,
    );
  } else {
    out.push(`🛡️ ${line('Garantía', 'Sin garantía')}`);
  }

  if (s.receiptFooter.trim()) {
    out.push(SEPARATOR);
    out.push(`_${clean(s.receiptFooter)}_`);
  }
  return out.join('\n');
}

/**
 * Teléfono → sólo dígitos con código de país (formato de wa.me).
 * "55 1234 5678" + "52" → "525512345678"; "+57 300…" → "57300…"; "" → "".
 */
export function normalizePhoneForWhatsApp(phone: string, countryCode: string): string {
  const raw = String(phone ?? '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  const cc = String(countryCode ?? '').replace(/\D/g, '');
  // Ya trae el código de país (número más largo que uno local de 10 dígitos).
  if (cc && digits.startsWith(cc) && digits.length > 10) return digits;
  digits = digits.replace(/^0+/, '');
  return cc + digits;
}

/** Enlace de WhatsApp con el texto prellenado. Sin teléfono: https://wa.me/?text=… (elige el contacto). */
export function whatsappUrl(phone: string, text: string, countryCode: string): string {
  const num = normalizePhoneForWhatsApp(phone, countryCode);
  const q = `text=${encodeURIComponent(text)}`;
  return num ? `https://wa.me/${num}?${q}` : `https://wa.me/?${q}`;
}
