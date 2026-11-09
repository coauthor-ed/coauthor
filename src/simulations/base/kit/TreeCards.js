// Shared drawing helper (plain functions, not a scene): the course's recurring
// "tree of life" throughline, drawn as chunky character cards on a rail - the
// same look as the s08 key board (KeyBuilderScene). It replaces the thin SVG
// ClassificationTreeMotif for the story beats; each lesson's close scene builds
// its own explicit spec and calls treeCards(). No state is kept between calls.
//
// spec: {
//   root:     { label, state? }                 state: 'named' (default) | 'new'
//   branches: [{ k, state?, name?, sub?, kids? }]
//       k      a kingdom key from KINGDOMS (gives name, identity tone, sample creature)
//       state  'named' (default) | 'new' (just added: glow) | 'placeholder' (dashed, not yet built)
//       name/sub  override the kingdom name / sample line (placeholders with no k)
//       kids   [{ name, state?, tone?, art?, kids? }]  chips hung under the card;
//              nested kids are drawn inset, so real hierarchy stays visible
//   caption?: string
//   guest?:   { art, tone, text }               dashed "not placed yet" chip under the caption
// }
// Requires the caller to inject TREE_CARDS_CSS (includes the character CSS).

import { characterSvg, CHARACTER_CSS } from './KeyCharacters.js';

// Identity tones and sample creatures: the same five as slides s06/s08/s09 of L02.
export const KINGDOMS = {
  Monera: { tone: 5, art: 'bacterium', eg: 'Bacterium' },
  Protista: { tone: 7, art: 'pond', eg: 'Pond eukaryote' },
  Fungi: { tone: 8, art: 'mushroom', eg: 'Filamentous fungus' },
  Plantae: { tone: 3, art: 'sprout', eg: 'Green plant' },
  Animalia: { tone: 4, art: 'critter', eg: 'Animal' },
};

const tint = (tone) => `--t:var(--sim-series-${tone})`;
// Width of a label's longest word in em (bold body font, measured advances;
// unknown glyphs count 0.6). The CSS below uses it to shrink a label just enough
// for that word to fit its column, so long words do not break mid-word.
const ADV = { a:.56,b:.61,c:.48,d:.61,e:.55,f:.38,g:.62,h:.6,i:.27,j:.27,k:.56,l:.33,m:.89,n:.6,o:.59,p:.61,q:.61,r:.41,s:.49,t:.4,u:.59,v:.53,w:.86,x:.56,y:.53,z:.48,
  A:.75,B:.7,C:.68,D:.77,E:.61,F:.57,G:.74,H:.78,I:.3,J:.37,K:.69,L:.57,M:.88,N:.75,O:.8,P:.66,Q:.8,R:.7,S:.64,T:.63,U:.74,V:.73,W:1.12,X:.69,Y:.63,Z:.62,
  '.':.26,',':.26,':':.26,';':.26,'-':.44,'(':.38,')':.38,'/':.33,'+':.6,'&':.75,"'":.26,'!':.26,'?':.47,'%':.95 };
const wordEm = (text) => {
  const words = String(text).replace(/<[^>]*>/g, '').split(/[\s-]+/);
  const em = Math.max(1, ...words.map((w) => [...w].reduce((n, c) => n + (ADV[c] ?? .6), 0)));
  return Math.round(em * 100) / 100;
};

function kidMarkup(kid, parentTone) {
  const tone = kid.tone || parentTone;
  const state = kid.state || 'named';
  const art = kid.art && state !== 'placeholder' ? `<span class="tc-kav">${characterSvg(kid.art, tone)}</span>` : '';
  const inner = state === 'placeholder' ? `<span class="tc-kq">?</span>` : art;
  const nested = kid.kids && kid.kids.length
    ? `<ul class="tc-kids">${kid.kids.map((k) => kidMarkup(k, tone)).join('')}</ul>`
    : '';
  return `<li class="tc-kid tc-${state}${art ? ' tc-kid--art' : ''}" style="${tint(tone)}"><span class="tc-chip">${inner}<span class="tc-kname" style="--w:${wordEm(kid.name)}">${kid.name}</span></span>${nested}</li>`;
}

