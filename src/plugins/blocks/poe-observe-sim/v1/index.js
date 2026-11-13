import '../../../../ui/components/MediaWait.js';
import { LitElement, html, css } from 'lit';
import { EventBus } from '../../../../core/EventBus.js';
import { SimulationLoader } from '../../../../core/SimulationLoader.js';
import { answerStageQueries } from '../../../../core/components/stageAnswer.js';

/**
 * <poe-observe-sim-v1> — Lit shell for the POE "Observe" phase simulation.
 *
 * Responsibility: render the card chrome, mount the scene into a stable DOM
 * node (never replaced by Lit), and unlock it once the student has made a
 * prediction on the immediately preceding poe-predict@1 block.
 *
 * Unlock is decided in firstUpdated() via `ctx.poe.recall(ctx.blockIndex)`
 * (see init()'s doc comment) — synchronous and reliable regardless of mount
 * order. The `poe:prediction-submitted` EventBus listener below is kept as
 * a same-page-lifetime fallback for a caller that mounts this block without
 * going through LessonEngine's ctx at all; it cannot be the primary
 * mechanism because EventBus has no replay, so a prediction submitted
 * before this block existed is otherwise lost.
 *
 * All physics knowledge lives in the scene module itself (see `src`).
 */
export class PoeObserveSimPlugin extends LitElement {
  static properties = {
    _data:              { type: Object,  state: true },
    _bundleId:          { type: String,  state: true },
    _unlocked:          { type: Boolean, state: true },
    _studentPrediction: { type: String,  state: true },
    _simFailed:         { type: Boolean, state: true },
  };

  static styles = css`
    :host {
      display: block;
      /* Mounted directly by LessonEngine at the top level (no content-block@1
         parent to size it) — #block-container itself has no max-width (see
         LessonSession.js's .content-area), so without this a wide viewport
         stretches the canvas to match, and its intrinsic aspect ratio then
         inflates card height well past the viewport, pushing the controls
         below the fold. 820px matches content-block@1's own simulation cap
         (.cb-layout-above/.cb-layout-below .cb-sim-wrap in content-block.js). */
      max-width: 820px;
      margin: 0 auto 24px;
      font-family: var(--font-family, system-ui, sans-serif);
    }
    .card {
      background: var(--shell-bg, #0d1b2a);
      border: 1.5px solid var(--border-color, #1e3a5f);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      background: var(--bg-surface, #112240);
      border-bottom: 1px solid var(--border-color, #1e3a5f);
    }
    .header-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--error-text, #ff5f57);
      box-shadow: 0 0 6px var(--error-text, #ff5f57);
    }
    .header-dot.ready {
      background: var(--success-text, #10b981);
      box-shadow: 0 0 6px var(--success-text, #10b981);
    }
    .header-title {
      font-weight: var(--fw-strong); font-size: 0.9rem;
      letter-spacing: 0.5px; text-transform: uppercase;
      color: var(--text-main, #e2e8f0);
    }
    .badge {
      margin-left: auto; font-size: 0.75rem; font-weight: var(--fw-medium);
      padding: 3px 10px; border-radius: 20px;
      background: var(--primary-light, #1e3a5f);
      color: var(--primary-text, #93c5fd);
      letter-spacing: 0.5px;
    }
    .badge.live {
      background: var(--success-bg, #064e3b);
      color: var(--success-text, #6ee7b7);
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }

    .instructions {
      padding: 10px 18px; font-size: 0.85rem;
      color: var(--text-muted, #64748b);
      background: var(--shell-bg, #0d1b2a);
    }
    .locked-notice {
      display: flex; align-items: flex-start; gap: 10px;
      margin: 0 18px 14px; padding: 10px 14px;
      background: var(--warn-bg);
      border: 1px solid var(--warn-text);
      border-radius: 8px;
      font-size: 0.85rem;
      color: var(--warn-text);
    }
    .locked-notice .icon { flex: none; font-size: 1rem; line-height: 1.3; }
    /* STABLE container — Lit must never replace this div's children */
    .sim-wrap {
      position: relative; width: 100%;
      background: var(--shell-bg, #0d1b2a); line-height: 0;
    }
    /* width/height both auto (not width:100%) so the browser picks the
       largest size satisfying BOTH max-width and max-height while keeping
       the canvas's own intrinsic aspect ratio — same clamp-to-viewport
       technique blockImageLayout.js uses for a standalone image
       (.cb-image-wrap.cb-image-capped img: max-height: min(48vh, 420px)).
       Without a max-height, "width:100%; height:auto" alone still lets a
       wide viewport inflate the canvas (and therefore the whole card) taller
       than the viewport itself. */
    .sim-wrap canvas {
      width: auto;
      max-width: 100%;
      height: auto;
      max-height: var(--obs-scene-max-h);
      display: block;
      margin: 0 auto;
    }
    /* Q-60: the scene's height budget. Was min(50vh, 460px), which left the
       card running under the action bar at 1280x720: now the viewport below
       the sticky head and above the bar, less the card's own chrome
       (--obs-chrome, measured in _measureChrome()), so the whole card fits
       once scrolled to; never above 460 px or below 200 px. A phone has no
       height cap: the scene takes the full column and the page scrolls, as
       content-block scenes do since Q-57. */
    :host {
      --obs-scene-max-h: min(460px, max(200px, 100vh - var(--lesson-sticky-header-h, 0px) - var(--lesson-chrome-bottom, 0px) - var(--obs-chrome, 50vh)));
    }
    @media (max-width: 600px) {
      :host { --obs-scene-max-h: none; }
      .sim-wrap canvas { width: 100%; }
    }

    /* DomSimulation scenes (src/simulations/base/DomSimulation.js) build real
       text nodes inside .sim-dom-root — the line-height:0 above (which
       collapses whitespace around a <canvas>) collapses DOM text just as
       badly, so it's restored here, scoped to that one class. Also caps the
       scaling wrapper's own height the same way the canvas rule above caps
       the canvas, since DomSimulation's own aspect-ratio-based width:100%
       sizing has no independent viewport clamp of its own. */
    .sim-wrap .sim-dom-root {
      line-height: normal;
    }
    .sim-wrap .sim-dom-scale-wrap {
      /* Cap the WIDTH from the height budget (DomSimulation publishes the
         design aspect as --sim-aspect) so the scene scales down to fit. A
         max-height here cropped it instead: the scene is scaled by width. */
      max-width: min(100%, calc(var(--obs-scene-max-h) * var(--sim-aspect, 1000)));
      margin: 0 auto;
    }
    @media (max-width: 600px) {
      .sim-wrap .sim-dom-scale-wrap { max-width: 100%; }
    }

    .recap {
      margin: 14px 18px; padding: 12px 14px;
      background: var(--bg-surface, #112240);
      border: 1px solid var(--border-color, #1e3a5f);
      border-radius: 8px; font-size: 0.9rem;
      color: var(--text-muted, #94a3b8);
      animation: fadeIn 0.4s ease;
    }
    .recap strong { color: var(--text-main, #e2e8f0); }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: none; }
    }
  `;

