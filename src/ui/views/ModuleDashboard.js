import '../components/LookSlots.js';
import { LitElement, html, css, nothing } from 'lit';
import { ContentLoader } from '../../core/ContentLoader.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { gradeLabel } from '../../core/gradeLabel.js';
import { LessonModeManager } from '../../core/LessonModeManager.js';
import { LookManager } from '../../core/LookManager.js';
import '../components/NeedsUpdateNotice.js';
import { loadCourseManifest, bundleNeedsNewerEngine } from '../../core/courseManifest.js';
import { LessonModeMixin } from '../../core/mixins/LessonModeMixin.js';
import { GamificationMixin } from '../../core/mixins/GamificationMixin.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import '../components/ModuleHeroCard.js';
import { moduleLessonRefs, nextLessonIndex } from '../../core/lessonProgressRules.js';
import { iconCheck, iconStar, iconArrowRight, iconOfflineReady, iconCloudOff } from '../icons/uiIcons.js';
import { EventBus } from '../../core/EventBus.js';
import { OfflineAvailability } from '../../core/OfflineAvailability.js';

/** A lesson entry's optional keyNumbers ([{ value, label: {en} }], at most
 *  three) as { value, label } strings; [] when absent or malformed. */
function keyNumbers(lesson) {
  const list = Array.isArray(lesson?.keyNumbers) ? lesson.keyNumbers : [];
  return list
    .filter((k) => k && (typeof k.value === 'string' || typeof k.value === 'number'))
    .slice(0, 3)
    .map((k) => ({ value: String(k.value), label: k.label?.en || (typeof k.label === 'string' ? k.label : '') }));
}

