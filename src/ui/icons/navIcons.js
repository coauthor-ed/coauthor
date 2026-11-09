import { html } from 'lit';

/**
 * Inline SVG nav icons shared between AppShell.js (the merged header bar,
 * used by both LessonSession's and TestSession's navigation controls) and
 * LessonSession.js (its own mobile-landscape compact control strip, which
 * draws the same Back/Previous/Next/Autoplay meanings at a different moment
 * — see the short-landscape media query there). Pulled out to one module
 * instead of being duplicated in both places.
 */

/** Arrow-left — "go back" (to the module path, or to home if there's no
 *  module context). Distinct from iconHome: the two can appear side by side
 *  (a lesson's own Back button and the header's unrelated Home link), so
 *  they need to read differently even icon-only. */
export const iconBack = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
`;

/** House — the dashboard/home link, always present in the header regardless
 *  of lesson state. */
export const iconHome = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3.5 10.5 12 3l8.5 7.5"></path>
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5"></path>
  </svg>
`;

export const iconPrev = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
`;

export const iconNext = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
`;

/** Checkmark — "submit" (TestSession's merged header control, shown instead
 *  of iconNext once the student reaches the last question of a test). */
export const iconSubmit = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

export const iconAutoplay = (isPlaying) => html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="${isPlaying ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z'}"></path>
  </svg>
`;

/** Person silhouette — profile-switcher's icon-only fallback, for when the
 *  student's name is hidden (mobile portrait, or a name too wide to keep on
 *  one row — see ProfileSwitcher.js). */
export const iconProfile = html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4"></circle>
    <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"></path>
  </svg>
`;

/** Sun-with-rays — a generic "theme" glyph, not a live sun/moon toggle (that
 *  would need AppShell to track the current theme reactively; out of scope
 *  for just replacing the "Theme" label with an icon). */
export const iconTheme = html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
`;
