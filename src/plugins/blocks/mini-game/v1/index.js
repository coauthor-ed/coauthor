import { LitElement, html, css } from 'lit';
import { EventBus } from '../../../../core/EventBus.js';
import { DomSimulation } from '../../../../simulations/base/DomSimulation.js';
import {
  mountQuestionSimulation,
  destroyQuestionSimulation,
  renderSimControls,
} from '../../../../core/components/simulationHost.js';
import { btn3dStyles, feedbackAnimStyles } from '../../../../ui/sharedStyles.js';
import { CUES, emitCue } from '../../../../core/cues.js';
import '../../../../ui/components/LookSlots.js';
import { LookMixin } from '../../../../core/mixins/LookMixin.js';
import { LookManager } from '../../../../core/LookManager.js';

// Inside a game's board: controls that run the game's flow rather than move a piece.
const GAME_FLOW_CONTROLS = '[class*="-check"], [class*="-next"], [data-act="next"], [data-sflow-action="next"]';

/**
 * mini-game@1 — a scene with a goal.
 *
 * Hosts a challenge-mode scene (src/simulations/base/ChallengeMode.js) the same
 * way poe-observe-sim@1 hosts an ordinary one: SimulationLoader resolves `src`
 * bundle-relative through CourseSourceManager, exactly like image.src, so a
 * game stays inside its course bundle and the bundle stays copy-paste portable.
 *
 * The mount/controls plumbing is `core/components/simulationHost.js`, shared
 * with the question plugins rather than re-derived here. That module is the
 * right one: like a question companion and unlike a lesson slide, a game has no
 * markdown beats to sync to, so it mounts the scene once and lets it run free
 * on its own CONTROLS. Rendering those controls is not optional — six of the
 * seven pilot games are played THROUGH a slider or a number field (sides,
 * slices, D's position, a guessed gap), so a game with no control strip is a
 * game with no moves.
 *
 * This plugin hosts "Tier 1" Quill: he lives HERE, in the plugin's own shadow
 * root, and the look's reactor makes him react to evaluate() results through
 * the cue:game-* cues (src/core/cues.js), which hand him over as `companion`. That is what lets the five pilot games
 * that reuse existing canvas scenes work with those scenes completely
 * unmodified - only a game whose mascot must stand inside the geometry needs a
 * DomSimulation and SimMascotDom.
 *
 * Content shape:
 *   {
 *     "type": "mini-game@1",
 *     "src": "simulations/L06/FloppyFourGonGame.js",
 *     "objective": { "en": "Flex the shape to its largest possible area." },
 *     "xp": 15
 *   }
 *
 * `objective` is optional: a challenge scene declares `static OBJECTIVE` and
 * that is the authoritative wording, so the block JSON only overrides it when a
 * course wants different phrasing.
 *
 * Exercise framing (2026-11-05): a look whose registry entry says
 * "gamification": false (plain) frames the block as an exercise, not a game:
 * a quiet small-caps "Exercise" label over one ink rule, no badge, no boxed
 * card, a plain verdict ("Correct.") and a height budget that keeps the scene,
 * its label and its Check inside the slide frame. Read from the look's own
 * spec (LookManager.getLookSpec()), so Quill is untouched even in a course
 * that turns gamification off. docs/mini-games.md "Exercise, not game".
 *
 * Deliberately no timer. A countdown converts understanding into reflex, which
 * is the failure mode the whole tie taxonomy exists to avoid; retries are
 * unlimited and unpenalised.
 *
 * `static SELF_CHECKING = true` opts a scene out of the manual "Check my
 * answer" button entirely (hidden, not just disabled) - for a scene whose own
 * UI already resolves each answer immediately (a sequential one-at-a-time
 * flow, say), the button is a redundant extra click, not a real decision
 * point. Such a scene calls the callback this plugin injects onto it after
 * mount, `this.requestCheck()`, once its own UI knows the student is done -
 * that runs the exact same evaluate()/quill-reaction/EventBus pipeline the
 * button itself would have, so nothing about scoring or the solved-state
 * duplicates between scene and plugin. A scene that still benefits from a
 * deliberate "I'm done, check me" moment (most drag/sort/slider games) leaves
 * this unset and keeps the button.
 */
