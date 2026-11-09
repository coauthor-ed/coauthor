import { svg, css } from 'lit';
import { QUILL_PATHS as P, QUILL_PARTS as R } from '../../core/quill/quillShapes.js';

/**
 * The brand's SVG pieces, shared by <coauthor-logo> (header lockup),
 * <quill-signature> (Quill signing the name, onboarding) and <quill-loader>.
 * Shapes come from core/quill/quillShapes.js, so all three are the same
 * penguin as <quill-mascot>.
 *
 * Each piece paints through the classes in `brandPaint`, which read the
 * --quill-* / --logo-* tokens in theme.css. The gradient ids (#body, #belly,
 * #cheek) are only unique per shadow root: put BRAND_DEFS once in each
 * component's shadow root, never in light DOM.
 */

export const BRAND_DEFS = svg`
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="c-hi"/><stop offset=".55" class="c-mid"/><stop offset="1" class="c-lo"/>
    </linearGradient>
    <linearGradient id="belly" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="c-belly"/><stop offset="1" class="c-belly-lo"/>
    </linearGradient>
    <radialGradient id="cheek"><stop offset="0" class="c-cheek"/><stop offset="1" class="c-cheek" stop-opacity="0"/></radialGradient>
  </defs>`;

const eye = (e, i, g) => svg`
  <g class="eye">
    <ellipse cx=${e[0]} cy=${e[1]} rx=${e[2]} ry=${e[3]} class="f-belly"/>
    <g class="pupil"><circle cx=${i[0]} cy=${i[1]} r=${i[2]} class="f-iris"/><circle cx=${g[0]} cy=${g[1]} r=${g[2]} class="f-belly"/></g>
  </g>`;

const face = () => {
  const [cxL, cyL, rL] = R.cheekL, [cxR, cyR, rR] = R.cheekR;
  return svg`
    <circle cx=${cxL} cy=${cyL} r=${rL} fill="url(#cheek)"/><circle cx=${cxR} cy=${cyR} r=${rR} fill="url(#cheek)"/>
    <g class="brows"><path d=${P.browL} class="f-limb"/><path d=${P.browR} class="f-limb"/></g>
    ${eye(R.eyeL, R.irisL, R.glintL)}${eye(R.eyeR, R.irisR, R.glintR)}
    <g class="beak-shut"><path d=${P.beak} class="f-beak"/>
      <path d=${P.beakLine} class="s-beak" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>
    <g class="beak-open"><ellipse cx=${R.mouth[0]} cy=${R.mouth[1]} rx=${R.mouth[2]} ry=${R.mouth[3]} class="f-mouth"/>
      <circle cx=${R.tongue[0]} cy=${R.tongue[1]} r=${R.tongue[2]} class="f-tongue"/><path d=${P.beakOpenTop} class="f-beak"/></g>
    <path d=${P.tuft} class="f-hi"/>`;
};

const torso = () => {
  const [bx, by, brx, bry] = R.belly;
  return svg`
    <path d=${P.body} fill="url(#body)"/>
    <ellipse cx=${bx} cy=${by} rx=${brx} ry=${bry} fill="url(#belly)"/>`;
};

const scarf = (tail) => svg`
  <path d=${P.scarf} class="f-scarf"/>
  <path d=${P.scarfStripes} class="s-stripe" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  ${tail ? svg`<path class="scarf-tail f-scarf-tail" d=${P.scarfTail}/>` : ''}`;

/** Quill from the shoulders up, in quillShapes units (0 0 240 300). */
export const quillHead = () => svg`
  ${torso()}
  <path d=${P.wingL} class="f-limb"/><path d=${P.wingR} class="f-limb"/>
  ${scarf(false)}
  ${face()}`;

/** The feather pen: nib at (0, 0), feather pointing straight up, 90 units tall. */
export const PEN = svg`
  <path d="M0-14C-15-30-19-58-3-86C3-72 15-54 11-34 9-25 5-19 0-14Z" class="f-feather"/>
  <path d="M-1-22L-11-34M-2-36L-13-48M-2-50L-12-62M1-30L8-38M1-46L9-52" class="s-feather" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M0-4V-80" class="s-feather" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M-4-15L0 2 4-15Z" class="f-iris"/>`;

/**
 * Whole Quill, standing, with rig groups for CSS to animate:
 * .hop (whole body, pivots at the feet), .tilt, .wing-l, .wing-r, .eye,
 * .pupil, .brows, .beak-shut / .beak-open, .scarf-tail.
 * held: draw the pen in the right wing. extra: more SVG drawn on top of him,
 * inside the rig (so it hops with him), in quillShapes units.
 */
export const quillFull = ({ held = false, extra = '' } = {}) => {
  const [lx, ly, lw, lh, lr] = R.legL, [rx, ry, rw, rh, rr] = R.legR;
  return svg`
    <ellipse class="f-shadow" cx=${R.shadow[0]} cy=${R.shadow[1]} rx=${R.shadow[2]} ry=${R.shadow[3]}/>
    <g class="hop"><g class="tilt">
      <rect x=${lx} y=${ly} width=${lw} height=${lh} rx=${lr} class="f-limb"/>
      <ellipse cx=${R.footL[0]} cy=${R.footL[1]} rx=${R.footL[2]} ry=${R.footL[3]} class="f-foot"/>
      <rect x=${rx} y=${ry} width=${rw} height=${rh} rx=${rr} class="f-limb"/>
      <ellipse cx=${R.footR[0]} cy=${R.footR[1]} rx=${R.footR[2]} ry=${R.footR[3]} class="f-foot"/>
      ${torso()}
      <path class="wing-l f-limb" d=${P.wingL}/>
      <g class="wing-r"><path d=${P.wingR} class="f-limb"/>
        ${held ? svg`<g class="held" transform="translate(206 214) rotate(28)">${PEN}</g>` : ''}</g>
      ${scarf(true)}
      ${face()}
      ${extra}
    </g></g>`;
};

export const brandPaint = css`
  .f-tile { fill: var(--logo-tile); } .f-ring { fill: var(--logo-tile-ring); }
  .f-belly { fill: var(--quill-belly); } .f-iris { fill: var(--quill-iris); }
  .f-limb { fill: var(--quill-limb); } .f-scarf { fill: var(--quill-scarf); }
  .f-scarf-tail { fill: var(--quill-scarf-tail); }
  .f-beak { fill: var(--quill-beak); } .f-hi { fill: var(--quill-body-hi); }
  .f-foot { fill: var(--quill-foot); }
  .f-mouth { fill: var(--quill-beak-mouth); } .f-tongue { fill: var(--quill-tongue); }
  .f-feather { fill: var(--quill-feather); }
  .f-shadow { fill: var(--quill-limb); opacity: 0.22; }
  .s-stripe { stroke: var(--quill-scarf-stripe); } .s-beak { stroke: var(--quill-beak-lo); }
  .s-feather { stroke: var(--quill-feather-lo); }
  .c-hi { stop-color: var(--quill-body-hi); } .c-mid { stop-color: var(--quill-body-mid); }
  .c-lo { stop-color: var(--quill-body-lo); }
  .c-belly { stop-color: var(--quill-belly); } .c-belly-lo { stop-color: var(--quill-belly-lo); }
  .c-cheek { stop-color: var(--quill-cheek); }
  .beak-open { opacity: 0; }
  .eye, .pupil, .hop, .tilt, .wing-l, .wing-r, .brows, .scarf-tail { transform-box: fill-box; }
  .eye { transform-origin: center; }
`;
