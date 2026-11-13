#!/usr/bin/env node
// make-landing.mjs: write a showcase index.html into each staged course repo
// (task Q-53a, spec docs/sprints/wip/november-plan/specs/W-share.md).
//
// The page is the link a teacher shares (WhatsApp, a class group): it shows the
// course, lists its modules, and sends the learner into the engine with the
// add-course deep link
//   <engine>#/add?src=<encodeURIComponent(bundle base URL)>[&module=<moduleId>]
// It is one self-contained file: inline CSS, inline fonts (SIL OFL, from the
// engine's vendor/fonts), an inline SVG QR of its own URL drawn at build time
// (qr-encode.mjs, MIT), and a few lines of inline script for Share / Copy. It
// makes no request outside the course repo. The raw JSON hosting is untouched.
//
// Inputs per folder: bundle-manifest.json, each source's manifest.json and its
// module JSON files. Optional landing fields (bundle-manifest.json first, else
// the first course manifest that has them; paths relative to that file):
//   blurb {en}, description {en}, highlights [{en}], screenshots [path], screencast path, cover path
// Derived from the content (src/core/showcaseMeta.js, shared with Discover): Narrated, the syllabus line.
// Missing fields fall back to a generated description and cover.
//
// Usage:
//   node coauthor/tools/publish/make-landing.mjs                 # the 4 default folders
//   node coauthor/tools/publish/make-landing.mjs --root DIR a b  # named folders under DIR
//   options: --origin https://coauthor-ed.github.io  --engine <url>  --no-fonts  --dry-run  --no-cover-jpg
// A folder with no cover of its own also gets cover.jpg (1200x630, <=150 KB):
// the generated cover drawn by Playwright, used as og:image so a WhatsApp
// link shows a picture. --no-cover-jpg skips it (the page then has no og:image).
// Rerun after every staging (stage-all.sh rewrites the folders but keeps index.html).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { qrSvg } from './qr-encode.mjs';
// Store-page fields and derived facts, shared with the engine's Discover (Q-47).
import { readShowcase, deriveFacts, syllabusAlignment, INDEPENDENCE_NOTE } from '../../src/core/showcaseMeta.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_FOLDERS = ['cbse-grade9-science', 'cbse-grade9-maths', 'cbse-grade9-sst', 'college-epidemiology'];

// ---------- args ----------
const args = process.argv.slice(2);
const opt = { root: '/workspace/untracked/publish-staging', origin: 'https://coauthor-ed.github.io', engine: null, fonts: true, dry: false, coverJpg: true, folders: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--root') opt.root = args[++i];
  else if (a === '--origin') opt.origin = args[++i].replace(/\/+$/, '');
  else if (a === '--engine') opt.engine = args[++i];
  else if (a === '--no-fonts') opt.fonts = false;
  else if (a === '--dry-run') opt.dry = true;
  else if (a === '--no-cover-jpg') opt.coverJpg = false;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 24).join('\n')); process.exit(0); }
  else opt.folders.push(a);
}
if (!opt.engine) opt.engine = `${opt.origin}/coauthor/`;
if (!opt.folders.length) opt.folders = DEFAULT_FOLDERS;

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Learner-facing text from an i18n field ({en}) or a plain string; anything else is ignored.
const t = (v) => (v && typeof v === 'object' ? (typeof v.en === 'string' ? v.en : '') : typeof v === 'string' ? v : '').trim();
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };
// Non-ASCII -> numeric entity, so the written file is ASCII-clean.
const asciiOnly = (html) => html.replace(/[^\x00-\x7f]/gu, (c) => `&#x${c.codePointAt(0).toString(16)};`);
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const trunc = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '...');

// A bundle-relative asset path: no scheme, no "..", no leading slash, safe characters only.
function safeAsset(p, kinds) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/^\.\//, '');
  if (!s || s.startsWith('/') || /^[a-z]+:/i.test(s) || s.split('/').includes('..')) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(s)) return null;
  if (!kinds.test(s)) return null;
  return s;
}
const IMG = /\.(jpe?g|png|webp)$/i;
const VID = /\.(mp4|webm)$/i;

// ---------- data ----------
const SUBJECT_NAMES = { science: 'Science', mathematics: 'Mathematics', maths: 'Mathematics', 'social-science': 'Social Science', sst: 'Social Science', epidemiology: 'Epidemiology' };

function loadFolder(dir) {
  const bm = readJson(path.join(dir, 'bundle-manifest.json'));
  const courses = [];
  for (const src of bm.sources || []) {
    const rel = String(src.manifestUrl || '');
    if (/^[a-z]+:/i.test(rel)) continue; // only bundle-local sources are described
    const mp = path.join(dir, rel);
    const m = tryJson(mp);
    if (!m) { console.warn(`  ! cannot read ${rel}`); continue; }
    const cdir = path.dirname(mp);
    const modules = [];
    for (const modRel of m.modules || []) {
      const mod = tryJson(path.join(cdir, modRel));
      if (!mod || !mod.id) continue;
      const lessonJsons = (mod.lessons || []).map((l) => (l.lessonRef ? tryJson(path.join(cdir, l.lessonRef)) : null));
      const lessons = (mod.lessons || []).map((l, i) => t(l.title) || t((lessonJsons[i] || {}).title)).filter(Boolean);
      const facts = deriveFacts(lessonJsons);
      const alignment = syllabusAlignment(facts.chapterIds, { board: m.board, grade: m.grade, subject: (m.subjects || [])[0] || m.subject });
      modules.push({ id: String(mod.id), title: t(mod.title) || t(m.title), description: t(mod.description), lessons, look: mod.look || null,
        blurb: readShowcase(m).blurb, narrated: facts.narrated, chapterIds: facts.chapterIds, alignment });
    }
    courses.push({ rel, dir: path.relative(dir, cdir).split(path.sep).join('/'), m, modules, hasSims: fs.existsSync(path.join(cdir, 'simulations')) });
  }
  // Optional landing fields: bundle manifest first, else the first course that has them.
  // A store field of one course stands for the bundle only when it is the only course (Q-47:
  // every module now carries its own cover and shots); description keeps the old first-course fallback.
  const pick = (key) => {
    if (bm[key] !== undefined) return { v: bm[key], base: '' };
    if (courses.length > 1 && key !== 'description') return { v: undefined, base: '' };
    for (const c of courses) if (c.m[key] !== undefined) return { v: c.m[key], base: c.dir ? c.dir + '/' : '' };
    return { v: undefined, base: '' };
  };
  const asset = (key, kinds) => {
    const { v: raw, base } = pick(key);
    const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.src : raw; // { src, poster } form
    const s = safeAsset(v, kinds);
    if (v !== undefined && !s) console.warn(`  ! ${key}: ignored unsafe or unsupported path ${JSON.stringify(v)}`);
    if (!s) return null;
    const full = base + s;
    if (!fs.existsSync(path.join(dir, full))) { console.warn(`  ! ${key}: ${full} not found, skipped`); return null; }
    return full;
  };
  const shotsField = pick('screenshots');
  const screenshots = (Array.isArray(shotsField.v) ? shotsField.v : []).map((p) => {
    const s = safeAsset(p && typeof p === 'object' ? p.src : p, IMG); // path or { src, caption }
    if (!s) { console.warn(`  ! screenshots: ignored ${JSON.stringify(p)}`); return null; }
    const full = shotsField.base + s;
    if (!fs.existsSync(path.join(dir, full))) { console.warn(`  ! screenshots: ${full} not found, skipped`); return null; }
    return full;
  }).filter(Boolean).slice(0, 12);
  const hl = pick('highlights').v;
  const highlights = (Array.isArray(hl) ? hl : []).map(t).filter(Boolean).slice(0, 8);

  const first = (courses[0] || {}).m || {};
  const modules = courses.flatMap((c) => c.modules);
  const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0);
  const audience = courses.some((c) => c.m.audience === 'college') ? 'college' : 'school';
  const look = audience === 'college' || modules.some((m) => m.look === 'plain') ? 'plain' : 'quill';
  const subjects = [...new Set(courses.flatMap((c) => c.m.subjects || (c.m.subject ? [c.m.subject] : [])))];
  const subject = subjects[0] || '';
  const grade = first.grade;
  const board = first.board || '';
  const repo = (first.repository && typeof first.repository.url === 'string' && /^https:\/\//.test(first.repository.url)) ? first.repository : null;
  return {
    bm, courses, modules, lessonCount, audience, look, subject, subjects, grade, board, repo,
    title: t(bm.title) || t(first.title) || path.basename(dir),
    blurb: t(pick('blurb').v),
    narrated: modules.some((m) => m.narrated),
    alignment: syllabusAlignment(modules.flatMap((m) => m.chapterIds), { board: first.board, grade: first.grade, subject: subjects[0] }),
    description: t(pick('description').v),
    highlights, screenshots,
    screencast: asset('screencast', VID),
    cover: asset('cover', IMG),
    license: typeof first.license === 'string' ? first.license : '',
    version: typeof first.version === 'string' ? first.version : '',
    updatedAt: typeof first.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(first.updatedAt) ? first.updatedAt : '',
    accent: typeof first.accent === 'string' ? first.accent : 'blue',
    features: {
      sims: courses.some((c) => c.hasSims),
      practice: courses.some((c) => c.m.features && c.m.features.practice),
      games: courses.some((c) => c.m.features && c.m.features.games),
      tests: courses.some((c) => Array.isArray(c.m.tests) && c.m.tests.length),
    },
  };
}

