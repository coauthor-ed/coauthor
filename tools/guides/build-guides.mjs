#!/usr/bin/env node
// Publishes the people-facing guides (docs/sprints/completed/landing-page-and-guides.md,
// "Guides system"): reads guides/guides.config.json, validates every guide,
// and writes guides/dist/ (index.json + the Markdown bodies + media) for the
// app's GuideService to read.
//
//   node tools/guides/build-guides.mjs           build guides/dist/
//   node tools/guides/build-guides.mjs --check   validate only; exit 1 on errors
//
// Node 20, no dependencies. Staleness (a guide checked against an older kit
// version than content-repo-template/kit-version) is reported, never fatal.
import { readFile, writeFile, mkdir, rm, readdir, stat, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIENCES, GUIDE_ICONS, parseFrontmatter, extractHeadings, extractTries, readingMinutes, extractLinks,
} from '../../src/core/guides/guideMarkdown.js';
import { validateBlock } from '../validation/block.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CHECK = process.argv.includes('--check');
const QUIET = process.argv.includes('--quiet');
const DIST = path.join(ROOT, 'guides', 'dist');
const AUDIENCE_DIR = { student: 'students', parent: 'parents', author: 'authors' };

const errors = [];
const stale = [];
const err = (file, msg) => errors.push(`${path.relative(ROOT, file)}: ${msg}`);

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

/** Last commit date of a file (YYYY-MM-DD), else its modified date. */
async function updatedOf(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return out;
  } catch { /* not a checkout */ }
  return (await stat(file)).mtime.toISOString().slice(0, 10);
}

const config = await readJson(path.join(ROOT, 'guides', 'guides.config.json'));
const kitVersion = (await readFile(path.join(ROOT, 'content-repo-template', 'kit-version'), 'utf8').catch(() => '')).trim();
const registry = {
  blocks: Object.keys((await readJson(path.join(ROOT, 'registry', 'blocks.json'))).blocks || {}),
  questions: Object.keys((await readJson(path.join(ROOT, 'registry', 'questions.json'))).questions || {}),
};

// Gather every guide from every source. Only local folders today; a git
// source (`{ "git": url, "ref": tag, "path": "guides/" }`) is a later step.
const guides = [];
for (const src of config.sources || []) {
  if (!src.local) { err(path.join(ROOT, 'guides', 'guides.config.json'), `source kind not supported yet: ${JSON.stringify(src)}`); continue; }
  const base = path.resolve(ROOT, src.local);
  for (const [audience, dir] of Object.entries(AUDIENCE_DIR)) {
    const folder = path.join(base, dir);
    if (!(await exists(folder))) continue;
    for (const name of (await readdir(folder)).filter((f) => f.endsWith('.md')).sort()) {
      const file = path.join(folder, name);
      const text = await readFile(file, 'utf8');
      const { meta, body, error } = parseFrontmatter(text);
      if (error) { err(file, error); continue; }
      guides.push({ file, base, folderAudience: audience, slug: name.replace(/\.md$/, ''), meta, body });
    }
  }
}

