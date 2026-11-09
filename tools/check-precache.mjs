// Reports sw.js precache entries (SHELL_ASSETS) that have no file on disk.
// Usage: node tools/check-precache.mjs   (exit 1 if any are missing)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const m = sw.match(/const\s+SHELL_ASSETS\s*=\s*\[([\s\S]*?)\n\]/);
if (!m) { console.error('SHELL_ASSETS not found in sw.js'); process.exit(2); }
const body = m[1].replace(/^\s*\/\/.*$/gm, '');
const entries = [...body.matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2]);
const missing = [];
for (const e of entries) {
  const rel = e.split('?')[0].split('#')[0];
  const p = rel === '' || rel.endsWith('/') ? join(root, rel, 'index.html') : join(root, rel);
  if (!existsSync(p)) missing.push(e);
}
console.log('precache entries: ' + entries.length + ', missing: ' + missing.length);
for (const e of missing) console.log('MISSING ' + e);
process.exit(missing.length ? 1 : 0);
