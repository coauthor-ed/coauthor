import { checkSidecarShape } from '../../src/core/narration/narrationModel.js';

export function validateLesson(lessonData, curriculum = null) {
  const errors = [];
  const warnings = [];
  if (!lessonData.id) errors.push('Missing lesson id');
  // subject and grade are optional display tags (an unknown subject such as
  // "epidemiology" is fine); curriculum cross-references only ever warn.
  // grade is optional: a number (9) or a non-empty string ("UG").
  if (lessonData.grade !== undefined && lessonData.grade !== null &&
      !((typeof lessonData.grade === 'number' && Number.isFinite(lessonData.grade)) || (typeof lessonData.grade === 'string' && lessonData.grade.trim()))) {
    errors.push('Invalid grade: must be a number or a non-empty string');
  }
  if (!lessonData.title || typeof lessonData.title !== 'object') errors.push('Missing localized title');

  // Validate subject/grade against curriculum.json's subject->grades map if
  // provided. Topic tagging was deliberately removed from the data model —
  // it gated real content on taxonomy bookkeeping students and parents never
  // see, without adding anything they do see. Book/chapter were reinstated
  // as optional tags, so chapterId is only checked when present. See
  // docs/HighLevelDesign.md.
  if (curriculum && lessonData.subject) {
    const subject = (curriculum.subjects || []).find(s => s.id === lessonData.subject);
    if (!subject) {
      warnings.push(`Unknown subject: ${lessonData.subject} (not in curriculum.json)`);
    } else {
      if (lessonData.grade != null && Array.isArray(subject.grades) && !subject.grades.includes(lessonData.grade)) {
        warnings.push(`Invalid grade: subject ${lessonData.subject} has no grade ${lessonData.grade}`);
      }
      if (lessonData.chapterId) {
        const chapter = (subject.chapters || []).find(c => c.id === lessonData.chapterId);
        if (!chapter) {
          warnings.push(`Unknown chapterId: ${lessonData.chapterId} not found in subject ${lessonData.subject}`);
        } else if (lessonData.grade != null && chapter.grade !== lessonData.grade) {
          warnings.push(`Invalid chapterId: ${lessonData.chapterId} belongs to grade ${chapter.grade}, not ${lessonData.grade}`);
        }
      }
    }
  }

  // Validate flow or linear structure
  if (lessonData.flowStart) {
    if (!lessonData.flow || !lessonData.flow[lessonData.flowStart]) {
      errors.push(`flowStart node '${lessonData.flowStart}' not found in flow object`);
    }
    // Basic graph validation
    for (const [nodeId, node] of Object.entries(lessonData.flow || {})) {
      if (!node.block) errors.push(`Node '${nodeId}' missing block reference`);
    }
  } else {
    if (!Array.isArray(lessonData.blocks)) {
      errors.push('Lesson must have either a flow or a blocks array');
    }
    else {
      lessonData.blocks.forEach((b, i) => {
        if (typeof b === 'string') {
          warnings.push(`blocks[${i}] is a bare string; write { "blockRef": "${b}" } (the engine accepts both)`);
        } else if (!b || typeof b !== 'object' || (!b.blockRef && !b.type)) {
          errors.push(`blocks[${i}] has neither blockRef nor an inline type`);
        }
      });
    }
  }

  // Optional narration sidecar ref (coauthor-narration@1). Bundle-relative.
  if (lessonData.narrationRef !== undefined) {
    const r = lessonData.narrationRef;
    if (typeof r !== 'string' || !r.trim()) {
      errors.push('narrationRef must be a non-empty string');
    } else if (!/\.json$/i.test(r)) {
      errors.push(`narrationRef '${r}' must point at a .json sidecar`);
    } else if (/^[a-z]+:\/\//i.test(r)) {
      warnings.push(`narrationRef '${r}' is absolute; prefer a bundle-relative path`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Light shape check of a narration sidecar (the file a lesson's
 * narrationRef points at). Staleness against the lesson text is a
 * separate, heavier check: tools/narration/check-narration.mjs.
 */
export function validateNarrationSidecar(sidecar) {
  const { errors, warnings } = checkSidecarShape(sidecar);
  return { valid: errors.length === 0, errors, warnings };
}
