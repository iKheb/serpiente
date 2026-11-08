// Carga `node:sqlite` silenciando únicamente su aviso "ExperimentalWarning"
// (Node 22 lo emite al cargar el módulo). Cualquier otro aviso se muestra normal.
const originalEmitWarning = process.emitWarning;

process.emitWarning = function filteredEmitWarning(warning, ...args) {
  const opt = args[0];
  const type = typeof opt === 'string' ? opt : opt && typeof opt === 'object' ? opt.type : undefined;
  const name = warning && typeof warning === 'object' ? warning.name : undefined;
  const message = typeof warning === 'string' ? warning : warning?.message;
  if ((type === 'ExperimentalWarning' || name === 'ExperimentalWarning') && /sqlite/i.test(String(message))) return;
  return originalEmitWarning.call(process, warning, ...args);
};

let mod;
try {
  mod = await import('node:sqlite');
} finally {
  process.emitWarning = originalEmitWarning;
}

export const { DatabaseSync } = mod;
