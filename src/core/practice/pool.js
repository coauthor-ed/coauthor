/**
 * Assembles the practice pool: bank questions plus the graded questions of
 * completed lessons. I/O lives here; plan.js stays pure. Every dependency can
 * be injected (tests do), the defaults are loaded lazily so this module
 * imports in plain node.
 *
 * Pool entry: {questionKey, bundleId, ref, chapterId, topicId, difficulty,
 *   estimatedTimeSec, source:'bank'|'lesson', type, weight, lessonId?}
 * questionKey is `${bundleId}::${ref}`, the same key LessonEngine and
 * TestEngine write to questionAttempts (a lesson question's ref is the
 * lesson's own blockRef string; a bank question's ref is the bank entry ref).
 */

const keyOf = (bundleId, ref) => `${bundleId ?? null}::${ref}`;

/**
 * Bank questions. chapterId: the entry's own `chapterId`, else the bank's
 * single chapter; for a multi-chapter bank whose entry has none, the
 * question body's chapterId (loaded once, failures leave it null = ineligible).
 */
export async function loadBankPool({ builder } = {}) {
  const B = builder || (await import('../PracticeTestBuilder.js')).PracticeTestBuilder;
  const banks = (await B.listAvailableBanks()).filter((b) => !b._unreachable);
  const out = [];
  for (const item of banks) {
    let bank;
    try { bank = await B.loadBankIndex(item); } catch { continue; }
    const chapterIds = bank.chapterIds || (bank.chapterId ? [bank.chapterId] : []);
    const entries = await B.loadQuestionPool([item]);
    const raw = new Map((bank.questions || []).map((q) => [q.ref, q]));
    for (const e of entries) {
      let chapterId = raw.get(e.ref)?.chapterId || (chapterIds.length === 1 ? chapterIds[0] : null);
      if (!chapterId && chapterIds.length > 1 && B.loadQuestionDetail) {
        try { chapterId = (await B.loadQuestionDetail(e.ref, e.bundleId))?.chapterId || null; } catch { /* leave null */ }
      }
      out.push({
        questionKey: keyOf(e.bundleId, e.ref),
        bundleId: e.bundleId,
        ref: e.ref,
        chapterId,
        topicId: e.topicId ?? null,
        difficulty: e.difficulty ?? null,
        estimatedTimeSec: e.estimatedTimeSec,
        source: 'bank',
        type: e.type,
        weight: e.weight,
      });
    }
  }
  return out;
}

/**
 * Graded questions of completed lessons. A lesson lists them as
 * `blocks[].blockRef` pointing at a question JSON (type in the question
 * registry, e.g. 'mcq-single@2'); other blockRefs are lesson blocks and are
 * skipped. Inline blocks have no file ref, so TestEngine cannot run them and
 * they are skipped too. The question inherits the lesson's chapterId
 * (its own, if it has one, wins) and the lesson's first topicId.
 *
 * @param {object[]} lessonRows completed lessonProgress rows ({lessonId, bundleId})
 * @param {{loadJSON?:Function, resolveRef?:Function, questionTypes?:Set<string>}} deps
 */
export async function loadLessonPool(lessonRows, deps = {}) {
  const loadJSON = deps.loadJSON || (await import('../ContentLoader.js')).ContentLoader.loadJSON.bind((await import('../ContentLoader.js')).ContentLoader);
  const CSM = deps.resolveRef ? null : (await import('../CourseSourceManager.js')).CourseSourceManager;
  const resolveRef = deps.resolveRef || CSM.resolveRef.bind(CSM);
  let types = deps.questionTypes;
  if (!types) {
    const reg = await loadJSON('/registry/questions.json');
    types = new Set(Object.keys(reg?.questions || {}));
  }
  const jsonPath = (p) => (p.endsWith('.json') ? p : `${p}.json`);
  const out = [];
  const seen = new Set();
  for (const row of lessonRows || []) {
    if (!row?.completed) continue;
    let lesson;
    try {
      const base = String(row.lessonId).replace(':', '/');
      const p = base.startsWith('/') ? base : (base.startsWith('content/') ? `/${base}` : `/content/${base}`);
      lesson = await loadJSON(jsonPath(p));
    } catch { continue; }
    const topicId = lesson?.topicIds?.[0] ?? lesson?.topicId ?? null;
    for (const b of lesson?.blocks || []) {
      const ref = typeof b === 'string' ? b : b?.blockRef;
      if (!ref) continue;
      const key = keyOf(row.bundleId, ref);
      if (seen.has(key)) continue;
      let q;
      try { q = await loadJSON(jsonPath(resolveRef(ref, row.bundleId))); } catch { continue; }
      if (!q || !types.has(q.type)) continue;
      seen.add(key);
      out.push({
        questionKey: key,
        bundleId: row.bundleId ?? null,
        ref,
        chapterId: q.chapterId ?? lesson.chapterId ?? null,
        topicId: q.topicId ?? topicId,
        difficulty: q.difficulty ?? null,
        estimatedTimeSec: q.estimatedTimeSec,
        source: 'lesson',
        type: q.type,
        weight: q.weight,
        lessonId: row.lessonId,
      });
    }
  }
  return out;
}

/** Bank + lesson pool; a failure in either half leaves the other intact. */
export async function buildPool(lessonRows, deps = {}) {
  const [bank, lesson] = await Promise.all([
    loadBankPool(deps).catch(() => []),
    loadLessonPool(lessonRows, deps).catch(() => []),
  ]);
  return [...bank, ...lesson];
}
