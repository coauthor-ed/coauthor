import { html, svg } from 'lit';

/**
 * Inline SVG art for <landing-view>. Every fill and stroke is a class whose
 * colour comes from a --landing-* token (landingStyles.js), so both themes
 * repaint without touching the markup.
 */

// Seeded so the star field is identical on every visit (and in screenshots).
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** One <path> for a whole star field: never hundreds of DOM nodes. */
function starPath(seed, n, w, h) {
  const rnd = seeded(seed);
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = (rnd() * w).toFixed(1);
    const y = (rnd() * h).toFixed(1);
    const big = rnd() > 0.88;
    const r = (big ? 1.6 + rnd() * 0.9 : 0.6 + rnd() * 0.8).toFixed(2);
    d += `M${x} ${y}m-${r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0`;
  }
  return d;
}

export const HERO_STARS = starPath(7, 170, 1440, 640);
export const ROUTE_STARS = starPath(31, 220, 1440, 2400);
export const DAWN_STARS = starPath(53, 120, 1440, 520);
export const BAND_STARS = starPath(71, 110, 1440, 360);
const SPARKLE = 'M0 -7L1.6 -1.6 7 0 1.6 1.6 0 7 -1.6 1.6 -7 0 -1.6 -1.6Z';
export const sparkle = (cls = '') => svg`<path class="${cls}" d="${SPARKLE}"></path>`;

// x, y, scale, delay (s) for the hero's few twinkling stars.
const TWINKLES = [[310, 96, 1, 0], [520, 40, 0.8, 1.3], [1030, 150, 1.1, 2.4], [1352, 92, 0.9, 0.7], [180, 300, 0.7, 3.1], [1220, 330, 0.8, 1.9]];

function skyDefs() {
  return svg`
    <defs>
      <linearGradient id="lv-aur1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="s-a1" stop-opacity="0"></stop>
        <stop offset="0.5" class="s-a1" stop-opacity="0.55"></stop>
        <stop offset="1" class="s-a2" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="lv-aur2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="s-a3" stop-opacity="0"></stop>
        <stop offset="0.45" class="s-a3" stop-opacity="0.42"></stop>
        <stop offset="1" class="s-a2" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="lv-comet" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" class="s-star" stop-opacity="1"></stop>
        <stop offset="1" class="s-star" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="lv-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="s-sea"></stop>
        <stop offset="1" class="s-sea-deep"></stop>
      </linearGradient>
      <linearGradient id="lv-face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="s-floe-shade"></stop>
        <stop offset="0.38" class="s-berg"></stop>
        <stop offset="1" class="s-sea-deep"></stop>
      </linearGradient>
      <clipPath id="lv-pa"><circle cx="150" cy="170" r="92"></circle></clipPath>
      <clipPath id="lv-pb"><circle cx="1262" cy="252" r="38"></circle></clipPath>
    </defs>`;
}

/** Far layer: aurora, stars, twinkles, the odd comet. */
export function heroSkyFar() {
  return html`
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
      ${skyDefs()}
      <g class="aurora amb">
        <path fill="url(#lv-aur2)" d="M-160 160C200 56 520 230 830 110S1270 24 1600 130L1600 340C1250 230 990 360 760 270S190 260 -160 360Z"></path>
        <path fill="url(#lv-aur1)" d="M-160 260C180 130 380 290 640 196S1100 86 1600 222L1600 500C1200 352 980 490 640 400S160 370 -160 480Z"></path>
      </g>
      <path class="stars" d="${HERO_STARS}"></path>
      ${TWINKLES.map(([x, y, s, d]) => svg`
        <g transform="translate(${x} ${y}) scale(${s})"><path class="tw amb" style="animation-delay:${d}s" d="${SPARKLE}"></path></g>`)}
      <g transform="translate(1180 60)"><g class="comet amb">
        <path d="M0 0L150 -78" stroke="url(#lv-comet)" stroke-width="3.5" stroke-linecap="round"></path>
        <circle r="3.6" class="stars"></circle>
      </g></g>
    </svg>`;
}

/** Middle layer: a ringed planet top left, a blue one top right, a moon.
 *  The moon is an easter egg: tapping it sends it round the planet
 *  (heroQuill.js), so it carries a wider, invisible hit circle. */
