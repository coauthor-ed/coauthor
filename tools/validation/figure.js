// content-block@1 `figure` field (src/core/components/FigureLayouts.js, or the
// renderer form for a course-local renderer, rendererHost.js): shape,
// ids, note targets, counts, text lengths, axis sanity. Pure ESM, no deps:
// imported by tools/validation/block.js (engine + authoring-app) and copied as
// content-repo-template/validators/figure.js (keep the two identical).

export const FIGURE_LAYOUTS = ['steps', 'panels', 'timeline', 'multiples', 'compare'];
export const FIGURE_GLYPHS = { multiples: ['cohort'], compare: ['target'] };
const POSITIONS = ['right', 'left', 'above', 'below', 'flow'];
// Longest text that still fits its card at side-panel width without a wall of text.
const MAX = { caption: 160, title: 40, text: 120, entry: 80, case: 80, label: 24, note: 90, gateItem: 40, tag: 24, verdict: 80, event: 16, tab: 40, a11y: 600 };
// Renderer form: optional publisher prefix, name, major version.
export const RENDERER_NAME = /^([a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*@[1-9][0-9]*$/;
const RENDERER_KEYS = ['renderer', 'caption', 'data', 'position', 'a11yCaption', 'tab'];
const COUNTS = { steps: [2, 6], panels: [2, 4], timeline: [2, 6], multiples: [2, 6], compare: [2, 3] };

const str = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.en === 'string' ? v.en : null);

/**
 * @param {object} fig the block's `figure`
 * @param {string[]} errors pushed to
 * @param {object} [block] the whole block, for the one-medium rule
 */
export function checkFigure(fig, errors, block = {}) {
  const E = (m) => errors.push(`figure: ${m}`);
  if (!fig || typeof fig !== 'object' || Array.isArray(fig)) { E('must be an object'); return; }
  const others = ['image', 'simulation', 'photoDiagram', 'graph', 'diagram'].filter((k) => (k === 'image' || k === 'simulation') ? block[k]?.src : block[k]);
  if (others.length) E(`one medium per block: drop ${others.join(' / ')} or the figure`);
  const text = (v, where, max, required = true) => {
    if (v === undefined || v === null) { if (required) E(`${where} is required`); return; }
    const s = str(v);
    if (s == null) { E(`${where} must be a string or { "en": "..." }`); return; }
    if (required && !s.trim()) E(`${where} is empty`);
    if (s.length > max) E(`${where} is ${s.length} characters; keep it to ${max} (the card wraps, it never shrinks)`);
  };
  const stepOk = (o, where) => { if (o?.step !== undefined && !(Number.isInteger(o.step) && o.step >= 1)) E(`${where}.step must be a whole slide step, 1 or more (1 = the first beat)`); };

  // Renderer form (course-local renderer, contract figure-host@0): the bundle
  // binds the name; `data` belongs to the renderer and is not checked here.
  if (fig.renderer !== undefined) {
    if (typeof fig.renderer !== 'string' || !RENDERER_NAME.test(fig.renderer)) E('renderer must look like "name@1" or "publisher/name@1" (lowercase, digits, -; major version 1 or more)');
    const extra = Object.keys(fig).filter((k) => !RENDERER_KEYS.includes(k));
    if (extra.length) E(`renderer form takes only ${RENDERER_KEYS.join(', ')}; drop ${extra.join(', ')} (built-in figure keys and renderer data do not mix; renderer data goes inside "data")`);
    text(fig.caption, 'caption', MAX.caption);
    if (!fig.data || typeof fig.data !== 'object' || Array.isArray(fig.data)) E('data is required and must be an object (the renderer\'s own shape)');
    if (fig.tab !== undefined) text(fig.tab, 'tab', MAX.tab);
    if (fig.a11yCaption !== undefined) text(fig.a11yCaption, 'a11yCaption', MAX.a11y);
    if (fig.position !== undefined && !POSITIONS.includes(fig.position)) E(`position must be one of ${POSITIONS.join(', ')}`);
    return;
  }

  const L = fig.layout;
  if (!FIGURE_LAYOUTS.includes(L)) { E(`layout must be one of ${FIGURE_LAYOUTS.join(', ')}`); return; }
  text(fig.caption, 'caption', MAX.caption);
  if (fig.tab !== undefined) text(fig.tab, 'tab', MAX.tab);
  if (fig.a11yCaption !== undefined) text(fig.a11yCaption, 'a11yCaption', MAX.a11y);
  if (fig.position !== undefined && !POSITIONS.includes(fig.position)) E(`position must be one of ${POSITIONS.join(', ')}`);

  const items = Array.isArray(fig.items) ? fig.items : null;
  const [lo, hi] = COUNTS[L];
  if (!items) { E('items must be an array'); return; }
  if (items.length < lo || items.length > hi) E(`${L} takes ${lo} to ${hi} items, not ${items.length}`);
  const ids = new Set();
  items.forEach((it, i) => {
    const w = `items[${i}]`;
    if (!it || typeof it !== 'object') { E(`${w} must be an object`); return; }
    if (typeof it.id !== 'string' || !/^[a-z0-9][\w-]*$/i.test(it.id)) E(`${w}.id must be a short id (letters, digits, - or _)`);
    else if (ids.has(it.id)) E(`${w}.id "${it.id}" is used twice`);
    else if (it.id === 'gate' || it.id === 'after') E(`${w}.id "${it.id}" is reserved (notes name the gate and the after stage by it)`);
    else ids.add(it.id);
    text(it.title, `${w}.title`, MAX.title);
    stepOk(it, w);
    if (L === 'steps') {
      text(it.text, `${w}.text`, MAX.text, false);
      text(it.entry, `${w}.entry`, MAX.entry, false);
    } else if (L === 'panels') {
      text(it.text, `${w}.text`, MAX.text);
      text(it.case, `${w}.case`, MAX.case, false);
    } else if (L === 'timeline') {
      text(it.text, `${w}.text`, MAX.text, false);
      const ax = fig.axis || {};
      if (!Number.isFinite(it.from)) E(`${w}.from must be a number on the axis`);
      else if (Number.isFinite(ax.from) && Number.isFinite(ax.to) && (it.from < ax.from || it.from > ax.to)) E(`${w}.from ${it.from} is off the axis (${ax.from} to ${ax.to})`);
      if (it.open === true) { if (it.to !== undefined) E(`${w}: give "to" or "open": true, not both`); }
      else if (!Number.isFinite(it.to)) E(`${w} needs "to" (a number) or "open": true (only a start is known)`);
      else if (Number.isFinite(it.from) && it.to <= it.from) E(`${w}.to must be after from`);
      else if (Number.isFinite(ax.to) && it.to > ax.to) E(`${w}.to ${it.to} is off the axis (ends ${ax.to})`);
      if (it.tone !== undefined && !(Number.isInteger(it.tone) && it.tone >= 1 && it.tone <= 5)) E(`${w}.tone must be 1 to 5`);
    } else if (L === 'multiples') {
      text(it.event, `${w}.event`, MAX.event);
      text(it.text, `${w}.text`, MAX.text);
    } else if (L === 'compare') {
      text(it.text, `${w}.text`, MAX.text);
      if (!(Number.isFinite(it.spread) && it.spread > 0 && it.spread <= 1)) E(`${w}.spread must be a number above 0, at most 1 (share of the target's radius)`);
      if (!(Array.isArray(it.offset) && it.offset.length === 2 && it.offset.every((n) => Number.isFinite(n) && n >= -1 && n <= 1))) E(`${w}.offset must be [x, y], each -1 to 1`);
      if (it.tone !== undefined && !(Number.isInteger(it.tone) && it.tone >= 1 && it.tone <= 5)) E(`${w}.tone must be 1 to 5`);
    }
  });

  if (FIGURE_GLYPHS[L] && !FIGURE_GLYPHS[L].includes(fig.glyph)) E(`${L} needs "glyph": ${FIGURE_GLYPHS[L].map((g) => `"${g}"`).join(' or ')}`);

  if (L === 'steps') {
    text(fig.entryLabel, 'entryLabel', MAX.label, false);
    if (fig.gate !== undefined) {
      const g = fig.gate;
      if (!ids.has(g?.after)) E('gate.after must name an item id (the gate sits after that stage)');
      text(g?.title, 'gate.title', MAX.title);
      if (!(Array.isArray(g?.items) && g.items.length >= 1 && g.items.length <= 5)) E('gate.items must list 1 to 5 conditions');
      else g.items.forEach((t, i) => text(t, `gate.items[${i}]`, MAX.gateItem));
      stepOk(g, 'gate');
    }
    if (fig.after !== undefined) {
      text(fig.after?.title, 'after.title', MAX.title);
      text(fig.after?.text, 'after.text', MAX.text, false);
      stepOk(fig.after, 'after');
    }
  } else {
    for (const k of ['gate', 'after', 'entryLabel']) if (fig[k] !== undefined) E(`"${k}" belongs to layout steps only`);
  }
  if (L === 'panels') text(fig.caseLabel, 'caseLabel', MAX.label, false);
  else if (fig.caseLabel !== undefined) E('"caseLabel" belongs to layout panels only');
  if (L === 'timeline') {
    const ax = fig.axis;
    if (!ax || !Number.isFinite(ax.from) || !Number.isFinite(ax.to) || !Number.isFinite(ax.every)) E('timeline needs axis { from, to, every } (numbers)');
    else {
      if (ax.to <= ax.from) E('axis.to must be after axis.from');
      if (ax.every <= 0) E('axis.every must be above 0');
      else if ((ax.to - ax.from) / ax.every > 12) E(`axis has ${Math.floor((ax.to - ax.from) / ax.every) + 1} ticks; raise "every" (12 intervals at most)`);
      else if (Math.abs(Math.round((ax.to - ax.from) / ax.every) - (ax.to - ax.from) / ax.every) > 1e-9) E('axis: (to - from) must be a whole number of "every" steps');
    }
  } else if (fig.axis !== undefined) E('"axis" belongs to layout timeline only');
  if (L === 'multiples' && fig.aside !== undefined) {
    text(fig.aside?.label, 'aside.label', MAX.label);
    if (!(Array.isArray(fig.aside?.tags) && fig.aside.tags.length >= 1 && fig.aside.tags.length <= 8)) E('aside.tags must list 1 to 8 tags');
    else fig.aside.tags.forEach((t, i) => text(t, `aside.tags[${i}]`, MAX.tag));
    stepOk(fig.aside, 'aside');
  } else if (L !== 'multiples' && fig.aside !== undefined) E('"aside" belongs to layout multiples only');
  if (L === 'compare' && fig.verdict !== undefined) {
    text(fig.verdict?.text, 'verdict.text', MAX.verdict);
    stepOk(fig.verdict, 'verdict');
  } else if (L !== 'compare' && fig.verdict !== undefined) E('"verdict" belongs to layout compare only');

  if (fig.notes !== undefined) {
    if (!Array.isArray(fig.notes)) { E('notes must be an array'); return; }
    if (fig.notes.length > 6) E(`notes: ${fig.notes.length} notes; at most 3 show at once, keep the list short (6 at most)`);
    const targets = new Set([...ids, ...(L === 'steps' && fig.gate ? ['gate'] : []), ...(L === 'steps' && fig.after ? ['after'] : [])]);
    const perStep = new Map();
    fig.notes.forEach((n, i) => {
      const w = `notes[${i}]`;
      if (!targets.has(n?.on)) E(`${w}.on "${n?.on}" names no item${L === 'steps' ? ' (or gate / after)' : ''}`);
      text(n?.label, `${w}.label`, MAX.label);
      text(n?.text, `${w}.text`, MAX.note);
      stepOk(n, w);
      const s = Number.isInteger(n?.step) ? n.step : 1;
      perStep.set(s, (perStep.get(s) || 0) + 1);
    });
    for (const [s, c] of perStep) if (c > 3) E(`${c} notes arrive at step ${s}; at most 3 show at once`);
  }

  // focus: false, or [{ step, on: id | [ids] }] (FigureLayouts figureFocus).
  if (fig.focus !== undefined && fig.focus !== false) {
    if (!Array.isArray(fig.focus)) { E('focus must be false or an array of { step, on }'); return; }
    const targets = new Set([...ids, ...(L === 'steps' && fig.gate ? ['gate'] : []), ...(L === 'steps' && fig.after ? ['after'] : [])]);
    fig.focus.forEach((f, i) => {
      const w = `focus[${i}]`;
      if (!Number.isInteger(f?.step) || f.step < 1) E(`${w}.step must be a 1-based beat number`);
      for (const on of [].concat(f?.on ?? [])) if (!targets.has(on)) E(`${w}.on "${on}" names no item${L === 'steps' ? ' (or gate / after)' : ''}`);
    });
  }
}
