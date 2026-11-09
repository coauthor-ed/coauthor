// Course manifest.json validator for the optional "Course metadata (manifest
// v1)" fields (docs/content-authoring-guide.md). Every field is optional,
// unknown extra fields are fine; wrong types and unknown enum values are
// errors. Also used for `requires` on module JSON. Warns (not errors) when
// requires.engine is newer than this engine.
import { ENGINE_VERSION, satisfies } from '../../src/core/engineVersion.js';
import { isBundleRelative } from '../../src/core/cast/castData.js';

const AUDIENCES = ['school', 'college', 'adult'];
const FEATURES = ['story', 'narration', 'games', 'practice'];
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);
const isUrl = (v) => isStr(v) && /^https?:\/\//.test(v);

export function validateManifest(data) {
  const errors = [];
  const warnings = [];
  if (!isObj(data)) return { valid: false, errors: ['Manifest must be an object'], warnings };
  const has = (k) => k in data;
  const bad = (k, want) => errors.push(`Invalid ${k}: ${JSON.stringify(data[k])} (${want})`);

  if (has('schemaVersion') && !Number.isInteger(data.schemaVersion)) bad('schemaVersion', 'a whole number, currently 1');
  if (has('description') && !(isObj(data.description) && isStr(data.description.en))) bad('description', '{ "en": "..." }');
  if (has('audience') && !AUDIENCES.includes(data.audience)) bad('audience', `one of ${AUDIENCES.join(', ')}`);
  if (has('grade') && data.grade !== null && !Number.isFinite(data.grade) && !(typeof data.grade === 'string' && data.grade.trim() && !/^\d+$/.test(data.grade.trim()))) bad('grade', 'a number, a label such as "UG", or null (write 9, not "9")');
  if (has('board') && !isStr(data.board)) bad('board', 'a string such as "CBSE"');
  if (has('subjects') && !isStrArr(data.subjects)) bad('subjects', 'an array of strings');
  if (has('languages') && !isStrArr(data.languages)) bad('languages', 'an array of strings such as ["en"]');
  if (has('features')) {
    if (!isObj(data.features)) bad('features', `{ ${FEATURES.join('?, ')}? } of booleans`);
    else for (const k of FEATURES) {
      if (k in data.features && typeof data.features[k] !== 'boolean') errors.push(`Invalid features.${k}: ${JSON.stringify(data.features[k])} (true or false)`);
    }
  }
  if (has('estHours') && !(Number.isFinite(data.estHours) && data.estHours >= 0)) bad('estHours', 'a number of hours, 0 or more');
  if (has('repository')) {
    if (!isObj(data.repository)) bad('repository', '{ url, issues }');
    else for (const k of ['url', 'issues']) {
      if (k in data.repository && !isUrl(data.repository[k])) errors.push(`Invalid repository.${k}: ${JSON.stringify(data.repository[k])} (an http(s) URL)`);
    }
  }
  if (has('license') && !(isStr(data.license) && /^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/.test(data.license))) bad('license', 'an SPDX id such as "CC-BY-4.0"');
  if (has('authors')) {
    if (!Array.isArray(data.authors)) bad('authors', 'an array of { name, url?, email? }');
    else data.authors.forEach((a, i) => {
      if (!isObj(a) || !isStr(a.name)) errors.push(`Invalid authors[${i}]: needs a name`);
      else for (const k of ['url', 'email']) if (k in a && !isStr(a[k])) errors.push(`Invalid authors[${i}].${k}: must be a string`);
    });
  }
  if (has('version') && !(isStr(data.version) && /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(data.version))) bad('version', 'semver such as "1.2.0"');
  if (has('updatedAt') && !(isStr(data.updatedAt) && /^\d{4}-\d{2}-\d{2}/.test(data.updatedAt) && !Number.isNaN(Date.parse(data.updatedAt)))) bad('updatedAt', 'an ISO date such as "2026-11-01"');
  // `showcase` is a path string in v1; the older object form (cover, tagline) is still read by Discover.
  if (has('showcase') && !isStr(data.showcase) && !isObj(data.showcase)) bad('showcase', 'a bundle-relative path to showcase.json');
  // `cast` (story cast, docs/content-authoring-guide.md "Story cast"): a
  // bundle-relative path to cast.json; its contents are checked by cast.js.
  if (has('cast') && !(isBundleRelative(data.cast) && /\.json$/i.test(data.cast))) bad('cast', 'a bundle-relative path to cast.json, such as "story/cast.json"');
  if (has('requires')) {
    if (!isObj(data.requires)) bad('requires', '{ "engine": "1.0" }');
    else if ('engine' in data.requires) {
      const e = data.requires.engine;
      if (!(isStr(e) && /^\d+(\.\d+){0,2}$/.test(e))) errors.push(`Invalid requires.engine: ${JSON.stringify(e)} (dotted number such as "1.0")`);
      else if (!satisfies(e, ENGINE_VERSION)) warnings.push(`requires.engine ${e} is newer than this engine (${ENGINE_VERSION}); older apps will ask the learner to update`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
