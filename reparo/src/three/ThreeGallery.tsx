import { HeroDevice } from './HeroDevice';

export default function ThreeGallery() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const ex = q.get('explode');
  const exploded = ex === null ? undefined : ex === '1';
  return (
    <div style={{ padding: 24, display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
      <div style={{ height: 520, background: 'var(--surface-1)', borderRadius: 20, border: '1px solid var(--border)' }}>
        <HeroDevice exploded={exploded} autoExplode={false} />
      </div>
      <div style={{ height: 260, background: 'var(--surface-1)', borderRadius: 20, border: '1px solid var(--border)' }}>
        <HeroDevice variant="compact" exploded={exploded} autoExplode={false} screen={{ title: 'Cobrado hoy', value: '$6,480.00', caption: '14 servicios', trend: [3, 5, 4, 7, 6, 9, 8] }} />
      </div>
    </div>
  );
}
