// =============================================================================
// Órbita · AudioContext compartido (sfx de interfaz + audio de emisiones)
//   getAudioContext()  → AudioContext | null (perezoso; null si no hay WebAudio)
//   resumeAudio()      → intenta reanudar tras un gesto
// =============================================================================
let ctx = null;
let failed = false;

export function getAudioContext() {
  if (ctx || failed) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    ctx = new AC({ latencyHint: 'interactive' });
  } catch {
    failed = true; ctx = null;
  }
  return ctx;
}

export function resumeAudio() {
  const c = getAudioContext();
  if (c && c.state === 'suspended') { try { return c.resume().catch(() => {}); } catch { /* */ } }
  return Promise.resolve();
}

export const audioRunning = () => !!ctx && ctx.state === 'running';
