import { ContentLoader } from './ContentLoader.js';
import { CourseSourceManager } from './CourseSourceManager.js';
import { appUrl } from './basePath.js';

/**
 * Data for the landing page (docs/sprints/completed/landing-page-and-guides.md):
 * the engine-owned showcase bundle's blocks, and the courses on the shelf.
 * Kept out of the view (invariant 8). Nothing here counts or invents numbers:
 * the shelf lists only sources this device has really added.
 */
export const SHOWCASE_BUNDLE = 'coauthor-showcase';

/**
 * The showcase bundle ships with the engine in showcase/ at the app root,
 * not under content/courses/ (courses live in their own repos). Mapping its
 * bundleId to that folder lets every logical /content/courses/coauthor-showcase/
 * path, route and bundle-relative ref resolve there unchanged. Tab-local and
 * never persisted, so it never shows on the course shelf. Called once at boot,
 * before the router dispatches.
 */
export function registerShowcaseSource() {
  CourseSourceManager.registerEphemeral(SHOWCASE_BUNDLE, appUrl('showcase/'));
}

export const ShowcaseService = {
  /** A block or question from the showcase bundle, e.g. 'blocks/arcade-catch'. */
  load(rel) {
    return ContentLoader.loadJSON(`/content/courses/${SHOWCASE_BUNDLE}/${rel}.json`);
  },

  /** One entry per added course source: { bundleId, title, subject, grade, modules }. */
  async listShelf() {
    try {
      await CourseSourceManager.init();
      const sources = await CourseSourceManager.listSources();
      return sources.map((s) => {
        const m = s.manifest || {};
        return {
          bundleId: s.bundleId,
          title: m.title?.en || m.title || s.bundleId,
          subject: m.subject || '',
          grade: m.grade != null ? String(m.grade) : '',
          modules: (m.modules || []).length,
        };
      });
    } catch (e) {
      console.warn('[ShowcaseService] shelf unavailable:', e.message);
      return [];
    }
  },
};
