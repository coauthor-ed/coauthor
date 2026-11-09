import { validateManifest } from './manifest.js';
// Module-manifest validator. Deliberately narrow: it checks only the
// optional fields below, not the module's id/lessons structure (no shared
// module validator existed before lesson modes, and tightening one now
// would risk making previously-valid content invalid).
//
// `lessonMode` (docs/sprints/wip/lesson-modes-plan.md, Decisions): optional;
// the only legal value is "story" (a story-only module - the engine forces
// Story mode and hides the Classic/Story switch). Absent = both modes.
//
// `look` (quill-look-pack sprint, E1): optional look id from
// registry/looks.json. Only its shape is checked here; an id the registry
// does not know falls back to the default at runtime (LookManager).
//
// `gamification` (quill-look-pack sprint, E4): optional true|false, overriding
// the site and the look while the module is open. Omit it to follow them.
/** Optional course-map fields on lessons[] (plain look's module page):
 *  question / misconception { en }, keyNumbers [{ value, label: { en } }] (1-3);
 *  and the module's keyNumbersLabel { en }. */
function checkCourseMap(data, errors) {
  const isText = (v) => v && typeof v === 'object' && typeof v.en === 'string' && v.en.trim();
  if (data.keyNumbersLabel !== undefined && !isText(data.keyNumbersLabel)) errors.push('keyNumbersLabel must be { "en": "..." }');
  for (const [i, l] of (Array.isArray(data.lessons) ? data.lessons : []).entries()) {
    for (const k of ['question', 'misconception']) {
      if (l?.[k] !== undefined && !isText(l[k])) errors.push(`lessons[${i}].${k} must be { "en": "..." }`);
    }
    if (l?.keyNumbers === undefined) continue;
    if (!Array.isArray(l.keyNumbers) || l.keyNumbers.length < 1 || l.keyNumbers.length > 3) { errors.push(`lessons[${i}].keyNumbers must be an array of 1-3 { value, label } entries`); continue; }
    l.keyNumbers.forEach((kn, j) => {
      if (!(typeof kn?.value === 'string' && kn.value.trim()) && !Number.isFinite(kn?.value)) errors.push(`lessons[${i}].keyNumbers[${j}].value must be a short string (e.g. "13.2", "14 / 20")`);
      if (kn?.label !== undefined && !isText(kn.label)) errors.push(`lessons[${i}].keyNumbers[${j}].label must be { "en": "..." }`);
    });
  }
}

export function validateModule(moduleData) {
  const errors = [];
  if (!moduleData || typeof moduleData !== 'object') return { valid: false, errors: ['Module must be an object'] };
  if ('lessonMode' in moduleData && moduleData.lessonMode !== 'story') {
    errors.push(`Invalid lessonMode: ${JSON.stringify(moduleData.lessonMode)} (the only legal value is "story"; omit the field for a module that works in both modes)`);
  }
  if ('look' in moduleData && !(typeof moduleData.look === 'string' && /^[a-z][a-z0-9-]*$/.test(moduleData.look))) {
    errors.push(`Invalid look: ${JSON.stringify(moduleData.look)} (a look id from registry/looks.json, e.g. "quill"; omit the field to follow the site)`);
  }
  if ('gamification' in moduleData && typeof moduleData.gamification !== 'boolean') {
    errors.push(`Invalid gamification: ${JSON.stringify(moduleData.gamification)} (true or false; omit the field to follow the site and the look)`);
  }
  if ('requires' in moduleData) {
    const r = validateManifest({ requires: moduleData.requires });
    errors.push(...r.errors);
  }
  checkCourseMap(moduleData, errors);
  return { valid: errors.length === 0, errors };
}
