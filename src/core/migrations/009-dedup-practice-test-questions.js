/**
 * Repairs practiceTests rows saved before PracticeTestBuilder.loadQuestionPool()
 * deduplicated overlapping banks by question identity (bundleId::ref) rather
 * than bank+ref: a definition built from two banks that both listed the same
 * real question (same bundleId+ref) could end up with that question twice in
 * its `questions[]` — the "repeated questions" bug parents reported. This
 * collapses each row's duplicate descriptors, keeping the first occurrence's
 * position.
 *
 * A saved attempt's `answers`/`currentIndex` are positional against that same
 * `questions[]` array (see TestEngine.js's own doc comments on why answers are
 * keyed by position, not content id) — shrinking the array without remapping
 * would silently misalign an in-progress attempt's answers with different
 * questions, or leave `currentIndex` pointing at the wrong slot. Per
 * TestEngine.init()'s "only one attempt per (profile, test) is ever kept",
 * there's at most one testAttempts row per (profileId, `practice:<id>`) to fix
 * up. A completed attempt's stored totalScore/results are deliberately left
 * as-is here rather than recomputed — TestEngine._loadCompletedAttemptForReview()
 * already recomputes and overwrites them the next time the student opens
 * Review, the same self-healing mechanism that already handles "content
 * changed after this attempt was submitted".
 */

/** Collapses duplicate `{bundleId, ref}` descriptors, first occurrence wins.
 *  Returns the deduped array, an old-position -> new-position map (covering
 *  every index 0..questions.length-1), and whether anything changed. */
export function dedupeQuestions(questions) {
  const seen = new Map();
  const oldToNew = [];
  const deduped = [];
  let changed = false;
  (questions || []).forEach((q, oldIndex) => {
    const key = `${q.bundleId}::${q.ref}`;
    if (seen.has(key)) {
      oldToNew[oldIndex] = seen.get(key);
      changed = true;
    } else {
      const newIndex = deduped.length;
      seen.set(key, newIndex);
      oldToNew[oldIndex] = newIndex;
      deduped.push(q);
    }
  });
  return { deduped, oldToNew, changed };
}

/**
 * Remaps a `testAttempts` row's position-keyed `answers` through
 * dedupeQuestions()'s old->new index map. A legacy id-keyed answer (pre-
 * position-key fix, see TestEngine.js) isn't a numeric key and is passed
 * through untouched — it's looked up by content id, not index, so dedup
 * doesn't affect it. When two old positions collapse onto the same new
 * index (both pointed at the identical real question), whichever answer is
 * seen first wins — both represent an answer to the literal same question.
 */
export function remapAnswers(answers, oldToNew) {
  const remapped = {};
  for (const [key, value] of Object.entries(answers || {})) {
    const oldIndex = Number(key);
    if (!Number.isInteger(oldIndex) || !(oldIndex in oldToNew)) {
      remapped[key] = value;
      continue;
    }
    const newKey = String(oldToNew[oldIndex]);
    if (remapped[newKey] === undefined) remapped[newKey] = value;
  }
  return remapped;
}

/** `currentIndex` maps through the same table; anything not covered by it
 *  (the "past the last question, on the submit screen" sentinel value of
 *  exactly the old array's length, or any other out-of-range value) becomes
 *  the equivalent sentinel for the new, possibly-shorter array. */
export function remapCurrentIndex(currentIndex, oldToNew, newLength) {
  return currentIndex in oldToNew ? oldToNew[currentIndex] : newLength;
}

export async function migration009(db, tx) {
  if (!db.objectStoreNames.contains('practiceTests') || !db.objectStoreNames.contains('testAttempts')) return;

  const ptStore = tx.objectStore('practiceTests');
  const attemptsStore = tx.objectStore('testAttempts');

  const practiceTests = await ptStore.getAll();
  const attempts = await attemptsStore.getAll();

  for (const row of practiceTests) {
    const { deduped, oldToNew, changed } = dedupeQuestions(row.questions);
    if (!changed) continue;

    await ptStore.put({ ...row, questions: deduped });

    const testId = `practice:${row.practiceTestId}`;
    const attempt = attempts.find((a) => a.profileId === row.profileId && a.testId === testId);
    if (!attempt) continue;

    await attemptsStore.put({
      ...attempt,
      answers: remapAnswers(attempt.answers, oldToNew),
      currentIndex: remapCurrentIndex(attempt.currentIndex, oldToNew, deduped.length),
    });
  }
}
