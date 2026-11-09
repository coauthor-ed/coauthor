/**
 * ArcadeMatchScene - recall a pair: the prompt waits at the bottom, answers go
 * past; tap the one that belongs to it before it gets away. Distractors come
 * from the same deck (the same `group` first), so the confusable ones meet. A
 * wrong tap shows why and the prompt stays; letting the right answer get away
 * costs a heart and the pair comes back later.
 * Shared behaviour (pace, why card, mix-ups, boss round, HUD): ArcadeScene.
 *
 * Skins (CONFIG.skin): 'bubbles' (default: answers drift across in bubbles)
 * and 'range' (answers pop up on targets at a fair-ground range).
 *
 * CONFIG = {
 *   title: 'Formula pop',
 *   pairs: [{ prompt: 'Power', answer: 'work / time', why?, art?, group?, myth? }],
 *   ask?: 'Tap what matches',  (the line above the prompt)
 *   skin?: 'bubbles', rounds?: 9, lives?: 3, relaxed?: false, drift?: 9 (seconds to cross), choices?: 4,
 * }
 * Answers must be unique within a group of choices: two pairs with the same
 * answer text never appear together.
 */
import { lookOf } from './lookProfile.js';
import { ArcadeScene, shuffle, HUD_H, isDarkTheme } from './ArcadeScene.js';
import { W, rr, font, mix, alpha, lighten, darken, stadium, drawFloor } from './SimLook.js';

const LANES = [150, 232, 314];
const SPOTS = [[110, 300], [250, 250], [390, 300], [530, 250], [180, 170], [460, 170]];
// Phone: the same design shows at about half size, so bubbles and targets are bigger and need more room.
const LANES_PHONE = [122, 222, 322];
const SPOTS_PHONE = [[120, 262], [340, 118], [560, 262], [120, 118], [340, 262], [560, 118]];
const HOW = {
  bubbles: 'Tap the bubble that matches the card at the bottom before it floats away.',
  range: 'Hit the target that matches the card at the bottom before it drops.',
};

export class ArcadeMatchScene extends ArcadeScene {
  static KIND = 'Match it';
  static HOW = HOW.bubbles;
  static ARIA_LABEL = 'A matching game: answers go past; tap the one that matches the prompt card.';
  static DEFAULTS = { drift: 9, rounds: 9, choices: 4, skin: 'bubbles' };

  checkConfig(cfg) {
    const p = [];
    cfg.how = cfg.how || HOW[cfg.skin];
    if (!HOW[cfg.skin]) p.push(`CONFIG.skin must be one of ${Object.keys(HOW).join(', ')}`);
    const pairs = cfg.pairs || [];
    if (pairs.length < 4) p.push('CONFIG.pairs needs at least 4 pairs (3 distractors each)');
    for (const it of pairs) if (!it.prompt || !it.answer) p.push(`pair ${JSON.stringify(it).slice(0, 60)} needs prompt and answer`);
    if (new Set(pairs.map((x) => x.answer)).size < 4) p.push('CONFIG.pairs needs at least 4 different answers');
    return p;
  }

  menuSample() { return (this.cfg.pairs || []).slice(0, 3).map((x) => ({ ...x, name: x.prompt })); }
  bossPool() { return this.cfg.pairs; }
  mascotSpot() {
    if (this.phoneUi()) return null;
    const live = this.play?.shots?.find((s) => !s.leaving);
    return { x: 70, y: 498, h: 92, lookAt: live ? this._pos(live) : null };
  }

  beginRun(run) {
    run.queue = this.balanced(this.cfg.pairs, (x) => x.group || x.answer, Math.min(this.cfg.rounds, this.cfg.pairs.length * 2));
    this.play = { cur: null, shots: [], cycle: [], ci: 0, spawnIn: 0, n: 0, popped: [] };
    this._next();
  }

  _choices(pair) {
    const all = this.cfg.pairs.filter((x) => x.answer !== pair.answer);
    const same = shuffle(all.filter((x) => pair.group && x.group === pair.group));
    const rest = shuffle(all.filter((x) => !same.includes(x)));
    const seen = new Set([pair.answer]);
    const out = [];
    for (const x of [...same, ...rest]) {
      if (out.length >= this.cfg.choices - 1) break;
      if (!seen.has(x.answer)) { seen.add(x.answer); out.push(x.answer); }
    }
    // the right answer comes within the first two, then everything cycles
    const cyc = shuffle(out);
    cyc.splice(Math.floor(Math.random() * 2), 0, pair.answer);
    return cyc;
  }

