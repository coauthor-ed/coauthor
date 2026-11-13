#!/usr/bin/env node
// Replace ORG-PLACEHOLDER with the real GitHub org, and/or point every published URL at another host, in one pass.
// Usage: node tools/publish/set-org.mjs [--org <name>] [--base-url https://host] [--staging <dir>] [--engine <dir>]
//   --org       replaces ORG-PLACEHOLDER (default site: https://<org>.github.io)
//   --base-url  host root for all sites, e.g. https://learn.example.org (no trailing slash needed). Rewrites PUBLISH_BASE_URL in
//               src/config/publishing.js (so CATALOG_URL follows) and every https://<org>.github.io in the staged files.
//               Default stays https://coauthor-ed.github.io. Re-run make-landing.mjs / make-catalog.mjs with the same
//               --origin / --base-url if you regenerate those files.
//   --staging  folder holding the staged series (default: the scratchpad/untracked staging folder given here)
//   --engine   engine repo root (default: this repo); rewrites src/config/publishing.js if present
// Rewrites text files only (.md .json .js .yml .txt); safe to run twice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
let org, baseUrl, staging, engine = ENGINE;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--org') org = a[++i];
  else if (a[i] === '--base-url') baseUrl = a[++i].replace(/\/+$/, '');
  else if (a[i] === '--staging') staging = path.resolve(a[++i]);
  else if (a[i] === '--engine') engine = path.resolve(a[++i]);
}
if ((!org && !baseUrl) || (org && !/^[A-Za-z0-9-]+$/.test(org)) || (baseUrl && !/^https?:\/\/[^\s"'`]+$/.test(baseUrl))) { console.error('Usage: set-org.mjs [--org <github-org>] [--base-url https://host] [--staging <dir>] [--engine <dir>]'); process.exit(2); }
// The org whose github.io URLs are being replaced: the one given, else the one now in publishing.js.
const pubFile = path.join(engine, 'src/config/publishing.js');
const curOrg = org || (fs.existsSync(pubFile) && /PUBLISH_ORG = '([^']+)'/.exec(fs.readFileSync(pubFile, 'utf8'))?.[1]);

const TEXT = /\.(md|json|js|mjs|yml|txt|webmanifest|html)$/;
let files = 0, hits = 0;
function fix(file) {
  if (!TEXT.test(file)) return;
  const t = fs.readFileSync(file, 'utf8');
  let u = t, n = 0;
  if (org && u.includes('ORG-PLACEHOLDER')) { n += u.split('ORG-PLACEHOLDER').length - 1; u = u.split('ORG-PLACEHOLDER').join(org); }
  if (baseUrl && curOrg) {  // only the pages host, never github.com repo/issue URLs
    const from = `https://${curOrg}.github.io`;
    if (u.includes(from)) { n += u.split(from).length - 1; u = u.split(from).join(baseUrl); }
  }
  if (!n) return;
  fs.writeFileSync(file, u);
  files++; hits += n; console.log(`${n}\t${file}`);
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'media') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.isFile()) fix(p);
  }
}
function fixPublishing() {
  const t = fs.readFileSync(pubFile, 'utf8');
  const u = t.replace(/export const PUBLISH_ORG = '[^']*';/, `export const PUBLISH_ORG = '${org}';`);
  if (u !== t) { fs.writeFileSync(pubFile, u); files++; hits++; console.log(`1\t${pubFile}`); }
}
// Engine: only the files that can carry the org (never a full-tree rewrite).
for (const f of ['content-repo-template/.devcontainer/engine-repo.txt']) {
  const p = path.join(engine, f);
  if (fs.existsSync(p)) fix(p);
}
// publishing.js: the base URL is one constant, so a host change is one line.
if (org && fs.existsSync(pubFile)) fixPublishing();
if (baseUrl && fs.existsSync(pubFile)) {
  const t = fs.readFileSync(pubFile, 'utf8');
  const u = t.replace(/export const PUBLISH_BASE_URL = [^;]+;/, `export const PUBLISH_BASE_URL = '${baseUrl}';`);
  if (u !== t) { fs.writeFileSync(pubFile, u); files++; hits++; console.log(`1\t${pubFile}`); }
}
if (staging && fs.existsSync(staging)) walk(staging);
console.log(`${hits} replacement(s) in ${files} file(s). Remaining placeholders are reported by: grep -r ORG-PLACEHOLDER <dir>`);
