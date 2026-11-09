/**
 * Pure scoring logic for structured-descriptive@1, shared between the
 * runtime plugin (index.js) and the authoring-app editor's scoring-preview
 * sandbox, so the two can never drift apart.
 */
export const NEGATION_CUES = ['not', 'no', 'without', 'never', "isn't", "aren't", "doesn't", "don't", 'cannot', "can't"];

/**
 * Returns the fraction (0..1) of keywordPatterns matched in text, discounting
 * any keyword preceded within `windowSize` tokens by a negation cue.
 */
export function matchPoint(text, keywordPatterns, windowSize = 4) {
  if (!text || !keywordPatterns?.length) return 0;
  const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
  const tokens = cleanText.split(/\s+/);
  let matched = 0;
  keywordPatterns.forEach(kw => {
    const kwL = kw.toLowerCase().replace(/[^\w\s]/g, '');
    const charIdx = cleanText.indexOf(kwL);
    if (charIdx === -1) return;
    const precedingText = cleanText.substring(0, charIdx);
    const precedingTokens = precedingText.trim() ? precedingText.trim().split(/\s+/) : [];
    const idx = precedingTokens.length;

    const start = Math.max(0, idx - windowSize);
    const preceding = tokens.slice(start, idx);
    if (NEGATION_CUES.some(neg => preceding.includes(neg))) return;
    matched++;
  });
  return matched / keywordPatterns.length;
}

/** Detailed per-keyword match breakdown, used by the editor's preview tester. */
export function matchPointDetailed(text, keywordPatterns, windowSize = 4) {
  const results = [];
  if (!text || !keywordPatterns?.length) return results;
  const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
  const tokens = cleanText.split(/\s+/);
  keywordPatterns.forEach(kw => {
    const kwL = kw.toLowerCase().replace(/[^\w\s]/g, '');
    const charIdx = cleanText.indexOf(kwL);
    if (charIdx === -1) {
      results.push({ keyword: kw, status: 'absent' });
      return;
    }
    const precedingText = cleanText.substring(0, charIdx);
    const precedingTokens = precedingText.trim() ? precedingText.trim().split(/\s+/) : [];
    const idx = precedingTokens.length;
    const start = Math.max(0, idx - windowSize);
    const preceding = tokens.slice(start, idx);
    if (NEGATION_CUES.some(neg => preceding.includes(neg))) {
      results.push({ keyword: kw, status: 'negated' });
    } else {
      results.push({ keyword: kw, status: 'matched' });
    }
  });
  return results;
}

export function scoreRubricPoints(rubricPoints, presentationMode, response) {
  let totalWeight = 0;
  let earnedWeight = 0;
  (rubricPoints || []).forEach(rp => {
    const text = presentationMode === 'split-inputs'
      ? (response?.texts?.[rp.id] ?? '')
      : (response?.singleText ?? '');
    totalWeight += rp.weight;
    earnedWeight += matchPoint(text, rp.keywordPatterns) * rp.weight;
  });
  return totalWeight > 0 ? earnedWeight / totalWeight : 0;
}
