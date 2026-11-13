import { html, css } from 'lit';
import { splitSteps } from '../markdown/splitSteps.js';
// Registers <companion-slot> (the look's companion), used by _renderSteps()
// for a step carrying `callout="result"` — see that method and
// content-block.js's own `.rv-callout-result` styling.
import '../../ui/components/LookSlots.js';

/**
 * Mixin that adds progressive disclosure (beats) to a LitElement plugin.
 * Handles parsing markdown into steps, tracking the current step, and
 * providing the engine interface (advanceStep, retreatStep, etc).
 */
export const ProgressiveDisclosureMixin = (superClass) => class extends superClass {
  static properties = {
    ...superClass.properties,
    _step: { type: Number, state: true },
  };

  constructor() {
    super();
    this._step = 0;
    this._steps = [];
    this._header = null;
    this._hasRevealedStep = false;
  }

  /**
   * Whenever a new beat becomes current — click, keyboard, autoplay, or
   * "Show full" all funnel through `_step` — bring it fully into view. The
   * first `updated()` call after mount also reports `_step` as "changed"
   * (Lit has no prior render to diff against), which is not a real beat
   * change, so it is skipped via `_hasRevealedStep` rather than triggering a
   * scroll on every freshly-mounted block — *except* when that first mount
   * is already restoring progress past beat 0 (`ctx.initialStep`, e.g. the
   * student had reached beat 3 of this slide, moved on to the next slide,
   * then came back). That's not "nothing to scroll to, we're already at the
   * top" the way a fresh beat-0 mount is — it's exactly the "bring the
   * current beat into view" case this hook exists for, just arriving via a
   * mount instead of a click. Without this, a revisited slide always
   * rendered at scroll position 0 regardless of which beat it resumed at,
   * which on a stacked (not side-by-side) simulation layout could leave the
   * resumed beat's own media well below the fold with nothing having ever
   * scrolled to it.
   */
  updated(changedProperties) {
    if (super.updated) super.updated(changedProperties);
    if (changedProperties.has('_step')) {
      // Forward: a later beat, or beat 0 of a freshly mounted block. Not a
      // step back, and not a mount restoring a later beat (Previous into a
      // slide, a resumed lesson): those beats were read already.
      const prev = changedProperties.get('_step');
      this._enterBeat(prev === undefined ? this._step === 0 : this._step > prev);
      if (this._hasRevealedStep || this._step > 0) {
        requestAnimationFrame(() => this._scrollCurrentBeatIntoView());
      }
      this._hasRevealedStep = true;
    }
  }

  /** The look's beat entrance (--beat-enter, a keyframes name in
   *  progressiveDisclosureStyles; plain sets rv-beat-in), or '' when the look
   *  has none (Quill: content-block keeps its own rv-enter and word reveal). */
  _beatEnterName() {
    // Quill has no entrance: answer without a style read. A getComputedStyle here
    // flushes style mid-update and moved Quill's reading scroll by a pixel.
    const look = globalThis.document?.documentElement?.getAttribute('data-look');
    if (!look || look === 'quill') return '';
    try {
      const v = getComputedStyle(this).getPropertyValue('--beat-enter').trim();
      return v && v !== 'none' ? v : '';
    } catch { return ''; }
  }

  /**
   * One entrance for every beat-carrying block (content-block, poe-predict,
   * poe-explain, choice questions), when the look sets --beat-enter. Why not
   * a plain CSS animation on .rv-current: the beat's markdown renders
   * asynchronously (sanitizer, glossary, math), so an animation that starts
   * with the element could finish before the text exists; the text then
   * popped in, on some beats and not others. So the new beat is held at
   * opacity 0 (data-enter="hold", before the first paint) until its renderer
   * has content (or 400 ms), then plays the animation once
   * (data-enter="run"); the previous beat dims by its own opacity transition.
   * Backward steps get no entrance: the beat brightens back from its dim.
   */
  _enterBeat(forward) {
    const root = this.shadowRoot;
    if (!root || !this._beatEnterName()) return;
    const token = (this._enterToken = (this._enterToken || 0) + 1);
    root.querySelectorAll('.rv-step[data-enter]').forEach((el) => el.removeAttribute('data-enter'));
    if (!forward) return;
    const els = [...root.querySelectorAll('.rv-steps > .rv-step.rv-current')];
    if (!els.length) return;
    for (const el of els) el.setAttribute('data-enter', 'hold');
    const ready = els.map((el) => el.querySelector('markdown-renderer')?.whenRendered?.()).filter(Boolean);
    const cap = new Promise((r) => setTimeout(r, 400));
    Promise.race([Promise.all(ready), cap]).then(() => requestAnimationFrame(() => {
      if (token !== this._enterToken) return;
      for (const el of els) {
        if (!el.isConnected) continue;
        const done = (e) => {
          if (e.target !== el) return;
          el.removeEventListener('animationend', done);
          el.removeEventListener('animationcancel', done);
          if (token === this._enterToken) el.removeAttribute('data-enter');
        };
        el.addEventListener('animationend', done);
        el.addEventListener('animationcancel', done);
        el.setAttribute('data-enter', 'run');
      }
    }));
  }

  /**
   * A beat short enough to fit the viewport gets centered — a calm reading
   * position, and (together with the simulation panel's own sticky
   * centering) what keeps beat and sim aligned side by side. A beat taller
   * than the viewport (several paragraphs plus a trailing equation, say)
   * can never be made fully visible either way `block` is set — centering
   * it would crop equally from both ends, hiding the very content (often
   * the concluding formula) that advancing to this beat was meant to
   * reveal. So for those, align to the bottom edge instead: it sacrifices
   * the beat's opening line, already read on the way here, rather than its
   * new, unread ending.
   */
  _scrollCurrentBeatIntoView() {
    if (document.hidden) return;
    if (!this._steps || this._steps.length <= 1) return;
    const el = this.shadowRoot?.querySelector('.rv-current');
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduce ? 'auto' : 'smooth';
    const headerH = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--lesson-sticky-header-h')) || 0;
    const available = window.innerHeight - headerH;
    const fits = el.getBoundingClientRect().height <= available;
    // Subclass hook (see content-block.js's own override) — defaults to
    // exactly today's behavior when absent/returns nothing.
    const block = this._scrollBeatBlockAlign?.(fits) || (fits ? 'center' : 'end');
    el.scrollIntoView({ behavior, block, inline: 'nearest' });
    if (block === 'start') this._recheckBeatScroll(el, headerH);
  }

  /** A start-aligned beat (a stacked scene under it) is re-placed once the
   *  slide settles (Q-84): the scene mounting, fonts and the session's own
   *  slide scroll could leave a later beat's scene 650-750 px down a 844 px
   *  phone. Never after the learner scrolls, taps or presses a key. */
  _recheckBeatScroll(el, headerH) {
    clearTimeout(this._beatRecheckT);
    this._beatRecheckOff?.();
    let moved = false;
    const mark = () => { moved = true; };
    const evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true, capture: true }));
    this._beatRecheckOff = () => { evs.forEach((e) => window.removeEventListener(e, mark, { capture: true })); this._beatRecheckOff = null; };
    this._beatRecheckT = setTimeout(() => {
      this._beatRecheckOff?.();
      if (moved || document.hidden || !el.isConnected || !el.classList.contains('rv-current')) return;
      const top = el.getBoundingClientRect().top;
      // Only a beat left too low (the scroll fell short) is re-placed. A beat
      // above its place was scrolled on by something else; leave it there.
      if (top - (headerH + 12) > 24) el.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
    }, 900);
  }

  /**
   * Must be called by the subclass's `init(data, ctx)` to parse the markdown
   * and restore the step state.
   */
  _initDisclosure(text, data, ctx) {
    // The beats' tap-to-gloss words are looked up in this bundle's glossary.
    if (ctx && !this._ctx) this._ctx = ctx;
    const { header, steps } = splitSteps(text || '');
    this._header = header;
    this._steps = steps;

    if (data.reveal?.mode === 'off') {
      this._step = Math.max(0, steps.length - 1);
    } else {
      const want = Number(ctx?.initialStep);
      this._step = Number.isFinite(want) ? Math.min(Math.max(0, want), Math.max(0, steps.length - 1)) : 0;
    }
  }

  stepState() {
    return {
      step: this._step,
      steps: this._steps.length,
      done: this._step >= this._steps.length - 1,
    };
  }

  advanceStep() {
    if (this._step >= this._steps.length - 1) return false;
    this._step++;
    return true;
  }

  retreatStep() {
    if (this._step <= 0) return false;
    this._step--;
    return true;
  }

  /** Jumps straight to beat n (clamped); false if already there. Used by the
   *  narration scrubber (LessonEngine.seekTo with inPlace), so the block steps
   *  in place rather than being remounted. */
  goToStep(n) {
    const last = Math.max(0, this._steps.length - 1);
    const to = Math.min(Math.max(0, Number(n) | 0), last);
    if (to === this._step) return false;
    this._step = to;
    return true;
  }

  /** The current beat's authored STEP id, or null for a derived beat. */
  stepId() {
    return this._steps[this._step]?.id || null;
  }

  revealAll() {
    if (this._step >= this._steps.length - 1) return false;
    this._step = this._steps.length - 1;
    return true;
  }

  /** True once the beat at `step` (0-indexed) is current or later. Absent/0/
   *  non-integer -> true — today's default of "visible from the first beat",
   *  preserved for every block that doesn't opt into gating. Clamped to the
   *  last real beat so an edited-down step count (or `revealAll()`, which
   *  jumps straight to the last beat) can never leave the gate permanently
   *  closed. */
  isStepRevealed(step) {
    if (!Number.isInteger(step) || step <= 0) return true;
    const clamped = Math.min(step, Math.max(0, this._steps.length - 1));
    return this._step >= clamped;
  }

  /** The current beat as plain text. `{ headings: false }` drops heading
   *  lines (narration never speaks a heading). */
  stepText({ headings = true } = {}) {
    let md = this._steps[this._step]?.md || '';
    if (!headings) md = md.replace(/^[ \t]{0,3}#{1,6}[ \t]+[^\n]*$/gm, '');
    return md
      .replace(/^#{1,6}[ \t]+/gm, '')
      .replace(/^\s*[-*+][ \t]+/gm, '')
      .replace(/[*_`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Subclass hook: the markdown beat i (-1 = the pinned header) renders.
   *  Default: as split. content-block@1 uses it to hoist a slide title into
   *  the lesson head under the plain look. */
  _beatMarkdown(md, i) { // eslint-disable-line no-unused-vars
    return md;
  }

  _renderSteps() {
    const { done } = this.stepState();
    const mathColors = this._data?.mathColors || null;

    return html`
      ${this._header
        ? html`<markdown-renderer class="cb-header" .content=${this._beatMarkdown(this._header, -1)} .mathColors=${mathColors} .glossaryBundle=${this._ctx?.bundleId}></markdown-renderer>`
        : ''}
      <div class="rv-steps">
        ${this._steps.map((s, i) => {
          // A step not yet reached isn't rendered at all — the column grows
          // naturally as beats reveal. Anything below it (an image, say)
          // that consequently has to move animates that shift via
          // flipAnimate.js rather than snapping; see content-block.js's
          // willUpdate()/updated() pair.
          if (i > this._step) return '';

          return html`
            <div
              class="rv-step ${i <= this._step ? 'rv-shown' : ''} ${i < this._step ? 'rv-past' : ''} ${i === this._step ? 'rv-current' : ''} ${s.callout ? `rv-callout-${s.callout}` : ''}"
              data-step-id=${s.id ?? ''}
            >
              ${this._data?.poeRecapStep === i && typeof this._renderPoeRecap === 'function' ? this._renderPoeRecap(true) : ''}
              <markdown-renderer
                .content=${this._beatMarkdown(s.md, i)}
                .mathColors=${mathColors}
                .glossaryBundle=${this._ctx?.bundleId}
                .revealWords=${i === this._step && this._ctx?.lessonMode === 'classic' && this.constructor.REVEAL_WORDS === true && !this._beatEnterName()}
              ></markdown-renderer>
              ${s.callout === 'result' ? html`
                <companion-slot
                  class="rv-callout-mascot"
                  size="sm"
                  expression="love"
                  act=${i === this._step ? 'hop' : ''}
                  .lines=${s.line ? [s.line] : null}
                ></companion-slot>
              ` : ''}
            </div>
          `;
        })}
      </div>
      ${this._renderFoldTail?.(done) || ''}
      <div class="rv-more ${done ? 'rv-more-hidden' : ''}">
        <button type="button" @click=${this.revealAll.bind(this)}>Show full</button>
      </div>
    `;
  }
};

export const progressiveDisclosureStyles = css`
  /* ── Progressive Reveal (.rv-*) ────────────────────────────────────── */
  .rv-steps {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .rv-step {
    transition: opacity var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
    /* So the freshly-current beat lands below the sticky header (a
       different Shadow DOM entirely — LessonSession publishes this custom
       property onto document.documentElement, which var() resolution
       crosses even though selectors can't) rather than partly underneath
       it. */
    scroll-margin-top: calc(var(--lesson-sticky-header-h, 0px) + 12px);
  }

  /* Fade out past beats to keep the focus tight. */
  .rv-step.rv-past {
    opacity: var(--reveal-past-opacity, 0.45);
  }

  /* The look's beat entrance (_enterBeat(); --beat-enter names the
     keyframes, unset under Quill so none of this applies). Held invisible
     until the beat's text is rendered, then one fade with a small rise.
     Unfilled: when it ends the ordinary rules hold again. */
  .rv-steps > .rv-step.rv-current[data-enter="hold"] { opacity: 0; animation: none; }
  .rv-steps > .rv-step.rv-current[data-enter="run"] {
    animation: var(--beat-enter, none) var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
  }
  @keyframes rv-beat-in {
    from { opacity: 0; transform: translateY(var(--motion-reveal-rise, 6px)); }
    to   { opacity: 1; transform: none; }
  }
  @keyframes rv-beat-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .rv-step.rv-past:hover {
    opacity: 1.0;
  }

  .rv-more {
    margin-top: 1.0rem;
    padding-top: 0.5rem;
  }
  .rv-more-hidden {
    visibility: hidden;
  }
  .rv-more button {
    background: none;
    border: none;
    padding: 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.2s;
  }
  .rv-more button:hover {
    text-decoration-color: currentColor;
    color: var(--primary-text);
  }

  /* A 44px target on a phone, in the space the small link already took:
     the negative margins keep the beat's layout, so the scene does not pay. */
  @media (max-width: 600px), (pointer: coarse) {
    .rv-more button { min-height: 44px; margin: -15px 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .rv-step { transition: none !important; }
    /* No travel; the fade stays so a new beat still shows it arrived. */
    .rv-steps > .rv-step.rv-current[data-enter="run"] { animation-name: rv-beat-fade; }
  }
`;