function branchMarkup(b, i) {
  const king = b.k ? KINGDOMS[b.k] : null;
  const state = b.state || 'named';
  const tone = king ? king.tone : 1;
  const name = b.name || b.k || '?';
  const sub = b.sub || (king && state !== 'placeholder' ? king.eg : '');
  const bubble = state === 'placeholder' || !king
    ? `<span class="tc-bubble tc-bubble--q">?</span>`
    : `<span class="tc-bubble">${characterSvg(king.art, king.tone)}</span>`;
  const kids = b.kids && b.kids.length
    ? `<ul class="tc-kids">${b.kids.map((k) => kidMarkup(k, tone)).join('')}</ul>`
    : '';
  return `<li class="tc-b tc-${state}" style="${tint(tone)};--i:${i}">
    <span class="tc-stub" aria-hidden="true"></span>
    <div class="tc-card"><span class="tc-bubble-wrap">${bubble}</span>
      <span class="tc-text"><span class="tc-name" style="--w:${wordEm(name)}">${name}</span>${sub ? `<span class="tc-eg" style="--w:${wordEm(sub)}">${sub}</span>` : ''}</span></div>
    ${kids}
  </li>`;
}

/** @returns {string} markup for a tree; wrap it in a container you own. */
export function treeCards(spec) {
  const root = spec.root || { label: 'Living things' };
  const branches = spec.branches.map(branchMarkup).join('');
  const cap = spec.caption ? `<div class="tc-cap">${spec.caption}</div>` : '';
  const g = spec.guest
    ? `<div class="tc-guest"><span class="tc-gav" style="${tint(g_tone(spec.guest))}">${characterSvg(spec.guest.art, g_tone(spec.guest))}</span><span>${spec.guest.text}</span></div>`
    : '';
  return `<div class="tc">
    <div class="tc-root tc-root--${root.state || 'named'}">${root.label}</div>
    <div class="tc-trunk" aria-hidden="true"></div>
    <ul class="tc-branches" style="--n:${spec.branches.length}">${branches}</ul>
    ${cap}${g}
  </div>`;
}
const g_tone = (guest) => guest.tone || 2;

