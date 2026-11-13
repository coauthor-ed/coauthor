import { LitElement, html, css, nothing } from 'lit';
import { captionPhrases, phraseAt, wordSpans } from '../../core/narration/narrationModel.js';
import { NARRATION_RATES } from '../../engines/lesson/NarrationPacer.js';

/**
 * Narrated lessons, the view half (PLAN.md W1). Both elements only render a
 * NarrationPacer's published state and hand the learner's presses back to
 * it; the pacing itself lives with the engine (invariant 8).
 *
 *   <narration-strip>     the slim control strip that stands in LessonSession's
 *                         bottom action bar while narrated: play/pause,
 *                         previous/next beat, the beat-segment scrubber, speed,
 *                         the narrator voice (only when the lesson offers more
 *                         than one, Q-43), mute, presenter mode, captions
 *                         and a key list (Q-90; on a phone in a "More"
 *                         menu with the speed) and "Read instead". It fades out while playing and
 *                         comes back on any pointer, key or touch, on pause and
 *                         on a wait; its height stays reserved, so nothing moves.
 *   <narration-captions>  the caption overlay: the current phrase with the
 *                         word being spoken highlighted. Placed in the scene's
 *                         freeRect() if it reports one, else in the letterbox
 *                         band the picture leaves, else above the scene on a
 *                         portrait phone, else over the foot of the picture.
 *                         A text slide shows none (its prose lights the word
 *                         in place); a question docks it below itself if that
 *                         fits, else at the top, clear of the options, and
 *                         drops it while waiting for an answer.
 *                         It also shows the slide title for about 3 s when a
 *                         slide opens (titles are shown, never spoken), in
 *                         room beside or above the picture and never over it,
 *                         and the "Your turn" hint with Skip while a beat
 *                         waits for the learner to act in the scene.
 *
 * Colours are theme tokens only (--narr-* in theme.css, light and dark;
 * plain's look.css re-values the tokens they are built from).
 */

const ICONS = {
  play: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>`,
  pause: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>`,
  prev: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg>`,
  next: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5v14M6 6l8 6-8 6z"/></svg>`,
  // a speaking head: the narrator's voice (Q-43)
  voice: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.6"/><path d="M2.8 20c.7-3.4 3.2-5.2 6.2-5.2s5.5 1.8 6.2 5.2"/><path d="M17.4 6.6a4 4 0 0 1 0 5M20 4.4a7 7 0 0 1 0 9.4"/></svg>`,
  // Q-90: sound on / muted, presenter (a screen on a stand), captions, more
  sound: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke-width="1.6"/><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.4a7.5 7.5 0 0 1 0 11.2"/></svg>`,
  muted: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke-width="1.6"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`,
  presenter: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3.5" width="18" height="11.5" rx="1.5"/><path d="M12 15v3.5M8 21l4-2.5 4 2.5M7.5 11l3-3 2 2 4-4"/></svg>`,
  captions: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6"/></svg>`,
  more: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5.5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18.5" cy="12" r="2"/></svg>`,
  read: html`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h6a3 3 0 0 1 3 3V19a2.5 2.5 0 0 0-2.5-2.5H3zM21 5.5h-6a3 3 0 0 0-3 3V19a2.5 2.5 0 0 1 2.5-2.5H21z"/></svg>`,
};

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shared by both elements: follows one pacer, re-renders on its state. */
const PacerFollower = (Base) => class extends Base {
  static properties = { pacer: { attribute: false }, _s: { state: true } };
  updated(changed) {
    super.updated?.(changed);
    if (changed.has('pacer')) {
      this._unsub?.();
      this._unsub = this.pacer ? this.pacer.subscribe((s) => { this._s = s; }) : null;
    }
  }
  disconnectedCallback() { super.disconnectedCallback(); this._unsub?.(); this._unsub = null; }
};

// ── the control strip ─────────────────────────────────────────────────────

export class NarrationStrip extends PacerFollower(LitElement) {
  static properties = {
    canBack: { type: Boolean },
    /** Presenter captions off (Q-90): LessonSession owns it, the strip shows it. */
    capOff: { type: Boolean },
    /** The key list popover (Q-90), opened by "?" here or the ? key. */
    helpOpen: { type: Boolean },
    _idle: { state: true },
    _more: { state: true },
  };

