/**
 * Pure rules over lesson/module progress, shared by LessonEngine (writes),
 * HomeDashboard and ModuleDashboard (reads). Kept out of the views so the
 * business logic lives in core (invariant 8).
 */

/**
 * Stars for a finished lesson (lesson-modes-plan.md, owner decision
 * 2026-10-06), from first-try grading of its graded questions only. A POE
 * prediction is not graded here: a wrong prediction is the point of predicting.
 *   3 = every graded question right first try (also: no graded questions)
 *   2 = at least 60% right first try
 *   1 = finished
 * @param {Iterable<boolean>} firstTryResults
 */
export function lessonStars(firstTryResults) {
  let total = 0;
  let right = 0;
  for (const ok of firstTryResults) { total++; if (ok) right++; }
  if (!total || right === total) return 3;
  return right / total >= 0.6 ? 2 : 1;
}

/** Normalised content path of each lesson in a module, in module order. */
export function moduleLessonRefs(moduleData, bundleId, expandRef) {
  return (moduleData?.lessons || []).map((l) =>
    String(expandRef(l.lessonRef || l, bundleId)).replace(/^\//, ''));
}

/**
 * Index of the first lesson without a completed record ("up next"), or -1
 * when every lesson is done. `progressByRef` maps a normalised lesson ref to
 * its lessonProgress record.
 */
export function nextLessonIndex(refs, progressByRef) {
  return refs.findIndex((r) => !progressByRef[r]?.completed);
}

/**
 * A course bundle's position across its modules, in manifest order:
 * `moduleRefs` is one moduleLessonRefs() list per module. `next` is the
 * first lesson without a completed record ({ moduleIndex, lessonIndex }),
 * or null when every lesson is done.
 */
export function courseProgress(moduleRefs, progressByRef) {
  let done = 0;
  let total = 0;
  let next = null;
  moduleRefs.forEach((refs, moduleIndex) => {
    refs.forEach((r, lessonIndex) => {
      total++;
      if (progressByRef[r]?.completed) done++;
      else if (!next) next = { moduleIndex, lessonIndex };
    });
  });
  return { done, total, next };
}

/**
 * The home shelf: modules of one bundle that has two or more of them collapse
 * into one course entry (first module's position, modules in catalog order,
 * which is manifest order). A one-module bundle keeps its module entry as is.
 * A course entry is { type: 'course', path: 'course:<bundleId>', bundleId,
 * title, subject, grade, modules, lessons (all modules' lessons, flattened),
 * _remoteSource, _remoteTitle }.
 */
export function groupShelf(modules, bundleIdOf) {
  const byBundle = new Map();
  for (const m of modules) {
    const id = bundleIdOf(m);
    if (!id) continue;
    if (!byBundle.has(id)) byBundle.set(id, []);
    byBundle.get(id).push(m);
  }
  const out = [];
  const seen = new Set();
  for (const m of modules) {
    const id = bundleIdOf(m);
    const group = id ? byBundle.get(id) : null;
    if (!group || group.length < 2) { out.push(m); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      type: 'course',
      path: `course:${id}`,
      bundleId: id,
      title: { en: m._remoteTitle || id },
      subject: m.subject,
      grade: m.grade,
      modules: group,
      lessons: group.flatMap((g) => g.lessons || []),
      _remoteSource: m._remoteSource,
      _remoteTitle: m._remoteTitle,
    });
  }
  return out;
}
