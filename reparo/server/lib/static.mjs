// Servidor de archivos estáticos para la app compilada (single-file + sw.js +
// manifest + íconos): MIME correctos, ETag, 304, brotli/gzip en memoria,
// Cache-Control: no-cache para index.html, sw.js y manifest.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { appCsp, pickEncoding } from './http.mjs';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const COMPRESSIBLE = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.webmanifest', '.map', '.txt', '.xml', '.svg', '.ico', '.wasm', '.ttf', '.otf', '.gltf']);
const NO_CACHE = /(^|\/)(index\.html?|sw\.js|service-worker\.js|manifest\.webmanifest|manifest\.json)$|\.html?$/;
const MAX_MEMORY_FILE = 32 * 1024 * 1024;

export function cacheControlFor(relPath) {
  return NO_CACHE.test(relPath) ? 'no-cache' : 'public, max-age=86400';
}

const NOT_BUILT_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reparo · servidor</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#0b0d12;color:#e8eaf0;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:520px}code{background:#1a1e27;padding:2px 6px;border-radius:6px}h1{font-size:22px}</style></head>
<body><main><h1>El servidor de Reparo está funcionando</h1>
<p>Pero la app todavía no está compilada. En la carpeta del proyecto ejecuta:</p>
<p><code>npm run build</code> y luego <code>npm run server</code></p>
<p>La API de sincronización y notificaciones ya está disponible en <code>/api</code>.</p></main></body></html>`;

/**
 * @param {{ root: string, baseHeaders: Record<string,string>, cspConnect?: string[], log?: Function }} opts
 */
export function createStaticHandler({ root, baseHeaders, cspConnect = [], log = () => {} }) {
  const rootDir = path.resolve(root);
  const csp = appCsp(cspConnect);
  /** @type {Map<string, any>} */
  const cache = new Map();

  async function load(file, stat) {
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
    const ext = path.extname(file).toLowerCase();
    const entry = { mtimeMs: stat.mtimeMs, size: stat.size, ext, lastModified: new Date(stat.mtimeMs).toUTCString() };
    if (stat.size <= MAX_MEMORY_FILE) {
      entry.raw = await fsp.readFile(file);
      entry.etag = `W/"${crypto.createHash('sha1').update(entry.raw).digest('base64url').slice(0, 22)}"`;
      entry.compressible = COMPRESSIBLE.has(ext) && entry.raw.length >= 1024;
      entry.encoded = {};
    } else {
      entry.etag = `W/"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
    }
    cache.set(file, entry);
    return entry;
  }

  /** Variante comprimida (en memoria). Usa .br/.gz precomprimidos si existen y están al día. */
  async function encoded(file, entry, enc) {
    if (!entry.encoded[enc]) {
      entry.encoded[enc] = (async () => {
        const pre = `${file}.${enc === 'br' ? 'br' : 'gz'}`;
        try {
          const st = await fsp.stat(pre);
          if (st.mtimeMs >= entry.mtimeMs) return await fsp.readFile(pre);
        } catch {
          /* no hay versión precomprimida */
        }
        if (enc === 'br') {
          const fast = await brotli(entry.raw, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: entry.raw.length },
          });
          // Mejora en segundo plano a calidad máxima (sólo una vez por versión del archivo).
          brotli(entry.raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: entry.raw.length } })
            .then((best) => {
              if (best.length < fast.length && cache.get(file) === entry) entry.encoded.br = Promise.resolve(best);
            })
            .catch(() => {});
          return fast;
        }
        return gzip(entry.raw, { level: 9 });
      })();
    }
    return entry.encoded[enc];
  }

  function send(req, res, status, headers, body) {
    res.writeHead(status, { ...baseHeaders, ...headers });
    if (req.method === 'HEAD' || body == null) res.end();
    else if (typeof body.pipe === 'function') body.pipe(res);
    else res.end(body);
  }

  function notFound(req, res) {
    send(req, res, 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, 'No encontrado');
  }

  async function serveFile(req, res, file, stat, rel) {
    const entry = await load(file, stat);
    const type = MIME[entry.ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      ETag: entry.etag,
      'Last-Modified': entry.lastModified,
      'Cache-Control': cacheControlFor(rel),
      'Accept-Ranges': 'none',
    };
    if (type.startsWith('text/html') || entry.ext === '.js') headers['Content-Security-Policy'] = csp;
    if (entry.ext === '.svg') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    if (entry.compressible) headers.Vary = 'Accept-Encoding';
    if (/(^|\/)sw\.js$/.test(rel)) headers['Service-Worker-Allowed'] = '/';

    const inm = req.headers['if-none-match'];
    if (inm && (inm === '*' || inm.split(',').some((t) => t.trim() === entry.etag))) {
      return send(req, res, 304, headers);
    }
    if (!entry.raw) {
      headers['Content-Length'] = String(entry.size);
      return send(req, res, 200, headers, req.method === 'HEAD' ? null : fs.createReadStream(file));
    }
    let body = entry.raw;
    const enc = entry.compressible ? pickEncoding(req) : null;
    if (enc) {
      body = await encoded(file, entry, enc);
      headers['Content-Encoding'] = enc;
    }
    headers['Content-Length'] = String(body.length);
    return send(req, res, 200, headers, body);
  }

  async function statFile(p) {
    try {
      const st = await fsp.stat(p);
      if (st.isDirectory()) {
        const idx = path.join(p, 'index.html');
        const st2 = await fsp.stat(idx);
        return { file: idx, stat: st2 };
      }
      return st.isFile() ? { file: p, stat: st } : null;
    } catch {
      return null;
    }
  }

  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(req, res, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Método no permitido');
    }
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return send(req, res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Ruta inválida');
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return notFound(req, res);
    const segments = decoded.split('/').filter(Boolean);
    if (segments.some((s) => s === '..' || (s.startsWith('.') && s !== '.well-known'))) return notFound(req, res);

    let rel = segments.join('/');
    if (!rel || decoded.endsWith('/')) rel = rel ? `${rel}/index.html` : 'index.html';
    const abs = path.resolve(rootDir, rel);
    if (abs !== rootDir && !abs.startsWith(rootDir + path.sep)) return notFound(req, res);

    let found = await statFile(abs);
    // La app usa rutas con hash; cualquier ruta "de página" sin extensión cae en index.html.
    const wantsPage = !path.extname(rel) && String(req.headers.accept || '').includes('text/html');
    if (!found && (rel === 'index.html' || wantsPage)) {
      found = await statFile(path.join(rootDir, 'index.html'));
      rel = 'index.html';
      if (!found) {
        return send(req, res, 503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp }, NOT_BUILT_HTML);
      }
    }
    if (!found) {
      log('debug', `404 ${pathname}`);
      return notFound(req, res);
    }
    return serveFile(req, res, found.file, found.stat, rel);
  };
}
