/**
 * Which questions may appear in auto practice. Pure; no I/O.
 * Rule v1 (docs/practice-scheduling.md): a question is eligible when its
 * chapterId is covered by a completed lesson, or when it is a graded
 * question of a completed lesson (source 'lesson').
 *
 * A chapterId containing '/' (e.g. 'epi-analytical/ch2') is course-local: it
 * only matches within the same bundle. Any other id comes from the shared
 * curriculum.json and matches across bundles/repos.
 */

/** True for a course-namespaced (course-local) chapter id. */
export function isNamespacedChapter(chapterId) {
  return typeof chapterId === 'string' && chapterId.includes('/');
}

/**
 * @param {Array<{lessonId:string, completed?:boolean, bundleId?:string|null,
 *   chapterId?:string|null, topicIds?:string[]}>} lessonProgressRows
 * @returns {{chapters:Set<string>, topics:Set<string>, lessons:Set<string>,
 *   bundles:Set<string>, chaptersByBundle:Map<string,Set<string>>}}
 */
export function completedCoverage(lessonProgressRows) {
  const chapters = new Set();
  const topics = new Set();
  const lessons = new Set();
  const bundles = new Set();
  const chaptersByBundle = new Map();
  for (const r of lessonProgressRows || []) {
    if (!r || !r.completed) continue;
    if (r.lessonId) lessons.add(r.lessonId);
    if (r.bundleId) bundles.add(r.bundleId);
    for (const t of r.topicIds || []) if (t) topics.add(t);
    if (r.chapterId) {
      chapters.add(r.chapterId);
      if (r.bundleId) {
        if (!chaptersByBundle.has(r.bundleId)) chaptersByBundle.set(r.bundleId, new Set());
        chaptersByBundle.get(r.bundleId).add(r.chapterId);
      }
    }
  }
  return { chapters, topics, lessons, bundles, chaptersByBundle };
}

/**
 * @param {{chapterId?:string|null, bundleId?:string|null, source?:string,
 *   lessonId?:string|null}} question  a pool entry
 * @param {ReturnType<typeof completedCoverage>} coverage
 */
export function isEligible(question, coverage) {
  if (!question || !coverage) return false;
  // Graded question of a completed lesson: eligible even without a chapterId.
  if (question.source === 'lesson' && question.lessonId && coverage.lessons.has(question.lessonId)) return true;
  const ch = question.chapterId;
  if (!ch) return false;
  if (isNamespacedChapter(ch)) {
    if (!question.bundleId || !coverage.bundles.has(question.bundleId)) return false;
    const perBundle = coverage.chaptersByBundle?.get(question.bundleId);
    return !!perBundle && perBundle.has(ch);
  }
  return coverage.chapters.has(ch);
}
