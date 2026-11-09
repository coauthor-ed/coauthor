/**
 * QuillRig — Quill the penguin, as markup + CSS + behaviour, with no framework
 * and no DOM of its own.
 *
 * Lives in core/ (not ui/) because it has two consumers that must not import
 * each other:
 *   - src/ui/components/QuillMascot.js  — a Lit element, renders into its shadow root
 *   - src/simulations/base/SimMascotDom.js — injects into a DomSimulation's this.root
 * Both get the same bird from the same source. The shapes themselves live in
 * quillShapes.js, which a third painter shares: SimQuill.js draws the same
 * bird on canvas from the same table (docs/sprints/completed/arcade-quill-catch.md).
 *
 * Every id is namespaced with an instance `ns` because SVG `url(#id)` references
 * (gradients, filters) resolve per tree — two un-namespaced instances in the same
 * shadow root would silently share, and corrupt, each other's paint servers.
 *
 * Colors come from --quill-* in theme.css. Those are :root custom properties, and
 * custom properties DO inherit across a Shadow DOM boundary (stylesheets do not),
 * which is exactly why a scene inside a plugin's shadow root can still paint him.
 */

import { QUILL_PATHS as P, QUILL_PARTS as R, QUILL_BROWS } from './quillShapes.js';
import { PLAYS, STILLS, actProps } from './quillActs.js';

export const QUILL_VIEWBOX = '0 0 240 300';

/** Ground-plane y in viewBox units — where a scene should sit him. */
export const QUILL_BASELINE_Y = 276;

export const ACTS = [
  'wave', 'hop', 'love', 'snack', 'slide', 'cheer',
  'nod', 'clap', 'point', 'twirl', 'peek', 'think', 'wow', 'shrug', 'dance', 'backflip', 'bow', 'inktick',
];
export const EXPRESSIONS = ['happy', 'surprised', 'sad', 'angry', 'heart'];

/** Brow transforms per expression, from the shared pose table (quillShapes.js).
 *  Pivots are set in CSS (inner end of each brow). */
const BROW_PRESETS = Object.fromEntries(Object.entries(QUILL_BROWS).map(([k, [dy, deg]]) => [k, {
  l: `translate(0px,${dy}px) rotate(${deg}deg)`,
  r: `translate(0px,${dy}px) rotate(${-deg}deg)`,
}]));
const ell = (a) => `cx="${a[0]}" cy="${a[1]}" rx="${a[2]}" ry="${a[3]}"`;
const circ = (a) => `cx="${a[0]}" cy="${a[1]}" r="${a[2]}"`;
const rect = (a) => `x="${a[0]}" y="${a[1]}" width="${a[2]}" height="${a[3]}" rx="${a[4]}"`;

// The cheer burst: bits that start hidden behind his body and fly out when he
// jumps. [shape, colour token, dx, dy, spin]; dx/dy in viewBox units.
const CONFETTI = [
  ['rect', '--accent-blue', -118, -96, 220], ['dot', '--accent-gold', -70, -150, -160],
  ['rect', '--quill-scarf', 0, -172, 300], ['dot', '--accent-teal', 74, -146, -240],
  ['rect', '--accent-violet', 124, -92, 200], ['dot', '--accent-coral', -146, -22, -180],
  ['rect', '--accent-gold', 150, -16, 260], ['star', '--accent-teal', -100, -178, 120],
  ['star', '--accent-blue', 100, -184, -120], ['star', '--accent-violet', -40, -120, 90],
  ['star', '--quill-feather', 44, -116, -90], ['dot', '--quill-scarf', -160, -120, 0],
  ['rect', '--quill-feather', 166, -128, -200], ['star', '--accent-coral', 0, -210, 180],
];
const BIT_SHAPES = {
  rect: '<rect x="-11" y="-6" width="22" height="12" rx="3"',
  dot: '<circle r="8"',
  star: '<path d="M0-15L4-4 15 0 4 4 0 15-4 4-15 0-4-4Z"',
};
const confettiBit = ([shape, tok, dx, dy, r]) =>
  `<g class="q-bit" data-to="${dx} ${dy} ${r}">${BIT_SHAPES[shape]} fill="var(${tok})"/></g>`;

