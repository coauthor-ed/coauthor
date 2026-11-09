/**
 * Pure scoring logic for fuzzy-descriptive@1, shared between the runtime
 * plugin (index.js) and the authoring-app editor's scoring-preview sandbox.
 */
export function scoreFuzzyDescriptive(itemData, response) {
  if (!response || response.trim() === '') {
    return { isCorrect: false, score: 0, feedback: 'No answer provided.', matched: [] };
  }

  const answerText       = response.toLowerCase();
  const requiredKeywords = itemData.requiredKeywords || [];
  const minMatchCount    = itemData.minMatchCount || requiredKeywords.length;

  if (requiredKeywords.length === 0) {
    return { isCorrect: true, score: 1, feedback: itemData.correctFeedback || 'Thank you for your response.', matched: [] };
  }

  const matched   = requiredKeywords.filter(kw => answerText.includes(kw.toLowerCase()));
  const isCorrect = matched.length >= minMatchCount;
  let   score     = isCorrect ? 1 : 0;

  if (!isCorrect && matched.length > 0 && itemData.allowPartial) {
    score = matched.length / requiredKeywords.length;
  }

  let feedback = isCorrect ? itemData.correctFeedback : itemData.incorrectFeedback;
  if (score > 0 && score < 1 && itemData.partialFeedback) feedback = itemData.partialFeedback;

  return { isCorrect, score, feedback, matched };
}
