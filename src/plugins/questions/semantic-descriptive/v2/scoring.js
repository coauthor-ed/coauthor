/**
 * Pure scoring logic for the two dimensions semantic-descriptive@2 adds on
 * top of @1's embedding-based rubric (content) scoring: `formatChecks`
 * (regex presence, deterministic, no model) and `wordLimit` (word-count
 * band). Kept separate from index.js, same reason structured-descriptive's
 * scoring.js is separate — shared between the runtime plugin and any future
 * authoring-app scoring-preview sandbox, so the two can't drift apart.
 */

export function countWords(text) {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * 1.0 inside [min, max]. Falls off linearly outside the band, reaching 0 at
 * a tolerance of 40% of the limit's own span (min 5 words) beyond the
 * nearest edge — CBSE penalizes over/under-length answers but doesn't zero
 * them out for being one word off.
 */
export function scoreWordLimit(text, wordLimit) {
  if (!wordLimit) return null;
  const { min = 0, max = Infinity } = wordLimit;
  const count = countWords(text);
  if (count >= min && count <= max) return 1;
  const span = Number.isFinite(max) ? max : (min || 1);
  const tolerance = Math.max(5, Math.round(0.4 * span));
  const distance = count < min ? (min - count) : (count - max);
  return Math.max(0, 1 - distance / tolerance);
}

/** Per-check pass/fail breakdown, used by both scoreFormatChecks() and the render checklist. */
export function evaluateFormatChecks(text, formatChecks) {
  const cleanText = text || '';
  return (formatChecks || []).map((check) => {
    let matched = false;
    try {
      const re = new RegExp(check.pattern, check.flags ?? 'i');
      matched = re.test(cleanText);
    } catch {
      matched = false; // an unauthorable/invalid pattern never blocks grading, just never matches
    }
    return { id: check.id, label: check.label, weight: check.weight ?? 1, matched };
  });
}

export function scoreFormatChecks(text, formatChecks) {
  if (!formatChecks?.length) return null;
  const results = evaluateFormatChecks(text, formatChecks);
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return null;
  const earnedWeight = results.reduce((sum, r) => sum + (r.matched ? r.weight : 0), 0);
  return earnedWeight / totalWeight;
}

/**
 * Combines whichever of the three dimensions are actually present into one
 * 0..1 score. A dimension absent from the question data (no formatChecks,
 * no wordLimit, empty rubric) is excluded from the weighted average rather
 * than counted as 0 — an author who only wants format+wordLimit checking
 * (no content rubric at all) isn't penalized for the dimension they never
 * authored.
 */
export function combineScores({ formatScore, contentScore, wordLimitScore, weights }) {
  const w = { format: 1, content: 2, wordLimit: 1, ...(weights || {}) };
  const dims = [];
  if (formatScore !== null && formatScore !== undefined) dims.push([formatScore, w.format]);
  if (contentScore !== null && contentScore !== undefined) dims.push([contentScore, w.content]);
  if (wordLimitScore !== null && wordLimitScore !== undefined) dims.push([wordLimitScore, w.wordLimit]);
  const totalWeight = dims.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) return 0;
  const earned = dims.reduce((sum, [score, weight]) => sum + score * weight, 0);
  return earned / totalWeight;
}
