import '../../components/LookSlots.js';
import { LitElement, html, css, svg } from 'lit';
import { EventBus } from '../../../core/EventBus.js';
import { ThemeManager } from '../../../core/ThemeManager.js';
import { ensureStoryFonts } from '../../../core/LessonModeManager.js';
import { GuideService } from '../../../core/GuideService.js';
import { iconGuide, iconArrowRight, iconClock, iconSearch, iconBolt } from '../../icons/uiIcons.js';
import {
  GUIDE_ICON, AUDIENCE, formatDate, siteBar, skyBand, tornEdge, siteStyles, plainSiteStyles, SiteChrome, readerIsAdult,
} from './guideKit.js';
import { LookMixin } from '../../../core/mixins/LookMixin.js';

/**
 * <guides-index> - the guides library at #/guides
 * (docs/sprints/completed/landing-page-and-guides.md, "Reading in the app").
 * A night-sky header that tears into paper, audience tabs as notebook tabs,
 * and one notebook card per guide. `audience` (from ?for=) preselects a tab.
 * Student cards are livelier: a night-sky art strip with a colour sticker,
 * and Quill introduces the students' shelf. A signed-in adult gets no
 * Parents shelf (they are their own grown-up) and "My courses" in the bar.
 */
const TABS = [['', 'All guides'], ['student', AUDIENCE.student.label], ['parent', AUDIENCE.parent.label], ['author', AUDIENCE.author.label]];

export class GuidesIndex extends LookMixin(LitElement) {
  static properties = {
    audience: { type: String },
    _guides: { state: true },
    _missing: { state: true },
    _q: { state: true },
    _theme: { state: true },
    _adult: { state: true },
  };

