import { LitElement, html, svg, css } from 'lit';
import { BRAND_DEFS, quillFull, PEN, brandPaint } from './brandSvg.js';

/**
 * <quill-signature> — the full brand lockup: Quill stands beside the
 * "coauthor" wordmark and signs it. Used where there is room for a moment of
 * ceremony (onboarding); headers use the compact <coauthor-logo>.
 *
 * The intro (on connect, and again on tap): Quill drops in, the pen leaves
 * his flipper and writes the name while his eyes follow it, underlines it
 * with a swoosh, flies back with a spin, and he does a proud hop. At rest he
 * blinks, his scarf flutters, and now and then he tilts his head, glances
 * off and taps the pen; hovering makes him look up. celebrate() is the big
 * moment (onboarding's "Start learning"): a jump with both flippers up, the
 * pen tossed and caught, and a burst of confetti. prefers-reduced-motion
 * shows the finished lockup.
 *
 * Width comes from the host (max-width via --signature-width). "author" mixes
 * the host's text colour with Quill's indigo, like <coauthor-logo>.
 */

const VB_W = 560, VB_H = 216;
const REST = { x: 150, y: 150, a: 28 };   // the pen tucked in Quill's flipper
const EYE = { x: 90, y: 71 };             // between Quill's eyes, in lockup units

// The writing mask: a zigzag the pen draws across the word, revealing it.
const ZIG = (() => {
  let d = 'M206 58', up = false;
  for (let x = 216; x <= 552; x += 10) { d += `L${x} ${up ? 58 : 158}`; up = !up; }
  return d;
})();

// The cheer: happy "^ ^" eyes and confetti bits, inside the rig so they hop
// with him. [dx, dy, spin, delay, colour token]
const BITS = [
  [-70, -60, 220, 0, '--accent-blue'], [-40, -88, -160, 0.03, '--accent-gold'], [0, -100, 300, 0.06, '--quill-scarf'],
  [42, -86, -240, 0.09, '--accent-teal'], [74, -56, 200, 0, '--accent-violet'], [-86, -14, -180, 0.03, '--accent-coral'],
  [88, -10, 260, 0.06, '--quill-feather'], [-58, -104, 120, 0.09, '--accent-teal'], [58, -108, -120, 0, '--accent-blue'],
  [-24, -70, 90, 0.03, '--accent-violet'], [26, -66, -90, 0.06, '--accent-coral'],
];
const CHEER = svg`
  <path class="joy" d="M84 112Q100 86 116 112M124 112Q140 86 156 112" stroke-width="7" stroke-linecap="round" fill="none"/>
  ${BITS.map(([dx, dy, r, d, c], i) => svg`<g class="bit" style="--dx: ${dx}px; --dy: ${dy}px; --r: ${r}deg; --d: ${d}s">${i % 3
    ? svg`<rect x="-7" y="-4" width="14" height="8" rx="2" style="fill: var(${c})"/>`
    : svg`<path d="M0-9L2.5-2.5 9 0 2.5 2.5 0 9-2.5 2.5-9 0-2.5-2.5Z" style="fill: var(${c})"/>`}</g>`)}`;

