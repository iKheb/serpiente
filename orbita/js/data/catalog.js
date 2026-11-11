// =============================================================================
// Catálogo de Órbita — contenido 100 % ficticio y original (sin marcas ni obras reales).
// ESQUEMA (contrato compartido, no cambiar campos sin coordinar):
//
// Title {
//   id: 't-slug', type: 'movie'|'series'|'event', title, tagline, synopsis,
//   year, rating: 'TP'|'7'|'12'|'16'|'18', duration (min; en series = media por episodio),
//   seasons?: [{ n, episodes: [{ n, title, synopsis, duration }] }],
//   genres: [..], match: 0-100, score: 0-10, quality: '4K'|'FHD'|'HD', hdr, dolby,
//   audio: ['es','en',...], subs: [...], cast: [...], director, origin,
//   tags: ['original','nuevo','top10','tendencia','premiado','exclusivo'],
//   art: { seed, palette:[c1,c2,c3], motif, mood },   // para el generador de arte
//   scene: SceneId,                                   // emisión procedural al reproducir
//   kids: boolean
// }
// Channel {
//   id: 'c-slug', number, name, short, category, country, quality,
//   art: { palette:[c1,c2], glyph, shape },
//   scene: SceneId,
//   pool: [{ title, genre, synopsis, scene? }]        // programas para generar la EPG
// }
// SceneId ∈ 'football'|'news'|'ocean'|'cosmos'|'nature'|'noir'|'racing'|'kids'|'music'|'fantasy'
// =============================================================================

export const SCENES = ['football', 'news', 'ocean', 'cosmos', 'nature', 'noir', 'racing', 'kids', 'music', 'fantasy'];

export const LIVE_CATEGORIES = ['Todos', 'Deportes', 'Noticias', 'Cine', 'Series', 'Infantil', 'Documentales', 'Música', 'Internacional'];

export const GENRES = ['Acción', 'Aventura', 'Animación', 'Ciencia ficción', 'Comedia', 'Crimen', 'Documental', 'Drama', 'Fantasía', 'Misterio', 'Música', 'Romance', 'Suspense', 'Terror', 'Deportes', 'Familiar'];

const ep = (n, title, synopsis, duration = 48) => ({ n, title, synopsis, duration });