  static styles = [siteStyles, css`
    .head { padding: 112px 0 76px; }
    .head .wrap { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 24px; }
    h1 {
      margin: 16px 0 12px; font-family: var(--gk-display); font-weight: 700; letter-spacing: -0.025em;
      font-size: clamp(2.5rem, 7vw, 4.6rem); line-height: 1;
    }
    .key {
      background: linear-gradient(95deg, var(--landing-display-grad-1), var(--landing-display-grad-2) 48%, var(--landing-display-grad-3));
      -webkit-background-clip: text; background-clip: text; color: transparent; white-space: nowrap;
    }
    .lede { margin: 0; max-width: 34em; font-size: 1.12rem; line-height: 1.55; color: var(--landing-on-night-soft); font-weight: 600; }
    .q > * { --quill-size: clamp(110px, 13vw, 150px); margin-bottom: -18px; }
    .tw g { animation: tw 3.6s ease-in-out infinite; }
    .tw g:nth-child(2) { animation-delay: -1.2s; }
    .tw g:nth-child(3) { animation-delay: -2.4s; }
    @keyframes tw { 50% { transform: scale(0.4); opacity: 0.4; } }

    .body { padding: 18px 0 96px; }
    .tools { display: flex; align-items: end; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: var(--gk-ink-w) solid var(--landing-ink); }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: -2.5px; }
    .tab {
      font: inherit; font-weight: 900; font-size: 0.95rem; cursor: pointer; color: var(--landing-ink);
      padding: 10px 16px 9px; border-radius: 14px 14px 0 0; background: var(--landing-paper-2);
      border: var(--gk-ink-w) solid var(--landing-ink); border-bottom-color: transparent;
      transform: translateY(5px); transition: transform var(--motion-fast);
      position: relative;
    }
    .tab::before { content: ''; position: absolute; left: 10px; right: 10px; top: 5px; height: 4px; border-radius: 4px; background: var(--tone, var(--landing-ink-soft)); }
    .tab:hover { transform: translateY(2px); }
    .tab[aria-selected='true'] { transform: none; background: var(--landing-paper); border-bottom-color: var(--landing-paper); z-index: 1; }
    .search { position: relative; display: inline-block; margin-bottom: 10px; }
    .search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--landing-ink-soft); }
    .search input {
      font: inherit; font-weight: 700; width: min(280px, 80vw); padding: 10px 14px 10px 38px; border-radius: 12px;
      color: var(--landing-ink); background: var(--landing-paper-2); border: 2px solid var(--landing-ink-soft);
    }
    .search input:focus-visible { outline: 3px solid var(--landing-grownup); outline-offset: 1px; }

    section.aud { margin-top: 44px; }
    .aud-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
    .aud-head h2 { margin: 0; font-family: var(--gk-poster); font-weight: 400; font-size: clamp(1.5rem, 3vw, 2.1rem); text-transform: uppercase; letter-spacing: -0.01em; }
    .aud-head h2::after { content: ''; display: block; height: 6px; margin-top: 4px; border-radius: 6px; background: var(--tone); width: 2.2em; }
    .aud-head p { margin: 0; color: var(--landing-ink-soft); font-weight: 700; }

    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 30px 24px; }
    .card {
      position: relative; display: flex; flex-direction: column; height: 100%; text-decoration: none; color: inherit;
      padding: 30px 20px 18px 30px; border-radius: 6px 18px 18px 6px;
      background: var(--landing-paper-2);
      border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 5px 6px 0 var(--landing-paper-shadow);
      transition: transform var(--motion-base) var(--ease-spring), box-shadow var(--motion-base);
    }
    .card::before { content: ''; position: absolute; left: 14px; top: 0; bottom: 0; border-left: 2px solid color-mix(in srgb, var(--landing-grownup) 45%, transparent); }
    .card:hover, .card:focus-visible { transform: translateY(-4px) rotate(-0.4deg); box-shadow: 8px 11px 0 var(--landing-paper-shadow); }
    .card .tag {
      position: absolute; top: -15px; right: 18px; padding: 4px 12px 6px; border-radius: 10px 10px 4px 4px;
      font-size: 0.72rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase;
      background: var(--tone); color: var(--landing-paper-2); border: 2px solid var(--landing-ink);
      transition: transform var(--motion-base) var(--ease-spring);
    }
    .tone-student .tag { color: var(--landing-on-cta); }
    .card:hover .tag { transform: translateY(-4px); }
    .ic {
      display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; margin-bottom: 12px;
      color: var(--landing-ink); background: color-mix(in srgb, var(--tone) 26%, var(--landing-paper-2));
      border: 2px solid var(--landing-ink);
    }
    .ic svg { width: 24px; height: 24px; }
    .card h3 { margin: 0 0 6px; font-family: var(--gk-display); font-weight: 700; font-size: 1.32rem; line-height: 1.15; }
    .card p { margin: 0 0 14px; line-height: 1.5; color: var(--landing-ink-soft); font-weight: 600; flex: 1; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.84rem; font-weight: 800; color: var(--landing-ink-soft); }
    .meta span { display: inline-flex; align-items: center; gap: 5px; }
    .meta svg { width: 15px; height: 15px; }
    .meta .live { color: var(--landing-ink); background: color-mix(in srgb, var(--landing-explorer) 30%, transparent); padding: 1px 8px; border-radius: 999px; }
    .clip { position: absolute; left: 34px; top: -22px; width: 22px; height: 54px; }
    .clip path { fill: none; stroke: var(--landing-ink-soft); stroke-width: 3; stroke-linecap: round; }
    /* Student cards: a strip of night sky across the top, the guide's icon on
       a tilted sticker, and a "Try it inside" star when it has live examples. */
    .card.tone-student { padding-top: 0; }
    .card.tone-student::before { top: 96px; }
    .card.tone-student .art {
      position: relative; display: block; height: 96px; margin: 0 -20px 14px -30px; border-radius: 4px 16px 0 0;
      border-bottom: var(--gk-ink-w) solid var(--landing-ink);
      background:
        radial-gradient(circle at 14% 30%, var(--landing-star) 0 1.5px, transparent 2.5px),
        radial-gradient(circle at 46% 18%, var(--landing-star) 0 1px, transparent 2px),
        radial-gradient(circle at 72% 46%, var(--landing-star) 0 1.5px, transparent 2.5px),
        radial-gradient(circle at 90% 22%, var(--landing-star) 0 1px, transparent 2px),
        radial-gradient(ellipse 70% 40% at 80% 110%, color-mix(in srgb, var(--sc) 55%, transparent), transparent 70%),
        linear-gradient(160deg, var(--landing-sky-top), var(--landing-sky-mid) 70%, var(--landing-sky-low));
    }
    .card.tone-student .art .ic {
      position: absolute; left: 26px; bottom: -22px; margin: 0; width: 58px; height: 58px; border-radius: 18px;
      color: var(--landing-sky-top); background: var(--sc); transform: rotate(-7deg);
      border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 3px 3px 0 var(--landing-ink);
      transition: transform var(--motion-base) var(--ease-spring);
    }
    .card.tone-student .art .ic svg { width: 30px; height: 30px; }
    .card.tone-student:hover .art .ic { transform: rotate(4deg) scale(1.08); }
    .card.tone-student .art .planet {
      position: absolute; right: 22px; top: 18px; width: 30px; height: 30px; border-radius: 50%;
      background: var(--landing-planet-a); box-shadow: inset -7px -5px 0 color-mix(in srgb, var(--landing-sky-top) 30%, transparent);
    }
    .card.tone-student .art .planet::after {
      content: ''; position: absolute; left: -9px; right: -9px; top: 11px; height: 8px; border-radius: 50%;
      border: 2.5px solid var(--landing-planet-rim); transform: rotate(-14deg);
    }
    .card.tone-student h3 { margin-top: 26px; }
    .card.tone-student .tag, .card.tone-student .clip { z-index: 2; }
    .grid li:nth-child(3n + 2) .art .planet { right: 46%; top: 34px; transform: scale(0.7); }
    .grid li:nth-child(3n) .art .planet { right: 70px; top: 52px; transform: scale(0.85); }
    .card.tone-student .tag { top: 12px; right: 64px; border-radius: 999px; padding: 3px 10px 4px; }
    .grid li:nth-child(5n + 1) .tone-student { --sc: var(--landing-explorer); }
    .grid li:nth-child(5n + 2) .tone-student { --sc: var(--landing-dawn-2); }
    .grid li:nth-child(5n + 3) .tone-student { --sc: var(--landing-aurora-3); }
    .grid li:nth-child(5n + 4) .tone-student { --sc: var(--landing-aurora-2); }
    .grid li:nth-child(5n) .tone-student { --sc: var(--landing-display-grad-1); }
    .say {
      display: flex; align-items: flex-end; gap: 10px; margin-left: auto;
    }
    .say companion-slot > * { --quill-size: 64px; }
    .say p {
      position: relative; margin: 0 0 30px; padding: 8px 14px; border-radius: 16px 16px 4px 16px; font-weight: 800; font-size: 0.92rem;
      color: var(--landing-ink); background: color-mix(in srgb, var(--landing-explorer) 18%, var(--landing-paper-2));
      border: 2px solid var(--landing-ink);
    }

    .empty { margin: 48px 0; padding: 28px; border: var(--gk-ink-w) dashed var(--landing-ink-soft); border-radius: 18px; font-weight: 700; line-height: 1.6; }
    .empty code { font-size: 0.9em; }
    .foot { margin-top: 64px; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; padding: 22px 26px; border-radius: 20px; border: var(--gk-ink-w) dashed var(--landing-ink-soft); }
    .foot p { margin: 0; font-weight: 700; color: var(--landing-ink-soft); }

    @media (max-width: 640px) {
      .head { padding: 96px 0 56px; }
      .head .wrap { grid-template-columns: 1fr; }
      .q > * { display: none; }
      .tools { border-bottom: 0; }
      .tabs { margin-bottom: 0; }
      .tab, .tab[aria-selected='true'] { border-radius: 999px; border-bottom-color: var(--landing-ink); transform: none; padding: 8px 14px; }
      .tab::before { display: none; }
      .tab[aria-selected='true'] { background: var(--landing-ink); color: var(--landing-paper-2); }
      .say p { display: none; }
    }
  `, plainSiteStyles];

