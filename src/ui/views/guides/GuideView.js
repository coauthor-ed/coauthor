import { brandCopy } from '../../components/LookSlots.js';
import { LookManager } from '../../../core/LookManager.js';
import { LitElement, html, css } from 'lit';
import { EventBus } from '../../../core/EventBus.js';
import { ThemeManager } from '../../../core/ThemeManager.js';
import { ensureStoryFonts } from '../../../core/LessonModeManager.js';
import { GuideService } from '../../../core/GuideService.js';
import { iconGuide, iconArrowRight, iconArrowLeft, iconClock, iconChevronRight, iconToc, iconBolt } from '../../icons/uiIcons.js';
import '../../components/TryBlock.js';
import {
  GUIDE_ICON, AUDIENCE, formatDate, siteBar, readerIsAdult, skyBand, paperBand, tornEdge, siteStyles, plainSiteStyles, SiteChrome,
} from './guideKit.js';
import { LookMixin } from '../../../core/mixins/LookMixin.js';

/**
 * <guide-view> - one guide at #/guides/<slug>[?h=<heading-id>]
 * (docs/sprints/completed/landing-page-and-guides.md, "Reading in the app").
 *
 * GuideService turns the Markdown into sanitised HTML; this view places it,
 * adds the table of contents (sticky on wide screens, a collapsible "On this
 * page" on phones), copy buttons on code, previous / next within the
 * audience, and mounts each coauthor-try slot as a <try-block>.
 *
 * `compact` is the in-lesson sheet (GuideSheet.js): no site bar, a short
 * band, and guide links swap the guide in place instead of leaving the
 * lesson.
 *
 * Student guides (host [data-aud='student']) are livelier: Quill waves in
 * the header, says the > [!QUILL] tips, reacts under each try-block when it
 * is checked (try-result), and cheers on a "You finished" card at the end.
 * Parent and author guides keep the calmer paper style.
 */

export class GuideView extends LookMixin(LitElement) {
  static properties = {
    slug: { type: String },
    heading: { type: String },
    compact: { type: Boolean, reflect: true },
    _meta: { state: true },
    _status: { state: true },
    _error: { state: true },
    _nb: { state: true },
    _active: { state: true },
    _theme: { state: true },
    _adult: { state: true },
  };