const LOCKUP = svg`
  ${BRAND_DEFS}
  <mask id="wmask" maskUnits="userSpaceOnUse" x="0" y="0" width=${VB_W} height=${VB_H}>
    <path class="zig" d=${ZIG} stroke-width="18" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  </mask>
  <g class="word">
    <text x="212" y="146" textLength="326" lengthAdjust="spacingAndGlyphs" class="lip"><tspan class="co-lip">co</tspan>author</text>
    <text x="212" y="140" textLength="326" lengthAdjust="spacingAndGlyphs" class="ink"><tspan class="co">co</tspan>author</text>
  </g>
  <path class="swoosh" d="M218 172C300 162 420 156 512 162 544 164 554 152 540 146" pathLength="1" stroke-width="7" stroke-linecap="round" fill="none"/>
  <g class="dots"><circle cx="550" cy="130" r="5" class="f-scarf"/><circle cx="554" cy="112" r="3" class="f-feather"/></g>
  <g class="quill" transform="translate(4 -4) scale(.72)">${quillFull({ extra: CHEER })}</g>
  <g class="pen" transform="translate(${REST.x} ${REST.y}) rotate(${REST.a})"><g class="pen-toss">${PEN}</g></g>`;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export class QuillSignature extends LitElement {
  static styles = [brandPaint, css`
    :host { display: block; width: 100%; max-width: var(--signature-width, 420px); color: inherit; }
    svg { display: block; width: 100%; height: auto; overflow: visible; cursor: pointer; }
    text { font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; font-weight: 600; font-size: 96px; letter-spacing: -1px; }
    .ink { fill: color-mix(in srgb, currentColor 55%, var(--quill-body-hi)); }
    .lip { fill: color-mix(in srgb, var(--quill-body-lo) 65%, transparent); }
    .co { fill: var(--quill-scarf); }
    .co-lip { fill: var(--quill-scarf-lo); }
    .zig { stroke: var(--quill-belly); }
    .swoosh { stroke: var(--quill-feather); stroke-dasharray: 1 1; stroke-dashoffset: 0; }
    .dots circle { transform-box: fill-box; transform-origin: center; }

    /* rig at rest */
    .eye { animation: blink 5.2s infinite; }
    .eye + .eye { animation-delay: 0.06s; }
    @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 94.5% { transform: scaleY(0.08); } 96% { transform: scaleY(1); } }
    .scarf-tail { transform-origin: 8% 20%; animation: flutter 3s ease-in-out infinite; }
    @keyframes flutter { 50% { transform: rotate(12deg) translateY(-2px); } }
    .hop, .tilt { transform-origin: 50% 100%; }
    .wing-r { transform-origin: 18% 8%; transform: rotate(-14deg); transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .wing-l { transform-origin: 82% 8%; transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .pupil { transition: transform 0.16s ease-out; }

    /* intro */
    .drop .hop { animation: drop 0.7s cubic-bezier(0.3, 0, 0.3, 1) both; }
    @keyframes drop {
      0% { transform: translateY(-260px) scale(0.9, 1.1); }
      55% { transform: translateY(0) scale(1.14, 0.84); }
      75% { transform: translateY(-14px) scale(0.96, 1.05); }
      100% { transform: none; } }
    .drop .f-shadow { transform-box: fill-box; transform-origin: center; animation: shadow-in 0.7s ease-out both; }
    @keyframes shadow-in { 0% { transform: scale(0.3); opacity: 0; } 55% { transform: scale(1.1); } }
    .writing .wing-r { transform: rotate(-38deg); }
    .proud .hop { animation: proud 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
    @keyframes proud { 40% { transform: translateY(-16px) scale(0.95, 1.06); } 70% { transform: scale(1.06, 0.95); } }
    .proud .beak-open { opacity: 1; }
    .proud .beak-shut { opacity: 0; }
    .proud .wing-l { transform: rotate(-60deg); }

    /* at rest: long quiet gaps, then a head tilt, a glance and two pen taps */
    .pen-toss { transform-box: fill-box; transform-origin: 50% 100%; }
    .brows { transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .idle .tilt { animation: tilt 7s ease-in-out infinite; }
    @keyframes tilt { 0%, 30%, 62%, 100% { transform: none; } 38%, 54% { transform: rotate(-7deg); } }
    .idle .pupil { animation: glance 7s ease-in-out infinite; }
    @keyframes glance { 0%, 34%, 58%, 100% { transform: none; } 40%, 52% { transform: translate(-4px, -3px); } }
    .idle .pen-toss { animation: taptap 7s ease-in-out infinite; }
    @keyframes taptap { 0%, 70%, 86%, 100% { transform: none; } 73%, 79% { transform: translateY(-9px) rotate(-14deg); } 76%, 82% { transform: none; } }
    /* hover: he looks up at you */
    .idle:hover .tilt { animation: none; transform: rotate(4deg); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .idle:hover .pupil { animation: none; transform: translate(2px, -5px); }
    .idle:hover .brows { transform: translateY(-5px); }

    /* celebrate */
    .joy { stroke: var(--quill-iris); opacity: 0; }
    .bit { opacity: 0; transform: translate(120px, 150px); }
    .cheer .bit { animation: pop 1s cubic-bezier(0.2, 0.8, 0.3, 1) var(--d) both; }
    @keyframes pop {
      0% { opacity: 1; transform: translate(120px, 150px) scale(0.3); }
      70% { opacity: 1; }
      100% { opacity: 0; transform: translate(calc(120px + var(--dx) * 1.7), calc(150px + var(--dy) * 1.7 + 40px)) rotate(var(--r)) scale(1); } }
    .cheer .hop { animation: jump 1s cubic-bezier(0.3, 0, 0.3, 1); }
    @keyframes jump {
      15% { transform: scale(1.2, 0.78); } 40% { transform: translateY(-34px) scale(0.9, 1.12) rotate(-6deg); }
      60% { transform: translateY(-34px) scale(0.94, 1.08) rotate(6deg); } 80% { transform: translateY(0) scale(1.12, 0.88); } }
    .cheer .wing-l { transform: rotate(128deg); }
    .cheer .wing-r { transform: rotate(-128deg); }
    .cheer .beak-open, .cheer .joy { opacity: 1; }
    .cheer .beak-shut, .cheer .eye { opacity: 0; }
    .cheer .pen-toss { animation: toss 1s cubic-bezier(0.3, 0, 0.3, 1); }
    @keyframes toss { 45% { transform: translate(-6px, -90px) rotate(-200deg); } 80% { transform: translateY(4px) rotate(-360deg); } 100% { transform: rotate(-360deg); } }

    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
      svg { cursor: default; }
    }
  `];

  constructor() {
    super();
    this._run = 0;
    this._reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  firstUpdated() {
    const $ = (s) => this.renderRoot.querySelector(s);
    this._el = {
      svg: $('svg'), pen: $('.pen'), zig: $('.zig'), word: $('.word'), swoosh: $('.swoosh'),
      quill: $('.quill'), dots: this.renderRoot.querySelectorAll('.dots circle'),
      pupils: this.renderRoot.querySelectorAll('.pupil'),
    };
    const go = () => (this.isConnected ? this._play() : null);
    (document.fonts?.ready ?? Promise.resolve()).then(go, go);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._run++;
    clearTimeout(this._proudTimer);
    clearTimeout(this._cheerTimer);
  }

  /** The big moment. Resolves when he has landed (at once under reduced motion). */
  celebrate() {
    const root = this._el?.svg;
    if (!root || this._reduced) return Promise.resolve();
    this._run++;
    this._finish();
    root.classList.remove('idle', 'proud', 'cheer');
    void root.getBoundingClientRect();
    root.classList.add('cheer');
    clearTimeout(this._cheerTimer);
    return new Promise((done) => {
      this._cheerTimer = setTimeout(() => { root.classList.remove('cheer'); root.classList.add('idle'); done(); }, 1100);
    });
  }

  _place(x, y, a) {
    const { pen, pupils } = this._el;
    pen.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})`);
    const dx = Math.max(-1, Math.min(1, (x - EYE.x) / 160)) * 6;
    const dy = Math.max(-1, Math.min(1, (y - EYE.y) / 90)) * 4;
    pupils.forEach((p) => { p.style.transform = `translate(${dx}px, ${dy}px)`; });
  }

  _finish() {
    const { word, zig, swoosh, dots, pupils, svg: root } = this._el;
    word.removeAttribute('mask');
    zig.style.strokeDasharray = ''; zig.style.strokeDashoffset = '';
    swoosh.style.strokeDashoffset = '0';
    dots.forEach((d) => { d.style.transform = ''; });
    root.classList.remove('writing', 'drop');
    this._place(REST.x, REST.y, REST.a);
    pupils.forEach((p) => { p.style.transform = ''; });
  }

  _play() {
    if (this._reduced) { this._finish(); return; }
    clearTimeout(this._cheerTimer);
    const me = ++this._run;
    const { svg: root, word, zig, swoosh, dots } = this._el;
    const zLen = zig.getTotalLength(), sLen = swoosh.getTotalLength();
    word.setAttribute('mask', 'url(#wmask)');
    zig.style.strokeDasharray = `${zLen} ${zLen}`;
    zig.style.strokeDashoffset = String(zLen);
    swoosh.style.strokeDashoffset = '1';
    dots.forEach((d) => { d.style.transition = ''; d.style.transform = 'scale(0)'; });
    root.classList.remove('proud', 'drop', 'idle', 'cheer');
    void root.getBoundingClientRect();
    root.classList.add('drop', 'writing');
    this._place(REST.x, REST.y, REST.a);

    const start = zig.getPointAtLength(0);
    const end = swoosh.getPointAtLength(sLen);
    const T = { wait: 650, fly: 380, write: 1900, sw: 420, home: 420 };
    const t0 = performance.now();
    const frame = (now) => {
      if (me !== this._run) return;
      let t = now - t0;
      if (t < T.wait) { requestAnimationFrame(frame); return; }
      t -= T.wait;
      if (t < T.fly) {   // the pen hops from the flipper to the start of the word
        const k = ease(t / T.fly);
        this._place(lerp(REST.x, start.x, k), lerp(REST.y, 124, k) - Math.sin(k * Math.PI) * 50, lerp(REST.a, 22, k));
        requestAnimationFrame(frame); return;
      }
      t -= T.fly;
      if (t < T.write) { // writing: the zigzag mask follows the nib
        const L = zLen * (t / T.write);
        zig.style.strokeDashoffset = String(zLen - L);
        const p = zig.getPointAtLength(L);
        this._place(p.x, 124 + (p.y - 108) * 0.32, 22 + Math.sin(t / 60) * 5);
        requestAnimationFrame(frame); return;
      }
      t -= T.write;
      word.removeAttribute('mask');
      if (t < T.sw) {    // the underline swoosh
        const k = ease(t / T.sw);
        swoosh.style.strokeDashoffset = String(1 - k);
        const p = swoosh.getPointAtLength(sLen * k);
        this._place(p.x, p.y, 22);
        requestAnimationFrame(frame); return;
      }
      t -= T.sw;
      swoosh.style.strokeDashoffset = '0';
      if (t < T.home) {  // back to the flipper with a spin; the ink dots pop
        const k = ease(t / T.home);
        this._place(lerp(end.x, REST.x, k), lerp(end.y, REST.y, k) - Math.sin(k * Math.PI) * 70, lerp(22, REST.a + 360, k));
        dots.forEach((d, i) => {
          d.style.transition = `transform .35s cubic-bezier(.34,1.56,.64,1) ${i * 0.08}s`;
          d.style.transform = 'scale(1)';
        });
        requestAnimationFrame(frame); return;
      }
      this._finish();
      root.classList.add('proud');
      this._proudTimer = setTimeout(() => {
        if (me === this._run) { root.classList.remove('proud'); root.classList.add('idle'); }
      }, 700);
    };
    requestAnimationFrame(frame);
  }

  render() {
    return html`<svg viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-label="CoAuthor"
      @click=${() => this._play()}>${LOCKUP}</svg>`;
  }
}

customElements.define('quill-signature', QuillSignature);
