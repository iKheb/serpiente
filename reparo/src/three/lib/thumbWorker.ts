/// <reference lib="webworker" />
/**
 * Web Worker de miniaturas: renderiza los sprites 3D en un OffscreenCanvas
 * para que la compilación de shaders, el PMREM y la lectura de píxeles (lentos
 * con WebGL por software) nunca bloqueen la interfaz.
 */
import type { ExpenseCategory } from '@/data/types';
import type { ThemeName } from './env';
import { createThumbStage, type ThumbStage } from './thumbStage';

export type ThumbWorkerRequest = { id: number; kind: ExpenseCategory; px: number; theme: ThemeName };
export type ThumbWorkerResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; unsupported?: boolean; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let stage: ThumbStage | null = null;
let unsupported = false;

function getStage(): ThumbStage {
  if (stage && !stage.isLost()) return stage;
  stage?.dispose();
  stage = createThumbStage(new OffscreenCanvas(128, 128));
  return stage;
}

scope.onmessage = async (ev: MessageEvent<ThumbWorkerRequest>) => {
  const { id, kind, px, theme } = ev.data;
  if (unsupported) {
    scope.postMessage({ id, ok: false, unsupported: true, error: 'sin WebGL en worker' } satisfies ThumbWorkerResponse);
    return;
  }
  let st: ThumbStage;
  try {
    st = getStage();
  } catch (e) {
    unsupported = true;
    scope.postMessage({ id, ok: false, unsupported: true, error: String(e) } satisfies ThumbWorkerResponse);
    return;
  }
  try {
    await st.draw(kind, px, theme);
    const blob = await (st.canvas as OffscreenCanvas).convertToBlob({ type: 'image/webp', quality: 0.92 });
    scope.postMessage({ id, ok: true, blob } satisfies ThumbWorkerResponse);
  } catch (e) {
    scope.postMessage({ id, ok: false, error: String(e) } satisfies ThumbWorkerResponse);
  }
};
