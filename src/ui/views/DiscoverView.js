import '../components/LookSlots.js';
import { LitElement, html, css } from 'lit';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { gradeLabel } from '../../core/gradeLabel.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { DEFAULT_SHOWCASE_SOURCES } from '../../config/defaultShowcaseSources.js';
import { btn3dStyles } from '../sharedStyles.js';
import { iconShare, iconChevronRight, iconArrowLeft, iconCheck, iconClock, iconDownload } from '../icons/uiIcons.js';
import { showParentalGateHold } from '../components/GateHoldDialog.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import { i18n } from '../../core/i18nProvider.js';
import { needsNewerEngine } from '../../core/engineVersion.js';
import { INDEPENDENCE_NOTE, SUBJECT_NAMES, syllabusAlignment } from '../../core/showcaseMeta.js';
import {
  resolveCatalogUrl, loadCatalog, loadCatalogEntries, wrapPreviewEntry, countInstall,
  groupByBundle, loadBundleInfo, loadFacts, entryShowcase, bundleManifestUrl,
} from '../../core/CatalogService.js';

/** i18n with an English fallback: i18n.t returns the key itself when the strings file has no entry. */
const t = (key, fallback, params = {}) => {
  const s = i18n.t(key, params);
  if (s && s !== key) return s;
  let out = fallback;
  for (const [k, v] of Object.entries(params)) out = out.replace(new RegExp(`{${k}}`, 'g'), v);
  return out;
};

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const subjectName = (s) => SUBJECT_NAMES[String(s || '').toLowerCase()] || cap(s);

const LABEL_BADGES = {
  core: ['discover.badge.core', 'Core', 'discover.badge.core_hint', 'Part of the core CoAuthor library'],
  checked: ['discover.badge.checked', 'Checked', 'discover.badge.checked_hint', 'Checked by the catalog team'],
  outside: ['discover.badge.outside', 'Outside', 'discover.badge.outside_hint', 'From an outside author, not checked by the catalog team'],
};