export function quillMarkup(ns = 'q') {
  const i = (name) => `${ns}-${name}`;
  return `
<svg class="quill-svg" viewBox="${QUILL_VIEWBOX}" part="svg" overflow="visible" aria-hidden="true">
  <defs>
    <linearGradient id="${i('gBody')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--quill-body-hi)"/>
      <stop offset=".5" stop-color="var(--quill-body-mid)"/>
      <stop offset="1" stop-color="var(--quill-body-lo)"/>
    </linearGradient>
    <linearGradient id="${i('gBelly')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--quill-belly)"/>
      <stop offset="1" stop-color="var(--quill-belly-lo)"/>
    </linearGradient>
    <linearGradient id="${i('gFoot')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--quill-foot)"/>
      <stop offset="1" stop-color="var(--quill-foot-lo)"/>
    </linearGradient>
    <radialGradient id="${i('gBeak')}" cx=".5" cy=".3">
      <stop offset="0" stop-color="var(--quill-beak)"/>
      <stop offset="1" stop-color="var(--quill-beak-lo)"/>
    </radialGradient>
    <radialGradient id="${i('gCheek')}" cx=".5" cy=".5">
      <stop offset="0" stop-color="var(--quill-cheek)"/>
      <stop offset="1" stop-color="transparent"/>
    </radialGradient>
    <filter id="${i('glow')}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <ellipse class="q-shadow" ${ell(R.shadow)}/>

  <g class="q-confetti">${CONFETTI.map(confettiBit).join('')}</g>

  ${actProps.puffs()}

  <clipPath id="${i('ledge')}"><rect x="-500" y="-500" width="1240" height="778"/></clipPath>
  <g class="q-stagebox"><g class="q-all">
  <g class="q-legs">
    <g class="q-leg q-leg-l">
      <rect ${rect(R.legL)} fill="var(--quill-limb)"/>
      <ellipse ${ell(R.footL)} fill="url(#${i('gFoot')})"/>
    </g>
    <g class="q-leg q-leg-r">
      <rect ${rect(R.legR)} fill="var(--quill-limb)"/>
      <ellipse ${ell(R.footR)} fill="url(#${i('gFoot')})"/>
    </g>
  </g>

  <path d="${P.body}" fill="url(#${i('gBody')})"/>
  <path d="${P.shine}" fill="#fff" opacity=".18"/>
  <g class="q-tummy">
    <ellipse ${ell(R.belly)} fill="url(#${i('gBelly')})"/>
    <ellipse ${ell(R.bellyShine)} fill="#fff" opacity=".6"/>
  </g>

  <path class="q-wing q-wing-l" id="${i('wingL')}" d="${P.wingL}" fill="var(--quill-limb)"/>
  <path class="q-wing q-wing-r" id="${i('wingR')}" d="${P.wingR}" fill="var(--quill-limb)"/>

  <g class="q-back">
    <path d="${P.body}" fill="url(#${i('gBody')})"/>
    <path d="${P.shine}" fill="#fff" opacity=".18"/>
  </g>

  <g class="q-scarf">
    <path d="${P.scarf}" fill="var(--quill-scarf)"/>
    <path d="${P.scarfStripes}" stroke="var(--quill-scarf-stripe)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="${P.scarfEdge}" stroke="var(--quill-scarf-lo)" stroke-width="2" fill="none" opacity=".4"/>
    <path class="q-scarf-tail" d="${P.scarfTail}" fill="var(--quill-scarf-tail)"/>
  </g>

  <g class="q-face"><g class="q-front">
  <circle ${circ(R.cheekL)} fill="url(#${i('gCheek')})"/>
  <circle ${circ(R.cheekR)} fill="url(#${i('gCheek')})"/>

  <g class="q-brows">
    <path class="q-brow q-brow-l" d="${P.browL}" fill="var(--quill-limb)"/>
    <path class="q-brow q-brow-r" d="${P.browR}" fill="var(--quill-limb)"/>
  </g>

  <g class="q-eye q-eye-l">
    <ellipse ${ell(R.eyeL)} fill="#fff"/>
    <g class="q-pupil" filter="url(#${i('glow')})">
      <circle ${circ(R.irisL)} fill="var(--quill-iris)"/>
      <circle ${circ(R.glintL)} fill="#fff"/>
    </g>
  </g>
  <g class="q-eye q-eye-r">
    <ellipse ${ell(R.eyeR)} fill="#fff"/>
    <g class="q-pupil" filter="url(#${i('glow')})">
      <circle ${circ(R.irisR)} fill="var(--quill-iris)"/>
      <circle ${circ(R.glintR)} fill="#fff"/>
    </g>
  </g>

  <g class="q-joy" opacity="0">
    <path d="M84 112Q100 86 116 112M124 112Q140 86 156 112" stroke="var(--quill-iris)" stroke-width="7" stroke-linecap="round" fill="none"/>
  </g>

  <g class="q-hearts" opacity="0">
    <g class="q-heart"><path transform="translate(${R.heartL[0]},${R.heartL[1]}) scale(${R.heartL[2]})" d="${P.heart}" fill="var(--quill-heart)" filter="url(#${i('glow')})"/></g>
    <g class="q-heart"><path transform="translate(${R.heartR[0]},${R.heartR[1]}) scale(${R.heartR[2]})" d="${P.heart}" fill="var(--quill-heart)" filter="url(#${i('glow')})"/></g>
  </g>

  <g class="q-beak-closed">
    <path d="${P.beak}" fill="url(#${i('gBeak')})"/>
    <path d="${P.beakLine}" stroke="var(--quill-beak-lo)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  </g>
  <g class="q-beak-open" opacity="0">
    <ellipse ${ell(R.mouth)} fill="var(--quill-beak-mouth)"/>
    <circle ${circ(R.tongue)} fill="var(--quill-tongue)"/>
    <path d="${P.beakOpenTop}" fill="url(#${i('gBeak')})"/>
  </g>

  </g></g>
  <path class="q-tuft" d="${P.tuft}" fill="var(--quill-body-hi)"/>

  <path class="q-flip q-flip-l" d="${P.wingL}" fill="var(--quill-limb)"/>
  <path class="q-flip q-flip-r" d="${P.wingR}" fill="var(--quill-limb)"/>
  </g></g>

  <g class="q-snack" opacity="0">
    <ellipse cx="0" cy="0" rx="15" ry="9" fill="var(--accent-blue)"/>
    <path d="M12 0l13-9v18z" fill="var(--accent-blue)" opacity=".7"/>
    <circle cx="-7" cy="-2" r="2" fill="#fff"/>
  </g>

  ${actProps.top()}
</svg>`;
}

