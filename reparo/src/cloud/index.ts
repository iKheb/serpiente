/* ==========================================================================
   Reparo — Nube con Supabase (`import { … } from '@/cloud'`)
   Ver docs/nube-supabase.md.
   ========================================================================== */

// Configuración del proyecto (URL + clave pública) y código de conexión
export {
  type CloudConfig,
  type CloudConfigSource,
  type CloudConfigState,
  normalizeProjectUrl,
  normalizeAnonKey,
  validateCloudConfig,
  encodeConnectionCode,
  decodeConnectionCode,
  hasBuiltInConfig,
  loadCloudConfig,
  getCloudConfig,
  saveCloudConfig,
  clearCloudConfig,
  useCloudConfig,
} from './config';

// Autenticación (correo + contraseña)
export {
  type CloudClient,
  type CloudUser,
  type CloudAuthState,
  AUTH_STORAGE_KEY,
  getCloudClient,
  getCloudUser,
  useCloudAuth,
  cloudSignUp,
  cloudSignIn,
  cloudSignOut,
  cloudResetPassword,
  cloudUpdatePassword,
  testCloudConfig,
  validateEmail,
  validatePassword,
} from './client';

export { CloudError, toCloudError, type CloudErrorKind } from './errors';

// Sincronización
export {
  type CloudState,
  type CloudStatus,
  startCloudSync,
  useCloudSync,
  cloudSyncNow,
  useCloudStatus,
  restoreFromCloud,
  connectCloudProject,
} from './sync';
export { hasCloudPending, resetCloudState, SHARED_SETTINGS_KEYS, type CloudSyncResult } from './engine';

// QR
export { encodeQr, drawQrToCanvas, type QrCode, type QrEcc } from './qr';

// UI
export { CloudSettingsSection } from './ui/CloudSettingsSection';
export { CloudOnboardingStep, type CloudOnboardingStepProps } from './ui/CloudOnboardingStep';
export { ConnectionCodePanel } from './ui/parts';
