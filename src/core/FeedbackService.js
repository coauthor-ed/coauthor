import { readCourseMeta } from './courseMeta.js';
import { ENGINE_VERSION } from './engineVersion.js';

/**
 * Learner slide feedback (W4). Pure helpers plus thin ProgressStore wrappers.
 *
 * SAFETY: `text` and `beatExcerpt` are stored as PLAIN TEXT, never HTML.
 * Every renderer (flag sheet, outbox) must escape them before innerHTML
 * (invariant 6). Nothing here sends anything: the parent opens the URL.
 * Output never contains profileId or any learner name.
 */

export const KINDS = ['typo', 'confusing', 'wrong', 'broken', 'idea'];
export const STATUSES = ['draft', 'sent', 'dismissed'];
export const VIAS = ['github', 'email', 'copy'];
export const MAX_TEXT = 1000;
export const MAX_EXCERPT = 160;
export const MAX_TITLE = 120;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const clean = (v, max) => String(v ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const orNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Validate and build a feedback row (not yet saved). Throws on bad input. */
export function buildRow(input = {}) {
  if (!input.profileId) throw new Error('feedback: profileId required');
  if (!KINDS.includes(input.kind)) throw new Error('feedback: bad kind');
  const text = String(input.text ?? '').replace(CONTROL, '').trim().slice(0, MAX_TEXT);
  return {
    profileId: input.profileId,
    feedbackId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    bundleId: orNull(input.bundleId),
    lessonId: orNull(input.lessonId),
    blockId: orNull(input.blockId),
    blockRef: orNull(input.blockRef),
    beatIndex: Number.isInteger(input.beatIndex) && input.beatIndex >= 0 ? input.beatIndex : null,
    beatExcerpt: clean(input.beatExcerpt, MAX_EXCERPT),
    // Human-readable context for the outbox and the issue title (additive,
    // optional: rows saved before these existed simply lack them).
    lessonTitle: clean(input.lessonTitle, MAX_TITLE) || null,
    slideNumber: Number.isInteger(input.slideNumber) && input.slideNumber > 0 ? input.slideNumber : null,
    kind: input.kind,
    text,
    contentVersion: orNull(input.contentVersion),
    engineVersion: ENGINE_VERSION,
    createdAt: new Date().toISOString(),
    status: 'draft',
    sentAt: null,
    sentVia: null,
  };
}

/** Validate, sanitise and save. Resolves to the saved row. */
export async function submit(input) {
  const row = buildRow(input);
  const { ProgressStore } = await import('./ProgressStore.js');
  return ProgressStore.addFeedback(row);
}

export async function list(profileId, opts) {
  const { ProgressStore } = await import('./ProgressStore.js');
  return ProgressStore.listFeedback(profileId, opts);
}

export async function markSent(profileId, ids, via) {
  const { ProgressStore } = await import('./ProgressStore.js');
  for (const id of ids) await ProgressStore.updateFeedbackStatus(profileId, id, 'sent', via);
}

export async function dismiss(profileId, id) {
  const { ProgressStore } = await import('./ProgressStore.js');
  return ProgressStore.updateFeedbackStatus(profileId, id, 'dismissed', null);
}

export async function remove(profileId, id) {
  const { ProgressStore } = await import('./ProgressStore.js');
  return ProgressStore.deleteFeedback(profileId, id);
}

/** @returns {Map<string, object[]>} rows grouped by bundleId ('' for none), order kept. */
export function groupOutbox(rows) {
  const out = new Map();
  for (const r of rows || []) {
    const k = r.bundleId || '';
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

/** Where a course's feedback can go. Either may be null. */
export function routeFor(manifest, sourceUrl = '') {
  const meta = readCourseMeta(manifest, sourceUrl);
  return {
    github: meta.repository.issues || null,
    email: meta.authors.find((a) => a.email)?.email || null,
  };
}

// Minimal markdown hardening: neutralise mentions, HTML and link syntax.
const md = (s) => String(s ?? '')
  .replace(CONTROL, '')
  .replace(/[\\`*_<>[\]]/g, (c) => `\\${c}`)
  .replace(/@/g, '@​')
  .replace(/#(?=\d)/g, '#​');

const slideLabel = (it) => {
  const id = it.blockId || it.blockRef || '';
  const beat = Number.isInteger(it.beatIndex) ? `beat ${it.beatIndex + 1}` : '';
  return [id, beat].filter(Boolean).join(', ') || 'unknown';
};

function itemMarkdown(it) {
  const lines = [`- **${md(it.kind)}** - lesson: ${md(it.lessonId || 'unknown')}; slide: ${md(slideLabel(it))}`];
  if (it.beatExcerpt) lines.push(`  > ${md(it.beatExcerpt)}`);
  if (it.text) lines.push(`  ${md(it.text).replace(/\n+/g, ' ')}`);
  lines.push(`  (content ${md(it.contentVersion || 'n/a')}, engine ${md(it.engineVersion || 'n/a')})`);
  return lines.join('\n');
}

function issueTitle(items) {
  const ids = [...new Set(items.map((i) => i.lessonTitle || i.lessonId).filter(Boolean))];
  const what = ids.length === 1 ? ids[0] : ids.length ? `${ids.length} lessons` : 'course';
  return `Learner feedback: ${clean(what, 80)} (${items.length} item${items.length === 1 ? '' : 's'})`;
}

const issueUrl = (base, items) => `${base.replace(/\/+$/, '')}/new?title=${encodeURIComponent(issueTitle(items))}&body=${encodeURIComponent(items.map(itemMarkdown).join('\n\n'))}`;

/**
 * GitHub new-issue URLs for `items`, split so each stays within maxUrlLength.
 * A single item longer than the limit gets its own URL with text trimmed to fit.
 * @returns {{url: string, items: object[]}[]}
 */
export function buildIssueUrls(issuesUrl, items, { maxUrlLength = 7000 } = {}) {
  if (!issuesUrl || !items?.length) return [];
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length) { out.push({ url: issueUrl(issuesUrl, cur), items: cur }); cur = []; } };
  for (const it of items) {
    let item = it;
    if (issueUrl(issuesUrl, [item]).length > maxUrlLength) {
      let t = item.text || '';
      while (t.length > 20 && issueUrl(issuesUrl, [{ ...item, text: t, beatExcerpt: '' }]).length > maxUrlLength) t = t.slice(0, Math.floor(t.length * 0.8));
      item = { ...item, text: t, beatExcerpt: '' };
    }
    if (cur.length && issueUrl(issuesUrl, [...cur, item]).length > maxUrlLength) flush();
    cur.push(item);
  }
  flush();
  return out;
}

/** Plain text for copy / email. */
export function buildPlainText(items) {
  return (items || []).map((it, i) => {
    const parts = [`${i + 1}. [${it.kind}] lesson: ${it.lessonId || 'unknown'}; slide: ${slideLabel(it)}`];
    if (it.beatExcerpt) parts.push(`   "${it.beatExcerpt}"`);
    if (it.text) parts.push(`   ${it.text}`);
    parts.push(`   (content ${it.contentVersion || 'n/a'}, engine ${it.engineVersion || 'n/a'})`);
    return parts.join('\n');
  }).join('\n\n');
}

/** mailto: link; body truncated so the link stays usable. */
export function buildMailto(email, items, { maxLength = 1800 } = {}) {
  if (!email) return null;
  const subject = `Learner feedback (${(items || []).length} item${(items || []).length === 1 ? '' : 's'})`;
  const head = `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=`;
  let body = buildPlainText(items);
  while (body && head.length + encodeURIComponent(body).length > maxLength) {
    body = `${body.slice(0, Math.floor(body.length * 0.85)).trimEnd()}...`;
    if (body.length < 10) break;
  }
  return head + encodeURIComponent(body);
}
