// Story cast validator: the cast.json a course manifest's `"cast"` names
// (docs/content-authoring-guide.md, "Story cast"). The rules live with the
// engine's own reader (src/core/cast/castData.js checkCast()), so the
// validator and the runtime can never disagree about what is valid.
//
//   validateCast(json)                     the file's shape
//   validateCast(json, { exists })         also that every pose image and
//                                          element module is in the bundle;
//                                          exists(path) -> boolean, path
//                                          bundle-relative
//   validateSayIds(markdown, cast)         SAY markers naming no character
import { checkCast, markSay } from '../../src/core/cast/castData.js';

export function validateCast(json, { exists } = {}) {
  const { cast, errors, warnings } = checkCast(json);
  if (cast && typeof exists === 'function') {
    for (const id of cast.order) {
      const c = cast.characters[id];
      for (const [mood, p] of Object.entries(c.poses)) if (!exists(p)) errors.push(`characters.${id}.poses.${mood}: "${p}" is not in the bundle`);
      if (c.element && !exists(c.element)) errors.push(`characters.${id}.element: "${c.element}" is not in the bundle`);
    }
  }
  return { valid: errors.length === 0, errors, warnings, cast };
}

/** Warnings for SAY markers whose id is not a character of `cast` (a
 *  checkCast() cast, or null for a course without one). */
export function validateSayIds(markdown, cast) {
  const warnings = [];
  for (const { id } of markSay(markdown).says) {
    if (!cast) warnings.push(`SAY ${id}: the course has no story cast (manifest "cast"); it shows as a plain paragraph`);
    else if (!cast.characters[id]) warnings.push(`SAY ${id}: not a character in cast.json; it shows as a plain paragraph`);
  }
  return warnings;
}