export class MiniGamePlugin extends LookMixin(LitElement) {
  static properties = {
    _status: { state: true },
    _attempts: { state: true },
    _solved: { state: true },
    _error: { state: true },
    _ready: { state: true },
  };

  // Classes here are prefixed `mg-` (except `.sim-host`/`.q-sim-controls`,
  // which other tooling already references by name) precisely because a
  // shadow root's own <style> is NOT scoped away from a scene's own light-DOM
  // markup mounted inside it (`.sim-host`'s children included) — a scene
  // that names an element `.verdict` or `.card` silently inherits THIS
  // component's rules for that name. Found for real: a redesigned scene's
  // own `.verdict` picked up `flex:1`, stretching it to fill the card.
  static styles = [btn3dStyles, feedbackAnimStyles, css`
    :host { display: block; margin-bottom: var(--space-6); }
    .mg-card {
      border: 3px solid var(--border-color);
      border-radius: var(--radius-lg);
      background: var(--surface-card);
      overflow: hidden;
      box-shadow: var(--press-1) var(--border-color);
    }
    .mg-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border-bottom: 2px solid var(--border-color);
      flex-wrap: wrap;
    }
    .mg-badge {
      font-family: var(--font-label, var(--font-heading));
      font-weight: var(--fw-heavy);
      font-size: var(--fs-kicker);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--on-primary);
      background: var(--primary-color);
      padding: 4px 10px;
      border-radius: var(--radius-pill);
    }
    .mg-goal { font-weight: var(--fw-strong); color: var(--text-main); flex: 1; min-width: 200px; }
    .mg-body { padding: var(--space-4); }
    /* Same sizing contract renderSimCard documents for question companions:
       cap the host, let the canvas fill it, and restore text layout for a
       DomSimulation root (the line-height:0 above collapses it). The 820px
       cap exists to avoid upscaling a CanvasSimulation past its native raster
       resolution (blurry) - it doesn't apply to a DomSimulation scene, which
       is real DOM/text scaled by CSS transform with no such ceiling, and a
       mini-game is the primary content of its own block (unlike a small
       question-companion panel sitting beside a stem), so a DomSimulation
       game gets a sim-host--fluid class (added in render() below) instead of
       the flat 820px cap.
       Widening by WIDTH alone is not enough, though: DomSimulation's scale
       wrap has aspect-ratio: W/H, so a wider box is also a taller one -
       letting width run to the full column (often 1400px+) on a normal
       laptop window made some games taller than the viewport, forcing a
       scroll past the header just to reach the Check button (a real
       regression a widescreen desktop user hit). --mg-sim-aspect (W/H, set
       inline per scene in render() below, default 1.5 for the common 900x600
       case) lets width be derived FROM a height budget instead of the other
       way around, so both dimensions stay bounded by the viewport at once -
       the same "fit within both axes" letterboxing a responsive video uses.
       The height budget is clamp(420px, 72vh, 760px), not a flat 72vh: a
       short mobile-landscape viewport (~740x400, one of the four required
       breakpoints - docs/ui-ux-design-system.md) has only ~400px of vh to
       give, and 72% of that (288px) produced a game barely half the width
       of its own container - most of a landscape phone's actual width sat
       unused for no reason, since that shape has width to spare and only
       vertical room is scarce. The 420px floor stops the budget collapsing
       that far on a short viewport while leaving the 760px ceiling (and
       ordinary desktop sizing) unchanged - width still ends up bounded by
       min(100%, ...) either way, so a genuinely narrow container (portrait
       phones) is untouched by this floor. */
    .sim-host { width: 100%; max-width: 820px; margin: 0 auto; height: auto; line-height: 0; }
    .sim-host.sim-host--fluid {
      max-width: none;
      width: min(100%, calc(clamp(420px, 72vh, 760px) * var(--mg-sim-aspect, 1.5)));
    }
    .sim-host canvas { width: 100% !important; height: auto !important; display: block; }
    .sim-host .sim-dom-root { line-height: normal; }
    .q-sim-controls { max-width: 820px; margin-left: auto; margin-right: auto; }
    .mg-body:has(.sim-host--fluid) .q-sim-controls { max-width: none; }
    .mg-foot {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border-top: 2px solid var(--border-color);
      flex-wrap: wrap;
    }
    .mg-verdict { font-weight: var(--fw-heavy); flex: 1; min-width: 160px; }
    .mg-verdict.win  { color: var(--success-text); }
    .mg-verdict.tryagain { color: var(--text-muted); }
    .mg-foot companion-slot > * { width: 64px; flex: none; }
    .mg-err { padding: var(--space-4); color: var(--error-text); }
    @media (max-width: 600px) { .mg-foot .btn-sm { min-height: 44px; } }
    @media (prefers-reduced-motion: reduce) { .mg-card { transition: none; } }

    /* Exercise framing (a look without gamification, e.g. plain): rules, not a card. */
    :host([data-exercise]) { margin-bottom: var(--space-3); }
    :host([data-exercise]) .mg-card { border: 0; border-radius: 0; background: transparent; box-shadow: none; overflow: visible; }
    :host([data-exercise]) .mg-head { gap: var(--space-2) var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--text-main); border-bottom: 0; }
    :host([data-exercise]) .mg-label {
      font-family: var(--font-label, var(--font-body, inherit));
      font-weight: 700;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--signature, var(--primary-color));
    }
    :host([data-exercise]) .mg-goal { font-weight: var(--fw-medium, 500); flex-basis: 100%; min-width: 0; line-height: 1.45; }
    :host([data-exercise]) .mg-body { padding: var(--space-2) 0 0; }
    /* Width from a height budget: the viewport less the lesson head, footer and this block's label and verdict
       (--mg-chrome), so the Check stays above the progress bar at 1280x800 and 390x844. */
    :host([data-exercise]) .sim-host.sim-host--fluid {
      width: min(100%, calc(var(--mg-sim-w, 100vw) * 1.1), calc(clamp(280px, 100dvh - var(--mg-chrome, 380px), 760px) * var(--mg-sim-aspect, 1.5)));
    }
    /* Desktop: the lesson's real head and footer (published by LessonSession) plus this block's own
       label, gaps and verdict, so a compact head gives its height to the scene; at most 1.1x design. */
    @media (min-width: 601px) {
      :host([data-exercise]) { --mg-chrome: calc(var(--lesson-sticky-header-h, 180px) + var(--lesson-chrome-bottom, 80px) + 124px); }
      :host([data-exercise]) .mg-card:has(.mg-foot button) { --mg-chrome: calc(var(--lesson-sticky-header-h, 180px) + var(--lesson-chrome-bottom, 80px) + 176px); }
    }
    @media (max-width: 600px) { :host([data-exercise]) { --mg-chrome: 330px; } }
    :host([data-exercise]) .mg-foot { padding: var(--space-2) 0 0; border-top: 0; }
    /* No host button = a SELF_CHECKING scene that writes its own worked feedback: the host verdict stays
       for screen readers only, so the page does not grow (and scroll) by one line on a correct check. */
    :host([data-exercise]) .mg-foot:not(:has(button)) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    :host([data-exercise]) .mg-verdict { font-weight: 700; }
  `];

