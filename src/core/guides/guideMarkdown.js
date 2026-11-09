/**
 * Guide source helpers shared by the build (tools/guides/build-guides.mjs,
 * plain node) and the app (core/GuideService.js), so both agree on heading
 * ids, try-block numbering and reading time. See
 * docs/sprints/completed/landing-page-and-guides.md, "Guides system".
 *
 * No lit import and nothing DOM: the build runs under plain node.
 */

export const AUDIENCES = ['student', 'parent', 'author'];

/** Names a guide's `icon` frontmatter may use (mapped to glyphs in
 *  ui/views/guides/guideIcons.js). */
export const GUIDE_ICONS = [
  'math', 'pen', 'book', 'compass', 'gamepad', 'fork', 'shield', 'guide', 'door',
  'backup', 'chart', 'clipboard', 'sliders', 'globe', 'lock', 'parent', 'clock', 'check',
];

export const TRY_FENCE = 'coauthor-try';

/**
 * Minimal frontmatter reader for the shape guides use: `key: value` lines,
 * one level of nesting by two-space indent, `#` comments, optional quotes.
 * Not a YAML parser; the build rejects anything it cannot read.
 * @returns {{ meta: object, body: string, error?: string }}
 */
export function parseFrontmatter(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!src.startsWith('---\n')) return { meta: {}, body: src, error: 'no frontmatter block (--- ... ---) at the top' };
  const end = src.indexOf('\n---', 4);
  if (end < 0) return { meta: {}, body: src, error: 'frontmatter is not closed with ---' };
  const head = src.slice(4, end);
  const body = src.slice(end + 4).replace(/^[^\n]*\n/, '');
  const meta = {};
  let parent = null;
  for (const raw of head.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^( *)([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) return { meta, body, error: `cannot read frontmatter line: ${raw}` };
    const [, indent, key, rawVal] = m;
    const val = unquote(rawVal.trim());
    if (indent.length >= 2 && parent) {
      meta[parent][key] = val;
    } else if (rawVal.trim() === '') {
      meta[key] = {};
      parent = key;
    } else {
      meta[key] = /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val;
      parent = null;
    }
  }
  return { meta, body };
}

function unquote(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/** GitHub-style heading slug: lower case, punctuation dropped, spaces to -. */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Cuts fenced code blocks out first so a `## x` inside one is not a heading.
 * Returns the `##` and `###` headings with ids; repeated ids get -1, -2 like
 * GitHub's.
 */
export function extractHeadings(body) {
  const out = [];
  const seen = new Map();
  for (const line of stripFences(body).split('\n')) {
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[*_`]/g, '');
    let id = slugify(text);
    const n = seen.get(id) || 0;
    seen.set(id, n + 1);
    if (n) id = `${id}-${n}`;
    out.push({ depth: m[1].length, text, id });
  }
  return out;
}

function stripFences(body) {
  return String(body ?? '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
}

/**
 * Replaces each ```coauthor-try fence with a placeholder line
 * `<div class="try-slot" data-try="N"></div>` and returns the raw JSON texts
 * in order. The placeholder is plain HTML that marked passes through and the
 * guides sanitizer allows.
 */
export function extractTries(body) {
  const tries = [];
  const text = String(body ?? '').replace(
    new RegExp('^```' + TRY_FENCE + '[^\\n]*\\n([\\s\\S]*?)^```\\s*$', 'gm'),
    (_, json) => {
      tries.push(json);
      return `<div class="try-slot" data-try="${tries.length - 1}"></div>\n`;
    },
  );
  return { text, tries };
}

/** Minutes at 200 words a minute, at least 1. Code and try blocks count less. */
export function readingMinutes(body) {
  const words = stripFences(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Local link targets in a guide body: `[x](slug)`, `[x](slug#id)`,
 *  `[x](#id)`, and image paths. External links are skipped. */
export function extractLinks(body) {
  const links = [];
  const re = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  for (const m of stripFences(body).matchAll(re)) {
    const href = m[3];
    if (/^(https?:|mailto:|tel:)/i.test(href)) continue;
    links.push({ image: m[1] === '!', href, text: m[2].trim(), title: m[4] || '' });
  }
  return links;
}