  constructor() {
    super();
    this._data              = null;
    this._bundleId          = null;
    this._unlocked          = false;
    this._studentPrediction = '';
    this._scene             = null;
    this._ctx               = null;
    this._handlePrediction  = this._handlePrediction.bind(this);
  }

  /**
   * Plugin lifecycle. `ctx.poe`/`ctx.blockIndex` (see LessonEngine.js's
   * `_render()`) let this recall a prediction made by the immediately
   * preceding `poe-predict@1` block synchronously, the same
   * `POEController.recall()` mechanism `content-block.js`'s `poeRole` recap
   * uses — required here because the `poe:prediction-submitted` EventBus
   * listener below can only catch a prediction submitted *after* this block
   * has already mounted, and LessonEngine mounts one block at a time
   * (`container.innerHTML = ''` between them, see `_render()`), so in the
   * normal predict→observe-sim POE sequence the event has already fired and
   * gone by the time this block's `connectedCallback()` starts listening.
   */
  init(data, ctx) { this._data = data; this._ctx = ctx || null; this._bundleId = ctx?.bundleId ?? null; }

  connectedCallback() {
    super.connectedCallback();
    EventBus.on('poe:prediction-submitted', this._handlePrediction);
    this._stopStageAnswers = answerStageQueries({ stage: () => this.shadowRoot?.getElementById('sim-canvas-host') });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._chromeRO?.disconnect();
    this._chromeRO = null;
    EventBus.off('poe:prediction-submitted', this._handlePrediction);
    this._stopStageAnswers?.();
    if (this._scene) this._scene.destroy();
  }

  _handlePrediction(payload) {
    this._studentPrediction = payload.predictionText || payload.prediction;
    this._unlocked = true;
    if (this._scene) {
      this._scene.allowResume = true;
      this._scene.resume();
    }
  }

  /** Q-60: --obs-chrome = the card's height that is not the scene (head,
   *  instructions, controls, recap) + the sticky gap and some air. It does
   *  not depend on the scene's size, so resizing the scene cannot loop. */
  _measureChrome() {
    const card = this.shadowRoot?.querySelector('.card');
    const wrap = this.shadowRoot?.querySelector('.sim-wrap');
    if (!card || !wrap) return;
    const next = Math.round(card.offsetHeight - wrap.offsetHeight + 24);
    if (Math.abs(next - (this._chrome || 0)) < 3) return;
    this._chrome = next;
    this.style.setProperty('--obs-chrome', `${next}px`);
  }

