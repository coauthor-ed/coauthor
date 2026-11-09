const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'olympiad'];

/**
 * Validates a `question-bank@1` index file: an id + denormalized list of
 * question refs (never full question bodies) with just enough metadata
 * (type/topicId/difficulty/weight/estimatedTimeSec) for manual browsing and
 * criteria-based auto-selection (see PracticeTestBuilder.js) without
 * fetching every question. Sibling to the existing, unrelated bank.js, which
 * validates a different, still-dormant chunks/typeIndex format built for
 * huge randomized pools behind a single mock exam — see
 * docs/HighLevelDesign.md's distinction between the two.
 *
 * `curriculum`, when given, cross-references each entry's `topicId` against
 * the bank's chapter scope — either the single `chapterId` a chapter-scoped
 * bank has always used, or `chapterIds` (an array) for a bank deliberately
 * combining several chapters (e.g. a subject-wide revision bank), in which
 * case a topicId only needs to belong to *some* listed chapter, not a
 * specific one — `PracticeTestBuilder.js` never reads either field, only
 * `topicId` per question, so nothing at runtime needs a single owning
 * chapter per question. Cross-referencing kept optional since this also
 * runs client-side in the authoring app before a curriculum fetch may have
 * resolved.
 */
export function validateQuestionBank(bankData, curriculum = null) {
  const errors = [];
  const warnings = [];
  if (!bankData.id) errors.push('Missing bank id');
  if (bankData.grade !== undefined && bankData.grade !== null &&
      !((typeof bankData.grade === 'number' && Number.isFinite(bankData.grade)) || (typeof bankData.grade === 'string' && bankData.grade.trim()))) {
    errors.push('Invalid grade: must be a number or a non-empty string');
  }
  if (bankData.chapterId !== undefined && bankData.chapterIds !== undefined) {
    errors.push('question-bank@1 must not set both chapterId and chapterIds — use chapterId for a single-chapter bank, chapterIds for one combining several chapters');
  }

  let validTopicIds = null;
  if (curriculum && bankData.subject) {
    const subject = (curriculum.subjects || []).find((s) => s.id === bankData.subject);
    if (!subject) {
      warnings.push(`Unknown subject: ${bankData.subject} (not in curriculum.json)`);
    } else {
      if (bankData.grade != null && Array.isArray(subject.grades) && !subject.grades.includes(bankData.grade)) {
        warnings.push(`Invalid grade: subject ${bankData.subject} has no grade ${bankData.grade}`);
      }
      const wantedChapterIds = bankData.chapterIds !== undefined
        ? bankData.chapterIds
        : (bankData.chapterId !== undefined ? [bankData.chapterId] : []);
      if (bankData.chapterIds !== undefined && (!Array.isArray(bankData.chapterIds) || bankData.chapterIds.length === 0)) {
        errors.push('chapterIds must be a non-empty array of chapter ids');
      } else if (wantedChapterIds.length > 0) {
        const topicIds = new Set();
        for (const chapterId of wantedChapterIds) {
          const chapter = (subject.chapters || []).find((c) => c.id === chapterId);
          if (!chapter) { warnings.push(`Unknown chapterId: ${chapterId} not found in subject ${bankData.subject}`); continue; }
          for (const t of (chapter.topics || [])) topicIds.add(t.id);
        }
        validTopicIds = topicIds;
      }
    }
  }

  if (!Array.isArray(bankData.questions) || bankData.questions.length === 0) {
    errors.push('Missing or empty questions array');
    return { valid: errors.length === 0, errors, warnings };
  }

  const seenRefs = new Set();

  for (const q of bankData.questions) {
    if (!q.ref) { errors.push('questions[] entry is missing ref'); continue; }
    if (seenRefs.has(q.ref)) errors.push(`Duplicate ref in bank: ${q.ref}`);
    seenRefs.add(q.ref);

    if (!q.type) errors.push(`questions[] entry "${q.ref}" is missing type`);
    if (q.difficulty !== undefined && !DIFFICULTY_LEVELS.includes(q.difficulty)) {
      errors.push(`questions[] entry "${q.ref}" has invalid difficulty: "${q.difficulty}" (must be one of ${DIFFICULTY_LEVELS.join(', ')})`);
    }
    if (q.estimatedTimeSec !== undefined && (typeof q.estimatedTimeSec !== 'number' || q.estimatedTimeSec <= 0)) {
      errors.push(`questions[] entry "${q.ref}" has invalid estimatedTimeSec: must be a positive number of seconds`);
    }
    if (q.weight !== undefined && (typeof q.weight !== 'number' || q.weight <= 0)) {
      errors.push(`questions[] entry "${q.ref}" has invalid weight: must be a positive number`);
    }
    if (validTopicIds && q.topicId && !validTopicIds.has(q.topicId)) {
      const scope = bankData.chapterIds !== undefined ? `any of chapters [${bankData.chapterIds.join(', ')}]` : `chapter ${bankData.chapterId}`;
      warnings.push(`questions[] entry "${q.ref}" has topicId "${q.topicId}" not found under ${scope}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
