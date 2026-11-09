import { GameScene, esc } from './GameScene.js';
import { shuffle } from './shuffle.js';

// "Misconception Monster": a cartoon monster states a tempting wrong idea, the
// learner picks the evidence that breaks it. Right pick = a hit; wrong pick =
// a lost heart and the monster laughs. Lose every heart and the monster wins
// the round - fight again, nothing is lost. Beat every claim to win a pack.
//
// CONFIG: { ariaLabel, title?, monster: { name, tone? (1-8) }, hearts? (3),
//   rounds: [ { who?: an id from the course field guide, its face shows; omit
//               it and this game needs no field guide at all - claim, counter,
//               why, traps: [ { text, why } ] } ] }
//   counter = the one evidence statement that breaks the claim; why = what the
//   learner should take away; traps = 2 tempting wrong counters, each with the
//   reason it does not work.
const MOODS = {
  idle: '<path d="M34 66 q16 10 32 0" class="mo"/>',
  hit: '<path d="M36 70 q14 -10 28 0" class="mo"/><path d="M74 30 l6 -6 M78 38 l8 -2" class="sp"/>',
  laugh: '<path d="M32 62 q18 22 36 0 z" class="mf"/>',
  down: '<path d="M38 72 q12 -6 24 0" class="mo"/>',
};

export function monsterSvg(tone, mood = 'idle', size = 96) {
  const eyes = mood === 'hit' || mood === 'down'
    ? '<path d="M32 44 l10 8 M42 44 l-10 8 M58 44 l10 8 M68 44 l-10 8" class="mo"/>'
    : '<circle cx="38" cy="46" r="8" class="ey"/><circle cx="62" cy="46" r="8" class="ey"/><circle cx="40" cy="47" r="3.5" class="pu"/><circle cx="60" cy="47" r="3.5" class="pu"/>';
  return `<svg class="mn-svg mn-${mood}" viewBox="0 0 100 100" width="${size}" height="${size}" style="--t:var(--sim-series-${tone})" aria-hidden="true">
    <path d="M26 30 l-8 -16 l16 8 z M74 30 l8 -16 l-16 8 z" class="ho"/>
    <path d="M14 62 C10 30 34 16 50 16 C68 16 90 30 86 62 C84 82 66 90 50 90 C32 90 16 82 14 62 Z" class="bo"/>
    ${eyes}${MOODS[mood] || MOODS.idle}
    <path d="M22 86 q4 8 10 2 M78 86 q-4 8 -10 2" class="ho2"/>
  </svg>`;
}

export const MONSTER_CSS = `
.mn-svg { display:block; flex:none; overflow:visible; }
.mn-svg .bo { fill:var(--t); }
.mn-svg .ho { fill:var(--sim-bg-deep); stroke:var(--t); stroke-width:3; stroke-linejoin:round; }
.mn-svg .ho2 { fill:none; stroke:var(--t); stroke-width:5; stroke-linecap:round; }
.mn-svg .ey { fill:var(--sim-label); }
.mn-svg .pu { fill:var(--sim-bg-deep); }
.mn-svg .mo { fill:none; stroke:var(--sim-bg-deep); stroke-width:4; stroke-linecap:round; }
.mn-svg .mf { fill:var(--sim-bg-deep); stroke:var(--sim-bg-deep); stroke-width:3; stroke-linejoin:round; }
.mn-svg .sp { fill:none; stroke:var(--sim-label); stroke-width:3; stroke-linecap:round; }
.mn-svg.mn-idle { animation:gm-float 2.4s ease-in-out infinite; }
.mn-svg.mn-hit { animation:gm-hit .5s ease-out; }
.mn-svg.mn-laugh { animation:gm-hit .6s ease-out 2; }
.mn-arena { display:flex; align-items:center; gap:var(--sim-space-3); }
.mn-arena .gm-bubble { flex:1 1 0; }
.mn-who { display:flex; align-items:center; gap:var(--sim-space-2); font-size:var(--sim-text-sm); font-weight:800; color:var(--sim-label-muted); }
.mn-who .ek-av { width:36px; height:36px; }
.mn-opts { display:flex; flex-direction:column; gap:var(--sim-space-2); }
.mn-opt { text-align:left; line-height:1.25; font-size:var(--sim-text-md); }
.mn-opt.mn-no { border-color:var(--sim-warning); opacity:.7; }
.mn-opt.mn-yes { border-color:var(--sim-success); background:var(--sim-success); color:var(--sim-bg-deep); }
.mn-recap { display:flex; flex-direction:column; gap:var(--sim-space-1); margin:0; padding:0; list-style:none; font-size:var(--sim-text-sm); }
.mn-recap li { padding:var(--sim-space-1) var(--sim-space-2); border-left:4px solid var(--sim-success); background:var(--sim-bg-surface); border-radius:var(--sim-radius-sm); }
.mn-recap s { color:var(--sim-label-muted); }
@media (prefers-reduced-motion: reduce) { .mn-svg { animation:none !important; } }
`;

export class MonsterScene extends GameScene {
  static CSS = MONSTER_CSS;
  // Claim/counter/traps is a plain misconception-buster with no classification
  // content of its own; `who` (an organism face) is the only optional link to a
  // course data file, and GameScene's default already covers it (this line is
  // just explicit about it, since it matters for how this game runs).
  static NEEDS_FIELD_GUIDE = false;

