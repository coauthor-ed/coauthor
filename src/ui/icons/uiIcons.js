import { html, svg } from 'lit';

/**
 * Inline SVG icons for the lesson-mode polish (docs/sprints/wip/lesson-modes-plan.md):
 * the mode and theme toggles, lesson-row status, stars, streak flame. Same
 * conventions as navIcons.js: a 24-unit viewBox, currentColor only (no colour
 * literals, invariant 9), aria-hidden (the owning control carries the label).
 * They replace emoji/text glyphs (🔥 ★ ☆ ✓), which render inconsistently on
 * low-end Android and Windows and can't take a theme colour.
 */

/** Closed book: Classic mode is showing (tap to open the story). */
export const iconBookClosed = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"></path>
    <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"></path>
    <path d="M9 7.5h6"></path>
  </svg>
`;

/** Open book: Story mode is showing (tap to close it back to Classic). */
export const iconBookOpen = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 6.5C10.2 5 7.5 4.5 3 4.8v13.4c4.5-.3 7.2.2 9 1.8"></path>
    <path d="M12 6.5c1.8-1.5 4.5-2 9-1.7v13.4c-4.5-.3-7.2.2-9 1.8z"></path>
    <path d="M12 6.5V20"></path>
    <path d="M6 9c1.3 0 2.5.2 3.5.6M6 12.2c1.3 0 2.5.2 3.5.6" stroke-width="1.8"></path>
  </svg>
`;

export const iconSun = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5"></circle>
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"></path>
  </svg>
`;

export const iconMoon = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path>
  </svg>
`;

export const iconCheck = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9.5 16.5 4 11"></polyline>
  </svg>
`;

const STAR_PATH = 'M12 2.8l2.75 5.6 6.15.9-4.45 4.35 1.05 6.1L12 16.85 6.5 19.75l1.05-6.1L3.1 9.3l6.15-.9z';

/** A star; `filled` false draws the outline used for unearned stars. */
export const iconStar = (filled) => html`
  <svg width="16" height="16" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="${STAR_PATH}"></path>
  </svg>
`;

/** Streak flame (replaces the 🔥 emoji). Two layers so the inner tongue reads
 *  at 16px; the inner one is cut out with fill-opacity, not a second colour. */
export const iconFlame = html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.5 2c.6 3.2-1.2 5-2.8 6.7C8.2 10.3 6.5 12 6.5 15a5.5 5.5 0 0 0 11 0c0-2.2-1-3.8-2-5 .1 1.6-.5 2.8-1.6 3.3.6-3.6-.2-8.4-1.4-11.3z"></path>
    <path d="M12 21a2.6 2.6 0 0 1-2.6-2.6c0-1.6 1.3-2.4 2-3.6.4 1 1.4 1.4 2.1 2.4.6.8.9 1.4.9 2A2.6 2.6 0 0 1 12 21z" fill-opacity="0.45"></path>
  </svg>
`;

export const iconBolt = html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13.5 2 4.5 13.5H11L10 22l9.5-12H13z"></path>
  </svg>
`;

export const iconHeart = html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8 2.6c0 5.9-8 10.6-8 10.6z"></path>
  </svg>
`;

export const iconArrowRight = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
`;

export const iconArrowLeft = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
`;

/** Magnifier: the Discover link (replaces the 🔎 emoji). */
export const iconSearch = html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5"></circle>
    <line x1="15.5" y1="15.5" x2="21" y2="21"></line>
  </svg>
`;

/* Subject glyphs for course banners (replace the subject emoji). Drawn at
   48px on a coloured banner, stroke in currentColor. */
const subjectSvg = (body) => html`
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>
`;
export const subjectIcons = {
  science: subjectSvg(svg`<path d="M9 3h6M10 3v6.2L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9.2V3"></path><path d="M7.2 14.5h9.6"></path><circle cx="10.5" cy="17.5" r="0.9" fill="currentColor"></circle><circle cx="14" cy="16.6" r="0.6" fill="currentColor"></circle>`),
  physics: subjectSvg(svg`<circle cx="12" cy="12" r="1.6" fill="currentColor"></circle><ellipse cx="12" cy="12" rx="9.5" ry="3.8"></ellipse><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"></ellipse><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"></ellipse>`),
  chemistry: subjectSvg(svg`<circle cx="7" cy="7" r="2.6"></circle><circle cx="17" cy="9" r="2.6"></circle><circle cx="10" cy="17" r="2.6"></circle><path d="M9.5 7.6l5 .9M8 9.3l1.3 5.3M15.5 11.1l-3.6 4.3"></path>`),
  biology: subjectSvg(svg`<path d="M20 4C11 4 5 8.5 5 15c0 2.2.9 3.8 2 5 1.2-5.2 4.6-8.8 9-11-4 3-6.6 6.8-7.4 11.3C9.8 20.7 11 21 12.3 21 18 21 20 15 20 4z"></path>`),
  math: subjectSvg(svg`<path d="M4 20L20 4"></path><path d="M5 5h5M7.5 2.5v5"></path><path d="M14 17.5h6"></path><circle cx="17" cy="14.5" r="0.7" fill="currentColor"></circle><circle cx="17" cy="20.5" r="0.7" fill="currentColor"></circle>`),
  default: subjectSvg(svg`<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5z"></path><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"></path>`),
  test: subjectSvg(svg`<rect x="5" y="3.5" width="14" height="17" rx="2"></rect><path d="M9 3.5V6h6V3.5"></path><path d="M8.5 11l1.5 1.5 3-3M8.5 16.5h7"></path>`),
  target: subjectSvg(svg`<circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="4.5"></circle><circle cx="12" cy="12" r="1" fill="currentColor"></circle>`),
};

/* Parent area (student menu + parent portal). Same conventions as above. */
const uiSvg = (body, size = 20, sw = 2.2) => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>
`;