  constructor() {
    super();
    this.audience = '';
    this._guides = null;
    this._missing = false;
    this._q = '';
    this._adult = false;
    this._theme = ThemeManager.getTheme() || 'dark';
    this._onTheme = ({ theme }) => { this._theme = theme; this.setAttribute('data-theme', theme); };
    this._chrome = new SiteChrome(this, { barSwitchAt: () => (this.renderRoot.querySelector('.head')?.offsetHeight || 300) - 70 });
  }

  connectedCallback() {
    super.connectedCallback();
    ensureStoryFonts();
    this.setAttribute('data-theme', this._theme);
    EventBus.on('theme:changed', this._onTheme);
    this._chrome.connect();
    window.scrollTo(0, 0);
    readerIsAdult().then((v) => { this._adult = v; });
    GuideService.loadIndex().then(({ guides, missing }) => { this._guides = guides; this._missing = !!missing; });
  }

  disconnectedCallback() {
    EventBus.off('theme:changed', this._onTheme);
    this._chrome.disconnect();
    super.disconnectedCallback();
  }

  _setAudience(a) {
    this.audience = a;
    history.replaceState(history.state, '', a ? `#/guides?for=${a}` : '#/guides');
  }

  _card(g, newest) {
    return html`
      <li>
        <a class="card tone-${g.audience}" href="#/guides/${g.slug}">
          ${g.slug === newest ? svg`<svg class="clip" viewBox="0 0 22 54" aria-hidden="true"><path d="M7 22V9a4 4 0 0 1 8 0v30a7 7 0 0 1-14 0V14"></path></svg>` : ''}
          <span class="tag">${AUDIENCE[g.audience]?.label || g.audience}</span>
          ${g.audience === 'student'
            ? html`<span class="art" aria-hidden="true"><span class="planet"></span><span class="ic">${GUIDE_ICON[g.icon] || iconGuide}</span></span>`
            : html`<span class="ic" aria-hidden="true">${GUIDE_ICON[g.icon] || iconGuide}</span>`}
          <h3>${g.title}</h3>
          <p>${g.summary}</p>
          <span class="meta">
            <span>${iconClock}${g.minutes} min read</span>
            ${g.tries ? html`<span class="live">${iconBolt}Try it inside</span>` : ''}
            <span>Updated ${formatDate(g.updated)}</span>
          </span>
        </a>
      </li>`;
  }

