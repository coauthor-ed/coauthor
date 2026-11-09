/**
 * The decisions behind <quill-cameo> and the reactor, with no DOM: which act
 * from a pool, which finds count, how often he still appears, where he may
 * stand, and what a Quill already on screen does instead. Separate so plain
 * node can test them (test/unit/quillCameo.test.mjs).
 */

/** A picker over `list` that never gives the same answer twice running. */
export function createPool(list, random = Math.random) {
  let last = null;
  return () => {
    const free = list.length > 1 ? list.filter((a) => a !== last) : list;
    last = free[Math.floor(random() * free.length)];
    return last;
  };
}

// ---- once per find ---------------------------------------------------------

const DEDUPE_MS = 8000;
const NEAR_PX = 40;
const NO_HOST = {};

/**
 * Says whether a cue:found is a new find. A find with a `key` counts once for
 * the life of its host (the mounted scene). Without one, p.thing (src/core/cues.js)
 * says what was found, and that thing counts once per beat of the scene:
 *   - the same element, or for a point the same place on the stage, is the same
 *     thing; an element the scene has since rebuilt falls back to the place
 *   - a thing whose scene reads differently is a new find, so one Check button
 *     through a game's rounds still reacts each round
 *   - a vague find (the emitter named nothing, so only "the middle of the
 *     stage") cannot be told from the next one, so it counts for 8 s, and an
 *     emitter that fires per frame keeps refreshing that window.
 */
export function createFindGate({ windowMs = DEDUPE_MS, nearPx = NEAR_PX } = {}) {
  const hosts = new WeakMap();
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= nearPx;
  const sameThing = (a, b) => {
    if (a.el && a.el === b.el) return true;
    if (a.el && b.el) return b.el.isConnected === false && near(a, b);
    return near(a, b);
  };
  return {
    fresh(p, now = Date.now()) {
      const host = p?.host || NO_HOST;
      let seen = hosts.get(host);
      if (!seen) { seen = { keys: new Set(), things: [], beat: undefined }; hosts.set(host, seen); }
      const t = p?.thing ?? {};
      if (t.beat !== seen.beat) { seen.beat = t.beat; seen.things = []; }
      if (p?.key != null) {
        if (seen.keys.has(p.key)) return false;
        seen.keys.add(p.key);
        return true;
      }
      const thing = { x: Number(t.x ?? p?.x) || 0, y: Number(t.y ?? p?.y) || 0, el: t.el || null, state: t.state, vague: !!t.vague, at: now };
      seen.things = seen.things.filter((r) => !r.vague || now - r.at < windowMs);
      const hit = seen.things.find((r) => r.vague === thing.vague && r.state === thing.state && sameThing(thing, r));
      if (hit) { hit.at = now; return false; }
      seen.things.push(thing);
      return true;
    },
  };
}

// ---- novelty taper (same shape as the page turn's, its own score) ----------

const NOVELTY_KEY = 'coauthor.cameo.novelty';
const HALF_LIFE_MS = 20 * 60 * 1000;
const RUSH_MS = 30 * 1000;   // a cameo this soon after the last counts 1.5x
const SCORE_CAP = 30;
const EVERY_NTH = 3;
let memo = null;             // when storage is unavailable (private window)

function readNovelty() {
  try {
    const v = JSON.parse(localStorage.getItem(NOVELTY_KEY));
    if (v && Number.isFinite(v.score) && Number.isFinite(v.at)) return { total: 0, finds: 0, ...v };
  } catch { /* fall through */ }
  return memo || { score: 0, at: 0, total: 0, finds: 0 };
}

function writeNovelty(v) {
  memo = v;
  try { localStorage.setItem(NOVELTY_KEY, JSON.stringify(v)); } catch { /* memo only */ }
}

const recentScore = (v, now) => v.score * Math.pow(0.5, Math.max(0, now - v.at) / HALF_LIFE_MS);

/**
 * What the next find gets: { tier, show, small }. Every cameo adds to a
 * "seen him" score that halves every 20 minutes; a small floor grows with
 * every cameo ever seen.
 *   full    (seen < 6)    pops in, the whole act
 *   brisk   (6 to 14)     pops in, a small act (a nod or a peek)
 *   sparse  (14 to 22)    the same, every third find
 *   off     (22 and over) he stays away
 */
export function cameoPlan(now = Date.now()) {
  const v = readNovelty();
  const seen = recentScore(v, now) + Math.min(6, v.total / 60);
  if (seen < 6) return { tier: 'full', show: true, small: false };
  if (seen < 14) return { tier: 'brisk', show: true, small: true };
  if (seen < 22) return { tier: 'sparse', show: v.finds % EVERY_NTH === 0, small: true };
  return { tier: 'off', show: false, small: true };
}

