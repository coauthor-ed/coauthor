import { html, nothing } from 'lit';
import { EventBus } from '../../EventBus.js';
import { SimViewPrefs, SIM_VIEW_OPTIONS } from '../../SimViewPrefs.js';
import { A11yAnnouncer } from '../../A11yAnnouncer.js';
import { DioramaCamera } from './DioramaCamera.js';
import { brandCopy, loadBrandPieces } from '../../../ui/components/LookSlots.js';
import {
  fitAspect, splitLimits, autoSplit, clampSplit, searchNarrowest, placeControls, sideWidth,
  clampToArea, cornerPos, nearestCorner, cornerAwayFrom,
} from './theatreLayout.js';

// The look's stagehand (if it has one) is defined before a theatre renders.
await loadBrandPieces('stagehand');

/**
 * The Story diorama theatre: how a Story simulation slide shares the screen
 * between Quill's story and the live scene (docs/sprints/wip/diorama-theatre.md;
 * prototype tests/diorama-lab.html, preset "Everything").
 *
 * A Lit ReactiveController owned by content-block. content-block keeps
 * rendering what it always rendered (the narrator via _renderSteps(), the
 * scene host, the CONTROLS bar); this controller arranges them:
 *
 * - Split: story and scene docked side by side (wide box) or stacked (tall
 *   box), with a draggable divider. "Auto (follows each beat)" re-fits the
 *   split to each beat's text; a drag overrides it for that beat only.
 * - Either window can float instead (dragged, resized, snapped to corners,
 *   dropped back on its dock zone); only one floats at a time.
 * - Full view: the whole theatre goes full screen (native Fullscreen API
 *   where allowed, else an in-page top-layer overlay), scene first, the story
 *   as a strip with its own Previous/Next.
 * - Camera (DioramaCamera): follows each beat's authored focus and lets the
 *   learner zoom and pan; every beat starts from the author's framing again.
 *
 * Everything the learner chooses lives in SimViewPrefs (per profile); window
 * positions live for the session only (module scope below), so the next
 * slide opens its windows where the learner left them.
 *
 * Sizes are written as inline styles/custom properties straight onto the
 * rendered elements (never through the Lit template), so a layout pass never
 * triggers a re-render and the two cannot loop.
 */

const FLOAT_POS = { scene: {}, story: {} }; // per orientation: { corner } | { x, y }
let rotateDismissed = false;

// Options with no meaning in Classic's plain theatre (no floating windows, no Quill).
const PLAIN_SKIP = new Set(['snap', 'moves']);


const I = {
  options: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  sliders: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>`,
  expand: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  close: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  minus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M6 12h12"/></svg>`,
  plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>`,
  restore: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6" width="14" height="12" rx="2"/></svg>`,
  undock: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
  dock: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4l-8 8M12 6v6h6"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
  hand: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v6M8 12V9.5a1.5 1.5 0 0 0-3 0V14a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-3"/></svg>`,
  target: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  rotate: html`<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/></svg>`,
  prev: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  next: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  grip: html`<svg class="th-grip" width="12" height="16" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.8"/><circle cx="10" cy="4" r="1.8"/><circle cx="4" cy="9" r="1.8"/><circle cx="10" cy="9" r="1.8"/><circle cx="4" cy="14" r="1.8"/><circle cx="10" cy="14" r="1.8"/></svg>`,
  resize: html`<svg viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 24l12-12M18 25l7-7M24 26l2-2"/></svg>`,
};

