const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'olympiad'];

/**
 * Recursively checks `data` against a plugin's static schema, descending
 * into array-of-objects properties (e.g. match-categorize@1's
 * `chips[].correctCategoryId`, statement-judgment@1's `statements[].isTrue`)
 * instead of only the top-level `required` list. A real bank shipped 8
 * questions using the wrong nested field names (`categoryId`/`isCorrect`
 * instead of `correctCategoryId`/`isTrue`) that a top-level-only check can't
 * see, and which silently scored every attempt as 0 regardless of what the
 * student answered — this is the fix for that class of bug.
 */
function validateAgainstSchema(data, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return;
  for (const req of schema.required || []) {
    if (data == null || data[req] === undefined) {
      errors.push(`Missing required field from schema: ${path ? `${path}.${req}` : req}`);
    }
  }
  if (schema.properties && data && typeof data === 'object') {
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (data[key] !== undefined) {
        validateAgainstSchema(data[key], subSchema, path ? `${path}.${key}` : key, errors);
      }
    }
  }
  if (schema.type === 'array' && schema.items && Array.isArray(data)) {
    data.forEach((item, i) => validateAgainstSchema(item, schema.items, `${path}[${i}]`, errors));
  }
}

export async function validateQuestion(questionData, registry, curriculum = null) {
  const errors = [];
  const warnings = [];
  // grade is optional: a number (9) or a non-empty string ("UG").
  if (questionData.grade !== undefined && questionData.grade !== null &&
      !((typeof questionData.grade === 'number' && Number.isFinite(questionData.grade)) || (typeof questionData.grade === 'string' && questionData.grade.trim()))) {
    errors.push('Invalid grade: must be a number or a non-empty string');
  }
  if (!questionData.id) errors.push('Missing question id');
  if (!questionData.type) errors.push('Missing question type');

  // Both optional — most questions (lesson-embedded ones especially) will
  // never set them. Only validated when present, same "tag what you use"
  // spirit as chapterId below. Formalizes the informal difficulty
  // convention already seen in real content (questions/bank/*.json) so a
  // question-bank@1 index (tools/validation/questionBank.js) can trust it.
  if (questionData.difficulty !== undefined && !DIFFICULTY_LEVELS.includes(questionData.difficulty)) {
    errors.push(`Invalid difficulty: "${questionData.difficulty}" (must be one of ${DIFFICULTY_LEVELS.join(', ')})`);
  }
  if (questionData.estimatedTimeSec !== undefined &&
      (typeof questionData.estimatedTimeSec !== 'number' || questionData.estimatedTimeSec <= 0)) {
    errors.push('Invalid estimatedTimeSec: must be a positive number of seconds');
  }
  // A short `explanation` one-liner isn't enough at this difficulty — a
  // hard/olympiad question needs a real worked solution a student can
  // actually learn from on review (see content-authoring-guide.md's
  // Question Banks section). Machine-enforced rather than left as prose an
  // author can skip under time pressure.
  if ((questionData.difficulty === 'hard' || questionData.difficulty === 'olympiad') && !questionData.explanationSlide) {
    errors.push(`"${questionData.difficulty}" questions require an explanationSlide (a short "explanation" alone is not enough)`);
  }

  // Topic tagging was deliberately removed from the data model — see
  // docs/HighLevelDesign.md. Book/chapter were reinstated as optional tags,
  // so chapterId is only validated when present.
  // Curriculum cross-references are warnings only, and only when ids are present.
  if (curriculum && questionData.subject) {
    const subject = (curriculum.subjects || []).find(s => s.id === questionData.subject);
    if (!subject) warnings.push(`Unknown subject: ${questionData.subject} (not in curriculum.json)`);
    else {
      if (questionData.grade != null && Array.isArray(subject.grades) && !subject.grades.includes(questionData.grade)) {
        warnings.push(`Invalid grade: subject ${questionData.subject} has no grade ${questionData.grade}`);
      }
      if (questionData.chapterId) {
        const chapter = (subject.chapters || []).find(c => c.id === questionData.chapterId);
        if (!chapter) {
          warnings.push(`Unknown chapterId: ${questionData.chapterId} not found in subject ${questionData.subject}`);
        } else if (questionData.grade != null && chapter.grade !== questionData.grade) {
          warnings.push(`Invalid chapterId: ${questionData.chapterId} belongs to grade ${chapter.grade}, not ${questionData.grade}`);
        }
      }
    }
  }

  const entry = registry[questionData.type];
  if (!entry) {
    errors.push(`Unknown question type: ${questionData.type}`);
    return { valid: false, errors, warnings };
  }

  try {
    // In browser, this would use absolute path, in node it might need file://
    // Registry entries are either a bare path string or { path, summaryKeys }.
    const modulePath = typeof entry === 'string' ? entry : entry.path;
    const mod = await import(modulePath);
    // Plugins export their custom-element class under their own name (e.g.
    // `MCQSingle`, `FillBlankQuestion`), not a fixed `QuestionComponent`
    // symbol — find whichever export carries the static `schema`.
    const ComponentClass = mod.QuestionComponent
      || Object.values(mod).find(v => typeof v === 'function' && v.schema);
    if (ComponentClass && ComponentClass.schema) {
      // Structural validation against plugin schema — recurses into
      // array-of-objects properties too, see validateAgainstSchema() above.
      validateAgainstSchema(questionData, ComponentClass.schema, '', errors);
    } else {
      console.warn(`Plugin ${questionData.type} missing static schema`);
    }
  } catch (e) {
    errors.push(`Failed to load plugin for type ${questionData.type}: ${e.message}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
