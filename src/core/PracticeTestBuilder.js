import { ContentLoader } from './ContentLoader.js';
import { CourseSourceManager } from './CourseSourceManager.js';
import { ProgressStore } from './ProgressStore.js';
import { PRNG } from './PRNG.js';

/** path -> loaded bank index (with _bundleId/_path stamped on), for the
 *  lifetime of the tab. A bank index is small (refs + metadata, no question
 *  bodies) and immutable-for-the-session, so there's no eviction need —
 *  mirrors how QuestionRegistry/BlockRegistry cache their own registries. */
const _bankCache = new Map();

/** curriculum.json, fetched once per tab — used only to turn a bank's raw
 *  topicId into the human-readable topic name for the wizard's category
 *  tree (see resolveTopicLabel()). */
let _curriculumPromise = null;
function loadCurriculum() {
  if (!_curriculumPromise) _curriculumPromise = ContentLoader.loadJSON('/content/curriculum.json').catch(() => null);
  return _curriculumPromise;
}

/**
 * Turns one bank-index question entry into the same {type:'fixed', ref,
 * bundleId, weight, _qtype} descriptor shape TestEngine.js's own
 * `testData.questions[]` already uses for author-published tests — a
 * practice test's frozen question list is just more of the same descriptors,
 * so TestEngine needs no new rendering/scoring path for them (only the
 * per-descriptor bundleId support added for this feature).
 */
function toDescriptor(bankQuestion, bundleId) {
  return {
    type: 'fixed',
    ref: bankQuestion.ref,
    bundleId,
    weight: typeof bankQuestion.weight === 'number' && bankQuestion.weight > 0 ? bankQuestion.weight : 1,
    _qtype: bankQuestion.type,
  };
}

/**
 * Business logic for the "parent builds a practice test" feature (see
 * docs/HighLevelDesign.md's Question Banks section) — the wizard at
 * src/ui/components/PracticeTestWizard.js, launched only from the parent
 * area, is a thin shell that calls these methods and renders their results.
 * Kept out of src/ui/ per CLAUDE.md invariant 8.
 *
 * A practice test definition this produces is never published content — it's
 * saved straight to the profile's own `practiceTests` IndexedDB store
 * (migration 008) and taken via TestEngine's `practice:<id>` testId handling,
 * exactly like any other test from the student's point of view.
 */
