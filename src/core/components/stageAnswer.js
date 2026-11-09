import { EventBus } from '../EventBus.js';
import { CUES } from '../cues.js';

/**
 * Answers cue:stage-query, the look's question "what is on screen?", so that
 * nothing outside a component ever reads inside it (invariant 4). A component
 * calls one of the two functions below from its own module, handing over its
 * own elements; this file reads those subtrees and nothing else. It never
 * follows a shadow root: a nested component counts by its outer box.
 *
 * The query: { host, reply(answer) }, sent synchronously.
 *
 * An answer from the component that owns a stage (answerStageQueries):
 *   own       true: `host` is on this stage
 *   box()     the stage's rect, or null once it is gone (cheap: called per frame)
 *   seen()    the part of it on screen, or null
 *   keepOut   { controls: [rect], readings: [rect] }, viewport px
 *   clear(r)  nothing else (a panel, a bar) sits on the stage over rect r
 *   adopt(el) only while this stage owns the whole screen (native fullscreen, or
 *             a full-view overlay): the owner places el inside itself, since
 *             nothing outside that subtree is painted
 *   companion on a `host` that is on this stage: a Quill already standing by the
 *             scene that a learner can see right now, or null (below)
 * An answer from page chrome (answerPageQueries): { keepOut: { controls }, companion }.
 *
 * companion: { actor, box, beside }. actor: the element the look put in the
 * owner's slot, to act through its public API. box: its rect. beside: the rects
 * of the text it stands next to, which an act must not cover. Only the owner
 * knows what that text is, so the look never has to look for it.
 *
 * Readings are everything a learner reads off a scene: chips, labels, captions,
 * SVG text, SVG drawings (a curve, a panel's outline, a marker), the found thing.
 * A canvas keeps its text in pixels, so a canvas is scanned once for fine
 * dark-on-light detail (canvasInk).
 */

const CONTROLS = [
  'button', 'a[href]', 'input', 'select', 'textarea', 'summary', '[role="button"]', '[role="slider"]', '[role="radio"]',
  '[role="checkbox"]', '[role="tab"]', '[role="switch"]', '[contenteditable="true"]', '[draggable="true"]',
].join(',');
const GRAB_CURSORS = new Set(['pointer', 'grab', 'grabbing', 'move', 'text']);
const NOT_TEXT = new Set(['style', 'script', 'title', 'desc', 'defs']);
const BIG_SHARE = 0.5;        // an element this much of the stage is a layer, not a chip
const SVG_SHAPES = new Set(['path', 'polyline', 'polygon', 'line', 'circle', 'ellipse', 'rect', 'image']);
const SVG_UNDRAWN = 'defs, clipPath, mask, pattern, marker, symbol';
const SPAN_SHARE = 0.7;       // a shape this wide or tall across the stage is its floor or sky, or an axis
const SEEN_SHARE = 0.6;       // this much of a companion on screen, or he is not there
const SEEN_AT = [0.15, 0.5, 0.85]; // down his middle, head to feet: he must be the top thing

// canvasInk: a grid over the canvas; a cell with this many sharp sideways steps
// holds text or line art. Sideways only, so a long floor line does not count.
const INK_CELL = 10;          // css px
const INK_STEP = 34;          // luminance step, 0 to 255, that counts as an edge
const INK_SHARE = 0.05;       // share of a cell's samples that must be edges

export const asRect = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

const meets = (r, a) => r.width > 0 && r.height > 0 && r.right > a.left && r.left < a.right && r.bottom > a.top && r.top < a.bottom;

const shows = (el) => el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true;

function ownText(el) {
  for (const n of el.childNodes) if (n.nodeType === 3 && n.data.trim()) return n;
  return null;
}