/**
 * `scope` is the selector the rules hang off: ':host' for the Lit element,
 * or a class for a scene root. Kept as a parameter because a DomSimulation
 * injects plain CSS text with no shadow host to speak of.
 */
export function quillStyles(scope = ':host') {
  return `
${scope} { display: inline-block; line-height: 0; }
${scope} .quill-svg { width: 100%; height: auto; overflow: visible; }

${scope} .q-shadow { fill: #000; opacity: .28; }
${scope} .q-bit { opacity: 0; transform: translate(120px, 150px); }
${actProps.styles(scope)}

${scope} .q-eye { transform-box: fill-box; transform-origin: center; animation: q-blink 5.2s infinite; }
${scope} .q-eye-r { animation-delay: .06s; }
@keyframes q-blink {
  0%, 93%, 100% { transform: scaleY(1); }
  94%, 95%      { transform: scaleY(0.05); }
  96%           { transform: scaleY(1); }
}
${scope} .q-heart { transform-box: fill-box; transform-origin: center; }

${scope} .q-pupil { transition: transform .16s ease-out; }
${scope} .q-brow  { transform-box: fill-box; transition: transform .25s cubic-bezier(.34,1.56,.64,1); }
${scope} .q-brow-l { transform-origin: 100% 50%; }
${scope} .q-brow-r { transform-origin: 0% 50%; }

${scope} .q-wing { transition: transform .4s cubic-bezier(.34,1.56,.64,1); transform-box: fill-box; }
${scope} .q-wing-l { transform-origin: 82% 8%; }
${scope} .q-wing-r { transform-origin: 18% 8%; }

${scope} .q-scarf-tail { transform-box: fill-box; transform-origin: 8% 20%; animation: q-flutter 3s ease-in-out infinite; }
@keyframes q-flutter { 50% { transform: rotate(12deg) translateY(-2px); } }

${scope}[data-idle="true"] .quill-svg { animation: q-bob 4s ease-in-out infinite; }
@keyframes q-bob { 50% { transform: translateY(-13px) rotate(-2deg); } }

/* theme.css's global reduced-motion block selects * and CANNOT cross a shadow
   boundary, so it must be repeated here — same reason content-block.js does. */
@media (prefers-reduced-motion: reduce) {
  ${scope} .q-eye,
  ${scope} .q-scarf-tail,
  ${scope}[data-idle="true"] .quill-svg { animation: none !important; }
  ${scope} .q-pupil, ${scope} .q-brow, ${scope} .q-wing { transition: none !important; }
}`;
}

const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Acts running anywhere on the page, in any Quill: "one at a time" holds
// across instances (the cameo reads it; see quillActing()).
let running = 0;