export const TITLES = [
  {
    id: 't-el-ultimo-faro', type: 'movie', title: 'El último faro',
    tagline: 'Cuando la luz se apaga, el mar recuerda.',
    synopsis: 'Una farera solitaria en la costa de Finisterra descubre que las señales que emite cada noche están siendo respondidas desde un barco que naufragó hace cuarenta años.',
    year: 2026, rating: '16', duration: 118, genres: ['Suspense', 'Misterio'], match: 97, score: 8.7,
    quality: '4K', hdr: true, dolby: true, audio: ['es', 'en'], subs: ['es', 'en'],
    cast: ['Irene Valdés', 'Tomás Arrieta', 'Nuria Celaya'], director: 'Marta Oliveira', origin: 'España',
    tags: ['original', 'nuevo', 'top10'], art: { seed: 1101, palette: ['#0a1730', '#f3a35b', '#dfe7f2'], motif: 'lighthouse', mood: 'storm' },
    scene: 'noir', kids: false,
  },
  {
    id: 't-orbita-cero', type: 'series', title: 'Órbita Cero',
    tagline: 'Seis tripulantes. Una señal. Ningún regreso.',
    synopsis: 'La primera misión tripulada hacia una luna de Saturno recibe un mensaje en español antiguo. Mientras la Tierra calla, la tripulación debe decidir si responde.',
    year: 2026, rating: '12', duration: 52, genres: ['Ciencia ficción', 'Drama'], match: 95, score: 9.1,
    quality: '4K', hdr: true, dolby: true, audio: ['es', 'en', 'lat'], subs: ['es', 'en'],
    cast: ['Daniel Ferro', 'Ana Lucía Moret', 'Kenji Morales'], director: 'Lucas Ibarra', origin: 'España · México',
    tags: ['original', 'exclusivo', 'tendencia'], art: { seed: 2202, palette: ['#05060f', '#7c6cff', '#ffcf8a'], motif: 'planet', mood: 'epic' },
    scene: 'cosmos', kids: false,
    seasons: [
      { n: 1, episodes: [ep(1, 'Ignición', 'La nave Aurora abandona la órbita terrestre entre dudas y despedidas.', 54), ep(2, 'Silencio de radio', 'Un fallo en las comunicaciones obliga a tomar la primera decisión sin la Tierra.', 50), ep(3, 'La señal', 'La tripulación descifra el primer fragmento del mensaje.', 52), ep(4, 'Marea de hielo', 'El descenso a la superficie se complica.', 49)] },
      { n: 2, episodes: [ep(1, 'Eco', 'Seis meses después, la Aurora ya no está sola.', 55), ep(2, 'Los otros', 'Un rastro de huellas en el hielo.', 51)] },
    ],
  },
  {
    id: 't-furia-del-norte', type: 'movie', title: 'Furia del Norte',
    tagline: 'Una carrera. Mil kilómetros de nieve.',
    synopsis: 'Una piloto de rally retirada vuelve a competir en la carrera más peligrosa del Ártico para salvar el taller familiar.',
    year: 2025, rating: '12', duration: 106, genres: ['Acción', 'Aventura'], match: 91, score: 7.9,
    quality: '4K', hdr: true, dolby: false, audio: ['es', 'en'], subs: ['es'],
    cast: ['Sara Lindqvist', 'Hugo Benavente'], director: 'Iker Salas', origin: 'España · Noruega',
    tags: ['tendencia'], art: { seed: 3303, palette: ['#0c1a2b', '#ff5a36', '#e9f1ff'], motif: 'car', mood: 'speed' },
    scene: 'racing', kids: false,
  },
  {
    id: 't-bajo-la-superficie', type: 'series', title: 'Bajo la superficie',
    tagline: 'El 80 % del océano sigue sin explorar.',
    synopsis: 'Serie documental que desciende a las fosas abisales para encontrar criaturas que nadie ha filmado jamás.',
    year: 2026, rating: 'TP', duration: 45, genres: ['Documental'], match: 89, score: 8.9,
    quality: '4K', hdr: true, dolby: true, audio: ['es', 'en'], subs: ['es', 'en'],
    cast: ['Narración: Elena Prado'], director: 'Iñaki Mar', origin: 'Chile',
    tags: ['premiado', 'nuevo'], art: { seed: 4404, palette: ['#021a2c', '#18d6c9', '#9fe7ff'], motif: 'jellyfish', mood: 'calm' },
    scene: 'ocean', kids: false,
    seasons: [{ n: 1, episodes: [ep(1, 'Zona crepuscular', 'A 200 metros, la luz empieza a desaparecer.', 46), ep(2, 'Bioluminiscencia', 'Animales que fabrican su propia luz.', 44), ep(3, 'La fosa', 'El descenso más profundo de la historia de la serie.', 47)] }],
  },
  {
    id: 't-pequenos-gigantes', type: 'series', title: 'Pequeños Gigantes',
    tagline: '¡Rebota, salta y descubre!',
    synopsis: 'Pip, Lola y Bóreas son tres figuras de colores que viven en un mundo de bloques donde cada caída es una aventura.',
    year: 2026, rating: 'TP', duration: 12, genres: ['Animación', 'Familiar'], match: 93, score: 8.4,
    quality: 'FHD', hdr: false, dolby: false, audio: ['es', 'lat'], subs: ['es'],
    cast: ['Voces: Paula Ríos', 'Gael Duarte'], director: 'Estudio Cometa', origin: 'Argentina',
    tags: ['original'], art: { seed: 5505, palette: ['#ffd23f', '#ff5c9d', '#3fc5ff'], motif: 'blocks', mood: 'playful' },
    scene: 'kids', kids: true,
    seasons: [{ n: 1, episodes: [ep(1, 'La torre más alta', 'Pip quiere llegar a las nubes.', 12), ep(2, 'Rebote loco', 'Lola descubre la cama elástica.', 11)] }],
  },
  {
    id: 't-bosque-de-luz', type: 'movie', title: 'El bosque de luz',
    tagline: 'Hay lugares que solo existen cuando nadie mira.',
    synopsis: 'Dos hermanos se pierden en un bosque gallego donde las luciérnagas guardan la memoria de quienes se fueron.',
    year: 2024, rating: '7', duration: 97, genres: ['Fantasía', 'Familiar'], match: 88, score: 8.2,
    quality: '4K', hdr: true, dolby: true, audio: ['es', 'en', 'lat'], subs: ['es', 'en'],
    cast: ['Leo Castro', 'Martina Sanz', 'Julia Otero Vidal'], director: 'Carla Méndez', origin: 'España',
    tags: ['premiado'], art: { seed: 6606, palette: ['#06140f', '#9dff8a', '#ffe9a8'], motif: 'forest', mood: 'magic' },
    scene: 'fantasy', kids: true,
  },
  {
    id: 't-final-continental', type: 'event', title: 'Final Continental',
    tagline: 'Noventa minutos para la historia.',
    synopsis: 'En directo desde el Estadio Horizonte: Atlético Meridiano contra Deportivo Cóndor en la gran final.',
    year: 2026, rating: 'TP', duration: 120, genres: ['Deportes'], match: 99, score: 9.4,
    quality: '4K', hdr: true, dolby: true, audio: ['es', 'lat'], subs: [],
    cast: ['Comentarios: Rubén Llorente', 'Valeria Quintana'], director: 'Órbita Deportes', origin: 'En directo',
    tags: ['exclusivo', 'tendencia'], art: { seed: 7707, palette: ['#04150b', '#2ee66f', '#ffffff'], motif: 'stadium', mood: 'epic' },
    scene: 'football', kids: false,
  },
  {
    id: 't-frecuencia-roja', type: 'series', title: 'Frecuencia Roja',
    tagline: 'Cada canción esconde una confesión.',
    synopsis: 'Una locutora nocturna de Ciudad de México recibe llamadas de oyentes que describen crímenes que aún no han ocurrido.',
    year: 2025, rating: '16', duration: 44, genres: ['Crimen', 'Suspense'], match: 92, score: 8.5,
    quality: 'FHD', hdr: true, dolby: true, audio: ['es', 'lat', 'en'], subs: ['es', 'en'],
    cast: ['Ximena Duarte', 'Óscar Villalba'], director: 'Renata Gil', origin: 'México',
    tags: ['original', 'top10'], art: { seed: 8808, palette: ['#14040a', '#ff2e55', '#ffd0d8'], motif: 'microphone', mood: 'tense' },
    scene: 'music', kids: false,
    seasons: [{ n: 1, episodes: [ep(1, 'En antena', 'La primera llamada llega a las 03:14.', 46), ep(2, 'Interferencias', 'La policía no cree a Inés.', 43)] }],
  },
];