export class ModuleDashboard extends LookMixin(GamificationMixin(LessonModeMixin(LitElement))) {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      max-width: 1060px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
      padding: var(--space-4) var(--space-4) var(--space-7);
    }
    module-hero-card { margin-bottom: var(--space-6); }

    /* Back to the course page, when this module is one part of a
       several-module bundle (CourseDashboard.js). */
    .crumb {
      align-self: flex-start;
      display: inline-flex;
      align-items: flex-start;
      gap: 6px;
      margin: 0 0 var(--space-3);
      line-height: 1.35;
      font-size: 0.85rem;
      font-weight: var(--fw-strong);
      color: var(--primary-text);
      text-decoration: none;
    }
    .crumb:hover { text-decoration: underline; }
    .crumb:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .crumb svg { flex: none; width: 16px; height: 16px; margin-top: 1px; transform: scaleX(-1); }
    .crumb .crumb-part { color: var(--text-muted); font-weight: var(--fw-medium); }
    :host([data-look="plain"]) .crumb { font-weight: 600; }

    /* Section title with a trailing rule (prototype v2 a/ .section-title). */
    .section-title {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-family: var(--font-heading);
      font-size: 1.25rem;
      margin: 0 0 var(--space-4);
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 2px;
      border-radius: 2px;
      background: var(--border-color);
    }

    /* ── Lesson rows (prototype v2 a/ .lesson-row). Nothing is LOCKED: CBSE
       students and parents need to jump around (owner decision 2026-10-06
       keeps that); state is shown, and the only steer is the "up next" row. */
    .lesson-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-3);
      animation: rise 550ms var(--motion-reveal-ease) 200ms both;
    }
    .lesson-row {
      display: grid;
      grid-template-columns: var(--lesson-num-size) 1fr auto;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) 20px;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--raise-rest, var(--press-1) var(--lip-color));
      color: var(--text-main);
      text-decoration: none;
      transition: transform 120ms, box-shadow 120ms, border-color var(--motion-fast);
    }
    .lesson-row:hover {
      border-color: var(--raise-hover-rule, var(--primary-color));
      transform: translateY(var(--hover-lift));
      box-shadow: var(--raise-hover, var(--raise-rest, var(--press-1) var(--lip-color)));
    }
    .lesson-row:active { transform: translateY(var(--press-travel-sm)); box-shadow: none; }
    .lesson-row:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .lesson-num {
      width: var(--lesson-num-size);
      height: var(--lesson-num-size);
      border-radius: var(--radius-tile);
      display: grid;
      place-items: center;
      font-family: var(--font-heading);
      font-weight: var(--fw-strong);
      font-size: 1.25rem;
      background: var(--bg-panel);
      border: var(--rule-w-fixed) solid var(--border-hover);
      color: var(--text-main);
    }
    .lesson-row.done .lesson-num {
      background: var(--success-bg);
      border-color: var(--accent-teal);
      color: var(--accent-teal);
    }
    .lesson-row.current .lesson-num {
      background: var(--primary-color);
      border-color: var(--primary-hover);
      color: var(--on-primary);
      box-shadow: var(--lip-tile) var(--primary-hover);
    }
    .row-text { min-width: 0; }
    .row-text h3 {
      margin: 0 0 2px;
      font-family: var(--font-heading);
      font-size: 1.1rem;
      line-height: 1.25;
    }
    .row-sub {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
      font-size: 0.82rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted);
    }
    .stars { display: inline-flex; gap: 2px; color: var(--accent-gold); }
    .go {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-heading);
      font-weight: var(--fw-medium);
      font-size: 0.85rem;
      color: var(--primary-text);
      white-space: nowrap;
    }
    .go svg { width: 16px; height: 16px; }
    @keyframes rise { from { opacity: 0; transform: translateY(var(--rise-distance)); } }

    /* plain: a book's contents page. One sheet, rows parted by hairlines,
       the lesson number set as a brass numeral, the state in small caps,
       the next lesson marked by a navy rule at its edge. */
    :host([data-look="plain"]) module-hero-card { margin-bottom: var(--space-7, 3rem); }
    :host([data-look="plain"]) .section-title {
      align-items: baseline;
      font-size: 1.35rem;
      padding-top: var(--space-3);
      border-top: 1px solid var(--rule-strong, var(--text-main));
      margin: 0 0 var(--space-4);
    }
    :host([data-look="plain"]) .section-title::after { content: none; }
    .section-count {
      margin-left: auto;
      font-family: var(--font-family);
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    :host([data-look="plain"]) .lesson-list {
      gap: 0;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--raise-rest, none);
      overflow: hidden;
    }
    :host([data-look="plain"]) .lesson-list > li + li .lesson-row { border-top: 1px solid var(--rule-soft, var(--border-color)); }
    :host([data-look="plain"]) .lesson-row {
      position: relative;
      grid-template-columns: 3rem 1fr auto;
      padding: 18px 24px;
      background: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      transition: background var(--motion-fast);
    }
    :host([data-look="plain"]) .lesson-row:hover { transform: none; box-shadow: none; background: var(--bg-panel); }
    :host([data-look="plain"]) .lesson-row:focus-visible { outline-offset: -3px; }
    :host([data-look="plain"]) .lesson-row.current::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--primary-color);
    }
    :host([data-look="plain"]) .lesson-num,
    :host([data-look="plain"]) .lesson-row.done .lesson-num,
    :host([data-look="plain"]) .lesson-row.current .lesson-num {
      width: auto;
      height: auto;
      place-items: start;
      background: none;
      border: 0;
      box-shadow: none;
      border-radius: 0;
      font-size: 1.5rem;
      font-weight: 500;
      line-height: 1;
      color: var(--accent-coral);
      font-variant-numeric: lining-nums tabular-nums;
    }
    :host([data-look="plain"]) .lesson-row.done .lesson-num { color: var(--success-text); }
    :host([data-look="plain"]) .lesson-row.done .lesson-num svg { width: 22px; height: 22px; }
    :host([data-look="plain"]) .row-text h3 { font-size: 1.12rem; font-weight: 600; margin-bottom: 4px; }
    :host([data-look="plain"]) .row-sub {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    :host([data-look="plain"]) .lesson-row.current .row-sub { color: var(--primary-text); }
    :host([data-look="plain"]) .lesson-row.done .row-sub { color: var(--success-text); }
    :host([data-look="plain"]) .go { font-family: var(--font-family); font-weight: 600; font-size: 0.85rem; }

    /* plain, the course map (optional module fields lessons[].question,
       .misconception, .keyNumbers; keyNumbersLabel). Each row adds the
       question the lesson answers, the usual mistake, and the through-line
       figures in their own column, joined down the page by one hairline:
       reading the column top to bottom is the thread of the course. Rows
       without the fields render exactly as before. */
    .row-q {
      display: block;
      margin: 0 0 6px;
      font-size: 0.95rem;
      line-height: 1.45;
      color: var(--text-soft);
    }
    .row-mis {
      display: block;
      margin: 0 0 8px;
      max-width: 62ch;
      font-size: 0.84rem;
      line-height: 1.45;
      color: var(--text-muted);
    }
    .row-mis b {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--signature-ink, var(--text-muted));
      margin-right: 6px;
    }
    .section-figs {
      margin-left: auto;
      font-family: var(--font-family);
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .section-figs + .section-count { margin-left: var(--space-4); }
    :host([data-look="plain"]) .lesson-list.mapped .lesson-row {
      grid-template-columns: 3rem minmax(0, 1fr) 12.5rem auto;
      align-items: start;
    }
    :host([data-look="plain"]) .lesson-list.mapped .lesson-num { padding-top: 2px; }
    :host([data-look="plain"]) .lesson-list.mapped .go { padding-top: 4px; }
    .row-figs {
      position: relative;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      margin: -18px 0;
      padding: 18px 0 18px 22px;
    }
    /* The through-line: one hairline down the column, a dot per lesson
       (filled once the lesson is done, the signature colour on the next). */
    .row-figs::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--rule-strong, var(--border-hover));
    }
    .lesson-list > li:first-child .row-figs::before { top: 50%; }
    .lesson-list > li:last-child .row-figs::before { bottom: 50%; }
    .row-figs::after {
      content: '';
      position: absolute;
      left: -4px;
      top: calc(50% - 4px);
      width: 9px;
      height: 9px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 1.5px solid var(--rule-strong, var(--border-hover));
      background: var(--bg-surface);
    }
    .lesson-row.done .row-figs::after { background: var(--rule-strong, var(--border-hover)); }
    .lesson-row.current .row-figs::after { border-color: var(--signature, var(--primary-color)); background: var(--signature, var(--primary-color)); }
    .row-figs.empty::after { display: none; }
    .fig { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .fig-v {
      font-family: var(--font-family);
      font-size: 1.15rem;
      font-weight: 600;
      line-height: 1.15;
      color: var(--text-main);
      font-variant-numeric: lining-nums tabular-nums;
      white-space: nowrap;
    }
    .fig-l { font-size: 0.74rem; line-height: 1.3; color: var(--text-muted); }

    @media (max-width: 640px) {
      :host([data-look="plain"]) .lesson-list.mapped .lesson-row { grid-template-columns: 2.25rem minmax(0, 1fr); }
      .row-figs {
        grid-column: 2;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: flex-start;
        gap: 6px 18px;
        margin: -4px 0 0;
        padding: 8px 0 0;
        border-top: 1px dashed var(--rule-soft, var(--border-color));
      }
      .row-figs::before, .row-figs::after { content: none; }
      .fig-v { font-size: 1.05rem; }
    }
    @media (max-width: 640px) {
      :host([data-look="plain"]) .lesson-row { grid-template-columns: 2.25rem 1fr; padding: 14px 16px; }
      :host([data-look="plain"]) .lesson-num,
      :host([data-look="plain"]) .lesson-row.done .lesson-num,
      :host([data-look="plain"]) .lesson-row.current .lesson-num { width: auto; height: auto; font-size: 1.3rem; }
    }

    @media (max-width: 640px) {
      :host { padding: var(--space-3) 0 var(--space-6); }
      .lesson-row { grid-template-columns: var(--lesson-num-size-sm) 1fr; padding: 13px 15px; gap: var(--space-3); }
      .lesson-num { width: var(--lesson-num-size-sm); height: var(--lesson-num-size-sm); border-radius: var(--radius-tile-sm); font-size: 1.05rem; }
      .go { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .lesson-list { animation: none; }
      .lesson-row { transition: none; }
    }

    /* ── Story: the adventure map (prototype v2 b/ .map-home) ──────────
       A dashed winding path with alternating coin + card nodes. No locks
       (owner decision): unvisited lessons show their number, the next one
       is the gold coin with Quill waving above it. */
    .map-banner { text-align: center; margin: var(--space-4) 0 var(--space-2); animation: rise 550ms var(--motion-reveal-ease) both; }
    .map-kicker {
      font-size: 0.72rem;
      font-weight: var(--fw-heavy);
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--primary-text);
    }
    .map-banner h1 {
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      font-size: clamp(2rem, 5vw, 3.4rem);
      line-height: 1.1;
      margin: 8px 0 6px;
    }
    .map-banner .hl {
      background: linear-gradient(transparent 62%, var(--accent-gold) 62% 92%, transparent 92%);
      padding: 0 6px;
    }
    .map-banner p { margin: 0; color: var(--text-soft); font-weight: var(--fw-medium); }
    .map-field { position: relative; width: min(680px, 100%); margin: var(--space-6) auto 0; }
    .map-path-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .map-path-svg path {
      fill: none;
      stroke: var(--border-color);
      stroke-width: 4;
      stroke-dasharray: 2 14;
      stroke-linecap: round;
      opacity: 0.45;
    }
    .map-nodes { list-style: none; margin: 0; padding: 20px 0; position: relative; display: grid; gap: 64px; }
    .map-nodes > li { display: contents; }
    .map-node {
      display: flex;
      align-items: center;
      gap: 20px;
      width: fit-content;
      position: relative;
      text-decoration: none;
      color: var(--text-main);
      animation: rise 500ms var(--motion-reveal-ease) both;
    }
    .map-nodes > li:nth-child(odd) .map-node { justify-self: start; margin-left: 6%; }
    .map-nodes > li:nth-child(even) .map-node { justify-self: end; margin-right: 6%; flex-direction: row-reverse; text-align: right; }
    .map-node:focus-visible { outline: var(--focus-ring); outline-offset: 6px; border-radius: 24px; }
    .node-coin {
      position: relative;
      flex: none;
      width: 86px;
      height: 86px;
      border-radius: 50%;
      border: 3px solid var(--border-color);
      display: grid;
      place-items: center;
      font-family: var(--font-heading);
      font-size: 1.5rem;
      background: var(--bg-surface);
      box-shadow: var(--shadow-md);
      transition: transform 120ms;
    }
    .node-coin svg { width: 32px; height: 32px; }
    .map-node:hover .node-coin { transform: scale(1.06) rotate(-2deg); }
    .map-node.done .node-coin { background: var(--accent-teal); color: var(--bg-surface); }
    .map-node.current .node-coin {
      background: var(--accent-gold);
      color: var(--opt-key-ink);
      animation: node-pulse 2s ease-in-out infinite;
    }
    @keyframes node-pulse {
      0%, 100% { box-shadow: var(--shadow-md), 0 0 0 0 color-mix(in srgb, var(--accent-gold) 50%, transparent); }
      60% { box-shadow: var(--shadow-md), 0 0 0 16px color-mix(in srgb, var(--accent-gold) 0%, transparent); }
    }
    .node-card {
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: 18px;
      padding: 12px 18px;
      box-shadow: var(--shadow-md);
      max-width: 260px;
    }
    .node-card h3 { margin: 0 0 3px; font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1rem; line-height: 1.2; }
    .node-card .sub { font-size: 0.78rem; font-weight: var(--fw-strong); color: var(--text-muted); }
    .node-card .stars { display: inline-flex; gap: 2px; margin-top: 4px; color: var(--accent-gold); }
    .node-card .cta { display: inline-block; margin-top: 8px; font-weight: var(--fw-heavy); font-size: 0.8rem; color: var(--primary-text); }
    .map-quill > * {
      position: absolute;
      top: -92px;
      left: 50%;
      margin-left: -48px;
      width: 96px;
      z-index: 3;
      pointer-events: none;
      animation: map-bob 3.2s ease-in-out infinite;
    }
    @keyframes map-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
    @media (max-width: 640px) {
      .map-path-svg { display: none; }
      .map-nodes { gap: 44px; }
      .map-nodes > li:nth-child(n) .map-node { justify-self: stretch; margin: 0; flex-direction: row; text-align: left; width: auto; }
      .node-coin { width: 62px; height: 62px; font-size: 1.1rem; }
      .node-coin svg { width: 26px; height: 26px; }
      .node-card { max-width: none; flex: 1; min-width: 0; padding: 10px 14px; }
      .map-quill > * { top: -66px; width: 66px; margin-left: -33px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .map-banner, .map-node, .map-node.current .node-coin, .map-quill > * { animation: none; }
      .node-coin { transition: none; }
    }

    /* ── Offline marks (Q-100a). A lesson whose every file is on this device
       wears a teal "Offline" tag; offline, a lesson that is not saved says it
       needs the internet and steps back a little. Status comes from
       core/OfflineAvailability.js; this view only shows it. */
    .off-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 8px 1px 5px;
      border-radius: var(--radius-pill);
      font-size: 0.74rem;
      font-weight: var(--fw-heavy);
      line-height: 1.5;
      white-space: nowrap;
    }
    .off-tag svg { width: 15px; height: 15px; flex: none; }
    .off-tag.ready {
      color: var(--success-text);
      background: var(--success-bg);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent-teal) 35%, transparent);
    }
    .off-tag.part { color: var(--text-muted); background: var(--bg-panel); }
    .off-tag.away { color: var(--text-muted); background: var(--bg-panel); }
    .lesson-row.needs-net { opacity: 0.62; }
    .lesson-row.needs-net:hover { opacity: 0.85; }
    :host([data-look="plain"]) .off-tag { padding: 0; background: none; box-shadow: none; font-size: inherit; letter-spacing: inherit; }
    :host([data-look="plain"]) .off-tag svg { width: 14px; height: 14px; }

    /* Story: a teal seal on the coin, and the same tag on the card. */
    .coin-seal {
      position: absolute;
      right: -6px;
      bottom: -4px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--bg-surface);
      color: var(--success-text);
      border: 2.5px solid var(--accent-teal);
      box-shadow: var(--shadow-sm, var(--shadow-md));
      z-index: 2;
    }
    .coin-seal svg { width: 18px; height: 18px; }
    .coin-seal.away { color: var(--text-muted); border-color: var(--border-color); }
    .map-node.needs-net .node-coin, .map-node.needs-net .node-card { opacity: 0.62; }
    .node-card .off-tag { margin-top: 6px; }
    @media (max-width: 640px) {
      .coin-seal { width: 24px; height: 24px; right: -5px; bottom: -3px; }
      .coin-seal svg { width: 15px; height: 15px; }
    }

    .error-msg {
      color: var(--error-text);
      background: var(--error-bg);
      padding: var(--space-4);
      border-radius: var(--radius-md);
    }
  `;

  static properties = {
    moduleId: { type: String },
    profileId: { type: String },
    _moduleData: { type: Object, state: true },
    _progressMap: { type: Object, state: true },
    _error: { type: String, state: true },
    _needsUpdate: { type: Boolean, state: true },
    _crumb: { type: Object, state: true },
    _offline: { type: Object, state: true },
    _online: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.moduleId = '';
    this.profileId = '';
    this._moduleData = null;
    this._bundleId = null;
    this._progressMap = {};
    this._error = null;
    this._offline = {};
    this._online = OfflineAvailability.online();
    this._onAvail = ({ lessonId, status }) => {
      if (this._offlineIds?.has(lessonId)) this._offline = { ...this._offline, [lessonId]: status };
    };
    this._onNet = ({ online }) => { this._online = online; };
  }

  connectedCallback() {
    super.connectedCallback();
    EventBus.on('offline:availability', this._onAvail);
    EventBus.on('offline:network', this._onNet);
    this._online = OfflineAvailability.online();
    if (this._moduleData && !this._unwatch) this._watchOffline();
  }

  disconnectedCallback() {
    EventBus.off('offline:availability', this._onAvail);
    EventBus.off('offline:network', this._onNet);
    this._unwatch?.();
    this._unwatch = null;
    super.disconnectedCallback();
  }

  /** Keeps every lesson's offline status current while this page shows (Q-100a). */
  _watchOffline() {
    this._unwatch?.();
    const refs = moduleLessonRefs(this._moduleData, this._bundleId, CourseSourceManager.expandRef.bind(CourseSourceManager));
    this._offlineIds = new Set(refs);
    const known = {};
    for (const r of refs) { const st = OfflineAvailability.get(r); if (st) known[r] = st; }
    this._offline = known;
    this._unwatch = OfflineAvailability.watch(refs, { profileId: this.profileId });
  }

  /** 'ready' | 'part' | 'away' | '' for one lesson ref: what its mark shows. */
  _offlineKind(ref) {
    const st = this._offline?.[ref];
    if (!st || st.state === 'unknown') return '';
    if (st.state === 'ready') return 'ready';
    if (!this._online) return 'away';
    return st.state === 'partial' && st.ready > 0 ? 'part' : '';
  }

  _offlineTag(ref) {
    const kind = this._offlineKind(ref);
    const st = this._offline?.[ref];
    if (kind === 'ready') return html`<span class="off-tag ready">${iconOfflineReady}Offline</span>`;
    if (kind === 'part') return html`<span class="off-tag part">${st.ready} of ${st.total} slides offline</span>`;
    if (kind === 'away') return html`<span class="off-tag away">${iconCloudOff}${st?.ready ? `${st.ready} of ${st.total} slides here` : 'Needs internet'}</span>`;
    return '';
  }

  _offlineLabel(ref) {
    const kind = this._offlineKind(ref);
    const st = this._offline?.[ref];
    if (kind === 'ready') return ', available offline';
    if (kind === 'part') return `, ${st.ready} of ${st.total} slides available offline`;
    if (kind === 'away') return st?.ready ? `, only ${st.ready} of ${st.total} slides available offline` : ', needs the internet';
    return '';
  }

  // AppShell reuses this element when one module's page follows another's
  // (same tag at the same template position; only moduleId changes), so the
  // load runs on every moduleId change, not once in firstUpdated().
  updated(changed) {
    if (changed.has('moduleId')) this._load();
  }

  async _load() {
    const seq = (this._loadSeq = (this._loadSeq || 0) + 1);
    this._unwatch?.();
    this._unwatch = null;
    this._moduleData = null;
    this._progressMap = {};
    this._error = null;
    this._needsUpdate = false;
    this._crumb = null;
    try {
      if (!this.moduleId) throw new Error("No module ID provided.");
      const path = '/' + this.moduleId.replace(/^\//, '');
      this._bundleId = CourseSourceManager.deriveBundleId(path);
      const moduleData = await ContentLoader.loadJSON(path);
      // A newer module opened while this one loaded: it owns the forcing.
      if (seq !== this._loadSeq) return;
      if (await bundleNeedsNewerEngine(this._bundleId, moduleData)) { if (seq === this._loadSeq) this._needsUpdate = true; return; }
      if (seq !== this._loadSeq) return;
      this._moduleData = moduleData;
      if (this.isConnected) this._watchOffline();
      // `"lessonMode": "story"` marks a story-only module: Story is forced
      // and the mode switch hidden while it is open (lesson-modes-plan.md).
      // `"look": "<id>"` (registry/looks.json) and `"gamification"` while the
      // module is open.
      LookManager.setCourse(this._moduleData);
      LookManager.followBundle(this._bundleId, loadCourseManifest);
      LessonModeManager.setForced(this._moduleData.lessonMode === 'story' ? 'story' : null);
      this._loadCrumb(seq);

      if (this.profileId) {
        const records = await ProgressStore.getAllFromIndex('lessonProgress', 'by_profile', this.profileId);
        if (seq !== this._loadSeq) return;
        const map = {};
        for (const r of records) {
          map[r.lessonId] = r;
        }
        this._progressMap = map;
      }
    } catch (err) {
      if (seq !== this._loadSeq) return;
      // An unreadable module forces nothing; never keep the last module's.
      LookManager.setCourse(null);
      LessonModeManager.setForced(null);
      this._error = err.message;
    }
  }

  /** A part of a several-module bundle links back to its course page. */
  async _loadCrumb(seq) {
    const manifest = await loadCourseManifest(this._bundleId);
    const mods = manifest?.modules || [];
    if (seq !== this._loadSeq || mods.length < 2) return;
    const id = this.moduleId.replace(/^\//, '');
    const index = mods.findIndex((rel) => id.endsWith('/' + String(rel).replace(/^\//, '')));
    if (index === -1) return;
    this._crumb = { title: manifest.title?.en || manifest.title || this._bundleId, index, count: mods.length };
  }

  _renderCrumb() {
    const c = this._crumb;
    if (!c) return '';
    return html`<a class="crumb" href="#/course/${encodeURIComponent(this._bundleId)}">${iconArrowRight}<span>${c.title} <span class="crumb-part">\u00b7 Part ${c.index + 1} of ${c.count}</span></span></a>`;
  }

  getSubjectIcon(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return '🧪';
    if (sub.includes('phys')) return '⚛️';
    if (sub.includes('chem')) return '🧬';
    if (sub.includes('math')) return '📐';
    return '📖';
  }

  // `.module-header`'s gradient backgrounds only exist for biology/physics/
  // chemistry/math (see static styles). Using the raw subject code as the
  // CSS class name (e.g. "science", "mathematics", "social_science") left
  // most subjects matching none of those and falling back to no background
  // at all — the header's hardcoded white title/meta text over a light theme
  // page background reads as invisible. Bucket by substring, same convention
  // as getSubjectIcon() above, so every subject lands on a real background.
  getSubjectClass(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return 'biology';
    if (sub.includes('phys')) return 'physics';
    if (sub.includes('chem')) return 'chemistry';
    if (sub.includes('math')) return 'math';
    return 'default';
  }

  render() {
    if (this._needsUpdate) return html`<needs-update-notice></needs-update-notice>`;
    if (this._error) {
      return html`<div class="error-msg">Error loading module: ${this._error}</div>`;
    }

    if (!this._moduleData) {
      return html`<app-loader label="Loading module..."></app-loader>`;
    }

    const { title, subject, grade, lessons } = this._moduleData;
    const displayTitle = title?.en || title || 'Untitled Module';
    const list = lessons || [];
    const refs = moduleLessonRefs(this._moduleData, this._bundleId, CourseSourceManager.expandRef.bind(CourseSourceManager));
    // The one steer we give: the first lesson without a completed record.
    // -1 (every lesson done) simply means no row is marked, which is correct.
    const nextIndex = nextLessonIndex(refs, this._progressMap);
    const doneCount = refs.filter((r) => this._progressMap[r]?.completed).length;
    const routeFor = (i) => '#/lesson/' + refs[i] + '?module=' + encodeURIComponent(this.moduleId);
    const titleFor = (i) => list[i]?.title?.en || `Lesson ${i + 1}`;
    const subjectLabel = subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : '';
    const kicker = [subjectLabel, gradeLabel(grade)].filter(Boolean).join(' \u00b7 ');
    const ctaIndex = nextIndex === -1 ? 0 : nextIndex;
    const ctaVerb = nextIndex === -1 ? 'Review' : (this._progressMap[refs[ctaIndex]]?.currentIndex > 0 ? 'Continue' : 'Start');
    // plain only: the course map's through-line column, when any lesson
    // carries keyNumbers (Quill never reads these fields).
    const plain = this.look === 'plain';
    const mapped = plain && list.some((l) => keyNumbers(l).length);
    const figsLabel = this._moduleData.keyNumbersLabel?.en || '';

    if (this.isStoryMode) {
      return html`${this._renderCrumb()}${this._renderMap({ displayTitle, kicker, list, refs, nextIndex, routeFor, titleFor })}`;
    }

    return html`
      ${this._renderCrumb()}
      <module-hero-card
        primary
        .kicker=${kicker}
        .heading=${displayTitle}
        .tagline=${this._moduleData.description?.en || ''}
        .progress=${list.length ? doneCount / list.length : 0}
        .done=${doneCount}
        .total=${list.length}
        .ctaLabel=${list.length ? `${ctaVerb}: ${titleFor(ctaIndex)}` : ''}
        .ctaHref=${list.length ? routeFor(ctaIndex) : ''}
        .coverSeed=${this.moduleId}
        .coverSubject=${subjectLabel}
      ></module-hero-card>

      <h2 class="section-title">${plain ? html`Contents${mapped && figsLabel ? html`<span class="section-figs">${figsLabel}</span>` : ''}<span class="section-count">${list.length} ${list.length === 1 ? 'lesson' : 'lessons'}</span>` : 'Lessons'}</h2>
      <ol class="lesson-list ${mapped ? 'mapped' : ''}">
        ${list.map((l, index) => {
          const prog = this._progressMap[refs[index]];
          const done = !!prog?.completed;
          const started = !done && prog?.currentIndex > 0;
          const isNext = index === nextIndex;
          const status = done ? 'Completed' : started ? 'In progress' : isNext ? 'Up next' : 'Not started';
          const stars = done && this.gamified ? (prog?.stars || 0) : 0;
          const go = done ? 'Review' : started ? 'Resume' : 'Start';
          const q = plain ? l?.question?.en : '';
          const mis = plain && isNext ? l?.misconception?.en : '';
          const figs = mapped ? keyNumbers(l) : [];
          const desc = [q && `lq-${index}`, mis && `lm-${index}`, figs.length && `lf-${index}`].filter(Boolean).join(' ');
          const offKind = this._offlineKind(refs[index]);
          return html`
            <li>
              <a href="${routeFor(index)}"
                 class="lesson-row ${done ? 'done' : ''} ${isNext ? 'current' : ''} ${offKind === 'away' ? 'needs-net' : ''}"
                 aria-label="${titleFor(index)}, ${status}${stars ? `, ${stars} of 3 stars` : ''}${this._offlineLabel(refs[index])}"
                 aria-describedby=${desc || nothing}>
                <span class="lesson-num" aria-hidden="true">${done ? iconCheck : plain ? String(index + 1).padStart(2, '0') : index + 1}</span>
                <span class="row-text">
                  <h3>${titleFor(index)}</h3>
                  ${q ? html`<span class="row-q" id="lq-${index}">${q}</span>` : ''}
                  ${mis ? html`<span class="row-mis" id="lm-${index}"><b>Common mistake:</b> ${mis}</span>` : ''}
                  <span class="row-sub">
                    <span>${status}</span>
                    ${stars && this.look !== 'plain' ? html`<span class="stars" aria-hidden="true">${[1, 2, 3].map((n) => iconStar(n <= stars))}</span>` : ''}
                    ${offKind ? html`<span aria-hidden="true">${this._offlineTag(refs[index])}</span>` : ''}
                  </span>
                </span>
                ${mapped ? html`
                  <span class="row-figs ${figs.length ? '' : 'empty'}" id="lf-${index}">
                    ${figs.map((f) => html`<span class="fig"><span class="fig-v">${f.value}</span>${f.label ? html`<span class="fig-l">${f.label}</span>` : ''}</span>`)}
                  </span>
                ` : ''}
                <span class="go" aria-hidden="true">${go}${iconArrowRight}</span>
              </a>
            </li>
          `;
        })}
      </ol>
      ${!list.length ? html`<p>No lessons found in this module.</p>` : ''}
    `;
  }

  /** Story's adventure map (see the .map-* styles). */
  _renderMap({ displayTitle, kicker, list, refs, nextIndex, routeFor, titleFor }) {
    const [first, ...rest] = String(displayTitle).split(' ');
    const ROW = 150;
    const path = 'M 180 40 ' + list.slice(0, -1).map((_, i) => {
      const y = 40 + i * ROW;
      const x = i % 2 ? 500 : 180;
      const nx = (i + 1) % 2 ? 500 : 180;
      return `C ${x} ${y + 60}, ${nx} ${y + 90}, ${nx} ${y + ROW}`;
    }).join(' ');
    return html`
      <div class="map-banner">
        <span class="map-kicker">${kicker ? `${kicker} \u00b7 ` : ''}Chapter map</span>
        <h1><span class="hl">${first}</span> ${rest.join(' ')}</h1>
        ${this._moduleData.description?.en ? html`<p>${this._moduleData.description.en}</p>` : ''}
      </div>
      <div class="map-field">
        <svg class="map-path-svg" viewBox="0 0 680 ${Math.max(1, list.length) * ROW}" preserveAspectRatio="none" aria-hidden="true">
          <path d="${path}"></path>
        </svg>
        <ol class="map-nodes">
          ${list.map((l, index) => {
            const prog = this._progressMap[refs[index]];
            const done = !!prog?.completed;
            const started = !done && prog?.currentIndex > 0;
            const isNext = index === nextIndex;
            const stars = done && this.gamified ? (prog?.stars || 0) : 0;
            const sub = done ? 'Completed' : isNext ? (started ? 'Your quest continues here' : 'Your quest starts here') : started ? 'In progress' : 'Not visited yet';
            const offKind = this._offlineKind(refs[index]);
            return html`
              <li>
                <a href="${routeFor(index)}" class="map-node ${done ? 'done' : ''} ${isNext ? 'current' : ''} ${offKind === 'away' ? 'needs-net' : ''}"
                   style="animation-delay: ${150 + index * 60}ms"
                   aria-label="${titleFor(index)}, ${sub}${stars ? `, ${stars} of 3 stars` : ''}${this._offlineLabel(refs[index])}">
                  <span class="node-coin" aria-hidden="true">
                    ${done ? iconCheck : isNext && this.gamified ? iconStar(true) : index + 1}
                    ${isNext ? html`<companion-slot class="map-quill" size="sm" expression="happy" act="wave"></companion-slot>` : ''}
                    ${offKind === 'ready' ? html`<span class="coin-seal">${iconOfflineReady}</span>` : offKind === 'away' ? html`<span class="coin-seal away">${iconCloudOff}</span>` : ''}
                  </span>
                  <span class="node-card">
                    <h3>${titleFor(index)}</h3>
                    <div class="sub">${sub}</div>
                    ${stars && this.look !== 'plain' ? html`<div class="stars" aria-hidden="true">${[1, 2, 3].map((n) => iconStar(n <= stars))}</div>` : ''}
                    ${offKind ? html`<div aria-hidden="true">${this._offlineTag(refs[index])}</div>` : ''}
                    ${isNext ? html`<span class="cta">Step in</span>` : ''}
                  </span>
                </a>
              </li>
            `;
          })}
        </ol>
      </div>
    `;
  }
}

customElements.define('module-dashboard', ModuleDashboard);