/** True while any Quill on the page is in the middle of an act. */
export const quillActing = () => running > 0;

const q = (root, sel) => root.querySelector(sel);
const qa = (root, sel) => Array.from(root.querySelectorAll(sel));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function animate(el, frames, opts) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve();
  return new Promise((res) => {
    const a = el.animate(frames, { easing: 'ease-in-out', fill: 'none', ...opts });
    a.addEventListener('finish', res, { once: true });
    a.addEventListener('cancel', res, { once: true });
  });
}

export function setExpression(root, name) {
  const p = BROW_PRESETS[name] || BROW_PRESETS.happy;
  const l = q(root, '.q-brow-l');
  const r = q(root, '.q-brow-r');
  if (l) l.style.transform = p.l;
  if (r) r.style.transform = p.r;
}

/** Move both pupils. dx/dy are viewBox units, small (~±3). */
export function trackPupils(root, dx, dy) {
  qa(root, '.q-pupil').forEach((g) => g.setAttribute('transform', `translate(${dx},${dy})`));
}

/**
 * The celebration: a crouch, then a big jump with both flippers flung up,
 * happy squinting eyes and an open beak while confetti bursts out from behind
 * him; a smaller bounce, then he settles back to happy.
 */
async function cheer(root, svg) {
  setExpression(root, 'surprised');
  const T = 1500;
  const closed = q(root, '.q-beak-closed');
  const open = q(root, '.q-beak-open');
  // On/off switches: the easing sits on each keyframe so every segment snaps.
  const shout = [0, .1, .84].map((offset, k) => ({ offset, opacity: k % 2 ? 1 : 0, easing: 'steps(1, end)' }));
  const hush = shout.map((f) => ({ ...f, opacity: 1 - f.opacity }));
  shout.push({ opacity: 0 }); hush.push({ opacity: 1 });
  const flat = { duration: T, easing: 'linear' };
  animate(open, shout, flat);
  animate(closed, hush, flat);
  // Happy "^ ^" eyes for the shout.
  qa(root, '.q-eye').forEach((e) => animate(e, hush, flat));
  animate(q(root, '.q-joy'), shout, flat);
  const up = (deg) => [
    { transform: 'rotate(0deg)', easing: 'cubic-bezier(.34,1.4,.64,1)' }, { transform: `rotate(${deg * 0.2}deg)`, offset: .1 },
    { transform: `rotate(${deg}deg)`, offset: .22 }, { transform: `rotate(${deg * 0.85}deg)`, offset: .4 },
    { transform: `rotate(${deg}deg)`, offset: .55 }, { transform: `rotate(${deg * 0.9}deg)`, offset: .78 },
    { transform: 'rotate(0deg)' },
  ];
  animate(q(root, '.q-wing-l'), up(128), flat);
  animate(q(root, '.q-wing-r'), up(-128), flat);
  qa(root, '.q-bit').forEach((b, i) => {
    const [dx, dy, r] = b.dataset.to.split(' ').map(Number);
    animate(b, [
      { opacity: 0, transform: 'translate(120px, 140px) scale(.2)' },
      { opacity: 1, transform: `translate(${120 + dx * 0.75}px, ${140 + dy * 0.75}px) rotate(${r * 0.6}deg) scale(1)`, offset: .45 },
      { opacity: 1, offset: .75 },
      { opacity: 0, transform: `translate(${120 + dx}px, ${140 + dy + 90}px) rotate(${r}deg) scale(.8)` },
    ], { duration: 1300, delay: 180 + (i % 4) * 30, easing: 'cubic-bezier(.15,.8,.3,1)' });
  });
  await animate(svg, [
    { transform: 'translateY(0) scale(1, 1)' },
    { transform: 'translateY(0) scale(1.16, .8)', offset: .1 },
    { transform: 'translateY(-70px) scale(.9, 1.14) rotate(-5deg)', offset: .3 },
    { transform: 'translateY(-78px) scale(.96, 1.06) rotate(5deg)', offset: .42 },
    { transform: 'translateY(0) scale(1.14, .84)', offset: .58 },
    { transform: 'translateY(-26px) scale(.97, 1.04)', offset: .7 },
    { transform: 'translateY(0) scale(1.06, .95)', offset: .82 },
    { transform: 'translateY(0) scale(1, 1)' },
  ], { duration: T, easing: 'cubic-bezier(.3,.7,.4,1)' });
  setExpression(root, 'happy');
}

