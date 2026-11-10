/* Impresión del recibo: HTML propio de 80 mm en un iframe oculto (sólo el ticket). */
import { brandMarkSVG } from '@/app/brand';
import { PAPER, type ReceiptModel, type ReceiptRow } from './receiptModel';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function rows(list: ReceiptRow[]) {
  return list
    .map((r) =>
      r.block
        ? `<div class="blk"><span class="l">${esc(r.label)}</span><span class="v">${esc(r.value)}</span></div>`
        : `<div class="row"><span class="l">${esc(r.label)}</span><span class="v${r.mono ? ' m' : ''}">${esc(r.value)}</span></div>`,
    )
    .join('');
}

export function receiptPrintHTML(m: ReceiptModel): string {
  const pending = m.totals.saldoCents > 0;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${esc(m.folio)}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 80mm; background: ${PAPER.paper}; color: ${PAPER.ink}; }
body { font: 11.5px/1.4 'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 5mm 4mm 7mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.m, .mono { font-family: 'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.c { text-align: center; }
.logo { width: 11mm; height: 11mm; margin: 0 auto 2mm; display: block; }
.biz { font-size: 14px; font-weight: 650; }
.sub { color: ${PAPER.ink2}; }
hr { border: 0; border-top: 1px dashed ${PAPER.rule}; margin: 3mm 0; }
.cap { font-size: 9px; font-weight: 600; letter-spacing: .1em; color: ${PAPER.ink3}; text-transform: uppercase; }
.folio { font-size: 20px; font-weight: 600; margin: 1mm 0 .5mm; }
.row { display: flex; justify-content: space-between; gap: 3mm; padding: .6mm 0; }
.row .l, .blk .l { color: ${PAPER.ink3}; white-space: nowrap; }
.row .v { text-align: right; font-weight: 520; overflow-wrap: anywhere; }
.blk { padding: .6mm 0; display: flex; flex-direction: column; }
.blk .v { font-weight: 500; }
.pz { display: flex; gap: 2mm; padding: .5mm 0; }
.total { display: flex; justify-content: space-between; align-items: baseline; font-weight: 600; font-size: 13px; }
.total .m { font-size: 16px; }
.inc { color: ${PAPER.income}; } .pen { color: ${PAPER.pending}; font-weight: 600; }
.foot { color: ${PAPER.ink3}; text-align: center; text-wrap: balance; }
</style></head><body>
<div class="c">
  <img class="logo" alt="" src="data:image/svg+xml;utf8,${encodeURIComponent(brandMarkSVG(64))}">
  <div class="biz">${esc(m.business.name)}</div>
  ${m.business.phone ? `<div class="sub">${esc(m.business.phone)}</div>` : ''}
  ${m.business.address ? `<div class="sub">${esc(m.business.address)}</div>` : ''}
</div>
<hr>
<div class="c"><div class="cap">Recibo de servicio</div><div class="folio mono">${esc(m.folio)}</div><div class="sub mono">${esc(m.dateText)}</div></div>
<hr>
${rows(m.client)}${rows(m.device)}
${m.piezas.length ? `<hr><div class="cap">Piezas utilizadas</div>${m.piezas.map((p) => `<div class="pz"><span class="mono sub">${p.cantidad} ×</span><span>${esc(p.nombre)}</span></div>`).join('')}` : ''}
<hr>
<div class="total"><span>Total</span><span class="m">${esc(m.totals.total)}</span></div>
<div class="row"><span class="l">Abonado</span><span class="v m inc">${esc(m.totals.abonado)}</span></div>
<div class="row"><span class="l${pending ? ' pen' : ''}">${pending ? 'Saldo pendiente' : 'Saldo'}</span><span class="v m${pending ? ' pen' : ''}">${esc(m.totals.saldo)}</span></div>
<div class="row"><span class="l">${m.metodo ? `Pago: ${esc(m.metodo)}` : 'Estado de pago'}</span><span class="v">${esc(m.totals.statusLabel)}</span></div>
<hr>
${rows([{ label: 'Garantía', value: m.garantia }])}
${m.footer ? `<hr><p class="foot">${esc(m.footer)}</p>` : ''}
</body></html>`;
}

/** Imprime el recibo en un iframe oculto y lo retira al terminar. */
export function printReceipt(m: ReceiptModel): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(receiptPrintHTML(m));
  doc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  const go = () => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(() => iframe.isConnected && iframe.remove(), 60_000);
    }
  };
  const img = doc.querySelector('img');
  if (img && !img.complete) img.addEventListener('load', go, { once: true });
  else setTimeout(go, 50);
}
