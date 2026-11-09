#!/usr/bin/env node
// Stage one series (a future course repo) from several bundle folders. Dry: copies into --out, pushes nothing.
// Usage: node tools/publish/stage-series.mjs --series <id> --out <dir> --from <bundleDir>... \
//          [--org ORG-PLACEHOLDER] [--meta series-meta.json] [--link] [--min-free-gb 2]
// series-meta.json: { title, audience, board, grade, subjects[], license, languages[] }  (all optional defaults)
// Never overwrites a manifest field that already exists. Authoring-only files are skipped (exclude.txt).
// --link hard-links files instead of copying when source and out share a filesystem (manifests are rewritten as new files).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '../..');
const WARN_MB = 800;

// ---- args
const a = process.argv.slice(2);
const opt = { from: [], org: 'ORG-PLACEHOLDER', minFree: 2 };
for (let i = 0; i < a.length; i++) {
  const k = a[i];
  if (k === '--series') opt.series = a[++i];
  else if (k === '--out') opt.out = path.resolve(a[++i]);
  else if (k === '--org') opt.org = a[++i];
  else if (k === '--meta') opt.meta = a[++i];
  else if (k === '--link') opt.link = true;
  else if (k === '--min-free-gb') opt.minFree = Number(a[++i]);
  else if (k === '--from') { while (a[i + 1] && !a[i + 1].startsWith('--')) opt.from.push(path.resolve(a[++i])); }
  else { console.error(`Unknown argument ${k}`); process.exit(2); }
}
if (!opt.series || !opt.out || !opt.from.length) {
  console.error('Usage: stage-series.mjs --series <id> --out <dir> --from <bundleDir>... [--org ORG] [--meta file] [--link] [--min-free-gb N]');
  process.exit(2);
}
const meta = opt.meta ? JSON.parse(fs.readFileSync(opt.meta, 'utf8')) : {};

// ---- helpers
const patterns = fs.readFileSync(path.join(HERE, 'exclude.txt'), 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
const rx = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const excluders = patterns.map(rx);
const excluded = (name) => excluders.some((r) => r.test(name));

function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}
const sizeOf = (files, base) => files.reduce((n, f) => n + fs.statSync(path.join(base, f)).size, 0);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeFresh = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); try { fs.unlinkSync(p); } catch {} fs.writeFileSync(p, text); };
const fmtMB = (n) => (n / 1048576).toFixed(1) + ' MB';

// Map the nearest LICENSE file above a bundle to an SPDX id; "SEE-LICENSE" when unsure.
function detectLicense(dir) {
  for (let d = dir; d !== path.dirname(d); d = path.dirname(d)) {
    const f = fs.readdirSync(d).find((n) => /^(LICENSE|LICENCE|COPYING)(\.\w+)?$/i.test(n));
    if (!f) continue;
    const t = fs.readFileSync(path.join(d, f), 'utf8').slice(0, 3000);
    if (/^\s*MIT License/i.test(t)) return { id: 'MIT', from: path.join(d, f) };
    if (/Apache License,? Version 2\.0/i.test(t)) return { id: 'Apache-2.0', from: path.join(d, f) };
    if (/Attribution 4\.0/i.test(t)) return { id: 'CC-BY-4.0', from: path.join(d, f) };
    if (/Attribution-ShareAlike 4\.0/i.test(t)) return { id: 'CC-BY-SA-4.0', from: path.join(d, f) };
    return { id: 'SEE-LICENSE', from: path.join(d, f) };
  }
  return { id: 'SEE-LICENSE', from: null };
}

function detectFeatures(dir, m, files) {
  let story = false, games = false;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"lessonMode"\s*:\s*"story"/.test(txt)) story = true;
    if (/"type"\s*:\s*"(mini-game|arcade)[a-z0-9-]*@/.test(txt)) games = true;
    if (story && games) break;
  }
  const practice = (Array.isArray(m.banks) && m.banks.length > 0) || files.some((f) => f.startsWith('questions/') && f.endsWith('.json'));
  return { story, games, practice };
}

// ---- 0. disk check
const sources = opt.from.map((dir) => {
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) { console.error(`No manifest.json in ${dir}`); process.exit(2); }
  const m = readJson(path.join(dir, 'manifest.json'));
  const files = walk(dir);
  return { dir, m, files, bytes: sizeOf(files, dir) };
});
fs.mkdirSync(path.dirname(opt.out), { recursive: true });
const sameFs = fs.statSync(sources[0].dir).dev === fs.statSync(path.dirname(opt.out)).dev;
const useLink = !!opt.link && sameFs;
if (opt.link && !sameFs) console.warn('WARN --link ignored: source and out are on different filesystems');
const need = useLink ? 0 : sources.reduce((n, s) => n + s.bytes, 0);
const sf = fs.statfsSync(path.dirname(opt.out));
const freeAfter = sf.bavail * sf.bsize - need;
if (freeAfter < opt.minFree * 1073741824) {
  console.error(`SKIP ${opt.series}: would leave ${(freeAfter / 1073741824).toFixed(2)} GB free (< ${opt.minFree} GB). Need ${fmtMB(need)}.`);
  process.exit(3);
}