/** Counts a find that reached the taper; only a shown one adds to the score. */
export function noteCameo(shown, now = Date.now()) {
  const v = readNovelty();
  if (!shown) { writeNovelty({ ...v, finds: v.finds + 1 }); return; }
  const add = now - v.at < RUSH_MS ? 1.5 : 1;
  writeNovelty({ score: Math.min(SCORE_CAP, recentScore(v, now) + add), at: now, total: v.total + 1, finds: v.finds + 1 });
}

// ---- what is on screen -----------------------------------------------------

const keepRects = (a) => [...(a.keepOut?.controls || []), ...(a.keepOut?.readings || [])];

/**
 * Turns the answers to one cue:stage-query into a place to stand, or null.
 *
 * over: 'stage' for a find (he stays on the scene's stage), 'page' otherwise.
 * fullscreen: the document has a fullscreen element, so only a stage that can
 * adopt him is painted at all. No stage answered a find: `fallback`, a corner
 * of the page, clear of everything the page answered with (that takes in the
 * block the scene is in, so the corner is outside the stage).
 *
 * Returns { stage, obstacles, clear, box, adopt, fallback }.
 */
export function readStage(answers, { over, viewport, fullscreen = false }) {
  const room = answers.find((a) => a.adopt);
  if (fullscreen && !room) return null;
  const own = answers.find((a) => a.own);
  const on = over === 'stage' && own ? own : room;
  if (on) {
    const stage = on.seen();
    if (!stage) return null;
    return { stage, obstacles: keepRects(on), clear: on.clear, box: on.box, adopt: room?.adopt || null, fallback: false };
  }
  return { stage: viewport, obstacles: answers.flatMap(keepRects), clear: null, box: null, adopt: null, fallback: over === 'stage' };
}

/** A Quill already on screen for this find, from the same answers, or null.
 *  A stage answers only for one the learner can see; page chrome likewise. */
export const residentOf = (answers) => answers.find((a) => a.companion)?.companion || null;

// ---- where he stands -------------------------------------------------------

const FOUND_R = 66;           // the find's ring, kept clear of him
const SIDE_PAD = 0.08;        // a leaning bird reaches past his box, in widths of him
const PEEK_SHOW = 0.55;       // how much of a peeking head shows at the bottom edge
const PEEK_SCALE = 0.6;       // a peek is this much of his normal height

/**
 * Room an act needs beyond his standing box: side (towards the stage) in widths
 * of him, up in heights of him. Stars and dust may pass over things; he and his
 * ink do not. feet: the act is in his feet, so he stands on the bottom edge, whole.
 */
export const ACT_ROOM = {
  inktick: { side: 0.9, up: 0.1 },
  backflip: { side: 0.05, up: 0.72, feet: true },
  twirl: { side: 0.05, up: 0.3 },
  wow: { side: 0.05, up: 0.32 },
  dance: { side: 0.08, up: 0.12, feet: true },
  slide: { side: 0.65, up: 0.05, feet: true },
  clap: { side: 0, up: 0.12 },
  point: { side: 0.32, up: 0.02 },
  cheer: { side: 0.05, up: 0.3 },
};

const overlaps = (a, b, pad = 0) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

const IN_PLACE = new Set(['clap', 'nod', 'point', 'inktick']);
const INK_DROP = 0.55;        // the tick stays in the top of this much of his height
const AIM_LANE = [0.26, 0.46];// a level flipper stays in this band of his height
const AIM_RISE = 0.12;        // and it reads best a little above level

/**
 * What a Quill already on screen does for `act`: { act, target }. He stands in a
 * layout beside text and cannot come to an edge. A peek (coming into view) is a
 * nod and anything that leaves the ground is a clap. The tick is drawn past his
 * box on his right, so it is a clap where text sits there.
 *
 * `point` only works sideways: a shoulder stops about 30 degrees below level, and
 * at his size the text beside him would swallow a flipper aimed downwards. So he
 * points across, over that text, level towards the find, and a find that is more
 * below him than beside him (a phone, the scene under the story) gets a clap
 * with his eyes on it, as does a lane with text in it.
 *
 * resident: { box, beside } from the stage answer. target: the find, or null.
 */
export function residentAct(act, { box, beside = [] }, target = null) {
  const out = (name, aim = target) => ({ act: name, target: aim });
  if (act === 'peek') return out('nod');
  if (!IN_PLACE.has(act)) return out('clap');
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const free = (zone) => !beside.some((b) => overlaps(zone, b));
  if (act === 'inktick') {
    const ink = { left: box.right, right: box.right + w * ACT_ROOM.inktick.side, top: box.top, bottom: box.top + h * INK_DROP };
    return out(free(ink) ? 'inktick' : 'clap');
  }
  if (act !== 'point') return out(act);
  if (!target) return out('clap');
  const dx = target.x - (box.left + box.right) / 2;
  const dy = target.y - (box.top + box.bottom) / 2;
  if (Math.abs(dy) > Math.abs(dx)) return out('clap');
  const reach = w * ACT_ROOM.point.side;
  const lane = { left: dx > 0 ? box.right : box.left - reach, right: dx > 0 ? box.right + reach : box.left, top: box.top + h * AIM_LANE[0], bottom: box.top + h * AIM_LANE[1] };
  if (!free(lane)) return out('clap');
  return out('point', { x: target.x, y: box.top + h * 0.5 - Math.abs(dx) * AIM_RISE });
}

