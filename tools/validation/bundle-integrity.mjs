#!/usr/bin/env node
// Bundle integrity check (docs/published-content-contract.md sections 1 and 4).
// Usage: node tools/validation/bundle-integrity.mjs <bundleDir> [<bundleDir>...] [--json]
// Checks manifest validity, listed files, every blockRef/ref/src/media path
// (mirrors CourseSourceManager.resolveRef: absolute URL skipped, "/..." is
// engine-root-absolute, anything else is bundle-relative), id uniqueness,
// and warns on lessons without chapterId and duplicate STEP ids.
// Read-only. Exit 1 on any error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './manifest.js';

const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REF_KEYS = new Set(['ref', 'blockRef', 'lessonRef', 'moduleRef', 'file', 'src', 'markdownRef', 'promptRef']);
const SCAN_DIRS = ['modules', 'lessons', 'blocks', 'questions', 'tests'];
const URL_RE = /^([a-z][a-z0-9+.-]*:)?\/\//i;
const MAX_LINES = 30;

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(p, out);
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

function readJson(file, errors, rel) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { errors.push(`${rel}: unreadable JSON (${e.message.slice(0, 80)})`); return null; }
}

// Mirrors resolveRef: returns an fs path, or null when the ref is not checkable.
function resolveRef(ref, bundleDir) {
  if (!ref || URL_RE.test(ref)) return null;
  const clean = ref.split('#')[0].split('?')[0];
  if (clean.startsWith('/')) {
    // /content/courses/<id>/... is a bundle path in a content repo; map to this bundle when the id matches.
    const m = clean.match(/^\/content\/courses\/([^/]+)\/(.*)$/);
    if (m && m[1] === path.basename(bundleDir)) return path.join(bundleDir, m[2]);
    return path.join(ENGINE_ROOT, clean);
  }
  return path.join(bundleDir, clean);
}

function collectRefs(node, trail, out) {
  if (typeof node === 'string') {
    if (/(^|\/)media\//.test(node) && !/\s/.test(node) && /\.\w{2,5}$/.test(node)) out.push([trail, node]);
    return;
  }
  if (Array.isArray(node)) { node.forEach((v, i) => collectRefs(v, `${trail}[${i}]`, out)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (REF_KEYS.has(k) && typeof v === 'string') {
        if (k === 'src' && !/\.\w{1,6}$/.test(v)) continue;
        out.push([`${trail}.${k}`, v]);
      } else collectRefs(v, `${trail}.${k}`, out);
    }
  }
}

function stepIds(text) {
  const ids = [];
  for (const m of text.matchAll(/<!--\s*STEP\b[^>]*?\bid="([^"]+)"/g)) ids.push(m[1]);
  return ids;
}
function dupes(arr) { return [...new Set(arr.filter((x, i) => arr.indexOf(x) !== i))]; }

function checkBundle(bundleDirArg) {
  const bundleDir = path.resolve(bundleDirArg);
  const errors = [];
  const warnings = [];
  const mfPath = path.join(bundleDir, 'manifest.json');
  if (!fs.existsSync(mfPath)) return { bundleId: path.basename(bundleDir), errors: ['manifest.json missing'], warnings };
  const manifest = readJson(mfPath, errors, 'manifest.json');
  const bundleId = manifest?.bundleId || path.basename(bundleDir);
  if (manifest) {
    const r = validateManifest(manifest);
    r.errors.forEach((e) => errors.push(`manifest.json: ${e}`));
    for (const key of ['modules', 'lessons', 'tests', 'banks']) {
      for (const f of manifest[key] || []) {
        const ref = typeof f === 'string' ? f : f?.ref || f?.file;
        const p = resolveRef(ref, bundleDir);
        if (p && !fs.existsSync(p)) errors.push(`manifest.json ${key}: missing file ${ref}`);
      }
    }
  }

  const ids = { block: new Map(), question: new Map(), module: new Map(), lesson: new Map() };
  const addId = (kind, id, rel) => {
    if (!id) return;
    const prev = ids[kind].get(id);
    if (prev && prev !== rel) errors.push(`duplicate ${kind} id "${id}": ${prev} and ${rel}`);
    else ids[kind].set(id, rel);
  };

  for (const dirName of SCAN_DIRS) {
    for (const file of walkJson(path.join(bundleDir, dirName))) {
      const rel = path.relative(bundleDir, file);
      const data = readJson(file, errors, rel);
      if (!data) continue;
      if (dirName === 'blocks') addId('block', data.id, rel);
      else if (dirName === 'questions') addId('question', data.id, rel);
      else if (dirName === 'modules') addId('module', data.id, rel);
      else if (dirName === 'lessons') {
        addId('lesson', data.id, rel);
        if (data.lessonId && data.lessonId !== data.id) addId('lesson', data.lessonId, rel);
        if (!data.chapterId) warnings.push(`${rel}: lesson has no chapterId`);
      }
      const refs = [];
      collectRefs(data, '', refs);
      for (const [where, ref] of refs) {
        const p = resolveRef(ref, bundleDir);
        if (p && !fs.existsSync(p)) errors.push(`${rel}${where}: unresolved path ${ref}`);
      }
      // STEP markers in inline markdown strings
      const inline = JSON.stringify(data).includes('STEP');
      if (inline) {
        const walk = (n, trail) => {
          if (typeof n === 'string') { const d = dupes(stepIds(n)); if (d.length) warnings.push(`${rel}${trail}: duplicate STEP ids ${d.join(', ')}`); }
          else if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${trail}[${i}]`));
          else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) walk(v, `${trail}.${k}`);
        };
        walk(data, '');
      }
    }
  }
  // STEP markers in sibling .md files of blocks
  const mdFiles = [];
  (function walkMd(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkMd(p); else if (e.name.endsWith('.md')) mdFiles.push(p);
    }
  })(path.join(bundleDir, 'blocks'));
  for (const f of mdFiles) {
    const d = dupes(stepIds(fs.readFileSync(f, 'utf8')));
    if (d.length) warnings.push(`${path.relative(bundleDir, f)}: duplicate STEP ids ${d.join(', ')}`);
  }
  return { bundleId, errors, warnings };
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dirs = args.filter((a) => a !== '--json');
if (!dirs.length) { console.error('Usage: bundle-integrity.mjs <bundleDir> [<bundleDir>...] [--json]'); process.exit(2); }

const results = dirs.map((d) => ({ dir: d, ...checkBundle(d) }));
if (asJson) console.log(JSON.stringify(results, null, 2));
else {
  for (const r of results) {
    console.log(`${r.errors.length ? 'FAIL' : 'PASS'} ${r.bundleId} errors=${r.errors.length} warnings=${r.warnings.length}`);
    const lines = [...r.errors.map((e) => `  ERROR ${e}`), ...r.warnings.map((w) => `  warn  ${w}`)];
    lines.slice(0, MAX_LINES).forEach((l) => console.log(l));
    if (lines.length > MAX_LINES) console.log(`  ... ${lines.length - MAX_LINES} more (use --json)`);
  }
}
process.exit(results.some((r) => r.errors.length) ? 1 : 0);