/**
 * Play one act. Resolves when it finishes. Under reduced motion the five here
 * collapse to their expression change only, and the rest (quillActs.js) hold
 * a still end pose for a moment; nothing moves.
 *
 * `target` is optional and only `point` reads it: { x, y } in viewport px.
 * `peek` also takes { inPlace: true }, for a host that brings him to an edge
 * itself (the cameo), and `slide` for one who stands in a layout, with no room
 * to travel. Without a target he points up and out to his left.
 */
export async function performAct(root, act, target = null) {
  const svg = q(root, '.quill-svg');
  if (!svg) return;
  running += 1;
  try {
    await playAct(root, svg, act, target);
  } finally {
    running -= 1;
  }
}

async function playAct(root, svg, act, target) {
  if (PLAYS[act]) {
    await (prefersReduced() ? STILLS[act] : PLAYS[act])(root, svg, target);
    return;
  }

  if (prefersReduced()) {
    if (act === 'love') setExpression(root, 'heart');
    else if (act === 'hop' || act === 'cheer') setExpression(root, 'surprised');
    else setExpression(root, 'happy');
    return;
  }

  switch (act) {
    case 'wave': {
      setExpression(root, 'happy');
      animate(q(root, '.q-wing-r'), [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-65deg)' }, { transform: 'rotate(18deg)' },
        { transform: 'rotate(-58deg)' }, { transform: 'rotate(0deg)' },
      ], { duration: 1300 });
      await animate(svg, [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(5deg)', offset: .25 },
        { transform: 'rotate(-4deg)', offset: .75 }, { transform: 'rotate(0deg)' },
      ], { duration: 1300 });
      break;
    }
    case 'cheer':
      await cheer(root, svg);
      break;
    case 'hop': {
      setExpression(root, 'surprised');
      const n = 2;
      for (let k = 0; k < n; k++) {
        await animate(svg, [
          { transform: 'translateY(0) scale(1,1)' },
          { transform: 'translateY(-54px) scale(.92,1.12) rotate(3deg)', offset: .45 },
          { transform: 'translateY(0) scale(1.14,.82) rotate(-3deg)', offset: .8 },
          { transform: 'translateY(0) scale(1,1)' },
        ], { duration: k === n - 1 ? 720 : 520, easing: 'cubic-bezier(.3,.7,.4,1)' });
      }
      setExpression(root, 'happy');
      break;
    }
    case 'love': {
      setExpression(root, 'heart');
      // The eyes hide as animations, not an attribute: root may be a ShadowRoot,
      // and a cancelled act (the cameo's leave()) gives them back by itself.
      qa(root, '.q-eye').forEach((e) => animate(e, [{ opacity: 0 }, { opacity: 0 }], { duration: 2200, easing: 'linear' }));
      // Each heart scales about its own middle, so it stays on its eye.
      qa(root, '.q-heart').forEach((h) => animate(h, [
        { transform: 'scale(.5)' },
        { transform: 'scale(1.3)', offset: .3 },
        { transform: 'scale(1)', offset: .6 },
        { transform: 'scale(1.2)' },
      ], { duration: 2200 }));
      await animate(q(root, '.q-hearts'), [
        { opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 1, offset: .6 }, { opacity: 0 },
      ], { duration: 2200 });
      setExpression(root, 'happy');
      break;
    }
    case 'snack': {
      setExpression(root, 'surprised');
      const snack = q(root, '.q-snack');
      const closed = q(root, '.q-beak-closed');
      const open = q(root, '.q-beak-open');
      // fill:'forwards' is needed to hold the fish at Quill's beak while he
      // chews - but a finished forwards animation keeps applying its last
      // keyframe, and animation effects outrank inline style, so a later
      // `snack.style.opacity = 0` was being ignored and the fish hung around
      // forever. It is cancelled explicitly once the act is done.
      const fly = animate(snack, [
        { transform: 'translate(220px,-40px) scale(.6)', opacity: 0 },
        { transform: 'translate(168px,138px) scale(.85)', opacity: 1 },
      ], { duration: 1100, fill: 'forwards' });
      await wait(1100);
      for (let k = 0; k < 3; k++) {
        if (closed) closed.style.opacity = '0';
        if (open) open.style.opacity = '1';
        await wait(130);
        if (closed) closed.style.opacity = '';
        if (open) open.style.opacity = '0';
        await wait(150);
      }
      // Swallow it: fade out, then drop the persisted fill so nothing lingers.
      if (snack) {
        await animate(snack, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
        snack.getAnimations?.().forEach((a) => a.cancel());
        snack.style.opacity = '';
      }
      setExpression(root, 'happy');
      break;
    }
    default:
      break;
  }
}
