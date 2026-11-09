import { EventBus } from '../EventBus.js';
import { LessonModeManager } from '../LessonModeManager.js';

/**
 * For a Lit component whose STRUCTURE or shadow styles differ between the two
 * lesson modes (docs/sprints/wip/lesson-modes-plan.md). Token-only styling
 * needs none of this: html[data-lesson-mode] token blocks in theme.css already
 * reach every shadow root through inherited custom properties.
 *
 * Gives the host:
 * - `lessonMode` ('classic' | 'story'), a reactive property kept in step with
 *   LessonModeManager;
 * - `data-lesson-mode` reflected on the host element, so shadow styles can say
 *   `:host([data-lesson-mode="story"]) .x { ... }` (never :host-context(),
 *   which Firefox does not support).
 *
 * Plugins mounted by the engine may also read ctx.lessonMode; this mixin is
 * the equivalent for shell components and for anything that must follow a
 * live switch.
 */
export const LessonModeMixin = (Base) => class extends Base {
  static properties = {
    lessonMode: { type: String, reflect: true, attribute: 'data-lesson-mode' },
  };

  constructor() {
    super();
    this.lessonMode = LessonModeManager.getMode();
    this._onLessonMode = ({ mode }) => { this.lessonMode = mode; };
  }

  connectedCallback() {
    super.connectedCallback();
    // The mode may have changed while this element was detached.
    this.lessonMode = LessonModeManager.getMode();
    EventBus.on('lesson-mode:changed', this._onLessonMode);
  }

  disconnectedCallback() {
    EventBus.off('lesson-mode:changed', this._onLessonMode);
    super.disconnectedCallback();
  }

  get isStoryMode() {
    return this.lessonMode === 'story';
  }
};