function audienceLabel(d) {
  if (d.audience === 'college') return 'College and university';
  const parts = [];
  if (d.board) parts.push(d.board);
  if (d.grade !== undefined && d.grade !== null && d.grade !== '') parts.push(`Class ${d.grade}`);
  return parts.join(' ') || 'School';
}

function makeDescription(d) {
  if (d.description) return d.description;
  if (d.modules.length === 1 && d.modules[0].description) return d.modules[0].description;
  const subj = SUBJECT_NAMES[d.subject] || d.subject;
  const bits = [];
  if (d.features.sims) bits.push('interactive simulations');
  if (d.features.practice) bits.push('practice questions');
  if (d.features.tests) bits.push('chapter tests');
  if (d.features.games && d.look === 'quill') bits.push('quick review games');
  const list = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0] || 'clear explanations';
  const who = d.audience === 'college' ? '' : ` for ${audienceLabel(d)}`;
  return `${subj ? subj + ' lessons' : 'Lessons'}${who}, with ${list}.`;
}

// ---------- art ----------
const ICONS = {
  // 48x48 line glyphs, stroke = currentColor. Chunky, round caps.
  science: '<path d="M18 5h12M21 5v13L9.5 37.5A4.5 4.5 0 0 0 13.4 44h21.2a4.5 4.5 0 0 0 3.9-6.5L27 18V5"/><path class="fill" d="M13.6 31h20.8l3.6 6.7a2.4 2.4 0 0 1-2.1 3.5H12.1a2.4 2.4 0 0 1-2.1-3.5z"/><circle class="fill" cx="21" cy="25" r="1.8"/><circle class="fill" cx="27" cy="21" r="1.4"/>',
  mathematics: '<path d="M8 14h12M14 8v12M28 14h12M9 30l10 10M19 30L9 40M28 32h12M28 39h12"/>',
  'social-science': '<circle cx="24" cy="24" r="18"/><path d="M6 24h36M24 6c-6 5-8.5 11-8.5 18S18 37 24 42M24 6c6 5 8.5 11 8.5 18S30 37 24 42M9 14.5h30M9 33.5h30"/>',
  epidemiology: '<path d="M6 42h36M10 42V30M17 42V20M24 42V12M31 42V22M38 42V33"/><path d="M8 26C14 22 18 10 24 8s11 12 16 20" stroke-dasharray="0.1 5"/>',
  default: '<path d="M24 12c-5-4-11-5-18-4v29c7-1 13 0 18 4 5-4 11-5 18-4V8c-7-1-13 0-18 4zM24 12v29"/>',
};
const icon = (subject, cls = '') => `<svg class="glyph ${cls}" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${ICONS[subject] || ICONS.default}</svg>`;