  constructor() {
    super();
    this._status = 'idle';
    this._attempts = 0;
    this._solved = false;
    this._error = '';
    this._ready = false;
    this._scene = null;
    this._SceneClass = null;
  }

  init(data, ctx) {
    this._data = data || {};
    this._bundleId = ctx?.bundleId ?? null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._mount();
  }

  disconnectedCallback() {
    destroyQuestionSimulation(this._scene);
    this._scene = null;
    super.disconnectedCallback();
  }

  async _mount() {
    const src = this._data?.src;
    if (!src) { this._error = 'This game has no `src`.'; return; }
    try {
      await this.updateComplete;
      const host = this.renderRoot.querySelector('.sim-host');
      const { scene, SceneClass } = await mountQuestionSimulation(host, src, this._bundleId, {
        residents: () => [this._companion],
        beside: () => this.renderRoot.querySelectorAll('.mg-foot'),
      });
      this._scene = scene;
      this._SceneClass = SceneClass;
      // Lets a scene that already gives per-answer feedback (no ambiguity
      // left to resolve with a manual Check click - see SELF_CHECKING below)
      // run the exact same evaluate()/quill-reaction/EventBus pipeline the
      // button itself uses, the moment its own UI knows the student is done,
      // rather than duplicating that logic in the scene.
      scene.requestCheck = () => this._check();
      this._ready = true;
      this._status = 'playing';
      await this.updateComplete;
      this._playIntro();
    } catch (e) {
      this._error = `Could not load this game: ${e.message}`;
    }
  }

