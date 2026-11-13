import { LitElement, html, css } from 'lit';

export class ProgressBar extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .track {
      background: var(--border-color);
      border-radius: var(--radius-pill);
      height: var(--seg-h, 10px);
      width: 100%;
      overflow: hidden;
      position: relative;
    }
    /* A slim variant for contexts with little vertical room to spare (e.g.
       LessonSession's mobile-landscape compact header) - same semantics,
       just a thinner visual track. */
    .track.compact { height: 3px; border-radius: 0; }
    .fill {
      background: var(--bar-fill, linear-gradient(90deg, var(--accent-amber), var(--accent-teal)));
      height: 100%;
      transition: width var(--motion-slow) var(--ease-settle);
      border-radius: var(--radius-pill);
    }
    /* Beat pips: one segment per step, for showing position inside a block
       rather than across the lesson. Uses a repeating mask so the count is
       data-driven with no per-pip DOM. */
    .track.segmented .fill {
      -webkit-mask-image: var(--seg-mask);
      mask-image: var(--seg-mask);
    }
    .sr-only {
      position: absolute;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    /* Blocks variant (Classic, lesson-modes-plan.md / prototype A): one
       segment per slide; done slides fill solid, the current one fills by
       how many of its beats are shown, with a tick at each beat boundary.
       Falls back to the continuous track past MAX_SEGMENTS, where a segment
       would shrink below a readable width on a phone. */
    /* --seg-* (h, gap, border, track, now, done): optional, unset under Quill. A look may slim the track; each
       fallback is the size that spot has always had. */
    .segs { display: flex; gap: var(--seg-gap, 6px); }
    .seg {
      flex: 1 1 0;
      min-width: 0;
      height: var(--seg-h, 12px);
      border-radius: var(--radius-pill);
      background: var(--seg-track, var(--bg-panel-2, var(--border-color)));
      border: var(--seg-border, 1px solid var(--border-color));
      position: relative;
      overflow: hidden;
    }
    .seg.current { border-color: var(--border-hover); }
    .seg-fill {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0;
      border-radius: inherit;
      background: var(--seg-now, linear-gradient(90deg, var(--accent-gold), color-mix(in srgb, var(--accent-gold) 55%, var(--accent-coral))));
      transition: width 450ms var(--motion-reveal-ease);
    }
    /* --seg-now / --seg-done: optional look tokens (unset under Quill). */
    .seg.done .seg-fill { width: 100%; background: var(--seg-done, var(--accent-teal)); }
    .tick {
      position: absolute;
      top: 50%;
      width: 4px;
      height: 4px;
      margin: -2px 0 0 -2px;
      border-radius: 50%;
      background: var(--bg-surface);
      opacity: var(--seg-tick-opacity, 0.8);
    }
    .compact .seg { height: var(--seg-h, 6px); }
    .compact .tick { display: none; }
    @media (max-width: 600px) {
      .segs { gap: var(--seg-gap, 4px); }
      .seg { height: var(--seg-h, 10px); }
    }
    @media (max-height: 540px) and (orientation: landscape) {
      .seg { height: var(--seg-h, 9px); }
    }
    /* Trail variant (Story, prototype v2 b/ .trail): ink dots joined by a
       dashed path; done dots green, the current one gold with a slowly
       turning dashed ring. Links shrink before the dots do on a phone. */
    .trail { display: flex; align-items: center; justify-content: center; }
    .tnode {
      flex: none;
      width: 15px;
      height: 15px;
      box-sizing: border-box;
      border-radius: 50%;
      border: var(--rule-w, 2px) solid var(--border-color);
      background: var(--bg-surface);
      position: relative;
    }
    .tnode.done { background: var(--accent-teal); }
    .tnode.now { background: var(--accent-gold); transform: scale(1.3); }
    .tnode.now::after {
      content: '';
      position: absolute;
      inset: -7px;
      border-radius: 50%;
      border: 2px dashed var(--accent-gold);
      animation: trail-spin 9s linear infinite;
    }
    .tlink {
      flex: 0 1 26px;
      min-width: 4px;
      height: 3px;
      background: repeating-linear-gradient(90deg, var(--border-color) 0 5px, transparent 5px 9px);
      opacity: 0.55;
    }
    @keyframes trail-spin { to { transform: rotate(360deg); } }

    /* Offline marks (Q-100a): a slide whose files are not all on this device
       yet is drawn as an outline only (dashed, hollow), so the solid ones
       read as "here" and the dashed ones as "needs the internet". A done or
       current segment keeps its fill; only its edge turns dashed. */
    .seg.away {
      border-style: dashed;
      border-color: var(--seg-away, color-mix(in srgb, var(--text-muted) 70%, transparent));
      background: transparent;
    }
    .tnode.away {
      border-style: dashed;
      border-color: var(--seg-away, color-mix(in srgb, var(--text-muted) 75%, transparent));
    }
    .tnode.away:not(.done):not(.now) { background: transparent; }
    @media (prefers-reduced-motion: reduce) {
      .fill, .seg-fill { transition: none; }
      .tnode.now::after { animation: none; }
    }
  
  `;

  static properties = {
    current: { type: Number },
    total: { type: Number },
    label: { type: String },
    compact: { type: Boolean },
    /** Draw the fill as N discrete pips instead of one continuous bar. */
    segments: { type: Number },
    /**
     * What a screen reader should say instead of "<current> out of <total>".
     *
     * `aria-valuenow` stays a whole number no matter what — a caller that
     * wanted to show sub-block progress by passing a fraction would otherwise
     * make this announce "0.67 out of 12". Anything finer-grained than the
     * step belongs in words here, with the numeric value left alone.
     */
    valueText: { type: String },
    /** 'bar' (default, continuous) or 'blocks' (one segment per slide). */
    variant: { type: String },
    /** Blocks variant only: the current slide's revealed beat and beat count. */
    step: { type: Number },
    steps: { type: Number },
    /** Optional, one boolean per slide: false = not saved for offline yet (dashed mark). */
    offline: { type: Array }
  };

  static MAX_SEGMENTS = 24;

  constructor() {
    super();
    this.current = 0;
    this.total = 100;
    this.label = "Progress";
    this.valueText = '';
    this.compact = false;
    this.segments = 0;
    this.variant = 'bar';
    this.step = 0;
    this.steps = 1;
    this.offline = null;
  }

  /** ' away' for a slide index known not to be saved for offline. */
  _away(i) {
    return Array.isArray(this.offline) && this.offline[i] === false ? ' away' : '';
  }

  _renderTrail(safeCurrent, safeTotal) {
    return html`
      <div class="trail" aria-hidden="true">
        ${Array.from({ length: safeTotal }, (_, i) => html`
          <span class="tnode ${i < safeCurrent - 1 ? 'done' : i === safeCurrent - 1 ? 'now' : ''}${this._away(i)}"></span>
          ${i < safeTotal - 1 ? html`<span class="tlink"></span>` : ''}
        `)}
      </div>
    `;
  }

  _renderBlocks(safeCurrent, safeTotal) {
    const steps = Math.max(1, Math.round(this.steps || 1));
    const step = Math.max(0, Math.min(Math.round(this.step || 0), steps - 1));
    const nowPct = ((step + 1) / steps) * 100;
    const ticks = [];
    for (let k = 1; k < steps; k++) ticks.push((k / steps) * 100);
    return html`
      <div class="segs ${this.compact ? 'compact' : ''}" aria-hidden="true">
        ${Array.from({ length: safeTotal }, (_, i) => {
          // `current` is 1-based (LessonEngine._progressCurrent()).
          const state = i < safeCurrent - 1 ? 'done' : (i === safeCurrent - 1 ? 'current' : '');
          return html`<div class="seg ${state}${this._away(i)}">
            <div class="seg-fill" style=${state === 'current' ? `width: ${nowPct}%` : ''}></div>
            ${state === 'current' ? ticks.map((t) => html`<i class="tick" style=${`left: ${t}%`}></i>`) : ''}
          </div>`;
        })}
      </div>
    `;
  }

  render() {
    const safeTotal = Math.max(1, Math.round(this.total));
    const safeCurrent = Math.max(0, Math.min(Math.round(this.current), safeTotal));
    const percentage = (safeCurrent / safeTotal) * 100;
    const away = Array.isArray(this.offline) ? this.offline.filter((v) => v === false).length : 0;
    const text = (this.valueText || `${safeCurrent} out of ${safeTotal}`) + (away ? `; ${away} ${away === 1 ? 'slide needs' : 'slides need'} the internet` : '');

    return html`
      <div
        role="progressbar"
        aria-valuenow=${safeCurrent}
        aria-valuemin="0"
        aria-valuemax=${safeTotal}
        aria-valuetext=${text}
        aria-label=${this.label}
      >
        <span class="sr-only">${text}</span>
        ${this.variant === 'trail' && safeTotal <= ProgressBar.MAX_SEGMENTS ? this._renderTrail(safeCurrent, safeTotal)
          : this.variant === 'blocks' && safeTotal <= ProgressBar.MAX_SEGMENTS ? this._renderBlocks(safeCurrent, safeTotal) : html`<div
          class="track ${this.compact ? 'compact' : ''} ${this.segments > 1 ? 'segmented' : ''}"
          style=${this.segments > 1 ? `--seg-mask: repeating-linear-gradient(90deg, #000 0 calc(${100 / this.segments}% - 3px), transparent calc(${100 / this.segments}% - 3px), transparent ${100 / this.segments}%)` : ''}
          aria-hidden="true">
          <div class="fill" style=${'width: ' + percentage + '%'}></div>
        </div>`}
      </div>
    `;
  }
}

customElements.define('progress-bar', ProgressBar);
