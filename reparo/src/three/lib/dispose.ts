import type { Material, Object3D, Texture, BufferGeometry } from 'three';

type Disposable = { dispose: () => void };

/** Recolecta todas las texturas de un material (map, emissiveMap, roughnessMap, uniforms…). */
function collectTextures(material: Material, out: Set<Texture>) {
  const rec = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const v = rec[key] as { isTexture?: boolean } | null;
    if (v && typeof v === 'object' && v.isTexture) out.add(v as unknown as Texture);
  }
  const uniforms = (material as unknown as { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (uniforms) {
    for (const u of Object.values(uniforms)) {
      const v = u?.value as { isTexture?: boolean } | null;
      if (v && typeof v === 'object' && v.isTexture) out.add(v as unknown as Texture);
    }
  }
}

/**
 * Libera geometrías, materiales y texturas de todo el subárbol (sin duplicados).
 * Seguro de llamar varias veces.
 */
export function disposeObject(root: Object3D | null | undefined) {
  if (!root) return;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((obj) => {
    const o = obj as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach((m) => materials.add(m));
    }
  });
  materials.forEach((m) => collectTextures(m, textures));
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}

export class DisposeBag {
  private items: Disposable[] = [];
  add<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }
  dispose() {
    for (const it of this.items.splice(0)) {
      try {
        it.dispose();
      } catch {
        /* ignorar */
      }
    }
  }
}
