import { CourseSourceManager } from './CourseSourceManager.js';

/**
 * A lesson's slides as prefetch/probe entries, shared by LessonEngine (what
 * it hands OfflinePrefetcher on 'lesson:opened') and OfflineAvailability
 * (which works the same list out from a cached lesson JSON without opening
 * the lesson). One copy, so the offline marks and the prefetch never
 * disagree about which files a slide needs.
 *
 * Entry shape: { ref, bundleId } (a block JSON path still to fetch) or
 * { data, bundleId } (an inline block).
 */

/** The content path a lesson id loads from (LessonEngine.init()'s own rule). */
export function lessonJsonPath(lessonId) {
  const basePath = String(lessonId || '').replace(':', '/');
  const path = basePath.startsWith('/') ? basePath
    : (basePath.startsWith('content/') ? `/${basePath}` : `/content/${basePath}`);
  return path.endsWith('.json') ? path : `${path}.json`;
}

/** A linear lesson may list blocks as bare path strings; both shapes become { blockRef }. */
export function normalizeLessonData(data) {
  if (data && Array.isArray(data.blocks) && data.blocks.some((b) => typeof b === 'string')) {
    return { ...data, blocks: data.blocks.map((b) => (typeof b === 'string' ? { blockRef: b } : b)) };
  }
  return data;
}

/** Flow lessons have a start node and a node map; everything else is linear. */
export function isFlowLesson(data) {
  return !!(data?.flow && data?.flowStart);
}

/** One linear-mode lessonData.blocks[] item as an entry. */
export function linearEntry(block, bundleId) {
  if (!block) return null;
  if (block.blockRef) {
    const refPath = CourseSourceManager.resolveRef(block.blockRef, bundleId);
    return { ref: refPath.endsWith('.json') ? refPath : `${refPath}.json`, bundleId };
  }
  return { data: block, bundleId };
}

/** One flow node's block ref as an entry (same resolution as LessonEngine._render()). */
export function flowEntry(blockRef, bundleId) {
  let path;
  if (blockRef.includes(':')) {
    const basePath = blockRef.replace(':', '/');
    path = blockRef.startsWith('/') ? blockRef : `/content/${basePath}${basePath.endsWith('.json') ? '' : '.json'}`;
  } else {
    const r = CourseSourceManager.resolveRef(blockRef, bundleId);
    path = r.endsWith('.json') ? r : `${r}.json`;
  }
  return { ref: path, bundleId };
}

/**
 * Every slide the lesson can show: all of blocks[] in linear mode (in
 * order, one entry per progress-bar segment), every flow node's block in
 * flow mode.
 */
export function allBlockEntries(data, bundleId) {
  if (isFlowLesson(data)) {
    return Object.values(data.flow || {})
      .map((node) => node?.block)
      .filter(Boolean)
      .map((blockRef) => flowEntry(blockRef, bundleId));
  }
  return (data?.blocks || []).map((b) => linearEntry(b, bundleId)).filter(Boolean);
}
