import { describe, expect, it } from 'vitest';
import { buildReceiptText, normalizePhoneForWhatsApp, whatsappUrl } from '../receipt';
import { defaultSettings } from '../defaults';
import type { Client } from '../types';

const client: Client = {
  id: 'c1', folio: 123, nombre: 'Ana López', telefono: '55 1234 5678', email: '', marca: 'Apple', modelo: 'iPhone 13',
  imei: '356789012345678', servicio: 'Cambio de pantalla', falla: 'Pantalla estrellada tras caída', estado: 'entregado',
  cobroCents: 280_000, pagadoCents: 100_000, metodoPago: 'transferencia', fecha: new Date(2026, 10, 7, 14, 32).getTime(),
  fechaEntrega: new Date(2026, 10, 8, 11, 5).getTime(), garantiaDias: 30, desbloqueoTipo: 'pin', desbloqueoPatron: [],
  desbloqueoCodigo: '482913', numFotos: 0, notas: '', createdAt: 0, updatedAt: 0, deletedAt: null, deviceId: 'x', rev: 1,
};
const settings = { ...defaultSettings(), businessName: 'CelFix Centro', businessPhone: '55 9876 5432', businessAddress: 'Av. Juárez 120, Centro' };

describe('buildReceiptText', () => {
  const text = buildReceiptText(client, settings, { piezas: [{ nombre: 'Pantalla OLED iPhone 13', cantidad: 1 }] });

  it('incluye negocio, folio, fecha, equipo e importes con negritas de WhatsApp', () => {
    expect(text.split('\n')[0]).toBe('*CelFix Centro*');
    expect(text).toContain('55 9876 5432');
    expect(text).toContain('Av. Juárez 120, Centro');
    expect(text).toContain('*Recibo de servicio #000123*');
    expect(text).toContain('7 nov 2026 · 14:32');
    expect(text).toContain('*Cliente:* Ana López');
    expect(text).toContain('*Equipo:* Apple iPhone 13');
    expect(text).toContain('*Servicio:* Cambio de pantalla');
    expect(text).toContain('*Falla:* Pantalla estrellada tras caída');
    expect(text).toContain('*Total:* $2,800.00');
    expect(text).toContain('*Abonado:* $1,000.00');
    expect(text).toContain('*Saldo pendiente:* $1,800.00');
    expect(text).toContain('*Método de pago:* Transferencia');
    expect(text).toContain('*Garantía:* 30 días (vence el 8 dic 2026)');
    expect(text).toContain('1 × Pantalla OLED iPhone 13');
    expect(text).toContain('_Gracias por tu preferencia. Garantía válida presentando este recibo._');
  });

  it('nunca incluye el PIN ni el patrón', () => {
    expect(text).not.toContain('482913');
    expect(text.toLowerCase()).not.toContain('pin');
  });

  it('servicio pagado y sin garantía', () => {
    const t = buildReceiptText({ ...client, pagadoCents: 280_000, garantiaDias: 0, estado: 'listo', fechaEntrega: null }, settings);
    expect(t).toContain('*Saldo:* $0.00 · Pagado');
    expect(t).toContain('*Garantía:* Sin garantía');
    expect(t).not.toContain('Entregado:');
  });
});

describe('WhatsApp', () => {
  it.each([
    ['55 1234 5678', '52', '525512345678'],
    ['(55) 1234-5678', '52', '525512345678'],
    ['+52 55 1234 5678', '52', '525512345678'],
    ['52 55 1234 5678', '52', '525512345678'],
    ['0052 55 1234 5678', '52', '525512345678'],
    ['300 123 4567', '57', '573001234567'],
    ['011 4321 5678', '54', '541143215678'],
    ['', '52', ''],
  ])('%s (+%s) → %s', (phone, cc, out) => {
    expect(normalizePhoneForWhatsApp(phone, cc)).toBe(out);
  });

  it('arma el enlace con el texto codificado', () => {
    expect(whatsappUrl('55 1234 5678', 'Hola *Ana*', '52')).toBe('https://wa.me/525512345678?text=Hola%20*Ana*');
    expect(whatsappUrl('', 'Hola', '52')).toBe('https://wa.me/?text=Hola');
  });
});