export function heroPlanets(onMoon) {
  return html`
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
      <g class="planet-big" transform="translate(196 226) scale(0.82) translate(-150 -170)">
        <path class="ring" d="M-10 170A160 36 0 0 1 310 170" transform="rotate(-16 150 170)"></path>
        <g clip-path="url(#lv-pa)">
          <circle cx="150" cy="170" r="92" class="planet-a"></circle>
          <path class="planet-a-band" d="M40 140C110 128 190 132 262 150L262 166C190 150 110 148 40 158Z"></path>
          <path class="planet-a-band" d="M40 196C120 186 200 190 262 204L262 214C200 202 120 200 40 208Z"></path>
          <path class="planet-a-shade" fill-rule="evenodd" d="M40 60H270V280H40ZM290 132a106 106 0 1 0 -212 0a106 106 0 1 0 212 0Z"></path>
        </g>
        <path class="rim" d="M134 82A88 88 0 0 1 237 186"></path>
        <path class="ring" d="M-10 170A160 36 0 0 0 310 170" transform="rotate(-16 150 170)"></path>
      </g>
      <g transform="translate(-6 40)">
        <g clip-path="url(#lv-pb)">
          <circle cx="1262" cy="252" r="38" class="planet-b"></circle>
          <circle cx="1250" cy="240" r="7" class="planet-b-shade"></circle>
          <circle cx="1276" cy="262" r="4.5" class="planet-b-shade"></circle>
          <path class="planet-b-shade" fill-rule="evenodd" d="M1220 210H1305V295H1220ZM1290 236a44 44 0 1 0 -88 0a44 44 0 1 0 88 0Z"></path>
        </g>
        <path class="rim" d="M1262 218A34 34 0 0 1 1296 252" style="stroke-width:3"></path>
        <g class="moon-hit" @click=${onMoon}><circle cx="1322" cy="204" r="26" class="hit"></circle><circle cx="1322" cy="204" r="8" class="moon"></circle></g>
      </g>
      <circle cx="1120" cy="120" r="13" class="planet-c"></circle>
      <path class="planet-c-shade" d="M1108 125a13 13 0 0 0 23 5a15 15 0 0 1 -23 -5Z"></path>
    </svg>`;
}

/** Near-far layer: icebergs on the horizon and the sea. */
export function heroBergs() {
  return html`
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
      <g class="far-opt">
        <path class="berg" d="M-20 640L36 590 78 598 118 558 196 640Z"></path>
        <path class="berg-lit" d="M118 558L96 640H60L78 598Z"></path>
      </g>
      <path class="berg" d="M262 640L332 604 378 610 424 640Z"></path>
      <path class="berg" d="M760 640L826 576 876 548 922 566 982 536 1054 640Z"></path>
      <path class="berg-lit" d="M876 548L850 640H810L826 576Z"></path>
      <path class="berg-lit" d="M982 536L964 640H932L922 566Z"></path>
      <g class="far-opt"><path class="berg" d="M1190 640L1236 610 1290 618 1340 640Z"></path></g>
      <rect x="-40" y="638" width="1520" height="300" fill="url(#lv-sea)"></rect>
      <rect x="-40" y="637" width="1520" height="3" class="glint"></rect>
      <rect x="140" y="664" width="120" height="3" rx="1.5" class="glint"></rect>
      <rect x="520" y="686" width="70" height="3" rx="1.5" class="glint-w"></rect>
      <rect x="880" y="660" width="160" height="3" rx="1.5" class="glint"></rect>
      <rect x="1150" y="708" width="110" height="3" rx="1.5" class="glint-w"></rect>
    </svg>`;
}

/** Foreground: two ice ledges with a channel of sea between them. The
 *  plateaus are flat at y 70 (left) and 64 (right) of 300, which is where
 *  the signpost and Quill stand (landingStyles.js, .post and .q-stand). */
export function iceLedge() {
  return html`
    <svg class="ledge" viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="120" width="1440" height="180" fill="url(#lv-sea)"></rect>
      <path class="ripple" d="M690 150h190M720 176h120"></path>
      <path fill="url(#lv-face)" d="M-10 86L60 72 620 70 676 96 700 300H-10Z"></path>
      <path class="ice-top" d="M-10 86L60 70 220 62 420 66 600 68 676 96 640 108 300 104 60 108 -10 104Z"></path>
      <path class="ice-crack" d="M140 86l18 10 -10 8M470 84l-14 9 10 6"></path>
      <path fill="url(#lv-face)" d="M890 300L870 96 930 62 1180 58 1450 70V300Z"></path>
      <path class="ice-top" d="M870 96L930 62 1060 56 1250 58 1450 68V100L1250 98 1060 102 900 108Z"></path>
      <path class="ice-crack" d="M1010 78l16 8 -8 9M1340 80l-12 10 10 6"></path>
      <path class="ice-top" d="M752 140l46 -10 30 8 -22 12 -44 2Z"></path>
      <path class="ice-streak" d="M120 130v60M210 120v110M330 126v40M460 124v90M560 130v54M960 128v70M1080 120v120M1200 126v50M1320 122v96"></path>
      <path class="ice-mound" d="M20 92C40 70 90 62 130 70C110 82 70 92 20 92Z"></path>
      <path class="ice-mound" d="M470 70C500 52 560 50 600 68C570 74 520 76 470 70Z"></path>
      <path class="ice-mound" d="M1290 66C1330 46 1400 46 1450 64V72C1390 72 1330 72 1290 66Z"></path>
    </svg>`;
}

