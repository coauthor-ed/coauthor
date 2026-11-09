#!/usr/bin/env node
// Write coauthor-catalog/catalog.json from staged series (docs/sprints/wip/november-plan/PLAN.md, W3).
// Usage: node tools/publish/make-catalog.mjs --org ORG --staging <dir> --series <id>... [--out catalog.json] [--label checked]
// One entry per bundle manifest found under <staging>/<series>/. "label" is the curator's call (default "checked");
// "featured" starts false and "installs" 0 (a weekly Action fills installs later). Existing entries in --out keep their
// label/featured/addedAt/installs, so re-running only adds or refreshes.
import fs from 'node:fs';
import path from 'node:path';

const a = process.argv.slice(2);
const o = { series: [], org: 'ORG-PLACEHOLDER', out: 'catalog.json', label: 'checked' };
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--org') o.org = a[++i];
  else if (a[i] === '--staging') o.staging = path.resolve(a[++i]);
  else if (a[i] === '--out') o.out = path.resolve(a[++i]);
  else if (a[i] === '--label') o.label = a[++i];
  else if (a[i] === '--series') { while (a[i + 1] && !a[i + 1].startsWith('--')) o.series.push(a[++i]); }
}
if (!o.staging || !o.series.length) { console.error('Usage: make-catalog.mjs --org ORG --staging <dir> --series <id>... [--out catalog.json] [--label checked]'); process.exit(2); }

const today = new Date().toISOString().slice(0, 10);
const prev = fs.existsSync(o.out) ? JSON.parse(fs.readFileSync(o.out, 'utf8')) : null;
const old = new Map((prev?.entries || []).map((e) => [e.id, e]));
const entries = [];
for (const s of o.series) {
  const bm = JSON.parse(fs.readFileSync(path.join(o.staging, s, 'bundle-manifest.json'), 'utf8'));
  for (const src of bm.sources) {
    const mf = JSON.parse(fs.readFileSync(path.join(o.staging, s, src.manifestUrl), 'utf8'));
    const id = mf.bundleId;
    const e = old.get(id) || { id, label: o.label, featured: false, addedAt: today, installs: 0 };
    entries.push({
      id,
      manifestUrl: `https://${o.org}.github.io/${s}/${src.manifestUrl}`,
      series: s,
      label: e.label, featured: e.featured, addedAt: e.addedAt, installs: e.installs,
    });
  }
}
const cat = {
  catalogVersion: 1,
  updatedAt: today,
  entries,
  collections: prev?.collections || [{ id: 'featured', title: { en: 'Featured' }, entries: [] }],
};
fs.writeFileSync(o.out, JSON.stringify(cat, null, 2) + '\n');
console.log(`${entries.length} entries from ${o.series.length} series -> ${o.out}`);
