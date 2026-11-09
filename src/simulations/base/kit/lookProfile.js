/**
 * Which LookProfile the kit draws with (kit/looks/<id>.js), same idea as paperKind.js: the
 * course's look reaches a scene as the inherited CSS custom property --sim-look (the app
 * sets it from the bundle manifest's optional "look"; a harness may set it on any
 * ancestor), else html[data-look] (LookManager), else 'quill'. Works with neither present,
 * so the kit harness and a course repo need nothing else.
 *
 *   useLook(host)   DomSimulation, CanvasSimulation and GeoScene call it first in setup().
 *                   Makes the host's look the active one and writes its CSS custom
 *                   properties on the host (inherited, so scene CSS needs no edit). Returns
 *                   a promise only when a look must be fetched: await it if truthy.
 *   lookOf()        the active profile, for drawing code (canvas and SVG markup)
 *
 * CSS reads --look-radius, --look-rim, --look-lip, --look-gloss (multipliers), --look-pill,
 * --look-spring, --look-spring-soft, --look-text-weight (unset: the kit's 800), --look-annot-draw and
 * --look-annot-sweep (SimAnnotate), and --sim-font-mono. An unknown look warns once and draws Quill.
 *
 * Where a profile comes from: the engine publishes each registry look's simProfile as the
 * inherited CSS property --look-profile-<id> (an absolute URL; LookManager), which wins; else
 * kit/looks/<id>.js. A harness may set the property on any ancestor. No import of the engine:
 * this file also runs synced into a content repo, where neither the registry nor the property
 * exists and the kit's own files are all there is.
 *
 * lookCss(css), lookSvg(markup) and capCorners(ctx) make a scene's own literals obey a look with
 * flattenScenes or corner set. They touch nothing under Quill.
 */
import quill from './looks/quill.js';

const PROFILES = new Map([['quill', quill]]);
const MISSING = new Set();   // name|url: a failed look stays failed until its URL changes
let active = quill;

export const lookOf = () => active;

/** The look name a host asks for: --sim-look, else html[data-look], else 'quill'. */
export function lookNameOf(el) {
  let s = '';
  try { s = el ? getComputedStyle(el).getPropertyValue('--sim-look').trim().toLowerCase() : ''; } catch { /* detached */ }
  if (!s) s = globalThis.document?.documentElement?.dataset?.look ?? '';
  return /^[a-z][a-z0-9-]*$/.test(s) ? s : 'quill';
}

/** The CSS custom properties of a profile (null: leave the theme's value). */
export function lookVars(p) {
  return {
    '--look-radius': p.radius, '--look-pill': `${p.pill}px`, '--look-rim': p.rim, '--look-lip': p.lip, '--look-gloss': p.gloss,
    '--look-spring': p.spring, '--look-spring-soft': p.springSoft, '--sim-font-display': p.fontDisplay, '--sim-font': p.fontBody,
    '--look-text-weight': p.textWeight, '--sim-font-mono': p.fontMono, '--sim-font-numeral': p.fontNumeral ?? null,
    '--look-annot-draw': `${p.annotDraw ?? 0.24}s`, '--look-annot-sweep': `${p.annotSweep ?? 0.3}s`,
  };
}

function apply(el, p) {
  active = p;
  for (const [k, v] of Object.entries(lookVars(p))) {
    if (v == null) el?.style?.removeProperty?.(k);
    else el?.style?.setProperty?.(k, String(v));
  }
}

/** The registry's URL for this look's profile, '' with no engine around. */
function profileUrlOf(el, name) {
  const read = (x) => { try { return getComputedStyle(x).getPropertyValue(`--look-profile-${name}`).trim(); } catch { return ''; } };
  return (el && read(el)) || (globalThis.document ? read(document.documentElement) : '');
}

async function load(name, url) {
  const kit = new URL(`./looks/${name}.js`, import.meta.url).href;
  let lastError = null;
  for (const src of url && url !== kit ? [url, kit] : [kit]) {
    try {
      const mod = await import(src);
      PROFILES.set(name, { ...quill, ...mod.default });
      return;
    } catch (e) { lastError = e; }
  }
  MISSING.add(`${name}|${url}`);
  console.warn(`[lookProfile] No look "${name}" in the kit; drawing Quill.`, lastError);
}

