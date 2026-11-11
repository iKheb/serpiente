// STUB — será sustituido por el subagente 3D (ver ARCHITECTURE.md).
// Contrato: playSplash(container, { device }) -> Promise que se resuelve al terminar la intro
//           (máx. ~4,5 s; cualquier tecla/clic/toque la salta). Debe liberar su contexto WebGL al acabar.
export async function playSplash(container) {
  container.innerHTML = '<div style="display:grid;place-items:center;height:100%;font:700 48px Outfit,sans-serif;color:#fff">ÓRBITA</div>';
  await new Promise((r) => setTimeout(r, 400));
}
