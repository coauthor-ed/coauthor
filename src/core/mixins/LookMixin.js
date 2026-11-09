import { EventBus } from '../EventBus.js';
import { LookManager } from '../LookManager.js';

/**
 * For a Lit component whose shadow styles differ by look. Mirrors the active
 * look onto the host as `data-look` (Firefox has no :host-context, so shadow
 * CSS keys on `:host([data-look="plain"])`), and gives the host `look`, a
 * reactive string, for the few template branches a look needs. Quill keeps
 * its rules unprefixed: a look's rules only ever add to them.
 * docs/ui-ux-design-system.md 1.1.1a.
 */
export const LookMixin = (Base) => class extends Base {
  static properties = {
    look: { type: String, state: true },
  };

  constructor() {
    super();
    this.look = LookManager.getLook();
    this._onLook = ({ look }) => { this._setLook(look); };
  }

  _setLook(look) {
    this.look = look;
    if (this.getAttribute('data-look') !== look) this.setAttribute('data-look', look);
  }

  connectedCallback() {
    super.connectedCallback();
    // The look may have changed while this element was detached.
    this._setLook(LookManager.getLook());
    EventBus.on('look:changed', this._onLook);
  }

  disconnectedCallback() {
    EventBus.off('look:changed', this._onLook);
    super.disconnectedCallback();
  }

  /** A host with `static LOOK_RENDERERS = true` also marks the
   *  markdown-renderer elements in its own shadow root with data-look, so a
   *  table or a note in a question stem gets the look's rules too
   *  (content-block@1 marks its own beats itself, per page). */
  updated(changed) {
    super.updated?.(changed);
    if (!this.constructor.LOOK_RENDERERS) return;
    const root = this.renderRoot;
    if (!root?.querySelectorAll) return;
    for (const r of root.querySelectorAll('markdown-renderer')) {
      if (this.look === 'plain') { if (r.getAttribute('data-look') !== 'plain') r.setAttribute('data-look', 'plain'); }
      else if (r.hasAttribute('data-look')) r.removeAttribute('data-look');
    }
  }
};