  _next() {
    const pl = this.play;
    const pair = this.run.queue.shift();
    pl.shots = pl.shots.map((s) => ({ ...s, leaving: true }));
    if (!pair) { pl.cur = null; return; }
    pl.cur = { pair, age: 0 };
    pl.cycle = this._choices(pair);
    pl.ci = 0;
    pl.spawnIn = 0;
  }

  _spawn() {
    const pl = this.play;
    const text = pl.cycle[pl.ci % pl.cycle.length];
    pl.ci += 1;
    const range = this.cfg.skin === 'range';
    const busy = new Set(pl.shots.filter((s) => !s.leaving).map((s) => s.lane));
    let lane = pl.n % (range ? SPOTS.length : LANES.length);
    for (let k = 0; k < 6 && busy.has(lane); k++) lane = (lane + 1) % (range ? SPOTS.length : LANES.length);
    pl.n += 1;
    pl.shots.push({ text, lane, x: pl.ci === 1 ? W - 120 : W + 100, age: 0, right: text === pl.cur.pair.answer, id: pl.n });
  }

  tickPlay(d, real) {
    const pl = this.play;
    pl.popped = pl.popped.filter((q) => (q.t += real) < 0.4);
    const range = this.cfg.skin === 'range';
    for (const s of pl.shots) {
      s.age += real;
      if (s.leaving) s.fade = (s.fade || 0) + real * 3;
      else if (!range) s.x -= ((W + 200) / this.cfg.drift) * d;
    }
    pl.shots = pl.shots.filter((s) => !(s.fade >= 1));
    if (!pl.cur) return;
    const live = pl.shots.filter((s) => !s.leaving);
    const up = this.cfg.drift * 0.55;
    const gone = live.find((s) => (range ? s.age * this.run.speed > up : s.x < -100));
    if (gone) {
      pl.shots = pl.shots.filter((s) => s !== gone);
      if (gone.right) {
        const pair = pl.cur.pair;
        pl.shots = pl.shots.map((s) => ({ ...s, leaving: true }));
        pl.cur = null;
        this.slip({ item: pair, title: 'It got away!', said: 'let it go', answer: `${pair.prompt} = ${pair.answer}`, why: pair.why });
        return;
      }
    }
    pl.spawnIn -= d;
    const gap = this.cfg.drift / (range ? 3.4 : 4.6);
    if (pl.spawnIn <= 0 && live.length < (range ? 3 : 5)) { this._spawn(); pl.spawnIn = gap; }
  }

  afterWhy(w) { if (w.lostLife) this._next(); }

  onHit(id, sid) {
    if (id !== 'shot') return;
    const pl = this.play;
    const s = pl.shots.find((q) => q.id === sid && !q.leaving);
    if (!s || !pl.cur) return;
    const pos = this._pos(s);
    const pair = pl.cur.pair;
    pl.shots = pl.shots.filter((q) => q !== s);
    pl.popped.push({ x: pos.x, y: pos.y, t: 0, right: s.right });
    if (s.right) {
      this.right(pos.x, pos.y - 30, pair);
      if (this.itemDone()) this._next();
      else { pl.shots = pl.shots.map((q) => ({ ...q, leaving: true })); pl.cur = null; }
    } else {
      this.wrongTry({ item: pair, said: s.text, answer: `${pair.prompt} = ${pair.answer}`, why: pair.why, x: pos.x, y: pos.y });
    }
  }

  _lanes() { return this.phoneUi() ? LANES_PHONE : LANES; }

  _pos(s) {
    if (this.cfg.skin === 'range') {
      const [x, y] = (this.phoneUi() ? SPOTS_PHONE : SPOTS)[s.lane];
      const u = Math.min(1, s.age / 0.3) * (s.leaving ? Math.max(0, 1 - (s.fade || 0)) : 1);
      return { x, y: y + (1 - u) * 60, u };
    }
    return { x: s.x, y: this._lanes()[s.lane] + Math.sin(s.age * 2 + s.id) * 8, u: 1 };
  }

  floeY() { return this.cfg.skin === 'range' ? 372 : 400; }

