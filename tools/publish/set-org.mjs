#!/usr/bin/env node
// Replace ORG-PLACEHOLDER with the real GitHub org, in one pass.
// Usage: node tools/publish/set-org.mjs --org <name> [--staging <dir>] [--engine <dir>]
//   --staging  folder holding the staged series (default: the scratchpad/untracked staging folder given here)
//   --engine   engine repo root (default: this repo); rewrites src/config/publishing.js and the workflows if present
// Rewrites text files only (.md .json .js .yml .txt); safe to run twice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
let org, staging, engine = ENGINE;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--org') org = a[++i];
  else if (a[i] === '--staging') staging = path.resolve(a[++i]);
  else if (a[i] === '--engine') engine = path.resolve(a[++i]);
}
if (!org || !/^[A-Za-z0-9-]+$/.test(org)) { console.error('Usage: set-org.mjs --org <github-org> [--staging <dir>] [--engine <dir>]'); process.exit(2); }

const TEXT = /\.(md|json|js|mjs|yml|txt|webmanifest|html)$/;
let files = 0, hits = 0;
function fix(file) {
  if (!TEXT.test(file)) return;
  const t = fs.readFileSync(file, 'utf8');
  if (!t.includes('ORG-PLACEHOLDER')) return;
  const n = t.split('ORG-PLACEHOLDER').length - 1;
  fs.writeFileSync(file, t.split('ORG-PLACEHOLDER').join(org));
  files++; hits += n; console.log(`${n}\t${file}`);
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'media') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.isFile()) fix(p);
  }
}
// Engine: only the files that can carry the org (never a full-tree rewrite).
for (const f of ['src/config/publishing.js', '.github/workflows/pages.yml', 'tools/publish/course-repo-pages.yml', 'content-repo-template/.devcontainer/engine-repo.txt']) {
  const p = path.join(engine, f);
  if (fs.existsSync(p)) fix(p);
}
if (staging && fs.existsSync(staging)) walk(staging);
console.log(`${hits} replacement(s) in ${files} file(s). Remaining placeholders are reported by: grep -r ORG-PLACEHOLDER <dir>`);