// Quill: a small lit world. A shelf of books (one per module) and the subject's
// emblem as the hero; sun by day, moon and stars by night (tokens flip).
function quillCover(d) {
  const h = hash(d.bm.bundleManifestId || d.title);
  const n = Math.max(4, Math.min(8, d.modules.length));
  const books = [];
  let x = 36;
  for (let i = 0; i < n; i++) {
    const r = (h >>> (i * 3)) & 7;
    const w = 26 + (r % 3) * 6;
    const ht = 118 + ((r * 19 + i * 23) % 70);
    const col = `var(--s${(i % 6) + 1})`;
    const lean = i === n - 1;
    const y = 300 - ht;
    const g = `<g class="book"${lean ? ` transform="rotate(14 ${x + w} 300)"` : ''}>`
      + `<rect x="${x}" y="${y}" width="${w}" height="${ht}" rx="6" style="fill:${col};stroke:color-mix(in srgb, ${col} 62%, var(--lip-ink))" stroke-width="3"/>`
      + `<rect x="${x + 5}" y="${y + 6}" width="5" height="${ht - 12}" rx="2.5" style="fill:var(--on-fill)" opacity=".28"/>`
      + `<rect x="${x + 3}" y="${y + 18}" width="${w - 6}" height="5" rx="2" style="fill:color-mix(in srgb, ${col} 55%, var(--on-fill))"/>`
      + `<rect x="${x + 3}" y="${y + ht - 26}" width="${w - 6}" height="5" rx="2" style="fill:color-mix(in srgb, ${col} 55%, var(--on-fill))"/>`
      + '</g>';
    books.push(g);
    x += w + (lean ? 12 : 3);
  }
  const stars = [[150, 60], [228, 40], [300, 96], [376, 34], [520, 70], [556, 150], [262, 150], [180, 128]]
    .map(([sx, sy], i) => `<circle cx="${sx}" cy="${sy}" r="${i % 3 ? 2 : 3}"/>`).join('');
  const glyph = (ICONS[d.subject] || ICONS.default).replace(/<path class="fill"/g, '<path class="fill" fill="currentColor" stroke="none"').replace(/<circle class="fill"/g, '<circle class="fill" fill="currentColor" stroke="none"');
  const grade = d.grade !== undefined && d.grade !== null && d.grade !== '' ? `Class ${d.grade}` : (SUBJECT_NAMES[d.subject] || '');
  return `<svg class="cover-art" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(d.title)}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky-top)"/><stop offset="1" style="stop-color:var(--sky-bottom)"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" style="stop-color:var(--sun)" stop-opacity=".55"/><stop offset="1" style="stop-color:var(--sun)" stop-opacity="0"/></radialGradient></defs>
<rect width="600" height="400" fill="url(#sky)"/>
<g class="stars" style="fill:var(--star)">${stars}</g>
<g class="clouds" style="fill:var(--cloud)"><rect x="196" y="70" width="92" height="26" rx="13"/><rect x="220" y="56" width="44" height="30" rx="15"/><rect x="470" y="118" width="70" height="20" rx="10"/></g>
<circle cx="92" cy="86" r="78" fill="url(#glow)"/>
<circle cx="92" cy="86" r="32" style="fill:var(--sun)"/>
<circle class="moon-cut" cx="108" cy="76" r="27" style="fill:var(--sky-top)"/>
<ellipse cx="300" cy="352" rx="290" ry="26" style="fill:var(--floor-shade)"/>
<rect x="20" y="300" width="560" height="26" rx="10" style="fill:var(--shelf)"/>
<rect x="20" y="318" width="560" height="10" rx="5" style="fill:var(--shelf-lip)"/>
<rect x="34" y="304" width="532" height="5" rx="2.5" style="fill:var(--on-fill)" opacity=".22"/>
${books.join('\n')}
<g transform="translate(436 188)">
<circle r="112" style="fill:var(--sun)" opacity=".18"/>
<circle r="96" style="fill:var(--emblem);stroke:var(--emblem-rim)" stroke-width="6"/>
<circle r="80" style="fill:var(--emblem-face)"/>
<path d="M-62 -38 A 74 74 0 0 1 -14 -72" fill="none" style="stroke:var(--on-fill)" stroke-width="7" stroke-linecap="round" opacity=".55"/>
<g transform="translate(-48 -58) scale(2)" style="color:var(--primary)" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
<g transform="translate(0 66)"><rect x="-56" y="-18" width="112" height="40" rx="20" style="fill:var(--primary-lip)"/><rect x="-56" y="-22" width="112" height="38" rx="19" style="fill:var(--primary)"/><text y="5" text-anchor="middle" class="cover-pill">${esc(grade)}</text></g>
</g>
</svg>`;
}

// Plain: an editorial cover. Navy field, brass rules, serif title, and a
// small data motif (an epidemic-curve histogram) hashed from the bundle id.
function plainCover(d) {
  const h = hash(d.bm.bundleManifestId || d.title);
  const bars = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const p = (i + 0.5) / N;
    const base = Math.exp(-Math.pow((p - 0.38) / 0.17, 2)) * 0.85 + Math.exp(-Math.pow((p - 0.74) / 0.1, 2)) * 0.35;
    const jitter = (((h >>> (i % 24)) & 7) - 3.5) * 0.025;
    const v = Math.max(0.05, Math.min(1, base + jitter + 0.05));
    bars.push(`<rect x="${(i * 18 + 2).toFixed(1)}" y="${(120 - v * 110).toFixed(1)}" width="14" height="${(v * 110).toFixed(1)}"${i === 8 ? ' class="mark"' : ''}/>`);
  }
  return `<div class="cover-plain" role="img" aria-label="${esc(d.title)}">
<div class="cp-frame"></div>
<p class="cp-kicker">${esc(SUBJECT_NAMES[d.subject] || 'Course')}</p>
<p class="cp-title">${esc(d.title)}</p>
<p class="cp-sub">${esc(plural(d.lessonCount, 'lesson'))} &middot; CoAuthor</p>
<svg class="cp-chart" viewBox="0 0 396 132" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="121" x2="396" y2="121" class="axis"/><g class="bars">${bars.join('')}</g><line x1="153" y1="0" x2="153" y2="121" class="annot"/></svg>
</div>`;
}

// ---------- fonts ----------
function fontFaces(look) {
  if (!opt.fonts) return '';
  const f = (fam, file, weight, fmt) => {
    const p = path.join(ENGINE_ROOT, 'vendor', 'fonts', file);
    if (!fs.existsSync(p)) { console.warn(`  ! font ${file} not found; using system fallback`); return ''; }
    return `@font-face{font-family:'${fam}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/${fmt};base64,${fs.readFileSync(p).toString('base64')}) format('${fmt === 'ttf' ? 'truetype' : 'woff2'}')}`;
  };
  if (look === 'plain') return f('Antic Didone', 'antic-didone/antic-didone-regular.ttf', '400', 'ttf');
  return f('Fredoka', 'fredoka/Fredoka-latin.woff2', '400 700', 'woff2') + '\n' + f('Nunito', 'nunito/Nunito-latin.woff2', '400 900', 'woff2');
}

// ---------- tokens (defined once; dark by prefers-color-scheme) ----------
const PLAIN_ACCENTS = {
  blue: ['#1a5cdf', '#0d45b0', '#dcedff', '#81aaf7', '#81aaf7', '#1d2d4c'],
  crimson: ['#a51d36', '#a51d36', '#f7e4e5', '#f0889a', '#f0889a', '#3b1d27'],
  teal: ['#0d6b68', '#0b605d', '#dcefec', '#62c6bb', '#62c6bb', '#12302f'],
  indigo: ['#3d3fa0', '#3d3fa0', '#e7e7f7', '#a8abf4', '#a8abf4', '#22244a'],
  ochre: ['#a8650a', '#8a5208', '#f6ead3', '#e8b25a', '#e8b25a', '#35290f'],
  green: ['#2d6a2a', '#2a6227', '#e2efdb', '#92d184', '#92d184', '#1a2f19'],
};