  static styles = [siteStyles, css`
    :host([compact]) { min-height: 0; }
    .head { padding: 104px 0 64px; }
    :host([compact]) .head { padding: 26px 0 42px; }
    .head .wrap { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: end; }
    .crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0 0 14px; font-weight: 800; font-size: 0.9rem; }
    .crumbs a { color: inherit; opacity: 0.85; }
    .crumbs svg { width: 14px; height: 14px; opacity: 0.6; }
    h1 { margin: 0 0 12px; font-family: var(--gk-display); font-weight: 700; font-size: clamp(2.1rem, 5.6vw, 3.6rem); line-height: 1.02; letter-spacing: -0.02em; text-wrap: balance; }
    :host([compact]) h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); }
    .sum { margin: 0 0 16px; max-width: 36em; font-size: 1.12rem; line-height: 1.5; font-weight: 600; opacity: 0.9; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-weight: 800; font-size: 0.88rem; opacity: 0.85; }
    .meta span { display: inline-flex; align-items: center; gap: 5px; }
    .meta svg { width: 16px; height: 16px; }
    .big-ic {
      display: grid; place-items: center; width: 112px; height: 112px; border-radius: 32px; transform: rotate(-6deg);
      color: var(--landing-ink); background: var(--tone); border: var(--gk-ink-w) solid var(--landing-ink);
      box-shadow: 6px 7px 0 var(--landing-paper-shadow);
    }
    .band:not(.paper) .big-ic { border-color: var(--landing-sky-top); box-shadow: 0 0 0 8px color-mix(in srgb, var(--tone) 25%, transparent), 0 0 50px var(--landing-glow); }
    .big-ic svg { width: 58px; height: 58px; }
    :host([compact]) .big-ic { display: none; }

    .layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 56px; padding: 28px 0 90px; }
    :host([compact]) .layout { grid-template-columns: minmax(0, 1fr); padding-bottom: 40px; }
    .toc { position: sticky; top: 92px; align-self: start; max-height: calc(100vh - 110px); overflow: auto; padding: 4px 4px 4px 0; }
    .toc h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 900; color: var(--landing-ink-soft); }
    .toc h2 svg { width: 16px; height: 16px; }
    .toc ol { list-style: none; margin: 0; padding: 0; border-left: 2px solid color-mix(in srgb, var(--landing-ink) 18%, transparent); }
    .toc a { display: block; padding: 6px 10px 6px 14px; margin-left: -2px; border-left: 3px solid transparent; color: var(--landing-ink-soft); text-decoration: none; font-weight: 700; line-height: 1.3; font-size: 0.94rem; }
    .toc a.d3 { padding-left: 26px; font-size: 0.88rem; font-weight: 600; }
    .toc a:hover { color: var(--landing-ink); }
    .toc a.on { color: var(--landing-ink); border-left-color: var(--tone); background: color-mix(in srgb, var(--tone) 12%, transparent); border-radius: 0 8px 8px 0; }
    .toc-m { display: none; margin: 0 0 18px; border: 2px solid var(--landing-ink); border-radius: 14px; background: var(--landing-paper-2); }
    .toc-m summary { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 12px 16px; font-weight: 900; }
    .toc-m summary svg { width: 18px; height: 18px; }
    .toc-m ol { margin: 0; padding: 0 16px 12px 36px; }
    .toc-m a { display: block; padding: 5px 0; color: var(--landing-ink); font-weight: 700; }
    :host([compact]) .toc { display: none; }
    :host([compact]) .toc-m { display: block; }

    /* ---- the article ---------------------------------------------------- */
    article { max-width: 46rem; font-size: 1.08rem; line-height: 1.7; }
    article > :first-child { margin-top: 0; }
    article h2 {
      margin: 2.4em 0 0.6em; font-family: var(--gk-display); font-weight: 700; font-size: 1.75rem; line-height: 1.15; letter-spacing: -0.01em;
      scroll-margin-top: 96px;
    }
    article h2::before { content: ''; display: block; width: 44px; height: 6px; border-radius: 6px; margin-bottom: 12px; background: var(--tone); }
    article h3 { margin: 1.8em 0 0.4em; font-family: var(--gk-display); font-weight: 700; font-size: 1.28rem; scroll-margin-top: 96px; }
    article p, article li { color: var(--landing-ink); }
    article a { color: var(--landing-author); font-weight: 800; text-underline-offset: 3px; }
    :host([data-theme='dark']) article a { color: var(--landing-author); }
    article ul, article ol { padding-left: 1.4em; }
    article li { margin: 0.3em 0; }
    article li::marker { color: var(--landing-ink-soft); font-weight: 800; }
    article strong { font-weight: 900; }
    article hr { border: 0; border-top: 2px dashed var(--landing-ink-soft); margin: 2.4em 0; }
    article img { max-width: 100%; height: auto; border-radius: 14px; border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 5px 6px 0 var(--landing-paper-shadow); }
    article code {
      font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 0.88em;
      padding: 0.1em 0.4em; border-radius: 6px; background: color-mix(in srgb, var(--landing-ink) 9%, var(--landing-paper-2));
      border: 1px solid color-mix(in srgb, var(--landing-ink) 18%, transparent);
    }
    article kbd {
      display: inline-block; min-width: 1.6em; text-align: center; font-family: inherit; font-weight: 900; font-size: 0.86em;
      padding: 0.05em 0.45em; border-radius: 7px; color: var(--landing-ink); background: var(--landing-paper-2);
      border: 2px solid var(--landing-ink); box-shadow: 0 3px 0 var(--landing-ink);
      margin: 0 0.1em; position: relative; top: -0.1em;
    }
    article .pre-wrap { position: relative; margin: 1.2em 0; }
    article pre {
      margin: 0; padding: 16px 18px; overflow-x: auto; border-radius: 16px; line-height: 1.55; font-size: 0.92rem;
      color: var(--landing-on-night); background: var(--landing-sky-top);
      border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 5px 6px 0 var(--landing-paper-shadow);
    }
    article pre code { padding: 0; border: 0; background: none; color: inherit; font-size: inherit; }
    .copy {
      position: absolute; top: 8px; right: 8px; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
      font: inherit; font-weight: 800; font-size: 0.8rem; padding: 5px 10px; border-radius: 9px;
      color: var(--landing-on-night); background: color-mix(in srgb, var(--landing-on-night) 12%, var(--landing-sky-top));
      border: 1.5px solid var(--landing-night-edge);
    }
    .copy svg { width: 15px; height: 15px; }
    article .table-wrap { margin: 1.2em 0; overflow-x: auto; border: 2px solid var(--landing-ink); border-radius: 14px; background: var(--landing-paper-2); }
    article table { border-collapse: collapse; width: 100%; font-size: 0.98rem; }
    article th, article td { text-align: left; padding: 9px 12px; vertical-align: top; border-bottom: 1px solid color-mix(in srgb, var(--landing-ink) 20%, transparent); }
    article th { background: color-mix(in srgb, var(--tone) 22%, var(--landing-paper-2)); font-weight: 900; }
    article tr:last-child td { border-bottom: 0; }
    article blockquote { margin: 1.3em 0; padding: 4px 0 4px 18px; border-left: 4px solid var(--landing-ink-soft); color: var(--landing-ink-soft); }
    article .callout {
      position: relative; padding: 16px 18px 14px; border-left: 0; border-radius: 16px; color: var(--landing-ink);
      background: color-mix(in srgb, var(--co) 14%, var(--landing-paper-2)); border: 2px solid var(--landing-ink);
      box-shadow: 4px 5px 0 var(--landing-paper-shadow);
    }
    article .callout[data-callout='tip'] { --co: var(--landing-explorer); }
    article .callout[data-callout='note'] { --co: var(--landing-author); }
    article .callout[data-callout='warning'] { --co: var(--landing-grownup); }
    article .callout p { margin: 0.4em 0; color: var(--landing-ink); }
    article .callout-label {
      display: inline-block; margin: 0 0 4px !important; padding: 1px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 900;
      letter-spacing: 0.1em; text-transform: uppercase; background: var(--co); color: var(--landing-paper-2);
    }
    article .callout[data-callout='tip'] .callout-label { color: var(--landing-on-cta); }
    article math-div { display: block; margin: 1em 0; padding: 0.8em 1em; overflow-x: auto; border-radius: 14px; background: var(--landing-paper-2); border: 1.5px solid color-mix(in srgb, var(--landing-ink) 20%, transparent); }
    article try-block { --rule-w: 2.5px; }

    /* ---- captioned screenshots (every audience) ------------------------ */
    article figure.shot { position: relative; margin: 1.8em 0 1.6em; }
    article figure.shot img { display: block; width: 100%; }
    article figure.shot::before {
      content: ''; position: absolute; top: -12px; left: 50%; width: 92px; height: 24px; z-index: 1;
      transform: translateX(-50%) rotate(-2deg); border-radius: 3px;
      background: color-mix(in srgb, var(--landing-dawn-2) 70%, transparent);
    }
    article figcaption { margin-top: 12px; font-size: 0.94rem; line-height: 1.5; font-weight: 700; color: var(--landing-ink-soft); }

    /* ---- Quill (student guides) ----------------------------------------- */
    article .callout[data-callout='quill'] {
      --co: var(--landing-explorer);
      display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 4px 14px; align-items: start;
      margin: 1.6em 0; padding: 0; background: none; border: 0; box-shadow: none;
    }
    article .callout[data-callout='quill'] .quill-slot { grid-row: 1 / span 9; align-self: end; display: block; }
    article .callout[data-callout='quill'] .quill-slot companion-slot > * { --quill-size: 64px; display: block; }
    /* No companion: the tip takes the whole width. */
    article .callout[data-callout='quill']:has(companion-slot:empty) { grid-template-columns: minmax(0, 1fr); }
    article .callout[data-callout='quill']:has(companion-slot:empty) .quill-slot { display: none; }
    article .callout[data-callout='quill']:has(companion-slot:empty) > p { grid-column: 1; }
    article .callout[data-callout='quill'] > p {
      position: relative; grid-column: 2; margin: 0; padding: 14px 18px; border-radius: 20px 20px 20px 6px;
      background: color-mix(in srgb, var(--co) 16%, var(--landing-paper-2));
      border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 4px 5px 0 var(--landing-paper-shadow);
      font-weight: 700;
    }
    article .callout[data-callout='quill'] > p[data-by]::before {
      content: attr(data-by); display: block; margin-bottom: 2px; font-family: var(--gk-display); font-weight: 700; font-size: 0.86rem;
      letter-spacing: 0.04em; color: var(--landing-ink-soft);
    }
    article .callout[data-callout='quill'] > p + p::before { content: none; }
    .q-react {
      display: flex; align-items: center; gap: 12px; margin: -6px 0 26px; padding: 8px 16px 8px 8px;
      border-radius: 999px; width: fit-content; max-width: 100%; font-weight: 800;
      background: color-mix(in srgb, var(--rc) 18%, var(--landing-paper-2)); border: 2px solid var(--landing-ink);
      animation: pop-in 380ms var(--ease-spring) both;
    }
    .q-react[data-kind='right'] { --rc: var(--landing-explorer); }
    .q-react[data-kind='part'], .q-react[data-kind='coach'] { --rc: var(--landing-dawn-2); }
    .q-react[data-kind='zero'] { --rc: var(--landing-aurora-3); }
    .q-react companion-slot > * { --quill-size: 52px; flex: none; }
    .q-react p { margin: 0; line-height: 1.4; }
    @keyframes pop-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }

    .hero-q { position: relative; width: 168px; height: 168px; display: grid; place-items: end center; margin-bottom: -40px; }
    .hero-q companion-slot > * { --quill-size: 150px; }
    .hero-q .sticker {
      position: absolute; top: 4px; left: -18px; display: grid; place-items: center; width: 64px; height: 64px;
      border-radius: 20px; transform: rotate(-10deg); color: var(--landing-sky-top); background: var(--landing-display-grad-1);
      border: 3px solid var(--landing-sky-top); box-shadow: 0 0 0 5px color-mix(in srgb, var(--landing-display-grad-1) 30%, transparent);
    }
    .hero-q .sticker svg { width: 34px; height: 34px; }
    :host([compact]) .hero-q { display: none; }

    .done {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px 22px;
      margin-top: 56px; max-width: 46rem; padding: 22px 26px 22px 18px; border-radius: 26px; overflow: hidden; position: relative; isolation: isolate;
      color: var(--landing-on-night); border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 6px 7px 0 var(--landing-paper-shadow);
      background:
        radial-gradient(circle at 12% 22%, var(--landing-star) 0 1.5px, transparent 2.5px),
        radial-gradient(circle at 68% 18%, var(--landing-star) 0 1px, transparent 2px),
        radial-gradient(circle at 88% 70%, var(--landing-star) 0 1.5px, transparent 2.5px),
        radial-gradient(circle at 40% 80%, var(--landing-star) 0 1px, transparent 2px),
        linear-gradient(135deg, var(--landing-sky-top), var(--landing-sky-mid) 60%, var(--landing-sky-low));
    }
    .done companion-slot > * { --quill-size: 92px; }
    .done h2 { margin: 0 0 4px; font-family: var(--gk-display); font-weight: 700; font-size: 1.6rem; line-height: 1.1; }
    .done p { margin: 0; color: var(--landing-on-night-soft); font-weight: 700; line-height: 1.45; }
    .done .cta { white-space: normal; text-align: center; }
    .done .cta svg { width: 18px; height: 18px; flex: none; }

    /* ---- the student look ------------------------------------------------ */
    :host([data-aud='student']) .paper-bg {
      background-image:
        radial-gradient(circle, color-mix(in srgb, var(--landing-explorer) 40%, transparent) 0 3px, transparent 3.5px),
        radial-gradient(circle, color-mix(in srgb, var(--landing-dawn-1) 35%, transparent) 0 2.5px, transparent 3px),
        radial-gradient(circle, color-mix(in srgb, var(--landing-aurora-3) 35%, transparent) 0 2.5px, transparent 3px);
      background-size: 230px 230px, 310px 310px, 270px 270px;
      background-position: 30px 40px, 160px 190px, 90px 120px;
    }
    :host([data-aud='student']) article { counter-reset: sec; }
    :host([data-aud='student']) article h2 { counter-increment: sec; display: flex; align-items: center; gap: 14px; }
    :host([data-aud='student']) article h2::before {
      content: counter(sec); flex: none; display: grid; place-items: center; width: 44px; height: 44px; margin: 0;
      border-radius: 15px; transform: rotate(-6deg); font-size: 1.25rem; color: var(--landing-sky-top);
      background: var(--hc, var(--landing-explorer)); border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 3px 3px 0 var(--landing-ink);
    }
    :host([data-aud='student']) article h2:nth-of-type(5n + 2) { --hc: var(--landing-dawn-2); }
    :host([data-aud='student']) article h2:nth-of-type(5n + 3) { --hc: var(--landing-aurora-3); }
    :host([data-aud='student']) article h2:nth-of-type(5n + 4) { --hc: var(--landing-aurora-2); }
    :host([data-aud='student']) article h2:nth-of-type(5n) { --hc: var(--landing-dawn-1); }
    :host([data-aud='student']) article h2:nth-of-type(even)::before { transform: rotate(5deg); }

    .nb { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 64px; max-width: 46rem; }
    .nb a {
      display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border-radius: 16px; text-decoration: none; color: var(--landing-ink);
      background: var(--landing-paper-2); border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 4px 5px 0 var(--landing-paper-shadow);
      transition: transform var(--motion-base) var(--ease-spring);
    }
    .nb a:hover { transform: translateY(-3px); }
    .nb a.next { text-align: right; grid-column: 2; }
    .nb small { display: inline-flex; align-items: center; gap: 6px; font-weight: 900; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--landing-ink-soft); }
    .nb a.next small { justify-content: flex-end; }
    .nb small svg { width: 15px; height: 15px; }
    .nb b { font-family: var(--gk-display); font-size: 1.15rem; }
    .msg { margin: 40px 0 90px; padding: 26px; border: var(--gk-ink-w) dashed var(--landing-ink-soft); border-radius: 18px; font-weight: 700; line-height: 1.6; }

    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr); gap: 0; }
      .toc { display: none; }
      .toc-m { display: block; }
    }
    @media (max-width: 600px) {
      .head { padding: 92px 0 52px; }
      .head .wrap { grid-template-columns: 1fr; }
      .big-ic { display: none; }
      article { font-size: 1.03rem; }
      article h2 { font-size: 1.5rem; }
      .nb { grid-template-columns: 1fr; }
      .nb a.next { grid-column: 1; }
      .hero-q { display: none; }
      .done { grid-template-columns: auto minmax(0, 1fr); padding: 18px; }
      .done companion-slot > * { --quill-size: 72px; }
      .done .cta { grid-column: 1 / -1; }
      article .callout[data-callout='quill'] { grid-template-columns: 48px minmax(0, 1fr); gap: 4px 10px; }
      article .callout[data-callout='quill'] .quill-slot companion-slot > * { --quill-size: 48px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .q-react { animation: none; }
    }
  `, plainSiteStyles];

