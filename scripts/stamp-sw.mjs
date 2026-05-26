// Replace __BUILD_VERSION__ in dist/sw.js with the current build timestamp.
// Runs after `vite build`. Ensures every deploy ships a byte-different sw.js
// so browsers reinstall + activate the new worker.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(here, '..', 'dist', 'sw.js');

if (!existsSync(swPath)) {
  console.warn('[stamp-sw] dist/sw.js not found — skipping');
  process.exit(0);
}

const version = `${Date.now()}`;
const src = readFileSync(swPath, 'utf8');
const out = src.replace(/__BUILD_VERSION__/g, version);
writeFileSync(swPath, out);
console.log(`[stamp-sw] stamped sw.js with version ${version}`);