function textRects(el, stageArea, within, out) {
  const r = el.getBoundingClientRect();
  if (!meets(r, within)) return;
  if (r.width * r.height <= stageArea * BIG_SHARE) { out.push(asRect(r)); return; }
  const range = document.createRange();
  range.selectNodeContents(el);
  for (const line of range.getClientRects()) if (meets(line, within)) out.push(asRect(line));
}

/**
 * Luminance edges of a canvas, as viewport rects. Reads a copy, so the scene's
 * own canvas never takes the slow readback path. A tainted or blank canvas (a
 * WebGL scene's buffer is cleared) gives nothing.
 */
export function canvasInk(canvas, within) {
  const box = canvas.getBoundingClientRect();
  if (!meets(box, within) || !canvas.width) return [];
  try {
    const w = Math.min(canvas.width, Math.round(box.width));
    const h = Math.max(1, Math.round((w * canvas.height) / canvas.width));
    const copy = document.createElement('canvas');
    copy.width = w; copy.height = h;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const lum = (i) => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const sx = box.width / w;
    const sy = box.height / h;
    const out = [];
    for (let cy = 0; cy < h; cy += INK_CELL) {
      let run = null;
      for (let cx = 0; cx < w; cx += INK_CELL) {
        let edges = 0;
        let n = 0;
        for (let y = cy; y < Math.min(h, cy + INK_CELL); y += 1) {
          for (let x = cx; x < Math.min(w - 1, cx + INK_CELL); x += 1) {
            const i = (y * w + x) * 4;
            n += 1;
            if (Math.abs(lum(i) - lum(i + 4)) >= INK_STEP) edges += 1;
          }
        }
        const hit = n > 0 && edges / n >= INK_SHARE;
        if (hit && run) run.right = box.left + (cx + INK_CELL) * sx;
        else if (hit) {
          run = { left: box.left + cx * sx, top: box.top + cy * sy, right: box.left + (cx + INK_CELL) * sx, bottom: box.top + (cy + INK_CELL) * sy };
          out.push(run);
        } else run = null;
      }
    }
    return out;
  } catch { return []; }
}

/** An SVG shape a learner reads, as a rect, or null: drawn, and not the scene's own ground. */
function drawnShape(el, within) {
  if (el.closest(SVG_UNDRAWN) || !shows(el)) return null;
  const r = el.getBoundingClientRect();
  if (!meets(r, within)) return null;
  const across = r.width / (within.right - within.left);
  const down = r.height / (within.bottom - within.top);
  return across >= SPAN_SHARE || down >= SPAN_SHARE ? null : asRect(r);
}

/** Controls and readings under `root`, within the rect `within`. */
export function keepOutOf(root, within) {
  const controls = [];
  const readings = [];
  const area = (within.right - within.left) * (within.bottom - within.top);
  for (const el of root.querySelectorAll('*')) {
    const name = el.localName;
    if (name === 'canvas') { readings.push(...canvasInk(el, within)); continue; }
    if (NOT_TEXT.has(name)) continue;
    if (SVG_SHAPES.has(name) && el.ownerSVGElement) {
      const shape = drawnShape(el, within);
      if (shape) readings.push(shape);
    }
    const control = el.matches(CONTROLS);
    const found = el.hasAttribute('data-sim-found');
    const text = ownText(el);
    const grab = !control && GRAB_CURSORS.has(getComputedStyle(el).cursor);
    if (!(control || found || text || grab) || !shows(el)) continue;
    if (control || grab) {
      const r = el.getBoundingClientRect();
      if (meets(r, within) && !(grab && r.width * r.height > area * BIG_SHARE)) controls.push(asRect(r));
    }
    if (found || text) textRects(el, area, within, readings);
  }
  return { controls, readings };
}

const holds = (a, b) => { for (let n = b; n; n = n.parentNode || n.host) if (n === a) return true; return false; };

