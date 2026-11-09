// Lesson-block structural validator. Unlike lesson.js/question.js there is
// no curriculum cross-reference here — a block has no subject/grade/
// chapterId of its own, only its owning lesson does — and unlike
// question.js there is no dynamic plugin-schema check either: none of these
// block plugins declare a `static schema` the way question plugins do.
//
// Mirrors content-repo-template/validators/validate.mjs's validateBlockLocal
// (kept in lockstep by hand — see that file's header for why its own copy
// diverges: it also stats a `*Ref`'s target file on disk, which needs
// Node's `fs` and isn't available to this module's other consumer,
// authoring-app's browser-side modules/validate.js).
import { checkFigure } from './figure.js';

const VALID_BLOCK_TYPES = ['text-block@1', 'content-block@1', 'poe-predict@1', 'poe-observe-sim@1', 'poe-explain@1', 'diagram-explore@1', 'reflection@1'];

/**
 * A `markdown`/`prompt` field and its `*Ref` alternative (docs/sprints/wip/
 * dom-simulations-md-prose-and-explanation-slides.md §6) are mutually
 * exclusive and one of them is required. `poe-predict@1.prompt` is the one
 * bare-string shape (ChoiceListBase.js does no `.en` unwrap); every other
 * field here is `{ en: "..." }`.
 */
function checkProseField(data, field, refField, errors) {
  const inline = data[field];
  const ref = data[refField];
  const isBareString = data.type === 'poe-predict@1';
  const hasInline = isBareString ? (typeof inline === 'string' && inline.length > 0) : !!inline?.en;

  if (hasInline && ref) {
    errors.push(`${data.type} has both "${field}" and "${refField}" — inline wins at runtime, but authoring must pick one.`);
  } else if (!hasInline && !ref) {
    const shapeHint = isBareString ? '(a bare string)' : '(a localized object, e.g. { "en": "..." })';
    errors.push(`${data.type} needs "${field}" ${shapeHint} or "${refField}" pointing at a sibling .md file`);
  }
  // Whether refField actually resolves to a real file is a filesystem check
  // — left to content-repo-template's own Node-only validate.mjs CLI, and to
  // the normal load-time error a dangling ref surfaces as in preview.
}

/** graph.functions[] items: an expression or 2+ [x, y] vertices; fill true or [x0, x1]. */
function checkGraphFunctions(graph, errors) {
  for (const [i, f] of (Array.isArray(graph?.functions) ? graph.functions : []).entries()) {
    const pts = f?.points;
    if (pts !== undefined && !(Array.isArray(pts) && pts.length >= 2 && pts.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) errors.push(`graph.functions[${i}].points must be 2+ [x, y] number pairs`);
    if (pts === undefined && !(typeof f?.expression === 'string' && f.expression.trim())) errors.push(`graph.functions[${i}] needs an expression (in x) or points ([[x, y], ...])`);
    const fl = f?.fill;
    if (fl !== undefined && fl !== true && fl !== false && !(Array.isArray(fl) && fl.length === 2 && fl.every(Number.isFinite) && fl[0] < fl[1])) errors.push(`graph.functions[${i}].fill must be true or [x0, x1] with x0 < x1`);
  }
}

/** content-block@1 `graph` / `diagram` companions (stepFigureHost.js): one media per block. */
function checkStepFigure(data, errors) {
  const kinds = ['graph', 'diagram', 'photoDiagram'].filter((k) => data[k]);
  if (!data.graph && !data.diagram) return;
  if (kinds.length > 1) errors.push(`${kinds.join(' and ')} are mutually exclusive on one block - pick one`);
  if (data.image?.src || data.simulation?.src) errors.push(`${data.graph ? 'graph' : 'diagram'} and image/simulation are mutually exclusive on one block - pick one`);
  const fig = data.graph || data.diagram, name = data.graph ? 'graph' : 'diagram';
  if (!fig.a11yCaption || !String(fig.a11yCaption).trim()) errors.push(`${name} needs a non-empty a11yCaption (what a screen reader hears instead of the figure)`);
  const lists = data.graph ? ['functions', 'points'] : ['points', 'segments', 'polygons', 'angles', 'rightAngles', 'parallelMarks', 'circles'];
  for (const l of lists) for (const [i, it] of (fig[l] || []).entries()) {
    if (it?.revealAt !== undefined && !(Number.isInteger(it.revealAt) && it.revealAt >= 0)) errors.push(`${name}.${l}[${i}].revealAt must be a whole beat number (0, 1, 2...)`);
  }
  if (data.graph) {
    if (!(fig.functions?.length || fig.points?.length)) errors.push('graph needs functions or points');
    checkGraphFunctions(fig, errors);
    if (fig.xDomain && !(Array.isArray(fig.xDomain) && fig.xDomain[0] < fig.xDomain[1])) errors.push('graph.xDomain must be [min, max] with min < max');
  } else {
    if (!fig.points?.length) errors.push('diagram needs a non-empty points array');
    const ids = new Set((fig.points || []).map((p) => p.id));
    for (const s of fig.segments || []) if (!ids.has(s.from) || !ids.has(s.to)) errors.push(`diagram segment ${s.from}-${s.to} names a missing point`);
  }
}

/** content-block@1 `simulation.title` / `simulation.caption`: { en: "..." } (a bare string is tolerated at runtime). */
function checkSimulationText(data, errors) {
  const sim = data.simulation;
  if (!sim || typeof sim !== 'object') return;
  for (const f of ['title', 'caption']) {
    if (!(f in sim)) continue;
    const v = sim[f];
    const ok = typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && typeof v.en === 'string');
    if (!ok) errors.push(`simulation.${f} must be a localized object with an "en" string (e.g. { "en": "..." }) or a plain string`);
  }
}

/** content-block@1 `fold: { after: N }` (plain look only): the beats after the
 *  first N sit behind one closed "Read more"; N a positive integer. */
function checkFold(data, errors) {
  if (data.fold === undefined) return;
  const n = data.fold?.after;
  if (!(data.fold && typeof data.fold === 'object' && Number.isInteger(n) && n >= 1)) {
    errors.push('fold must be { "after": N } with N a positive integer (the number of beats shown before "Read more")');
  }
}

export function validateBlock(blockData) {
  const errors = [];
  if (!blockData.id) errors.push('Missing block id');
  if (!blockData.type) errors.push('Missing block type');
  if (blockData.type && !VALID_BLOCK_TYPES.includes(blockData.type)) {
    errors.push(`Unknown block type: ${blockData.type}`);
  }

  if (blockData.type === 'content-block@1') checkProseField(blockData, 'markdown', 'markdownRef', errors);
  if (blockData.type === 'content-block@1') checkStepFigure(blockData, errors);
  if (blockData.type === 'content-block@1') checkSimulationText(blockData, errors);
  if (blockData.type === 'content-block@1') checkFold(blockData, errors);
  if (blockData.type === 'content-block@1' && blockData.figure !== undefined) checkFigure(blockData.figure, errors, blockData);
  if (blockData.type === 'poe-explain@1' || blockData.type === 'poe-observe-sim@1' || blockData.type === 'reflection@1') {
    checkProseField(blockData, 'prompt', 'promptRef', errors);
  }
  if (blockData.type === 'poe-predict@1') {
    checkProseField(blockData, 'prompt', 'promptRef', errors);
    if (!Array.isArray(blockData.options) || !blockData.options.length) errors.push('poe-predict@1 needs a non-empty options array');
    if (!blockData.correctOptionId) errors.push('poe-predict@1 needs correctOptionId');
  }

  return { valid: errors.length === 0, errors };
}