  constructor() {
    super();
    this._adult = false;
    this.slug = '';
    this.heading = '';
    this.compact = false;
    this._meta = null;
    this._status = 'loading';
    this._error = '';
    this._nb = { prev: null, next: null };
    this._active = '';
    this._theme = ThemeManager.getTheme() || 'dark';
    this._onTheme = ({ theme }) => { this._theme = theme; this.setAttribute('data-theme', theme); };
    // A paper band (parents, authors) wants the paper bar from the top.
    this._chrome = new SiteChrome(this, {
      barSwitchAt: () => (this._meta && this._meta.audience !== 'student' ? -1 : (this.renderRoot.querySelector('.head')?.offsetHeight || 300) - 70),
    });
    this._onClick = this._onClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    ensureStoryFonts();
    this.setAttribute('data-theme', this._theme);
    EventBus.on('theme:changed', this._onTheme);
    if (!this.compact) this._chrome.connect();
    readerIsAdult().then((v) => { this._adult = v; });
  }

  disconnectedCallback() {
    EventBus.off('theme:changed', this._onTheme);
    this._chrome.disconnect();
    this._io?.disconnect();
    this._endIo?.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.renderRoot.addEventListener('click', this._onClick);
    this.renderRoot.addEventListener('try-result', (e) => this._react(e.target, e.detail));
  }