  async firstUpdated() {
    const card = this.shadowRoot.querySelector('.card');
    if (card && typeof ResizeObserver !== 'undefined') {
      this._chromeRO = new ResizeObserver(() => this._measureChrome());
      this._chromeRO.observe(card);
    }
    const host = this.shadowRoot.getElementById('sim-canvas-host');
    if (!host) return;

    // Recall a prediction made by the immediately preceding poe-predict@1
    // block synchronously — see init()'s doc comment for why the EventBus
    // listener alone can never catch it in the normal POE sequence.
    const recalled = this._ctx?.poe?.recall(this._ctx?.blockIndex);
    if (recalled) {
      this._unlocked = true;
      this._studentPrediction = recalled.predictionText || recalled.prediction;
    }

    try {
      const src = this._data?.src || '/src/simulations/physics/CatapultScene.js';
      const module = await SimulationLoader.loadModule(src, this._bundleId);
      this._sceneClass = SimulationLoader.resolveSceneClass(module);
      await SimulationLoader.markHost(host, this._bundleId);
      
      this._scene = new this._sceneClass(host);
      this._scene.allowResume = this._unlocked;
      await this._scene.setup();
      
      if (this._unlocked) {
        if (typeof this._scene.start === 'function') this._scene.start();
        if (typeof this._scene.resume === 'function') this._scene.resume();
      } else {
        if (this._scene.renderFrame) this._scene.renderFrame();
        if (this._scene._drawLabels) this._scene._drawLabels();
      }
      this.requestUpdate();
    } catch (err) {
      console.error('Failed to load simulation', err);
      // Q-100b: <media-wait> below says why (offline / did not load).
      host.replaceChildren();
      this._simFailed = true;
    }
  }

  _renderControls() {
    if (!this._sceneClass || !this._sceneClass.CONTROLS || !this._unlocked) return html``;
    
    const renderedItems = this._sceneClass.CONTROLS.map(ctrl => {
      if (ctrl.type === 'button') {
        const isActive = this._scene?.mode === ctrl.id;
        const isDisabled = typeof this._scene?.isControlDisabled === 'function' ? this._scene.isControlDisabled(ctrl.id) : false;
        
        const bg = (isActive && ctrl.activeBg) ? ctrl.activeBg : (ctrl.inactiveBg && !isActive ? ctrl.inactiveBg : 'var(--primary-color, #3b82f6)');
        const color = (ctrl.inactiveBg && !isActive) ? '#94a3b8' : 'white';
        const fw = isActive ? '700' : '500';
        const cursor = isDisabled ? 'not-allowed' : 'pointer';
        const opacity = isDisabled ? '0.4' : '1';
        
        return html`
          <button style="padding: 6px 14px; background: ${bg}; color: ${color}; border: none; border-radius: 6px; cursor: ${cursor}; opacity: ${opacity}; font-family: inherit; font-size: 0.85rem; font-weight: ${fw}; height: 34px; display: inline-flex; align-items: center; transition: all 0.2s ease;" 
                  ?disabled="${isDisabled}"
                  @click="${() => {
                    if (isDisabled) return;
                    this._scene?.onControlChange(ctrl.id, true);
                    this.requestUpdate();
                  }}">
            ${ctrl.label || 'Action'}
          </button>
        `;
      }
      return html``;
    });

    return html`
      <div class="cb-sim-controls" style="width: 100%; padding: 12px 18px; box-sizing: border-box; background: var(--bg-surface, #112240); display: flex; flex-direction: row; gap: 16px; align-items: center; flex-wrap: wrap; border-top: 1px solid var(--border-color, #1e3a5f);">
        ${renderedItems}
      </div>
    `;
  }

  render() {
    if (!this._data) return html``;
    return html`
      <div class="card">
        <div class="header">
          <div class="header-dot ${this._unlocked ? 'ready' : ''}"></div>
          <span class="header-title">Simulation</span>
          <span class="badge ${this._unlocked ? 'live' : ''}">
            ${this._unlocked ? 'LIVE' : 'PAUSED'}
          </span>
        </div>

        <div class="instructions">${this._data.instructions}</div>

        ${!this._unlocked ? html`
          <div class="locked-notice">
            <span class="icon">⏸</span>
            <span>This simulation is paused because no prediction was recorded on the
              previous slide. Go back and choose one of the options there to unlock it.</span>
          </div>
        ` : ''}

        <!-- STABLE container — Lit never replaces this div's children -->
        <div class="sim-wrap">
          <div id="sim-canvas-host"></div>
          ${this._simFailed
            ? html`<media-wait kind="simulation" state="missing"></media-wait>`
            : html`<media-wait kind="simulation" follow></media-wait>`}
        </div>
        ${this._renderControls()}

        ${this._unlocked ? html`
          <div class="recap">
            <strong>Your prediction:</strong> ${this._studentPrediction}
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('poe-observe-sim-v1', PoeObserveSimPlugin);
