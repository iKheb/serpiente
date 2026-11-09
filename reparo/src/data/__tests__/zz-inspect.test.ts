import { it } from 'vitest';
import { db } from '../db';
import { seedDemoData } from '../demo';
import { computeSummary } from '../reports';
import { getPeriod, dayRange } from '../periods';
import { formatMoney, formatDateTime } from '../format';
import { resetDb } from './helpers';
it('inspect', async () => {
  await resetDb();
  const t0 = performance.now();
  await seedDemoData();
  console.log('ms', Math.round(performance.now() - t0));
  const clients = await db.clients.toArray();
  const expenses = await db.expenses.toArray();
  const audit = await db.audit.toArray();
  const mv = await db.movements.toArray();
  console.log('counts', clients.length, expenses.length, audit.length, mv.length);
  for (const k of ['week', 'month'] as const) {
    const p = getPeriod(k);
    const s = computeSummary(p, clients, expenses);
    console.log(p.label, 'cobrado', formatMoney(s.cobradoCents), 'gastado', formatMoney(s.gastadoCents), 'gan', formatMoney(s.gananciaCents), 'margen', s.margen?.toFixed(2), 'serv', s.servicios, 'ticket', formatMoney(s.ticketPromedioCents), 'porCobrar', formatMoney(s.porCobrarCents));
  }
  const prev = getPeriod('month', Date.now() - 20 * 86400000);
  const sp = computeSummary(prev, clients, expenses);
  console.log(prev.label, formatMoney(sp.cobradoCents), formatMoney(sp.gastadoCents), formatMoney(sp.gananciaCents), sp.servicios);
  const today = computeSummary(dayRange(), clients, expenses);
  console.log('hoy', today.servicios, formatMoney(today.cobradoCents));
  const notifs = await db.notifications.orderBy('ts').reverse().toArray();
  for (const n of notifs) console.log('N', formatDateTime(n.ts), n.readAt ? 'leída' : 'NUEVA', n.title, '|', n.body, n.href);
  const recentAudit = audit.sort((a, b) => b.ts - a.ts).slice(0, 25);
  for (const a of recentAudit) console.log('A', formatDateTime(a.ts), a.action, a.entity, a.title, '|', a.summary, '|', a.changes.map((c) => `${c.label}: ${c.fromText} → ${c.toText}`).join('; '));
  const sample = clients.filter(c=>!c.deletedAt).slice(-6);
  for (const c of sample) console.log('C', c.folio, c.nombre, c.telefono, c.email, c.marca, c.modelo, c.servicio, c.falla, c.estado, formatMoney(c.cobroCents), formatMoney(c.pagadoCents), c.desbloqueoTipo, c.notas);
  const ex = expenses.sort((a,b)=>b.fecha-a.fecha).slice(0,12);
  for (const e of ex) console.log('E', formatDateTime(e.fecha), e.concepto, e.categoria, e.proveedor, e.cantidad, formatMoney(e.totalCents), e.clienteId ? 'cli' : '', e.inventarioId ? 'inv' : '');
  const inv = await db.inventory.toArray();
  for (const i of inv) console.log('I', i.nombre, i.stock, i.stockMinimo, i.pedidoAt ? 'PEDIDO' : '', i.marcadoReorden ? 'REORDEN' : '', i.deletedAt ? 'BORRADO' : '');
  const brands: Record<string, number> = {};
  for (const c of clients) brands[c.marca] = (brands[c.marca] ?? 0) + 1;
  console.log(brands);
  const days: Record<string, number> = {};
  for (const e of expenses) { const k = new Date(e.fecha).toDateString(); days[k] = (days[k] ?? 0) + 1; }
  const v = Object.values(days); console.log('gastos/día prom', (v.reduce((a,b)=>a+b,0)/90).toFixed(2));
}, 60000);
