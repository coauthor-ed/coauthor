/** Read helpers + one-call entry for auto practice. */
import { completedCoverage } from './eligibility.js';
import { buildPool } from './pool.js';
import { buildPracticePlan } from './plan.js';
import { localDateString } from './leitner.js';

export { completedCoverage, isEligible } from './eligibility.js';
export { leitnerState, dueScore, rank, localDateString, INTERVALS } from './leitner.js';
export { buildPracticePlan, toPracticeTestDefinition, planId, weekStart } from './plan.js';
export { buildPool, loadBankPool, loadLessonPool } from './pool.js';

/** Completed + in-progress lessonProgress rows for a profile (public store API). */
export async function listLessonProgress(profileId, store) {
  const S = store || (await import('../ProgressStore.js')).ProgressStore;
  return S.getAllFromIndex('lessonProgress', 'by_profile', profileId);
}

/** Generate today's plan for a profile from the live stores. */
export async function generatePlan({ kind, profileId, minutes, dateLocal, store, deps }) {
  const S = store || (await import('../ProgressStore.js')).ProgressStore;
  const rows = await listLessonProgress(profileId, S);
  const coverage = completedCoverage(rows);
  const [pool, attempts] = await Promise.all([
    buildPool(rows.filter((r) => r.completed), deps),
    S.listQuestionAttempts(profileId),
  ]);
  return buildPracticePlan({
    kind, profileId, dateLocal: dateLocal || localDateString(), pool, attempts, coverage, minutes,
  });
}