/**
 * The nearest free place on the stage's left, right or bottom edge.
 *
 * stage, obstacles: viewport rects. target: { x, y }, kept clear of him.
 * size: { w, h, full }: h is the part of him that shows at the bottom edge,
 * full his whole height, which is what shows at a side. extra: px of room the
 * act needs on the stage side of him; lift: px it needs above him. edges: which
 * edges to try. test(rect): a last check, for what geometry alone cannot see.
 * Returns { edge, mirror, rect (him, without the room) } or null.
 */
export function pickSpot({ stage, target, obstacles = [], size, extra = 0, lift = 0, edges = ['left', 'right', 'bottom'], test = null }) {
  const { w, h, full = h } = size;
  const sw = stage.right - stage.left;
  const sh = stage.bottom - stage.top;
  if (sw < w + extra + 8 || sh < h + 8) return null;
  const tx = target?.x ?? (stage.left + stage.right) / 2;
  const ty = target?.y ?? (stage.top + stage.bottom) / 2;
  const step = Math.max(20, Math.round(w / 2));
  const out = [];
  const add = (edge, left, top, mirror) => {
    const tall = edge === 'bottom' ? h : full;
    const rect = { left, top, right: left + w, bottom: top + tall };
    const pad = edge === 'bottom' ? 0 : w * SIDE_PAD;
    const zone = {
      left: mirror ? left - extra : left,
      right: mirror ? left + w : left + w + extra,
      top: Math.max(stage.top, top - lift - pad),
      bottom: Math.min(stage.bottom, rect.bottom + pad),
    };
    const cx = left + w / 2;
    const cy = top + tall / 2;
    // Near the find, but towards a corner: the middle of an edge is where a
    // scene keeps its captions and its subject.
    const corner = Math.min(cx - stage.left, stage.right - cx) + Math.min(cy - stage.top, stage.bottom - cy);
    // A side edge hides half of him, so it comes second to the bottom edge.
    const side = edge === 'bottom' ? 0 : h * 0.8;
    out.push({ edge, mirror, rect, zone, cost: Math.hypot(cx - tx, cy - ty) + corner * 0.7 + side });
  };
  if (edges.includes('left') || edges.includes('right')) {
    for (let y = stage.bottom - full; y >= stage.top; y -= step) {
      if (edges.includes('left')) add('left', stage.left, y, false);
      if (edges.includes('right')) add('right', stage.right - w, y, true);
    }
  }
  if (edges.includes('bottom')) {
    for (let x = stage.left; x <= stage.right - w; x += step) {
      add('bottom', x, stage.bottom - h, x + w / 2 > (stage.left + stage.right) / 2);
    }
  }
  out.sort((a, b) => a.cost - b.cost);
  const mark = target ? { left: tx - FOUND_R, right: tx + FOUND_R, top: ty - FOUND_R, bottom: ty + FOUND_R } : null;
  for (const c of out) {
    if (c.zone.left < stage.left || c.zone.right > stage.right) continue;
    if (mark && overlaps(c.zone, mark)) continue;
    if (obstacles.some((o) => overlaps(c.zone, o, 6))) continue;
    if (test && !test(c.zone)) continue;
    return { edge: c.edge, mirror: c.mirror, rect: c.rect };
  }
  return null;
}

/**
 * What he does and where, or null for no show. The whole act if it has room;
 * else a smaller one where he stands; else a small peek from the nearest edge
 * that is clear; else he stays away. w, h: his box, showing `show` of h at the
 * bottom edge. Returns the pickSpot result plus { act, w, h, small }.
 */
export function chooseSpot({ stage, target, obstacles = [], act, w, h, show = 0.8, test = null }) {
  for (const name of [...new Set([act, 'clap', 'nod'])]) {
    const room = ACT_ROOM[name] || {};
    const size = { w, h: room.feet ? h : Math.round(h * show), full: h };
    const spot = pickSpot({ stage, target, obstacles, size, extra: Math.round(w * (room.side || 0)), lift: Math.round(h * (room.up || 0)), edges: room.feet ? ['bottom'] : undefined, test });
    if (spot) return { ...spot, act: name, w, h, small: false };
  }
  const ph = Math.round(h * PEEK_SCALE);
  const pw = Math.round(w * PEEK_SCALE);
  const spot = pickSpot({ stage, target, obstacles, size: { w: pw, h: Math.round(ph * PEEK_SHOW), full: ph }, edges: ['bottom'], test })
    || pickSpot({ stage, target, obstacles, size: { w: pw, h: ph, full: ph }, edges: ['left', 'right'], test });
  return spot ? { ...spot, act: 'peek', w: pw, h: ph, small: true } : null;
}