export const PracticeTestBuilder = {
  /**
   * Every question bank across every registered course source (local +
   * remote) — the "broad list of question banks" a parent picks from.
   * Enriches each catalog entry with the bank's own title/question count
   * (small fetch — a bank index carries no question bodies) so a browsing
   * UI doesn't need a second round-trip per bank. A bank that fails to load
   * is still listed (flagged `_unreachable`) rather than silently dropped,
   * same "never let one bad source blank the whole list" spirit
   * CourseSourceManager.previewBundleManifest() already follows.
   */
  async listAvailableBanks() {
    await CourseSourceManager.init();
    const items = (await CourseSourceManager.listCatalogItems()).filter((i) => i.type === 'bank');
    return Promise.all(items.map(async (item) => {
      try {
        const bank = await this.loadBankIndex(item);
        const chapterIds = bank.chapterIds || (bank.chapterId ? [bank.chapterId] : []);
        return {
          ...item,
          title: bank.title,
          questionCount: (bank.questions || []).length,
          subject: bank.subject || item.subject,
          grade: bank.grade ?? item.grade,
          chapterIds,
          chapterLabels: await this.resolveChapterLabels(bank, chapterIds),
        };
      } catch (e) {
        return { ...item, title: item._remoteTitle, questionCount: 0, _unreachable: true };
      }
    }));
  },

  /**
   * Fetches one bank index (a `question-bank@1` file: id/title/questions[]
   * of {ref, type, topicId, difficulty, weight, estimatedTimeSec}), cached
   * by catalog path. `item` is a `{path, _remoteSource, ...}` entry from
   * listCatalogItems() (or listAvailableBanks()'s own enriched version).
   */
  async loadBankIndex(item) {
    if (_bankCache.has(item.path)) return _bankCache.get(item.path);
    const bundleId = item._remoteSource || CourseSourceManager.deriveBundleId(item.path);
    const data = await ContentLoader.loadJSON(`/${item.path}`);
    const bank = { ...data, _bundleId: bundleId, _path: item.path };
    _bankCache.set(item.path, bank);
    return bank;
  },

  /**
   * Fetches one question's full body (for a manual-picker preview — the
   * bank index deliberately doesn't carry question bodies, see
   * loadBankIndex()'s doc comment) resolved against its own bundle, the
   * same way TestEngine._resolveQuestion() resolves a 'fixed' descriptor's
   * ref. Uncached — a preview is a one-off UI action, not something
   * re-fetched in a hot loop.
   */
  async loadQuestionDetail(ref, bundleId) {
    const refPath = CourseSourceManager.resolveRef(ref, bundleId);
    const finalPath = refPath.endsWith('.json') ? refPath : `${refPath}.json`;
    return ContentLoader.loadJSON(finalPath);
  },

  /**
   * Looks up a bank question's human-readable topic name from
   * curriculum.json (subject -> chapter -> topics[]), trying every chapter
   * a multi-chapter bank spans (see tools/validation/questionBank.js's own
   * chapterId/chapterIds handling for why there can be more than one).
   * Falls back to the raw topicId when curriculum lookup fails or doesn't
   * cover it — a community/local bank not represented in curriculum.json
   * must still be browsable, just with a less pretty label.
   */
  async resolveTopicLabel(bank, topicId) {
    if (!topicId) return null;
    const curriculum = await loadCurriculum();
    const subject = curriculum?.subjects?.find((s) => s.id === bank.subject);
    const chapterIds = bank.chapterIds || (bank.chapterId ? [bank.chapterId] : []);
    for (const chapterId of chapterIds) {
      const chapter = subject?.chapters?.find((c) => c.id === chapterId);
      const topic = chapter?.topics?.find((t) => t.id === topicId);
      if (topic) return topic.name?.en || topic.name || topicId;
    }
    return topicId;
  },

  /**
   * Human-readable chapter name(s) for a bank's own `chapterId`/`chapterIds`
   * (for the wizard's "which banks" step) — same curriculum.json lookup
   * resolveTopicLabel() already does, just without a topicId to descend
   * into. Falls back to the raw id per-entry so an unlisted/local bank is
   * still browsable, same spirit as resolveTopicLabel().
   */
  async resolveChapterLabels(bank, chapterIds) {
    if (!chapterIds || !chapterIds.length) return [];
    const curriculum = await loadCurriculum();
    const subject = curriculum?.subjects?.find((s) => s.id === bank.subject);
    return chapterIds.map((id) => subject?.chapters?.find((c) => c.id === id)?.name?.en || id);
  },

  /**
   * Flattens one or more question banks into a single pool of enriched,
   * body-free question descriptors — the shared data source behind both
   * PracticeTestWizard.js modes ("build it for me" filters/samples this,
   * "pick questions myself" browses it directly, grouped by topic then
   * type). `bankItems` are listAvailableBanks() entries; unreachable ones
   * should already be filtered out by the caller.
   *
   * Deduplicated by `bundleId::ref` (the same question-identity key
   * collectUsedQuestionKeys()/excludeUsedQuestions() use) rather than by
   * bank+ref: two selected banks commonly overlap (e.g. a chapter bank and a
   * full-syllabus bank both listing the same question file), and without
   * this the same real question would survive into the pool as two
   * independently-selectable entries, letting autoSample()/manual selection
   * pick it twice into one test.
   */
  async loadQuestionPool(bankItems) {
    const pool = [];
    const seen = new Set();
    for (const bankItem of bankItems) {
      let bank;
      try {
        bank = await this.loadBankIndex(bankItem);
      } catch {
        continue; // one bad bank shouldn't blank the whole pool
      }
      for (const bq of (bank.questions || [])) {
        const identityKey = `${bank._bundleId}::${bq.ref}`;
        if (seen.has(identityKey)) continue;
        seen.add(identityKey);
        pool.push({
          key: `${bankItem.path}::${bq.ref}`,
          ref: bq.ref,
          bundleId: bank._bundleId,
          bankPath: bankItem.path,
          bankTitle: bank.title,
          type: bq.type,
          difficulty: bq.difficulty,
          weight: bq.weight,
          estimatedTimeSec: bq.estimatedTimeSec,
          topicId: bq.topicId,
          topicLabel: await this.resolveTopicLabel(bank, bq.topicId),
          subject: bank.subject,
        });
      }
    }
    return pool;
  },

  /**
   * Pure, synchronous narrowing of an already-loaded pool — the "optional
   * filtering by tag/topic" and "difficulty selection" wizard steps both
   * reduce to this. Difficulty is deliberately a *set of allowed levels*
   * (e.g. only easy+medium), not an exact per-level count: the wizard asks
   * "which levels should be in scope", never "how many of each" — see
   * autoSample() for how many total questions come out.
   */
  filterPool(pool, { topicIds, difficultyLevels } = {}) {
    return pool.filter((q) =>
      (!topicIds || !topicIds.length || (q.topicId && topicIds.includes(q.topicId))) &&
      (!difficultyLevels || !difficultyLevels.length || difficultyLevels.includes(q.difficulty))
    );
  },

  /**
   * "Build it for me": walks an already-filtered pool until the duration
   * budget (estimatedTimeSec) is spent. A question with no authored
   * estimatedTimeSec falls back to a conservative 2-minute guess rather
   * than being excluded or counted as free. Returns pool entries, not
   * descriptors — the wizard's review step needs the full entries to
   * pre-check them in the same tree "pick questions myself" browses, so a
   * parent can override the suggestion before saving.
   *
   * Sampling is topic-balanced by construction rather than one flat
   * shuffle: a flat shuffle lets whichever topic simply has the most
   * authored questions dominate the budget (e.g. a 40-question "Cell
   * Structure" bank crowding out a 6-question "Photosynthesis" one). This
   * groups by topicId (untagged questions form their own bucket), shuffles
   * within each group and shuffles the visiting order itself, then
   * round-robins one question per topic per pass — so every topic gets an
   * equal share up to the point its own bucket runs dry, and only then does
   * the budget start favoring topics with more material. See
   * PracticeTestWizard's "quick select" controls for the parent's own
   * override when even this isn't the mix they want.
   */
  autoSample(pool, { durationMinutes, seed } = {}) {
    const prng = new PRNG(seed);
    const byTopic = new Map();
    for (const q of pool) {
      const key = q.topicId || '__untagged__';
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key).push(q);
    }
    const queues = prng.shuffle([...byTopic.values()].map((qs) => prng.shuffle([...qs])));
    const interleaved = [];
    let took = true;
    while (took) {
      took = false;
      for (const queue of queues) {
        if (queue.length) {
          interleaved.push(queue.shift());
          took = true;
        }
      }
    }
    if (!durationMinutes) return interleaved;
    const budgetSec = durationMinutes * 60;
    let elapsed = 0;
    const selected = [];
    for (const q of interleaved) {
      const t = typeof q.estimatedTimeSec === 'number' && q.estimatedTimeSec > 0 ? q.estimatedTimeSec : 120;
      if (selected.length > 0 && elapsed + t > budgetSec) break;
      selected.push(q);
      elapsed += t;
    }
    return selected;
  },

  /**
   * Every `bundleId::ref` already used by a set of existing practice-test
   * rows (as saved by savePracticeTest()) — lets a parent building several
   * sibling tests from the same banks (e.g. three one-hour half-yearly
   * practice tests) keep them non-overlapping. Keyed by bundleId+ref rather
   * than the pool's own bankPath-based `key`, since the same question could
   * in principle be pooled via a different bank selection between tests —
   * bundleId+ref is what actually identifies "the same question file".
   */
  collectUsedQuestionKeys(practiceTestRows) {
    const keys = new Set();
    for (const row of practiceTestRows || []) {
      for (const q of row.questions || []) {
        keys.add(`${q.bundleId}::${q.ref}`);
      }
    }
    return keys;
  },

  /** Pure filter removing pool entries already used by another practice
   *  test, per collectUsedQuestionKeys(). */
  excludeUsedQuestions(pool, usedKeys) {
    if (!usedKeys || !usedKeys.size) return pool;
    return pool.filter((q) => !usedKeys.has(`${q.bundleId}::${q.ref}`));
  },

  /**
   * Turns a parent-confirmed list of pool entries (whichever wizard mode
   * produced them, after any override on the review screen) into the
   * persisted practice-test shape. The single endpoint both wizard modes
   * converge on, since "build it for me" always ends at the same
   * review/override screen "pick questions myself" uses directly.
   * @param {{title: object, source: 'auto'|'manual', criteria: object|null, durationMinutes: number|null, chosenEntries: object[]}} input
   */
  buildDefinition({ title, source, criteria, durationMinutes, chosenEntries }) {
    const questions = chosenEntries.map((q) => toDescriptor(q, q.bundleId));
    return { title, source, criteria, durationMinutes, questions };
  },

  /** Persists a definition from buildDefinition(), stamping the row's own
   *  id/profile/timestamps. Returns the saved row. */
  async savePracticeTest(profileId, definition) {
    const practiceTestId = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const now = Date.now();
    const row = { profileId, practiceTestId, createdAt: now, updatedAt: now, ...definition };
    await ProgressStore.put('practiceTests', row);
    return row;
  },

  /** Every practice test this profile has saved, for the dashboard listing. */
  async listPracticeTests(profileId) {
    return ProgressStore.getAllFromIndex('practiceTests', 'by_profile', profileId);
  },

  async deletePracticeTest(profileId, practiceTestId) {
    return ProgressStore.delete('practiceTests', [profileId, practiceTestId]);
  },
};