export function telescope() {
  return html`<svg viewBox="0 0 52 52" aria-hidden="true">
    <path class="t-tube" d="M8 26l26 -12 4 9 -26 12Z"></path>
    <path class="t-cap" d="M34 14l6 -3 4 9 -6 3Z"></path>
    <path class="t-cap" d="M6 27l4 -2 3 7 -4 2Z"></path>
    <path class="t-legs" d="M24 30l-8 16M24 30l8 16M24 30v16"></path>
    <path class="t-star" d="M44 3.5l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1Z"></path>
  </svg>`;
}

export function nibArt() {
  return html`<svg viewBox="0 0 52 52" aria-hidden="true">
    <rect x="6" y="14" width="30" height="34" rx="4" class="t-cap"></rect>
    <path class="t-lines" d="M12 24h18M12 31h18M12 38h11"></path>
    <g transform="rotate(32 38 18)">
      <path class="n-nib" d="M38 2l8 12 -8 20 -8 -20Z"></path>
      <path class="n-slit" d="M38 14v20"></path>
      <circle cx="38" cy="14" r="2.4" class="n-hole"></circle>
    </g>
  </svg>`;
}

/** Planet Blob: a cell drawn as a tiny world. `on(k)` shows a part's
 *  label, `hot(k)` returns the class for the part just picked. */
export function blob(on, hot) {
  const drone = (x, y, cls) => svg`
    <g transform="translate(${x} ${y})"><g class="drone amb ${cls}">
      <path class="drone-rotor" d="M-16 -15h32M0 -15v6"></path>
      <rect x="-17" y="-10" width="34" height="20" rx="9" class="drone-body"></rect>
      <rect x="-17" y="2" width="34" height="8" rx="4" class="drone-shade"></rect>
      <circle cx="5" cy="-1" r="4.5" class="drone-eye"></circle>
    </g></g>`;
  const mito = (x, y, r) => svg`
    <g transform="translate(${x} ${y}) rotate(${r})">
      <rect x="-27" y="-14" width="54" height="28" rx="14" class="mito-body"></rect>
      <path class="mito-crista" d="M-19 3l5 -8 5 8 5 -8 5 8 5 -8 5 8"></path>
    </g>`;
  return html`
    <svg viewBox="0 0 460 420" role="img" aria-label="Planet Blob, a round living world with a wall, small bean shapes, dark dots and three tiny drones flying around it.">
      <circle cx="230" cy="212" r="206" class="blob-glow"></circle>
      <circle cx="230" cy="212" r="168" class="blob-glow"></circle>
      <ellipse cx="230" cy="212" rx="224" ry="70" class="orbit" transform="rotate(-14 230 212)"></ellipse>
      <g class="part ${hot('membrane')}">
        <path class="blob-body" d="M230 70C312 64 376 118 382 198C388 276 334 350 246 356C158 362 84 312 78 224C72 138 148 76 230 70Z"></path>
      </g>
      <path class="blob-shade" d="M92 250C110 318 178 354 252 348C188 336 128 300 104 226Z"></path>
      <ellipse cx="300" cy="138" rx="46" ry="22" class="blob-hi" transform="rotate(30 300 138)"></ellipse>
      <circle cx="214" cy="218" r="46" class="nucleus"></circle>
      <circle cx="226" cy="206" r="12" class="nucleolus"></circle>
      <g class="part ${hot('mito')}">
        ${mito(306, 176, 28)}${mito(150, 148, -24)}${mito(290, 290, 64)}
      </g>
      <g class="part ${hot('ribo')}">
        ${[[140, 236], [158, 260], [176, 292], [212, 300], [252, 316], [330, 240], [342, 214], [266, 120], [196, 116], [120, 196]].map(([x, y]) => svg`<circle cx="${x}" cy="${y}" r="5" class="ribo"></circle>`)}
      </g>
      ${drone(70, 92, 'd1')}${drone(404, 120, 'd2')}${drone(398, 362, 'd3')}

      <g class="lbl ${on('membrane') ? 'on' : ''}">
        <path pathLength="1" d="M82 262L40 300"></path>
        <rect x="-4" y="296" width="124" height="34" rx="17"></rect>
        <text x="58" y="319" text-anchor="middle">membrane</text>
      </g>
      <g class="lbl right ${on('mito') ? 'on' : ''}">
        <path pathLength="1" d="M318 160L350 70"></path>
        <rect x="280" y="40" width="150" height="34" rx="17"></rect>
        <text x="355" y="63" text-anchor="middle">mitochondrion</text>
      </g>
      <g class="lbl ${on('ribo') ? 'on' : ''}">
        <path pathLength="1" d="M252 320L262 384"></path>
        <rect x="200" y="382" width="120" height="34" rx="17"></rect>
        <text x="260" y="405" text-anchor="middle">ribosome</text>
      </g>
    </svg>`;
}