/** Grown-up and child, side by side: the student menu's "Parent area". */
export const iconParent = uiSvg(svg`
  <circle cx="8.5" cy="6.6" r="2.9"></circle>
  <path d="M3.2 20.5v-2.7a5.3 5.3 0 0 1 9.3-3.5"></path>
  <circle cx="17" cy="10.6" r="2.2"></circle>
  <path d="M13.2 20.5v-1.4a3.8 3.8 0 0 1 7.6 0v1.4"></path>
`);

export const iconLock = uiSvg(svg`
  <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"></rect>
  <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path>
  <circle cx="12" cy="15.6" r="1.1" fill="currentColor" stroke="none"></circle>
`, 18);

export const iconUnlock = uiSvg(svg`
  <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"></rect>
  <path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"></path>
  <circle cx="12" cy="15.6" r="1.1" fill="currentColor" stroke="none"></circle>
`, 18);

export const iconPrint = uiSvg(svg`
  <path d="M7 8.5V3.5h10v5"></path>
  <rect x="3.5" y="8.5" width="17" height="8" rx="2"></rect>
  <path d="M7 14h10v6.5H7z"></path>
`, 18);

export const iconChevronDown = uiSvg(svg`<polyline points="6 9.5 12 15.5 18 9.5"></polyline>`, 16, 2.5);
export const iconChevronRight = uiSvg(svg`<polyline points="9.5 6 15.5 12 9.5 18"></polyline>`, 18, 2.5);

export const iconPlus = uiSvg(svg`<path d="M12 5v14M5 12h14"></path>`, 18, 2.5);

export const iconTrash = uiSvg(svg`
  <path d="M4.5 7h15"></path>
  <path d="M9.5 7V4.5h5V7"></path>
  <path d="M6.5 7l1 13h9l1-13"></path>
`, 18);

export const iconClock = uiSvg(svg`<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>`, 18);

/** Open book with a tick: a finished lesson. */
export const iconLessonDone = uiSvg(svg`
  <path d="M12 6.5C10.2 5 7.5 4.5 3 4.8v13.4c4.5-.3 7.2.2 9 1.8 1.8-1.6 4.5-2.1 9-1.8V4.8c-4.5-.3-7.2.2-9 1.7z"></path>
  <polyline points="9 12.5 11.2 14.7 15.2 10.4"></polyline>
`, 18);

export const iconClipboard = uiSvg(svg`
  <rect x="5" y="3.5" width="14" height="17" rx="2"></rect>
  <path d="M9 3.5V6h6V3.5"></path>
  <path d="M8.5 11l1.5 1.5 3-3M8.5 16.5h7"></path>
`, 18);

/** Globe: remote course sources. */
export const iconGlobe = uiSvg(svg`
  <circle cx="12" cy="12" r="8.5"></circle>
  <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z"></path>
`, 18);

/** Box with an arrow out of it: backup and restore. */
export const iconBackup = uiSvg(svg`
  <path d="M4 13.5v5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-5"></path>
  <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"></path>
`, 18);

export const iconDownload = uiSvg(svg`
  <path d="M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3"></path>
  <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"></path>
`, 18);

export const iconUpload = uiSvg(svg`
  <path d="M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3"></path>
  <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"></path>
`, 18);

/** Sliders: settings. */
export const iconSliders = uiSvg(svg`
  <path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path>
  <circle cx="15" cy="7" r="2.2"></circle>
  <circle cx="9" cy="17" r="2.2"></circle>
`, 18);

export const iconClose = uiSvg(svg`<path d="M6 6l12 12M18 6 6 18"></path>`, 18, 2.5);

export const iconInfo = uiSvg(svg`<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5.5"></path><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"></circle>`, 18);

/** Rising bars: the parent portal's Progress tab. */
export const iconChart = uiSvg(svg`<path d="M4 20.5h16"></path><path d="M7 16.5v-4M12 16.5V8M17 16.5V4.5"></path>`, 18, 2.5);

/** Four squares: an overview / at-a-glance page. */
export const iconGrid = uiSvg(svg`<rect x="4" y="4" width="7" height="7" rx="2"></rect><rect x="13" y="4" width="7" height="7" rx="2"></rect><rect x="4" y="13" width="7" height="7" rx="2"></rect><rect x="13" y="13" width="7" height="7" rx="2"></rect>`, 18);