export class StoryTheatre {
  constructor(host) {
    this.host = host;
    host.addController(this);
    this.prefs = SimViewPrefs.get();
    this.isMax = false;
    if (this.plain) this._beatUntil = performance.now() + 900;
    this.maxPath = '';
    this.orient = 'tall';
    this.narrow = false;
    this.optsOpen = false;
    this.sceneMini = false;
    this.storyMini = false;
    this.stageWidth = null;
    // Classic's plain theatre (set by content-block each render): split,
    // divider, full view and the controls tray only; no floating windows and
    // no Quill, moves are instant.
    this.plain = false;
    // Narrated mode (set by content-block): the story pane is hidden and the
    // scene takes the whole theatre, leaving a band below it for captions.
    this.narrated = false;
    // The plain look's editorial page (set by content-block each render): a
    // wide docked theatre puts the strip's buttons in a rail beside the scene
    // (_railed), so the scene gets the strip's height back.
    this.editorial = false;
    this._hasTitle = false;
    this._maxSceneW = Infinity;
    this._rule = 3;           // .th-stage border width (theatreStyles --th-rule), measured each layout
    // The scene's CONTROLS bar: below the scene, in a column beside it, or in
    // a tray opened from the green strip (pref "Scene controls"; auto = the
    // tray only when keeping the bar in sight would shrink the scene).
    this.hasControls = false;
    this.ctrlPlace = 'below'; // 'below' | 'side' | 'tray'
    this._cw = 0;             // side column width
    this._placeKey = '';
    this._placeFlips = 0;
    this._probeCache = new Map();
    this._fitsAtTop = false;  // theatre sized to the screen below the lesson title (no scroll needed)
    // Quill's shows (QuillStagehand.js): what is running, and a split haul
    // armed by a beat change for the next layout pass.
    this._showing = '';
    this._splitShow = false;
    this.ctrlOpen = false;
    // Controls the learner has not opened yet (they just appeared, or the
    // beat changed which ones show): the strip's button is highlighted until
    // the tray is opened.
    this.ctrlNew = false;
    this._ctrlSig = '';
    this._manualBeat = -1;
    this._lastStep = -1;
    this._aspect = 900 / 560;
    this._live = {}; // sizes being dragged right now (not yet saved)
    this._layoutRAF = 0;
    this.camState = null;
    this.camera = new DioramaCamera({
      onChange: (s) => { this.camState = s; this.host.requestUpdate(); },
    });
    this._onPrefs = ({ prefs }) => {
      this.prefs = prefs;
      this.camera.setEnabled(prefs.zoom === 'on');
      this.camera.setFollow(prefs.follow === 'on');
      this.host.requestUpdate();
    };
    this._onFs = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsEl && this.isMax && this.maxPath === 'native') this.closeMax();
    };
    this._onDocDown = (e) => {
      if (!this.optsOpen) return;
      const path = e.composedPath();
      if (path.some((n) => n?.classList?.contains?.('th-opts') || n?.dataset?.thOpts === '1')) return;
      this.optsOpen = false;
      this.host.requestUpdate();
    };
    this._ro = new ResizeObserver(() => this.scheduleLayout());
    this._onResize = () => this.scheduleLayout(); // a height-only resize changes no observed box
    // Content above the theatre (the lesson title, wrapping once web fonts
    // load) moves it without resizing it: re-check its height (cheap; a
    // change re-lays out through the ResizeObserver).
    this._onMoved = () => { const root = this._root(); if (root) this._fitHeight(root); };
    this._observed = new Set();
  }

  // ── lifecycle ─────────────────────────────────────────────────────────

  hostConnected() {
    this.prefs = SimViewPrefs.get();
    this.camera.setEnabled(this.prefs.zoom === 'on');
    this.camera.setFollow(this.prefs.follow === 'on');
    EventBus.on('sim-view:changed', this._onPrefs);
    document.addEventListener('fullscreenchange', this._onFs);
    document.addEventListener('webkitfullscreenchange', this._onFs);
    document.addEventListener('pointerdown', this._onDocDown, true);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('scroll', this._onMoved, { passive: true });
    document.fonts?.addEventListener?.('loadingdone', this._onMoved);
    document.fonts?.ready?.then(this._onMoved);
  }

  hostDisconnected() {
    EventBus.off('sim-view:changed', this._onPrefs);
    document.removeEventListener('fullscreenchange', this._onFs);
    document.removeEventListener('webkitfullscreenchange', this._onFs);
    document.removeEventListener('pointerdown', this._onDocDown, true);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onMoved);
    document.fonts?.removeEventListener?.('loadingdone', this._onMoved);
    if (this.isMax) this.closeMax();
    this.camera.detach();
    this._ro.disconnect();
    this._observed.clear();
    cancelAnimationFrame(this._layoutRAF);
  }

  /** True when this slide should render as a theatre (split layout, or full view from either layout). */
  wants() {
    return this.prefs.layout === 'split' || this.isMax;
  }

  /** Which window floats right now (none in full view). */
  get float() {
    return this.isMax || this.plain ? 'none' : this.prefs.float;
  }

  get ctrlTray() {
    return this.ctrlPlace === 'tray';
  }

  /** The strip as a rail beside the scene: the plain look's wide, docked,
   *  untitled theatre. Height is what limits a scene there; width is spare. */
  _railed() {
    return this.editorial && this.orient === 'wide' && !this.narrow && !this.isMax && this.float === 'none' && !this._hasTitle;
  }

  /** The rail's width (theatreStyles --th-rail), 0 when not railed. */
  _railW(root) {
    if (!this._railed() || !root) return 0;
    return parseFloat(getComputedStyle(root).getPropertyValue('--th-rail')) || 0;
  }

  _root() {
    return this.host.shadowRoot?.querySelector('.th') || null;
  }

  /**
   * While full view owns the screen: a function that places an overlay inside
   * the theatre, the only subtree native fullscreen and the popover paint.
   * Else null. Handed out through cue:stage-query (content-block), so the
   * overlay's owner never reaches in here for the fullscreen element itself.
   */
  fullViewRoom() {
    const root = this.isMax ? this._root() : null;
    return root ? (el) => { root.appendChild(el); } : null;
  }

  _size(key) {
    return this._live[key] ?? this.prefs.sizes[key];
  }

  // ── rendering ─────────────────────────────────────────────────────────

  /**
   * @param {object} o
   * @param {import('lit').TemplateResult} o.narration  content-block's story narrator
   * @param {string} o.title       the simulation's title (may be '')
   * @param {*} o.controls         the scene's CONTROLS bar template (or '')
   * @param {number} o.aspect      the scene's design aspect (w / h)
   * @param {number} o.step, o.steps
   * @param {*} [o.caption]        a line under the scene (the plain look's
   *   numbered figure caption), or '' for none
   * @param {number} [o.maxSceneW]  widest the docked scene may render (px), 0 = no cap
   */
  render({ narration, title, controls, aspect, step, steps, frameStyle, caption = '', maxSceneW = 0 }) {
    if (aspect > 0) this._aspect = aspect;
    this._maxSceneW = maxSceneW > 0 ? maxSceneW : Infinity;
    this._hasTitle = !!title;
    this.frameStyle = frameStyle || '';   // 'cabinet': an arcade game's frame (theatreStyles .th.cabinet)
    this.hasControls = !!controls;
    const tray = this.ctrlTray && this.hasControls;
    const side = this.ctrlPlace === 'side' && this.hasControls;
    const f = this.float;
    const auto = this.prefs.autofit === 'on' && this._manualBeat !== step;
    const cls = [
      'th', `orient-${this.orient}`, `float-${f}`, this.plain ? 'plain' : '',
      this.isMax ? 'max' : '', this.narrow ? 'narrow' : '', auto ? 'auto' : '', this.frameStyle === 'cabinet' ? 'cabinet' : '',
      this._railed() ? 'rail' : '',
    ].filter(Boolean).join(' ');
    const popover = this.isMax && this.maxPath === 'popover' ? 'manual' : nothing;
    const last = step >= steps - 1;
    const narrator = brandCopy('narrator');
    return html`
      <div class=${cls} popover=${popover} tabindex="-1" @keydown=${(e) => this._onKey(e)}>
        <section class="th-narr ${f === 'story' ? 'floating' : ''} ${f === 'story' && this.storyMini ? 'mini' : ''}"
                 aria-label=${this.plain ? 'Text' : 'Story'}
                 @transitionend=${(e) => this._onSplitSettled(e)} @transitioncancel=${(e) => this._onSplitSettled(e)}>
          <div class="th-story-head" @pointerdown=${(e) => this._startMove(e, 'story')}>
            ${I.grip}
            <span class="th-ttl">${narrator ? html`${narrator} &middot; ` : ''}beat ${step + 1} / ${steps}</span>
            ${f === 'story' ? html`
              ${this._hb(this.storyMini ? 'Open the story card' : 'Shrink the story card', this.storyMini ? I.restore : I.minus, () => { this.storyMini = !this.storyMini; this.host.requestUpdate(); })}
              ${this._hb('Dock the story', I.dock, () => this.setFloat('none'))}
            ` : ''}
          </div>
          ${!this.isMax && !this.plain && f !== 'story'
            ? html`<button class="th-pop th-hb" title="Float the story over the scene" aria-label="Float the story over the scene" @click=${() => this.setFloat('story')}>${I.undock}</button>`
            : ''}
          <div class="th-narr-in">${narration}</div>
          <div class="th-nav">
            <span class="th-count">Beat ${step + 1} / ${steps}</span>
            <button aria-label="Previous beat" ?disabled=${step === 0} @click=${() => EventBus.emit('lesson:header-action', { action: 'prev' })}>${I.prev}</button>
            ${last
              ? html`<button class="next done" aria-label="Close full view" @click=${() => this.closeMax()}>Done</button>`
              : html`<button class="next" aria-label="Next beat" @click=${() => EventBus.emit('lesson:header-action', { action: 'next' })}>${I.next}</button>`}
          </div>
          ${f === 'story' ? html`<div class="th-rsz" aria-hidden="true" @pointerdown=${(e) => this._startResize(e, 'story')}>${I.resize}</div>` : ''}
        </section>
        <div class="th-div" role="separator" tabindex="0"
             aria-orientation=${this.orient === 'tall' ? 'horizontal' : 'vertical'}
             aria-label="Drag, or use the arrow keys, to share the screen between the story and the scene. Double-click to reset."
             title="Drag to resize. Double-click to reset."
             @pointerdown=${(e) => this._startSplit(e)}
             @dblclick=${() => this._resetSplit()}
             @keydown=${(e) => this._onSplitKey(e)}><i></i></div>
        <div class="th-slot">
          <div class="th-win ${f === 'scene' ? 'floating' : ''} ${f === 'scene' && this.sceneMini ? 'mini' : ''} ${side ? 'ctrl-side' : ''}">
            <div class="cb-stage-head" @pointerdown=${(e) => this._startMove(e, 'scene')}>
              ${I.grip}
              ${this.plain ? '' : html`<span class="cb-stage-kicker">Diorama &middot; live</span>`}
              <span class="th-ttl">${title || ''}</span>
              ${this.renderHeadButtons({ step })}
            </div>
            <div class="th-stage">
              <div class="th-cam"><div class="th-cam-in">
                <div class="sim-host-container"><div id="sim-canvas-host"></div></div>
              </div></div>
              ${this._renderChip()}
            </div>
            ${controls ? html`
              <div class="th-ctrls ${tray ? 'tray' : ''} ${side ? 'side' : ''} ${tray && this.ctrlOpen ? 'open' : ''}"
                   role=${tray ? 'dialog' : nothing} aria-label=${tray ? 'Scene controls' : nothing}
                   aria-hidden=${tray && !this.ctrlOpen ? 'true' : nothing}
                   @touchend=${(e) => { if (tray) e.stopPropagation(); }}>
                ${tray ? html`<div class="th-ctrls-head">
                  <b>Scene controls</b>
                  <button aria-label="Close scene controls" @click=${() => this.toggleControls(false)}>${I.close}</button>
                </div>` : ''}
                ${controls}
              </div>` : ''}
            ${caption && !this.isMax ? html`<p class="th-cap">${caption}</p>` : ''}
            ${f === 'scene' ? html`<div class="th-rsz" aria-hidden="true" @pointerdown=${(e) => this._startResize(e, 'scene')}>${I.resize}</div>` : ''}
          </div>
        </div>
        <div class="th-zone" hidden>Drop here to dock</div>
        ${this.optsOpen ? this.renderOptions() : ''}
        ${this.plain ? '' : html`<companion-slot kind="stagehand"></companion-slot>`}
      </div>
    `;
  }

  _hb(label, icon, onClick, { pressed, disabled, cls = '', opts = false } = {}) {
    return html`<button class="th-hb ${cls}" title=${label} aria-label=${label}
      aria-pressed=${pressed === undefined ? nothing : String(!!pressed)}
      aria-expanded=${opts ? String(this.optsOpen) : nothing}
      data-th-opts=${opts ? '1' : nothing}
      ?disabled=${!!disabled} @click=${onClick}>${icon}</button>`;
  }

  /**
   * The green strip's buttons. Also used by content-block's scrolling-page
   * layout (inTheatre false): there only Options and Full view apply.
   */
  renderHeadButtons({ inTheatre = true } = {}) {
    const p = this.prefs;
    const cam = this.camState || this.camera.state;
    const out = [];
    if (inTheatre && p.zoom === 'on') {
      out.push(this._hb('Zoom out (-)', I.minus, () => this.camera.zoomBy(1 / 1.5), { disabled: !cam.zoomed, cls: 'zoom' }));
      out.push(this._hb('Zoom in (+)', I.plus, () => this.camera.zoomBy(1.5), { cls: 'zoom' }));
      if (cam.zoomed) out.push(this._hb(cam.panMode ? 'Stop moving the view' : 'Move the view (drag)', I.hand, () => this.camera.togglePanMode(), { pressed: cam.panMode }));
    }
    if (inTheatre && cam.hasFocus && cam.mode !== 'beat') {
      out.push(this._hb('Back to the part this beat is about', I.target, () => this.camera.backToBeat()));
    }
    if (out.length) out.push(html`<span class="th-sep" aria-hidden="true"></span>`);
    if (inTheatre && this.ctrlTray && this.hasControls) {
      const fresh = this.ctrlNew && !this.ctrlOpen;
      out.push(this._hb(this.ctrlOpen ? 'Hide the scene controls' : fresh ? 'Scene controls (new: try them)' : 'Scene controls', I.sliders, () => this.toggleControls(), { pressed: this.ctrlOpen, cls: `ctrl${fresh ? ' new' : ''}` }));
    }
    out.push(this._hb('Viewing options', I.options, () => { this.optsOpen = !this.optsOpen; if (this.optsOpen) this.ctrlOpen = false; this.host.requestUpdate(); }, { opts: true }));
    if (inTheatre && !this.isMax && !this.plain) {
      const f = this.float;
      if (f === 'scene') {
        out.push(this._hb(this.sceneMini ? 'Open the scene window' : 'Shrink the scene window', this.sceneMini ? I.restore : I.minus, () => { this.sceneMini = !this.sceneMini; this.host.requestUpdate(); }));
        out.push(this._hb('Dock the scene', I.dock, () => this.setFloat('none')));
      } else {
        out.push(this._hb('Float the scene over the story', I.undock, () => this.setFloat('scene')));
      }
    }
    if (!this.isMax && p.rotateHint === 'on' && !rotateDismissed && this._portraitPhone()) {
      out.push(html`<button class="th-hb txt rotate" title="Full view, sideways" aria-label="Full view, sideways" @click=${() => { rotateDismissed = true; this.openMax(); }}>${I.rotate}<span class="lbl">Rotate</span></button>`);
    }
    out.push(this.isMax
      ? this._hb('Close full view (F or Esc)', I.close, () => this.closeMax())
      : this._hb('Full view (F)', I.expand, () => this.openMax()));
    return out;
  }

  _renderChip() {
    const cam = this.camState || this.camera.state;
    if (!cam.zoomed) return '';
    const label = cam.mode === 'beat' ? `Looking at ${cam.label || 'this part'}` : 'Zoomed in';
    return html`<div class="th-chip" role="status">
      <span>${label}</span>
      ${cam.mode === 'user' && cam.hasFocus ? html`<button @click=${() => this.camera.backToBeat()}>Back to the beat</button>` : ''}
      <button @click=${() => this.camera.seeAll()}>See all</button>
    </div>`;
  }

  renderOptions() {
    const p = this.prefs;
    return html`
      <div class="th-opts" role="dialog" aria-label="Viewing options">
        <div class="th-opts-head">
          <b>Viewing options</b>
          <button aria-label="Close viewing options" @click=${() => { this.optsOpen = false; this.host.requestUpdate(); }}>${I.close}</button>
        </div>
        ${SIM_VIEW_OPTIONS.filter((o) => (!this.plain || !PLAIN_SKIP.has(o.key)) && (o.key !== 'moves' || this._stagehand())).map((o) => html`
          <div class="th-opt">
            <span>${o.label}</span>
            <div class="th-seg" role="group" aria-label=${o.label}>
              ${o.choices.map(([v, l]) => [v, o.key === 'moves' && v === 'quill' ? brandCopy('stagehandMoves', l) : l]).map(([v, l]) => html`<button aria-pressed=${String(p[o.key] === v)} @click=${() => this._setPref(o.key, v)}>${l}</button>`)}
            </div>
          </div>`)}
        <button class="th-reset" @click=${() => { this._manualBeat = -1; SimViewPrefs.resetSizes(); }}>Reset window sizes</button>
        <p class="th-note">Saved for you on this device. Each new beat starts the camera from the ${this.plain ? "lesson's" : "story's"} own view.</p>
      </div>
    `;
  }

  toggleControls(open = !this.ctrlOpen) {
    if (open === this.ctrlOpen) return;
    this.ctrlOpen = open;
    if (open) { this.optsOpen = false; this.ctrlNew = false; }
    this.host.requestUpdate();
  }

  _setPref(key, value) {
    if (key === 'autofit') { this._manualBeat = -1; this._splitShow = value === 'on'; }
    if (key === 'controls') this.ctrlOpen = false;
    SimViewPrefs.set({ [key]: value });
  }

  setFloat(which) {
    const was = this.prefs.float;
    if (which !== 'none' && was !== 'none' && was !== which) {
      A11yAnnouncer.announce(which === 'story' ? 'Scene docked so the story can float' : 'Story docked so the scene can float');
    }
    const root = this._root();
    // the window that changes place: the one floating now, or the one about to
    const sel = (which === 'none' ? was : which) === 'scene' ? '.th-win' : '.th-narr';
    const from = root?.querySelector(sel)?.getBoundingClientRect();
    this.sceneMini = false;
    this.storyMini = false;
    SimViewPrefs.set({ float: which });
    if (from) this._flipAfter(sel, from, 'carry');
  }

  // ── Quill's shows ─────────────────────────────────────────────────────

  /** The look's stagehand (Quill: <quill-stagehand>), or null: a look
   *  without one gets no shows, so every move jumps to its end state. */
  _stagehand() {
    const el = this._root()?.querySelector('companion-slot[kind="stagehand"]')?.companion;
    return typeof el?.play === 'function' && typeof el.plan === 'function' ? el : null;
  }

  /**
   * Runs one stagehand show if the learner's novelty and settings allow,
   * else returns false and the caller just jumps to the end state.
   */
  async _show(kind, { onProgress, grip, moveMs, dir }) {
    const stage = this._stagehand();
    const mode = this.prefs.moves;
    if (!stage || mode === 'off') return false;
    const plan = stage.plan();
    if (plan.tier === 'off') return false;
    stage.note(kind === 'divider' ? 0.5 : 1);
    const root = this._root();
    root.classList.add('th-anim');
    this._showing = kind;
    try {
      await stage.play({ kind, onProgress, grip, moveMs, dir, speed: plan.speed, quill: plan.quill && mode === 'quill' });
    } finally {
      this._showing = '';
      root.classList.remove('th-anim');
    }
    return true;
  }

  /** Quill hauls the divider from the story size `a` to `b` (px), the scene re-fitting every frame. */
  async _haulSplit(root, a, b) {
    const handle = () => root.querySelector('.th-div i');
    const set = (p) => {
      root.style.setProperty('--narr-size', `${a + (b - a) * p}px`);
      this._fit(root);
      this._placeTray(root);
      this.camera.refresh();
    };
    const ok = await this._show('divider', {
      onProgress: set,
      grip: () => { const r = handle()?.getBoundingClientRect(); return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0]; },
      moveMs: Math.max(420, Math.min(820, Math.abs(b - a) * 1.6)),
      // wide: the handle travels with the story's edge (it comes after the scene in full view)
      dir: this.orient === 'wide' ? Math.sign(b - a) * (this.isMax ? -1 : 1) || 1 : 1,
    });
    if (!ok) set(1);
    this.scheduleLayout();
  }

  /**
   * FLIP a window from where it was (`from`, a viewport rect) to where the
   * re-render put it, with Quill carrying it: 'carry' (undock/dock) holds the
   * strip's grip and arcs over; 'open' / 'close' (full view) hold the top
   * right corner. The story strip and divider fade in with the full view.
   */
  async _flipAfter(sel, from, kind) {
    await this.host.updateComplete;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const root = this._root();
    const el = root?.querySelector(sel);
    if (!el || !from.width || !from.height) return;
    // Measure the true end: no transitions (floating windows ease their
    // left/top), and this frame's layout pass done first.
    root.classList.add('th-anim');
    this.layout();
    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) { root.classList.remove('th-anim'); return; }
    if (kind === 'close') {
      // Back from full view: start from the theatre's own box (the window
      // filling the frame) rather than the whole screen, which would pass
      // under the lesson's sticky header.
      const th = root.getBoundingClientRect();
      const l = Math.max(from.left, th.left), t = Math.max(from.top, th.top);
      from = { left: l, top: t, width: Math.min(from.right, th.right) - l, height: Math.min(from.bottom, th.bottom) - t };
    }
    const dist = Math.hypot(from.left - to.left, from.top - to.top) + Math.abs(from.width - to.width);
    if (dist < 24) { root.classList.remove('th-anim'); return; }
    const fade = kind === 'open' ? [...root.querySelectorAll('.th-narr, .th-div')] : [];
    const arc = kind === 'carry' ? Math.min(90, dist * 0.22) : 0;
    const at = (p) => {
      const w = from.width + (to.width - from.width) * p;
      const h = from.height + (to.height - from.height) * p;
      const x = from.left + (to.left - from.left) * p;
      const y = from.top + (to.top - from.top) * p - Math.sin(Math.PI * p) * arc;
      return { x, y, w, h };
    };
    el.style.transformOrigin = '0 0';
    el.style.zIndex = '9';
    const set = (p) => {
      if (p >= 1) {
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.clipPath = '';
        el.style.zIndex = '';
        fade.forEach((f) => { f.style.opacity = ''; });
        return;
      }
      // One scale for both axes (a scene never squashes); the frame is
      // cropped to the in-between shape instead.
      const r = at(p);
      const k = Math.max(r.w / to.width, r.h / to.height);
      const cutR = Math.max(0, (to.width * k - r.w) / k);
      const cutB = Math.max(0, (to.height * k - r.h) / k);
      el.style.transform = `translate(${(r.x - to.left).toFixed(1)}px, ${(r.y - to.top).toFixed(1)}px) scale(${k.toFixed(4)})`;
      el.style.clipPath = `inset(0 ${cutR.toFixed(1)}px ${cutB.toFixed(1)}px 0 round ${(24 / k).toFixed(1)}px)`;
      fade.forEach((f) => { f.style.opacity = String(Math.max(0, (p - 0.4) / 0.6)); });
    };
    set(0);
    const grip = (p) => {
      const r = at(p);
      const sy = r.h / to.height;
      return kind === 'carry' ? [r.x + Math.min(30, r.w * 0.12), r.y + 22 * sy] : [r.x + r.w - 24, r.y + 22 * sy];
    };
    const ok = await this._show(kind, { onProgress: set, grip, moveMs: kind === 'carry' ? 620 : 560 });
    if (!ok) set(1);
    root.classList.remove('th-anim');
  }

  // ── after each render: measure and place ─────────────────────────────

  /** The slide is not showing a theatre right now (other layout, or media not revealed yet). */
  idle() {
    this.camera.detach();
    this._ctrlSig = '';
    this.ctrlNew = false;
    this._lastStep = -1;
    this._beatUntil = 0;
    this._observe([]);
  }

  /** Called from content-block's updated(). */
  afterUpdate({ stepChanged, step, focus }) {
    const root = this._root();
    if (!root) { this.camera.detach(); return; }
    this.camera.attach(root.querySelector('.th-cam'), root.querySelector('.th-cam-in'));
    if (this._lastStep === -1) setTimeout(this._onMoved, 400);
    if (this._lastStep === -1) setTimeout(() => this.scrollIntoView(), 120); // a new slide: the frame, not the page top
    if (stepChanged && this._lastStep !== -1) this._splitShow = true;
    if (stepChanged || this._lastStep === -1) {
      this._lastStep = step;
      this._manualBeat = -1;
      this.camera.setBeat(focus);
      // Classic: follow the current beat while this beat's layout settles
      // (split, fonts, maths), then leave the pane to the learner.
      if (this.plain) this._beatUntil = performance.now() + 900;
      else {
        root.querySelector('.th-narr')?.scrollTo?.({ top: 0 });
        root.querySelector('.th-narr-in')?.scrollTo?.({ top: 0 });
      }
      const narr = root.querySelector('.th-narr');
      if (narr && this.float === 'story' && this.storyMini) {
        narr.classList.remove('ping');
        void narr.offsetWidth;
        narr.classList.add('ping');
      }
    }
    this._noticeControls(root);
    this._observe([root, root.querySelector('.th-narr-in'), root.querySelector('.th-ctrls .cb-sim-controls')]);
    this.layout();
  }

  /**
   * Classic shows the beats stacked, so the text pane keeps the ones already
   * read: scroll it (not the page) to the current beat, whole if it fits,
   * else from its first line.
   */
  _showBeat() {
    const narr = this._root()?.querySelector('.th-narr');
    const cur = narr?.querySelector('.rv-current');
    if (!cur) return;
    if (this.host._step === 0) { narr.scrollTo({ top: 0 }); return; } // the slide title and any recap come first
    const n = narr.getBoundingClientRect().toJSON();
    const nav = narr.querySelector('.th-nav');
    if (nav?.offsetHeight) n.bottom -= nav.offsetHeight; // full view's pinned Previous/Next
    n.height = n.bottom - n.top;
    const c = cur.getBoundingClientRect();
    const pad = 8;
    let dy = 0;
    if (c.height > n.height - 2 * pad || c.top < n.top + pad) dy = c.top - n.top - pad;
    else if (c.bottom > n.bottom - pad) dy = c.bottom - n.bottom + pad;
    if (Math.abs(dy) < 2) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    narr.scrollTo({ top: narr.scrollTop + dy, behavior: reduce ? 'auto' : 'smooth' });
  }

  /** Flags the controls as new when the set of visible controls changes (a new slide, or a beat that reveals some). */
  _noticeControls(root) {
    const bar = root.querySelector('.th-ctrls .cb-sim-controls');
    const sig = bar ? [...bar.querySelectorAll('[id], button')].map((el) => el.id || el.textContent.trim()).join('|') : '';
    if (sig === this._ctrlSig) return;
    const appeared = !!sig && sig !== this._ctrlSig;
    this._ctrlSig = sig;
    this._probeCache.clear();
    if (!appeared || this.ctrlOpen) return;
    this.ctrlNew = true;
    if (this.ctrlTray) A11yAnnouncer.announce('Scene controls are available from the scene strip.');
    this.host.requestUpdate();
  }

  /**
   * The tall split eases its flex-basis (theatreStyles .th-narr), so _fit()
   * during a beat change read the slot's old height, and the slot itself is
   * not observed. One pass when the move ends sizes the scene to where the
   * split landed. The move only ends once, so this adds no loop: _fit()'s
   * flip limit and _decidePlace()'s still cap what a pass can change.
   */
  _onSplitSettled(e) {
    if (e.target === e.currentTarget && e.propertyName === 'flex-basis') this.scheduleLayout();
  }

  _observe(els) {
    const want = new Set(els.filter(Boolean));
    for (const el of this._observed) if (!want.has(el)) { this._ro.unobserve(el); this._observed.delete(el); }
    for (const el of want) if (!this._observed.has(el)) { this._ro.observe(el); this._observed.add(el); }
  }

  scheduleLayout() {
    if (this._layoutRAF) return;
    this._layoutRAF = requestAnimationFrame(() => { this._layoutRAF = 0; this.layout(); });
  }

  layout() {
    const root = this._root();
    if (!root) return;
    const rootCs = getComputedStyle(root);   // --th-frame: a frame wider than the rule (the arcade cabinet's padding)
    this._rule = parseFloat(rootCs.getPropertyValue('--th-frame')) || parseFloat(rootCs.getPropertyValue('--th-rule')) || 3;
    this._reach(root);
    this._fitHeight(root);
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const orient = W > H * 1.05 && W >= 560 ? 'wide' : 'tall';
    const narrow = W < 600;
    if (orient !== this.orient || narrow !== this.narrow) {
      this.orient = orient;
      this.narrow = narrow;
      this.host.requestUpdate();
      return; // the next afterUpdate lays out with the right classes
    }
    if (this._decidePlace(root)) return;
    this._split(root);
    this._fit(root);
    this._placeFloats(root);
    this._placeTray(root);
    this.camera.refresh();
    if (this._beatUntil > performance.now() && !this._beatRAF) {
      this._beatRAF = requestAnimationFrame(() => { this._beatRAF = 0; this._showBeat(); });
    }
  }

  /**
   * Short-landscape phones float the lesson's nav buttons over the right
   * edge, and the lesson reserves a generous fixed gutter for them
   * (--lesson-chrome-right is what they really take). The theatre reaches
   * into the unused part of that gutter instead of leaving it empty.
   */
  _reach(root) {
    const cur = parseFloat(root.style.marginRight) || 0; // our own negative margin
    let m = 0;
    if (!this.isMax) {
      const rail = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-chrome-right')) || 0;
      if (rail > 0) {
        const natural = root.getBoundingClientRect().right + cur;
        const room = Math.floor(window.innerWidth - rail - 10 - natural);
        if (room > 0) m = -room;
      }
    }
    if (m !== cur) root.style.marginRight = m ? `${m}px` : '';
  }

  /**
   * Docked, the theatre fills the screen below the sticky lesson header, which
   * assumes the page is scrolled to it (each beat does that). When the lesson
   * title above it is short enough, it is sized to what is visible below the
   * title instead, so the whole frame is on screen without any scrolling.
   */
  _fitHeight(root) {
    if (this.isMax) { root.style.height = ''; this._fitsAtTop = false; return; }
    const cs = getComputedStyle(document.documentElement);
    const sticky = parseFloat(cs.getPropertyValue('--lesson-sticky-header-h')) || 0;
    const bottom = parseFloat(cs.getPropertyValue('--lesson-chrome-bottom')) || 0;
    const docTop = root.getBoundingClientRect().top + window.scrollY;
    const full = window.innerHeight - sticky - bottom - 40;
    const atTop = window.innerHeight - docTop - bottom - 14;
    // A phone in Classic gives the title's height to the frame: the page scrolls
    // past the title, and both the story and the scene get about 50 px more.
    this._fitsAtTop = !(this.plain && this.narrow) && atTop >= 320 && atTop >= full * 0.8;
    const want = this._fitsAtTop ? `${Math.floor(atTop)}px` : '';
    if (root.style.height !== want) root.style.height = want;
  }

  /** The bar's height as a strip (list false) or a list (list true) w px wide, measured on an invisible copy. */
  _probe(root, bar, w, list) {
    const width = Math.round(w);
    const k = `${list ? 1 : 0}|${width}|${bar.classList.contains('compact') ? 1 : 0}`;
    if (this._probeCache.has(k)) return this._probeCache.get(k);
    const box = document.createElement('div');
    box.className = 'th-probe';
    box.style.width = `${width}px`;
    const wrap = document.createElement('div');
    wrap.className = list ? 'th-ctrls side' : 'th-ctrls';
    const copy = bar.cloneNode(true);
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    wrap.appendChild(copy);
    box.appendChild(wrap);
    root.appendChild(box);
    const h = copy.offsetHeight;
    box.remove();
    if (this._probeCache.size > 64) this._probeCache.clear();
    this._probeCache.set(k, h);
    return h;
  }

  /**
   * Below the scene, beside it, or in the tray: wherever the scene comes out
   * biggest (placeControls in theatreLayout.js). Re-decided when the theatre,
   * the split the learner chose, or the controls change, and never while the
   * tray is open under the learner's hand. The auto split that follows a
   * decision may move the slot; that gets one more look, not an endless loop.
   * @returns {boolean} true if it flipped (a re-render follows)
   */
  _decidePlace(root) {
    const bar = root.querySelector('.th-ctrls .cb-sim-controls');
    if (!bar) return false; // keep the choice across a beat that hides every control
    if (this.ctrlTray && this.ctrlOpen) return false;
    const slot = root.querySelector('.th-slot');
    const win = root.querySelector('.th-win');
    if (!slot || !win) return false;
    const floating = this.float === 'scene';
    const sw = floating ? win.offsetWidth : slot.clientWidth - this._railW(root);
    const sh = floating ? 10000 : slot.clientHeight;
    if (!sw || !sh) return false;
    const step = this.host._step;
    const manual = this.prefs.autofit !== 'on' || this._manualBeat === step ? this._size(this._splitKey()) : 'auto';
    const base = [root.clientWidth, root.clientHeight, this._ctrlSig, this.float, this.isMax, this.orient, step, manual, this.prefs.controls].join('|');
    const key = `${base}|${Math.round(sw / 24)}x${Math.round(sh / 24)}`;
    if (key === this._placeKey) return false;
    if (base !== this._placeKey.slice(0, base.length)) this._placeFlips = 0;
    this._placeKey = key;
    if (this._placeFlips >= 2) return false;
    const head = this._railed() ? this._rule : (win.querySelector('.cb-stage-head')?.offsetHeight || 44);
    const { place } = placeControls({
      sw, sh, head, rule: this._rule, aspect: this._aspect,
      belowH: (w) => this._probe(root, bar, w, false),
      sideH: (cw) => this._probe(root, bar, cw, true),
      // A scene whose controls are the lesson keeps them in sight; the learner's own 'menu' or 'below' still wins.
      mode: this.prefs.controls === 'auto' && this.host._simSceneClass?.CONTROLS_IN_SIGHT ? 'below' : this.prefs.controls,
      allowSide: !floating, current: this.ctrlPlace,
      minWin: floating ? 0 : 340,
    });
    const cw = place === 'side' ? sideWidth(sw) : 0;
    if (cw !== this._cw) { this._cw = cw; win.style.setProperty('--ctrl-w', `${cw}px`); }
    if (place === this.ctrlPlace) return false;
    this._placeFlips++;
    this.ctrlPlace = place;
    if (place !== 'tray') this.ctrlOpen = false;
    this.host.requestUpdate();
    return true;
  }

  /** Width the side controls column takes from the scene's window (0 unless 'side'). */
  _side() {
    return this.ctrlPlace === 'side' && this.hasControls ? this._cw : 0;
  }

  _chrome(win) {
    const head = win.querySelector('.cb-stage-head');
    const ctrls = this.ctrlPlace === 'below' ? win.querySelector('.th-ctrls .cb-sim-controls') : null;
    const cap = win.querySelector('.th-cap');
    const capH = cap ? cap.offsetHeight + (parseFloat(getComputedStyle(cap).marginTop) || 0) : 0;
    // Railed, the strip stands beside the scene; only its top rule is left above it.
    const headH = this._railed() ? this._rule : (head?.offsetHeight || 0);
    return headH + (ctrls?.offsetHeight || 0) + capH + this._rule;
  }

  _splitKey() {
    return `split:${this.isMax ? 'max' : 'dock'}:${this.orient}`;
  }

  _split(root) {
    if (this._showing === 'divider') return; // Quill has the divider
    if (this.narrated) { root.style.removeProperty('--narr-size'); this._splitShow = false; return; }
    if (this.float !== 'none') { root.style.removeProperty('--narr-size'); this._splitShow = false; return; }
    const prev = parseFloat(root.style.getPropertyValue('--narr-size')); // before the search below tries sizes
    const narr = root.querySelector('.th-narr');
    const inner = root.querySelector('.th-narr-in');
    const nav = root.querySelector('.th-nav');
    const win = root.querySelector('.th-win');
    if (!narr || !inner || !win) return;
    const tall = this.orient === 'tall';
    const div = root.querySelector('.th-div');
    const divT = div ? (tall ? div.offsetHeight : div.offsetWidth) : 18;
    const span = (tall ? root.clientHeight : root.clientWidth) - divT;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // Docked tall (a phone): the scene keeps its full-width length up to 60%
    // of the span; a longer beat scrolls inside its own pane (Q-84: at 390 px
    // long text squeezed scenes to 250-300 px wide and pushed them under the fold).
    const fullLen = tall && !this.isMax ? (root.clientWidth - 2 * this._rule - this._side()) / this._aspect + this._chrome(win) : 0;
    const sceneFloor = fullLen > 0 && Number.isFinite(fullLen) ? Math.min(fullLen, span * 0.6) : 0;
    const limits = splitLimits({ tall, span, rem, reserve: tall ? this._chrome(win) : 2 * this._rule, sceneFloor });
    // The plain look's page: a book measure (about 66 characters) for the text.
    if (this.editorial && !tall) limits.read = Math.min(limits.read, Math.round(36 * rem));
    const step = this.host._step;
    const auto = this.prefs.autofit === 'on' && this._manualBeat !== step;
    let size;
    if (!auto) {
      const saved = this._size(this._splitKey());
      size = clampSplit(saved || (tall ? span * 0.34 : Math.max(limits.min, span * 0.36)), limits);
    } else {
      const cs = getComputedStyle(narr);
      const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const navH = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight + 8 : 0;
      const chrome = this._chrome(win);
      const natural = tall
        ? (root.clientWidth - (this.isMax ? 0 : 2 * this._rule) - this._side()) / this._aspect + chrome
        : Math.min((root.clientHeight - chrome) * this._aspect, this.isMax ? Infinity : this._maxSceneW) + (this.isMax ? 0 : 2 * this._rule) + this._side() + this._railW(root);
      // Classic stacks the beats: fit the current one (the ones read scroll
      // away above it), or the whole first beat with the slide title.
      const cur = this.plain && step > 0 ? inner.querySelector('.rv-current') : null;
      const textH = () => (cur || inner).offsetHeight;
      let need;
      if (tall) need = textH() + navH + padV + 4;
      else {
        need = searchNarrowest(limits.min, limits.max, (w) => {
          root.style.setProperty('--narr-size', `${w}px`);
          return textH() + navH + padV <= narr.clientHeight;
        });
      }
      size = autoSplit({ tall, span, need, natural, limits, fillRest: this.isMax });
      // ...and a beat too long for the height scrolls at that measure rather
      // than widening past it: widening would only shrink the figure.
      if (this.editorial && !tall && !this.isMax) size = clampSplit(Math.min(size, Math.max(limits.read, span - natural)), limits);
    }
    // A new beat that moves the split a long way: Quill hauls it there.
    const haul = this._splitShow && auto && Number.isFinite(prev) && Math.abs(size - prev) >= 48;
    this._splitShow = false;
    if (haul) {
      root.style.setProperty('--narr-size', `${prev}px`);
      this._haulSplit(root, prev, size);
      return;
    }
    root.style.setProperty('--narr-size', `${size}px`);
  }

  /** Sizes the scene to its aspect inside whatever box its window has. */
  _fit(root) {
    const win = root.querySelector('.th-win');
    const stage = root.querySelector('.th-stage');
    const cam = root.querySelector('.th-cam');
    const slot = root.querySelector('.th-slot');
    if (!win || !stage || !cam || !slot) return;
    let box;
    if (this.isMax) {
      win.style.width = '';
      stage.style.height = '';
      box = fitAspect(stage.clientWidth, stage.clientHeight, this._aspect);
    } else if (this.float === 'scene') {
      // ...no wider than lets its whole height fit the theatre
      const byHeight = (root.clientHeight - 16 - this._chrome(win)) * this._aspect + 2 * this._rule;
      const w = Math.round(Math.min(this._sceneWinWidth(root), Math.max(220, byHeight)));
      win.style.width = `${w}px`;
      box = fitAspect(w - 2 * this._rule, 10000, this._aspect);
      stage.style.height = `${box.h}px`;
    } else {
      // Docked (or under a floating story): the frame hugs the scene, no empty bands inside it.
      const side = this._side() + this._railW(root);
      // Narrated: keep a caption band free under a height-limited scene.
      let capBand = this.narrated ? Math.min(96, Math.max(48, Math.round(slot.clientHeight * 0.2))) : 0;
      // Q-85: the band is the caption's two-line box plus a gap above and
      // below it; the room the slot already leaves above the action bar
      // counts towards it (at 1280x720 14 px, so 82 px, not 96, and the
      // narrated scene is no smaller than in text mode).
      if (capBand && this.orient !== 'tall' && typeof window !== 'undefined') {
        const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-chrome-bottom')) || 0;
        const room = window.innerHeight - bar - slot.getBoundingClientRect().bottom;
        capBand -= Math.max(0, Math.min(16, Math.round(room)));
      }
      // Tall (portrait): the band sits above the scene, where captions read first.
      slot.style.paddingTop = capBand && this.orient === 'tall' ? `${capBand}px` : '';
      box = fitAspect(Math.min(slot.clientWidth - 2 * this._rule - side, this._maxSceneW), slot.clientHeight - this._chrome(win) - capBand, this._aspect);
      // Never narrower than its head strip needs for its buttons (the stage
      // then shows thin bands beside a very tall-limited scene). A rail needs no width.
      const minWin = this._railed() ? 0 : Math.min(slot.clientWidth, 340);
      win.style.width = `${Math.max(box.w + 2 * this._rule + side, minWin)}px`;
      stage.style.height = `${box.h}px`;
    }
    cam.style.width = `${box.w}px`;
    cam.style.height = `${box.h}px`;
    const prev = this.stageWidth;
    this.stageWidth = box.w;
    // content-block compacts the CONTROLS bar below 400px; re-render only when that flips.
    // Compacting frees height, which can widen the scene past 400 and flip it back: a scene
    // near the line would loop without ever yielding, so a few quick flips end it.
    if (prev == null) this.host.requestUpdate();
    else if ((prev < 400) !== (box.w < 400)) {
      const now = performance.now();
      this._compactFlips = now - (this._compactAt ?? -1e9) < 600 ? (this._compactFlips || 0) + 1 : 0;
      this._compactAt = now;
      if (this._compactFlips < 3) this.host.requestUpdate();
    }
  }

  /**
   * Where the scene-controls tray opens: over the docked story (beside the
   * scene when wide, above it when tall) if that area is big enough, so the
   * learner sees the scene react; otherwise over the scene, under its strip.
   */
  _placeTray(root) {
    const win = root.querySelector('.th-win');
    if (!win || !root.querySelector('.th-ctrls.tray')) { delete root.dataset.tray; return; }
    const narr = root.querySelector('.th-narr');
    const r = root.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    const head = win.querySelector('.cb-stage-head')?.offsetHeight || 44;
    // Docked, the story comes first (left / above); in full view it comes after (right / below).
    let where = 'over';
    if (this.float === 'none' && narr) {
      if (this.orient === 'wide' && narr.offsetWidth >= 240) where = this.isMax ? 'side-end' : 'side';
      else if (this.orient === 'tall' && narr.offsetHeight >= 220) where = this.isMax ? 'down' : 'up';
    }
    const maxh = where === 'side' || where === 'side-end' ? r.bottom - w.top - 8
      : where === 'up' ? w.top - r.top - 6
        : where === 'down' ? r.bottom - w.bottom - 8
          : r.bottom - w.top - head - 14;
    root.dataset.tray = where;
    win.style.setProperty('--tray-maxh', `${Math.max(120, Math.floor(maxh))}px`);
  }

  _area(root) {
    return { left: 8, top: 8, right: root.clientWidth - 8, bottom: root.clientHeight - 8 };
  }

  _sceneWinWidth(root) {
    const W = root.clientWidth;
    const def = this.orient === 'tall' ? Math.min(W * 0.66, 480) : Math.min(W * (W >= 1100 ? 0.42 : 0.4), 860);
    const max = W - 16;
    return Math.round(Math.max(Math.min(220, max), Math.min(max, this._size(`float:scene:${this.orient}`) || def)));
  }

  _storyCardSize(root) {
    const W = root.clientWidth;
    const H = root.clientHeight;
    const tall = this.orient === 'tall';
    const defW = tall ? Math.min(W - 16, 460) : Math.min(W * 0.4, 440);
    const w = Math.round(Math.max(Math.min(200, W - 16), Math.min(W - 16, this._size(`float:story:${this.orient}:w`) || defW)));
    const h = Math.round(Math.max(90, Math.min(H - 16, this._size(`float:story:${this.orient}:h`) || H * (tall ? 0.42 : 0.8))));
    return { w, h };
  }

  _placeFloats(root) {
    const area = this._area(root);
    const win = root.querySelector('.th-win');
    const narr = root.querySelector('.th-narr');
    const f = this.float;
    if (f !== 'scene' && win) { win.style.left = ''; win.style.top = ''; }
    if (f !== 'story' && narr) { narr.style.left = ''; narr.style.top = ''; narr.style.width = ''; narr.style.removeProperty('--story-maxh'); }
    if (f !== 'story' || this.storyMini) delete root.dataset.card;
    if (f === 'scene' && win && !win.dataset.drag) {
      this._put(win, 'scene', area, win.offsetWidth, win.offsetHeight, 'br');
    }
    this._clearStory(root, area);
    if (f === 'story' && narr && !narr.dataset.drag) {
      const { w, h } = this._storyCardSize(root);
      narr.style.width = `${w}px`;
      narr.style.setProperty('--story-maxh', `${h}px`);
      // Snap: park the card where it covers least of what this beat is about
      // (a wide theatre slides the scene to the other side first, so on a
      // desktop the card usually lands in the empty band beside it).
      if (this.prefs.snap === 'snap' && !FLOAT_POS.story[this.orient]?.x) {
        const fv = this.camera.focusInView();
        const cam = root.querySelector('.th-cam');
        if (fv && cam) {
          const rr = root.getBoundingClientRect();
          const cr = cam.getBoundingClientRect();
          const avoid = { x: cr.left - rr.left + fv.x * cr.width, y: cr.top - rr.top + fv.y * cr.height, w: fv.w * cr.width, h: fv.h * cr.height };
          const prefer = FLOAT_POS.story[this.orient]?.corner || 'tl';
          FLOAT_POS.story[this.orient] = { corner: cornerAwayFrom(avoid, w, narr.offsetHeight, area, prefer) };
        }
      }
      const pos = this._put(narr, 'story', area, w, narr.offsetHeight, 'tl');
      // The scene slides to the side the card is not on.
      if (this.storyMini) delete root.dataset.card;
      else if (this.orient === 'tall') root.dataset.card = pos.y + narr.offsetHeight / 2 < (area.top + area.bottom) / 2 ? 'top' : 'bottom';
      else root.dataset.card = pos.x + w / 2 < (area.left + area.right) / 2 ? 'left' : 'right';
    }
  }

  /**
   * A floating scene window: the docked story moves out from under it, to
   * whichever side has more room, as long as what is left is still readable
   * (else the window simply floats over the story, which is what floating is for).
   */
  _clearStory(root, area) {
    const narr = root.querySelector('.th-narr');
    if (!narr) return;
    const reset = () => { for (const k of ['marginLeft', 'marginRight', 'marginTop', 'marginBottom']) narr.style[k] = ''; delete root.dataset.clear; };
    const win = root.querySelector('.th-win');
    if (this.float !== 'scene' || this.sceneMini || !win) { reset(); return; }
    const x = parseFloat(win.style.left) || 0;
    const y = parseFloat(win.style.top) || 0;
    const w = win.offsetWidth;
    const h = win.offsetHeight;
    const gap = 12;
    reset();
    if (this.orient === 'wide') {
      const left = x - gap;
      const right = root.clientWidth - (x + w) - gap;
      if (Math.max(left, right) < 300) return;
      if (right >= left) narr.style.marginLeft = `${x + w + gap}px`;
      else narr.style.marginRight = `${root.clientWidth - x + gap}px`;
      root.dataset.clear = right >= left ? 'right' : 'left';
    } else {
      const above = y - gap;
      const below = root.clientHeight - (y + h) - gap;
      if (Math.max(above, below) < 160) return;
      if (below >= above) narr.style.marginTop = `${y + h + gap}px`;
      else narr.style.marginBottom = `${root.clientHeight - y + gap}px`;
      root.dataset.clear = below >= above ? 'below' : 'above';
    }
  }

  /** Positions a floating window from its saved corner/xy, clamped to the area. */
  _put(el, which, area, w, h, defCorner) {
    const saved = FLOAT_POS[which][this.orient] || { corner: defCorner };
    const pos = saved.corner ? cornerPos(saved.corner, w, h, area) : clampToArea(saved.x, saved.y, w, h, area);
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    const rsz = el.querySelector(':scope > .th-rsz');
    rsz?.classList.toggle('left', pos.x + w / 2 > (area.left + area.right) / 2);
    return pos;
  }

  // ── drags ─────────────────────────────────────────────────────────────

  /** Pointer drag helper: captures the pointer and keeps swipes from turning the page. */
  /**
   * Quill joins a drag the learner is doing (QuillStagehand grab()), hanging
   * from grip() until release(); null when he is not showing up right now.
   */
  _joinDrag(grip) {
    const stage = this._stagehand();
    if (!stage || this.prefs.moves !== 'quill') return null;
    const plan = stage.plan();
    if (!plan.quill) return null;
    stage.note(0.3);
    return stage.grab({ grip, speed: plan.speed });
  }

  /** Centre of an element, viewport px (a grip Quill hangs from). */
  _centre(el) {
    const r = el?.getBoundingClientRect();
    return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0];
  }

  /** @param {() => [number, number]} [quillGrip]  where Quill holds on once the drag really moves */
  _drag(e, el, onMove, onEnd, quillGrip) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let quill = null;
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      // not on a click or a double-click: only once the pointer really travels
      if (quillGrip && !quill && Math.hypot(dx, dy) > 8) quill = this._joinDrag(quillGrip) || { release() {} };
      onMove(dx, dy, ev);
    };
    const stopTouch = (ev) => ev.stopPropagation();
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setTimeout(() => target.removeEventListener('touchend', stopTouch, true), 0);
      quill?.release();
      onEnd(ev.clientX - x0, ev.clientY - y0, ev);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    // LessonSession turns the page on a horizontal swipe (touchend on its host).
    target.addEventListener('touchend', stopTouch, true);
  }

  _startSplit(e) {
    if (e.button !== 0) return;
    this._stagehand()?.finish?.();
    const root = this._root();
    const narr = root?.querySelector('.th-narr');
    if (!narr) return;
    const div = e.currentTarget;
    const tall = this.orient === 'tall';
    const start = tall ? narr.offsetHeight : narr.offsetWidth;
    // The story comes before the divider when docked, after it in full view.
    const sign = this.isMax ? -1 : 1;
    const key = this._splitKey();
    const win = root.querySelector('.th-win');
    const reserve = tall && win ? this._chrome(win) : 2 * this._rule;
    div.dataset.drag = '1';
    this._drag(e, div, (dx, dy) => {
      const span = (tall ? root.clientHeight : root.clientWidth) - (tall ? div.offsetHeight : div.offsetWidth);
      const limits = splitLimits({ tall, span, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, reserve });
      const size = clampSplit(start + sign * (tall ? dy : dx), limits);
      this._live[key] = size;
      this._manualBeat = this.host._step;
      root.classList.remove('auto');
      root.style.setProperty('--narr-size', `${size}px`);
      if (this._decidePlace(root)) return; // re-renders, and lays out from _live
      this._fit(root);
      this.camera.refresh();
    }, () => {
      delete div.dataset.drag;
      const size = this._live[key];
      delete this._live[key];
      if (size) SimViewPrefs.setSize(key, size);
      else this.host.requestUpdate();
    }, () => this._centre(div.querySelector('i'))); // Quill hangs from the handle
  }

  _resetSplit() {
    this._manualBeat = -1;
    this._splitShow = true; // Quill hauls it back to the beat's own split
    SimViewPrefs.setSize(this._splitKey(), 0);
  }

  /** Arrow keys on the focused divider: 24px a press, kept for this beat. */
  _onSplitKey(e) {
    const k = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    const root = this._root();
    const narr = root?.querySelector('.th-narr');
    if (!narr) return;
    const tall = this.orient === 'tall';
    const cur = tall ? narr.offsetHeight : narr.offsetWidth;
    const span = (tall ? root.clientHeight : root.clientWidth) - 18;
    const win = root.querySelector('.th-win');
    const reserve = tall && win ? this._chrome(win) : 2 * this._rule;
    const limits = splitLimits({ tall, span, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, reserve });
    this._manualBeat = this.host._step;
    SimViewPrefs.setSize(this._splitKey(), clampSplit(cur + (this.isMax ? -k : k) * 24, limits));
  }

  _startMove(e, which) {
    if (e.button !== 0 || e.target.closest?.('button')) return;
    if (this.float !== which) return;
    const root = this._root();
    const el = which === 'scene' ? root?.querySelector('.th-win') : root?.querySelector('.th-narr');
    const zone = root?.querySelector('.th-zone');
    if (!el || !zone) return;
    const area = this._area(root);
    const left0 = el.offsetLeft;
    const top0 = el.offsetTop;
    let hot = false;
    let far = false;
    el.dataset.drag = 'move';
    this._drag(e, el, (dx, dy, ev) => {
      const p = clampToArea(left0 + dx, top0 + dy, el.offsetWidth, el.offsetHeight, area);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      far = far || Math.hypot(dx, dy) > 40;
      zone.className = `th-zone ${which}`;
      zone.hidden = !far;
      const zr = zone.getBoundingClientRect();
      hot = far && ev.clientX >= zr.left && ev.clientX <= zr.right && ev.clientY >= zr.top && ev.clientY <= zr.bottom;
      zone.classList.toggle('hot', hot);
    }, () => {
      delete el.dataset.drag;
      zone.hidden = true;
      if (hot) { this.setFloat('none'); return; }
      const rect = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      FLOAT_POS[which][this.orient] = this.prefs.snap === 'snap' ? { corner: nearestCorner(rect, area) } : { x: rect.x, y: rect.y };
      this.layout();
    }, () => this._centre(el.querySelector('.th-grip'))); // ...from the strip's grip dots
  }

  _startResize(e, which) {
    if (e.button !== 0) return;
    const rszEl = e.currentTarget;
    const root = this._root();
    const el = which === 'scene' ? root?.querySelector('.th-win') : root?.querySelector('.th-narr');
    if (!el) return;
    const fromLeft = e.currentTarget.classList.contains('left');
    const w0 = el.offsetWidth;
    const h0 = which === 'story' ? this._storyCardSize(root).h : 0;
    const x0 = el.offsetLeft;
    const right0 = x0 + w0;
    const kw = which === 'scene' ? `float:scene:${this.orient}` : `float:story:${this.orient}:w`;
    const kh = `float:story:${this.orient}:h`;
    el.dataset.drag = 'resize';
    this._drag(e, el, (dx, dy) => {
      const W = root.clientWidth;
      const w = Math.round(Math.max(Math.min(200, W - 16), Math.min(W - 16, w0 + (fromLeft ? -dx : dx))));
      this._live[kw] = w;
      el.style.width = `${w}px`;
      // A left-hand grip keeps the right edge where it was.
      if (fromLeft) el.style.left = `${Math.max(8, right0 - w)}px`;
      if (which === 'story') {
        const h = Math.round(Math.max(90, Math.min(root.clientHeight - 16, h0 + dy)));
        this._live[kh] = h;
        el.style.setProperty('--story-maxh', `${h}px`);
      } else {
        this._fit(root);
        this.camera.refresh();
      }
    }, () => {
      delete el.dataset.drag;
      const rect = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      FLOAT_POS[which][this.orient] = this.prefs.snap === 'snap' ? { corner: nearestCorner(rect, this._area(root)) } : { x: rect.x, y: rect.y };
      const w = this._live[kw];
      const h = this._live[kh];
      delete this._live[kw];
      delete this._live[kh];
      if (w) SimViewPrefs.setSize(kw, w);
      if (which === 'story' && h) SimViewPrefs.setSize(kh, h);
    }, () => this._centre(rszEl)); // ...from the gold resize corner
  }

  // ── keys ──────────────────────────────────────────────────────────────

  _onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.composedPath()[0]?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const zoomOn = this.prefs.zoom === 'on';
    let handled = true;
    if (e.key === 'Escape' && this.optsOpen) { this.optsOpen = false; this.host.requestUpdate(); }
    else if (e.key === 'Escape' && this.ctrlOpen) this.toggleControls(false);
    // Native fullscreen: the browser usually takes Escape itself; this covers the rest.
    else if (e.key === 'Escape' && this.isMax) this.closeMax();
    else if (e.key === 'f' || e.key === 'F') { if (this.isMax) this.closeMax(); else this.openMax(); }
    else if (zoomOn && (e.key === '+' || e.key === '=')) this.camera.zoomBy(1.5);
    else if (zoomOn && (e.key === '-' || e.key === '_')) this.camera.zoomBy(1 / 1.5);
    else if (e.key === '0') this.camera.backToBeat();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  // ── full view ─────────────────────────────────────────────────────────

  _portraitPhone() {
    return typeof matchMedia === 'function'
      && matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
  }

  async openMax() {
    if (this.isMax) return;
    this.optsOpen = false;
    const from = this._root()?.querySelector('.th-win')?.getBoundingClientRect();
    const wantNative = this.prefs.fullscreen === 'native';
    const canNative = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    this.isMax = true;
    if (this.plain) this._beatUntil = performance.now() + 900; // the text pane moves: keep the beat in sight
    this.maxPath = wantNative && canNative ? 'native' : (typeof HTMLElement.prototype.showPopover === 'function' ? 'popover' : 'fixed');
    this.host.requestUpdate();
    await this.host.updateComplete;
    const root = this._root();
    if (!root) return;
    if (this.maxPath === 'native') {
      try {
        const req = root.requestFullscreen || root.webkitRequestFullscreen;
        await req.call(root);
        // A phone held upright: ask for landscape (Android allows this only in
        // fullscreen; other platforms refuse quietly).
        if (this._portraitPhone()) screen.orientation?.lock?.('landscape').catch(() => {});
      } catch {
        // Refused (no user activation left, an iframe without allow=fullscreen...): the overlay instead.
        this.maxPath = typeof root.showPopover === 'function' ? 'popover' : 'fixed';
        this.host.requestUpdate();
        await this.host.updateComplete;
      }
    }
    if (this.maxPath === 'popover') {
      try { this._root()?.showPopover(); } catch { this.maxPath = 'fixed'; }
    }
    this._root()?.focus({ preventScroll: true });
    A11yAnnouncer.announce('Full view. Press Escape to close.');
    if (from) this._flipAfter('.th-win', from, 'open');
  }

  async closeMax() {
    if (!this.isMax || this._closing) return;
    this._closing = true;
    const root = this._root();
    this._stagehand()?.finish?.();
    const from = root?.querySelector('.th-win')?.getBoundingClientRect();
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl && fsEl === root) {
      // Leave fullscreen first: switching to the docked layout while the
      // theatre is still the fullscreen element paints it docked on black.
      const out = new Promise((r) => {
        const done = () => { document.removeEventListener('fullscreenchange', done); document.removeEventListener('webkitfullscreenchange', done); r(); };
        document.addEventListener('fullscreenchange', done);
        document.addEventListener('webkitfullscreenchange', done);
        setTimeout(done, 700);
      });
      try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch { /* already out */ }
      await out;
    }
    try { screen.orientation?.unlock?.(); } catch { /* not supported */ }
    if (root?.matches?.(':popover-open')) { try { root.hidePopover(); } catch { /* gone */ } }
    this.isMax = false;
    if (this.plain) this._beatUntil = performance.now() + 900;
    this.maxPath = '';
    this._closing = false;
    this.camera.backToBeat();
    this.host.requestUpdate();
    if (from && this.host.isConnected) this._flipAfter('.th-win', from, 'close');
  }

  // ── scrolling ─────────────────────────────────────────────────────────

  /** Replaces the beat scroll: the theatre itself sits under the sticky header. */
  scrollIntoView() {
    const root = this._root();
    if (!root || this.isMax || document.hidden) return;
    if (this._fitsAtTop) { root.scrollIntoView({ block: 'nearest', behavior: 'auto' }); return; }
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-sticky-header-h')) || 0;
    const top = root.getBoundingClientRect().top;
    if (Math.abs(top - (headerH + 10)) < 6) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
}
