import { LitElement, html, css } from 'lit';
import { btn3dStyles } from '../sharedStyles.js';
import { iconArrowRight } from '../icons/uiIcons.js';
import './ProgressRing.js';
import { GamificationMixin } from '../../core/mixins/GamificationMixin.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import './LookSlots.js';

/**
 * <module-hero-card>: the Classic "continue" hero (prototype v2 a/ .hero-card).
 * One card per module: art tile with the look's companion, kicker, title, tagline, progress
 * ring with "x of y lessons done", and one big call to action naming the next
 * lesson. Used by HomeDashboard (the most recently touched module) and
 * ModuleDashboard (its own module), so a course looks the same from the shelf
 * through to its lesson list. Pure presentation: callers resolve the next
 * lesson (core/lessonProgressRules.js) and pass plain strings.
 */
export class ModuleHeroCard extends LookMixin(GamificationMixin(LitElement)) {
  static properties = {
    kicker: { type: String },
    heading: { type: String },
    tagline: { type: String },
    /** 0..1 */
    progress: { type: Number },
    done: { type: Number },
    total: { type: Number },
    ctaLabel: { type: String },
    ctaHref: { type: String },
    /** Render the heading as h1 (a page's own title) instead of h2. */
    primary: { type: Boolean },
    /** A look's course cover (<look-cover>): its seed and subject line. */
    coverSeed: { type: String },
    coverSubject: { type: String },
  };

  static styles = [btn3dStyles, css`
    :host { display: block; }
    .hero-card {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: var(--space-6);
      align-items: center;
      /* --hero-*: optional, unset under Quill. A look may give the hero its own
         surface; the fallbacks are the page's own tokens. */
      background: var(--hero-surface, var(--bg-surface));
      border: var(--rule-w) solid var(--hero-rule, var(--border-color));
      border-radius: var(--radius-xl);
      padding: var(--space-5);
      box-shadow: var(--card-shadow);
      animation: hero-rise var(--motion-entrance, 550ms) var(--motion-reveal-ease) both;
    }
    .hero-art {
      position: relative;
      aspect-ratio: 1;
      border-radius: var(--radius-lg);
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--hero-art-bg);
    }
    .hero-art companion-slot > * { animation: hero-bob 4.2s ease-in-out infinite; }
    .kicker {
      font-size: 0.75rem;
      font-weight: var(--fw-heavy);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--hero-kicker, var(--accent-coral));
    }
    h1, h2 {
      font-family: var(--font-heading);
      font-size: var(--fs-hero);
      line-height: var(--lh-tight);
      margin: 6px 0 8px;
      color: var(--hero-ink, var(--text-main));
    }
    p {
      margin: 0 0 var(--space-4);
      color: var(--hero-soft, var(--text-soft));
      max-width: 52ch;
    }
    .hero-progress {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-5);
    }
    progress-ring {
      width: 64px;
      --ring-color: var(--accent-teal);
      --ring-track: var(--bg-panel-2);
      --ring-width: 5;
    }
    .pmeta {
      font-weight: var(--fw-heavy);
      font-size: 0.9rem;
      color: var(--hero-muted, var(--text-muted));
    }
    .pmeta b {
      display: block;
      font-family: var(--font-heading);
      font-size: 1.2rem;
      color: var(--hero-ink, var(--text-main));
    }
    .cta { text-align: left; }
    .hero-card .cta { background: var(--hero-cta-bg, var(--primary-color)); color: var(--hero-cta-ink, var(--on-primary)); }
    .cta .arrow { display: inline-flex; transition: transform var(--motion-base) var(--ease-settle); }
    .cta:hover .arrow { transform: translateX(4px); }

    @keyframes hero-rise { from { opacity: 0; transform: translateY(var(--rise-distance)); } }
    @keyframes hero-bob {
      0%, 100% { transform: translateY(0) rotate(-1deg); }
      50% { transform: translateY(-8px) rotate(1.5deg); }
    }
    @media (max-width: 760px) {
      .hero-card { grid-template-columns: 1fr; gap: var(--space-4); padding: var(--space-4); border-radius: var(--radius-lg); }
      .hero-art { max-width: 190px; width: 100%; margin: 0 auto; }
      .cta { width: 100%; }
    }
    @media (max-height: 540px) and (orientation: landscape) {
      .hero-card { grid-template-columns: 150px 1fr; padding: var(--space-4) var(--space-5); gap: var(--space-5); }
    }
    @media (prefers-reduced-motion: reduce) {
      .hero-card, .hero-art companion-slot > * { animation: none; }
      .cta .arrow { transition: none; }
    }
    /* A look with no companion has nothing to stand on the tile: no tile. */
    .hero-art:has(companion-slot:empty) { display: none; }
    .hero-card:has(companion-slot:empty) { grid-template-columns: minmax(0, 1fr); }

    /* plain: a book page. A navy head rule, a portrait cover beside the
       text, and a hairline meter with numerals instead of a ring. */
    :host([data-look="plain"]) .hero-card {
      border-top: 3px solid var(--hero-head-rule, var(--primary-color));
      padding: var(--space-6);
      gap: var(--space-6);
      align-items: start;
    }
    :host([data-look="plain"]) .hero-card:has(.hero-cover look-cover > *) { grid-template-columns: 168px minmax(0, 1fr); }
    :host([data-look="plain"]) .hero-cover look-cover > * {
      width: 100%;
      aspect-ratio: 3 / 4;
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-md);
    }
    :host([data-look="plain"]) .kicker { font-size: 0.72rem; letter-spacing: var(--kicker-tracking, 0.14em); }
    :host([data-look="plain"]) h1, :host([data-look="plain"]) h2 {
      font-size: var(--fs-h1);
      letter-spacing: -0.01em;
      margin: 8px 0 10px;
      text-wrap: balance;
    }
    :host([data-look="plain"]) p { font-size: 1.02rem; line-height: 1.55; margin-bottom: var(--space-5); }
    .meter { max-width: 420px; margin: 0 0 var(--space-5); }
    .meter-nums { display: flex; align-items: baseline; gap: 6px; color: var(--hero-muted, var(--text-muted)); font-size: 0.88rem; }
    .meter-nums b {
      font-family: var(--font-heading);
      font-weight: 600;
      font-size: 1.6rem;
      line-height: 1;
      color: var(--hero-ink, var(--text-main));
      font-variant-numeric: lining-nums tabular-nums;
    }
    .meter-pct { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: var(--fw-strong); color: var(--hero-ink, var(--text-main)); }
    .meter-bar { position: relative; height: 3px; margin-top: 10px; border-radius: 2px; overflow: hidden; background: var(--meter-track, var(--bg-panel-2)); }
    .meter-bar i { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: var(--meter-fill, var(--primary-color)); }
    @media (max-width: 760px) {
      :host([data-look="plain"]) .hero-card { padding: var(--space-5) var(--space-4); gap: var(--space-4); }
      :host([data-look="plain"]) .hero-card:has(.hero-cover look-cover > *) { grid-template-columns: minmax(0, 1fr); }
      :host([data-look="plain"]) .hero-cover look-cover > * { aspect-ratio: auto; height: 104px; }
      :host([data-look="plain"]) h1, :host([data-look="plain"]) h2 { font-size: var(--fs-hero); }
    }
  `];