  get _reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** The look's companion answers a checked try-block, in student guides,
   *  just under it (brand module `guideReactions`; none, no answer). */
  _react(tb, { score, correct, final }) {
    if (this._meta?.audience !== 'student' || tb?.tagName !== 'TRY-BLOCK') return;
    const kind = correct && final ? 'right' : !final ? 'coach' : score > 0 ? 'part' : 'zero';
    const reaction = LookManager.brand()?.guideReactions?.[kind];
    if (!reaction) return;
    const [face, act, lines] = reaction;
    let box = tb.nextElementSibling?.classList.contains('q-react') ? tb.nextElementSibling : null;
    if (!box) {
      box = document.createElement('div');
      box.className = 'q-react';
      box.setAttribute('role', 'status');
      const q = document.createElement('companion-slot');
      q.setAttribute('size', 'mini');
      q.idle = false;
      box.append(q, document.createElement('p'));
      tb.after(box);
    }
    box.dataset.kind = kind;
    this._reactN = (this._reactN || 0) + 1;
    box.querySelector('p').textContent = lines[this._reactN % lines.length];
    const slot = box.querySelector('companion-slot');
    slot.expression = face;
    const q = slot.companion;
    if (act && !this._reduced) q?.updateComplete?.then(() => q.perform?.(act));
  }