const SPEAKER = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const BOOKMARK = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h8v11l-4-2.6-4 2.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const PLAY = html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`;

/**
 * <discover-view> - the course shop, laid out like an app store (Q-47, D22,
 * D29). Three pages on one element, picked by `sub` (the hash after
 * #/discover/):
 *   ''                -> home: one row per bundle (a published course repo),
 *                        "Add all", and side-scrolling module cards
 *   'bundle/<id>'     -> the bundle page: hero, facts, Add all, modules list
 *   'module/<id>'     -> the module page: header, facts, Add, screenshots and
 *                        clip, about + highlights, lessons, details, more
 * Adding goes through a parent (press-and-hold gate, once per visit), then
 * CourseSourceManager.addSource + ProgressStore.enroll, as before.
 * Store-page data: catalog.json rows (+ optional `bundles`), each manifest's
 * showcase fields (src/core/showcaseMeta.js, shared with make-landing.mjs),
 * and facts derived from the content (lessons, Narrated, syllabus line).
 */
export class DiscoverView extends LookMixin(LitElement) {
  static styles = [btn3dStyles, css`
    :host {
      display: block;
      max-width: 1120px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
      padding: var(--space-4) var(--space-4) var(--space-7);
      min-width: 0;
      --ds-gutter: var(--space-4);
      --ds-card-w: clamp(212px, 62vw, 252px);
      --ds-shot-h: clamp(300px, 86vw, 380px);
    }
    *, *::before, *::after { box-sizing: border-box; }
    a { color: inherit; }
    h1, h2, h3, p { margin: 0; }
    a:focus-visible, button:focus-visible, video:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }

    /* ---------- page head (home) ---------- */
    .page-head { margin: var(--space-2) 0 var(--space-6); }
    .kicker {
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-kicker);
      letter-spacing: var(--kicker-tracking, 0.12em);
      text-transform: uppercase;
      color: var(--primary-text);
      margin: 0 0 var(--space-1);
    }
    .page-title { font-family: var(--font-heading); font-size: var(--fs-h1); line-height: var(--lh-tight); margin-bottom: var(--space-2); }
    .page-subtitle { color: var(--text-muted); max-width: 60ch; }
    .catalog-offline {
      display: inline-block;
      margin-top: var(--space-3);
      font-size: var(--fs-small);
      color: var(--info-text);
      background: var(--info-bg);
      border-radius: var(--radius-pill);
      padding: 4px 12px;
    }

    /* ---------- featured bundle (home) ---------- */
    .feature {
      display: grid;
      gap: 0;
      margin: 0 0 var(--space-7);
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: var(--surface-card);
      border: var(--rule-w) solid var(--border-color);
      box-shadow: var(--press-2) var(--lip-color);
    }
    .feature-art { display: block; }
    .feature-art .art { border: 0; border-radius: 0; box-shadow: none; }
    .feature-text { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4) var(--space-4) var(--space-5); min-width: 0; }
    .feature-title { font-family: var(--font-heading); font-size: var(--fs-h2); line-height: var(--lh-tight); }
    .feature-title a { text-decoration: none; }
    .feature-title a:hover { text-decoration: underline; }
    .feature-blurb { color: var(--text-muted); max-width: 52ch; }
    .feature .actions { margin-top: var(--space-2); }
    .feature .actions a.btn-3d { text-decoration: none; }

    /* ---------- bundle rows (home) ---------- */
    .row { margin: 0 0 var(--space-7); min-width: 0; }
    .row-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-1); }
    .row-link { display: flex; align-items: center; gap: var(--space-2); text-decoration: none; min-width: 0; flex: 1; padding: 4px 0; }
    .row-title { font-family: var(--font-heading); font-size: var(--fs-h3); line-height: var(--lh-tight); }
    .row-link svg { flex: none; color: var(--text-muted); transition: transform var(--motion-fast); }
    .row-link:hover svg { transform: translateX(3px); color: var(--primary-text); }
    .row-blurb { color: var(--text-muted); font-size: var(--fs-small); margin: 0 0 var(--space-3); max-width: 70ch; }
    .row-meta { display: flex; flex-wrap: wrap; gap: 6px var(--space-3); align-items: center; margin: 0 0 var(--space-3); font-size: var(--fs-small); color: var(--text-muted); }

    .rail-wrap { position: relative; }
    .rail {
      list-style: none;
      display: flex;
      gap: var(--space-4);
      margin: 0 calc(-1 * var(--ds-gutter));
      padding: 4px var(--ds-gutter) 14px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: var(--ds-gutter);
      scrollbar-width: none;
      overscroll-behavior-x: contain;
    }
    .rail::-webkit-scrollbar { display: none; }
    .rail > li { flex: 0 0 var(--ds-card-w); scroll-snap-align: start; display: flex; min-width: 0; }
    .rail-btn {
      display: none;
      position: absolute;
      top: calc(var(--ds-card-w) * 0.28);
      z-index: 2;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--lip) var(--lip-color), var(--shadow-md);
      cursor: pointer;
    }
    .rail-btn.prev { left: -14px; }
    .rail-btn.prev svg { transform: scaleX(-1); }
    .rail-btn.next { right: -14px; }
    @media (hover: hover) and (min-width: 900px) { .rail-btn { display: inline-flex; } }

    /* module card: art on top, then title, one line, meta */
    .card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      text-decoration: none;
      color: inherit;
      min-width: 0;
    }
    .art {
      position: relative;
      display: block;
      aspect-ratio: 16 / 9;
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: var(--rule-w) solid var(--border-color);
      box-shadow: var(--press-1) var(--lip-color);
      background: var(--bg-panel-2);
      transition: transform var(--motion-fast) var(--ease-settle);
    }
    .card:hover .art { transform: translateY(var(--hover-lift)); }
    .card:active .art { transform: translateY(var(--press-travel-sm, 3px)); box-shadow: none; }
    .art > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .card-title { font-family: var(--font-heading); font-weight: var(--heading-weight, 700); font-size: 1.02rem; line-height: var(--lh-tight); margin-top: 4px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card-line { font-size: var(--fs-small); color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; font-size: 0.8rem; font-weight: var(--fw-strong); color: var(--text-muted); }
    .meta > span { display: inline-flex; align-items: center; gap: 4px; }
    .meta svg { width: 13px; height: 13px; }
    .meta .narr { color: var(--info-text); }
    .on-shelf-tag {
      position: absolute;
      left: 8px;
      top: 8px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: var(--font-ui);
      font-size: 0.72rem;
      font-weight: var(--fw-heavy);
      padding: 3px 9px 3px 7px;
      border-radius: var(--radius-pill);
      background: var(--success-bg);
      color: var(--success-text);
    }
    .on-shelf-tag svg { width: 12px; height: 12px; }

    /* generated art when a module has no cover */
    .gen {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--card-banner-ink);
      background: var(--card-banner-bg, var(--gradient-banner));
    }
    .gen.biology   { background: var(--card-banner-bg, var(--gradient-teal)); }
    .gen.physics   { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-violet) 100%)); }
    .gen.chemistry { background: var(--card-banner-bg, var(--gradient-gold)); }
    .gen.math      { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-coral) 100%)); }
    .gen look-cover > * { position: absolute; inset: 0; }
    .gen:has(look-cover > *) > .gen-icon { display: none; }
    .gen-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30%;
      aspect-ratio: 1;
      max-width: 72px;
      font-size: clamp(1.4rem, 5vw, 2.1rem);
      border-radius: var(--radius-lg);
      background: var(--card-banner-track);
      box-shadow: var(--lip) var(--card-banner-track);
    }

    /* ---------- buttons, badges ---------- */
    .pill-add { white-space: nowrap; }
    .on-shelf {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-ui);
      font-size: var(--fs-small);
      font-weight: var(--fw-heavy);
      color: var(--success-text);
      background: var(--success-bg);
      padding: 8px 14px;
      border-radius: var(--radius-pill);
      white-space: nowrap;
    }
    .on-shelf svg { width: 14px; height: 14px; }
    .mod .on-shelf { padding: 6px 10px; font-size: 0.78rem; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-ui);
      font-size: 0.76rem;
      font-weight: var(--fw-heavy);
      line-height: 1.2;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--bg-panel-2);
      color: var(--text-muted);
      white-space: nowrap;
    }
    .badge svg { width: 13px; height: 13px; flex: none; }
    .badge.checked, .badge.core { background: var(--success-bg); color: var(--success-text); }
    .badge.narrated { background: var(--info-bg); color: var(--info-text); }
    .badge.update { background: var(--warn-bg); color: var(--warn-text); }

    /* ---------- store pages: crumb, head, facts, actions ---------- */
    .crumb { margin: 0 0 var(--space-4); }
    .crumb a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-small);
      color: var(--primary-text);
      text-decoration: none;
      padding: 6px 0;
    }
    .crumb svg { width: 16px; height: 16px; }

    .facts {
      display: flex;
      list-style: none;
      margin: 0;
      padding: var(--space-3) 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .facts::-webkit-scrollbar { display: none; }
    .facts li {
      flex: 1 0 auto;
      min-width: 84px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 0 var(--space-3);
      text-align: center;
    }
    .facts li + li { border-left: var(--rule-w-fixed, 1px) solid var(--border-color); }
    .fact-v { font-family: var(--font-heading); font-weight: var(--heading-weight, 700); font-size: 1.08rem; line-height: 1.2; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
    .fact-v svg { width: 16px; height: 16px; color: var(--text-muted); }
    .fact-k { font-size: 0.76rem; color: var(--text-muted); white-space: nowrap; }

    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    .actions .add-main { flex: 1 1 220px; justify-content: center; }
    .actions .on-shelf { flex: 1 1 220px; justify-content: center; padding: 12px 16px; font-size: var(--fs-body); }
    .share-btn { display: inline-flex; align-items: center; gap: var(--space-2); }
    .gate-hint { font-size: var(--fs-small); color: var(--text-muted); margin-top: var(--space-2); }

    .align {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      font-size: var(--fs-small);
      font-weight: var(--fw-strong);
      color: var(--text-main);
    }
    .align svg { width: 16px; height: 16px; flex: none; margin-top: 2px; color: var(--primary-text); }

    .sec { margin-top: var(--space-6); min-width: 0; }
    .sec-title {
      font-family: var(--font-heading);
      font-size: var(--fs-h3);
      line-height: var(--lh-tight);
      margin-bottom: var(--space-3);
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
    }
    .sec-title .count { font-family: var(--font-family); font-size: var(--fs-small); font-weight: var(--fw-medium); color: var(--text-muted); }
    .prose { line-height: var(--lh-body); max-width: 68ch; }
    .blurb-strong { font-weight: var(--fw-strong); margin-bottom: var(--space-2); }

    .highlights { list-style: none; margin: var(--space-4) 0 0; padding: 0; display: grid; gap: var(--space-3); max-width: 68ch; }
    .highlights li { display: grid; grid-template-columns: 28px 1fr; gap: var(--space-3); align-items: start; line-height: var(--lh-body); }
    .hl-mark {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-pill);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--primary-light);
      color: var(--primary-text);
    }
    .hl-mark svg { width: 16px; height: 16px; }

    .indep {
      margin-top: var(--space-7);
      padding-top: var(--space-4);
      border-top: var(--rule-w-fixed, 1px) solid var(--border-color);
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    /* ---------- bundle page ---------- */
    .hero { display: grid; gap: var(--space-4); }
    .hero .art { border-radius: var(--radius-xl); }
    .hero-text { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
    .title { font-family: var(--font-heading); font-size: var(--fs-h1); line-height: var(--lh-tight); }
    .by { font-family: var(--font-ui); font-weight: var(--fw-heavy); font-size: var(--fs-small); color: var(--primary-text); text-decoration: none; }
    a.by:hover { text-decoration: underline; }
    .sub { font-size: var(--fs-small); color: var(--text-muted); }
    .lead { font-size: 1.06rem; font-weight: var(--fw-strong); color: var(--text-main); }

    .mods { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
    .mod {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-lg);
      background: var(--surface-card);
      border: var(--rule-w) solid var(--border-color);
      box-shadow: var(--press-1) var(--lip-color);
    }
    .mod-link { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: var(--space-3); align-items: center; text-decoration: none; min-width: 0; }
    .mod-link .art { border-radius: var(--radius-md); box-shadow: none; }
    .mod-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .mod-title { font-family: var(--font-heading); font-weight: var(--heading-weight, 700); line-height: var(--lh-tight); }
    .mod-line { font-size: var(--fs-small); color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    /* ---------- module page ---------- */
    .app-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-4); align-items: center; }
    .icon {
      position: relative;
      width: 84px;
      height: 84px;
      border-radius: var(--radius-xl);
      overflow: hidden;
      border: var(--rule-w) solid var(--border-color);
      box-shadow: var(--press-1) var(--lip-color);
      background: var(--bg-panel-2);
    }
    .icon > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .icon .gen-icon { width: 60%; font-size: 1.8rem; box-shadow: none; }
    .head-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .head-text .title { font-size: var(--fs-h2); }

    .shots {
      list-style: none;
      display: flex;
      gap: var(--space-3);
      margin: 0 calc(-1 * var(--ds-gutter));
      padding: 4px var(--ds-gutter) 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: var(--ds-gutter);
      overscroll-behavior-x: contain;
      scrollbar-width: thin;
    }
    .shots > li { flex: none; scroll-snap-align: start; }
    .shot {
      position: relative;
      display: block;
      height: var(--ds-shot-h);
      aspect-ratio: 390 / 844;
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-panel-2);
      margin: 0;
    }
    /* A landscape screenshot (story art, a wide scene) keeps the rail height and gets a wider tile. */
    .shot.land { aspect-ratio: 16 / 10; }
    .shot img, .shot video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .shot figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: var(--space-2) var(--space-3); font-size: 0.78rem; background: var(--bg-surface); color: var(--text-main); border-top: var(--rule-w-fixed, 1px) solid var(--border-color); }
    .play {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      border: 0;
      padding: 0;
      background: var(--reveal-scrim, var(--scrim));
      color: var(--text-main);
      cursor: pointer;
      font: inherit;
    }
    .play-dot {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-pill);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-surface);
      color: var(--primary-text);
      box-shadow: var(--lip) var(--lip-color), var(--shadow-md);
    }
    .play-dot svg { width: 30px; height: 30px; margin-left: 4px; }
    .play-label { font-family: var(--font-ui); font-weight: var(--fw-heavy); font-size: var(--fs-small); background: var(--bg-surface); color: var(--text-main); padding: 4px 12px; border-radius: var(--radius-pill); }

    .lessons { list-style: none; margin: 0; padding: 0; counter-reset: les; display: grid; gap: 2px; max-width: 68ch; }
    .lessons li {
      counter-increment: les;
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: var(--space-3);
      align-items: baseline;
      padding: var(--space-2) 0;
      border-bottom: var(--rule-w-fixed, 1px) solid var(--border-color);
      line-height: var(--lh-body);
    }
    .lessons li::before {
      content: counter(les);
      font-family: var(--font-heading);
      font-weight: var(--heading-weight, 700);
      color: var(--primary-text);
      text-align: right;
    }
    .details {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: var(--space-2) var(--space-4);
      margin: 0;
      padding: var(--space-4);
      background: var(--bg-sunken);
      border-radius: var(--radius-md);
      font-size: var(--fs-small);
    }
    .details dt { color: var(--text-muted); font-weight: var(--fw-strong); }
    .details dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .details a { color: var(--primary-text); }

    .loading { color: var(--text-muted); font-size: var(--fs-small); }
    .empty-state {
      text-align: center;
      padding: var(--space-7) var(--space-5);
      background: var(--bg-surface);
      border: var(--rule-w) dashed var(--border-hover);
      border-radius: var(--radius-lg);
      color: var(--text-muted);
    }

    /* ---------- wide screens ---------- */
    @media (min-width: 900px) {
      :host { --ds-gutter: var(--space-5); --ds-card-w: 248px; --ds-shot-h: 440px; padding-inline: var(--space-5); }
      .hero { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: var(--space-6); align-items: center; }
      .feature { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: center; }
      .feature-text { padding: var(--space-5) var(--space-6); }
      .page-title { font-size: var(--fs-display, var(--fs-h1)); }
      .app-head { grid-template-columns: auto minmax(0, 1fr) auto; }
      .icon { width: 112px; height: 112px; }
      .head-actions { grid-column: 3; }
      .split { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--space-7); align-items: start; }
      .split aside .sec:first-child { margin-top: var(--space-6); }
      .side-list { display: grid; gap: var(--space-4); }
      .side-list .card { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 4px var(--space-3); align-items: start; }
      .side-list .art { grid-row: span 3; border-radius: var(--radius-md); box-shadow: none; }
      .side-list .card-title { margin-top: 0; font-size: 0.95rem; }
      .facts li { flex: 0 0 auto; padding: 0 var(--space-5); }
      .facts li:first-child { padding-left: 0; }
      .actions .add-main, .actions .on-shelf { flex: 0 0 auto; min-width: 240px; }
    }
    @media (max-width: 899px) {
      .head-actions { margin-top: var(--space-1); }
      .side-list { list-style: none; display: flex; gap: var(--space-4); margin: 0 calc(-1 * var(--ds-gutter)); padding: 4px var(--ds-gutter) 14px; overflow-x: auto; scrollbar-width: none; }
      .side-list > * { flex: 0 0 var(--ds-card-w); }
    }
    @media (max-width: 420px) {
      .mod-link { grid-template-columns: 88px minmax(0, 1fr); }
      .mod { padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2); }
      .facts li { min-width: 76px; padding: 0 var(--space-2); }
      .title { font-size: var(--fs-h2); }
      .head-text .title { font-size: 1.35rem; }
      .icon { width: 72px; height: 72px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .art, .row-link svg { transition: none; }
    }

    /* ---------- plain: an editorial catalogue. Hairlines, serif titles,
       small-caps tags, no lips. ---------- */
    :host([data-look="plain"]) .kicker { color: var(--accent-coral); }
    :host([data-look="plain"]) .page-head { padding-bottom: var(--space-5); border-bottom: 1px solid var(--rule-strong, var(--text-main)); }
    :host([data-look="plain"]) .page-title,
    :host([data-look="plain"]) .title,
    :host([data-look="plain"]) .row-title,
    :host([data-look="plain"]) .sec-title,
    :host([data-look="plain"]) .card-title,
    :host([data-look="plain"]) .mod-title,
    :host([data-look="plain"]) .fact-v { font-weight: 600; letter-spacing: -0.005em; }
    :host([data-look="plain"]) .feature { border-width: 1px; border-radius: 10px; box-shadow: var(--raise-rest, var(--shadow-sm)); }
    :host([data-look="plain"]) .feature-title { font-weight: 600; }
    :host([data-look="plain"]) .row { padding-top: var(--space-4); border-top: 1px solid var(--rule-soft, var(--border-color)); margin-bottom: var(--space-6); }
    :host([data-look="plain"]) .art,
    :host([data-look="plain"]) .icon { border-width: 1px; border-radius: 8px; box-shadow: var(--raise-rest, none); }
    :host([data-look="plain"]) .card:hover .art { transform: translateY(-1px); box-shadow: var(--raise-hover, none); }
    :host([data-look="plain"]) .card:active .art { transform: none; }
    :host([data-look="plain"]) .hero .art { border-radius: 10px; }
    :host([data-look="plain"]) .gen-icon { box-shadow: none; border-radius: 8px; }
    :host([data-look="plain"]) .rail-btn { box-shadow: var(--shadow-sm); border-width: 1px; }
    :host([data-look="plain"]) .badge,
    :host([data-look="plain"]) .on-shelf-tag {
      font-family: var(--font-family);
      font-variant-caps: all-small-caps;
      font-size: 0.86rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      padding: 0 6px;
      border-radius: 4px;
      background: none;
      border: 1px solid currentColor;
    }
    :host([data-look="plain"]) .on-shelf-tag { background: var(--bg-surface); }
    :host([data-look="plain"]) .on-shelf { border-radius: 6px; }
    :host([data-look="plain"]) .crumb a { font-family: var(--font-family); font-weight: 600; }
    :host([data-look="plain"]) .by { font-family: var(--font-family); font-weight: 600; }
    :host([data-look="plain"]) .facts { border-top: 1px solid var(--rule-soft, var(--border-color)); border-bottom: 1px solid var(--rule-soft, var(--border-color)); }
    :host([data-look="plain"]) .facts li + li { border-left-color: var(--rule-soft, var(--border-color)); }
    :host([data-look="plain"]) .mod { border-width: 1px; border-radius: 10px; box-shadow: var(--raise-rest, none); }
    :host([data-look="plain"]) .mod-link .art { border-radius: 6px; }
    :host([data-look="plain"]) .shot { border-width: 1px; border-radius: 8px; }
    :host([data-look="plain"]) .play-dot { box-shadow: var(--shadow-md); }
    :host([data-look="plain"]) .hl-mark { background: none; border: 1px solid var(--rule-soft, var(--border-color)); color: var(--accent-coral); }
    :host([data-look="plain"]) .lessons li::before { color: var(--accent-coral); font-variant-numeric: oldstyle-nums; }
    :host([data-look="plain"]) .details { background: none; border-top: 1px solid var(--rule-soft, var(--border-color)); border-radius: 0; padding: var(--space-4) 0 0; }
    :host([data-look="plain"]) .empty-state { border-style: solid; border-width: 1px; }
  `];

  static properties = {
    profileId: { type: String },
    sub: { type: String },
    _entries: { type: Array, state: true },
    _enrolledIds: { type: Object, state: true },
    _loading: { type: Boolean, state: true },
    _busy: { type: String, state: true },
    _info: { type: Object, state: true },
    _facts: { type: Object, state: true },
    _fromCache: { type: Boolean, state: true },
    _playing: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.profileId = '';
    this.sub = '';
    this._entries = [];
    this._bundles = [];
    this._enrolledIds = new Set();
    this._loading = true;
    this._busy = null;
    this._info = {};
    this._facts = {};
    this._fromCache = false;
    this._catalog = null;
    this._playing = false;
    // Once a parent has held the gate once during this visit, later adds skip it.
    this._gateUnlockedThisVisit = false;
  }

  async firstUpdated() {
    await this._load();
  }

  updated(changed) {
    if (changed.has('sub')) {
      this._playing = false;
      if (changed.get('sub') !== undefined) window.scrollTo({ top: 0 });
    }
  }

  async _load() {
    this._loading = true;
    let entries = [];
    try {
      const loaded = await loadCatalog(resolveCatalogUrl());
      if (loaded) {
        this._catalog = loaded.catalog;
        this._fromCache = loaded.fromCache;
        entries = await loadCatalogEntries(loaded.catalog);
      }
    } catch { /* fall through to the fallback sources */ }
    if (!entries.length) {
      for (const source of DEFAULT_SHOWCASE_SOURCES) {
        try {
          if (source.type === 'manifest') {
            const entry = await CourseSourceManager.previewManifest(source.url);
            if (!entry.error) entries.push(wrapPreviewEntry(entry));
          } else if (source.type === 'aggregate') {
            const preview = await CourseSourceManager.previewBundleManifest(source.url);
            for (const entry of preview.entries) {
              if (!entry.error) entries.push(wrapPreviewEntry(entry));
            }
          }
        } catch { /* one bad showcase source must never blank the whole page */ }
      }
    }
    this._entries = entries;
    this._bundles = groupByBundle(entries, this._catalog);
    if (this.profileId) {
      try {
        const enrollments = await ProgressStore.listEnrollments(this.profileId);
        this._enrolledIds = new Set(enrollments.map((e) => e.courseId));
      } catch { /* best-effort */ }
    }
    this._loading = false;
    this._loadExtras();
  }

  /** Bundle manifests, then module facts one module at a time, in the background. */
  async _loadExtras() {
    await Promise.all(this._bundles.map(async (b) => {
      const info = await loadBundleInfo(b);
      this._info = { ...this._info, [b.id]: info };
    }));
    // The open page's modules first, then the rest.
    const first = this._pageBundle();
    const order = [...(first ? first.entries : []), ...this._entries];
    for (const e of order) {
      if (this._facts[e.id]) continue;
      const f = await loadFacts(e);
      this._facts = { ...this._facts, [e.id]: f };
    }
  }

  /* ---------- routing helpers ---------- */

  _route() {
    const [kind, ...rest] = String(this.sub || '').split('/');
    const id = decodeURIComponent(rest.join('/'));
    if (kind === 'bundle' && id) return { kind, id };
    if (kind === 'module' && id) return { kind, id };
    return { kind: 'home', id: '' };
  }

  _pageBundle() {
    const r = this._route();
    if (r.kind === 'bundle') return this._bundles.find((b) => b.id === r.id) || null;
    if (r.kind === 'module') return this._bundleOf(r.id);
    return null;
  }

  _bundleOf(entryId) { return this._bundles.find((b) => b.entries.some((e) => e.id === entryId)) || null; }

  _href(kind, id) { return `#/discover/${kind}/${encodeURIComponent(id)}`; }

  /* ---------- adding ---------- */

  async _gate(title) {
    if (this._gateUnlockedThisVisit) return true;
    const unlocked = await showParentalGateHold(t('discover.gate_prompt', 'Add "{title}" to this student\'s shelf?', { title }));
    if (unlocked) this._gateUnlockedThisVisit = true;
    return unlocked;
  }

  async _addEntry(entry) {
    // addSource relocates when the bundle is already added from another URL.
    const existing = (await CourseSourceManager.listSources()).find((r) => r.bundleId === entry.bundleId);
    if (!existing || existing.sourceUrl !== entry.manifestUrl) await CourseSourceManager.addSource(entry.manifestUrl);
    countInstall(entry.bundleId);
    // Discover enrols only the active profile (a sibling's pick does not clutter another shelf).
    await ProgressStore.enroll(this.profileId, entry.bundleId, { source: 'discover' });
    this._enrolledIds = new Set([...this._enrolledIds, entry.bundleId]);
  }

  /** Adds the given entries (only the missing ones) behind one gate. */
  async _add(entries, busyKey, title) {
    if (!this.profileId || this._busy) return;
    const todo = entries.filter((e) => this._canAdd(e) && !this._enrolledIds.has(e.bundleId));
    if (!todo.length) return;
    if (!(await this._gate(title))) return;
    this._busy = busyKey;
    try {
      for (const e of todo) {
        try { await this._addEntry(e); } catch (err) { console.error('[DiscoverView] could not add course:', err); }
      }
    } finally {
      this._busy = null;
    }
  }

  _canAdd(e) { return e.manifest?.status !== 'draft' && !needsNewerEngine(e.manifest || {}); }

  async _share({ manifestUrl, title }) {
    const { shareCourse } = await import('../components/ShareSheet.js');
    shareCourse({ manifestUrl, title });
  }

  /* ---------- small view helpers ---------- */

  _title(e) { return e.manifest?.title?.en || e.manifest?.title || e.bundleId || e.id; }
  _subject(e) { return e.meta?.subjects?.[0] || e.manifest?.subject || ''; }
  _show(e) { return (this._shows ||= new Map()).get(e) || this._shows.set(e, entryShowcase(e)).get(e); }
  _lessonCount(e) { return this._facts[e.id]?.lessonCount ?? (Array.isArray(e.manifest?.lessons) ? e.manifest.lessons.length : 0); }
  _bundleTitle(b) { return b?.title || this._info[b?.id]?.title || ''; }

  _subjectClass(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return 'biology';
    if (sub.includes('phys')) return 'physics';
    if (sub.includes('chem')) return 'chemistry';
    if (sub.includes('math')) return 'math';
    return '';
  }

  _subjectIcon(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return '\u{1F33F}';
    if (sub.includes('phys')) return '⚛️';
    if (sub.includes('chem')) return '\u{1F9EA}';
    if (sub.includes('math')) return '\u{1F4D0}';
    return '\u{1F4D6}';
  }

  /** Cover art: the course's own cover, else generated (subject banner under Quill, look cover under plain). */
  _art(e, { cls = 'art', url = null, tag = true } = {}) {
    const cover = url || this._show(e).cover;
    const subject = this._subject(e);
    return html`<span class=${cls}>
      <span class="gen ${this._subjectClass(subject)}">
        ${this.look === 'plain' ? html`<look-cover seed=${e.bundleId} subject=${subjectName(subject)} heading=${this._title(e)}></look-cover>` : ''}
        <span class="gen-icon" aria-hidden="true">${e.manifest?.icon || this._subjectIcon(subject)}</span>
      </span>
      ${cover ? html`<img src=${cover} alt="" loading="lazy" @error=${(ev) => ev.target.remove()}>` : ''}
      ${tag && this._enrolledIds.has(e.bundleId) ? html`<span class="on-shelf-tag">${iconCheck}${t('discover.on_shelf_short', 'On shelf')}</span>` : ''}
    </span>`;
  }

  _meta(e, { size = false } = {}) {
    const n = this._lessonCount(e);
    const f = this._facts[e.id];
    const s = this._show(e);
    return html`<span class="meta">
      ${n ? html`<span>${plural(n, t('discover.lesson', 'lesson'), t('discover.lessons', 'lessons'))}</span>` : ''}
      ${s.estHours != null ? html`<span>${t('discover.hours_short', 'about {n} h', { n: s.estHours })}</span>` : ''}
      ${size && s.sizeMB != null ? html`<span>${s.sizeMB} MB</span>` : ''}
      ${f?.narrated ? html`<span class="narr">${SPEAKER}${t('discover.feature.narration', 'Narrated')}</span>` : ''}
    </span>`;
  }

  _card(e) {
    const s = this._show(e);
    return html`<a class="card" href=${this._href('module', e.id)}>
      ${this._art(e)}
      <span class="card-title">${this._title(e)}</span>
      ${s.blurb ? html`<span class="card-line">${s.blurb}</span>` : ''}
      ${this._meta(e)}
    </a>`;
  }

  /** Add button for one module. size: 'sm' pill (lists) or 'lg' (module page). */
  _addOne(e, size = 'sm') {
    if (this._enrolledIds.has(e.bundleId)) return html`<span class="on-shelf">${iconCheck}${size === 'lg' ? t('discover.on_shelf', 'On your shelf') : t('discover.on_shelf_short', 'On shelf')}</span>`;
    if (!this._canAdd(e)) return html`<span class="badge update">${t('course.needs_update_badge', 'Needs update')}</span>`;
    const busy = this._busy === `m:${e.id}`;
    return html`<button class="btn-3d btn-primary ${size === 'lg' ? 'btn-lg add-main' : 'btn-sm pill-add'}" ?disabled=${!!this._busy}
        @click=${() => this._add([e], `m:${e.id}`, this._title(e))}>
      ${busy ? t('discover.adding', 'Adding…') : size === 'lg' ? t('discover.add', 'Add to my shelf') : t('discover.add_short', 'Add')}
    </button>`;
  }

  /** Add-all for a bundle: adds only the missing modules. */
  _addAll(b, size = 'sm') {
    const addable = b.entries.filter((e) => this._canAdd(e));
    const missing = addable.filter((e) => !this._enrolledIds.has(e.bundleId));
    if (!missing.length) return html`<span class="on-shelf">${iconCheck}${t('discover.all_on_shelf', 'All on your shelf')}</span>`;
    const busy = this._busy === `b:${b.id}`;
    const label = addable.length === 1
      ? (size === 'lg' ? t('discover.add', 'Add to my shelf') : t('discover.add_short', 'Add'))
      : missing.length === addable.length
      ? t('discover.add_all', 'Add all {n}', { n: missing.length })
      : t('discover.add_rest', 'Add the other {n}', { n: missing.length });
    return html`<button class="btn-3d ${size === 'lg' ? 'btn-primary btn-lg add-main' : 'btn-secondary btn-sm pill-add'}" ?disabled=${!!this._busy}
        @click=${() => this._add(missing, `b:${b.id}`, this._bundleTitle(b))}>
      ${busy ? t('discover.adding', 'Adding…') : label}
    </button>`;
  }

  _scrollRail(ev, dir) {
    const rail = ev.currentTarget.parentElement.querySelector('.rail');
    rail?.scrollBy({ left: dir * rail.clientWidth * 0.9, behavior: 'smooth' });
  }

  _rail(entries) {
    return html`<div class="rail-wrap">
      ${entries.length > 4 ? html`<button class="rail-btn prev" aria-label=${t('discover.prev', 'Scroll back')} @click=${(ev) => this._scrollRail(ev, -1)}>${iconChevronRight}</button>` : ''}
      <ul class="rail">${entries.map((e) => html`<li>${this._card(e)}</li>`)}</ul>
      ${entries.length > 4 ? html`<button class="rail-btn next" aria-label=${t('discover.next', 'Scroll on')} @click=${(ev) => this._scrollRail(ev, 1)}>${iconChevronRight}</button>` : ''}
    </div>`;
  }

  _facts_(items) {
    const shown = items.filter(([v]) => v != null && v !== '');
    return shown.length ? html`<ul class="facts">${shown.map(([v, k]) => html`<li><span class="fact-v">${v}</span><span class="fact-k">${k}</span></li>`)}</ul>` : '';
  }

  _alignLine(a) {
    return a ? html`<p class="align">${BOOKMARK}<span>${a.text}</span></p>` : '';
  }

  _badges(list) {
    return list.length ? html`<ul class="badges">${list.map((x) => html`<li class="badge ${x.kind}" title=${x.hint || ''}>${this.look === 'plain' ? '' : x.icon || ''}${x.text}</li>`)}</ul>` : '';
  }

  _labelBadge(e) {
    const lb = LABEL_BADGES[e.label];
    return lb ? [{ kind: e.label, text: t(lb[0], lb[1]), hint: t(lb[2], lb[3]), icon: iconCheck }] : [];
  }

  /* ---------- pages ---------- */

  _renderHome() {
    return html`
      <header class="page-head">
        <p class="kicker">${t('discover.kicker', 'Course shop')}</p>
        <h1 class="page-title">${t('discover.title', 'Discover')}</h1>
        <p class="page-subtitle">${t('discover.subtitle_bundles', 'Add a whole subject at once, or pick single modules. Adding needs a parent.')}</p>
        ${this._fromCache ? html`<p class="catalog-offline">${t('discover.offline', 'Showing the last saved list (offline).')}</p>` : ''}
      </header>
      ${this._renderFeature()}
      ${this._bundles.map((b) => {
        const info = this._info[b.id] || {};
        const single = b.id.startsWith('single:');
        const title = single ? this._title(b.entries[0]) : (this._bundleTitle(b) || b.id);
        return html`<section class="row" aria-label=${title}>
          <div class="row-head">
            ${single ? html`<h2 class="row-title">${title}</h2>` : html`<a class="row-link" href=${this._href('bundle', b.id)}>
              <h2 class="row-title">${title}</h2>${iconChevronRight}</a>`}
            ${this.profileId ? this._addAll(b) : ''}
          </div>
          ${info.blurb ? html`<p class="row-blurb">${info.blurb}</p>` : html`<p class="row-blurb">${plural(b.entries.length, t('discover.module', 'module'), t('discover.modules', 'modules'))}</p>`}
          ${this._rail(b.entries)}
        </section>`;
      })}
    `;
  }

  _bundleAlignment(b) {
    const fs = b.entries.map((e) => this._facts[e.id]);
    if (fs.some((f) => !f)) return null;
    const m = b.entries[0]?.meta || {};
    return syllabusAlignment(fs.flatMap((f) => f.chapterIds || []), { board: m.board, grade: m.grade, subject: m.subjects?.[0] });
  }

  _renderBundle(b) {
    const info = this._info[b.id] || {};
    const title = this._bundleTitle(b) || b.id;
    const first = b.entries[0];
    const m = first?.meta || {};
    const lessons = b.entries.reduce((n, e) => n + this._lessonCount(e), 0);
    const hours = b.entries.every((e) => this._show(e).estHours != null) ? b.entries.reduce((n, e) => n + this._show(e).estHours, 0) : null;
    const size = b.entries.every((e) => this._show(e).sizeMB != null) ? b.entries.reduce((n, e) => n + this._show(e).sizeMB, 0) : null;
    const narrated = b.entries.some((e) => this._facts[e.id]?.narrated);
    const align = this._bundleAlignment(b);
    // No board name here: "CBSE" appears only in the derived syllabus line (D29).
    const by = [m.authors?.[0]?.name || 'CoAuthor', first ? subjectName(this._subject(first)) : '', m.grade != null ? gradeLabel(m.grade, 'Class') : ''].filter(Boolean).join(' · ');
    const coverUrl = this._bundleCover(b);
    return html`
      <nav class="crumb"><a href="#/discover">${iconArrowLeft}${t('discover.title', 'Discover')}</a></nav>
      <header class="hero">
        ${first ? this._art(first, { url: coverUrl, tag: false }) : ''}
        <div class="hero-text">
          <p class="kicker">${t('discover.bundle_kicker', 'Course bundle')}</p>
          <h1 class="title">${title}</h1>
          <p class="by">${by}</p>
          ${info.blurb ? html`<p class="lead">${info.blurb}</p>` : ''}
          ${this._facts_([
            [b.entries.length, t('discover.modules', 'modules')],
            [lessons || null, t('discover.lessons', 'lessons')],
            [hours != null ? `${Math.round(hours)} h` : null, t('discover.of_learning', 'to learn')],
            [size != null ? `${Math.round(size)} MB` : null, t('discover.download', 'download')],
          ])}
          ${this._badges([...this._labelBadge(first || {}), ...(narrated ? [{ kind: 'narrated', text: t('discover.some_narrated', 'Some lessons narrated'), icon: SPEAKER }] : [])])}
          <div class="actions">
            ${this.profileId ? this._addAll(b, 'lg') : ''}
            ${bundleManifestUrl(b) ? html`<button class="btn-3d btn-secondary btn-sm share-btn" @click=${() => this._share({ manifestUrl: first.manifestUrl, title })}>${iconShare}<span>${t('discover.share', 'Share')}</span></button>` : ''}
          </div>
          ${this.profileId && b.entries.some((e) => !this._enrolledIds.has(e.bundleId)) ? html`<p class="gate-hint">${t('discover.needs_parent', 'A parent holds the button to confirm.')}</p>` : ''}
          ${this._alignLine(align)}
        </div>
      </header>
      ${info.description || info.highlights?.length ? html`<section class="sec">
        <h2 class="sec-title">${t('discover.about_bundle', 'About this bundle')}</h2>
        ${info.description ? html`<p class="prose">${info.description}</p>` : ''}
        ${this._highlights(info.highlights)}
      </section>` : ''}
      <section class="sec">
        <h2 class="sec-title">${t('discover.modules_title', 'Modules')}<span class="count">${b.entries.length}</span></h2>
        <ul class="mods">${b.entries.map((e) => html`<li class="mod">
          <a class="mod-link" href=${this._href('module', e.id)}>
            ${this._art(e)}
            <span class="mod-text">
              <span class="mod-title">${this._title(e)}</span>
              ${this._show(e).blurb ? html`<span class="mod-line">${this._show(e).blurb}</span>` : ''}
              ${this._meta(e, { size: true })}
            </span>
          </a>
          ${this.profileId ? this._addOne(e) : ''}
        </li>`)}</ul>
      </section>
      ${align ? html`<p class="indep">${t('discover.independent', INDEPENDENCE_NOTE)}</p>` : ''}
    `;
  }

  /** A bundle's cover: its own, else (Quill only) the cover.jpg make-landing draws in the Quill look. */
  _bundleCover(b) {
    const info = this._info[b.id] || {};
    return info.cover || (this.look === 'plain' ? null : info.coverFallback) || null;
  }

  /** The featured bundle on top of home: the first one for this learner (college under plain, else school). */
  _renderFeature() {
    const real = this._bundles.filter((b) => !b.id.startsWith('single:'));
    if (!real.length) return '';
    const adult = (b) => b.audience === 'college' || b.audience === 'adult';
    const b = (this.look === 'plain' ? real.find(adult) : real.find((x) => !adult(x))) || real[0];
    const info = this._info[b.id] || {};
    const lessons = b.entries.reduce((n, e) => n + this._lessonCount(e), 0);
    return html`<section class="feature" aria-label=${t('discover.featured', 'Featured')}>
      <a class="feature-art" href=${this._href('bundle', b.id)} tabindex="-1" aria-hidden="true">${this._art(b.entries[0], { url: this._bundleCover(b), tag: false })}</a>
      <div class="feature-text">
        <p class="kicker">${t('discover.featured_bundle', 'Featured bundle')}</p>
        <h2 class="feature-title"><a href=${this._href('bundle', b.id)}>${this._bundleTitle(b) || b.id}</a></h2>
        ${info.blurb ? html`<p class="feature-blurb">${info.blurb}</p>` : ''}
        <p class="meta">
          <span>${plural(b.entries.length, t('discover.module', 'module'), t('discover.modules', 'modules'))}</span>
          ${lessons ? html`<span>${plural(lessons, t('discover.lesson', 'lesson'), t('discover.lessons', 'lessons'))}</span>` : ''}
          ${b.entries.some((e) => this._facts[e.id]?.narrated) ? html`<span class="narr">${SPEAKER}${t('discover.feature.narration', 'Narrated')}</span>` : ''}
        </p>
        <div class="actions">
          <a class="btn-3d btn-secondary btn-sm" href=${this._href('bundle', b.id)}>${t('discover.see_bundle', 'See the bundle')}</a>
          ${this.profileId ? this._addAll(b) : ''}
        </div>
      </div>
    </section>`;
  }

  _highlights(list) {
    return list?.length ? html`<ul class="highlights">${list.map((h) => html`<li><span class="hl-mark">${iconCheck}</span><span>${h}</span></li>`)}</ul>` : '';
  }

  _renderMedia(e) {
    const s = this._show(e);
    if (!s.screencast && !s.screenshots.length) return '';
    return html`<section class="sec" aria-label=${t('discover.screenshots', 'Screenshots')}>
      <ul class="shots">
        ${s.screencast?.url ? html`<li><figure class="shot">
          <video src=${s.screencast.url} poster=${s.screencast.poster || s.screenshots[0]?.url || ''} muted playsinline loop preload="none"
            ?controls=${this._playing} aria-label=${t('discover.clip', 'A short silent clip from the module')}></video>
          ${this._playing ? '' : html`<button class="play" @click=${(ev) => { const v = ev.currentTarget.parentElement.querySelector('video'); this._playing = true; v?.play?.().catch(() => {}); }}>
            <span class="play-dot">${PLAY}</span><span class="play-label">${t('discover.watch', 'Watch a clip')}</span>
          </button>`}
        </figure></li>` : ''}
        ${s.screenshots.map((sh, i) => html`<li><figure class="shot">
          <img src=${sh.url} alt=${sh.caption || t('discover.shot_alt', 'Screenshot {n}', { n: i + 1 })} loading="lazy"
            @load=${(ev) => { const im = ev.currentTarget; if (im.naturalWidth > im.naturalHeight) im.parentElement.classList.add('land'); }}>
          ${sh.caption ? html`<figcaption>${sh.caption}</figcaption>` : ''}
        </figure></li>`)}
      </ul>
    </section>`;
  }

  _renderModule(e) {
    const b = this._bundleOf(e.id);
    const s = this._show(e);
    const f = this._facts[e.id];
    const m = e.meta || {};
    const bTitle = b && !b.id.startsWith('single:') ? this._bundleTitle(b) : '';
    const grade = m.grade ?? e.manifest?.grade;
    const sub = [subjectName(this._subject(e)), grade != null ? gradeLabel(grade, 'Class') : ''].filter(Boolean).join(' · ');
    const badges = [...this._labelBadge(e), ...(f?.narrated ? [{ kind: 'narrated', text: t('discover.feature.narration', 'Narrated'), icon: SPEAKER }] : [])];
    const lessons = (f?.modules || []).flatMap((mod) => mod.lessons).map((l) => l.title).filter(Boolean);
    const others = b ? b.entries.filter((x) => x.id !== e.id) : [];
    const details = [];
    if (m.authors?.length) details.push([t('discover.meta.authors', 'Made by'), m.authors.map((a) => a.name).join(', ')]);
    details.push([t('discover.meta.license', 'Licence'), m.license || t('discover.meta.not_stated', 'Not stated')]);
    if (m.version) details.push([t('discover.meta.version', 'Version'), m.version]);
    if (m.updatedAt) details.push([t('discover.meta.updated', 'Updated'), m.updatedAt]);
    if (m.languages?.length) details.push([t('discover.meta.languages', 'Language'), m.languages.map((l) => (l === 'en' ? 'English' : l)).join(', ')]);
    const repo = m.repository?.url && /^https?:/i.test(m.repository.url) ? m.repository.url : '';
    if (repo) details.push([t('discover.meta.source', 'Source'), html`<a href=${repo} target="_blank" rel="noopener noreferrer">${repo.replace(/^https?:\/\//, '')}</a>`]);
    return html`
      <nav class="crumb"><a href=${b && bTitle ? this._href('bundle', b.id) : '#/discover'}>${iconArrowLeft}${bTitle || t('discover.title', 'Discover')}</a></nav>
      <header class="app-head">
        ${this._art(e, { cls: 'icon', tag: false })}
        <div class="head-text">
          <h1 class="title">${this._title(e)}</h1>
          ${bTitle ? html`<a class="by" href=${this._href('bundle', b.id)}>${bTitle}</a>` : ''}
          <p class="sub">${sub}</p>
        </div>
      </header>
      ${this._facts_([
        [this._lessonCount(e) || null, t('discover.lessons', 'lessons')],
        [s.estHours != null ? html`${iconClock}${s.estHours} h` : null, t('discover.of_learning', 'to learn')],
        [s.sizeMB != null ? html`${iconDownload}${s.sizeMB} MB` : null, t('discover.download', 'download')],
        [grade != null ? String(grade) : null, Number.isFinite(grade) ? t('discover.class', 'class') : t('discover.level', 'level')],
      ])}
      ${this._badges(badges)}
      <div class="actions head-actions" style="margin-top: var(--space-3)">
        ${this.profileId ? this._addOne(e, 'lg') : ''}
        <button class="btn-3d btn-secondary btn-sm share-btn" @click=${() => this._share({ manifestUrl: e.manifestUrl, title: this._title(e) })}>${iconShare}<span>${t('discover.share', 'Share')}</span></button>
      </div>
      ${this.profileId && !this._enrolledIds.has(e.bundleId) ? html`<p class="gate-hint">${t('discover.needs_parent', 'A parent holds the button to confirm.')}</p>` : ''}
      ${this._renderMedia(e)}
      <div class="split">
        <div class="main">
          <section class="sec">
            <h2 class="sec-title">${t('discover.about', 'About this module')}</h2>
            ${s.blurb ? html`<p class="prose blurb-strong">${s.blurb}</p>` : ''}
            ${s.description || m.description ? html`<p class="prose">${s.description || m.description}</p>` : ''}
            ${this._highlights(s.highlights)}
          </section>
          ${lessons.length ? html`<section class="sec">
            <h2 class="sec-title">${t('discover.lessons_title', 'Lessons')}<span class="count">${lessons.length}</span></h2>
            ${f?.alignment ? html`<div style="margin-bottom: var(--space-3)">${this._alignLine(f.alignment)}</div>` : ''}
            <ol class="lessons">${lessons.map((l) => html`<li>${l}</li>`)}</ol>
          </section>` : f ? '' : html`<p class="sec loading">${t('discover.loading_lessons', 'Loading the lesson list…')}</p>`}
        </div>
        <aside>
          <section class="sec">
            <h2 class="sec-title">${t('discover.details', 'Details')}</h2>
            <dl class="details">${details.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
          </section>
          ${others.length ? html`<section class="sec">
            <h2 class="sec-title">${t('discover.more_in', 'More in {b}', { b: bTitle || t('discover.this_bundle', 'this bundle') })}</h2>
            <div class="side-list">${others.slice(0, 6).map((x) => this._card(x))}</div>
          </section>` : ''}
        </aside>
      </div>
      ${f?.alignment ? html`<p class="indep">${t('discover.independent', INDEPENDENCE_NOTE)}</p>` : ''}
    `;
  }

  render() {
    if (this._loading) return html`<app-loader label=${t('discover.loading', 'Loading…')}></app-loader>`;
    if (!this._entries.length) {
      return html`
        <header class="page-head">
          <p class="kicker">${t('discover.kicker', 'Course shop')}</p>
          <h1 class="page-title">${t('discover.title', 'Discover')}</h1>
        </header>
        <div class="empty-state">
          <h3>${t('discover.empty_title', 'Nothing to browse yet')}</h3>
          <p>${t('discover.empty_body', 'No showcase courses are configured on this device yet. Ask a parent to add courses directly from Parent Dashboard → Course Content Sources.')}</p>
        </div>`;
    }
    const r = this._route();
    if (r.kind === 'bundle') {
      const b = this._bundles.find((x) => x.id === r.id);
      if (b) return this._renderBundle(b);
    } else if (r.kind === 'module') {
      const e = this._entries.find((x) => x.id === r.id && x.manifest?.status !== 'draft');
      if (e) return this._renderModule(e);
    }
    return this._renderHome();
  }
}

customElements.define('discover-view', DiscoverView);
