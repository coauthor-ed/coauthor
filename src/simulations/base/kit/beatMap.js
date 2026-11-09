/**
 * beatMap - reads a scene's static BEAT_STEP_MAP / BEAT_MAPS entry.
 *
 * Canonical form: one chain of steps per beat, `[[{ idx, dwellMs? }, ...], ...]`.
 * Also accepted: ONE step object per beat, `[{ idx, dwellMs? }, ...]` (a one-step chain).
 * Anything else throws one plain message naming the scene and the beat. The result
 * is always the canonical form; the scene's own array is never changed, and the
 * result is cached per array.
 *
 *   const map = normalizeBeatMap(C.BEAT_STEP_MAP, scene.constructor.name);
 */
const cache = new WeakMap();

const isStep = (s) => s !== null && typeof s === 'object' && !Array.isArray(s) && Number.isFinite(s.idx);

export function normalizeBeatMap(map, who = 'scene') {
  if (!Array.isArray(map)) return map;
  const hit = cache.get(map);
  if (hit) return hit;
  const out = map.map((e, b) => {
    if (isStep(e)) return [e];
    if (Array.isArray(e) && e.length && e.every(isStep)) return e;
    throw new Error(`${who}: BEAT_STEP_MAP entry for beat ${b} must be a list of steps [{ idx, dwellMs? }, ...] or one { idx, dwellMs? } with a numeric idx (got ${JSON.stringify(e)})`);
  });
  cache.set(map, out);
  return out;
}
