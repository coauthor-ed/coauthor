import { html, svg, css } from 'lit';
import '../../components/LookSlots.js';
import {
  iconSun, iconMoon, iconCompass, iconNib, iconGuide, iconMath, iconFork, iconShieldHome, iconDoor,
  iconBackup, iconChart, iconClipboard, iconSliders, iconGlobe, iconLock, iconParent, iconClock,
  iconCheck, iconBookOpen, iconGamepad,
} from '../../icons/uiIcons.js';
import { BAND_STARS, sparkle } from '../landing/landingArt.js';
import { ProgressStore } from '../../../core/ProgressStore.js';
import { AuthService } from '../../../core/AuthService.js';

/**
 * Shared pieces of the guides pages (#/guides, #/guides/<slug>): the site
 * bar, the header bands in each audience's art, the icon table, and the
 * styles they all use. Colours come only from --landing-* and app tokens.
 */

export const GUIDE_ICON = {
  math: iconMath, pen: iconNib, book: iconBookOpen, compass: iconCompass, gamepad: iconGamepad,
  fork: iconFork, shield: iconShieldHome, guide: iconGuide, door: iconDoor, backup: iconBackup,
  chart: iconChart, clipboard: iconClipboard, sliders: iconSliders, globe: iconGlobe, lock: iconLock,
  parent: iconParent, clock: iconClock, check: iconCheck,
};