/** A mitochondrion with a face, the narrator of the story look demo. */
export function mitoBuddy(face = true) {
  return html`<svg class="buddy" viewBox="0 0 120 70" aria-hidden="true">
    <rect x="4" y="6" width="112" height="58" rx="29" class="mito-body"></rect>
    <path class="mito-crista" d="M18 40l10 -16 10 16 10 -16 10 16 10 -16 10 16 10 -16 10 16"></path>
    ${face ? svg`
      <circle cx="44" cy="30" r="5" class="buddy-eye"></circle>
      <circle cx="76" cy="30" r="5" class="buddy-eye"></circle>
      <path class="buddy-smile" d="M52 44q8 7 16 0"></path>` : ''}
  </svg>`;
}

export function wand() {
  return html`
    <svg class="wand-art" viewBox="0 0 340 170" aria-hidden="true">
      <path class="wand-stick" d="M30 154L134 50"></path>
      <path class="wand-band" d="M30 154L134 50"></path>
      <path class="wand-star ink" d="M146 38l7 -16 4 17 17 2 -15 9 4 17 -12 -12 -15 8 7 -15 -12 -12Z"></path>
      <circle class="fizz" style="--d:0" cx="190" cy="58" r="6"></circle>
      <path class="fizz" style="--d:1" d="M220 76l3 -8 2 8 8 1 -7 4 2 8 -6 -6 -7 4 3 -7 -6 -6Z"></path>
      <circle class="fizz dull" style="--d:2" cx="248" cy="96" r="4"></circle>
      <circle class="fizz dull" style="--d:3" cx="266" cy="110" r="2.6"></circle>
      <g transform="translate(272 114) rotate(8)">
        <path class="page ink" d="M0 0L22 -8 40 2 52 -4 58 18 46 30 50 42 24 46 6 40 -4 26 4 14Z"></path>
        <path class="crease" d="M22 -8L26 18 46 30M4 14L26 18 24 46"></path>
      </g>
    </svg>`;
}

const STONES = [
  'M6 26C4 12 16 3 30 4C44 5 54 14 52 28C50 42 38 49 26 48C13 47 7 38 6 26Z',
  'M5 24C6 10 18 4 31 5C45 6 53 16 51 29C49 41 37 49 24 47C12 45 4 36 5 24Z',
];

export function stone(i) {
  return html`<span class="stone">
    <svg viewBox="0 0 56 52" aria-hidden="true">
      <path class="stone-lip" d="${STONES[i % 2]}" transform="translate(2 4)"></path>
      <path class="stone-fill" d="${STONES[i % 2]}"></path>
    </svg>
    <b>${i + 1}</b>
  </span>`;
}

/** A curly hand-drawn arrow for the collage's margin notes. */
export function scrawlArrow(cls = '') {
  return html`<svg class="scrawl ${cls}" viewBox="0 0 90 60" aria-hidden="true">
    <path pathLength="1" d="M84 6C60 4 34 12 30 30C27 44 44 48 46 36C48 24 26 22 10 46"></path>
    <path pathLength="1" d="M8 32L10 47 24 44"></path>
  </svg>`;
}

/** Smooth curve through points, bulging to alternate sides by `swing`. */
export function routePath(pts, swing) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dy = b.y - a.y;
    const s = (i % 2 ? 1 : -1) * swing;
    d += `C${(a.x + s).toFixed(1)} ${(a.y + dy * 0.45).toFixed(1)} ${(b.x + s).toFixed(1)} ${(b.y - dy * 0.45).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}
