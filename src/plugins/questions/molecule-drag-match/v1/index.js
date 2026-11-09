/**
 * molecule-drag-match@1 — legacy alias for drag-match@1.
 *
 * Renamed 2026-09-08: despite the name, this type's mechanism (generic
 * labeled-tile drag-and-drop matching against labeled targets) was never
 * chemistry/molecule-specific — see drag-match/v1/index.js for the actual
 * implementation. This file only exists so already-authored content
 * referencing "molecule-drag-match@1" keeps loading without a content
 * migration — same class, registered under its own (old) custom-element
 * tag name too. New content should always author "drag-match@1" instead.
 */
import { DragMatch } from '../../drag-match/v1/index.js';

// The platform's CustomElementRegistry rejects reusing the same
// constructor under a second tag name ("this constructor has already been
// used with this registry") — a trivial, behavior-free subclass is the
// only way to register the identical implementation under the old tag
// too. Static methods (score()) are inherited via the prototype chain
// unchanged, since DragMatch.score() never reads `this`.
class MoleculeDragMatchLegacy extends DragMatch {}

customElements.define('molecule-drag-match-v1', MoleculeDragMatchLegacy);

export { DragMatch };
