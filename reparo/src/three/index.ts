/**
 * Módulo 3D de Reparo. Importarlo es ligero: three.js y las escenas se cargan
 * de forma diferida cuando un componente se monta.
 */
export { HeroDevice } from './HeroDevice';
export type { HeroDeviceProps, HeroScreen } from './HeroDevice';
export { OnboardingScene } from './OnboardingScene';
export type { OnboardingSceneProps } from './OnboardingScene';
export { PartThumb, PART_LABELS } from './PartThumb';
export type { PartThumbProps } from './PartThumb';
export { renderPartThumbnail, peekPartThumbnail } from './thumbnails';
export type { PartThumbnailOptions } from './thumbnails';
export { isWebGLAvailable } from './lib/env';
