import { describe, expect, it } from 'vitest';
import { diffFields, formatFieldValue, sanitizeClient, summarizeClientEdit } from '../audit';
import type { Client } from '../types';

const ts = new Date(2026, 10, 7, 14, 32).getTime();

describe('diffFields', () => {
  it('formatea dinero, fechas, enums, booleanos y vacíos', () => {
    const changes = diffFields(
      'cliente',
      { cobroCents: 100_000, estado: 'reparando', fechaEntrega: null, telefono: '', updatedAt: 1, rev: 1 },
      { cobroCents: 125_000, estado: 'listo', fechaEntrega: ts, telefono: '55 1234 5678', updatedAt: 2, rev: 2 },
    );
    const byField = Object.fromEntries(changes.map((c) => [c.field, c]));
    expect(Object.keys(byField).sort()).toEqual(['cobroCents', 'estado', 'fechaEntrega', 'telefono']);
    expect(byField.cobroCents).toMatchObject({ label: 'Total del servicio', fromText: '$1,000.00', toText: '$1,250.00' });
    expect(byField.estado).toMatchObject({ label: 'Estado', fromText: 'En reparación', toText: 'Listo para entregar' });
    expect(byField.fechaEntrega).toMatchObject({ fromText: '—', toText: '7 nov 2026 · 14:32' });
    expect(byField.telefono).toMatchObject({ fromText: '—', toText: '55 1234 5678' });
    expect(formatFieldValue('inventario', 'marcadoReorden', true)).toBe('Sí');
    expect(formatFieldValue('gasto', 'categoria', 'baterias')).toBe('Baterías');
    expect(formatFieldValue('cliente', 'garantiaDias', 30)).toBe('30 días');
  });

  it('resuelve nombres de cliente y artículo', () => {
    const changes = diffFields(
      'gasto',
      { clienteId: null, inventarioId: 'i1' },
      { clienteId: 'c1', inventarioId: null },
      { clients: new Map([['c1', 'Ana López · iPhone 13']]), items: new Map([['i1', 'Batería iPhone 13']]) },
    );
    expect(changes.find((c) => c.field === 'clienteId')?.toText).toBe('Ana López · iPhone 13');
    expect(changes.find((c) => c.field === 'inventarioId')?.fromText).toBe('Batería iPhone 13');
  });

  it('enmascara siempre el patrón y el PIN', () => {
    const changes = diffFields(
      'cliente',
      { desbloqueoTipo: 'pin', desbloqueoCodigo: '482913', desbloqueoPatron: [] },
      { desbloqueoTipo: 'patron', desbloqueoCodigo: '', desbloqueoPatron: [0, 1, 2, 4, 6, 7, 8] },
    );
    const json = JSON.stringify(changes);
    expect(json).not.toContain('482913');
    expect(json).not.toContain('[0,1,2,4,6,7,8]');
    expect(changes.find((c) => c.field === 'desbloqueoCodigo')).toMatchObject({ fromText: 'PIN ••••', toText: '—' });
    expect(changes.find((c) => c.field === 'desbloqueoPatron')).toMatchObject({ fromText: '—', toText: 'Patrón actualizado' });
    expect(formatFieldValue('cliente', 'desbloqueoCodigo', '1234')).toBe('PIN ••••');
  });

  it('sanitizeClient limpia el snapshot', () => {
    const c = sanitizeClient({ desbloqueoPatron: [0, 4, 8], desbloqueoCodigo: 'secreto' } as Partial<Client>);
    expect(c.desbloqueoPatron).toEqual([]);
    expect(c.desbloqueoCodigo).toBe('••••');
  });

  it('resúmenes naturales', () => {
    const after = { estado: 'listo', cobroCents: 1000 } as Client;
    const estado = diffFields('cliente', { estado: 'reparando' }, { estado: 'listo' });
    expect(summarizeClientEdit(estado, after)).toBe('Cambió el estado a Listo para entregar');
    const varios = diffFields('cliente', { telefono: '1', email: '', notas: '' }, { telefono: '2', email: 'a@b.mx', notas: 'x' });
    expect(summarizeClientEdit(varios, after)).toBe('Editó 3 campos');
    const abono = diffFields('cliente', { pagadoCents: 0 }, { pagadoCents: 500 });
    expect(summarizeClientEdit(abono, after)).toBe('Registró un abono de $5.00');
  });
});