  get _companion() {
    return this.renderRoot.querySelector('.mg-foot companion-slot')?.companion || null;
  }

  /** The game is ready: a game mounting with no acknowledgement at all reads
   *  as inert, so the look may greet (Quill: a wave and a line).
   *
   *  `sceneCompanion` says the scene mounted its own Tier-2 SimMascotDom
   *  (`.q-mascot`, a direct child of `.sim-host` — DomSimulation has no
   *  shadow root of its own to cross): such a scene already greets in its
   *  own `setup()` (see BoxCounterGame et al.). */
  _playIntro() {
    // Sent with or without a companion: a look without one may still answer.
    const companion = this._companion;
    const host = this.renderRoot.querySelector('.sim-host');
    emitCue(CUES.GAME_START, { companion, sceneCompanion: !!host?.querySelector('.q-mascot') });
  }

  _onControl = (id, value) => {
    try {
      this._scene?.onControlChange?.(id, value);
    } catch (err) {
      console.warn('[mini-game@1] control handler failed', err);
    }
    // A move invalidates the last verdict - showing "Not yet" next to a shape
    // the student has since changed reads as a verdict on the new one.
    if (this._status === 'retry' || this._status === 'not-ready') this._status = 'playing';
  };

  // The same for a move made on the board itself. A click, not a press: a verdict
  // going on the press moves the page under a finger still on its way to Check.
  // The click that ran a check (requestCheck) just wrote the verdict, and a game's
  // own check or next-round control is not a move.
  _onBoardMove = (e) => {
    if (performance.now() - this._checkedAt < 50) return;
    const path = e.composedPath();
    const inside = path.slice(0, path.indexOf(e.currentTarget));
    if (inside.some((n) => n.matches?.(GAME_FLOW_CONTROLS))) return;
    if (this._status === 'retry' || this._status === 'not-ready') this._status = 'playing';
  };

  _check = () => {
    if (!this._scene || typeof this._scene.evaluate !== 'function') return;
    this._checkedAt = performance.now();
    const r = this._scene.evaluate();
    // "Check again" on a solved game is a look, not a try.
    if (!this._solved) this._attempts = r.attempts ?? this._attempts + 1;

    const companion = this._companion;
    if (r.feedback === 'not-ready') {
      emitCue(CUES.GAME_RETRY, { companion, reason: 'not-ready' });
      this._status = 'not-ready';
      return;
    }

    if (r.solved && !this._solved) {
      this._solved = true;
      this._status = 'won';
      emitCue(CUES.GAME_SOLVED, { companion, attempts: r.attempts, score: r.score });
      // Awarding is GamificationService's job, never the plugin's: it owns the
      // sourceKey dedupe, so replaying a solved game pays out once (P4.2).
      // `src` is author-written and bundle-relative (see this plugin's own
      // schema/init() doc comments) — nothing stops two different course
      // bundles from each authoring a scene at the same relative path, so
      // `bundleId` rides along to keep the dedupe key from crossing bundles
      // (same reasoning as TestEngine.js's own bundle-scoping — see its
      // _computeResults() doc comment).
      EventBus.emit('minigame:solved', {
        src: this._data.src,
        bundleId: this._bundleId,
        xp: this._data.xp,
        score: r.score,
        attempts: r.attempts,
      });
    } else if (r.solved) {
      this._status = 'won';
    } else {
      this._status = 'retry';
      this._hint = typeof r.feedback === 'string' && r.feedback !== 'retry' ? r.feedback : '';
      emitCue(CUES.GAME_RETRY, { companion, reason: 'retry' });
    }
  };

