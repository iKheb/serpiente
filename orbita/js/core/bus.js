// Bus de eventos global mínimo.
// bus.on('evento', fn) -> función para desuscribir · bus.emit('evento', datos)
const handlers = new Map();
export const bus = {
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => handlers.get(type)?.delete(fn);
  },
  once(type, fn) {
    const off = this.on(type, (d) => { off(); fn(d); });
    return off;
  },
  emit(type, detail) {
    handlers.get(type)?.forEach((fn) => { try { fn(detail); } catch (e) { console.error(`[bus:${type}]`, e); } });
  },
};
