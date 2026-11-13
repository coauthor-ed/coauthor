#!/usr/bin/env node
// Facts digest for Discover (Q-47 Stage 2, PILOT items 5 and 6).
// Writes into each module manifest.json, so Discover makes one fetch per module instead of one per lesson:
//   digest   { v: 1, modules: [{ id, title, lessons: [{ ref, title }] }], lessonCount, narrated, chapterIds }
//   sizeMB   download size of the module folder (authoring files from exclude.txt and showcase/ left out)
//   estHours only when the manifest has none: an estimate from the lesson blocks (see MINUTES below)
// Usage: node tools/publish/make-digest.mjs [--dry] [--force-hours] <moduleDir>...
// Run it on staged copies (stage-all.sh does) and, for a course not staged yet, on its source folder.
// Never touches any other manifest field. Rewrites the manifest as a new file (staging hard-links sources).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveFacts, textOf } from '../../src/core/showcaseMeta.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const forceHours = args.includes('--force-hours');
const dirs = args.filter((a) => !a.startsWith('--'));
if (!dirs.length) { console.error('Usage: make-digest.mjs [--dry] [--force-hours] <moduleDir>...'); process.exit(2); }

// Minutes a learner spends per block, by type. Calibrated on Flame-and-Seed (owner-approved 36 h,
// 1701 blocks) and Cells (about 4 h): text slides are short, a simulation adds play time,
// questions and games take longer. Unknown types count as a question.
const MINUTES = { content: 1, sim: 0.5, question: 1.5, predict: 1.5, game: 4 };
function blockMinutes(b) {
  const t = String(b?.type || '');
  if (t.startsWith('mini-game')) return MINUTES.game;
  if (t.startsWith('poe-')) return MINUTES.predict + (b.simulation || t.includes('sim') ? MINUTES.sim : 0);
  if (t.startsWith('content-block') || t.startsWith('story') || t.startsWith('image') || t.startsWith('callout')) {
    return MINUTES.content + (b.simulation ? MINUTES.sim : 0);
  }
  return MINUTES.question;
}

const patterns = fs.readFileSync(path.join(HERE, 'exclude.txt'), 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
const rx = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const excluders = [...patterns, 'showcase'].map(rx);
function dirBytes(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluders.some((r) => r.test(e.name))) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += dirBytes(p);
    else if (e.isFile()) n += fs.statSync(p).size;
  }
  return n;
}
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

let failed = 0;
for (const d of dirs) {
  const dir = path.resolve(d);
  const mfPath = path.join(dir, 'manifest.json');
  const mf = readJson(mfPath);
  if (!mf) { console.error(`! ${d}: no readable manifest.json`); failed++; continue; }
  const modules = [];
  for (const rel of Array.isArray(mf.modules) ? mf.modules : []) {
    const mod = readJson(path.join(dir, rel));
    if (!mod) { console.warn(`  ! ${d}: module ${rel} unreadable`); continue; }
    modules.push({
      id: String(mod.id || ''),
      title: textOf(mod.title),
      lessons: (Array.isArray(mod.lessons) ? mod.lessons : []).map((l) => ({ ref: String(l?.lessonRef || ''), title: textOf(l?.title) })).filter((l) => l.ref),
    });
  }
  let refs = modules.flatMap((m) => m.lessons.map((l) => l.ref));
  if (!refs.length && Array.isArray(mf.lessons)) refs = mf.lessons.map((l) => (typeof l === 'string' ? l : l?.lessonRef)).filter(Boolean);
  const lessons = refs.map((r) => readJson(path.join(dir, r)));
  const missing = refs.filter((r, i) => !lessons[i]);
  if (missing.length) console.warn(`  ! ${d}: ${missing.length} lesson file(s) unreadable, e.g. ${missing[0]}`);
  const facts = deriveFacts(lessons);
  let minutes = 0;
  for (const L of lessons) {
    for (const b of Array.isArray(L?.blocks) ? L.blocks : []) {
      const ref = b?.blockRef || b?.questionRef;
      const blk = ref ? readJson(path.join(dir, ref)) : b;
      minutes += blockMinutes(blk || {});
    }
  }
  const est = Math.max(0.5, Math.round(minutes / 30) / 2);
  const out = { ...mf };
  out.digest = { v: 1, modules, lessonCount: refs.length || facts.lessonCount, narrated: facts.narrated, chapterIds: [...new Set(facts.chapterIds)] };
  const mb = dirBytes(dir) / 1048576;
  out.sizeMB = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  const hadHours = typeof mf.estHours === 'number';
  if (!hadHours || forceHours) out.estHours = est;
  console.log(`${path.basename(dir)}: ${out.digest.lessonCount} lessons, narrated ${out.digest.narrated}, ${out.sizeMB} MB, estimate ${est} h${hadHours && !forceHours ? ` (kept estHours ${mf.estHours})` : ''}`);
  if (!dry) {
    const text = JSON.stringify(out, null, 2) + '\n';
    try { fs.unlinkSync(mfPath); } catch {}
    fs.writeFileSync(mfPath, text);
  }
}
process.exit(failed ? 1 : 0);