function tokens(d) {
  if (d.look === 'plain') {
    const a = PLAIN_ACCENTS[d.accent] || PLAIN_ACCENTS.blue;
    return `:root{color-scheme:light dark;
--bg:#fbfaf4;--surface:#fdfdf9;--panel:#f1f1e8;--ink:#1f1614;--ink-soft:#3b302d;--ink-muted:#594d48;
--rule:#d5cfc2;--rule-strong:#1f1614;--sig:${a[0]};--sig-ink:${a[1]};--sig-tint:${a[2]};
--hl:#ddfc6e;--hl-hover:#eaffaa;--hl-ink:#1f1614;--brass:#b08c48;--brass-ink:#8a6a2c;
--navy-1:#15304c;--navy-2:#1f4569;--on-navy:#f4f1e6;--on-navy-soft:#c9d3df;--bar:#3d5f83;--bar-mark:#cfae6c;
--shadow:0 1px 2px rgb(31 22 20 / .06),0 8px 28px rgb(31 22 20 / .08);--shadow-lift:0 2px 4px rgb(31 22 20 / .08),0 14px 36px rgb(31 22 20 / .12);
--qr-dark:#111111;--qr-light:#ffffff;--toast-bg:#1f1614;--toast-ink:#fbfaf4;
--font-display:'Antic Didone','Source Serif 4',Charter,'Iowan Old Style','Palatino Linotype',Georgia,serif;
--font-body:'Instrument Sans','Source Sans 3',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;}
@media (prefers-color-scheme:dark){:root{
--bg:#15120f;--surface:#1b1814;--panel:#24201b;--ink:#eae8df;--ink-soft:#cdcac2;--ink-muted:#a5a198;
--rule:#3a3630;--rule-strong:#eae8df;--sig:${a[3]};--sig-ink:${a[4]};--sig-tint:${a[5]};
--hl:#cae763;--hl-hover:#d6ee85;--hl-ink:#15120f;--brass:#cfae6c;--brass-ink:#cfae6c;
--navy-1:#1a3049;--navy-2:#23425f;--on-navy:#f1eee4;--on-navy-soft:#b9c6d4;--bar:#46698f;--bar-mark:#cfae6c;
--shadow:0 1px 2px rgb(0 0 0 / .3),0 8px 28px rgb(0 0 0 / .35);--shadow-lift:0 2px 4px rgb(0 0 0 / .35),0 14px 36px rgb(0 0 0 / .45);
--toast-bg:#eae8df;--toast-ink:#15120f;}}`;
  }
  return `:root{color-scheme:light dark;
--bg:#faf9f5;--surface:#ffffff;--panel:#f0eee6;--panel-2:#eae7db;--ink:#26241d;--ink-soft:#4f4d46;--ink-muted:#66645c;
--rule:#e4e1d4;--rule-strong:#cfcabb;--primary:#4b6ad3;--primary-hover:#3a55b0;--primary-lip:#2f4794;--primary-ink:#3a55b0;--primary-tint:#e6ebfa;--on-primary:#ffffff;
--gold:#e9b44c;--teal:#37804f;--teal-tint:#e2f3e7;
--s1:#2f7edb;--s2:#c17a12;--s3:#0f9d63;--s4:#c94f8a;--s5:#7c5cd6;--s6:#d64545;
--sky-top:#cfe0fb;--sky-bottom:#fbf3e3;--sun:#ffc94d;--star:transparent;--cloud:#ffffff;--floor-shade:rgb(38 36 29 / .08);
--shelf:#c98f55;--shelf-lip:#94622f;--emblem:#ffffff;--emblem-rim:#cfcabb;--emblem-face:#eef2fd;
--hero-wash:linear-gradient(180deg,#e9eefb 0%,#faf9f5 100%);
--card-shadow:0 1px 0 rgb(38 36 29 / .04),0 10px 24px rgb(38 36 29 / .07);
--on-fill:#ffffff;--lip-ink:#000000;--shine:rgb(255 255 255 / .25);
--qr-dark:#111111;--qr-light:#ffffff;--toast-bg:#26241d;--toast-ink:#faf9f5;
--font-display:'Fredoka','Nunito',system-ui,sans-serif;--font-body:'Nunito',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}
@media (prefers-color-scheme:dark){:root{
--bg:#1c1b17;--surface:#26251f;--panel:#2e2c25;--panel-2:#38352c;--ink:#f0eee6;--ink-soft:#d6d3c8;--ink-muted:#a9a598;
--rule:#3b382e;--rule-strong:#4c483b;--primary:#8ca5f2;--primary-hover:#a3b8f6;--primary-lip:#5a71bd;--primary-ink:#a3b8f6;--primary-tint:rgb(140 165 242 / .16);--on-primary:#17161a;
--gold:#efc26a;--teal:#7cc496;--teal-tint:#24382b;
--s1:#5aa8f5;--s2:#f0b429;--s3:#34d399;--s4:#f472b6;--s5:#a78bfa;--s6:#f87171;
--sky-top:#18203f;--sky-bottom:#3a3346;--sun:#f6e7b0;--star:#f6e7b0;--cloud:transparent;--floor-shade:rgb(0 0 0 / .3);
--shelf:#7a5636;--shelf-lip:#4d3420;--emblem:#2e2c25;--emblem-rim:#4c483b;--emblem-face:#252a40;
--hero-wash:linear-gradient(180deg,#1d2238 0%,#1c1b17 100%);
--card-shadow:0 1px 0 rgb(0 0 0 / .2),0 10px 24px rgb(0 0 0 / .3);
--toast-bg:#f0eee6;--toast-ink:#1c1b17;}}`;
}