  static styles = css`
    :host { display: block; }
    .strip {
      position: relative;
      display: flex; align-items: center; gap: var(--space-2, 8px);
      min-height: 44px; box-sizing: border-box;
      transition: opacity var(--motion-base, 220ms) ease-out;
    }
    :host([idle]) .strip { opacity: 0.42; }
    :host([idle]) .strip:focus-within { opacity: 1; }
    button {
      flex: none; display: inline-grid; place-items: center; gap: 6px;
      min-width: 44px; height: 44px; padding: 0 10px; box-sizing: border-box;
      border: var(--rule-w, 2px) solid var(--border-color); border-radius: var(--radius-pill, 999px);
      background: var(--bg-surface); color: var(--text-main);
      box-shadow: var(--lip, 0 3px 0) var(--border-color);
      font: inherit; font-family: var(--font-ui); font-weight: var(--fw-strong, 700); font-size: 0.92rem;
      cursor: pointer;
    }
    button:active { transform: translateY(2px); box-shadow: none; }
    button:disabled { opacity: 0.4; cursor: default; transform: none; box-shadow: var(--lip, 0 3px 0) var(--border-color); }
    button:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset, 2px); }
    button svg { width: 20px; height: 20px; display: block; }
    .play { min-width: 52px; background: var(--primary-color); border-color: var(--primary-color); color: var(--on-primary); box-shadow: var(--lip, 0 3px 0) var(--narr-play-lip); }
    .play svg { width: 22px; height: 22px; }
    .play.cont { display: inline-flex; align-items: center; gap: 6px; padding: 0 14px 0 10px; }
    .read { display: inline-flex; align-items: center; padding: 0 14px; }
    .rate { min-width: 58px; font-variant-numeric: tabular-nums; }
    .voice { display: inline-flex; align-items: center; gap: 6px; padding: 0 12px 0 10px; max-width: 13em; }
    .voice .vk { color: var(--text-muted); font-weight: var(--fw-medium, 500); }
    .voice .vn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scrub {
      flex: 1 1 auto; min-width: 60px; height: 44px; display: flex; align-items: center; gap: 2px;
      cursor: pointer; touch-action: none;
    }
    .seg {
      position: relative; flex: 1 1 0; height: 8px; min-width: 3px; border-radius: 4px;
      background: var(--narr-track); overflow: hidden;
    }
    .seg.block-start { margin-left: 4px; }
    .seg.block-start:first-child { margin-left: 0; }
    .seg > i { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--narr-fill); border-radius: inherit; }
    .seg.past > i { width: 100%; }
    .seg.now { height: 12px; }
    .wait {
      flex: none; font-size: 0.85rem; color: var(--text-muted); white-space: nowrap;
      font-family: var(--font-ui);
    }
    .lbl { white-space: nowrap; }
    /* Q-90: mute, presenter, captions and keys. A pressed toggle is filled. */
    button.tg[aria-pressed="true"] { background: var(--primary-light, var(--bg-surface)); border-color: var(--primary-color); color: var(--primary-color); }
    .keys { font-size: 1.05rem; min-width: 40px; }
    .more { display: none; }
    .pop {
      position: absolute; right: 0; bottom: calc(100% + 10px); z-index: 5;
      min-width: 240px; max-width: min(360px, calc(100vw - 24px)); box-sizing: border-box;
      padding: 10px 12px; border-radius: var(--radius-md, 12px);
      background: var(--bg-surface); color: var(--text-main);
      border: 1px solid var(--border-color); box-shadow: var(--shadow-md);
      font-family: var(--font-ui); font-size: 0.86rem; line-height: 1.35;
    }
    .pop h3 { margin: 0 0 6px; font-size: 0.9rem; font-weight: var(--fw-strong, 700); }
    .pop dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; }
    .pop dt { font-weight: var(--fw-strong, 700); white-space: nowrap; }
    .pop dd { margin: 0; color: var(--text-muted); }
    .pop p { margin: 8px 0 0; color: var(--text-muted); }
    .menu { display: grid; gap: 6px; min-width: 210px; }
    .menu button { display: flex; justify-content: flex-start; gap: 10px; width: 100%; height: 44px; }
    @media (max-width: 900px) and (min-width: 601px) { .read .lbl { display: none; } }
    @media (max-width: 600px) {
      /* A phone in portrait: the beat timeline gets its own thin row above
         the buttons, so it has the full width and nothing is clipped at 320. */
      .strip { flex-wrap: wrap; gap: 2px 4px; }
      .scrub { order: -1; flex: 1 1 100%; min-width: 0; height: 24px; }
      button { min-width: 40px; padding: 0 8px; }
      .rate { margin-left: auto; min-width: 44px; padding: 0 6px; }
      .read { padding: 0 8px; }
      .read .lbl, .wait, .voice .vk { display: none; }
      /* Q-90: speed, mute, presenter, captions and keys move into the More
         menu, so the row keeps its width (one row at 360 px, as before). */
      .strip > .tg, .strip > .keys, .strip > .rate { display: none; }
      .more { display: inline-grid; margin-left: auto; }
      .menu .rate { margin-left: 0; min-width: 0; padding: 0 10px; }
      /* the voice keeps its name on a phone (a clear label), with a smaller icon */
      .voice { padding: 0 8px 0 6px; gap: 4px; max-width: 7.5em; }
      .voice svg { width: 18px; height: 18px; }
    }
    @media (prefers-reduced-motion: reduce) { .strip { transition: none; } }
    :host([data-look="plain"]) button { border-radius: var(--radius-sm, 6px); box-shadow: none; border-width: 1px; }
    :host([data-look="plain"]) button:active { transform: none; }
    :host([data-look="plain"]) .play { box-shadow: none; }
    :host([data-look="plain"]) .seg { border-radius: 1px; height: 4px; }
    :host([data-look="plain"]) .seg.now { height: 6px; }
    :host([data-look="plain"]) .pop { border-radius: var(--radius-sm, 6px); }
  `;

  constructor() {
    super();
    this.canBack = true;
    this.capOff = false;
    this.helpOpen = false;
    this._more = false;
    this._idle = false;
    this._wake = () => this._poke();
  }