  drawPlay(ctx, c, t) {
    const pl = this.play;
    const range = this.cfg.skin === 'range';
    if (range) this._drawRangeSet(ctx, c);
    else this._drawBubbleSet(ctx, c, t);
    for (const s of pl.shots) {
      const pos = this._pos(s);
      const a = s.leaving ? Math.max(0, 1 - (s.fade || 0)) : 1;
      if (range) this._drawTarget(ctx, c, s, pos, a, t); else this._drawBubble(ctx, c, s, pos, a, t);
    }
    for (const q of pl.popped) {
      ctx.strokeStyle = alpha(q.right ? c.good : c.bad, 1 - q.t / 0.4);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(q.x, q.y, 30 + q.t * 120, 0, Math.PI * 2); ctx.stroke();
    }
    if (pl.cur) this._drawPrompt(ctx, c, t);
  }

  _drawPrompt(ctx, c, t) {
    const pair = this.play.cur.pair;
    const phone = this.phoneUi();
    const x = W / 2, y = phone ? 456 : 452, w = phone ? 640 : 380, h = phone ? 116 : 84;
    ctx.fillStyle = darken(c.warning, 0.45);
    if (lookOf().lip > 0) { rr(ctx, x - w / 2, y - h / 2 + 6, w, h, 18); ctx.fill(); }
    ctx.fillStyle = mix(c.bgSurface, c.warning, 0.22);
    rr(ctx, x - w / 2, y - h / 2, w, h, 18); ctx.fill();
    ctx.strokeStyle = c.warning;
    ctx.lineWidth = 3;
    rr(ctx, x - w / 2, y - h / 2, w, h, 18); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const askPx = this.uiPx(13, 11);
    ctx.font = font(c, 700, askPx);
    ctx.fillStyle = c.labelMuted;
    ctx.fillText((this.cfg.ask || 'Tap what matches').toUpperCase(), x, y - h / 2 + 7 + askPx * 0.62);
    const hasArt = pair.art !== undefined;
    if (hasArt) this._drawArt(ctx, c, pair.art, x - w / 2 + 40, y + 8 + (phone ? 6 : 0), phone ? 32 : 24, this.tone(pair.group ?? pair.prompt), t);
    const f = this.fitText(ctx, c, pair.prompt, w - (hasArt ? (phone ? 110 : 100) : 40), this.uiPx(26, 16), this.uiPx(15, 13), 800, true, 2);
    ctx.font = font(c, 800, f.size, true);
    ctx.fillStyle = c.label;
    f.lines.forEach((l, i) => ctx.fillText(l, x + (hasArt ? 26 : 0), y + (phone ? 16 : 10) + (i - (f.lines.length - 1) / 2) * (f.size + 2)));
    ctx.textAlign = 'left';
  }

  _drawBubble(ctx, c, s, pos, a, t) {
    const phone = this.phoneUi();
    const f = this.fitText(ctx, c, s.text, phone ? 216 : 150, this.uiPx(17), this.uiPx(13, 12), 800, false, 2);
    const w = phone ? 244 : 176, h = phone ? (f.lines.length > 1 ? 88 : 72) : f.lines.length > 1 ? 70 : 58;
    const col = this.tone(s.text);
    ctx.save();
    ctx.globalAlpha *= a;
    const L = lookOf();
    const wob = L.flattenScenes ? 1 : 1 + Math.sin(s.age * 5 + s.id) * 0.02;
    const shape = L.flattenScenes ? (cx, x0, y0) => rr(cx, x0, y0, w, h, 6) : (cx, x0, y0) => stadium(cx, x0, y0, w, h);
    ctx.translate(pos.x, pos.y);
    ctx.scale(wob, 2 - wob);
    if (L.lip > 0) { ctx.fillStyle = alpha(darken(col, 0.4), 0.9); shape(ctx, -w / 2, -h / 2 + 5); ctx.fill(); }
    ctx.fillStyle = mix(c.bgSurface, col, 0.35);
    shape(ctx, -w / 2, -h / 2); ctx.fill();
    ctx.strokeStyle = lighten(col, 0.2);
    ctx.lineWidth = 3 * L.rim;
    shape(ctx, -w / 2, -h / 2); ctx.stroke();
    if (L.gloss > 0) { ctx.fillStyle = alpha(c.label, 0.35); ctx.beginPath(); ctx.ellipse(-w / 2 + 26, -h / 2 + 14, 12, 6, -0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = font(c, 800, f.size);
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, i) => ctx.fillText(l, 0, (i - (f.lines.length - 1) / 2) * (f.size + 2)));
    ctx.restore();
    ctx.textAlign = 'left';
    // The target is the whole lane, plus a margin ahead and behind: it moves, and a finger lands where it just was.
    const lanes = this._lanes(), hitH = lanes[1] - lanes[0], hitW = w + 24;
    if (a > 0.8 && !s.leaving) this.hit('shot', { x: pos.x - hitW / 2, y: pos.y - hitH / 2, w: hitW, h: hitH }, s.id);
  }