export const CHANNELS = [
  { id: 'c-orbita-uno', number: 1, name: 'Órbita Uno', short: 'O1', category: 'Series', country: 'ES', quality: '4K',
    art: { palette: ['#6d7cff', '#ff5c9d'], glyph: '1', shape: 'orbit' }, scene: 'noir',
    pool: [{ title: 'Noches de estreno', genre: 'Cine', synopsis: 'La gran película de la noche.' }, { title: 'Crónica negra', genre: 'Series', synopsis: 'Episodio doble.' }] },
  { id: 'c-orbita-deportes', number: 7, name: 'Órbita Deportes', short: 'OD', category: 'Deportes', country: 'ES', quality: '4K',
    art: { palette: ['#2ee66f', '#0b3d1f'], glyph: 'D', shape: 'shield' }, scene: 'football',
    pool: [{ title: 'Fútbol: Liga Horizonte', genre: 'Deportes', synopsis: 'Partido en directo.', scene: 'football' }, { title: 'Motor total', genre: 'Deportes', synopsis: 'Lo mejor del motor.', scene: 'racing' }] },
  { id: 'c-24-horas', number: 24, name: 'Meridiano 24h', short: 'M24', category: 'Noticias', country: 'MX', quality: 'FHD',
    art: { palette: ['#ff3b55', '#1a1f3d'], glyph: '24', shape: 'square' }, scene: 'news',
    pool: [{ title: 'Informativo central', genre: 'Noticias', synopsis: 'La actualidad del día.' }, { title: 'El tiempo', genre: 'Noticias', synopsis: 'Previsión meteorológica.' }] },
  { id: 'c-abisal', number: 31, name: 'Abisal', short: 'AB', category: 'Documentales', country: 'CL', quality: '4K',
    art: { palette: ['#18d6c9', '#021a2c'], glyph: 'A', shape: 'wave' }, scene: 'ocean',
    pool: [{ title: 'Planeta azul profundo', genre: 'Documentales', synopsis: 'Expedición submarina.' }, { title: 'Cumbres', genre: 'Documentales', synopsis: 'Las montañas más altas.', scene: 'nature' }] },
  { id: 'c-cometa-kids', number: 40, name: 'Cometa Kids', short: 'CK', category: 'Infantil', country: 'AR', quality: 'FHD',
    art: { palette: ['#ffd23f', '#ff5c9d'], glyph: 'K', shape: 'star' }, scene: 'kids',
    pool: [{ title: 'Pequeños Gigantes', genre: 'Infantil', synopsis: 'Nuevos episodios.' }, { title: 'El bosque de luz', genre: 'Infantil', synopsis: 'Película familiar.', scene: 'fantasy' }] },
  { id: 'c-pulso', number: 52, name: 'Pulso FM TV', short: 'PL', category: 'Música', country: 'CO', quality: 'FHD',
    art: { palette: ['#a35bff', '#ffb35c'], glyph: 'P', shape: 'circle' }, scene: 'music',
    pool: [{ title: 'Directo en el Pulso', genre: 'Música', synopsis: 'Concierto en vivo.' }, { title: 'Top 40', genre: 'Música', synopsis: 'Los éxitos de la semana.' }] },
];