export const AUDIENCE = {
  student: { label: 'Students', one: 'For students', blurb: 'How lessons, maths typing and answers work.' },
  parent: { label: 'Parents', one: 'For parents', blurb: 'Profiles, courses, backups and the parent dashboard.' },
  author: { label: 'Authors', one: 'For authors', blurb: 'Write a course with the agent kit, step by step.' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/**
 * Whether the reader is a signed-in adult (profile.learner 'adult'). An adult is
 * their own grown-up: no separate parents' shelf, and they already have courses,
 * so the bar offers those instead of "Start learning". Read only once onboarding
 * is done, because getCurrentUser() makes a profile on first touch.
 */
export async function readerIsAdult() {
  try {
    const done = await ProgressStore.get('meta', 'onboarding_complete');
    if (!done?.value) return false;
    return AuthService.isAdult(await AuthService.getCurrentUser());
  } catch { return false; }
}

/** The slim site bar shared by every guides page. adult: readerIsAdult(). */
export function siteBar({ theme, onTheme, active = 'guides', adult = false }) {
  const dark = theme === 'dark';
  return html`
    <header class="sbar">
      <a class="logo" href="#/welcome" aria-label="CoAuthor welcome page">
        <app-logo></app-logo>
      </a>
      <nav aria-label="Site">
        <a href="#/welcome" class=${active === 'welcome' ? 'on' : ''}>${iconCompass}<span>Welcome</span></a>
        <a href="#/guides" class=${active === 'guides' ? 'on' : ''} aria-current=${active === 'guides' ? 'page' : 'false'}>${iconGuide}<span>Guides</span></a>
      </nav>
      <button class="icon-btn" @click=${onTheme} aria-label="${dark ? 'Switch to light theme' : 'Switch to dark theme'}">${dark ? iconSun : iconMoon}</button>
      ${adult ? html`<a class="cta small" href="#/">My courses</a>` : html`<a class="cta small" href="#/start">Start learning</a>`}
    </header>`;
}

/** Night-sky strip with stars, a planet and an aurora: the students' band and
 *  the library header. Purely decorative. */
export function skyBand() {
  return html`
    <svg class="band-art" viewBox="0 0 1440 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="gk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="st-top"></stop><stop offset="0.65" class="st-mid"></stop><stop offset="1" class="st-low"></stop>
        </linearGradient>
        <linearGradient id="gk-aur" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" class="st-a1"></stop><stop offset="0.5" class="st-a2"></stop><stop offset="1" class="st-a3"></stop>
        </linearGradient>
      </defs>
      <rect width="1440" height="360" fill="url(#gk-sky)"></rect>
      <path class="aur" d="M-40 170C220 90 420 210 700 140S1180 60 1480 150L1480 205C1180 120 980 230 700 200S220 150 -40 225Z" fill="url(#gk-aur)"></path>
      <path class="stars" d="${BAND_STARS}"></path>
      <g class="tw">
        <g transform="translate(240 70)">${sparkle('spk')}</g>
        <g transform="translate(980 46) scale(0.8)">${sparkle('spk')}</g>
        <g transform="translate(1290 120) scale(1.1)">${sparkle('spk')}</g>
      </g>
      <g transform="translate(905 150)">
        <circle r="30" class="pl"></circle>
        <path d="M-30 0a30 30 0 0 0 60 0a30 12 0 0 1 -60 0z" class="pl-sh"></path>
        <ellipse rx="48" ry="9" class="ring" transform="rotate(-14)"></ellipse>
      </g>
      <path class="berg" d="M0 360V318l70-34 46 20 64-52 70 44 50-12 60 40 80-30 40 26h140l70-40 60 22 90-60 70 50 50-18 66 42 80-24 60 30 70-40 60 34 74-20v92Z"></path>
    </svg>`;
}

/** Paper strip with a ruled margin, ink doodles and a lamp glow: the parents'
 *  and authors' band. */
export function paperBand(kind = 'parent') {
  return html`
    <svg class="band-art paper-art" viewBox="0 0 1440 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="1440" height="360" class="pp"></rect>
      ${[60, 100, 140, 180, 220, 260, 300, 340].map((y) => svg`<path d="M0 ${y}H1440" class="rule"></path>`)}
      <path d="M118 0V360" class="margin"></path>
      ${kind === 'author' ? svg`
        <g transform="translate(1140 70) rotate(18)" class="doodle">
          <path d="M0 0l26 36-26 96-26-96z"></path><path d="M0 58v74"></path><circle cx="0" cy="50" r="6"></circle>
        </g>
        <path class="scrib" d="M1010 250c40-30 70 10 110-10s50-40 100-20 60 30 110 0"></path>` : svg`
        <g transform="translate(1150 80)" class="doodle">
          <path d="M-60 60l60-52 60 52v80h-120z"></path><rect x="-16" y="96" width="32" height="44" rx="4"></rect>
          <path d="M-90 140H90"></path>
        </g>
        <path class="scrib" d="M980 260c30-24 60 8 96-6s46-30 84-12"></path>`}
    </svg>`;
}

export const siteStyles = css`
  :host {
    display: block;
    min-height: 100vh;
    font-family: 'Nunito', system-ui, sans-serif;
    color: var(--landing-ink);
    background: var(--landing-paper);
    --gk-max: 1180px;
    --gk-gutter: 16px;
    --gk-ink-w: 2.5px;
    --gk-display: 'Fredoka', 'Nunito', sans-serif;
    --gk-poster: 'Dela Gothic One', 'Fredoka', sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .wrap { width: min(var(--gk-max), 100% - 2 * var(--gk-gutter)); margin-inline: auto; }
  :focus-visible { outline: 3px solid var(--landing-grownup); outline-offset: 3px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .paper-bg { position: relative; isolation: isolate; }
  .paper-bg::before {
    content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background: url('assets/textures/paper-grain.svg'); opacity: 0.1; mix-blend-mode: multiply;
  }
  :host([data-theme='dark']) .paper-bg::before { mix-blend-mode: normal; opacity: 0.05; }

  /* ---- site bar ------------------------------------------------------- */
  .sbar-slot { position: sticky; top: 0; z-index: 50; height: 0; }
  .sbar {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
    width: min(var(--gk-max), 100% - 2 * var(--gk-gutter)); height: 60px;
    display: flex; align-items: center; gap: 10px; padding: 0 10px 0 12px; border-radius: 20px;
    color: var(--landing-on-night);
    background: color-mix(in srgb, var(--landing-sky-top) 92%, transparent);
    border: 1.5px solid var(--landing-night-edge);
    box-shadow: 0 12px 30px -14px var(--landing-sky-top);
    transition: background var(--motion-base), color var(--motion-base), border-color var(--motion-base);
  }
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .sbar { background: color-mix(in srgb, var(--landing-sky-top) 62%, transparent); -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); }
  }
  :host([data-bar='paper']) .sbar {
    color: var(--landing-ink); background: var(--landing-paper-2);
    border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 4px 5px 0 var(--landing-paper-shadow);
    -webkit-backdrop-filter: none; backdrop-filter: none;
  }
  .logo {
    display: flex; align-items: center; gap: 10px; margin-right: auto; padding: 4px;
    font-family: var(--gk-display); font-weight: 700; font-size: 1.25rem; color: inherit; text-decoration: none; white-space: nowrap;
  }
  .logo app-logo > * { --logo-size: 36px; }
  .sbar nav { display: flex; gap: 2px; }
  .sbar nav a {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px;
    color: inherit; opacity: 0.86; text-decoration: none; font-weight: 800; font-size: 0.92rem;
  }
  .sbar nav a svg { width: 17px; height: 17px; }
  .sbar nav a:hover, .sbar nav a.on { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); }
  .icon-btn {
    display: grid; place-items: center; width: 42px; height: 42px; flex: none; cursor: pointer; color: inherit;
    border-radius: 14px; background: color-mix(in srgb, currentColor 8%, transparent);
    border: 1.5px solid color-mix(in srgb, currentColor 26%, transparent);
  }
  .icon-btn:active { transform: translateY(2px); }
  .cta {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; text-decoration: none; white-space: nowrap;
    font-family: var(--gk-display); font-weight: 700; font-size: 1.05rem; padding: 14px 24px; border-radius: 18px; border: 0;
    background: var(--landing-cta); color: var(--landing-on-cta); box-shadow: 0 6px 0 var(--landing-cta-lip);
    transition: transform 80ms, box-shadow 80ms, filter var(--motion-fast);
  }
  .cta:hover { filter: brightness(1.06); }
  .cta:active { transform: translateY(6px); box-shadow: none; }
  .cta.small { font-size: 0.95rem; padding: 10px 16px; border-radius: 13px; box-shadow: 0 4px 0 var(--landing-cta-lip); }
  .cta.small:active { transform: translateY(4px); }
  .ink-btn {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer; text-decoration: none;
    font-family: var(--gk-display); font-weight: 700; font-size: 1rem; padding: 11px 18px; border-radius: 14px;
    color: var(--landing-ink); background: var(--landing-paper-2);
    border: var(--gk-ink-w) solid var(--landing-ink); box-shadow: 3px 4px 0 var(--landing-ink);
    transition: transform 80ms, box-shadow 80ms;
  }
  .ink-btn:active { transform: translate(3px, 4px); box-shadow: none; }
  .ink-btn svg { width: 19px; height: 19px; }

  /* ---- bands ---------------------------------------------------------- */
  .band { position: relative; overflow: hidden; isolation: isolate; color: var(--landing-on-night); }
  .band-art { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; }
  .st-top { stop-color: var(--landing-sky-top); }
  .st-mid { stop-color: var(--landing-sky-mid); }
  .st-low { stop-color: var(--landing-sky-low); }
  .st-a1 { stop-color: var(--landing-aurora-1); }
  .st-a2 { stop-color: var(--landing-aurora-2); }
  .st-a3 { stop-color: var(--landing-aurora-3); }
  .aur { opacity: 0.26; }
  .stars { fill: var(--landing-star); }
  .spk { fill: var(--landing-star); }
  .tw g { transform-box: fill-box; transform-origin: center; }
  .pl { fill: var(--landing-planet-a); }
  .pl-sh { fill: var(--landing-sky-top); opacity: 0.25; }
  .ring { fill: none; stroke: var(--landing-planet-rim); stroke-width: 5; opacity: 0.75; }
  .berg { fill: var(--landing-sea-deep); opacity: 0.85; }
  .band.paper { color: var(--landing-ink); }
  .pp { fill: var(--landing-paper-2); }
  .rule { stroke: var(--landing-author); stroke-width: 1.2; opacity: 0.16; }
  .margin { stroke: var(--landing-grownup); stroke-width: 2; opacity: 0.4; }
  .doodle { fill: none; stroke: var(--landing-ink); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; opacity: 0.55; }
  .scrib { fill: none; stroke: var(--landing-grownup); stroke-width: 4; stroke-linecap: round; opacity: 0.6; }
  .band .torn {
    position: absolute; left: 0; right: 0; bottom: -1px; height: 26px; z-index: 1; display: block; width: 100%;
    fill: var(--landing-paper);
  }

  /* ---- shared type ---------------------------------------------------- */
  .kicker {
    display: inline-flex; align-items: center; gap: 8px; padding: 6px 13px 6px 9px; border-radius: 999px;
    font-weight: 900; font-size: 0.76rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--landing-ink); background: var(--landing-paper-2);
    border: 2px solid var(--landing-ink); box-shadow: 3px 3px 0 var(--landing-paper-shadow);
  }
  .kicker svg { width: 16px; height: 16px; }
  .band:not(.paper) .kicker {
    color: var(--landing-explorer); background: color-mix(in srgb, var(--landing-explorer) 14%, var(--landing-sky-top));
    border: 1.5px solid color-mix(in srgb, var(--landing-explorer) 45%, transparent); box-shadow: none;
  }
  .tone-student { --tone: var(--landing-explorer); }
  .tone-parent { --tone: var(--landing-grownup); }
  .tone-author { --tone: var(--landing-author); }

  @media (max-width: 760px) {
    .sbar nav span { display: none; }
    .sbar nav a { padding: 9px; }
  }
  @media (max-width: 480px) {
    .logo app-logo > *::part(word) { display: none; }
    .sbar nav { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
`;

/** Torn paper edge at the bottom of a band, so the band tears into the page. */
export const tornEdge = html`<svg class="torn" viewBox="0 0 1440 26" preserveAspectRatio="none" aria-hidden="true"><path d="M0 26V12l40 6 52-10 38 8 60-12 44 10 50-6 70 9 46-11 58 7 40-8 64 10 48-7 60 9 40-12 66 10 52-6 48 8 62-10 44 9 54-7 70 11 46-9 52 6 60-8 38 8 48-6 46 10 40-4V26Z"></path></svg>`;

/** Mirror the app theme onto the host and bar colour onto scroll position. */
export class SiteChrome {
  constructor(host, { barSwitchAt = () => 220 } = {}) {
    this.host = host;
    this.barSwitchAt = barSwitchAt;
    this.onScroll = () => {
      const paper = window.scrollY > this.barSwitchAt();
      if (paper !== this._paper) {
        this._paper = paper;
        host.setAttribute('data-bar', paper ? 'paper' : 'night');
      }
    };
  }
  connect() {
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.onScroll();
  }
  disconnect() {
    window.removeEventListener('scroll', this.onScroll);
  }
}

/**
 * The plain look over the guides pages (index, guide, sheet): the same
 * pages printed as a university-press handbook. The --landing-* palette is
 * remapped onto the plain app tokens on the host, the night sky, torn edge,
 * planets, tape, paper-clip and companion are dropped, and every lip, tilt
 * and offset shadow becomes a flat rule. Hosts mirror the look through
 * LookMixin (data-look), since Firefox has no :host-context.
 */
export const plainSiteStyles = css`
  :host([data-look='plain']) {
    font-family: var(--font-family);
    color: var(--text-main);
    background: var(--bg-base);
    --gk-ink-w: 1px;
    --gk-display: var(--font-heading);
    --gk-poster: var(--font-heading);
    --landing-ink: var(--text-main);
    --landing-ink-soft: var(--text-muted);
    --landing-paper: var(--bg-base);
    --landing-paper-2: var(--bg-surface);
    --landing-paper-shadow: transparent;
    --landing-on-night: var(--text-main);
    --landing-on-night-soft: var(--text-soft);
    --landing-sky-top: var(--bg-base);
    --landing-sky-mid: var(--bg-base);
    --landing-sky-low: var(--bg-base);
    --landing-night-edge: var(--border-color);
    --landing-explorer: var(--primary-color);
    --landing-grownup: var(--accent-coral);
    --landing-author: var(--primary-text);
    --landing-dawn-1: var(--primary-color);
    --landing-dawn-2: var(--primary-color);
    --landing-aurora-2: var(--primary-color);
    --landing-aurora-3: var(--primary-color);
    --landing-display-grad-1: var(--primary-color);
    --landing-cta: var(--primary-color);
    --landing-on-cta: var(--on-primary);
    --landing-cta-lip: transparent;
    --landing-star: transparent;
    --landing-glow: transparent;
  }
  :host([data-look='plain']) :focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
  :host([data-look='plain']) .paper-bg::before { content: none; }
  :host([data-look='plain']) .tone-author { --tone: var(--text-muted); }

  /* site bar: a flat sheet, the same at the top and on scroll */
  :host([data-look='plain']) .sbar,
  :host([data-look='plain'][data-bar='paper']) .sbar {
    color: var(--text-main); background: var(--bg-surface);
    border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
    -webkit-backdrop-filter: none; backdrop-filter: none;
  }
  :host([data-look='plain']) .sbar nav a { font-weight: 600; border-radius: var(--radius-sm); }
  :host([data-look='plain']) .icon-btn { border-radius: var(--radius-sm); background: none; border-color: var(--border-color); }
  :host([data-look='plain']) .icon-btn:active,
  :host([data-look='plain']) .cta:active,
  :host([data-look='plain']) .cta.small:active,
  :host([data-look='plain']) .ink-btn:active { transform: none; }
  :host([data-look='plain']) .cta,
  :host([data-look='plain']) .cta.small {
    font-family: var(--font-ui); font-weight: 600; border-radius: var(--radius-sm); box-shadow: none;
  }
  :host([data-look='plain']) .cta:hover { filter: none; background: var(--primary-hover); }
  :host([data-look='plain']) .ink-btn {
    font-family: var(--font-ui); font-weight: 600; border-radius: var(--radius-sm);
    border-color: var(--border-hover); box-shadow: none; color: var(--primary-text);
  }
  :host([data-look='plain']) .ink-btn:hover { border-color: var(--primary-color); }

  /* header band: paper, a serif title, one hairline under it */
  :host([data-look='plain']) .band-art,
  :host([data-look='plain']) .band .torn,
  :host([data-look='plain']) .q,
  :host([data-look='plain']) .say,
  :host([data-look='plain']) .clip,
  :host([data-look='plain']) .hero-q,
  :host([data-look='plain']) .big-ic,
  :host([data-look='plain']) .card .art .planet { display: none; }
  :host([data-look='plain']) .band { color: var(--text-main); border-bottom: 1px solid var(--border-color); }
  :host([data-look='plain']) .kicker,
  :host([data-look='plain']) .band:not(.paper) .kicker {
    padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none;
    font-size: 0.72rem; font-weight: 600; letter-spacing: var(--kicker-tracking, 0.1em); color: var(--card-kicker);
  }
  :host([data-look='plain']) h1 { font-weight: var(--heading-weight); letter-spacing: -0.01em; }
  :host([data-look='plain']) .key { background: none; color: var(--primary-text); }
  :host([data-look='plain']) .lede,
  :host([data-look='plain']) .sum { font-weight: 400; color: var(--text-soft); }
  :host([data-look='plain']) .crumbs,
  :host([data-look='plain']) .head .meta { font-weight: 500; }

  /* index: underline tabs, flat cards, the audience as a small-caps line */
  :host([data-look='plain']) .tools { border-bottom: 1px solid var(--border-color); }
  :host([data-look='plain']) .tab,
  :host([data-look='plain']) .tab[aria-selected='true'] {
    transform: none; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none;
    font-weight: 600; color: var(--text-muted); padding: 10px 12px 8px; margin-bottom: -1px;
  }
  :host([data-look='plain']) .tab::before { content: none; }
  :host([data-look='plain']) .tab:hover { transform: none; color: var(--text-main); }
  :host([data-look='plain']) .tab[aria-selected='true'] { color: var(--text-main); border-bottom-color: var(--primary-color); }
  :host([data-look='plain']) .search input { font-weight: 400; border-radius: var(--radius-sm); border: 1px solid var(--border-hover); }
  :host([data-look='plain']) .aud-head h2 { text-transform: none; font-weight: var(--heading-weight); letter-spacing: 0; }
  :host([data-look='plain']) .aud-head h2::after { height: 2px; border-radius: 0; margin-top: 6px; }
  :host([data-look='plain']) .aud-head p { font-weight: 400; }
  :host([data-look='plain']) .grid { gap: 20px; }
  :host([data-look='plain']) .card,
  :host([data-look='plain']) .card.tone-student {
    padding: 22px 22px 18px; border-radius: var(--radius-lg); border-color: var(--border-color); box-shadow: var(--card-shadow);
  }
  :host([data-look='plain']) .card::before { content: none; }
  :host([data-look='plain']) .card:hover,
  :host([data-look='plain']) .card:focus-visible { transform: none; box-shadow: var(--raise-hover, var(--card-shadow)); border-color: var(--raise-hover-rule, var(--border-hover)); }
  /* The section heading already names the audience. */
  :host([data-look='plain']) .card .tag { display: none; }
  :host([data-look='plain']) .card.tone-student .art { display: contents; }
  :host([data-look='plain']) .ic,
  :host([data-look='plain']) .card.tone-student .art .ic,
  :host([data-look='plain']) .card.tone-student:hover .art .ic {
    position: static; transform: none; box-shadow: none; margin: 0 0 12px;
    width: 40px; height: 40px; border-radius: var(--radius-sm);
    color: var(--primary-text); background: var(--bg-panel); border: 1px solid var(--border-color);
  }
  :host([data-look='plain']) .ic svg,
  :host([data-look='plain']) .card.tone-student .art .ic svg { width: 22px; height: 22px; }
  :host([data-look='plain']) .card h3,
  :host([data-look='plain']) .card.tone-student h3 { margin-top: 0; font-weight: var(--heading-weight); font-size: 1.2rem; }
  :host([data-look='plain']) .card p { font-weight: 400; color: var(--text-soft); }
  :host([data-look='plain']) .meta { font-weight: 500; }
  :host([data-look='plain']) .meta .live { background: none; padding: 0; color: var(--primary-text); }
  :host([data-look='plain']) .empty,
  :host([data-look='plain']) .foot,
  :host([data-look='plain']) .msg { border: 1px solid var(--border-color); border-radius: var(--radius-lg); background: var(--bg-surface); font-weight: 400; }
  :host([data-look='plain']) .foot p { font-weight: 400; }

  /* a guide: printed handbook pages */
  :host([data-look='plain']) .toc h2 { font-weight: 600; color: var(--card-kicker); }
  :host([data-look='plain']) .toc a { font-weight: 500; }
  :host([data-look='plain']) .toc a.on { background: none; border-left-color: var(--primary-color); border-radius: 0; }
  :host([data-look='plain']) .toc-m { border: 1px solid var(--border-color); border-radius: var(--radius-md); }
  :host([data-look='plain']) .toc-m summary { font-weight: 600; }
  :host([data-look='plain'][data-aud='student']) .paper-bg { background-image: none; }
  :host([data-look='plain']) article h2,
  :host([data-look='plain']) article h3 { font-weight: var(--heading-weight); }
  :host([data-look='plain']) article h2::before { width: 32px; height: 2px; border-radius: 0; }
  :host([data-look='plain'][data-aud='student']) article h2::before {
    width: 34px; height: 34px; border-radius: var(--radius-sm); transform: none; box-shadow: none;
    font-family: var(--font-heading); font-size: 1.05rem; color: var(--primary-text);
    background: var(--bg-surface); border: 1px solid var(--border-hover);
  }
  :host([data-look='plain']) article a { font-weight: 600; color: var(--primary-text); }
  :host([data-look='plain']) article strong { font-weight: 600; }
  :host([data-look='plain']) article li::marker { font-weight: 400; }
  :host([data-look='plain']) article hr { border-top: 1px solid var(--border-color); }
  :host([data-look='plain']) article img,
  :host([data-look='plain']) article pre { border-radius: var(--radius-md); border-color: var(--border-color); box-shadow: none; }
  :host([data-look='plain']) article pre { color: var(--text-main); background: var(--bg-panel); }
  :host([data-look='plain']) article kbd {
    font-weight: 600; border-radius: var(--radius-kbd, 3px); border: 1px solid var(--border-hover); box-shadow: none;
  }
  :host([data-look='plain']) article .table-wrap { border: 1px solid var(--border-color); border-radius: var(--radius-md); }
  :host([data-look='plain']) article th { background: var(--bg-panel); font-weight: 600; }
  :host([data-look='plain']) article .callout,
  :host([data-look='plain']) article .callout[data-callout='quill'] > p {
    border: 1px solid var(--border-color); border-left: 3px solid var(--co); border-radius: var(--radius-sm);
    background: var(--bg-surface); box-shadow: none; font-weight: 400;
  }
  :host([data-look='plain']) article .callout[data-callout='quill'] { border: 0; background: none; }
  :host([data-look='plain']) article .callout-label,
  :host([data-look='plain']) article .callout[data-callout='tip'] .callout-label {
    padding: 0; border-radius: 0; background: none; color: var(--co); font-size: 0.72rem; font-weight: 600;
  }
  :host([data-look='plain']) article .callout[data-callout='quill'] > p[data-by]::before { font-family: var(--font-ui); font-weight: 600; }
  :host([data-look='plain']) article math-div { border-radius: var(--radius-md); border: 1px solid var(--border-color); }
  :host([data-look='plain']) article try-block { --rule-w: 1px; }
  :host([data-look='plain']) article figure.shot::before { content: none; }
  :host([data-look='plain']) article figcaption { font-weight: 400; }
  :host([data-look='plain']) .q-react { animation: none; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-weight: 500; }
  :host([data-look='plain']) .done {
    color: var(--text-main); background: var(--bg-surface); box-shadow: none;
    border: 1px solid var(--border-color); border-left: 3px solid var(--primary-color); border-radius: var(--radius-lg);
  }
  :host([data-look='plain']) .done h2 { font-weight: var(--heading-weight); }
  :host([data-look='plain']) .done p { font-weight: 400; color: var(--text-soft); }
  :host([data-look='plain']) .nb a { border-color: var(--border-color); border-radius: var(--radius-lg); box-shadow: none; }
  :host([data-look='plain']) .nb a:hover { transform: none; border-color: var(--primary-color); }
  :host([data-look='plain']) .nb small { font-weight: 600; color: var(--card-kicker); }
  :host([data-look='plain']) .nb b { font-weight: var(--heading-weight); }
`;