  /** Quill cheers once when the "You finished" card comes into view. */
  _watchEnd() {
    this._endIo?.disconnect();
    const card = this.renderRoot.querySelector('.done');
    if (!card || !('IntersectionObserver' in window)) return;
    this._endIo = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      this._endIo.disconnect();
      if (!this._reduced) card.querySelector('companion-slot')?.companion?.perform?.('cheer');
    }, { threshold: 0.6 });
    this._endIo.observe(card);
  }

  updated(changed) {
    if (changed.has('slug') && this.slug) this._load();
    else if (changed.has('heading') && this.heading && this._status === 'ready') this._scrollTo(this.heading, false);
  }

  async _load() {
    const slug = this.slug;
    this._status = 'loading';
    this._io?.disconnect();
    if (!this.compact) window.scrollTo(0, 0);
    try {
      const meta = await GuideService.get(slug);
      if (!meta) {
        const { missing } = await GuideService.loadIndex();
        throw new Error(missing ? 'The guides have not been published on this server yet.' : `There is no guide called "${slug}".`);
      }
      const md = await GuideService.loadMarkdown(slug);
      const { html: body, tries } = await GuideService.render(md);
      if (slug !== this.slug) return; // the reader moved on while this loaded
      this._meta = meta;
      this.setAttribute('data-aud', meta.audience);
      this._chrome.onScroll();
      this._nb = await GuideService.neighbours(slug);
      this._status = 'ready';
      await this.updateComplete;
      const article = this.renderRoot.querySelector('article');
      article.innerHTML = body; // sanitised by GuideService.render()
      this._enhance(article, tries);
      this._watchHeadings(article);
      this._watchEnd();
      if (this.heading) requestAnimationFrame(() => this._scrollTo(this.heading, false));
    } catch (e) {
      this._error = e.message;
      this._status = 'error';
    }
  }

  /** Copy buttons on code blocks, and a <try-block> in each try slot. */
  _enhance(article, tries) {
    for (const pre of article.querySelectorAll('pre')) {
      const wrap = document.createElement('div');
      wrap.className = 'pre-wrap';
      pre.replaceWith(wrap);
      wrap.append(pre);
      const btn = document.createElement('button');
      btn.className = 'copy';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy this code');
      btn.addEventListener('click', () => this._copy(pre.innerText, btn));
      wrap.append(btn);
    }
    for (const table of article.querySelectorAll('table')) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.replaceWith(wrap);
      wrap.append(table);
    }
    for (const slot of article.querySelectorAll('.try-slot')) {
      const t = tries[Number(slot.dataset.try)];
      const el = document.createElement('try-block');
      if (t?.data) el.data = t.data;
      else el.data = { type: 'invalid', error: t?.error };
      el.bundleId = 'coauthor-showcase';
      slot.replaceWith(el);
    }
    for (const slot of article.querySelectorAll('.quill-slot')) {
      const q = document.createElement('companion-slot');
      q.setAttribute('size', 'mini');
      q.idle = false;
      q.expression = slot.dataset.face || 'happy';
      slot.append(q);
      const name = brandCopy('companionName');
      if (name) slot.parentElement?.querySelector(':scope > p')?.setAttribute('data-by', name);
    }
  }

  /** navigator.clipboard is missing on a plain-HTTP LAN origin, so fall back
   *  to a hidden textarea and execCommand. */
  async _copy(text, btn) {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); ok = true; }
    } catch { /* fall back */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      this.renderRoot.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    btn.textContent = ok ? 'Copied' : 'Select and copy';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  }

  _watchHeadings(article) {
    const hs = [...article.querySelectorAll('h2[id], h3[id]')];
    if (!hs.length || !('IntersectionObserver' in window)) return;
    this._io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) this._active = vis[0].target.id;
    }, { rootMargin: '-90px 0px -65% 0px' });
    hs.forEach((h) => this._io.observe(h));
  }

  _scrollTo(id, smooth = true) {
    const el = this.renderRoot.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: smooth && !reduced ? 'smooth' : 'auto', block: 'start' });
    this._active = id;
  }

  /** In-page anchors scroll inside this shadow root (a plain #id would be read
   *  as a route). In the sheet, links to other guides swap in place. */
  _onClick(e) {
    const a = e.composedPath().find((n) => n.tagName === 'A');
    if (!a) return;
    const anchor = a.dataset?.anchor || a.dataset?.toc;
    if (anchor) {
      e.preventDefault();
      this._scrollTo(anchor);
      if (!this.compact) history.replaceState(history.state, '', `#/guides/${this.slug}?h=${anchor}`);
      return;
    }
    const m = /^#\/guides\/([^?]+)(?:\?h=(.+))?$/.exec(a.getAttribute('href') || '');
    if (this.compact && m) {
      e.preventDefault();
      this.heading = m[2] || '';
      this.slug = decodeURIComponent(m[1]);
    }
  }

  _toc(cls) {
    const hs = this._meta?.headings || [];
    return html`<ol>${hs.map((h) => html`<li><a href="#" data-toc=${h.id} class="d${h.depth} ${this._active === h.id ? 'on' : ''}">${h.text}</a></li>`)}</ol>`;
  }

  _band() {
    const m = this._meta;
    const aud = m?.audience || 'student';
    const night = aud === 'student';
    return html`
      <header class="band head tone-${aud} ${night ? '' : 'paper'}">
        ${night ? skyBand() : paperBand(aud)}
        <div class="wrap">
          <div>
            <p class="crumbs">
              <a href="#/guides">Guides</a>${iconChevronRight}
              <a href="#/guides?for=${aud}">${AUDIENCE[aud]?.label || ''}</a>
            </p>
            <h1>${m?.title || (this._status === 'error' ? 'Guide not found' : 'Loading...')}</h1>
            ${!m && this._status === 'loading' ? html`<app-loader size="48"></app-loader>` : ''}
            ${m ? html`
              <p class="sum">${m.summary}</p>
              <p class="meta">
                <span>${iconClock}${m.minutes} min read</span>
                ${m.tries ? html`<span>${iconBolt}${m.tries} live example${m.tries > 1 ? 's' : ''}</span>` : ''}
                <span>Updated ${formatDate(m.updated)}</span>
              </p>` : ''}
          </div>
          ${m && night ? html`
            <span class="hero-q" aria-hidden="true">
              <companion-slot size="md" act="wave"></companion-slot>
              <span class="sticker">${GUIDE_ICON[m.icon] || iconGuide}</span>
            </span>` : m ? html`<span class="big-ic" aria-hidden="true">${GUIDE_ICON[m.icon] || iconGuide}</span>` : ''}
        </div>
        ${tornEdge}
      </header>`;
  }

  render() {
    const aud = this._meta?.audience || 'student';
    const { prev, next } = this._nb;
    return html`
      ${this.compact ? '' : html`<div class="sbar-slot">${siteBar({ theme: this._theme, adult: this._adult, onTheme: () => ThemeManager.setTheme(this._theme === 'dark' ? 'light' : 'dark') })}</div>`}
      ${this._band()}
      <div class="paper-bg tone-${aud}">
        <div class="wrap">
          ${this._status === 'error' ? html`
            <div class="msg" role="alert">${this._error}<br><a class="ink-btn" href="#/guides" style="margin-top:14px">${iconArrowLeft} All guides</a></div>` : html`
            <div class="layout">
              <nav class="toc" aria-label="On this page"><h2>${iconToc} On this page</h2>${this._toc()}</nav>
              <div>
                <details class="toc-m"><summary>${iconToc} On this page</summary>${this._toc()}</details>
                <article></article>
                ${aud === 'student' && this._status === 'ready' ? html`
                  <section class="done" aria-labelledby="done-h">
                    <companion-slot size="sm" expression="heart" .idle=${false}></companion-slot>
                    <div>
                      <h2 id="done-h">You finished this guide!</h2>
                      <p>${next ? html`Up next: ${next.title}.` : 'That was the last student guide. Time for a real lesson.'}</p>
                    </div>
                    ${next
                      ? html`<a class="cta small" href="#/guides/${next.slug}">Next guide ${iconArrowRight}</a>`
                      : this.compact ? '' : html`<a class="cta small" href="#/">${this._adult ? 'My courses' : 'Start learning'} ${iconArrowRight}</a>`}
                  </section>` : ''}
                ${prev || next ? html`
                  <nav class="nb" aria-label="More ${AUDIENCE[aud]?.label.toLowerCase() || ''} guides">
                    ${prev ? html`<a class="prev" href="#/guides/${prev.slug}"><small>${iconArrowLeft} Previous</small><b>${prev.title}</b></a>` : ''}
                    ${next ? html`<a class="next" href="#/guides/${next.slug}"><small>Next ${iconArrowRight}</small><b>${next.title}</b></a>` : ''}
                  </nav>` : ''}
              </div>
            </div>`}
        </div>
      </div>
    `;
  }
}

customElements.define('guide-view', GuideView);
