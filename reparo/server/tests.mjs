// Punto de entrada de `node --test server/`: en Node 22 el ejecutor de pruebas
// trata el directorio como un módulo (package.json → main), así que aquí se
// cargan todas las pruebas server/*.test.mjs en orden alfabético.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
  await import(pathToFileURL(path.join(dir, file)).href);
}