export const TREE_CARDS_CSS = CHARACTER_CSS + `
.tc { container-type:inline-size; width:100%; display:flex; flex-direction:column; align-items:stretch; padding:var(--sim-space-2) 2px var(--sim-space-1); color:var(--sim-label); font:var(--sim-text-sm)/1.3 var(--sim-font); }
.tc * { box-sizing:border-box; }
.tc-root { align-self:center; padding:var(--sim-space-2) var(--sim-space-5); border: calc(3px * var(--look-rim)) solid var(--sim-accent); border-radius:var(--sim-radius-pill); background:var(--sim-bg-surface); box-shadow:0 calc(4px * var(--look-lip)) 0 var(--sim-accent); font-size:var(--sim-text-lg); font-weight:800; }
.tc-root--new { animation:tc-glow 1.8s ease-in-out infinite; --t:var(--sim-accent); }
.tc-trunk { align-self:center; width:5px; height:22px; border-radius:var(--sim-radius-sm); background:var(--sim-stroke); }
.tc-branches { --tcw:calc((100cqw - 4px - (var(--n,5) - 1) * var(--sim-space-2)) / var(--n,5)); list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(var(--n,5),minmax(0,1fr)); gap:var(--sim-space-2); align-items:start; }
.tc-b { position:relative; display:flex; flex-direction:column; align-items:stretch; padding-top:22px; min-width:0; }
.tc-b::before { content:''; position:absolute; top:0; left:-4px; right:-4px; height:5px; background:var(--sim-stroke); }
.tc-b:first-child::before { left:50%; border-radius:3px 0 0 3px; }
.tc-b:last-child::before { right:50%; border-radius:0 3px 3px 0; }
.tc-b:only-child::before { display:none; }
.tc-stub { position:absolute; top:0; left:50%; width:5px; height:22px; margin-left:-2px; border-radius:0 0 3px 3px; background:var(--t); }
.tc-card { display:flex; flex-direction:column; align-items:center; gap:var(--sim-space-2); padding:var(--sim-space-3) var(--sim-space-1) var(--sim-space-2); border: calc(2px * var(--look-rim)) solid var(--t); border-radius:var(--sim-radius-lg); background:var(--sim-bg-surface); box-shadow:0 calc(4px * var(--look-lip)) 0 var(--t); text-align:center; position:relative; z-index:1; animation:tc-pop .4s ease-out both; animation-delay:calc(var(--i) * 110ms + 120ms); }
.tc-bubble { display:grid; place-items:center; width:58px; height:58px; border: calc(3px * var(--look-rim)) solid var(--t); border-radius:50%; background:var(--sim-bg-deep); }
.tc-bubble .ek-av { width:44px; height:44px; }
.tc-bubble--q { border-style:dashed; border-color:var(--sim-label-muted); color:var(--sim-label-muted); font-size:var(--sim-text-2xl); font-weight:800; }
.tc-text { display:flex; flex-direction:column; gap:var(--sim-space-1); min-width:0; }
.tc-name { font-size:var(--sim-text-md); font-weight:800; overflow-wrap:anywhere; }
.tc-eg { font-size:var(--sim-text-sm); font-weight:700; color:var(--sim-label-muted); overflow-wrap:anywhere; }
/* Auto-fit (landscape columns): a label whose longest word would not fit its
   column shrinks just enough to, never below 75% of its normal size; a label
   that already fits keeps its size (the min() picks the larger cap). --w is that
   word's width in em (see wordEm), the constants are the card / chip padding and
   borders. Portrait stacks full-width rows and resets. */
.tc-name { font-size:min(var(--sim-text-md), max(calc(var(--sim-text-md) * .75), calc((var(--tcw) - 12px) / (var(--w,1) * 1.03)))); }
.tc-eg { font-size:min(var(--sim-text-sm), max(calc(var(--sim-text-sm) * .75), calc((var(--tcw) - 12px) / (var(--w,1) * 1.03)))); }
.tc-new > .tc-card { border-width:3px; animation:tc-pop .4s ease-out both, tc-glow 1.8s ease-in-out .6s infinite; animation-delay:calc(var(--i) * 110ms + 120ms), calc(var(--i) * 110ms + 700ms); }
.tc-placeholder > .tc-card { border-style:dashed; border-color:var(--sim-label-muted); box-shadow:none; background:transparent; }
.tc-placeholder > .tc-card .tc-name { color:var(--sim-label-muted); }
.tc-placeholder > .tc-stub { background:var(--sim-label-muted); opacity:.6; }

/* Chips hung under a card: a centred stem joins siblings; nested kids sit inset. */
.tc-kids { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; align-items:stretch; }
.tc-kid { position:relative; margin-top:10px; display:flex; flex-direction:column; align-items:stretch; }
.tc-kid::before { content:''; position:absolute; left:50%; top:-10px; width:4px; height:10px; margin-left:-2px; background:var(--t); }
.tc-chip { display:flex; align-items:center; justify-content:center; gap:var(--sim-space-1); padding:var(--sim-space-1) var(--sim-space-2); border: calc(2px * var(--look-rim)) solid var(--t); border-radius:var(--sim-radius-md); background:var(--sim-bg-surface); font-size:var(--sim-text-sm); font-weight:800; text-align:center; position:relative; z-index:1; animation:tc-pop .4s ease-out both; animation-delay:.7s; }
.tc-kid--art > .tc-chip { flex-direction:column; gap:var(--sim-space-1); }
.tc-kname { min-width:0; overflow-wrap:anywhere; font-size:min(1em, max(.75em, calc((var(--tcw) - 20px) / (var(--w,1) * 1.03)))); }
.tc-kid .tc-kid .tc-kname { font-size:min(1em, max(.75em, calc((var(--tcw) - 27px) / (var(--w,1) * 1.03)))); }
.tc-kav { display:grid; place-items:center; flex:none; width:30px; height:30px; }
.tc-kav .ek-av { width:30px; height:30px; }
.tc-kq { color:var(--sim-label-muted); font-size:var(--sim-text-sm); }
.tc-kid.tc-new > .tc-chip { border-width:3px; animation:tc-pop .4s ease-out both, tc-glow 1.8s ease-in-out 1.1s infinite; animation-delay:.7s, 1.2s; }
.tc-kid.tc-placeholder > .tc-chip { border-style:dashed; border-color:var(--sim-label-muted); color:var(--sim-label-muted); background:transparent; }
.tc-kid .tc-kids { margin-left:7px; }
.tc-kid .tc-kid .tc-chip { font-size:var(--sim-text-sm); padding:var(--sim-space-1) var(--sim-space-1); }

.tc-cap { margin-top:26px; text-align:center; font-size:var(--sim-text-sm); font-weight:800; color:var(--sim-label-muted); }
.tc-guest { align-self:center; display:flex; align-items:center; gap:var(--sim-space-2); margin-top:12px; padding:var(--sim-space-1) var(--sim-space-3) var(--sim-space-1) var(--sim-space-2); border: calc(2px * var(--look-rim)) dashed var(--sim-warning); border-radius:var(--sim-radius-pill); font-size:var(--sim-text-sm); }
.tc-gav { display:grid; place-items:center; width:34px; height:34px; border-radius:50%; background:var(--sim-bg-surface); }
.tc-gav .ek-av { width:28px; height:28px; }

/* Portrait: the tree turns on its side - trunk down the left, one card per row. */
.sim-dom-root--portrait .tc-root { align-self:flex-start; }
.sim-dom-root--portrait .tc-trunk { align-self:flex-start; margin-left:27px; }
.sim-dom-root--portrait .tc-branches { display:flex; flex-direction:column; align-items:stretch; gap:var(--sim-space-3); margin-left:27px; padding-left:34px; }
.sim-dom-root--portrait .tc-b { padding-top:0; }
.sim-dom-root--portrait .tc-b::before { top:-14px; bottom:-14px; left:-34px; right:auto; width:5px; height:auto; border-radius:0; }
.sim-dom-root--portrait .tc-b:first-child::before { top:-22px; left:-34px; right:auto; border-radius:0; }
.sim-dom-root--portrait .tc-b:last-child::before { bottom:auto; height:58px; left:-34px; right:auto; border-radius:0 0 0 3px; }
.sim-dom-root--portrait .tc-b:last-child:first-child::before { height:66px; }
.sim-dom-root--portrait .tc-stub { top:39px; left:-34px; width:34px; height:5px; margin:0; border-radius:0 3px 3px 0; }
.sim-dom-root--portrait .tc-card { flex-direction:row; text-align:left; gap:var(--sim-space-3); padding:var(--sim-space-2) var(--sim-space-3); }
.sim-dom-root--portrait .tc-name { font-size:var(--sim-text-lg); }
.sim-dom-root--portrait .tc-eg { font-size:var(--sim-text-sm); }
.sim-dom-root--portrait .tc-kname, .sim-dom-root--portrait .tc-kid .tc-kid .tc-kname { font-size:inherit; }
.sim-dom-root--portrait .tc-kids { margin:8px 0 0 26px; padding-left:12px; border-left:4px solid var(--t); border-radius:0 0 0 4px; align-items:flex-start; }
.sim-dom-root--portrait .tc-kid { margin-top:8px; align-items:flex-start; }
.sim-dom-root--portrait .tc-kid:first-child { margin-top:0; }
.sim-dom-root--portrait .tc-kid::before { display:none; }
.sim-dom-root--portrait .tc-kid--art > .tc-chip { flex-direction:row; gap:var(--sim-space-2); }
.sim-dom-root--portrait .tc-chip { font-size:var(--sim-text-sm); padding:var(--sim-space-2) var(--sim-space-3); }
.sim-dom-root--portrait .tc-kid .tc-kids { margin:8px 0 0 6px; }
.sim-dom-root--portrait .tc-cap { margin-top:22px; }

@keyframes tc-pop { from { transform:scale(.9); opacity:0; } to { transform:scale(1); opacity:1; } }
@keyframes tc-glow { 0%, 100% { box-shadow:0 calc(4px * var(--look-lip)) 0 var(--t), 0 0 0 0 var(--t); } 50% { box-shadow:0 calc(4px * var(--look-lip)) 0 var(--t), 0 0 0 6px transparent; } }
@media (prefers-reduced-motion:reduce) { .tc-card, .tc-chip, .tc-root--new { animation:none !important; } }
`;