// ---------- styles ----------
const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased}
img,svg,video{display:block;max-width:100%}
a{color:inherit}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
@media (min-width:600px){.wrap{padding:0 24px}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0}
.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font-family:var(--font-display);font-weight:600;font-size:1.15rem;letter-spacing:.01em}
.brand-mark{width:32px;height:32px;flex:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;cursor:pointer;border:0;font:inherit;-webkit-tap-highlight-color:transparent}
.btn svg{width:20px;height:20px;flex:none}
.hero{padding:8px 0 40px}
.hero-grid{display:grid;gap:24px}
.hero-art{order:-1}
@media (min-width:900px){.hero-grid{grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}.hero-art{order:0}.hero{padding:24px 0 56px}}
.kicker{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;padding:0;list-style:none}
h1{margin:0 0 14px;line-height:1.08}
.lede{margin:0 0 20px;color:var(--ink-soft);max-width:38em}
.facts{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 24px;padding:0;list-style:none;color:var(--ink-muted);font-size:.95rem}
.facts li{display:inline-flex;align-items:center;gap:7px}
.facts svg{width:18px;height:18px;flex:none}
.cta-row{display:flex;flex-wrap:wrap;align-items:center;gap:14px 18px}
.how{margin:16px 0 0;color:var(--ink-muted);font-size:.95rem;max-width:34em}
.inapp{display:none;margin:16px 0 0;padding:12px 14px;border-radius:12px;font-size:.92rem}
.inapp.show{display:block}
section.block{padding:40px 0}
.sec-head{margin:0 0 22px}
.sec-head h2{margin:0 0 6px}
.sec-head p{margin:0;color:var(--ink-muted)}
.mods{display:grid;gap:16px;margin:0;padding:0;list-style:none}
@media (min-width:860px){.mods{grid-template-columns:1fr 1fr}.mods.single{grid-template-columns:1fr}}
.mod details{margin-top:4px}
.mod summary{cursor:pointer;color:var(--ink-muted);font-size:.93rem;list-style:none;display:inline-flex;align-items:center;gap:6px;padding:4px 0}
.mod summary::-webkit-details-marker{display:none}
.mod summary::before{content:"";width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
.mod details[open] summary::before{transform:rotate(45deg)}
.mod ol{margin:8px 0 0;padding:0 0 0 22px;color:var(--ink-soft);font-size:.95rem}
.mod ol li{padding:3px 0}
.shots{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 14px;margin:0;list-style:none}
.shots li{flex:0 0 86%;scroll-snap-align:start}
@media (min-width:860px){.shots li{flex-basis:46%}}
.shots img{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
.cast{margin-top:18px}
.cast video{width:100%;height:auto}
.hl-list{display:grid;gap:12px;margin:0;padding:0;list-style:none}
@media (min-width:700px){.hl-list{grid-template-columns:1fr 1fr}}
@media (min-width:1000px){.hl-list{grid-template-columns:1fr 1fr 1fr}}
.hl-list li{display:flex;gap:12px;align-items:flex-start;padding:16px}
.hl-list svg{width:22px;height:22px;flex:none;margin-top:2px}
.steps{display:grid;gap:14px;margin:0;padding:0;list-style:none;counter-reset:s}
.steps li{display:flex;gap:14px;align-items:flex-start;padding:16px}
.steps b{display:block}
.steps span{color:var(--ink-muted);font-size:.95rem}
.how-grid{display:grid;gap:20px}
.qr{display:none}
@media (min-width:900px){.how-grid{grid-template-columns:1fr 280px;align-items:start}.qr{display:block}}
.qr-box{background:var(--qr-light);color:var(--qr-dark);padding:10px;border-radius:12px;width:184px;margin:0 auto 12px}
.qr p{margin:0;text-align:center;font-size:.9rem;color:var(--ink-muted)}
.qr .qr-url{font-size:.8rem;word-break:break-all;margin-top:6px}
.manual{margin-top:20px;font-size:.95rem}
.manual summary{cursor:pointer;color:var(--ink-muted)}
.manual ol{padding-left:22px;color:var(--ink-soft)}
.addr{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px}
.addr code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;word-break:break-all;padding:6px 8px;border-radius:8px;background:var(--panel);color:var(--ink)}
.foot{padding:28px 0 40px;color:var(--ink-muted);font-size:.9rem;border-top:1px solid var(--rule);margin-top:24px}
.foot .wrap{display:flex;flex-wrap:wrap;gap:8px 22px;justify-content:space-between}
.foot a{color:inherit}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:var(--toast-bg);color:var(--toast-ink);padding:10px 16px;border-radius:999px;font-size:.92rem;transition:opacity .2s,transform .2s}
.toast.show{opacity:1;transform:translate(-50%,0)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const QUILL_CSS = `
h1,h2,h3,.display{font-family:var(--font-display);font-weight:600;letter-spacing:.005em}
h1{font-size:clamp(1.9rem,7vw,3.4rem)}
h2{font-size:clamp(1.5rem,4.6vw,2.1rem)}
.hero{background:var(--hero-wash)}
.brand-mark rect{fill:var(--primary)}
.brand-mark path{stroke:var(--on-primary)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:var(--surface);border:2px solid var(--rule);box-shadow:0 3px 0 var(--rule);font-weight:800;font-size:.85rem;color:var(--ink-soft)}
.chip.c1{color:var(--primary-ink);border-color:var(--primary-tint);background:var(--primary-tint);box-shadow:none}
.cover{border-radius:24px;overflow:hidden;border:3px solid var(--rule);box-shadow:0 6px 0 var(--rule),var(--card-shadow);background:var(--surface);aspect-ratio:12/5}
.cover img,.cover .cover-art{width:100%;height:100%;object-fit:cover}
@media (min-width:900px){.cover{aspect-ratio:3/2}}
.cover-pill{font-family:var(--font-display);font-weight:600;font-size:19px;fill:var(--on-primary)}
.moon-cut{opacity:0}
@media (prefers-color-scheme:dark){.moon-cut{opacity:1}}
.btn-primary{background:var(--primary);color:var(--on-primary);font-family:var(--font-display);font-weight:600;font-size:1.15rem;padding:16px 26px;border-radius:18px;box-shadow:0 5px 0 var(--primary-lip);transition:transform .08s,box-shadow .08s,background .15s;width:100%}
@media (min-width:480px){.btn-primary{width:auto}}
.btn-primary:hover{background:var(--primary-hover)}
.btn-primary:active{transform:translateY(5px);box-shadow:0 0 0 var(--primary-lip)}
.btn-ghost{background:var(--surface);color:var(--primary-ink);font-weight:800;font-size:.95rem;padding:10px 16px;border-radius:14px;border:2px solid var(--rule-strong);box-shadow:0 4px 0 var(--rule-strong);transition:transform .08s,box-shadow .08s}
.btn-ghost:hover{border-color:var(--primary);box-shadow:0 4px 0 var(--primary-lip)}
.btn-ghost:active{transform:translateY(4px);box-shadow:none}
.btn-small{padding:7px 12px;font-size:.88rem;border-radius:12px}
.btn:focus-visible{outline:3px solid var(--primary);outline-offset:3px}
.facts svg{color:var(--teal)}
.panel{background:var(--surface);border:2px solid var(--rule);border-radius:20px;box-shadow:0 4px 0 var(--rule)}
.mod{display:flex;flex-direction:column;gap:12px;padding:18px}
.mod-head{display:flex;gap:14px;align-items:flex-start}
.mod-num{flex:none;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-family:var(--font-display);font-weight:600;font-size:1.5rem;color:var(--on-fill);background:var(--mc);box-shadow:0 4px 0 color-mix(in srgb,var(--mc) 62%,var(--lip-ink)),inset 0 3px 0 var(--shine)}
.mod h3{margin:2px 0 2px;font-size:1.22rem;line-height:1.25}
.mod .meta{margin:0;color:var(--ink-muted);font-size:.92rem;font-weight:700}
.mod-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:auto}
.mod ol li::marker{color:var(--mc);font-weight:800}
.shots img{border-radius:16px;border:3px solid var(--rule)}
.cast video{border-radius:16px;border:3px solid var(--rule)}
.hl-list li{background:var(--surface);border:2px solid var(--rule);border-radius:18px;box-shadow:0 4px 0 var(--rule);font-weight:700}
.hl-list svg{color:var(--teal)}
.steps li{background:var(--surface);border:2px solid var(--rule);border-radius:18px;box-shadow:0 4px 0 var(--rule)}
.steps li::before{counter-increment:s;content:counter(s);flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-family:var(--font-display);font-weight:600;font-size:1.2rem;color:var(--on-primary);background:var(--primary);box-shadow:0 3px 0 var(--primary-lip)}
.steps b{font-family:var(--font-display);font-weight:600;font-size:1.08rem}
@media (min-width:700px){.steps{grid-template-columns:repeat(3,1fr)}.steps li{flex-direction:column}}
.qr{padding:18px}
.inapp{background:var(--primary-tint);color:var(--ink)}
.band{background:var(--panel)}
`;

const PLAIN_CSS = `
h1,h2,.display{font-family:var(--font-display);font-weight:400;letter-spacing:-.005em}
h1{font-size:clamp(2.3rem,8vw,3.9rem);line-height:1.04}
h2{font-size:clamp(1.7rem,5vw,2.3rem)}
h3{font-family:var(--font-body);font-weight:600}
.top{border-bottom:1px solid var(--rule)}
.brand{font-family:var(--font-display);font-weight:400;font-size:1.3rem}
.brand-mark rect{fill:var(--navy-1)}
.brand-mark path{stroke:var(--on-navy)}
.hero{padding-top:28px}
.kicker{gap:6px 14px}
.chip{font-size:.78rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--sig-ink)}
.chip+.chip{color:var(--ink-muted)}
.chip.c1::before{content:"";display:inline-block;width:22px;height:2px;background:var(--sig);vertical-align:middle;margin-right:10px;transform:translateY(-2px)}
.lede{font-size:1.02rem}
@media (min-width:900px){.lede{font-size:1.12rem}}
.cover{border-radius:12px;overflow:hidden;box-shadow:var(--shadow);aspect-ratio:12/5}
@media (min-width:900px){.cover{aspect-ratio:4/5;max-width:420px;justify-self:end;width:100%}}
.cover img{width:100%;height:100%;object-fit:cover}
.cover-plain{position:relative;height:100%;background:linear-gradient(150deg,var(--navy-1),var(--navy-2));color:var(--on-navy);padding:22px 24px;display:flex;flex-direction:column}
.cp-frame{position:absolute;inset:10px;border:1px solid var(--bar-mark);opacity:.55;border-radius:6px;pointer-events:none}
.cp-kicker{margin:0;font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--bar-mark);font-weight:600}
.cp-title{margin:8px 0 0;font-family:var(--font-display);font-size:clamp(1.6rem,6vw,2.6rem);line-height:1.05;max-width:12ch}
.cp-sub{margin:8px 0 0;font-size:.82rem;color:var(--on-navy-soft)}
.cp-chart{position:absolute;left:24px;right:24px;bottom:20px;width:calc(100% - 48px);height:52%}
.cp-chart .bars rect{fill:var(--bar)}
.cp-chart .bars rect.mark{fill:var(--bar-mark)}
.cp-chart .axis{stroke:var(--on-navy-soft);stroke-width:1.2;opacity:.6}
.cp-chart .annot{stroke:var(--bar-mark);stroke-width:1.2;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
@media (max-width:899px){.cover-plain{padding:18px 20px}.cp-title{max-width:52%;font-size:clamp(1.3rem,5.6vw,2.2rem)}.cp-chart{left:auto;right:20px;width:40%;height:62%;bottom:18px}}
.btn-primary{background:var(--hl);color:var(--hl-ink);border:1px solid var(--rule-strong);font-weight:600;font-size:1.05rem;padding:15px 24px;border-radius:6px;transition:background .15s,transform .15s,box-shadow .15s;width:100%}
@media (min-width:480px){.btn-primary{width:auto}}
.btn-primary:hover{background:var(--hl-hover);transform:translateY(-1px);box-shadow:var(--shadow)}
.btn-ghost{background:transparent;color:var(--sig-ink);font-weight:600;font-size:.93rem;padding:9px 14px;border-radius:6px;border:1px solid var(--rule);transition:border-color .15s,background .15s}
.btn-ghost:hover{border-color:var(--sig);background:var(--sig-tint)}
.btn-small{padding:6px 12px;font-size:.88rem}
.btn:focus-visible{outline:2px solid var(--sig);outline-offset:3px}
.facts{font-size:.92rem}
.facts svg{color:var(--sig)}
.panel{background:var(--surface);border:1px solid var(--rule);border-radius:12px;box-shadow:var(--shadow)}
.sec-head{border-top:2px solid var(--rule-strong);padding-top:12px;display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
.sec-head p{font-size:.85rem;letter-spacing:.1em;text-transform:uppercase}
.mod{padding:22px 22px 18px}
.mod-head{display:flex;gap:16px;align-items:baseline;border-bottom:1px solid var(--rule);padding-bottom:14px;margin-bottom:6px}
.mod-num{font-family:var(--font-display);font-size:2.4rem;line-height:1;color:var(--brass);min-width:1.4em}
.mod h3{margin:0 0 4px;font-family:var(--font-display);font-weight:400;font-size:1.6rem;line-height:1.15}
.mod .meta{margin:0;color:var(--ink-muted);font-size:.8rem;letter-spacing:.1em;text-transform:uppercase}
.mod .desc{margin:10px 0 0;color:var(--ink-soft);font-size:.98rem}
.mod ol{list-style:none;padding:0;counter-reset:l;font-size:1rem}
.mod ol li{counter-increment:l;display:grid;grid-template-columns:2.4em 1fr;gap:8px;padding:10px 0;border-bottom:1px solid var(--rule)}
.mod ol li::before{content:counter(l,decimal-leading-zero);font-family:var(--font-display);color:var(--brass-ink);font-size:1.2rem;line-height:1.3}
.mod ol li:last-child{border-bottom:0}
.mod-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
.shots img{border-radius:8px;border:1px solid var(--rule)}
.cast video{border-radius:8px;border:1px solid var(--rule)}
.hl-list li{border-top:2px solid var(--sig);padding:14px 0 0;background:none}
.hl-list svg{color:var(--sig)}
.steps li{border-top:1px solid var(--rule-strong);padding:14px 0 0}
.steps li::before{counter-increment:s;content:counter(s);font-family:var(--font-display);font-size:2.2rem;line-height:1;color:var(--brass);min-width:1em}
@media (min-width:700px){.steps{grid-template-columns:repeat(3,1fr);gap:28px}}
.qr{padding:18px}
.inapp{background:var(--sig-tint);color:var(--ink);border-radius:6px}
`;

// ---------- page ----------
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6c-2.5-2-5.5-2.5-9-2v14c3.5-.5 6.5 0 9 2 2.5-2 5.5-2.5 9-2V4c-3.5-.5-6.5 0-9 2zM12 6v14"/></svg>';
const ICON_OFFLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11M7.5 9.5L12 14l4.5-4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const BRAND_MARK = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9"/><path d="M10 22c4-1 9-6 12-13-5 1.5-9 5.5-11 10M10 22l-1.5 2.5" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function deepLink(engine, bundleBase, moduleId) {
  return `${engine}#/add?src=${encodeURIComponent(bundleBase)}${moduleId ? `&module=${encodeURIComponent(moduleId)}` : ''}`;
}