/* Landing page and guides (docs/sprints/completed/landing-page-and-guides.md).
   Same conventions; they replace the POC's emoji icons. */

/** Compass: the explorers' track. */
export const iconCompass = uiSvg(svg`<circle cx="12" cy="12" r="8.5"></circle><path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z"></path><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"></circle>`);

/** Gamepad: the arcade. */
export const iconGamepad = uiSvg(svg`<path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.4 5.4l-.7 3.5a2.4 2.4 0 0 1-4.1 1.2L14.3 16H9.7l-1.8 1.6a2.4 2.4 0 0 1-4.1-1.2l-.7-3.5a4.5 4.5 0 0 1 4.4-5.4z"></path><path d="M8 10.5v3M6.5 12h3"></path><circle cx="15.5" cy="11" r="0.9" fill="currentColor" stroke="none"></circle><circle cx="17" cy="13" r="0.9" fill="currentColor" stroke="none"></circle>`);

/** Fork: copy a course, change it, share it back. */
export const iconFork = uiSvg(svg`<circle cx="6.5" cy="5" r="2"></circle><circle cx="17.5" cy="5" r="2"></circle><circle cx="12" cy="19" r="2"></circle><path d="M6.5 7v1.5a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V7"></path><path d="M12 11.5V17"></path>`);

/** House inside a shield: private by design. */
export const iconShieldHome = uiSvg(svg`<path d="M12 2.8l7.5 3v5.6c0 4.6-3.1 8.3-7.5 9.8-4.4-1.5-7.5-5.2-7.5-9.8V5.8z"></path><path d="M8.6 12.2L12 9.4l3.4 2.8V16H8.6z"></path>`);

/** Open book with a ribbon: a guide. */
export const iconGuide = uiSvg(svg`<path d="M12 6.5C10.2 5 7.5 4.5 3 4.8v13.4c4.5-.3 7.2.2 9 1.8"></path><path d="M12 6.5c1.8-1.5 4.5-2 9-1.7v13.4c-4.5-.3-7.2.2-9 1.8z"></path><path d="M12 6.5V20"></path><path d="M16 5v5l1.5-1.2L19 10V4.9"></path>`);

/** Arched door: the three doorways. */
export const iconDoor = uiSvg(svg`<path d="M5.5 21V10a6.5 6.5 0 0 1 13 0v11"></path><path d="M3.5 21h17"></path><circle cx="15" cy="14.5" r="0.9" fill="currentColor" stroke="none"></circle>`);

/** Pen nib: the grown-ups' (authors') track. */
export const iconNib = uiSvg(svg`<path d="M12 3l5.5 7.5L12 21l-5.5-10.5z"></path><path d="M12 12.5V21"></path><circle cx="12" cy="11.2" r="1.3"></circle>`);

/** A fraction over a root sign: maths. */
export const iconMath = uiSvg(svg`<path d="M5 12h7"></path><path d="M8.5 4.5v4"></path><path d="M6.5 6.5h4"></path><path d="M6 15.5l2.5 4 4-12h7"></path><path d="M14.5 13.5l4 5M18.5 13.5l-4 5"></path>`);

/** A question mark in a circle: "how does this work?" links to a guide. */
export const iconHelp = uiSvg(svg`<circle cx="12" cy="12" r="8.5"></circle><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7"></path><circle cx="12" cy="16.9" r="1" fill="currentColor" stroke="none"></circle>`, 18);

/** Two stacked sheets: copy. */
export const iconCopy = uiSvg(svg`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"></rect><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"></path>`, 18);

/** A small list with a heading: "On this page". */
export const iconToc = uiSvg(svg`<path d="M4 6h16"></path><path d="M7 11h13M7 16h13M7 21h9" opacity="0.7"></path>`, 18);

/* A small pennant: "flag this slide" (lesson) and the feedback outbox. */
export const iconFlag = uiSvg(svg`<path d="M5.5 21V4"></path><path d="M5.5 4.5h11.2l-2.4 4 2.4 4H5.5"></path>`, 18);
export const iconSend = uiSvg(svg`<path d="M20.5 3.5 10 14"></path><path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4z"></path>`, 18);
export const iconMail = uiSvg(svg`<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="M4 7l8 6 8-6"></path>`, 18);

/* Share (Q-52): three linked dots; and a small QR-like grid for "show QR". */
/** Q-66: the theme follows the device (half light, half dark). */
export const iconThemeDevice = uiSvg(svg`<circle cx="12" cy="12" r="8.5"></circle><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"></path>`, 20);
export const iconShare = uiSvg(svg`<circle cx="18" cy="5.5" r="2.6"></circle><circle cx="6" cy="12" r="2.6"></circle><circle cx="18" cy="18.5" r="2.6"></circle><path d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1"></path>`, 18);
export const iconPhoneDown = uiSvg(svg`<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"></rect><path d="M12 7.5v7M9.2 11.8 12 14.6l2.8-2.8"></path>`, 18);
