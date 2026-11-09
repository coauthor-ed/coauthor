import { ErrorReporter } from './ErrorReporter.js';
import { CourseSourceManager } from './CourseSourceManager.js';

/**
 * @param {string} path
 * @param {{text?: boolean}} [opts] `text: true` reads a `.md` draft's plain-
 *   text companion (`rawText`) instead of parsing `rawJson`/`data` as JSON —
 *   see loadText() below. Without it, a `.md` ref'd block would silently
 *   show stale/blank prose in authoring-app preview (the JSON side already
 *   reads its draft; the text side has to too).
 */
async function getDraftFromIDB(path, opts = {}) {
  try {
    const { openDB } = await import('idb');
    const db = await openDB('coauthor-authoring-drafts', 5);
    // Path might have a leading slash from the engine fetch
    const idbPath = path.startsWith('/') ? path.substring(1) : path;
    const draft = await db.get('drafts', idbPath);
    if (opts.text) {
      return typeof draft?.rawText === 'string' ? draft.rawText : null;
    }
    if (draft && draft.rawJson) {
      return JSON.parse(draft.rawJson);
    }
    if (draft && draft.data) {
      return draft.data;
    }
  } catch (e) {
    // IDB might not exist or be blocked
  }
  return null;
}

export const ContentLoader = {
  /**
   * Fetches and parses a JSON file from the given path.
   * Also verifies content schema version if present.
   */
  async loadJSON(path) {
    try {
      const isPreview = window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');

      if (isPreview) {
        const draft = await getDraftFromIDB(path);
        if (draft) return draft;
      }

      // A local (same-origin) path passes through resolveContentUrl()
      // unchanged — this is a no-op for every course bundle that isn't a
      // registered remote source, so existing behavior is untouched. init()
      // is idempotent and only does real work (one IDB read) on the very
      // first call of the whole session, so awaiting it here on every load
      // is cheap and removes any race with AppShell's own fire-and-forget
      // warm-up — a lesson can start loading before that resolves.
      await CourseSourceManager.init();
      const resolvedUrl = CourseSourceManager.resolveContentUrl(path);
      // `{ cache: 'no-cache' }` below only governs the *browser's own* HTTP
      // cache — it's a no-op against a Service Worker's fetch handler, which
      // takes over the response entirely via event.respondWith() once it's
      // controlling the page, ignoring the original request's cache mode.
      // sw.js's own /content/ handling is stale-while-revalidate by design
      // (see that file), and unregistering the SW in preview mode (src/app.js)
      // only takes effect on the *next* navigation per spec — so a page that
      // was already controlled from an earlier non-preview visit can still
      // serve one stale load before that catches up. A cache-busting query
      // param sidesteps the timing question entirely: Cache Storage matches
      // by exact URL, so a value that changes every call can never match
      // anything already cached, controlled SW or not.
      const fetchUrl = isPreview
        ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_previewTs=${Date.now()}`
        : resolvedUrl;
      const response = await fetch(fetchUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load content from ${resolvedUrl}: ${response.status}`);
      }
      const data = await response.json();
      
      // Basic filtering: Do not serve "ai-draft" content in production UI
      // Assuming a simplistic check; in reality, this might be handled by manifest generation
      if (!isPreview && data.authoring && data.authoring.status === 'ai-draft') {
        // `code` lets a catching engine (LessonEngine/TestEngine) tell "this
        // is unpublished draft content, working as intended" apart from a
        // genuine load failure and show the student/reviewer an accurate
        // message instead of a generic "could not be loaded" — see
        // docs/content-authoring-guide.md's Authoring Pipeline Rules.
        const err = new Error(`Content at ${path} is in draft status and cannot be rendered.`);
        err.code = 'draft-content';
        throw err;
      }

      return data;
    } catch (err) {
      ErrorReporter.reportError(err, { source: 'ContentLoader', path });
      throw err;
    }
  },

  /**
   * Fetches a plain-text file — the sibling `.md` a block's `markdownRef`/
   * `promptRef` points at (see hydrateProseRefs.js). Sibling to loadJSON()
   * above, reusing the same resolve/preview-cache-buster/fetch shape, minus
   * the `ai-draft` gate: a `.md` has no `authoring` block of its own, so the
   * gate stays on the owning JSON, not here.
   */
  async loadText(path) {
    try {
      const isPreview = window.location.search.includes('preview=true') || window.location.hash.includes('preview=true');

      if (isPreview) {
        const draft = await getDraftFromIDB(path, { text: true });
        if (draft != null) return draft;
      }

      await CourseSourceManager.init();
      const resolvedUrl = CourseSourceManager.resolveContentUrl(path);
      const fetchUrl = isPreview
        ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_previewTs=${Date.now()}`
        : resolvedUrl;
      const response = await fetch(fetchUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load content from ${resolvedUrl}: ${response.status}`);
      }
      return await response.text();
    } catch (err) {
      ErrorReporter.reportError(err, { source: 'ContentLoader', path });
      throw err;
    }
  }
};