// Validate each guide on its own.
const slugs = new Map();
for (const g of guides) {
  const { meta, file } = g;
  for (const f of ['title', 'audience', 'order', 'summary', 'icon']) if (meta[f] === undefined || meta[f] === '') err(file, `frontmatter needs "${f}"`);
  if (meta.audience && !AUDIENCES.includes(meta.audience)) err(file, `audience must be one of ${AUDIENCES.join(', ')}`);
  if (meta.audience && meta.audience !== g.folderAudience) err(file, `audience "${meta.audience}" does not match its folder (${AUDIENCE_DIR[g.folderAudience]}/)`);
  if (meta.order !== undefined && typeof meta.order !== 'number') err(file, 'order must be a number');
  if (meta.icon && !GUIDE_ICONS.includes(meta.icon)) err(file, `unknown icon "${meta.icon}" (known: ${GUIDE_ICONS.join(', ')})`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug)) err(file, 'file name must be a lower-case slug (a-z, 0-9, -)');
  if (slugs.has(g.slug)) err(file, `slug "${g.slug}" is also used by ${path.relative(ROOT, slugs.get(g.slug))}`);
  slugs.set(g.slug, file);
  if (/^#\s/.test(g.body.trimStart())) err(file, 'do not start the body with a "# " title; the title comes from frontmatter');

  g.headings = extractHeadings(g.body);
  const { tries } = extractTries(g.body);
  g.tries = tries.length;
  tries.forEach((json, i) => {
    let data;
    try { data = JSON.parse(json); } catch (e) { err(file, `coauthor-try block ${i + 1} is not valid JSON: ${e.message}`); return; }
    if (!data.type) { err(file, `coauthor-try block ${i + 1} has no "type"`); return; }
    if (registry.blocks.includes(data.type)) {
      const r = validateBlock(data);
      for (const e of r.errors || []) err(file, `coauthor-try block ${i + 1}: ${e}`);
    } else if (registry.questions.includes(data.type)) {
      if (!data.id) err(file, `coauthor-try block ${i + 1} needs an "id"`);
    } else {
      err(file, `coauthor-try block ${i + 1}: unknown type "${data.type}"`);
    }
  });

  if (meta.checkedAgainst?.kit && kitVersion && meta.checkedAgainst.kit < kitVersion) stale.push(`${g.slug} (checked against kit ${meta.checkedAgainst.kit}, kit is ${kitVersion})`);
}

// Links need the full slug list, so they are checked in a second pass.
const headingIds = new Map(guides.map((g) => [g.slug, new Set(g.headings.map((h) => h.id))]));
for (const g of guides) {
  for (const { image, href, text } of extractLinks(g.body)) {
    if (image) {
      if (!text) err(g.file, `image "${href}" needs alt text: ![what it shows](${href})`);
      if (!href.startsWith('media/')) { err(g.file, `image "${href}" must live in guides/media/ (write media/<file>)`); continue; }
      if (!(await exists(path.join(g.base, href)))) err(g.file, `image not found: ${href}`);
      continue;
    }
    if (href.startsWith('#/')) continue; // an app route, e.g. #/discover
    const [target, anchor] = href.split('#');
    const slug = target || g.slug;
    if (!headingIds.has(slug)) { err(g.file, `link to unknown guide "${target}"`); continue; }
    if (anchor && !headingIds.get(slug).has(anchor)) err(g.file, `link to unknown heading "${href}"`);
  }
}

const byAudience = (a, b) => AUDIENCES.indexOf(a.meta.audience) - AUDIENCES.indexOf(b.meta.audience) || a.meta.order - b.meta.order;
guides.sort(byAudience);

if (!QUIET || errors.length) {
  console.log(`guides: ${guides.length} found, ${errors.length} error(s)${stale.length ? `, ${stale.length} to re-check` : ''}`);
  for (const e of errors) console.log('  error: ' + e);
  for (const s of stale) console.log('  re-check: ' + s);
}
if (errors.length) process.exit(1);
if (CHECK) process.exit(0);

// Write guides/dist/.
await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'md'), { recursive: true });
const index = [];
for (const g of guides) {
  await writeFile(path.join(DIST, 'md', `${g.slug}.md`), g.body);
  index.push({
    slug: g.slug,
    title: g.meta.title,
    audience: g.meta.audience,
    order: g.meta.order,
    summary: g.meta.summary,
    icon: g.meta.icon,
    headings: g.headings,
    minutes: readingMinutes(g.body),
    tries: g.tries,
    updated: await updatedOf(g.file),
    ...(g.meta.checkedAgainst ? { checkedAgainst: g.meta.checkedAgainst } : {}),
    ...(stale.some((s) => s.startsWith(g.slug + ' ')) ? { review: true } : {}),
  });
}
const media = new Set();
for (const g of guides) {
  const dir = path.join(g.base, 'media');
  if (media.has(dir) || !(await exists(dir))) continue;
  media.add(dir);
  await mkdir(path.join(DIST, 'media'), { recursive: true });
  for (const f of await readdir(dir)) await copyFile(path.join(dir, f), path.join(DIST, 'media', f));
}
await writeFile(path.join(DIST, 'index.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), guides: index }, null, 1) + '\n');
if (!QUIET) console.log(`guides: wrote ${path.relative(ROOT, DIST)}/ (${index.length} guides)`);
