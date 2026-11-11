// Detección de dispositivo y nivel de calidad gráfica.
// Equivalencias de plataforma:
//   · Navegador de escritorio  → ratón + teclado (device-desktop)
//   · Móvil (iOS/Android)      → táctil, barra inferior (device-mobile)
//   · Tablet (iPad/Android)    → táctil, layout intermedio (device-tablet)
//   · Smart TV (Android TV/Google TV, Fire TV, Tizen, webOS, Roku-web, consolas)
//                              → mando D-pad, interfaz "10 pies" (device-tv)
// Forzar modo con ?modo=tv|mobile|tablet|desktop

const ua = navigator.userAgent || '';
const params = new URLSearchParams(location.search);

const TV_RE = /SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]|Android TV|GoogleTV|CrKey|AppleTV|Roku|PlayStation|Xbox|Viera|Philips|VIDAA|Hisense|TV Safari|NETTV|DTV|Opera TV/i;

function detectType() {
  const forced = params.get('modo');
  if (forced && ['tv', 'mobile', 'tablet', 'desktop'].includes(forced)) return forced;
  if (TV_RE.test(ua)) return 'tv';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const minSide = Math.min(screen.width, screen.height);
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.+Mobile/.test(ua)) return 'mobile';
  if (/Android/.test(ua)) return minSide >= 600 ? 'tablet' : 'mobile';
  if (coarse) return minSide >= 700 ? 'tablet' : 'mobile';
  return 'desktop';
}

function detectGPUTier() {
  // 0 = bajo (TV, móviles modestos), 1 = medio, 2 = alto
  const forced = params.get('calidad');
  if (forced === 'baja') return 0;
  if (forced === 'media') return 1;
  if (forced === 'alta') return 2;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return -1; // sin WebGL → fallback 2D
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/SwiftShader|llvmpipe|Software/i.test(r)) return 0;
    if (/Mali-4|Mali-T|Adreno \(TM\) [345]\d\d|PowerVR SGX|VideoCore/i.test(r)) return 0;
    if (/Apple|RTX|Radeon RX|GeForce|Arc|M1|M2|M3|M4/i.test(r)) return 2;
    return 1;
  } catch { return 0; }
}

const type = detectType();
const tierRaw = detectGPUTier();
const tier = type === 'tv' ? Math.min(tierRaw, 1) : tierRaw;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('movimiento') === 'reducido';

export const device = {
  type,                                   // 'tv' | 'desktop' | 'tablet' | 'mobile'
  isTV: type === 'tv',
  isMobile: type === 'mobile',
  isTablet: type === 'tablet',
  isDesktop: type === 'desktop',
  touch: type === 'mobile' || type === 'tablet' || navigator.maxTouchPoints > 0 && type !== 'desktop',
  webgl: tierRaw >= 0,
  tier: Math.max(0, tier),                // 0 bajo · 1 medio · 2 alto
  reducedMotion,
  /** Pixel ratio recomendado para renderers WebGL según el nivel */
  pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    if (this.tier === 0) return Math.min(dpr, 1);
    if (this.tier === 1) return Math.min(dpr, 1.5);
    return Math.min(dpr, 2);
  },
  dev: params.has('dev'),                 // ?dev → salta intro y perfiles
  params,
};

export function applyDeviceClasses() {
  const c = document.documentElement.classList;
  c.remove('no-js');
  c.add(`device-${type}`, device.touch ? 'input-touch' : 'input-pointer', `gpu-tier-${device.tier}`);
  if (!device.webgl) c.add('no-webgl');
  if (reducedMotion) c.add('reduced-motion');
  if (type === 'tv') c.add('kbd-nav');
}
