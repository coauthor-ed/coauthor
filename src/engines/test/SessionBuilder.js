/**
 * SessionBuilder — builds a TestSession from a test definition.
 *
 * Implements HLD §7.5 & §9:
 *  - Reads test definition (sections + bank references)
 *  - Seeded-PRNG random selection from chunked banks
 *  - Parallel chunk fetching via ContentLoader
 *  - Pre-download gate for long mocks (durationMin > threshold)
 */
import { ContentLoader } from '../../core/ContentLoader.js';
import { PRNG } from '../../core/PRNG.js';
import { ErrorReporter } from '../../core/ErrorReporter.js';

const PRE_DOWNLOAD_THRESHOLD_MIN = 60;

export class SessionBuilder {
  /**
   * @param {string} testId
   * @param {number} seed  PRNG seed for this attempt
   */
  constructor(testId, seed) {
    this.testId = testId;
    this.seed = seed;
    this._prng = new PRNG(seed);
  }

  /**
   * Load the test definition.
   * @returns {Promise<object>} testDef
   */
  async loadTestDef() {
    const basePath = this.testId.replace(':', '/');
    const path = basePath.startsWith('/') ? basePath : 
                 (basePath.startsWith('content/') ? `/${basePath}` : `/content/${basePath}`);
    const finalPath = path.endsWith('.json') ? path : `${path}.json`;
    this._testDef = await ContentLoader.loadJSON(finalPath);
    return this._testDef;
  }

  /**
   * Returns true if this test requires a pre-download gate.
   */
  requiresPreDownload() {
    return (this._testDef?.durationMin ?? 0) >= PRE_DOWNLOAD_THRESHOLD_MIN;
  }

  /**
   * Pre-download all chunks for all sections.
   * @param {(progress: number) => void} onProgress  0..1
   */
  async preDownloadAll(onProgress) {
    const sections = this._testDef?.sections ?? [];
    let done = 0;
    const total = sections.length;
    for (const section of sections) {
      try {
        await this._fetchAllChunksForSection(section);
      } catch (e) {
        ErrorReporter.reportError(e, { component: 'SessionBuilder', section: section.name });
        throw e; // Propagate so UI can show retry
      }
      done++;
      onProgress?.(done / total);
    }
  }

  /**
   * Build the TestSession: select questions from banks, fetch needed chunks.
   * @returns {Promise<{ questions: object[], seed: number }>}
   */
  async build() {
    if (!this._testDef) await this.loadTestDef();
    const sections = this._testDef.sections ?? [];
    let allQuestions = [];

    for (const section of sections) {
      const sectionQs = await this._buildSection(section);
      allQuestions = allQuestions.concat(sectionQs);
    }

    // Optionally shuffle all questions across sections
    if (this._testDef.shuffleQuestions) {
      this._prng.shuffle(allQuestions);
    }

    return { questions: allQuestions, seed: this.seed, testDef: this._testDef };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  async _buildSection(section) {
    const { bankId, select, type: qType, marksEach = 1 } = section;
    if (!bankId) return [];

    const basePath = bankId.replace(':', '/');
    const path = basePath.startsWith('/') ? basePath : 
                 (basePath.startsWith('content/') ? `/${basePath}` : `/content/${basePath}`);
    const finalPath = path.endsWith('.json') ? path : `${path}.json`;
    const bank = await ContentLoader.loadJSON(finalPath);
    if (!bank) return [];

    // Get candidate pool for this type
    const candidateIds = bank.typeIndex?.[qType]?.questionIds ?? [];
    if (candidateIds.length === 0) return [];

    // Seeded sample
    const selected = this._prng.sample(candidateIds, Math.min(select, candidateIds.length));

    // Build questionId → chunkFile reverse map
    const qToChunk = {};
    for (const chunk of bank.chunks ?? []) {
      for (const qid of chunk.questionIds ?? []) {
        qToChunk[qid] = chunk.file;
      }
    }

    // Determine distinct chunk files needed
    const neededChunks = [...new Set(selected.map(id => qToChunk[id]).filter(Boolean))];

    // Fetch chunks in parallel
    const chunkData = await Promise.all(
      neededChunks.map(f => ContentLoader.loadJSON(f).catch(e => {
        ErrorReporter.reportError(e, { component: 'SessionBuilder', chunkFile: f });
        return null;
      }))
    );

    // Build id → question map from fetched chunks
    const qMap = {};
    for (const chunk of chunkData) {
      if (!chunk) continue;
      const questions = Array.isArray(chunk) ? chunk : (chunk.questions ?? []);
      for (const q of questions) { if (q.id) qMap[q.id] = q; }
    }

    // Assemble in selected order, annotate with section metadata
    return selected
      .map(id => qMap[id])
      .filter(Boolean)
      .map(q => ({ ...q, _marksEach: marksEach, _sectionName: section.name }));
  }

  async _fetchAllChunksForSection(section) {
    const { bankId, type: qType } = section;
    if (!bankId) return;
    const basePath = bankId.replace(':', '/');
    const path = basePath.startsWith('/') ? basePath : 
                 (basePath.startsWith('content/') ? `/${basePath}` : `/content/${basePath}`);
    const finalPath = path.endsWith('.json') ? path : `${path}.json`;
    const bank = await ContentLoader.loadJSON(finalPath);
    if (!bank) return;
    // Fetch ALL chunks that contain this type (speculative for pre-download)
    const relevantChunks = (bank.chunks ?? [])
      .filter(c => c.types?.includes(qType) ?? true)
      .map(c => c.file);
    await Promise.all(relevantChunks.map(f => ContentLoader.loadJSON(f).catch(() => null)));
  }
}

// Attach sample() to PRNG if not already present
if (!PRNG.prototype.sample) {
  PRNG.prototype.sample = function(arr, n) {
    const pool = [...arr];
    const result = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
      const idx = Math.floor(this.next() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  };
}