export function useLook(el) {
  const name = lookNameOf(el);
  const known = PROFILES.get(name);
  if (known) { apply(el, known); return null; }
  const url = profileUrlOf(el, name);
  if (MISSING.has(`${name}|${url}`)) { apply(el, quill); return null; }
  return load(name, url).then(() => apply(el, PROFILES.get(name) ?? quill));
}

// -- Scene literals ----------------------------------------------------------------------

/** A corner under the look's cap. A disc and an upright capsule are shapes (a coin, a test tube), not boxes: they stay round. */
export function cornerOf(r, w, h) {
  const cap = active.corner;
  if (cap == null) return r;
  if (Array.isArray(r)) return r.map((v) => (typeof v === 'number' ? Math.min(v, cap) : v));
  if (typeof r !== 'number') return r;
  const a = Math.abs(w), b = Math.abs(h);
  if (r >= Math.min(a, b) / 2 - 0.5 && b >= a * 0.8) return r;
  return Math.min(r, cap);
}

/** The same cap on a context's own roundRect, for scenes that call it directly. */
export function capCorners(ctx) {
  if (active.corner == null || typeof ctx?.roundRect !== 'function') return;
  const own = ctx.roundRect.bind(ctx);
  ctx.roundRect = (x, y, w, h, r) => own(x, y, w, h, cornerOf(r, w, h));
}

const overshoots = (args) => {
  const n = args.split(',').map(Number);
  return n.length === 4 && (n[1] < 0 || n[1] > 1 || n[3] < 0 || n[3] > 1);
};

// box-shadow layers, split at top-level commas. A solid lip: no x offset, a y offset, no blur.
function dropLips(value) {
  const layers = [];
  let depth = 0, from = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) { layers.push(value.slice(from, i)); from = i + 1; }
  }
  layers.push(value.slice(from));
  const kept = layers.filter((l) => !/^\s*(inset\s+)?0(px)?\s+-?[\d.]+px\s+0(px)?\s/.test(l) || /^\s*(inset\s+)?0(px)?\s+-?0(\.0+)?px\s/.test(l));
  return kept.length ? kept.join(',').trim() : 'none';
}

function flattenBlock(block) {
  const size = (prop) => block.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([\\d.]+)px`))?.[1];
  const w = size('width');
  const disc = w != null && w === size('height');
  let out = block;
  if (!disc) {
    out = out.replace(/(border(?:-[a-z]+)*-radius\s*:\s*)([^;}]+)/g, (m, head, value) => head
      + value.replace(/([\d.]+)px/g, (px, n) => `${Math.min(Number(n), active.corner ?? Number(n))}px`));
  }
  return out.replace(/(box-shadow\s*:\s*)([^;}]+?)(\s*!important)?(?=\s*[;}])/g, (m, head, value, imp = '') => head + dropLips(value) + imp);
}

/**
 * A scene's own CSS under a look with flattenScenes: radii capped, overshoot curves to --look-spring, solid
 * lips off. A rule whose motion is the mechanism (a ball that bounces, a valve that snaps) declares
 * --motion: model and keeps its own curves; so does a whole @keyframes whose name ends in -model.
 */
export function lookCss(css) {
  if (!active.flattenScenes) return css;
  const curves = (b) => (/--motion\s*:\s*model/.test(b) ? b : b.replace(/cubic-bezier\(([^)]*)\)/g, (m, args) => (overshoots(args) ? 'var(--look-spring)' : m)));
  const keep = [];
  const held = css.replace(/@keyframes\s+[\w-]*-model\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (m) => `\u0000${keep.push(m) - 1}\u0000`);
  return held.replace(/\{[^{}]*\}/g, (b) => flattenBlock(curves(b))).replace(/\u0000(\d+)\u0000/g, (m, i) => keep[Number(i)]);
}

/** A scene's own SVG markup under a look with flattenScenes: rect corners capped, as cornerOf. */
export function lookSvg(markup) {
  if (!active.flattenScenes || active.corner == null) return markup;
  return markup.replace(/<rect\b[^>]*>/g, (tag) => {
    const num = (k) => Number(tag.match(new RegExp(`\\s${k}="(-?[\\d.]+)"`))?.[1]);
    const rx = num('rx');
    if (!Number.isFinite(rx)) return tag;
    const cap = String(cornerOf(rx, num('width'), num('height')));
    return tag.replace(/(\srx=")[^"]*"/, `$1${cap}"`).replace(/(\sry=")[^"]*"/, `$1${cap}"`);
  });
}
