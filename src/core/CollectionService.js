import { CourseSourceManager } from './CourseSourceManager.js';
import { AuthService } from './AuthService.js';
import { ProgressStore } from './ProgressStore.js';
import { Collection } from '../simulations/base/kit/Collection.js';

/**
 * CollectionService - the learner's game collection (museum medals, cards,
 * packs) for one course, saved per profile in the existing `meta` key-value
 * store (`collection:<bundleId>:<profileId>`), so it needs no schema change.
 * Games never touch storage: content-block hands a scene `config.collection`
 * and `config.fieldGuide()` (see simulations/base/kit/GameScene.js).
 *
 * The field guide is a course's `field-guide.json` (organisms, traits and the
 * group rules); like glossary.json it is optional and looked up by name.
 */
const _colls = new Map();  // bundleId -> Promise<Collection>
const _guides = new Map(); // bundleId -> Promise<object|null>

export const CollectionService = {
  /** The bundle's field guide, or null when it has none. The manifest is
   * read first: a course lists its guide there (`"fieldGuide":
   * "field-guide.json"`, written by the kit's manifest tools whenever the
   * file exists), so a course without one costs no 404. Only when the
   * manifest itself cannot be read is the file looked up by name. */
  loadGuide(bundleId) {
    if (!bundleId) return Promise.resolve(null);
    if (!_guides.has(bundleId)) {
      _guides.set(bundleId, (async () => {
        try {
          await CourseSourceManager.init();
          let ref = 'field-guide.json';
          try {
            const m = await fetch(CourseSourceManager.resolveRef('manifest.json', bundleId));
            if (m.ok) {
              const manifest = await m.json();
              if (!manifest?.fieldGuide) return null;
              ref = String(manifest.fieldGuide);
            }
          } catch { /* no readable manifest: fall back to the name */ }
          const res = await fetch(CourseSourceManager.resolveRef(ref, bundleId));
          return res.ok ? await res.json() : null;
        } catch { return null; }
      })());
    }
    return _guides.get(bundleId);
  },

  /** The active profile's Collection for a bundle (one shared instance per bundle). */
  load(bundleId) {
    if (!bundleId) return Promise.resolve(null);
    if (!_colls.has(bundleId)) {
      _colls.set(bundleId, (async () => {
        let profileId = 'default_student';
        try { profileId = (await AuthService.getCurrentUser())?.profileId || profileId; } catch { /* keep default */ }
        const key = `collection:${bundleId}:${profileId}`;
        let saved = null;
        try { saved = (await ProgressStore.get('meta', key))?.value; } catch { /* first run */ }
        let timer = 0;
        return new Collection(saved, (state) => {
          clearTimeout(timer);
          timer = setTimeout(() => { ProgressStore.put('meta', { key, value: state }).catch(() => {}); }, 300);
        });
      })());
    }
    return _colls.get(bundleId);
  },
};