  init() {
    this.rounds = this.cfg.rounds || [];
    this.maxHearts = this.cfg.hearts || 3;
    this.attempt = 0;
    this._reset();
  }

  _reset() {
    this.idx = 0;
    this.lives = this.maxHearts;
    this.mood = 'idle';
    this.stage = 'ask'; // ask | hit | lost | won
    this.tried = new Set();
    this.clean = new Set();   // round indexes answered right first time
    this.msg = '';
    this.attempt++;
    this.opts = this._options();
  }

  _options() {
    const r = this.rounds[this.idx];
    if (!r) return [];
    const all = [{ text: r.counter, ok: true, why: r.why }, ...(r.traps || []).map((t) => ({ text: t.text, ok: false, why: t.why }))];
    return shuffle(all);
  }

  act(name, d) {
    if (name === 'pick') return this._pick(Number(d.i));
    if (name === 'next') { this.idx++; this.tried = new Set(); this.msg = ''; this.mood = 'idle'; this.stage = 'ask'; this.opts = this._options(); return this.paint(); }
    if (name === 'again') { this._reset(); return this.paint(); }
    return undefined;
  }

  _pick(i) {
    const o = this.opts[i];
    if (!o || this.stage !== 'ask' || this.tried.has(i)) return;
    const r = this.rounds[this.idx];
    if (o.ok) {
      if (!this.tried.size) this.clean.add(this.idx);
      if (r.who) this.award(r.who, this.tried.size ? 'bronze' : 'silver');
      this.mood = 'hit';
      this.stage = this.idx + 1 >= this.rounds.length ? 'won' : 'hit';
      this.msg = `<b>Direct hit!</b> ${esc(o.why)}`;
      if (this.stage === 'won' && this.coll) { this.pack(1); this.coll.bump('monster:wins'); }
    } else {
      this.tried.add(i);
      this.lives--;
      this.mood = 'laugh';
      this.msg = `<b>Ha!</b> ${esc(o.why)}`;
      if (this.lives <= 0) this.stage = 'lost';
    }
    this.paint();
  }

  view() {
    const m = this.cfg.monster || { name: 'Fibbo', tone: 6 };
    const r = this.rounds[this.idx];
    const done = this.stage === 'won';
    const hp = this.rounds.length - (done ? this.rounds.length : this.idx + (this.stage === 'hit' ? 1 : 0));
    const head = this.head(this.cfg.title || 'Misconception Monster', this.hearts(this.lives, this.maxHearts));
    if (done) return `${head}${this._end(m)}`;
    if (this.stage === 'lost') {
      return `${head}<div class="mn-arena">${monsterSvg(m.tone, 'laugh', 110)}<div class="gm-bubble">${esc(m.name)} wins this round. Every wrong idea has a trap in it - look for the evidence, not the story.</div></div>
        <div class="gm-msg gm-bad">${this.msg}</div><div class="gm-grow"></div><div class="ek-foot">${this.btn('Fight again', 'again', {}, 'ek-btn ek-run', ' data-focus="1"')}</div>`;
    }
    const who = r.who ? this.fg?.org(r.who) : null;
    const opts = this.opts.map((o, i) => {
      const state = this.stage === 'ask' ? (this.tried.has(i) ? ' mn-no' : '') : (o.ok ? ' mn-yes' : ' mn-no');
      const dis = this.stage !== 'ask' || this.tried.has(i) ? ' disabled' : '';
      return this.btn(esc(o.text), 'pick', { i }, `ek-chipbtn mn-opt${state}`, dis);
    }).join('');
    return `${head}
      <div class="gm-col"><div class="gm-row"><span class="gm-h2">${esc(m.name)}'s health</span><div class="gm-grow">${this.bar(hp, this.rounds.length, m.tone)}</div></div>
      <div class="mn-arena">${monsterSvg(m.tone, this.mood)}<div class="gm-bubble">${who ? `<div class="mn-who">${this.av(who)}<span>${esc(who.name)}</span></div>` : ''}“${esc(r.claim)}”</div></div></div>
      <p class="gm-h2">Pick the evidence that breaks it:</p>
      <div class="mn-opts">${opts}</div>
      ${this.msg ? `<p class="gm-msg ${this.stage === 'ask' ? 'gm-bad' : 'gm-good'}">${this.msg}</p>` : ''}
      <div class="gm-grow"></div>
      <div class="ek-foot">${this.stage === 'hit' ? this.btn('Next claim ▶', 'next', {}, 'ek-btn ek-run', ' data-focus="1"') : ''}</div>`;
  }

  _end(m) {
    const stars = this.lives >= this.maxHearts ? 3 : this.lives >= 2 ? 2 : 1;
    const recap = this.rounds.map((r, i) => `<li><s>${esc(r.claim)}</s><br>${esc(r.why)}${this.clean.has(i) ? '' : ' (needed a second try)'}</li>`).join('');
    return `<div class="mn-arena">${monsterSvg(m.tone, 'down', 96)}<div class="gm-bubble">${esc(m.name)} is defeated! ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div></div>
      <p class="gm-msg gm-good">${this.msg}${this.coll ? ' <b>+1 card pack</b> for your collection.' : ''}</p>
      <div class="ek-scroll"><ul class="mn-recap">${recap}</ul></div>
      <div class="ek-foot">${this.btn('Fight again', 'again')}</div>`;
  }
}
