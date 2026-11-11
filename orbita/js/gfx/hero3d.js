// STUB — será sustituido por el subagente 3D (ver ARCHITECTURE.md §Escenario).
// Singleton del "universo" Three.js que vive en #stage detrás de toda la app.
//   stage.mount(el, { device, bus })   (una vez, desde main.js)
//   stage.setMode('carousel'|'ambient'|'off')   (también lo decide solo escuchando bus 'route')
//   stage.setItems([{ id, title, palette, layers: Promise<{bg,mid,fg}> | {bg,mid,fg} }])
//   stage.show(index, { direction: 1|-1 })      transición cinematográfica al destacado
//   stage.setScroll(p)                           0 = arriba · 1 = hero fuera de vista (atenúa/paralaje)
//   stage.setPalette([c1,c2,c3])                 tinte ambiental
//   stage.pointer(nx, ny)                        paralaje opcional (-1..1)
export const stage = {
  mount() {}, setMode() {}, setItems() {}, show() {}, setScroll() {}, setPalette() {}, pointer() {},
};