function clearOver(el, rect) {
  const root = el.getRootNode();
  const xs = [rect.left + 4, (rect.left + rect.right) / 2, rect.right - 4];
  const ys = [rect.top + 4, (rect.top + rect.bottom) / 2, rect.bottom - 4];
  return xs.every((x) => ys.every((y) => {
    const hit = root.elementFromPoint(x, y);
    return !hit || holds(el, hit) || holds(hit, el);
  }));
}

function viewportPart(r) {
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(window.innerWidth, r.right);
  const bottom = Math.min(window.innerHeight, r.bottom);
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

const companionCard = (actor, beside) => ({
  actor,
  box: asRect(actor.getBoundingClientRect()),
  beside: beside.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map(asRect),
});

/**
 * The first of `els` a learner really sees: drawn, mostly on screen, and on top
 * of what is there. The hit test is what takes in a scroller that clipped him, a
 * window floated over him, and a fullscreen subtree he is not part of. It stays
 * in the element's own tree, so it follows no shadow root.
 */
export function seenCompanion(els) {
  return els.find((el) => {
    if (!el?.isConnected || !shows(el)) return false;
    const r = el.getBoundingClientRect();
    const part = viewportPart(r);
    if (!part || (part.right - part.left) * (part.bottom - part.top) < r.width * r.height * SEEN_SHARE) return false;
    const root = el.getRootNode();
    const x = (r.left + r.right) / 2;
    return SEEN_AT.every((f) => {
      const hit = root.elementFromPoint(x, r.top + r.height * f);
      return !!hit && holds(el, hit);
    });
  }) || null;
}

/**
 * For the component a scene is mounted in. Call from its connectedCallback;
 * the returned function stops answering (disconnectedCallback).
 *   stage()   the element the scene is mounted in, or null
 *   frame()   the window the scene shows in, when that is more than the scene
 *             (a scaled DOM scene sits inside it, with margins): the stage rect
 *             is this one, and the scene's margins are his to stand in
 *   room()    an adopt function while this stage owns the whole screen, else null
 *   residents()  the companions this component has placed by the scene, nearest
 *             the scene's story first
 *   beside()  the text those companions stand next to
 */
export function answerStageQueries({ stage, frame = stage, room = null, residents = null, beside = null }) {
  const onQuery = (q) => {
    const el = stage();
    if (!el?.isConnected) return;
    const adopt = room?.() || null;
    const own = !!q.host && el.contains(q.host);
    if (!own && !adopt) return;
    const view = frame() || el;
    const seen = () => (view.isConnected ? viewportPart(view.getBoundingClientRect()) : null);
    const now = seen();
    const actor = own && residents ? seenCompanion([...residents()]) : null;
    q.reply({
      own,
      companion: actor ? companionCard(actor, [...(beside?.() || [])]) : null,
      box: () => (view.isConnected ? asRect(view.getBoundingClientRect()) : null),
      seen,
      keepOut: now ? keepOutOf(view, now) : { controls: [], readings: [] },
      clear: (r) => clearOver(view, r),
      adopt,
    });
  };
  EventBus.on(CUES.STAGE_QUERY, onQuery);
  return () => EventBus.off(CUES.STAGE_QUERY, onQuery);
}

/**
 * For page chrome. els(): the component's own elements a look keeps off (nav
 * bars, the block in play); each counts by its outer box. Same lifetime rules.
 * coach(): a companion the page is showing right now, or null, as { actor,
 * beside: [elements] }. It takes no pointer, so the owner vouches for it.
 */
export function answerPageQueries(els, coach = null) {
  const onQuery = (q) => {
    const controls = [];
    for (const el of els()) {
      const r = el?.getBoundingClientRect?.();
      if (r && r.width > 0 && r.height > 0) controls.push(asRect(r));
    }
    const c = coach?.();
    q.reply({ keepOut: { controls, readings: [] }, companion: c?.actor ? companionCard(c.actor, c.beside || []) : null });
  };
  EventBus.on(CUES.STAGE_QUERY, onQuery);
  return () => EventBus.off(CUES.STAGE_QUERY, onQuery);
}
