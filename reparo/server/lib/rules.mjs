// Reglas de notificación del lado servidor (se evalúan tras cada sincronización)
// y resumen diario programado.

const COALESCE_AFTER = 3;

export function formatFolio(folio) {
  return Number.isFinite(folio) && folio > 0 ? `#${String(Math.trunc(folio)).padStart(6, '0')}` : '';
}

const isLow = (item) => Number(item.stock) <= Number(item.stockMinimo);

/**
 * Detecta eventos dignos de push en las filas aceptadas por una sincronización.
 * Sólo cuentan TRANSICIONES respecto a la versión anterior del servidor (la
 * primera vez que llega un registro no se notifica: evita avalanchas al
 * sincronizar por primera vez).
 * @param {Array<{table:string,row:object,prev:object|null}>} accepted
 * @returns {Array<{ payload: {title:string,body:string,href:string,tag:string,kind:string}, urgency: string, ttl: number }>}
 */
export function eventsFromSync(accepted) {
  const lowStock = [];
  const ready = [];
  for (const { table, row, prev } of accepted) {
    if (!prev || row.deletedAt != null) continue;
    if (table === 'inventory' && isLow(row) && !isLow(prev)) lowStock.push(row);
    if (table === 'clients' && row.estado === 'listo' && prev.estado !== 'listo') ready.push(row);
  }

  const out = [];
  if (lowStock.length > COALESCE_AFTER) {
    const names = lowStock.slice(0, 3).map((i) => i.nombre).join(', ');
    out.push({
      payload: {
        title: `Stock bajo en ${lowStock.length} artículos`,
        body: `${names} y ${lowStock.length - 3} más. Revisa la lista "Por pedir".`,
        href: '#/inventario?filtro=pedir',
        tag: 'stock-bajo',
        kind: 'stock_bajo',
      },
      urgency: 'normal',
      ttl: 86400,
    });
  } else {
    for (const item of lowStock) {
      const stock = Math.max(0, Number(item.stock) || 0);
      out.push({
        payload: {
          title: `Stock bajo: ${item.nombre} (quedan ${stock})`,
          body:
            stock === 0
              ? `Se agotó. Mínimo configurado: ${item.stockMinimo}. Toca para pedirlo.`
              : `Mínimo configurado: ${item.stockMinimo}. Toca para pedirlo.`,
          href: `#/inventario/${encodeURIComponent(item.id)}`,
          tag: `stock-${item.id}`,
          kind: 'stock_bajo',
        },
        urgency: 'normal',
        ttl: 86400,
      });
    }
  }

  for (const c of ready) {
    const equipo = [c.marca, c.modelo].filter(Boolean).join(' ').trim() || 'equipo';
    const folio = formatFolio(c.folio);
    out.push({
      payload: {
        title: `Equipo listo para entregar: ${c.nombre} · ${equipo}`,
        body: [folio && `Folio ${folio}`, c.servicio].filter(Boolean).join(' · ') || 'Avísale al cliente que puede recogerlo.',
        href: `#/clientes/${encodeURIComponent(c.id)}`,
        tag: `listo-${c.id}`,
        kind: 'listo_sin_entregar',
      },
      urgency: 'high',
      ttl: 86400,
    });
  }
  return out;
}

/* ---------------------------- Resumen diario ----------------------------- */

export function localDayRange(now = Date.now()) {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start, end, key };
}

export function moneyFormatter(locale, currency) {
  const nf = new Intl.NumberFormat(locale, { style: 'currency', currency });
  return (cents) => nf.format((Number(cents) || 0) / 100);
}

/** Payload del resumen del día a partir de los totales en centavos. */
export function dailySummaryPayload(totals, { now = Date.now(), locale = 'es-MX', currency = 'MXN' } = {}) {
  const money = moneyFormatter(locale, currency);
  const fecha = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(now));
  const vacio = totals.cobradoCents === 0 && totals.gastadoCents === 0;
  return {
    title: `Resumen de hoy · ${fecha}`,
    body: vacio
      ? 'Hoy no se registraron cobros ni gastos.'
      : `Cobrado ${money(totals.cobradoCents)} · Gastado ${money(totals.gastadoCents)} · Ganancia ${money(totals.gananciaCents)}` +
        (totals.servicios ? ` · ${totals.servicios} ${totals.servicios === 1 ? 'servicio' : 'servicios'}` : ''),
    href: '#/reportes',
    tag: 'resumen-diario',
    kind: 'resumen',
  };
}

/**
 * Programa el resumen diario a la hora local `hour` (0-23). Se envía una vez por
 * día (la fecha del último envío queda en la tabla meta de SQLite).
 * @returns {() => void} detiene el temporizador
 */
export function scheduleDailySummary({ store, push, hour, locale, currency, log = () => {}, intervalMs = 60_000, clock = Date.now }) {
  if (hour == null) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    const now = clock();
    if (new Date(now).getHours() !== hour) return;
    const { start, end, key } = localDayRange(now);
    if (store.getMeta('dailySummaryLast') === key) return;
    running = true;
    try {
      store.setMeta('dailySummaryLast', key);
      if (store.subscriptionCount() === 0) return;
      const payload = dailySummaryPayload(store.totals(start, end), { now, locale, currency });
      await push.notify(payload, { urgency: 'low', ttl: 6 * 3600 });
    } catch (err) {
      log('error', `resumen diario: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return () => clearInterval(timer);
}