  connectedCallback() {
    super.connectedCallback();
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, this._wake, { passive: true });
  }

  disconnectedCallback() {
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, this._wake);
    clearTimeout(this._idleTimer);
    if (this._idle) this._calm(false);
    super.disconnectedCallback();
  }

  /** Any sign of the learner: show the strip, and fade it again 2.8 s later while playing. */
  _poke() {
    if (this._idle) { this._idle = false; this.toggleAttribute('idle', false); this._calm(false); }
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      const s = this._s;
      if (s?.playing && (!s.waiting || s.waiting === 'beat') && !this.helpOpen && !this._more) { this._idle = true; this.toggleAttribute('idle', true); this._calm(true); }
    }, 2800);
  }

  /** Calm (spec W1 D29n, page furniture): the narration runs and the learner
   *  is only listening, so the page around the slide may step back. Any sign
   *  of the learner, a pause or a wait ends it. LessonSession applies it. */
  _calm(on) {
    this.dispatchEvent(new CustomEvent('narration-calm', { detail: { calm: !!on }, bubbles: true, composed: true }));
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('_s')) {
      const s = this._s;
      const before = changed.get('_s');
      // a presenter hold (Q-90) leaves the strip as calm as playing does
      if (!s?.playing || (s.waiting && s.waiting !== 'beat') || before?.playing !== s?.playing) this._poke();
    }
  }

  _act(action, detail = {}) {
    this.dispatchEvent(new CustomEvent('narration-action', { detail: { action, ...detail }, bubbles: true, composed: true }));
  }

  _scrubAt(e) {
    const bar = e.currentTarget;
    const segs = [...bar.querySelectorAll('.seg')];
    const x = e.clientX;
    let i = segs.findIndex((el) => { const r = el.getBoundingClientRect(); return x >= r.left - 2 && x <= r.right + 2; });
    if (i === -1) i = x < (segs[0]?.getBoundingClientRect().left ?? 0) ? 0 : segs.length - 1;
    this.pacer?.seekTimeline(i);
  }

  _scrubKey(e) {
    const s = this._s;
    if (!s) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      const to = Math.max(0, Math.min(s.timeline.length - 1, s.timelineIndex + (e.key === 'ArrowRight' ? 1 : -1)));
      this.pacer?.seekTimeline(to);
    }
  }

  _renderScrub(s) {
    const tl = s.timeline || [];
    const cur = s.timelineIndex;
    const frac = s.durationMs > 0 ? Math.min(1, s.ms / s.durationMs) : 0;
    return html`
      <div class="scrub" role="slider" tabindex="0" aria-label="Beat" aria-valuemin="1"
           aria-valuemax=${tl.length} aria-valuenow=${Math.max(1, cur + 1)}
           aria-valuetext=${`Beat ${Math.max(1, cur + 1)} of ${tl.length}`}
           @click=${(e) => this._scrubAt(e)} @keydown=${(e) => this._scrubKey(e)}>
        ${tl.map((e, i) => html`<span class="seg ${i < cur ? 'past' : ''} ${i === cur ? 'now' : ''} ${i > 0 && tl[i - 1].blockIndex !== e.blockIndex ? 'block-start' : ''}"
            style="flex-grow:${Math.max(1, Math.round(e.ms / 1000))}"><i style=${i === cur ? `width:${(frac * 100).toFixed(1)}%` : ''}></i></span>`)}
      </div>`;
  }

  render() {
    const s = this._s;
    if (!s) return nothing;
    const playing = s.playing && !s.waiting;
    const cont = s.waiting === 'interact' || s.waiting === 'continue' || s.waiting === 'beat';
    const playLabel = s.waiting === 'interact' ? 'Skip and continue' : s.waiting === 'continue' ? 'Continue'
      : s.waiting === 'beat' ? 'Next beat' : playing ? 'Pause narration' : 'Play narration';
    const waitText = s.waiting === 'answer' ? 'Answer to continue'
      : s.waiting === 'interact' ? (s.ack ? 'Got it' : 'Your turn: try it on the slide')
        : s.waiting === 'continue' ? 'Read the feedback, then continue'
          : s.waiting === 'beat' ? 'Held. Next to go on'
            : s.blocked ? 'Tap play to listen' : '';
    const nextRate = NARRATION_RATES[(NARRATION_RATES.indexOf(s.rate) + 1) % NARRATION_RATES.length];
    // Narrator voice (Q-43): shown only when the lesson offers two or more.
    // One press moves to the next voice (with two: the other one); the label
    // names the voice now speaking and the one a press gives.
    const voices = s.voices || [];
    const vi = Math.max(0, voices.findIndex((v) => v.id === s.voice));
    const vNow = voices[vi];
    const vNext = voices[(vi + 1) % (voices.length || 1)];
    return html`
      <div class="strip" role="toolbar" aria-label="Narration">
        <button class="play ${cont ? 'cont' : ''}" aria-label=${playLabel} title=${playLabel} aria-pressed=${playing ? 'true' : 'false'}
                ?disabled=${s.waiting === 'answer'}
                @click=${() => this._act(cont ? 'continue' : 'toggle')}>${playing ? ICONS.pause : ICONS.play}${s.waiting === 'continue' ? html`<span class="lbl">Continue</span>` : ''}</button>
        <button aria-label="Previous beat" title="Previous beat" ?disabled=${!this.canBack} @click=${() => this._act('prev')}>${ICONS.prev}</button>
        <button aria-label="Next beat" title="Next beat" @click=${() => this._act('next')}>${ICONS.next}</button>
        ${this._renderScrub(s)}
        ${waitText ? html`<span class="wait" role="status">${waitText}</span>` : ''}
        ${voices.length > 1 ? html`<button class="voice" aria-label=${`Narrator voice: ${vNow.label}. Switch to ${vNext.label}`} title="Narrator voice"
                @click=${() => this._act('voice', { voice: vNext.id })}>${ICONS.voice}<span class="vk">Voice:</span><span class="vn">${vNow.label}</span></button>` : ''}
        <button class="rate" aria-label=${`Speed ${s.rate} times, change to ${nextRate}`} title="Speed"
                @click=${() => this.pacer?.setRate(nextRate)}>${s.rate === 1 ? '1x' : `${s.rate}x`}</button>
        ${this._renderTools(s, false)}
        <button class="more" aria-label="More narration options" title="More" aria-haspopup="true" aria-expanded=${this._more ? 'true' : 'false'}
                @click=${() => { this._more = !this._more; if (this._more && this.helpOpen) this._act('help'); }}>${ICONS.more}</button>
        <button class="read" aria-label="Read instead" title="Read instead" @click=${() => this._act('read')}>${ICONS.read}<span class="lbl">Read instead</span></button>
        ${this._more ? html`<div class="pop menu" role="menu" aria-label="More narration options">${this._renderTools(s, true)}</div>` : ''}
        ${this.helpOpen ? this._renderHelp(s) : ''}
      </div>
    `;
  }

  /** Mute, presenter mode, captions (presenter only) and the key list (Q-90):
   *  inline icon buttons, or labelled rows in the phone's More menu. */
  _renderTools(s, menu) {
    const act = (a) => () => { if (menu) this._more = false; this._act(a); };
    const muteLabel = s.muted ? 'Unmute narration (M)' : 'Mute narration (M)';
    const presLabel = s.presenter ? 'Presenter mode is on: stops after each beat. Turn off' : 'Presenter mode: stop after each beat, for presenting to a class (keys: ?)';
    const capLabel = this.capOff ? 'Show captions (C)' : 'Hide captions (C)';
    const role = menu ? 'menuitemcheckbox' : nothing;
    const nextRate = NARRATION_RATES[(NARRATION_RATES.indexOf(s.rate) + 1) % NARRATION_RATES.length];
    return html`
      ${menu ? html`<button class="rate" role="menuitem" aria-label=${`Speed ${s.rate} times, change to ${nextRate}`}
              @click=${() => this.pacer?.setRate(nextRate)}><span class="lbl">Speed: ${s.rate === 1 ? '1x' : `${s.rate}x`}</span></button>` : ''}
      <button class="tg" role=${role} aria-label=${muteLabel} title=${muteLabel} aria-pressed=${menu ? nothing : (s.muted ? 'true' : 'false')} aria-checked=${menu ? (s.muted ? 'true' : 'false') : nothing}
              @click=${act('mute')}>${s.muted ? ICONS.muted : ICONS.sound}${menu ? html`<span class="lbl">${s.muted ? 'Unmute' : 'Mute'}</span>` : ''}</button>
      <button class="tg" role=${role} aria-label=${presLabel} title=${presLabel} aria-pressed=${menu ? nothing : (s.presenter ? 'true' : 'false')} aria-checked=${menu ? (s.presenter ? 'true' : 'false') : nothing}
              @click=${act('presenter')}>${ICONS.presenter}${menu ? html`<span class="lbl">Presenter mode${s.presenter ? ': on' : ''}</span>` : ''}</button>
      ${s.presenter ? html`<button class="tg" role=${role} aria-label=${capLabel} title=${capLabel} aria-pressed=${menu ? nothing : (this.capOff ? 'true' : 'false')} aria-checked=${menu ? (this.capOff ? 'true' : 'false') : nothing}
              @click=${act('captions')}>${ICONS.captions}${menu ? html`<span class="lbl">${this.capOff ? 'Show captions' : 'Hide captions'}</span>` : ''}</button>` : ''}
      <button class="keys" role=${menu ? 'menuitem' : nothing} aria-label="Keyboard and remote keys (?)" title="Keyboard and remote keys (?)" aria-expanded=${this.helpOpen ? 'true' : 'false'}
              @click=${act('help')}>${menu ? html`<span aria-hidden="true">?</span><span class="lbl">Keys</span>` : '?'}</button>`;
  }

  /** The key map (Q-90), for a keyboard or a presentation remote (clicker). */
  _renderHelp(s) {
    return html`<div class="pop" role="dialog" aria-label="Narration keys">
      <h3>Keys (keyboard or presentation remote)</h3>
      <dl>
        <dt>Space</dt><dd>Play / pause</dd>
        <dt>PageDown, Right${s.presenter ? ', Down' : ''}</dt><dd>Next beat${s.presenter ? ' (finishes this one first)' : ''}</dd>
        <dt>PageUp, Left${s.presenter ? ', Up' : ''}</dt><dd>${s.presenter ? 'Restart this beat; near its start, the beat before' : 'Previous beat'}</dd>
        <dt>M</dt><dd>Mute / unmute (captions and visuals keep time)</dd>
        <dt>B or .</dt><dd>Blank the screen and pause; any key returns</dd>
        ${s.presenter ? html`<dt>C</dt><dd>Captions off / on</dd>` : ''}
        <dt>F5</dt><dd>Full screen (Esc leaves)</dd>
        <dt>?</dt><dd>This list</dd>
      </dl>
      <p>${s.presenter ? 'Presenter mode: the narration stops at the end of each beat; Next goes on.' : 'Presenter mode (the screen icon) stops after each beat, for presenting to a class.'}</p>
    </div>`;
  }
}
customElements.define('narration-strip', NarrationStrip);