  _drawBubbleSet(ctx, c, t) {
    if (lookOf().backdrop === 'flat') { drawFloor(ctx, c, 400, { seams: false }); return; }
    // a bubble machine on the right blowing tiny bubbles up through the field
    for (let i = 0; i < 16; i++) {
      const u = ((t * 0.12 + i * 0.137) % 1);
      const x = (i * 97) % (W - 60) + 30 + Math.sin(t + i) * 10;
      const y = 400 - u * 330;
      ctx.strokeStyle = alpha(c.glass, 0.35 * (1 - u));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 5 + (i % 4) * 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = darken(c.s5, 0.35);
    rr(ctx, W - 58, 96, 58, 260, 14); ctx.fill();
    ctx.fillStyle = mix(c.bgSurface, c.s5, 0.45);
    rr(ctx, W - 54, 92, 54, 260, 14); ctx.fill();
    for (const y of this._lanes()) {
      ctx.fillStyle = darken(c.s5, 0.5);
      ctx.beginPath(); ctx.arc(W - 40, y, 14, 0, Math.PI * 2); ctx.fill();
    }
    if (!this.arcadeWorld()) drawFloor(ctx, c, 400, { col: mix(c.bgSurface, c.s1, 0.18), seams: false });
  }

  _drawRangeSet(ctx, c) {
    if (this.arcadeWorld()) return;                          // the polar world is the stall: snowmen on the ice
    // a counter with bunting and a floor: a fair-ground stall
    ctx.fillStyle = mix(c.bgSurface, c.s6, 0.25);
    ctx.fillRect(0, HUD_H, W, 26);
    for (let x = 0; x < W; x += 40) {
      ctx.fillStyle = [c.s1, c.s3, c.s6, c.s8][(x / 40) % 4];
      ctx.beginPath(); ctx.moveTo(x, HUD_H + 26); ctx.lineTo(x + 40, HUD_H + 26); ctx.lineTo(x + 20, HUD_H + 50); ctx.closePath(); ctx.fill();
    }
    if (!this.arcadeWorld()) drawFloor(ctx, c, 372, { col: mix(c.bgSurface, c.s8, 0.25), seams: true });
  }

  _drawTarget(ctx, c, s, pos, a, t) {
    const phone = this.phoneUi(), r = phone ? 30 : 40;
    if (this.arcadeWorld()) this._drawSnowman(ctx, c, pos, a, t, phone ? 0.8 : 1);
    else this._drawRings(ctx, c, pos, a, r, phone);
    this._drawTargetLabel(ctx, c, s, pos, a, r, phone);
  }

  _drawRings(ctx, c, pos, a, r, phone) {
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = mix(c.stroke, c.label, 0.2);
    if (!phone || pos.y > 200) ctx.fillRect(pos.x - 4, pos.y + r - 4, 8, 372 - (pos.y + r) + 6);   // the phone's upper row hangs: a post would cross the lower row
    const rings = [c.bad, c.label, c.bad, c.label, c.warning];
    rings.forEach((col, i) => {
      ctx.fillStyle = i === 0 ? darken(col, 0.4) : mix(c.bgSurface, col, 0.85);
      ctx.beginPath(); ctx.arc(pos.x, pos.y + (i === 0 ? 4 : 0), r - (i * r) / 5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  /** A snowman (a snow sculpture at the fair) on an ice pedestal: hat, scarf, stick arms, a carrot nose. */
  _drawSnowman(ctx, c, pos, a, t, sc) {
    const dark = isDarkTheme(c);
    const snow = lighten(c.ice, dark ? 0.5 : 0.75), by = pos.y + 40 * sc, x = pos.x;
    ctx.save();
    ctx.globalAlpha *= a;
    if (!this.phoneUi() || pos.y > 200) {   // the pedestal down to the ice (the phone's upper row hangs)
      ctx.fillStyle = mix(c.ice, c.seaDeep, dark ? 0.5 : 0.2);
      rr(ctx, x - 16, by - 6, 32, 372 - by + 6, 4); ctx.fill();
      ctx.fillStyle = alpha(lighten(c.ice, 0.7), 0.85);
      rr(ctx, x - 21, by - 9, 42, 8, 3); ctx.fill();
    }
    const balls = [[by - 21 * sc, 21 * sc], [by - 50 * sc, 16 * sc], [by - 76 * sc, 12.5 * sc]];
    for (const [y, rad] of balls) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = mix(snow, c.seaDeep, dark ? 0.4 : 0.25); ctx.fill();
      ctx.fillStyle = snow;
      ctx.beginPath(); ctx.arc(x - rad * 0.2, y - rad * 0.2, rad * 0.92, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const [[, ], [my], [hy, hr]] = balls;
    ctx.strokeStyle = mix(c.stroke, c.bgDeep, 0.3); ctx.lineWidth = 2.5 * sc; ctx.lineCap = 'round';   // stick arms
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + d * 14 * sc, my - 2 * sc); ctx.lineTo(x + d * 30 * sc, my - 16 * sc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + d * 24 * sc, my - 11 * sc); ctx.lineTo(x + d * 27 * sc, my - 20 * sc); ctx.stroke();
    }
    ctx.fillStyle = c.bgDeep;   // coal: eyes, mouth, buttons
    for (const [ex, ey, er] of [[-4, -3, 1.8], [4, -3, 1.8], [-4, 4, 1], [0, 5.5, 1], [4, 4, 1]]) { ctx.beginPath(); ctx.arc(x + ex * sc, hy + ey * sc, er * sc, 0, Math.PI * 2); ctx.fill(); }
    for (const dy of [-5, 4]) { ctx.beginPath(); ctx.arc(x, my + dy * sc, 1.8 * sc, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = c.warning;   // the carrot
    ctx.beginPath(); ctx.moveTo(x, hy - 1 * sc); ctx.lineTo(x + 11 * sc, hy + 2 * sc); ctx.lineTo(x, hy + 3 * sc); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.s6;   // the scarf, its tail lifting in the wind
    rr(ctx, x - 13 * sc, hy + hr - 3 * sc, 26 * sc, 6 * sc, 3 * sc); ctx.fill();
    rr(ctx, x + 5 * sc, hy + hr, 6 * sc, (14 + Math.sin(t * 3 + pos.x) * 2) * sc, 3 * sc); ctx.fill();
    ctx.fillStyle = mix(c.stroke, c.bgDeep, 0.5);   // the top hat
    rr(ctx, x - 15 * sc, hy - hr - 1 * sc, 30 * sc, 4 * sc, 2 * sc); ctx.fill();
    rr(ctx, x - 10 * sc, hy - hr - 16 * sc, 20 * sc, 16 * sc, 2 * sc); ctx.fill();
    ctx.fillStyle = c.s6;
    rr(ctx, x - 10 * sc, hy - hr - 6 * sc, 20 * sc, 3 * sc, 1); ctx.fill();
    ctx.restore();
  }

  _drawTargetLabel(ctx, c, s, pos, a, r, phone) {
    const f = this.fitText(ctx, c, s.text, phone ? 180 : 132, this.uiPx(16), this.uiPx(12), 800, false, 2);
    const w = phone ? 200 : 146, h = f.lines.length * (f.size + 3) + 14;
    const py = pos.y + r + 8;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = darken(c.s5, 0.4);
    rr(ctx, pos.x - w / 2, py + 3, w, h, 10); ctx.fill();
    ctx.fillStyle = mix(c.bgSurface, c.s5, 0.3);
    rr(ctx, pos.x - w / 2, py, w, h, 10); ctx.fill();
    ctx.font = font(c, 800, f.size);
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, i) => ctx.fillText(l, pos.x, py + 7 + f.size / 2 + i * (f.size + 3)));
    ctx.restore();
    ctx.textAlign = 'left';
    if (a > 0.8 && !s.leaving) this.hit('shot', { x: pos.x - w / 2, y: pos.y - r, w, h: 2 * r + 8 + h }, s.id);

  }
}

export { HOW as MATCH_SKINS };
