import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
await mkdir('public/pdf-assets', { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm']) await cp(path.join(root, name), 'public/pdf-assets/' + name, { recursive: true });
await cp(path.join(root, 'LICENSE'), 'public/pdf-assets/LICENSE');
console.log('Offline PDF font and rendering assets prepared.');