// ── the caption overlay ───────────────────────────────────────────────────

/** Minimum room a band needs before captions go there. */
const BAND_MIN_W = 240;
const GAP = 8;
/** How long a slide's title stays up before it fades. */
const TITLE_MS = 3200;
/** Narrowest side band a title card may sit in. */
const TITLE_MIN_W = 180;

export class NarrationCaptions extends PacerFollower(LitElement) {
  static properties = {
    /** (seg) => the mounted block's narrationStage(seg) result, or null. */
    stageInfo: { attribute: false },
    /** The slide's title (shown for a few seconds when the slide opens, never spoken). */
    slideTitle: { attribute: false },
    /** "Full text" (spec W1 D29n): the whole beat in the caption, not one phrase. */
    fullText: { type: Boolean },
    /** Presenter captions off (Q-90): no caption box; visuals unchanged. */
    capOff: { type: Boolean },
    /** Changes once per slide: a new value shows the title again. */
    titleKey: { attribute: false },
    _titleOn: { state: true },
  };

  static styles = css`
    :host { position: fixed; inset: 0; pointer-events: none; z-index: 29; }
    .cap {
      position: fixed; box-sizing: border-box; visibility: hidden;
      padding: 10px 16px 11px; border-radius: var(--radius-lg, 16px);
      background: var(--narr-cap-bg); color: var(--narr-cap-ink);
      border: var(--rule-w, 2px) solid var(--narr-cap-rim);
      font-family: var(--font-heading); font-weight: var(--fw-medium, 500);
      font-size: clamp(1rem, 0.9rem + 0.45vw, 1.28rem); line-height: 1.42;
      text-align: center; text-wrap: balance;
      transition: opacity var(--motion-fast, 140ms) ease-out;
    }
    .cap.placed { visibility: visible; }
    /* One phrase at a time (spec W1 D29n): the box keeps two lines' height so a
       shorter or longer phrase never moves it, and each new phrase fades in. */
    .cap { display: flex; flex-direction: column; justify-content: center; min-height: calc(2 * 1.42em + 21px); }
    .cap .ph { display: block; }
    @media (prefers-reduced-motion: no-preference) {
      .cap .ph.pa { animation: narr-ph-a 220ms ease-out both; }
      .cap .ph.pb { animation: narr-ph-b 220ms ease-out both; }
      @keyframes narr-ph-a { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
      @keyframes narr-ph-b { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    }
    .cap.full { text-align: left; text-wrap: pretty; font-size: clamp(0.98rem, 0.92rem + 0.3vw, 1.12rem); }
    .cap.full .w:not(.past):not(.now) { color: var(--narr-word-next); }
    .cap.reading { text-align: left; background: var(--narr-cap-bg-over); }
    /* The "Full text" switch: a small tab on the caption's top edge. */
    .ft {
      position: absolute; top: -14px; right: 12px; pointer-events: auto;
      min-height: 28px; padding: 0 10px; box-sizing: border-box;
      border: 1px solid var(--narr-cap-rim); border-radius: var(--radius-pill, 999px);
      background: var(--narr-cap-bg-over); color: var(--text-muted);
      font: inherit; font-family: var(--font-ui); font-size: 0.78rem; font-weight: var(--fw-strong, 700);
      cursor: pointer; opacity: 0.85;
    }
    .ft:hover, .ft:focus-visible { opacity: 1; color: var(--text-main); }
    .ft:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
    @media (pointer: coarse) { .ft { min-height: 32px; top: -17px; } }
    :host([data-look="plain"]) .ft { border-radius: var(--radius-sm, 6px); }
    .cap.over { background: var(--narr-cap-bg-over); box-shadow: var(--shadow-md); }
    .cap.empty { opacity: 0; }
    .w { border-radius: 4px; padding: 0 1px; margin: 0 -1px; color: var(--narr-word-next);
         background: linear-gradient(var(--narr-word-sweep), var(--narr-word-sweep)) no-repeat 0 0 / 0% 100%; }
    .w.past { color: var(--narr-cap-ink); }
    .w.now { color: var(--narr-word-now-ink); background-size: 100% 100%; box-shadow: inset 0 -0.12em var(--narr-word-sweep); }
    @media (prefers-reduced-motion: no-preference) {
      .w.now.sweep { animation: narr-sweep var(--wd, 300ms) linear both; }
      @keyframes narr-sweep { from { background-size: 0% 100%; } to { background-size: 100% 100%; } }
    }
    @media (max-height: 499px) {
      .cap { font-size: 0.98rem; line-height: 1.3; padding: 6px 14px 7px; min-height: 0; }
    }
    :host([data-look="plain"]) .cap {
      font-family: var(--font-family); font-weight: 450; border-radius: var(--radius-sm, 8px); border-width: 1px;
      letter-spacing: 0.005em;
    }
    :host([data-look="plain"]) .w { border-radius: 2px; }

    /* The slide title: a transient card in free room beside or above the
       picture. Fades in, holds about 3 s, fades out. */
    .ttl {
      position: fixed; box-sizing: border-box; visibility: hidden; opacity: 0;
      max-width: 380px; padding: 10px 16px 11px 18px;
      border-radius: var(--radius-lg, 16px);
      background: var(--narr-cap-bg-over); color: var(--text-main);
      border: var(--rule-w, 2px) solid var(--narr-cap-rim);
      box-shadow: var(--shadow-md), inset 4px 0 0 var(--primary-color);
      font-family: var(--font-heading); font-weight: var(--fw-strong, 700);
      font-size: clamp(1.05rem, 0.95rem + 0.5vw, 1.4rem); line-height: 1.25;
      text-wrap: balance;
      transform: translateY(6px);
      transition: opacity 420ms ease-out, transform 420ms ease-out;
    }
    .ttl.placed { visibility: visible; }
    .ttl.placed.on { opacity: 1; transform: none; }
    .cap.yield { opacity: 0; }
    :host([data-look="plain"]) .ttl {
      border-radius: var(--radius-sm, 6px); border-width: 1px;
      box-shadow: var(--shadow-md); border-top: 2px solid var(--primary-color);
      padding: 10px 16px 12px; font-weight: var(--fw-medium, 500); letter-spacing: -0.005em;
    }

    /* "Your turn": the beat asked the learner to do something in the scene. */
    .turn {
      position: fixed; box-sizing: border-box; visibility: hidden; pointer-events: auto;
      display: flex; align-items: center; gap: var(--space-3, 12px);
      padding: 8px 8px 8px 16px; border-radius: var(--radius-pill, 999px);
      background: var(--narr-cap-bg-over); color: var(--text-main);
      border: var(--rule-w, 2px) solid var(--primary-color);
      box-shadow: var(--shadow-md);
      font-family: var(--font-ui);
    }
    .turn.placed { visibility: visible; }
    .turn .t-txt { flex: 1 1 auto; min-width: 0; line-height: 1.3; }
    .turn b { color: var(--primary-color); font-weight: var(--fw-strong, 700); margin-right: 6px; }
    .turn .t-why { color: var(--text-muted); }
    .turn button.done { border-color: var(--primary-color); background: var(--primary-color); color: var(--on-primary); box-shadow: var(--lip, 0 3px 0) var(--primary-hover); }
    .turn.ack { border-color: var(--success-text); background: var(--success-bg); }
    .turn.ack b { color: var(--success-text); display: inline-flex; align-items: center; gap: 6px; }
    .turn .tick { width: 10px; height: 5px; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-2px) rotate(-45deg); }
    .turn button {
      flex: none; min-height: 40px; padding: 0 16px; box-sizing: border-box;
      border: var(--rule-w, 2px) solid var(--border-color); border-radius: var(--radius-pill, 999px);
      background: var(--bg-surface); color: var(--text-main);
      box-shadow: var(--lip, 0 3px 0) var(--border-color);
      font: inherit; font-weight: var(--fw-strong, 700); cursor: pointer;
    }
    .turn button:active { transform: translateY(2px); box-shadow: none; }
    .turn button:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset, 2px); }
    :host([data-look="plain"]) .turn { border-radius: var(--radius-sm, 6px); border-width: 1px; border-left: 3px solid var(--primary-color); }
    :host([data-look="plain"]) .turn button { border-radius: var(--radius-sm, 6px); border-width: 1px; box-shadow: none; }
    :host([data-look="plain"]) .turn button:active { transform: none; }
    @media (prefers-reduced-motion: reduce) { .ttl { transition: none; transform: none; } }
  `;

