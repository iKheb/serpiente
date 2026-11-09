/* Acciones del recibo reutilizables (detalle y hoja del recibo). */
import { useMemo } from 'react';
import { downloadBlob, formatFolio, useInventory, useMovements, type Client, type Settings } from '@/data';
import { toast } from '@/ui';
import { renderReceiptPNG } from './receiptImage';
import { receiptFilename, type ReceiptPiece } from './receiptModel';

/** Piezas del inventario usadas en el servicio (movimientos "uso"), agrupadas por artículo. */
export function useReceiptPieces(clientId: string): ReceiptPiece[] {
  const movements = useMovements({ clienteId: clientId });
  const items = useInventory({ includeDeleted: true });
  return useMemo(() => {
    if (!movements || !items) return [];
    const names = new Map(items.map((i) => [i.id, i.nombre]));
    const acc = new Map<string, ReceiptPiece>();
    for (const m of movements) {
      if (m.type !== 'uso') continue;
      const nombre = names.get(m.itemId) ?? 'Repuesto';
      const prev = acc.get(m.itemId);
      if (prev) prev.cantidad += Math.abs(m.cantidad);
      else acc.set(m.itemId, { nombre, cantidad: Math.abs(m.cantidad) });
    }
    return [...acc.values()];
  }, [movements, items]);
}

/** Genera el PNG y lo comparte (Web Share con archivos) o lo descarga. */
export async function shareReceiptImage(client: Client, settings: Settings, piezas: ReceiptPiece[]): Promise<void> {
  try {
    const blob = await renderReceiptPNG(client, settings, { piezas });
    const name = receiptFilename(client);
    const file = new File([blob], name, { type: 'image/png' });
    const data: ShareData = { files: [file], title: `Recibo ${formatFolio(client.folio)}` };
    if (typeof navigator.canShare === 'function' && navigator.share && navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    downloadBlob(blob, name);
    toast({ title: 'Imagen del recibo descargada', description: name, tone: 'success' });
  } catch {
    toast({ title: 'No se pudo generar la imagen', description: 'Inténtalo de nuevo.', tone: 'danger' });
  }
}