// -----------------------------------------------------------------------------
// Utilidades
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const T_BY_ID = new Map(TITLES.map((t) => [t.id, t]));
const C_BY_ID = new Map(CHANNELS.map((c) => [c.id, c]));

export const getTitle = (id) => T_BY_ID.get(id) || null;
export const getChannel = (id) => C_BY_ID.get(id) || null;
export const byType = (type) => TITLES.filter((t) => t.type === type);
export const byGenre = (g) => TITLES.filter((t) => t.genres.includes(g));
export const kidsTitles = () => TITLES.filter((t) => t.kids);

/** Búsqueda difusa simple por título, géneros, reparto y sinopsis */
export function search(q, { kids = false } = {}) {
  const n = norm(q).trim();
  if (!n) return [];
  const words = n.split(/\s+/);
  const scored = [];
  for (const t of TITLES) {
    if (kids && !t.kids) continue;
    const hay = { title: norm(t.title), genres: norm(t.genres.join(' ')), cast: norm((t.cast || []).join(' ') + ' ' + t.director), syn: norm(t.synopsis) };
    let s = 0;
    for (const w of words) {
      if (hay.title.startsWith(w)) s += 10; else if (hay.title.includes(w)) s += 6;
      if (hay.genres.includes(w)) s += 4;
      if (hay.cast.includes(w)) s += 3;
      if (hay.syn.includes(w)) s += 1;
    }
    if (s > 0) scored.push([s, t]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, t]) => t);
}