  _body() {
    if (this._guides === null) return html`<app-loader label="Loading guides..."></app-loader>`;
    if (this._missing) {
      return html`<div class="empty">The guides have not been published on this server yet.
        Whoever runs it can publish them with <code>node tools/guides/build-guides.mjs</code>
        (the start script does this for you).</div>`;
    }
    const q = this._q.trim().toLowerCase();
    const match = (g) => !q || `${g.title} ${g.summary}`.toLowerCase().includes(q);
    const newest = [...this._guides].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0]?.slug;
    const shown = this._adult ? GuideService.AUDIENCES.filter((a) => a !== 'parent') : GuideService.AUDIENCES;
    const aud = shown.includes(this.audience) ? this.audience : '';
    const auds = aud ? [aud] : shown;
    const sections = auds.map((a) => [a, this._guides.filter((g) => g.audience === a && match(g))]).filter(([, list]) => list.length);
    if (!sections.length) return html`<p class="empty">No guide matches "${this._q}".</p>`;
    return sections.map(([a, list]) => html`
      <section class="aud tone-${a}" aria-labelledby="aud-${a}">
        <div class="aud-head"><h2 id="aud-${a}">${AUDIENCE[a].label}</h2><p>${AUDIENCE[a].blurb}</p>
          ${a === 'student' ? html`<span class="say" aria-hidden="true"><p>New here? Start with the first one!</p><companion-slot size="mini" act="wave"></companion-slot></span>` : ''}</div>
        <ul class="grid">${list.map((g) => this._card(g, newest))}</ul>
      </section>`);
  }

  render() {
    return html`
      <div class="sbar-slot">${siteBar({ theme: this._theme, adult: this._adult, onTheme: () => ThemeManager.setTheme(this._theme === 'dark' ? 'light' : 'dark') })}</div>
      <header class="band head">
        ${skyBand()}
        <div class="wrap">
          <div>
            <span class="kicker">${iconGuide} Guides</span>
            <h1>Read it. Then <span class="key">try it.</span></h1>
            <p class="lede">${this._adult ? 'Short guides for learners and authors.' : 'Short guides for students, parents and authors.'} Some have live examples you can try on the page.</p>
          </div>
          <companion-slot class="q" size="sm" expression="happy"></companion-slot>
        </div>
        ${tornEdge}
      </header>
      <main class="body paper-bg">
        <div class="wrap">
          <div class="tools">
            <div class="tabs" role="tablist" aria-label="Who the guides are for">
              ${TABS.filter(([a]) => !(this._adult && a === 'parent')).map(([a, label]) => html`<button class="tab ${a ? `tone-${a}` : ''}" role="tab"
                aria-selected=${(this._adult && this.audience === 'parent' ? '' : this.audience || '') === a ? 'true' : 'false'} @click=${() => this._setAudience(a)}>${label}</button>`)}
            </div>
            <label class="search">${iconSearch}<span class="sr-only">Search guides</span>
              <input type="search" placeholder="Search guides" .value=${this._q} @input=${(e) => { this._q = e.target.value; }}>
            </label>
          </div>
          ${this._body()}
          <div class="foot">
            <p>New here? The welcome page shows what CoAuthor is in two minutes.</p>
            <a class="ink-btn" href="#/welcome">See the welcome page ${iconArrowRight}</a>
          </div>
        </div>
      </main>
    `;
  }
}

customElements.define('guides-index', GuidesIndex);
