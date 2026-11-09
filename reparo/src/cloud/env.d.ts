/// <reference types="vite/client" />
/* Configuración predeterminada de la nube, inyectada en tiempo de build
   (p. ej. en `.env.production` o en el workflow de GitHub Pages):
     VITE_REPARO_CLOUD_URL=https://<ref>.supabase.co
     VITE_REPARO_CLOUD_KEY=sb_publishable_…   (o la clave anon clásica eyJ…)
   Ambas son PÚBLICAS (la seguridad la dan las políticas RLS). */
interface ImportMetaEnv {
  readonly VITE_REPARO_CLOUD_URL?: string;
  readonly VITE_REPARO_CLOUD_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
