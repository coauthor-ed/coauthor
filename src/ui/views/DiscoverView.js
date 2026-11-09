import '../components/LookSlots.js';
import { LitElement, html, css } from 'lit';
import { CourseSourceManager } from '../../core/CourseSourceManager.js';
import { gradeLabel } from '../../core/gradeLabel.js';
import { ProgressStore } from '../../core/ProgressStore.js';
import { DEFAULT_SHOWCASE_SOURCES } from '../../config/defaultShowcaseSources.js';
import { btn3dStyles } from '../sharedStyles.js';
import { showParentalGateHold } from '../components/GateHoldDialog.js';
import '../components/MarkdownRenderer.js';
import { LookMixin } from '../../core/mixins/LookMixin.js';
import { i18n } from '../../core/i18nProvider.js';
import { needsNewerEngine } from '../../core/engineVersion.js';
import {
  resolveCatalogUrl, loadCatalog, loadCatalogEntries, wrapPreviewEntry, filterEntries, sortEntries,
  buildFacets, buildCollections, loadDetail, countInstall,
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

/** A language code as a readable name ("hi" -> "Hindi"); the code itself when the browser cannot name it. */
function languageName(code) {
  try {
    const n = new Intl.DisplayNames([i18n.currentLocale || 'en'], { type: 'language' }).of(code);
    return n && n !== code ? n : String(code).toUpperCase();
  } catch { return String(code).toUpperCase(); }
}

const AUDIENCE_LABELS = { school: ['discover.audience.school', 'School'], college: ['discover.audience.college', 'College'], adult: ['discover.audience.adult', 'Adult'] };
const FEATURE_LABELS = {
  narration: ['discover.feature.narration', 'Narrated'],
  story: ['discover.feature.story', 'Story'],
  games: ['discover.feature.games', 'Games'],
  practice: ['discover.feature.practice', 'Practice'],
};
const LABEL_BADGES = {
  core: ['discover.badge.core', 'Core', 'discover.badge.core_hint', 'Part of the core CoAuthor library'],
  checked: ['discover.badge.checked', 'Checked', 'discover.badge.checked_hint', 'Checked by the catalog team'],
  outside: ['discover.badge.outside', 'Outside', 'discover.badge.outside_hint', 'From an outside author, not checked by the catalog team'],
};

/**
 * <discover-view> - a browsable showcase of courses/question-banks a
 * student can *see* but only a parent (via the existing press-and-hold
 * gate) can actually add. See docs/sprints/completed/bookshelf-discover-
 * and-identity-groundwork.md. Reuses CourseSourceManager's existing
 * preview-without-registering semantics (previewBundleManifest/
 * previewManifest) so browsing needs no trust ceremony of its own - it's
 * read-only metadata, no code execution, unlike actually registering a
 * source.
 *
 * Layout (2026-11-09): a small course shop. Filter chips, then the
 * catalog's collections as rows that scroll sideways inside themselves,
 * then every course as a card grid. Details open as a modal sheet (hero
 * cover, screenshots, clip, intro, metadata, "Add to my shelf").
 */
export class DiscoverView extends LookMixin(LitElement) {
  static styles = [btn3dStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      max-width: 1060px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
      padding: var(--space-4) var(--space-4) var(--space-7);
      min-width: 0;
    }
    *, *::before, *::after { box-sizing: border-box; }

    /* ---------- head ---------- */
    .page-head { margin: var(--space-2) 0 var(--space-5); }
    .page-kicker {
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-kicker);
      letter-spacing: var(--kicker-tracking, 0.12em);
      text-transform: uppercase;
      color: var(--primary-text);
      margin: 0 0 var(--space-1);
    }
    .page-title {
      font-size: var(--fs-h1);
      line-height: var(--lh-tight);
      margin: 0 0 var(--space-2);
      font-family: var(--font-heading);
    }
    .page-subtitle { margin: 0; color: var(--text-muted); max-width: 60ch; }
    .catalog-offline {
      display: inline-block;
      margin: var(--space-3) 0 0;
      font-size: var(--fs-small);
      color: var(--info-text);
      background: var(--info-bg);
      border-radius: var(--radius-pill);
      padding: 4px 12px;
    }

    /* ---------- filter chips: flat, a rim and a solid lip, no gloss ---------- */
    .filters {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0 0 var(--space-5);
      min-width: 0;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      overflow-x: auto;
      scrollbar-width: none;
      padding: 2px 0 6px;
      min-width: 0;
    }
    .filter-group::-webkit-scrollbar { display: none; }
    .filter-label {
      flex: none;
      min-width: 4.5rem;
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-kicker);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .chip {
      flex: none;
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      font-size: var(--fs-small);
      line-height: 1.2;
      padding: 7px 14px;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--lip) var(--lip-color);
      cursor: pointer;
      transition: transform var(--motion-fast), background var(--motion-fast), color var(--motion-fast);
    }
    .chip:hover { border-color: var(--border-hover); }
    .chip[aria-pressed="true"] {
      background: var(--primary-color);
      border-color: var(--primary-hover);
      color: var(--on-primary);
      box-shadow: var(--lip) var(--primary-hover);
    }
    .chip:active { transform: translateY(var(--press-travel-sm, 3px)); box-shadow: none; }
    .chip:focus-visible, .sort-select:focus-visible, .tile:focus-visible, .cover-btn:focus-visible, .sheet-close:focus-visible {
      outline: var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }
    .chip-clear { background: transparent; color: var(--primary-text); box-shadow: none; border-style: dashed; }

    /* ---------- section heads ---------- */
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
      margin: 0 0 var(--space-3);
    }
    .section-title, .collection-title {
      font-family: var(--font-heading);
      font-size: var(--fs-h3);
      margin: 0;
    }
    .count { color: var(--text-muted); font-weight: var(--fw-medium); font-size: var(--fs-small); margin-left: var(--space-2); }
    .filter-sort {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--fs-small);
      font-weight: var(--fw-strong);
      color: var(--text-muted);
    }
    .sort-select {
      font: inherit;
      font-family: var(--font-ui);
      font-weight: var(--fw-heavy);
      color: var(--text-main);
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-pill);
      box-shadow: var(--lip) var(--lip-color);
      padding: 5px 10px;
      cursor: pointer;
    }

    /* ---------- collections: rows that scroll inside themselves ---------- */
    .collections { display: flex; flex-direction: column; gap: var(--space-5); margin: 0 0 var(--space-6); }
    .collection { min-width: 0; }
    .collection-title { margin-bottom: var(--space-2); }
    .collection-list {
      list-style: none;
      display: flex;
      gap: var(--space-3);
      margin: 0 calc(-1 * var(--space-4));
      padding: 4px var(--space-4) 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: var(--space-4);
      scrollbar-width: thin;
      overscroll-behavior-x: contain;
    }
    .collection-list > li { flex: 0 0 clamp(200px, 64vw, 232px); scroll-snap-align: start; display: flex; }
    .tile {
      width: 100%;
      display: flex;
      flex-direction: column;
      text-align: left;
      font: inherit;
      color: inherit;
      padding: 0;
      cursor: pointer;
      background: var(--surface-card);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--press-1) var(--lip-color);
      overflow: hidden;
      transition: transform var(--motion-fast) var(--ease-settle);
    }
    .tile:hover { transform: translateY(var(--hover-lift)); }
    .tile:active { transform: translateY(var(--press-travel-sm, 3px)); box-shadow: none; }
    .tile .cover { height: 108px; }
    .tile-body { padding: var(--space-3); display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .tile-title { font-family: var(--font-heading); font-weight: var(--heading-weight, 700); font-size: 1.02rem; line-height: var(--lh-tight); margin: 0; }
    .tile-line { margin: 0; font-size: var(--fs-small); color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    /* ---------- covers ---------- */
    .cover {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 140px;
      overflow: hidden;
      color: var(--card-banner-ink);
      background: var(--card-banner-bg, var(--gradient-banner));
      border-bottom: var(--rule-w) solid var(--border-color);
    }
    .cover.biology   { background: var(--card-banner-bg, var(--gradient-teal)); }
    .cover.physics   { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-violet) 100%)); }
    .cover.chemistry { background: var(--card-banner-bg, var(--gradient-gold)); }
    .cover.math      { background: var(--card-banner-bg, linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-coral) 100%)); }
    .cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cover look-cover > * { position: absolute; inset: 0; }
    .cover:has(look-cover > *) > .cover-icon { display: none; }
    .cover-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      font-size: 2.1rem;
      border-radius: var(--radius-lg);
      background: var(--card-banner-track);
      box-shadow: var(--lip) var(--card-banner-track);
      transition: transform var(--motion-base) var(--ease-spring);
    }
    .tile .cover-icon { width: 52px; height: 52px; font-size: 1.7rem; }
    .card:hover .cover-icon, .tile:hover .cover-icon { transform: var(--card-icon-hover, scale(1.08) translateY(-2px)); }
    .cover-btn { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; font: inherit; color: inherit; }

    /* ---------- badges ---------- */
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: var(--font-ui);
      font-size: 0.72rem;
      font-weight: var(--fw-heavy);
      letter-spacing: 0.02em;
      line-height: 1.2;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: var(--bg-panel-2);
      color: var(--text-muted);
      white-space: nowrap;
    }
    .badge svg { width: 12px; height: 12px; flex: none; }
    .badge.core { background: var(--primary-light); color: var(--primary-text); }
    .badge.checked { background: var(--success-bg); color: var(--success-text); }
    .badge.outside { background: var(--bg-panel-2); color: var(--text-muted); }
    .badge.update, .badge.draft { background: var(--warn-bg); color: var(--warn-text); }
    .badge.narrated { background: var(--info-bg); color: var(--info-text); }

    /* ---------- all-courses grid ---------- */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(270px, 100%), 1fr));
      gap: var(--space-5);
    }
    .card {
      position: relative;
      background: var(--surface-card);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--press-1) var(--lip-color);
      min-width: 0;
      animation: arrive var(--motion-slow) var(--ease-spring) both;
    }
    @keyframes arrive {
      from { opacity: 0; transform: translateY(var(--rise-distance, 8px)); }
      to { opacity: 1; transform: none; }
    }
    .card-body { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); flex: 1; }
    .card-type {
      font-family: var(--font-ui);
      text-transform: uppercase;
      font-size: var(--fs-kicker);
      font-weight: var(--fw-heavy);
      letter-spacing: 0.1em;
      color: var(--card-kicker, var(--primary-text));
    }
    .card h3 { margin: 0; font-size: 1.2rem; line-height: var(--lh-tight); font-family: var(--font-heading); }
    .tagline { margin: 0; font-weight: var(--fw-strong); color: var(--text-main); }
    .card-desc {
      margin: 0;
      font-size: var(--fs-small);
      color: var(--text-muted);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-footer { margin-top: auto; padding-top: var(--space-3); }
    .footer-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
    .on-shelf-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--fs-small);
      font-weight: var(--fw-heavy);
      color: var(--success-text);
      background: var(--success-bg);
      padding: 8px 14px;
      border-radius: var(--radius-pill);
    }
    .not-reviewed { font-size: var(--fs-small); color: var(--text-muted); }

    .empty-state, .error-state, .no-match {
      text-align: center;
      padding: var(--space-7) var(--space-5);
      background: var(--bg-surface);
      border: var(--rule-w) dashed var(--border-hover);
      border-radius: var(--radius-lg);
      color: var(--text-muted);
    }
    .no-match p { margin: 0 0 var(--space-3); }

    /* ---------- detail sheet (a modal dialog: top layer, so no ancestor transform can move it) ---------- */
    dialog.sheet {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text-main);
      overflow: hidden;
    }
    dialog.sheet::backdrop { background: transparent; }
    .scrim { position: absolute; inset: 0; background: var(--scrim); animation: fade var(--motion-base) ease-out both; }
    .sheet-panel {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(760px, calc(100% - 2 * var(--space-5)));
      max-height: calc(100% - 2 * var(--space-6));
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-xl);
      box-shadow: var(--press-2) var(--lip-color), var(--shadow-lg);
      animation: sheet-in var(--motion-slow) var(--ease-spring) both;
    }
    @keyframes sheet-in {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)) scale(0.98); }
      to { opacity: 1; transform: translate(-50%, -50%); }
    }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .sheet-close {
      position: absolute;
      top: var(--space-3);
      right: var(--space-3);
      z-index: 2;
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-pill);
      border: var(--rule-w) solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      box-shadow: var(--lip) var(--lip-color);
      cursor: pointer;
    }
    .sheet-close svg { width: 18px; height: 18px; }
    .sheet-close:active { transform: translateY(var(--press-travel-sm, 3px)); box-shadow: none; }
    .sheet-hero .cover { height: clamp(160px, 30vw, 240px); border-radius: 0; }
    .sheet-hero .cover-icon { width: 92px; height: 92px; font-size: 3rem; border-radius: var(--radius-xl); }
    .sheet-body { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
    .sheet-head { display: flex; flex-direction: column; gap: var(--space-2); }
    .sheet-title { font-family: var(--font-heading); font-size: var(--fs-h2); line-height: var(--lh-tight); margin: 0; }
    .sheet-tagline { margin: 0; font-size: 1.05rem; font-weight: var(--fw-strong); color: var(--text-muted); }
    .sheet-action { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    .sheet-action .hint { font-size: var(--fs-small); color: var(--text-muted); }
    .sheet h3 {
      font-family: var(--font-ui);
      font-size: var(--fs-kicker);
      font-weight: var(--fw-heavy);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin: 0 0 var(--space-2);
    }
    .details { display: flex; flex-direction: column; gap: var(--space-5); }
    .details[data-state="loading"] { min-height: 120px; align-items: center; justify-content: center; color: var(--text-muted); }
    .detail-description { margin: 0; line-height: var(--lh-body); }
    .shots {
      display: flex;
      gap: var(--space-3);
      overflow-x: auto;
      margin: 0 calc(-1 * var(--space-5));
      padding: 2px var(--space-5) 10px;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: var(--space-5);
      overscroll-behavior-x: contain;
    }
    .shots figure { margin: 0; flex: 0 0 auto; scroll-snap-align: start; display: flex; flex-direction: column; gap: 6px; }
    .shots img {
      height: 190px;
      width: auto;
      max-width: 78vw;
      object-fit: cover;
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-panel-2);
      display: block;
    }
    .shots figcaption { font-size: var(--fs-small); color: var(--text-muted); max-width: 260px; }
    .detail-clip { width: 100%; max-height: 360px; border-radius: var(--radius-md); border: var(--rule-w) solid var(--border-color); background: var(--bg-sunken); display: block; }
    .meta-list {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0;
      padding: var(--space-4);
      background: var(--bg-sunken);
      border-radius: var(--radius-md);
      font-size: var(--fs-small);
    }
    .meta-list dt { color: var(--text-muted); font-weight: var(--fw-strong); }
    .meta-list dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .meta-list a { color: var(--primary-text); }

    @media (min-width: 760px) {
      .filters { flex-direction: row; flex-wrap: wrap; column-gap: var(--space-6); row-gap: var(--space-1); }
      .filter-label { min-width: 0; }
    }
    @media (max-width: 600px) {
      .page-title { font-size: var(--fs-h2); }
      .tile .cover { height: 92px; }
      .sheet-panel {
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        width: 100%;
        max-height: calc(100% - var(--space-6));
        transform: none;
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        border-bottom: 0;
        box-shadow: var(--shadow-lg);
        animation-name: sheet-up;
      }
      @keyframes sheet-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      .sheet-body { padding: var(--space-4); }
      .shots { margin: 0 calc(-1 * var(--space-4)); padding-inline: var(--space-4); scroll-padding-inline: var(--space-4); }
      .shots img { height: 150px; }
      .meta-list { grid-template-columns: 1fr; gap: 2px; }
      .meta-list dd + dt { margin-top: var(--space-2); }
    }
    @media (prefers-reduced-motion: reduce) {
      .card, .sheet-panel, .scrim { animation: none; }
      .tile, .chip, .cover-icon { transition: none; }
    }

    /* ---------- plain: a catalogue page. Display title over a full rule,
       underline filter tabs, hairline cards, small-caps tags. ---------- */
    :host([data-look="plain"]) .page-kicker { color: var(--accent-coral); }
    :host([data-look="plain"]) .page-head {
      padding-bottom: var(--space-5);
      margin-bottom: var(--space-5);
      border-bottom: 1px solid var(--rule-strong, var(--text-main));
    }
    :host([data-look="plain"]) .page-title { font-weight: 600; letter-spacing: -0.01em; }
    :host([data-look="plain"]) .page-subtitle { color: var(--text-soft); }
    :host([data-look="plain"]) .filters { row-gap: 0; border-bottom: 1px solid var(--rule-soft, var(--border-color)); }
    :host([data-look="plain"]) .filter-group { gap: var(--space-4); padding: 0; }
    :host([data-look="plain"]) .filter-label { font-family: var(--font-family); letter-spacing: 0.08em; }
    :host([data-look="plain"]) .chip {
      font-family: var(--font-family);
      font-weight: 500;
      padding: 8px 0 10px;
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      background: none;
      box-shadow: none;
      color: var(--text-muted);
    }
    :host([data-look="plain"]) .chip:hover { color: var(--text-main); }
    :host([data-look="plain"]) .chip[aria-pressed="true"] { background: none; color: var(--text-main); border-bottom-color: var(--primary-color); box-shadow: none; }
    :host([data-look="plain"]) .chip:active { transform: none; }
    :host([data-look="plain"]) .chip-clear { color: var(--primary-text); text-decoration: underline; }
    :host([data-look="plain"]) .section-title, :host([data-look="plain"]) .collection-title { font-weight: 600; }
    :host([data-look="plain"]) .sort-select { box-shadow: none; border-width: 1px; border-radius: 6px; font-family: var(--font-family); font-weight: 500; }
    :host([data-look="plain"]) .card, :host([data-look="plain"]) .tile {
      border-width: 1px;
      border-radius: 10px;
      box-shadow: var(--raise-rest, none);
      animation: none;
    }
    :host([data-look="plain"]) .tile:hover { transform: translateY(-1px); box-shadow: var(--raise-hover, none); }
    :host([data-look="plain"]) .tile:active { transform: none; }
    :host([data-look="plain"]) .cover { border-bottom-width: 1px; }
    :host([data-look="plain"]) .cover-icon { box-shadow: none; border-radius: 8px; }
    :host([data-look="plain"]) .badge {
      font-family: var(--font-family);
      font-variant-caps: all-small-caps;
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      padding: 0 6px;
      border-radius: 4px;
      background: none;
      border: 1px solid currentColor;
    }
    :host([data-look="plain"]) .on-shelf-badge { border-radius: 6px; }
    :host([data-look="plain"]) .sheet-panel { border-width: 1px; border-radius: 12px; box-shadow: var(--shadow-lg); animation-timing-function: ease-out; }
    :host([data-look="plain"]) .sheet-close { box-shadow: none; border-width: 1px; }
    :host([data-look="plain"]) .sheet-title { font-weight: 600; }
    :host([data-look="plain"]) .shots img, :host([data-look="plain"]) .detail-clip { border-width: 1px; border-radius: 6px; }
    :host([data-look="plain"]) .meta-list { background: none; border-top: 1px solid var(--rule-soft, var(--border-color)); border-radius: 0; padding: var(--space-4) 0 0; }
    :host([data-look="plain"]) .empty-state, :host([data-look="plain"]) .no-match { border-style: solid; border-width: 1px; }
    :host([data-look="plain"]) .empty-state h3 { font-family: var(--font-heading); font-weight: 600; font-size: var(--fs-h3); color: var(--text-main); }
    @media (max-width: 600px) {
      :host([data-look="plain"]) .sheet-panel { border-radius: 12px 12px 0 0; }
    }
  `];

  static properties = {
    profileId: { type: String },
    _entries: { type: Array, state: true },
    _enrolledIds: { type: Object, state: true },
    _loading: { type: Boolean, state: true },
    _busyBundleId: { type: String, state: true },
    _openId: { type: String, state: true },
    _intros: { type: Object, state: true },
    _filters: { type: Object, state: true },
    _sort: { type: String, state: true },
    _detail: { type: Object, state: true },
    _fromCache: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.profileId = '';
    this._entries = [];
    this._enrolledIds = new Set();
    this._loading = true;
    this._busyBundleId = null;
    this._openId = null;
    this._intros = {};
    this._filters = {};
    this._sort = 'title';
    this._detail = null;
    this._fromCache = false;
    this._catalog = null;
    this._opener = null;
    // Once a parent has held the gate once during this visit, later adds
    // skip the modal - matches the doc's own "skip on subsequent adds this
    // visit" spec.
    this._gateUnlockedThisVisit = false;
  }

  async firstUpdated() {
    await this._load();
  }

  updated() {
    const dlg = this.renderRoot?.querySelector('dialog.sheet');
    if (dlg && !dlg.open) {
      try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
      dlg.querySelector('.sheet-close')?.focus();
    }
  }

  async _load() {
    this._loading = true;
    let entries = [];
    // Catalog first; DEFAULT_SHOWCASE_SOURCES is the fallback.
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

    if (this.profileId) {
      try {
        const enrollments = await ProgressStore.listEnrollments(this.profileId);
        this._enrolledIds = new Set(enrollments.map((e) => e.courseId));
      } catch { /* best-effort */ }
    }
    this._loading = false;
  }

  /** A showcase asset URL (cover, screenshot, intro) is relative to the manifest; only http(s) results are ever used. */
  _asset(entry, rel) {
    if (!rel || typeof rel !== 'string') return null;
    try {
      const u = new URL(rel, entry.manifestUrl);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch { return null; }
  }

  /** Opens/closes the detail state for one entry (meta, showcase, shots, clip, intro). */
  async _toggleDetails(entry, opener) {
    if (this._openId === entry.bundleId) { this._closeDetails(); return; }
    this._opener = opener || this.renderRoot?.activeElement || null;
    this._openId = entry.bundleId;
    this._detail = null;
    const detail = await loadDetail(entry);
    if (this._openId === entry.bundleId) this._detail = detail;
  }

  _closeDetails() {
    this._openId = null;
    this._detail = null;
    const back = this._opener;
    this._opener = null;
    if (back && back.isConnected) this.updateComplete.then(() => back.focus?.());
  }

  _setFilter(key, value) {
    const next = { ...this._filters };
    if (next[key] === value || value === '') delete next[key]; else next[key] = value;
    this._filters = next;
  }

  /** Entries after filters and sort. */
  get _visible() { return sortEntries(filterEntries(this._entries, this._filters), this._sort); }

  getSubjectIcon(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return '🌿';
    if (sub.includes('phys')) return '⚛️';
    if (sub.includes('chem')) return '🧪';
    if (sub.includes('math')) return '📐';
    return '📖';
  }

  getSubjectClass(subject) {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('bio')) return 'biology';
    if (sub.includes('phys')) return 'physics';
    if (sub.includes('chem')) return 'chemistry';
    if (sub.includes('math')) return 'math';
    return '';
  }

  async _handleAdd(entry) {
    if (!this.profileId || this._busyBundleId) return;
    if (!this._gateUnlockedThisVisit) {
      const unlocked = await showParentalGateHold(
        t('discover.gate_prompt', 'Add "{title}" to this student\'s shelf?', { title: this._title(entry) }),
      );
      if (!unlocked) return;
      this._gateUnlockedThisVisit = true;
    }
    this._busyBundleId = entry.bundleId;
    try {
      // addSource relocates when the bundle is already added from another URL.
      const existing = (await CourseSourceManager.listSources()).find((r) => r.bundleId === entry.bundleId);
      if (!existing || existing.sourceUrl !== entry.manifestUrl) {
        await CourseSourceManager.addSource(entry.manifestUrl);
      }
      countInstall(entry.bundleId);
      // Discover intentionally enrolls only the active profile - a parent
      // adding via Parent Dashboard -> Course Sources still enrolls every
      // profile (see CourseSourcesPanel.js), a deliberate difference (a
      // sibling's Discover pick shouldn't clutter another child's shelf).
      await ProgressStore.enroll(this.profileId, entry.bundleId, { source: 'discover' });
      this._enrolledIds = new Set([...this._enrolledIds, entry.bundleId]);
    } catch (e) {
      console.error('[DiscoverView] could not add course:', e);
    } finally {
      this._busyBundleId = null;
    }
  }

  /* ---------- small view helpers ---------- */

  _title(entry) { return entry.manifest?.title?.en || entry.manifest?.title || entry.bundleId || entry.id; }

  _subject(entry) { return entry.meta?.subjects?.[0] || entry.manifest?.subject || ''; }

  _tagline(entry) {
    const s = entry.manifest?.showcase;
    const tag = s && typeof s === 'object' ? (s.tagline?.en || s.tagline) : '';
    return typeof tag === 'string' ? tag : '';
  }

  _kicker(entry) {
    const m = entry.meta || {};
    const subj = (m.subjects?.length ? m.subjects : [entry.manifest?.subject]).filter(Boolean).map(cap).join(', ');
    return [subj, gradeLabel(m.grade ?? entry.manifest?.grade)].filter(Boolean).join(' \u00b7 ');
  }

  /** Badges in a fixed order: curator label, needs-update / draft status, narrated. */
  _badges(entry) {
    const out = [];
    const lb = LABEL_BADGES[entry.label];
    if (lb) out.push({ kind: entry.label, text: t(lb[0], lb[1]), hint: t(lb[2], lb[3]) });
    const m = entry.manifest || {};
    if (needsNewerEngine(m)) out.push({ kind: 'update', text: t('course.needs_update_badge', 'Needs update'), hint: t('discover.badge.update_hint', 'Needs a newer version of CoAuthor') });
    else if (m.status === 'draft') out.push({ kind: 'draft', text: t('discover.badge.draft', 'Draft') });
    else if (m.status === 'partial') out.push({ kind: 'draft', text: t('discover.badge.partial', 'Partly ready') });
    if (entry.meta?.features?.narration) out.push({ kind: 'narrated', text: t('discover.feature.narration', 'Narrated') });
    return out;
  }

  _badgeIcon(kind) {
    if (kind === 'checked' || kind === 'core') return html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (kind === 'narrated') return html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    if (kind === 'update') return html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return '';
  }

  _renderBadges(entry) {
    const b = this._badges(entry);
    return b.length ? html`<ul class="badges">${b.map((x) => html`<li class="badge ${x.kind}" title=${x.hint || ''}>${this.look === 'plain' ? '' : this._badgeIcon(x.kind)}${x.text}</li>`)}</ul>` : '';
  }

  /** The cover: the showcase image when there is one, else a look cover (plain) or a subject banner (Quill). */
  _renderCover(entry, coverUrl) {
    const subject = this._subject(entry);
    const cover = coverUrl || this._asset(entry, (typeof entry.manifest?.showcase === 'object' && entry.manifest.showcase?.cover) || entry.manifest?.cover);
    // The generated cover always sits underneath, so an image that fails to load falls back to it.
    return html`<div class="cover ${this.getSubjectClass(subject)}">
      ${this.look === 'plain' ? html`<look-cover seed=${entry.bundleId} subject=${cap(subject)} heading=${this._title(entry)}></look-cover>` : ''}
      <span class="cover-icon" aria-hidden="true">${entry.manifest?.icon || this.getSubjectIcon(subject)}</span>
      ${cover ? html`<img src=${cover} alt="" loading="lazy" @error=${(e) => e.target.remove()}>` : ''}
    </div>`;
  }

  /** The add action, shared by the card and the sheet. */
  _renderAction(entry, size = 'btn-sm') {
    const m = entry.manifest || {};
    if (this._enrolledIds.has(entry.bundleId)) {
      return html`<span class="on-shelf-badge">\u2713 ${t('discover.on_shelf', 'On your shelf')}</span>`;
    }
    if (m.status === 'draft') {
      return html`<button class="btn-3d btn-primary ${size}" disabled>${t('discover.add', 'Add to my shelf')}</button><span class="not-reviewed">${t('discover.not_reviewed', 'Not reviewed yet')}</span>`;
    }
    const busy = this._busyBundleId === entry.bundleId;
    return html`<button class="btn-3d btn-primary ${size}" ?disabled=${busy} @click=${() => this._handleAdd(entry)}>
      ${busy ? t('discover.adding', 'Adding\u2026') : t('discover.add', 'Add to my shelf')}
    </button>`;
  }

  _renderCollections() {
    if (!this._catalog && !this._entries.some((e) => e.featured || e.addedAt || e.installs)) return '';
    // Catalog collections show with 1+ items. Derived ones (featured, new,
    // popular) only once there are 6+ courses, popular only with install
    // counts, and a row repeating an earlier row's set of courses is dropped.
    const own = new Set((this._catalog?.collections || []).map((c) => c.id));
    const enough = this._entries.length >= 6;
    const hasInstalls = this._entries.some((e) => e.installs > 0);
    const seen = new Set();
    const cols = buildCollections(this._entries, this._catalog).filter((c) => {
      if (!own.has(c.id) && (!enough || (c.id === 'popular' && !hasInstalls))) return false;
      const key = c.entries.map((e) => e.id).sort().join('\n');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const titles = { featured: t('discover.col.featured', 'Featured'), new: t('discover.col.new', 'New'), popular: t('discover.col.popular', 'Most popular') };
    return cols.length ? html`<div class="collections">${cols.map((c) => html`
      <section class="collection" data-collection=${c.id} aria-label=${titles[c.id] || c.title}>
        <h3 class="collection-title">${titles[c.id] || c.title}</h3>
        <ul class="collection-list">${c.entries.map((e) => {
          const line = this._tagline(e) || this._kicker(e);
          return html`<li>
            <button class="collection-item tile" @click=${(ev) => this._toggleDetails(e, ev.currentTarget)}>
              ${this._renderCover(e)}
              <span class="tile-body">
                <span class="tile-title">${this._title(e)}</span>
                ${line ? html`<span class="tile-line">${line}</span>` : ''}
                ${this._renderBadges(e)}
              </span>
            </button>
          </li>`;
        })}</ul>
      </section>`)}</div>` : '';
  }

  _facetLabel(key, v) {
    if (key === 'audience') { const a = AUDIENCE_LABELS[v]; return a ? t(a[0], a[1]) : cap(v); }
    if (key === 'grade') return gradeLabel(v);
    if (key === 'language') return languageName(v);
    if (key === 'feature') { const f = FEATURE_LABELS[v]; return f ? t(f[0], f[1]) : cap(v); }
    return cap(v);
  }

  _renderFilters() {
    const f = buildFacets(this._entries);
    const groups = [
      ['audience', t('discover.filter.audience', 'For')],
      ['subject', t('discover.filter.subject', 'Subject')],
      ['grade', t('discover.filter.grade', 'Grade')],
      ['feature', t('discover.filter.feature', 'Has')],
      ['language', t('discover.filter.language', 'Language')],
    ];
    const shown = groups.filter(([key]) => f[key].length > 1 || (f[key].length === 1 && this._filters[key]));
    const active = Object.keys(this._filters).length > 0;
    if (!shown.length && !active) return '';
    return html`<div class="filters" role="group" aria-label=${t('discover.filter.label', 'Filter courses')}>
      ${shown.map(([key, label]) => html`
        <div class="filter-group" data-filter=${key}><span class="filter-label">${label}</span>
          ${f[key].map((v) => html`<button class="chip" data-value=${v} aria-pressed=${this._filters[key] === v ? 'true' : 'false'} @click=${() => this._setFilter(key, v)}>${this._facetLabel(key, v)}</button>`)}
        </div>`)}
      ${active ? html`<div class="filter-group"><span class="filter-label"></span><button class="chip chip-clear" @click=${() => { this._filters = {}; }}>${t('discover.filter.clear', 'Clear filters')}</button></div>` : ''}
    </div>`;
  }

  _renderSort() {
    return html`<label class="filter-sort">${t('discover.sort', 'Sort')}
      <select class="sort-select" .value=${this._sort} @change=${(e) => { this._sort = e.target.value; }}>
        <option value="title" ?selected=${this._sort === 'title'}>${t('discover.sort.title', 'A to Z')}</option>
        <option value="new" ?selected=${this._sort === 'new'}>${t('discover.sort.new', 'Newest')}</option>
        <option value="popular" ?selected=${this._sort === 'popular'}>${t('discover.sort.popular', 'Most popular')}</option>
      </select></label>`;
  }

  /** The body of the detail sheet: description, screenshots, clip, intro and the metadata list. */
  _renderDetail(entry) {
    const d = this._detail;
    if (!d) return html`<div class="details" data-state="loading"><app-loader size="40" label=${t('discover.loading', 'Loading\u2026')}></app-loader></div>`;
    const m = d.meta || {};
    const meta = [];
    if (m.audience) meta.push([t('discover.meta.audience', 'For'), this._facetLabel('audience', m.audience)]);
    if (m.subjects?.length) meta.push([t('discover.meta.subjects', 'Subjects'), m.subjects.map(cap).join(', ')]);
    if (m.grade != null) meta.push([t('discover.meta.grade', 'Grade'), gradeLabel(m.grade, '').trim() || String(m.grade)]);
    if (m.languages?.length) meta.push([t('discover.meta.languages', 'Languages'), m.languages.map(languageName).join(', ')]);
    const feats = Object.keys(m.features || {}).filter((k) => m.features[k]).map((k) => this._facetLabel('feature', k));
    if (feats.length) meta.push([t('discover.meta.features', 'Includes'), feats.join(', ')]);
    if (m.estHours != null) meta.push([t('discover.meta.hours', 'Time'), t('discover.meta.hours_value', 'About {n} hours', { n: m.estHours })]);
    if (m.authors?.length) meta.push([t('discover.meta.authors', 'By'), m.authors.map((a) => a.name).join(', ')]);
    meta.push([t('discover.meta.license', 'Licence'), m.license || t('discover.meta.not_stated', 'Not stated')]);
    const repo = m.repository?.url && /^https?:/i.test(m.repository.url) ? m.repository.url : '';
    let sourceText = repo || entry.manifestUrl;
    try { const u = new URL(sourceText); sourceText = u.host + u.pathname.replace(/\/(manifest\.json)?$/, ''); } catch { /* keep raw */ }
    meta.push([t('discover.meta.source', 'Source'), repo ? html`<a href=${repo} target="_blank" rel="noopener noreferrer">${sourceText}</a>` : sourceText]);
    return html`<div class="details" data-state="open">
      ${d.description ? html`<p class="detail-description">${d.description}</p>` : ''}
      ${d.shots.length ? html`<section><h3>${t('discover.screenshots', 'Inside the course')}</h3><div class="shots">${d.shots.map((sh) => html`<figure><img src=${sh.url} alt=${sh.caption || ''} loading="lazy">${sh.caption ? html`<figcaption>${sh.caption}</figcaption>` : ''}</figure>`)}</div></section>` : ''}
      ${d.clip ? html`<section><h3>${t('discover.clip', 'Watch')}</h3><video class="detail-clip" src=${d.clip} muted loop playsinline controls preload="none"></video></section>` : ''}
      ${d.intro ? html`<section><h3>${t('discover.about', 'About this course')}</h3><markdown-renderer .content=${d.intro}></markdown-renderer></section>` : ''}
      <section><h3>${t('discover.details', 'Details')}</h3>
        <dl class="meta-list">${meta.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
      </section>
    </div>`;
  }

  _renderSheet() {
    const entry = this._openId && this._entries.find((e) => e.bundleId === this._openId);
    if (!entry) return '';
    const d = this._detail;
    const tagline = d?.tagline || this._tagline(entry);
    const kicker = this._kicker(entry);
    const close = () => this._closeDetails();
    return html`<dialog class="sheet" aria-labelledby="sheet-title"
        @cancel=${(e) => { e.preventDefault(); close(); }}>
      <div class="scrim" @click=${close}></div>
      <article class="sheet-panel">
        <button class="sheet-close" aria-label=${t('discover.close', 'Close')} @click=${close}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
        </button>
        <div class="sheet-hero">${this._renderCover(entry, d?.cover)}</div>
        <div class="sheet-body">
          <header class="sheet-head">
            ${kicker ? html`<div class="card-type">${kicker}</div>` : ''}
            <h2 class="sheet-title" id="sheet-title">${this._title(entry)}</h2>
            ${tagline ? html`<p class="sheet-tagline">${tagline}</p>` : ''}
            ${this._renderBadges(entry)}
          </header>
          <div class="sheet-action">
            ${this._renderAction(entry, 'btn-lg')}
            ${this._enrolledIds.has(entry.bundleId) || entry.manifest?.status === 'draft' ? '' : html`<span class="hint">${t('discover.needs_parent', 'A parent holds the button to confirm.')}</span>`}
          </div>
          ${this._renderDetail(entry)}
        </div>
      </article>
    </dialog>`;
  }

  render() {
    if (this._loading) return html`<app-loader label=${t('discover.loading', 'Loading\u2026')}></app-loader>`;

    const head = (sub) => html`<header class="page-head">
      <p class="page-kicker">${t('discover.kicker', 'Course shop')}</p>
      <h2 class="page-title">${t('discover.title', 'Discover')}</h2>
      <p class="page-subtitle">${sub}</p>
      ${this._fromCache ? html`<p class="catalog-offline">${t('discover.offline', 'Showing the last saved list (offline).')}</p>` : ''}
    </header>`;

    if (!this._entries.length) {
      return html`
        ${head(t('discover.subtitle_empty', 'Browse courses your family hasn\'t added yet.'))}
        <div class="empty-state">
          <h3>${t('discover.empty_title', 'Nothing to browse yet')}</h3>
          <p>${t('discover.empty_body', 'No showcase courses are configured on this device yet. Ask a parent to add courses directly from Parent Dashboard \u2192 Course Content Sources.')}</p>
        </div>
      `;
    }

    const visible = this._visible;
    const filtering = Object.keys(this._filters).length > 0;
    return html`
      ${head(t('discover.subtitle', 'Find a new course for your shelf. Adding one needs a parent.'))}
      ${this._renderFilters()}
      ${filtering ? '' : this._renderCollections()}
      <section class="all">
        <div class="section-head">
          <h3 class="section-title">${filtering ? t('discover.matches', 'Matching courses') : t('discover.all', 'All courses')}<span class="count">${visible.length}</span></h3>
          ${visible.length > 1 ? this._renderSort() : ''}
        </div>
        ${visible.length ? html`<div class="grid">
          ${visible.map((entry, i) => {
            const manifest = entry.manifest;
            const tagline = this._tagline(entry);
            const description = entry.meta?.description || (typeof manifest.description === 'string' ? manifest.description : manifest.description?.en) || '';
            const open = this._openId === entry.bundleId;
            const kicker = this._kicker(entry) || t('discover.course', 'Course');
            return html`
              <article class="card" style="animation-delay: ${Math.min(i, 8) * 40}ms">
                <button class="cover-btn" tabindex="-1" aria-hidden="true" @click=${(ev) => this._toggleDetails(entry, ev.currentTarget)}>${this._renderCover(entry)}</button>
                <div class="card-body">
                  <div class="card-type">${kicker}</div>
                  <h3>${this._title(entry)}</h3>
                  ${tagline ? html`<p class="tagline">${tagline}</p>` : ''}
                  ${description ? html`<p class="card-desc">${description}</p>` : ''}
                  ${this._renderBadges(entry)}
                  <div class="card-footer">
                    <div class="footer-row">
                      ${this._renderAction(entry)}
                      <button class="btn-3d btn-secondary btn-sm" aria-expanded=${open ? 'true' : 'false'} aria-haspopup="dialog" @click=${(ev) => this._toggleDetails(entry, ev.currentTarget)}>${t('discover.more', 'Details')}</button>
                    </div>
                  </div>
                </div>
              </article>
            `;
          })}
        </div>` : html`<div class="no-match"><p>${t('discover.no_match', 'No course matches these filters.')}</p>
          <button class="chip chip-clear" @click=${() => { this._filters = {}; }}>${t('discover.filter.clear', 'Clear filters')}</button></div>`}
      </section>
      ${this._renderSheet()}
    `;
  }
}

customElements.define('discover-view', DiscoverView);
