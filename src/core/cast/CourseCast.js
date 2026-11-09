import { CourseSourceManager } from '../CourseSourceManager.js';
import { ErrorReporter } from '../ErrorReporter.js';
import { EventBus } from '../EventBus.js';
import { checkCast, castTag } from './castData.js';
import { defineFigure, defineElement, bindCharacter, defineCoach, defineLogo } from './CastFigure.js';

/**
 * The open course's story cast (manifest.json `"cast"`, castData.js).
 *
 * LookManager loads it when a course whose manifest names a cast is opened
 * (followBundle()), lays its brand overlay over the look while that course is
 * open (the companion and stagehand slots, the narrator copy), and clears it
 * on leaving. This module is imported only then: a course without a cast never
 * loads it. <markdown-renderer> asks it for the active cast to turn
 * `<!-- SAY id -->` paragraphs into speech bubbles (sayBubbles.js).
 *
 * Everything a cast names is bundle-relative and resolved through
 * CourseSourceManager.resolveRef(), like image.src and simulation.src: pose
 * images load as <img>, an `element` module by dynamic import(). No new
 * origin is involved.
 *
 * A loaded cast:
 *   { bundleId, ref, narrator, order, chars: { id: character with pose URLs },
 *     tags: { id: element tag }, overlay: { slots, copy, props, figure } }
 */

const _loads = new Map(); // `${bundleId}\n${ref}` -> Promise<loaded|null>
let _active = null;
let _pending = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function doLoad(bundleId, ref) {
  await CourseSourceManager.init();
  const resolve = (p) => CourseSourceManager.resolveRef(p, bundleId);
  let json;
  try {
    json = await fetchJson(resolve(ref));
  } catch (e) {
    ErrorReporter.reportError(new Error(`Story cast "${ref}" could not be loaded; the course shows the look's own companion.`), { bundleId, cause: String(e?.message || e) });
    return null;
  }
  const { cast, errors } = checkCast(json);
  if (errors.length) ErrorReporter.reportError(new Error(`Story cast "${ref}" has problems${cast ? '; usable characters are kept' : ''}.`), { bundleId, errors });
  if (!cast) return null;

  const chars = {};
  const tags = {};
  for (const id of cast.order) {
    const c = cast.characters[id];
    const ch = { ...c, poses: Object.fromEntries(Object.entries(c.poses).map(([m, p]) => [m, resolve(p)])) };
    chars[id] = ch;
    let tag = defineFigure(castTag(bundleId, id), ch);
    if (c.element) {
      try {
        const mod = await import(/* webpackIgnore: true */ resolve(c.element));
        tag = defineElement(castTag(bundleId, id, 'cast-el'), mod, ch) || tag;
      } catch (e) {
        ErrorReporter.reportError(new Error(`Story cast element "${c.element}" could not be loaded; "${id}" shows its pose images.`), { bundleId, cause: String(e?.message || e) });
      }
    }
    tags[id] = tag;
  }

  const narrator = chars[cast.narrator];
  const handTag = castTag(bundleId, cast.narrator, 'cast-hand');
  bindCharacter(handTag, narrator);
  const lead = { ...narrator, figureTag: tags[cast.narrator] };
  const coachTag = defineCoach(castTag(bundleId, cast.narrator, 'cast-coach'), lead);
  const logoTag = defineLogo(castTag(bundleId, cast.narrator, 'cast-logo'), lead);
  // While the course is open the look's mascot never shows: every slot it
  // fills is either the narrator or nothing (null drops the look's piece, so
  // the slot shows its neutral fallback: the spinner, or no math coach, whose
  // plugin then shows its own hints). The look's page turn is off too.
  const overlay = {
    slots: {
      companion: { tag: tags[cast.narrator] },
      coach: { tag: coachTag },
      logo: { tag: logoTag },
      stagehand: { tag: handTag, load: () => import('./CastStagehand.js').then((m) => { m.defineStagehand(handTag); }) },
      'math-coach': null,
      loader: null,
      signature: null,
    },
    props: { turnPage: null, canTurnPage: null },
    figure: tags[cast.narrator],
    copy: {
      narrator: narrator.label,
      companionName: narrator.label,
      stagehandMoves: `${narrator.label} moves them`,
    },
  };
  return { bundleId, ref, narrator: cast.narrator, order: cast.order, chars, tags, overlay };
}

export const CourseCast = {
  /** Loads (once per bundle and path) a cast. Resolves null when there is
   *  none usable; never throws. */
  load(bundleId, ref) {
    if (!bundleId || typeof ref !== 'string' || !ref) return Promise.resolve(null);
    const key = `${bundleId}\n${ref}`;
    if (!_loads.has(key)) _loads.set(key, doLoad(bundleId, ref).catch((e) => { ErrorReporter.reportError(e, { bundleId, ref }); return null; }));
    return _loads.get(key);
  },

  /** A load in flight for the course being opened: whenReady() waits for it. */
  track(promise) {
    const p = Promise.resolve(promise).catch(() => null);
    _pending = p;
    p.finally(() => { if (_pending === p) _pending = null; });
    return p;
  },

  /** The open course's cast (set by LookManager), or null. */
  setActive(loaded) {
    if (loaded === _active) return;
    _active = loaded || null;
    EventBus.emit('cast:changed', { bundleId: _active?.bundleId || null });
  },

  active() {
    return _active;
  },

  /** The active cast once any load in flight has settled. */
  whenReady() {
    return Promise.resolve(_pending).then(() => _active);
  },
};