  // Feature-detected by LessonEngine.hasUnansweredQuestion() — implementing it
  // is what makes the Next/ArrowRight/swipe skip-confirm funnel in
  // LessonSession._handleNext() gate an unsolved game the same way it already
  // gates an unanswered question.
  isAnswered() {
    return this._solved;
  }

  _verdict(exercise = false) {
    if (exercise) {
      switch (this._status) {
        case 'won':       return ['win', 'Correct.'];
        case 'retry':     return ['tryagain', this._hint || 'Not yet. Adjust it and check again.'];
        case 'not-ready': return ['tryagain', 'Make a change first, then check.'];
        default:          return ['tryagain', ''];
      }
    }
    switch (this._status) {
      case 'won':       return ['win', `Solved it in ${this._attempts} ${this._attempts === 1 ? 'try' : 'tries'}.`];
      case 'retry':     return ['tryagain', this._hint || 'Not yet. Adjust it and check again.'];
      case 'not-ready': return ['tryagain', 'Have a go at it first, then check.'];
      default:          return ['tryagain', ''];
    }
  }

  /** W/H of the mounted scene's own design size, for --mg-sim-aspect (see
   *  .sim-host--fluid above) - falls back to the common 900x600 ratio when a
   *  scene hasn't declared one (or hasn't mounted yet). */
  _simAspect() {
    const w = this._SceneClass?.WIDTH;
    const h = this._SceneClass?.HEIGHT;
    return w && h ? w / h : 1.5;
  }

  /** Set as one property, never through a style= binding: the mounted scene keeps its
   *  --look-* properties on this same element, and Lit rewrites the whole attribute. */
  updated() {
    const host = this.renderRoot?.querySelector('.sim-host');
    host?.style.setProperty('--mg-sim-aspect', String(this._simAspect()));
    if (this._SceneClass?.WIDTH) host?.style.setProperty('--mg-sim-w', `${this._SceneClass.WIDTH}px`);
  }

  _goalText() {
    const authored = this._data?.objective;
    if (typeof authored === 'string') return authored;
    if (authored?.en) return authored.en;
    const declared = this._SceneClass?.OBJECTIVE?.prompt;
    if (typeof declared === 'string') return declared;
    if (declared?.en) return declared.en;
    return this._isExercise() ? 'Complete the exercise.' : 'Solve the challenge.';
  }

  /** An exercise, not a game: the active look's own registry entry turns gamification off (plain). */
  _isExercise() {
    return LookManager.getLookSpec()?.gamification === false;
  }

  willUpdate(changed) {
    super.willUpdate?.(changed);
    this.toggleAttribute('data-exercise', this._isExercise());
  }

  render() {
    if (this._error) return html`<div class="mg-card"><div class="mg-err">${this._error}</div></div>`;
    const exercise = this._isExercise();
    const [cls, text] = this._verdict(exercise);
    return html`
      <div class="mg-card">
        <div class="mg-head">
          ${exercise ? html`<span class="mg-label">Exercise</span>` : html`<span class="mg-badge">Challenge</span>`}
          <span class="mg-goal">${this._goalText()}</span>
        </div>
        <div class="mg-body">
          <div class="sim-host ${this._scene instanceof DomSimulation ? 'sim-host--fluid' : ''}" @click=${this._onBoardMove}></div>
          ${this._ready
            ? renderSimControls(this._SceneClass, this._scene, this._onControl, () => this.requestUpdate())
            : ''}
        </div>
        <div class="mg-foot">
          <companion-slot size="mini" expression="happy"></companion-slot>
          <span class="mg-verdict ${cls}" role="status">${text}</span>
          ${this._SceneClass?.SELF_CHECKING ? '' : html`
            <button class="btn-3d ${this._solved ? 'btn-secondary' : 'btn-primary'} btn-sm"
                    ?disabled=${!this._ready}
                    @click=${this._check}>
              ${this._solved ? 'Check again' : exercise ? 'Check' : 'Check my answer'}
            </button>
          `}
        </div>
      </div>
    `;
  }
}

customElements.define('mini-game-v1', MiniGamePlugin);