// ---- 1. copy bundles
fs.rmSync(opt.out, { recursive: true, force: true });
fs.mkdirSync(opt.out, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const staged = [];
const flags = [];
for (const s of sources) {
  const id = s.m.bundleId || path.basename(s.dir);
  const dest = path.join(opt.out, id);
  if (fs.existsSync(dest)) { console.error(`Duplicate bundleId ${id}`); process.exit(2); }
  for (const f of s.files) {
    const to = path.join(dest, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (useLink) fs.linkSync(path.join(s.dir, f), to); else fs.copyFileSync(path.join(s.dir, f), to);
  }
  // ---- 2. manifest metadata: fill only what is absent
  const m = { ...s.m };
  const lic = detectLicense(s.dir);
  const feat = detectFeatures(s.dir, m, s.files);
  const defaults = {
    schemaVersion: 1,
    audience: meta.audience || 'school',
    board: meta.board,
    subjects: meta.subjects || (m.subject ? [m.subject] : undefined),
    languages: meta.languages || ['en'],
    repository: { url: `https://github.com/${opt.org}/${opt.series}`, issues: `https://github.com/${opt.org}/${opt.series}/issues` },
    license: meta.license || lic.id,
    version: '1.0.0',
    updatedAt: today,
    features: { story: feat.story, games: feat.games, practice: feat.practice },
  };
  if (m.grade === undefined && meta.grade !== undefined) defaults.grade = meta.grade;
  const filled = [];
  for (const [k, v] of Object.entries(defaults)) if (v !== undefined && !(k in m)) { m[k] = v; filled.push(k); }
  if (!meta.license && !('license' in s.m) && lic.id === 'SEE-LICENSE') flags.push(`${id}: licence not recognised (${lic.from || 'no LICENSE file found above the bundle'}); wrote SEE-LICENSE`);
  writeFresh(path.join(dest, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  staged.push({ id, title: m.title?.en || id, dest, files: s.files.length, filled, license: m.license });
}

// ---- 3. series files
const bm = {
  bundleManifestId: opt.series,
  title: { en: meta.title || opt.series },
  sources: staged.map((b) => ({ manifestUrl: `${b.id}/manifest.json` })),
};
writeFresh(path.join(opt.out, 'bundle-manifest.json'), JSON.stringify(bm, null, 2) + '\n');

// validators + the two engine files manifest.js imports
fs.cpSync(path.join(ENGINE, 'tools/validation'), path.join(opt.out, 'tools/validation'), { recursive: true });
for (const f of ['engineVersion.js', 'ErrorReporter.js']) {
  fs.mkdirSync(path.join(opt.out, 'src/core'), { recursive: true });
  fs.copyFileSync(path.join(ENGINE, 'src/core', f), path.join(opt.out, 'src/core', f));
}
fs.mkdirSync(path.join(opt.out, '.github/workflows'), { recursive: true });
fs.copyFileSync(path.join(HERE, 'course-repo-pages.yml'), path.join(opt.out, '.github/workflows/pages.yml'));
fs.writeFileSync(path.join(opt.out, '.nojekyll'), '');

const site = `https://${opt.org}.github.io`;
const seriesUrl = `${site}/${opt.series}/bundle-manifest.json`;
const licenses = [...new Set(staged.map((b) => b.license))].join(', ');
fs.writeFileSync(path.join(opt.out, 'README.md'), [
  `# ${meta.title || opt.series}`,
  '',
  'Courses for [CoAuthor](' + `${site}/coauthor/` + '), an offline-capable learning app.',
  '',
  '## Courses',
  ...staged.map((b) => `- ${b.title} (\`${b.id}\`)`),
  '',
  '## Add these courses',
  `1. Open the app: ${site}/coauthor/`,
  '2. Open the Parent area, then Settings, then Course sources.',
  `3. Add this address: ${seriesUrl}`,
  '',
  'Once the Discover list is live, you can also find these courses in Discover.',
  '',
  '## Licence',
  licenses,
  '',
  '## Feedback',
  `Report problems at https://github.com/${opt.org}/${opt.series}/issues`,
  '',
].join('\n'));

// ---- 4. integrity (engine's own validator: bundles may reference engine-root files like /src/simulations/...)
console.log(`== ${opt.series}`);
let fail = 0;
const r = spawnSync(process.execPath, [path.join(ENGINE, 'tools/validation/bundle-integrity.mjs'), ...staged.map((b) => b.dest)], { encoding: 'utf8' });
for (const line of r.stdout.split('\n')) if (/^(PASS|FAIL)/.test(line)) { console.log(line); if (line.startsWith('FAIL')) fail++; }
if (r.status !== 0 && !fail) console.log('integrity run error: ' + (r.stderr || r.stdout).slice(0, 300));
if (fail) {
  console.log('-- first problems:');
  console.log(r.stdout.split('\n').filter((l) => /^\s+\S/.test(l)).slice(0, 12).join('\n'));
}
const all = walk(opt.out);
const total = sizeOf(all, opt.out);
console.log(`TOTAL ${fmtMB(total)}${useLink ? ' (hard-linked, no extra disk)' : ''}  bundles=${staged.length}  integrity=${fail ? fail + ' FAIL' : 'all PASS'}`);
if (total > WARN_MB * 1048576) console.warn(`WARN over ${WARN_MB} MB; the Pages site cap is 1 GB. Split this series.`);
for (const f of flags) console.warn('FLAG ' + f);