function render(folder, d) {
  const base = `${opt.origin}/${folder}/`;
  const allLink = deepLink(opt.engine, base, null);
  const desc = makeDescription(d);
  const aud = audienceLabel(d);
  const subj = SUBJECT_NAMES[d.subject] || d.subject;
  const plain = d.look === 'plain';
  const ogImage = d.cover ? base + d.cover.split('/').map(encodeURIComponent).join('/') : d.ogCover ? base + d.ogCover : '';
  const pageTitle = `${d.title} - CoAuthor`;

  const kicker = [`<li class="chip c1">${esc(aud)}</li>`];
  if (subj && !d.title.toLowerCase().includes(subj.toLowerCase())) kicker.push(`<li class="chip">${esc(subj)}</li>`);
  if (!plain) kicker.push(`<li class="chip">Free</li>`);

  const facts = [
    `<li>${ICON_BOOK}${esc(plural(d.modules.length, 'module'))}, ${esc(plural(d.lessonCount, 'lesson'))}</li>`,
    `<li>${ICON_OFFLINE}Works offline once added</li>`,
  ];
  if (d.alignment) facts.push(`<li>${ICON_BOOK}${esc(d.alignment.text)}</li>`);
  if (d.narrated) kicker.push(`<li class="chip">Narrated</li>`);
  if (d.license) facts.push(`<li>${ICON_CHECK}Free to use (${esc(d.license.replace(/-/g, ' '))})</li>`);

  const coverHtml = d.cover
    ? `<img src="${esc(d.cover)}" alt="" width="1344" height="768" decoding="async">`
    : plain ? plainCover(d) : quillCover(d);

  const modCards = d.modules.map((m, i) => {
    const link = deepLink(opt.engine, base, m.id);
    const n = d.modules.length > 1 || !plain ? String(i + 1) : '';
    const open = d.modules.length === 1 ? ' open' : '';
    const lessons = m.lessons.length
      ? `<details${open}><summary>${open ? 'Lessons' : `See the ${esc(plural(m.lessons.length, 'lesson'))}`}</summary><ol>${m.lessons.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`
      : '';
    const descP = m.description && plain && m.description !== desc ? `<p class="desc">${esc(m.description)}</p>` : '';
    return `<li class="mod panel" style="--mc:var(--s${(i % 6) + 1})">
<div class="mod-head">${n ? `<span class="mod-num" aria-hidden="true">${plain ? String(i + 1).padStart(2, '0') : n}</span>` : ''}<div><h3>${esc(m.title)}</h3><p class="meta">${esc(plural(m.lessons.length, 'lesson'))}${m.narrated ? ' &middot; Narrated' : ''}</p>${m.blurb && d.modules.length > 1 ? `<p class="desc">${esc(m.blurb)}</p>` : ''}${descP}</div></div>
${lessons}
<div class="mod-foot"><a class="btn btn-ghost btn-small" href="${esc(link)}">${ICON_PLUS}Add this module</a></div>
</li>`;
  }).join('\n');

  const highlights = d.highlights.length ? `<section class="block" aria-labelledby="hl-h"><div class="wrap">
<div class="sec-head"><h2 id="hl-h">Why learners like it</h2></div>
<ul class="hl-list">${d.highlights.map((h) => `<li>${ICON_CHECK}<span>${esc(h)}</span></li>`).join('')}</ul>
</div></section>` : '';

  const shots = d.screenshots.length || d.screencast ? `<section class="block" aria-labelledby="sh-h"><div class="wrap">
<div class="sec-head"><h2 id="sh-h">A look inside</h2></div>
${d.screenshots.length ? `<ul class="shots">${d.screenshots.map((s, i) => `<li><img src="${esc(s)}" alt="Screen ${i + 1} from ${esc(d.title)}" width="1344" height="768" loading="lazy" decoding="async"></li>`).join('')}</ul>` : ''}
${d.screencast ? `<div class="cast"><video controls preload="none" playsinline${d.screenshots[0] ? ` poster="${esc(d.screenshots[0])}"` : ''}><source src="${esc(d.screencast)}" type="video/${d.screencast.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4'}">Your browser cannot play this video.</video></div>` : ''}
</div></section>` : '';

  const qr = qrSvg(base, { ecl: 'M', quiet: 2, dark: 'var(--qr-dark)', light: 'var(--qr-light)', title: `QR code for ${base}` });
  const manifestUrl = `${base}bundle-manifest.json`;
  const meta = [
    ['description', trunc(desc, 200)],
  ];
  const og = [
    ['og:type', 'website'], ['og:site_name', 'CoAuthor'], ['og:title', d.title], ['og:description', trunc(desc, 200)], ['og:url', base], ['og:locale', 'en_IN'],
  ];
  if (ogImage) og.push(['og:image', ogImage], ['og:image:alt', d.title]);
  const tw = [['twitter:card', ogImage ? 'summary_large_image' : 'summary'], ['twitter:title', d.title], ['twitter:description', trunc(desc, 200)]];
  if (ogImage) tw.push(['twitter:image', ogImage]);

  const footBits = [];
  if (d.repo) footBits.push(`<a href="${esc(d.repo.url)}">Source on GitHub</a>`);
  if (d.repo && typeof d.repo.issues === 'string' && /^https:\/\//.test(d.repo.issues)) footBits.push(`<a href="${esc(d.repo.issues)}">Report a problem</a>`);
  const footMeta = [d.license && `Licence ${esc(d.license)}`, d.version && `Version ${esc(d.version)}`, d.updatedAt && `Updated ${esc(d.updatedAt)}`].filter(Boolean).join(' &middot; ');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(pageTitle)}</title>
${meta.map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`).join('\n')}
${og.map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join('\n')}
${tw.map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`).join('\n')}
<link rel="canonical" href="${esc(base)}">
<meta name="theme-color" content="${plain ? '#15304c' : '#4b6ad3'}">
<!-- Generated by coauthor/tools/publish/make-landing.mjs. Do not edit by hand; rerun the tool.
     The QR below is drawn at build time by tools/publish/qr-encode.mjs (MIT License, after Project Nayuki's QR Code generator).
     Fonts: ${plain ? 'Antic Didone' : 'Fredoka and Nunito'}, SIL Open Font License 1.1, embedded from the CoAuthor engine's vendor/fonts. -->
<style>
${fontFaces(d.look)}
${tokens(d)}
${BASE_CSS}
${plain ? PLAIN_CSS : QUILL_CSS}
</style>
</head>
<body class="look-${d.look}">
<header class="wrap top">
<a class="brand" href="${esc(opt.engine)}">${BRAND_MARK}<span>CoAuthor</span></a>
<button class="btn btn-ghost btn-small" type="button" data-share>${ICON_SHARE}Share</button>
</header>
<main>
<section class="hero"><div class="wrap hero-grid">
<div class="hero-text">
<ul class="kicker">${kicker.join('')}</ul>
<h1>${esc(d.title)}</h1>
${d.blurb ? `<p class="lede"><b>${esc(d.blurb)}</b></p>` : ''}
<p class="lede">${esc(desc)}</p>
<ul class="facts">${facts.join('')}</ul>
<div class="cta-row"><a class="btn btn-primary" href="${esc(allLink)}">Get CoAuthor with this course${ICON_ARROW}</a></div>
<p class="how">One tap opens the CoAuthor app in your browser and adds this course. It is saved on your device, so it works offline.</p>
<p class="inapp" data-inapp>Opened inside another app? For the best result, open this page in Chrome or Safari: use the menu (the three dots or the share icon) and choose <b>Open in browser</b>.</p>
</div>
<div class="hero-art"><div class="cover">${coverHtml}</div></div>
</div></section>
${highlights}
${shots}
<section class="block" id="modules" aria-labelledby="mod-h"><div class="wrap">
<div class="sec-head"><h2 id="mod-h">${d.modules.length === 1 ? 'What you will learn' : 'Modules in this course'}</h2><p>${esc(plural(d.modules.length, 'module'))} &middot; ${esc(plural(d.lessonCount, 'lesson'))}</p></div>
<ul class="mods${d.modules.length === 1 ? ' single' : ''}">
${modCards}
</ul>
</div></section>
<section class="block band" aria-labelledby="how-h"><div class="wrap">
<div class="sec-head"><h2 id="how-h">How it works</h2></div>
<div class="how-grid">
<div>
<ol class="steps">
<li><div><b>Open CoAuthor</b><span>The button opens the free CoAuthor app in your browser. There is nothing to download from a store.</span></div></li>
<li><div><b>Add the course</b><span>Say yes to add this course. You can also add only the modules you need.</span></div></li>
<li><div><b>Learn anywhere</b><span>CoAuthor keeps the lessons on your device, so they work without internet. Install it to your home screen if asked.</span></div></li>
</ol>
<details class="manual"><summary>Add it by hand instead</summary>
<ol><li>Open <a href="${esc(opt.engine)}">${esc(opt.engine)}</a>.</li><li>Open the Parent area, then Settings, then Course sources.</li><li>Add this address:</li></ol>
<div class="addr"><code>${esc(manifestUrl)}</code><button class="btn btn-ghost btn-small" type="button" data-copy="${esc(manifestUrl)}">Copy</button></div>
</details>
</div>
<aside class="qr panel" aria-label="Open on your phone"><div class="qr-box">${qr}</div><p>Scan to open this page on your phone</p><p class="qr-url">${esc(base)}</p></aside>
</div>
</div></section>
</main>
<footer class="foot"><div class="wrap">${d.alignment ? `<span>${esc(INDEPENDENCE_NOTE)}</span>` : ''}<span>${footMeta}</span><span>${footBits.join(' &middot; ')}${footBits.length ? ' &middot; ' : ''}<a href="${esc(opt.engine)}">About CoAuthor</a></span></div></footer>
<div class="toast" role="status" aria-live="polite" data-toast></div>
<script>
(function () {
  var toast = document.querySelector('[data-toast]');
  function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove('show'); }, 2200); }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { say('Link copied'); }, function () { say(text); });
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); say('Link copied'); } catch (e) { say(text); }
    document.body.removeChild(ta);
  }
  var url = document.querySelector('link[rel=canonical]').href;
  document.querySelectorAll('[data-share]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
      else copy(url);
    });
  });
  document.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copy(b.getAttribute('data-copy')); }); });
  var ua = navigator.userAgent || '';
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\\/|WhatsApp|Snapchat|; wv\\)/.test(ua)) document.querySelector('[data-inapp]').classList.add('show');
})();
</script>
</body>
</html>
`;
  return asciiOnly(html);
}

// ---------- cover.jpg (og:image for a generated cover) ----------
let _browser = null;
async function browser() {
  if (_browser) return _browser;
  let pw = null;
  const req = createRequire(import.meta.url);
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch { /* no npm */ }
  if (process.env.HOME) roots.push(path.join(process.env.HOME, '.local', 'lib', 'node_modules'));
  for (const p of (process.env.NODE_PATH || '').split(path.delimiter)) if (p) roots.push(p);
  try { pw = req('playwright'); } catch {
    for (const r of roots) { try { pw = req(path.join(r, 'playwright')); break; } catch { /* next */ } }
  }
  if (!pw) return null;
  _browser = await pw.chromium.launch();
  return _browser;
}

// Draws the page's own generated cover (light scheme) at 600x315 CSS px,
// 2x, so 1200x630; lowers JPEG quality until the file is at most 150 KB.
async function writeCoverJpg(htmlFile, outFile) {
  const b = await browser();
  if (!b) return 'playwright not found';
  const page = await b.newPage({ viewport: { width: 600, height: 315 }, deviceScaleFactor: 2, colorScheme: 'light' });
  try {
    await page.goto(pathToFileURL(htmlFile).href);
    const ok = await page.evaluate(() => {
      const c = document.querySelector('.cover');
      if (!c) return false;
      const box = document.createElement('div');
      box.className = 'cover';
      box.setAttribute('style', 'position:fixed;inset:0;width:600px;height:315px;max-width:none;aspect-ratio:auto;margin:0;border:0;border-radius:0;box-shadow:none;z-index:2147483647');
      box.innerHTML = c.innerHTML;
      document.body.appendChild(box);
      return true;
    });
    if (!ok) return 'no .cover on the page';
    await page.evaluate(() => document.fonts.ready);
    let q = 90;
    let buf = null;
    for (; q >= 40; q -= 6) {
      buf = await page.screenshot({ type: 'jpeg', quality: q, clip: { x: 0, y: 0, width: 600, height: 315 } });
      if (buf.length <= 150 * 1024) break;
    }
    fs.writeFileSync(outFile, buf);
    return `${(buf.length / 1024).toFixed(0)} KB q${q}`;
  } finally { await page.close(); }
}

// ---------- main ----------
let failed = 0;
for (const folder of opt.folders) {
  const dir = path.join(opt.root, folder);
  if (!/^[A-Za-z0-9._-]+$/.test(folder) || !fs.existsSync(path.join(dir, 'bundle-manifest.json'))) {
    console.error(`x ${folder}: no bundle-manifest.json under ${dir}`); failed++; continue;
  }
  console.log(`- ${folder}`);
  const d = loadFolder(dir);
  if (!d.cover && opt.coverJpg && !opt.dry) d.ogCover = 'cover.jpg';
  let html = render(folder, d);
  const out = path.join(dir, 'index.html');
  if (!opt.dry) fs.writeFileSync(out, html);
  if (d.ogCover) {
    let r;
    try { r = await writeCoverJpg(out, path.join(dir, 'cover.jpg')); } catch (e) { r = `failed: ${e.message}`; }
    if (!fs.existsSync(path.join(dir, 'cover.jpg')) || !/KB/.test(r)) {
      console.warn(`  ! cover.jpg not written (${r}); page has no og:image`);
      delete d.ogCover;
      html = render(folder, d);
      fs.writeFileSync(out, html);
    } else console.log(`  cover.jpg ${r}`);
  }
  console.log(`  ${opt.dry ? '(dry run) ' : ''}${out}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB  look=${d.look}  modules=${d.modules.length}  lessons=${d.lessonCount}  cover=${d.cover || 'generated'}  highlights=${d.highlights.length}  screenshots=${d.screenshots.length}`);
}
if (_browser) await _browser.close();
process.exit(failed ? 1 : 0);
