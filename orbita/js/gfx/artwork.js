// STUB — será sustituido por el subagente de arte procedural (ver ARCHITECTURE.md).
// Contrato (todas devuelven Promise<string> con una URL utilizable en <img src>):
//   artwork.poster(title)            2:3   (≥ 480×720)  con tratamiento de título integrado
//   artwork.backdrop(title)          16:9  (≥ 1600×900) SIN texto (la UI superpone el título)
//   artwork.layers(title)            Promise<{bg, mid, fg}> tres capas 16:9 (mid/fg con transparencia) para paralaje 2.5D del hero
//   artwork.logo(title)              PNG transparente con el título estilizado (para hero/detalle)
//   artwork.thumb(title, season, ep) 16:9  (≥ 480×270) miniatura de episodio
//   artwork.channelLogo(channel)     cuadrado transparente (≥ 256×256)
//   artwork.avatar(profile)          cuadrado (≥ 256×256)
// Debe cachear resultados y no bloquear el hilo principal más de ~8 ms por llamada.
const cache = new Map();
function make(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const p = new Promise((res) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    c.toBlob((b) => res(URL.createObjectURL(b)), 'image/png');
  });
  cache.set(key, p);
  return p;
}
function grad(g, w, h, pal) {
  const lg = g.createLinearGradient(0, 0, w, h);
  lg.addColorStop(0, pal[0]); lg.addColorStop(1, pal[1]);
  g.fillStyle = lg; g.fillRect(0, 0, w, h);
}
export const artwork = {
  poster: (t) => make('p:' + t.id, 480, 720, (g, w, h) => { grad(g, w, h, t.art.palette); g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText(t.title, 24, h - 40, w - 48); }),
  backdrop: (t) => make('b:' + t.id, 1600, 900, (g, w, h) => grad(g, w, h, [t.art.palette[0], t.art.palette[1]])),
  layers: async (t) => { const bg = await artwork.backdrop(t); return { bg, mid: null, fg: null }; },
  logo: (t) => make('l:' + t.id, 1000, 300, (g, w, h) => { g.fillStyle = '#fff'; g.font = 'bold 110px sans-serif'; g.fillText(t.title, 10, 200, w - 20); }),
  thumb: (t, s, e) => make(`t:${t.id}:${s}:${e}`, 480, 270, (g, w, h) => grad(g, w, h, [t.art.palette[1], t.art.palette[0]])),
  channelLogo: (c) => make('c:' + c.id, 256, 256, (g, w, h) => { g.fillStyle = c.art.palette[0]; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 90px sans-serif'; g.textAlign = 'center'; g.fillText(c.art.glyph, 128, 160); }),
  avatar: (p) => make('a:' + p.id + p.avatar + p.color, 256, 256, (g, w, h) => { g.fillStyle = p.color; g.fillRect(0, 0, w, h); }),
};