  constructor() {
    super();
    this._raf = 0;
    this._onWin = () => this._schedule();
    this._onVis = () => this._pollSync();
    this.slideTitle = '';
    this.fullText = false;
    this.capOff = false;
    this.titleKey = 0;
    this._titleOn = false;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('resize', this._onWin);
    window.addEventListener('scroll', this._onWin, { passive: true, capture: true });
    document.addEventListener('visibilitychange', this._onVis);
    this._pollSync();
  }

  /**
   * Layouts settle on their own clocks (theatre fit, fonts, a scene's first
   * frame): re-place a few times a second, but only while a caption or a
   * "Your turn" box is showing and the tab can be seen (Q-46: the poll ran on
   * with nothing to place and in hidden tabs).
   */
  _pollSync() {
    const want = this.isConnected && document.visibilityState !== 'hidden' && !!this.renderRoot?.querySelector('.cap, .turn');
    if (want && !this._poll) this._poll = setInterval(() => this._schedule(), 400);
    else if (!want && this._poll) { clearInterval(this._poll); this._poll = 0; }
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this._onWin);
    window.removeEventListener('scroll', this._onWin, { capture: true });
    document.removeEventListener('visibilitychange', this._onVis);
    clearInterval(this._poll);
    this._poll = 0;
    clearTimeout(this._titleTimer);
    cancelAnimationFrame(this._raf);
    super.disconnectedCallback();
  }

  /** A new slide: show its title for about 3 s, then let it fade. */
  willUpdate(changed) {
    super.willUpdate?.(changed);
    if ((changed.has('titleKey') || changed.has('slideTitle')) && this._shownKey !== this.titleKey) {
      this._shownKey = this.titleKey;
      clearTimeout(this._titleTimer);
      this._titleOn = !!this.slideTitle;
      if (this._titleOn) this._titleTimer = setTimeout(() => { this._titleOn = false; }, TITLE_MS);
    }
  }

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._place(); });
  }

  updated(changed) {
    super.updated(changed);
    this._place();
    this._pollSync();
  }

  /** The visible lesson viewport, between the sticky head and the bottom bar. */
  _viewport() {
    const cs = getComputedStyle(document.documentElement);
    const top = parseFloat(cs.getPropertyValue('--lesson-sticky-header-h')) || 0;
    const bottom = parseFloat(cs.getPropertyValue('--lesson-chrome-bottom')) || 0;
    const right = parseFloat(cs.getPropertyValue('--lesson-chrome-right')) || 0;
    return { left: GAP, top: top + GAP, right: window.innerWidth - Math.max(GAP, right), bottom: window.innerHeight - bottom - GAP };
  }

  /** Puts the box at (left, top) with width w, if its measured height fits maxH. */
  _try(box, left, top, w, maxH, anchor = 'top') {
    box.style.width = `${Math.round(w)}px`;
    const h = box.offsetHeight;
    if (h > maxH + 0.5) return false;
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(anchor === 'bottom' ? top - h : top)}px`;
    return true;
  }

  _place() {
    const box = this.renderRoot?.querySelector('.cap, .turn');
    if (!box) return;
    const info = this.stageInfo?.(this._s?.narrated ? this._s.segment : null);
    this._info = info;
    const vp = this._viewport();
    const vw = vp.right - vp.left;
    // "Your turn" is a small hint, not a caption: narrower.
    const wide = (w) => Math.min(w, box.classList.contains('turn') ? 440 : 760);
    box.classList.remove('over', 'reading');
    let ok = false;

    // A held prompt with its own opening picture (narrationCover, Q-90)
    // reports a 'media' stage: the caption keeps off it like any picture.
    if (this._s?.prompt === 'held' && info?.kind !== 'media') {
      // A question/exercise/game prompt while its card is held back (Q-77):
      // the phrase stands alone, a third of the way down the empty view.
      const w = wide(vw);
      const left = vp.left + (vw - w) / 2;
      const top = vp.top + (vp.bottom - vp.top) * 0.3;
      ok = this._try(box, left, top, w, vp.bottom - top) || this._try(box, left, vp.top, w, Infinity);
      box.classList.add('reading');
    } else if (info?.inPlace) {
      // A text slide: the prose stays and lights the spoken word itself
      // (content-block narrationWord()), so no caption repeats it.
      ok = false;
    } else if (info?.kind === 'text' && info.reading && info.stage) {
      // A text slide read phrase by phrase (spec W1 D29n): the prose is held
      // back and the phrase sits where the beat is, at its width.
      const st = info.stage;
      const w = Math.min(Math.max(240, st.right - st.left), vw);
      const left = Math.max(vp.left, Math.min(st.left, vp.right - w));
      const top = Math.max(vp.top, Math.min(st.top, vp.bottom - 80));
      ok = this._try(box, left, top, w, vp.bottom - top);
      if (!ok) ok = this._try(box, left, top, w, Infinity);
      box.classList.add('reading');
    } else if (info?.kind === 'text' && info.stage) {
      // A text slide read from a teacher script: the prose stays unlit and
      // the caption keeps off the beat being read (info.stage). Below it, in
      // the free space at the foot of the view; else in the band above it;
      // else over the foot of the view, like subtitles.
      const w = wide(vw);
      const left = vp.left + (vw - w) / 2;
      const st = info.stage;
      const below = vp.bottom - Math.max(st.bottom + GAP, vp.top);
      ok = below > 0 && this._try(box, left, vp.bottom, w, below, 'bottom');
      const above = Math.min(st.top - GAP, vp.bottom) - vp.top;
      if (!ok && above > 0) ok = this._try(box, left, st.top - GAP, w, above, 'bottom');
      if (!ok) { ok = this._try(box, left, vp.bottom, w, Infinity, 'bottom'); box.classList.add('over'); }
    } else if (!info || info.kind === 'text' || info.kind === 'block') {
      // No picture and no in-place highlight: a question (kind 'block', just
      // its box) or a block that reports nothing. Below the whole block when
      // the room under it fits the caption; else docked at the top, over the
      // stem being read, so the answer options stay clear. Once the question
      // waits for its answer the caption is gone (render()).
      const w = wide(vw);
      const left = vp.left + (vw - w) / 2;
      const below = info?.stage ? vp.bottom - Math.max(info.stage.bottom + GAP, vp.top) : -1;
      ok = below > 0 && this._try(box, left, vp.bottom, w, below, 'bottom');
      if (!ok) ok = this._try(box, left, vp.top, w, vp.bottom - vp.top);
      if (ok) box.classList.add('over');
    } else {
      const st = info.stage;
      const area = info.area || st;
      const clip = (r) => ({ left: Math.max(r.left, vp.left), right: Math.min(r.right, vp.right), top: Math.max(r.top, vp.top), bottom: Math.min(r.bottom, vp.bottom) });
      // 1. the scene's own free area
      if (info.free) {
        const f = clip(info.free);
        const w = f.right - f.left - 2 * GAP;
        if (w >= 200) ok = this._try(box, f.left + GAP + (w - wide(w)) / 2, f.top + GAP, wide(w), f.bottom - f.top - 2 * GAP);
      }
      // 2. the letterbox bands the picture leaves (below, above, right, left)
      const a = clip({ left: area.left, right: area.right, top: area.top, bottom: Math.max(area.bottom, vp.bottom) });
      const span = (l, r) => { const w = Math.min(r - l, vw) - 2 * GAP; return w; };
      if (!ok) {
        const w = span(Math.max(a.left, vp.left), Math.min(a.right, vp.right));
        const top = Math.max(st.bottom + GAP, vp.top);
        if (w >= BAND_MIN_W && st.bottom < vp.bottom) {
          ok = this._try(box, Math.max(a.left, vp.left) + GAP + (w - wide(w)) / 2, top, wide(w), vp.bottom - top);
        }
      }
      if (!ok) {
        const w = span(Math.max(a.left, vp.left), Math.min(a.right, vp.right));
        const bottom = Math.min(st.top - GAP, vp.bottom);
        if (w >= BAND_MIN_W && st.top > a.top) {
          ok = this._try(box, Math.max(a.left, vp.left) + GAP + (w - wide(w)) / 2, bottom, wide(w), bottom - a.top, 'bottom');
        }
      }
      if (!ok) {
        const rw = Math.min(a.right, vp.right) - st.right - 2 * GAP;
        const lw = st.left - Math.max(a.left, vp.left) - 2 * GAP;
        const top = Math.max(st.top, vp.top);
        const maxH = Math.min(st.bottom, vp.bottom) - top;
        if (rw >= BAND_MIN_W) ok = this._try(box, st.right + GAP, top, Math.min(rw, 420), maxH);
        if (!ok && lw >= BAND_MIN_W) ok = this._try(box, st.left - GAP - Math.min(lw, 420), top, Math.min(lw, 420), maxH);
      }
      // 3. a portrait phone: above the scene, over the top of it if need be
      const portraitPhone = window.innerHeight > window.innerWidth && window.innerWidth <= 600;
      if (!ok && portraitPhone) {
        const w = vw;
        const bottom = Math.max(st.top - GAP, vp.top + 40);
        ok = this._try(box, vp.left, bottom, w, bottom - vp.top, 'bottom');
        // Q-85: as high as the view allows, over the picture's top margin
        // rather than one gap into the scene (it covered a scene's first label).
        if (!ok) { ok = this._try(box, vp.left, vp.top, w, Infinity); box.classList.add('over'); }
      }
      // 4. else over the foot of the picture, like subtitles
      if (!ok) {
        const s = clip(st);
        const w = wide(Math.max(200, s.right - s.left - 4 * GAP));
        ok = this._try(box, s.left + (s.right - s.left - w) / 2, s.bottom - 2 * GAP, w, Infinity, 'bottom');
        box.classList.add('over');
      }
    }
    // "Your turn" must always show: with no room found, it sits just above the strip.
    if (!ok && box.classList.contains('turn')) {
      const w = wide(vw);
      ok = this._try(box, vp.left + (vw - w) / 2, vp.bottom, w, Infinity, 'bottom');
    }
    box.classList.toggle('placed', ok);
    this._placeTitle(info, vp, ok && box.classList.contains('cap') ? box : null);
  }

  /**
   * The title card: beside the picture (left, then right), else in the band
   * above it, else in the band between it and the caption. Never over the
   * picture or its controls, never in the caption's spot (Q-77): with no
   * such room (a phone) there is no title card.
   */
  _placeTitle(info, vp, capBox) {
    const t = this.renderRoot?.querySelector('.ttl');
    if (!t) return;
    const cap = capBox?.getBoundingClientRect();
    capBox?.classList.remove('yield');
    let ok = false;
    const st = info?.stage;
    // Only where the slide's own prose (and its heading) is hidden behind a
    // picture: a text slide or a question card shows its title already.
    if (st && !info.inPlace && (info.kind === 'scene' || info.kind === 'media' || (info.kind === 'text' && info.reading))) {
      const top = Math.max(st.top, vp.top);
      const avoidCap = (l, tp, w) => {
        if (!cap || cap.height === 0) return true;
        const h = t.offsetHeight;
        return l + w <= cap.left || l >= cap.right || tp + h <= cap.top || tp >= cap.bottom;
      };
      // 1. the side bands, top-aligned with the picture, hugging it
      const fit = (max) => { t.style.width = 'auto'; t.style.maxWidth = `${Math.round(max)}px`; const w = Math.ceil(t.getBoundingClientRect().width); t.style.maxWidth = ''; return Math.min(max, w); };
      const lw = Math.min(380, st.left - vp.left - 2 * GAP);
      if (lw >= TITLE_MIN_W) {
        const w = fit(lw);
        ok = this._try(t, st.left - GAP * 2 - w, top, w, vp.bottom - top) && avoidCap(st.left - GAP * 2 - w, top, w);
      }
      const rw = Math.min(380, vp.right - st.right - 2 * GAP);
      if (!ok && rw >= TITLE_MIN_W) ok = this._try(t, st.right + GAP * 2, top, rw, vp.bottom - top) && avoidCap(st.right + GAP * 2, top, rw);
      // 2. the band above the picture
      const vw = vp.right - vp.left;
      const w = Math.min(560, vw - 2 * GAP);
      const cx = vp.left + (vw - w) / 2;
      if (!ok && st.top - vp.top > 2 * GAP) {
        ok = this._try(t, cx, st.top - GAP, w, st.top - vp.top - 2 * GAP, 'bottom') && avoidCap(cx, st.top - GAP - t.offsetHeight, w);
      }
      // 3. the band below the picture, above the caption
      if (!ok) {
        const floor = cap && cap.top > st.bottom ? cap.top - GAP : vp.bottom;
        if (floor - st.bottom > 2 * GAP) ok = this._try(t, cx, st.bottom + GAP, w, floor - st.bottom - 2 * GAP);
      }
      // No room (a phone): no title card. It never takes the caption's spot,
      // which must show the phrase being spoken (Q-77, spec W1 D29n).
    }
    t.classList.toggle('placed', ok);
    t.classList.toggle('on', ok && this._titleOn);
  }

  _skip() {
    this.dispatchEvent(new CustomEvent('narration-action', { detail: { action: 'continue' }, bubbles: true, composed: true }));
  }

  _renderTitle() {
    return html`<div class="ttl" aria-hidden="true">${this.slideTitle || ''}</div>`;
  }

  render() {
    const s = this._s;
    const seg = s?.segment;
    const title = this._renderTitle();
    // The beat asked the learner to act in the scene: "Your turn", with Skip.
    if (s?.narrated && s.waiting === 'interact') {
      // Detected and dwelling (spec W1 Q-41): a small "Got it" while the result is read, then on.
      if (s.ack) {
        return html`${title}<div class="turn ack" role="status">
          <span class="t-txt"><b><span class="tick" aria-hidden="true"></span>Got it</b><span class="t-why">The narration goes on in a moment.</span></span>
          <button type="button" @click=${() => this._skip()}>Continue</button>
        </div>`;
      }
      // Open exploration has no end a scene can detect: the learner says Done.
      return html`${title}<div class="turn" role="status">
        <span class="t-txt"><b>Your turn</b><span class="t-why">Narration paused.</span> ${seg?.hint || 'Try it on the slide.'}</span>
        ${s.free ? html`<button type="button" class="done" @click=${() => this._skip()}>Done</button>` : ''}
        <button type="button" @click=${() => this._skip()}>Skip</button>
      </div>`;
    }
    // No caption while a question waits for its answer, or while its feedback
    // is read: the options and the explanation need the room.
    // A prompt whose card is on screen (its last phrase, or paused): the
    // card's own stem carries the words, so the caption steps aside (Q-77).
    if (s?.prompt === 'shown' || this.capOff) return html`${title}<div class="cap empty" aria-hidden="true"></div>`;
    if (!s?.narrated || !seg || s.waiting === 'answer' || s.waiting === 'continue') return html`${title}<div class="cap empty" aria-hidden="true"></div>`;
    const words = seg.words || [];
    const spans = wordSpans(seg.text, words);
    // The whole beat on "Full text" (spec W1 D29n); else only the phrase
    // being spoken, paused too: a whole beat would cover the picture (a text
    // slide shows its own prose again on pause instead).
    const full = !!this.fullText;
    // A phone-width box: shorter phrases, so a caption stays two lines; a
    // short landscape screen: one line, sized to the box.
    const short = window.innerHeight < 500;
    const opts = short ? { maxWords: 9, maxChars: Math.max(36, Math.floor(Math.min(window.innerWidth - 96, 760) / 10)) }
      : window.innerWidth < 480 ? { maxWords: 10, maxChars: 64 } : undefined;
    const phrases = captionPhrases(seg, opts);
    const wi = s.wordIndex;
    const k = phraseAt(phrases, wi);
    const [a, b] = full ? [0, words.length - 1] : (phrases[k] || [0, -1]);
    const sweep = !reducedMotion() && s.playing && !s.waiting;
    const rate = s.rate || 1;
    const parts = [];
    for (let i = a; i <= b; i++) {
      const [c0, c1] = spans[i];
      const cls = i < wi ? 'past' : i === wi ? `now${sweep ? ' sweep' : ''}` : '';
      const dur = Math.max(80, ((words[i][1] - words[i][0]) || 250) / rate);
      parts.push(html`<span class="w ${cls}" style=${i === wi ? `--wd:${Math.round(dur)}ms` : ''}>${seg.text.slice(c0, c1)}</span>`);
      if (i < b) parts.push(' ');
    }
    // The whole beat is read aloud; the box itself is not a live region (a
    // screen reader user hears the audio, and the prose is one switch away).
    const ftLabel = this.fullText ? 'Show one phrase' : 'Show full text';
    return html`${title}<div class="cap ${full ? 'full' : ''}"><span class="ph ${full ? '' : k % 2 ? 'pa' : 'pb'}" aria-hidden="true">${parts.length ? parts : seg.text}</span><button type="button" class="ft" aria-pressed=${this.fullText ? 'true' : 'false'} title=${ftLabel} aria-label=${ftLabel}
        @click=${() => this.dispatchEvent(new CustomEvent('narration-action', { detail: { action: 'fulltext' }, bubbles: true, composed: true }))}>${this.fullText ? 'One phrase' : 'Full text'}</button></div>`;
  }
}
customElements.define('narration-captions', NarrationCaptions);