/** Títulos destacados para el carrusel principal de cada sección */
export function featured(section = 'inicio') {
  const pick = {
    inicio: () => TITLES.filter((t) => t.tags.includes('original') || t.tags.includes('exclusivo')),
    peliculas: () => byType('movie'),
    series: () => byType('series'),
    deportes: () => TITLES.filter((t) => t.genres.includes('Deportes')),
    infantil: () => kidsTitles(),
    milista: () => [],
  }[section] || (() => TITLES);
  const list = pick();
  return (list.length ? list : TITLES).slice(0, 6);
}

/**
 * Filas de contenido para una sección.
 * Row { id, title, kind: 'poster'|'landscape'|'top10'|'continue'|'channels'|'live', items: [Title|Channel] }
 * 'continue' se rellena en la UI con store.continueWatching(); 'channels' contiene Channel.
 */
export function rowsFor(section = 'inicio') {
  const rows = [];
  const add = (id, title, kind, items) => { if (items && items.length) rows.push({ id, title, kind, items }); };
  if (section === 'inicio') {
    add('continue', 'Seguir viendo', 'continue', []);
    add('live-now', 'En vivo ahora', 'channels', CHANNELS);
    add('top10', 'Top 10 en tu país hoy', 'top10', TITLES.slice(0, 10));
    add('trend', 'Tendencias', 'poster', TITLES.filter((t) => t.tags.includes('tendencia')).concat(TITLES));
    add('originals', 'Originales Órbita', 'landscape', TITLES.filter((t) => t.tags.includes('original')));
    add('docs', 'Para descubrir el mundo', 'poster', byGenre('Documental').concat(byGenre('Fantasía')));
  } else if (section === 'peliculas') {
    add('movies', 'Películas populares', 'poster', byType('movie'));
  } else if (section === 'series') {
    add('series', 'Series para maratonear', 'poster', byType('series'));
  } else if (section === 'deportes') {
    add('live-sport', 'Deportes en directo', 'channels', CHANNELS.filter((c) => c.category === 'Deportes'));
    add('events', 'Eventos', 'landscape', byGenre('Deportes'));
  } else if (section === 'infantil') {
    add('kids', 'Para los peques', 'poster', kidsTitles());
    add('kids-ch', 'Canales infantiles', 'channels', CHANNELS.filter((c) => c.category === 'Infantil'));
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Guía de programación (EPG) determinista
const SLOT = 30 * 60 * 1000;
/** Programas de un canal entre dos instantes (ms). Program { id, channelId, title, genre, synopsis, scene, start, end } */
export function programsFor(channelId, from, to) {
  const ch = getChannel(channelId);
  if (!ch) return [];
  const out = [];
  // Cadena determinista por día local (anclada a medianoche): mismos programas sea cual sea "from".
  const d0 = new Date(from); d0.setHours(0, 0, 0, 0);
  let day = d0.getTime();
  while (day < to) {
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const dayEnd = next.getTime();
    let t = day;
    while (t < dayEnd && t < to) {
      const r = mulberry32(hash(ch.id + ':' + t));
      const len = [1, 2, 2, 3, 4][Math.floor(r() * 5)] * SLOT;
      const p = ch.pool[Math.floor(r() * ch.pool.length)];
      const start = t, end = Math.min(t + len, dayEnd);
      if (end > from) out.push({ id: `${ch.id}@${start}`, channelId: ch.id, title: p.title, genre: p.genre, synopsis: p.synopsis, scene: p.scene || ch.scene, start, end });
      t = end;
    }
    day = dayEnd;
  }
  return out;
}
/** Programa en emisión ahora (o en el instante dado) */
export function nowOn(channelId, at = Date.now()) {
  return programsFor(channelId, at - 4 * SLOT, at + SLOT).find((p) => p.start <= at && p.end > at) || null;
}