  constructor() {
    super();
    this.kicker = '';
    this.heading = '';
    this.tagline = '';
    this.progress = 0;
    this.done = 0;
    this.total = 0;
    this.ctaLabel = '';
    this.ctaHref = '';
    this.primary = false;
    this.coverSeed = '';
    this.coverSubject = '';
  }

  render() {
    const pct = Math.round(Math.max(0, Math.min(1, this.progress || 0)) * 100);
    const title = this.primary ? html`<h1>${this.heading}</h1>` : html`<h2>${this.heading}</h2>`;
    return html`
      <section class="hero-card">
        <div class="hero-art" aria-hidden="true">
          <companion-slot size="sm" expression="happy"></companion-slot>
        </div>
        ${this.look === 'plain' ? html`
          <div class="hero-cover">
            <look-cover seed=${this.coverSeed || this.heading} subject=${this.coverSubject} heading=${this.heading}></look-cover>
          </div>
        ` : ''}
        <div class="hero-body">
          ${this.kicker ? html`<div class="kicker">${this.kicker}</div>` : ''}
          ${title}
          ${this.tagline ? html`<p>${this.tagline}</p>` : ''}
          ${this.total && this.look === 'plain' && !this.gamified ? html`
            <div class="meter">
              <div class="meter-nums"><b>${this.done}</b><span>of ${this.total} ${this.total === 1 ? 'lesson' : 'lessons'} done</span><span class="meter-pct">${pct}%</span></div>
              <div class="meter-bar" role="progressbar" aria-label="Course progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}><i style="width: ${pct}%"></i></div>
            </div>
          ` : this.total ? html`
            <div class="hero-progress">
              ${this.gamified ? html`<progress-ring .value=${this.progress || 0} label="${pct}% complete"></progress-ring>` : ''}
              <div class="pmeta"><b>${pct}% complete</b>${this.done} of ${this.total} lessons done</div>
            </div>
          ` : ''}
          ${this.ctaHref ? html`
            <a class="btn-3d btn-primary btn-lg cta" href="${this.ctaHref}">
              <span>${this.ctaLabel}</span><span class="arrow">${iconArrowRight}</span>
            </a>
          ` : ''}
        </div>
      </section>
    `;
  }
}

customElements.define('module-hero-card', ModuleHeroCard);
