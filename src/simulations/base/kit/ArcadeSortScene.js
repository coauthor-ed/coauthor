/**
 * ArcadeSortScene - catch and sort: classify an item into one of 2-6 groups.
 * One item moves at a time (the next one waits in the corner); tap the bin it
 * belongs in before it gets away. A wrong bin shows why and the SAME item keeps
 * going; letting it get away costs a heart and it comes back later. Bins swap
 * places every few items, so a position is never the cue - the label is.
 * Items are drawn in one neutral colour: a colour must never give the answer.
 * Shared behaviour (pace, why card, mix-ups, boss round, HUD): ArcadeScene.
 *
 * Skins (CONFIG.skin), same rules, different world:
 *   'sky'  (default) items fall from the sky into bins standing on the grass (igloos on the ice,
 *          in the polar world: a friend at each door catches what is his)
 *   'belt' items ride a conveyor belt towards a trapdoor; crates wait below
 *
 * CONFIG = {
 *   title: 'Energy catcher',
 *   groups: [{ id: 'kinetic', label: 'Kinetic', tone?: 1-8, why?: 'energy of motion' }],
 *   items:  [{ name: 'A rolling ball', is: 'kinetic' | ['kinetic', ...], art?, why?, myth? }],
 *   skin?: 'sky', rounds?: 12, lives?: 3, relaxed?: false, fall?: 8 (seconds at the start),
 *   shuffleEvery?: 5, how?: 'one line that replaces the default how-to', boss?: true,
 * }
 * why: an item's own `why` wins, else its group's. Do not give items art that
 * names their group (a "KE" badge on a kinetic item gives the answer away).
 */
import { lookOf } from './lookProfile.js';
import { ArcadeScene, itemName, shuffle, HUD_H, drawIgloo } from './ArcadeScene.js';
import { W, rr, font, mix, alpha, lighten, darken, drawFace, blob, drawFloor, clamp } from './SimLook.js';

const BIN_Y = 410, BIN_H = 96;
const SKINS = {
  sky: { land: 392, how: 'Tap the bin each falling item belongs in before it lands.', gone: 'It landed!' },
  belt: { land: W - 70, how: 'Tap the crate each item belongs in before the belt drops it.', gone: 'Off the end of the belt!' },
};
const BELT_Y = 280;

export class ArcadeSortScene extends ArcadeScene {
  static KIND = 'Catch and sort';
  static HOW = SKINS.sky.how;
  static ARIA_LABEL = 'A sorting game: items arrive one at a time; tap the group each belongs in before it gets away.';
  static DEFAULTS = { fall: 8, shuffleEvery: 5, skin: 'sky' };

  checkConfig(cfg) {
    const p = [];
    cfg.how = cfg.how || SKINS[cfg.skin]?.how;
    if (!SKINS[cfg.skin]) p.push(`CONFIG.skin must be one of ${Object.keys(SKINS).join(', ')}`);
    const groups = cfg.groups || [];
    if (groups.length < 2 || groups.length > 6) p.push('CONFIG.groups needs 2-6 groups');
    const ids = new Set();
    for (const g of groups) {
      if (!g.id || !g.label) p.push(`group ${JSON.stringify(g)} needs id and label`);
      if (ids.has(g.id)) p.push(`duplicate group id ${g.id}`);
      ids.add(g.id);
    }
    const items = cfg.items || [];
    if (items.length < 4) p.push('CONFIG.items needs at least 4 items');
    for (const it of items) {
      if (!it.name) p.push(`item ${JSON.stringify(it).slice(0, 60)} needs a name`);
      const is = [].concat(it.is || []);
      if (!is.length || is.some((g) => !ids.has(g))) p.push(`item "${it.name}": "is" must name group id(s) from CONFIG.groups (got ${JSON.stringify(it.is)})`);
    }
    for (const g of groups) if (!items.some((it) => [].concat(it.is).includes(g.id))) p.push(`group "${g.id}" has no items`);
    return p;
  }

  get skin() { return SKINS[this.cfg.skin] || SKINS.sky; }
  menuSample() { return (this.cfg.items || []).slice(0, 3); }
  menuTint(c) { return c.accent; }

  beginRun(run) {
    const cfg = this.cfg;
    run.queue = this.balanced(cfg.items, (it) => [].concat(it.is)[0], Math.min(cfg.rounds, cfg.items.length * 2));
    const bins = cfg.groups.map((g) => ({ g, x: 0, tx: 0, flash: 0, sad: 0 }));
    this.play = { bins, cur: null, fly: null, sorted: 0, belt: 0 };
    this._layoutBins(true);
    this._next();
  }

  _layoutBins(snap) {
    const bins = this.play.bins;
    const n = bins.length, gap = 10, bw = (W - 24 - gap * (n - 1)) / n;
    bins.forEach((b, i) => { b.w = bw; b.tx = 12 + i * (bw + gap); if (snap) b.x = b.tx; });
  }

  _next() {
    const item = this.run.queue.shift();
    if (!item) { this.play.cur = null; return; }
    this.play.cur = this.cfg.skin === 'belt'
      ? { item, x: 90, y: BELT_Y - 34, age: 0 }
      : { item, x: 230 + Math.random() * (W - 360), y: HUD_H + 36, age: 0 };   // clear of Quill at the left
  }

  _groupOf(item) { return this.cfg.groups.find((g) => [].concat(item.is).includes(g.id)); }
  _why(item) { return item.why || this._groupOf(item)?.why || ''; }

  tickPlay(d, real) {
    const pl = this.play;
    pl.belt += d * 60;
    for (const b of pl.bins) {
      b.x += (b.tx - b.x) * Math.min(1, real * 10);
      b.flash = Math.max(0, b.flash - real * 1.6);
      b.sad = Math.max(0, b.sad - real);
    }
    if (pl.fly) {
      pl.fly.t += real / 0.32;
      if (pl.fly.t >= 1) {
        pl.fly = null;
        pl.sorted += 1;
        if (pl.sorted % this.cfg.shuffleEvery === 0) { pl.bins = shuffle(pl.bins); this._layoutBins(false); }
        if (this.itemDone()) this._next();
      }
      return;
    }
    const cur = pl.cur;
    if (!cur) return;
    cur.age += real;
    const belt = this.cfg.skin === 'belt';
    if (belt) cur.x += ((this.skin.land - 90) / this.cfg.fall) * d;
    else cur.y += ((this.skin.land - (HUD_H + 36)) / this.cfg.fall) * d;
    if ((belt ? cur.x : cur.y + 30) >= this.skin.land) {
      const g = this._groupOf(cur.item);
      pl.cur = null;
      this.slip({ item: cur.item, title: this.skin.gone, said: 'let it get away', answer: `${itemName(cur.item)} goes in ${g.label}`, why: this._why(cur.item), x: cur.x, y: cur.y, group: g });
    }
  }

  afterWhy(w) { if (w.lostLife && !this.play.cur && !this.play.fly) this._next(); }

  onHit(id, data) {
    if (id !== 'bin') return;
    const pl = this.play;
    const cur = pl.cur;
    if (!cur || pl.fly) return;
    const b = pl.bins[data];
    const g = this._groupOf(cur.item);
    const bx = b.x + b.w / 2, by = BIN_Y + BIN_H / 2;
    if ([].concat(cur.item.is).includes(b.g.id)) {
      this.right(bx, BIN_Y - 10, cur.item);
      b.flash = 1;
      pl.fly = { item: cur.item, x0: cur.x, y0: cur.y, x1: bx, y1: by, t: 0 };
      pl.cur = null;
    } else {
      b.sad = 1.2;
      this.wrongTry({ item: cur.item, said: b.g.label, answer: `${itemName(cur.item)} goes in ${g.label}`, why: this._why(cur.item), x: bx, y: by, group: g });
    }
  }

  /** While the why card is up, the right bin shines through the dimming. */
  whyHint(ctx, c, w) {
    const i = this.play.bins.findIndex((b) => b.g === w.group);
    if (i >= 0) this._drawBin(ctx, c, this.play.bins[i], i, this.clock, true);
  }

  floeY() { return BIN_Y + 30; }

  drawPlay(ctx, c, t) {
    const pl = this.play;
    if (this.cfg.skin === 'belt') this._drawBeltSet(ctx, c, t);
    else this._drawSkySet(ctx, c, t);
    // Quill waits behind the first bin, watching what falls
    this.drawMascot(ctx, c, t, { x: 58, y: BIN_Y + 34, h: 124, lookAt: pl.cur ? { x: pl.cur.x, y: pl.cur.y } : null });
    pl.bins.forEach((b, i) => this._drawBin(ctx, c, b, i, t));
    const nextItem = this.run.queue[0];
    if (nextItem && this.phase !== 'end') {
      ctx.font = font(c, 700, 13);
      ctx.fillStyle = c.labelMuted;
      ctx.textAlign = 'right';
      ctx.fillText('next', W - 16, HUD_H + 16);
      ctx.textAlign = 'left';
      this.drawToken(ctx, c, nextItem, W - 100, HUD_H + 46, 172, 44, { alpha: 0.75, t, tint: c.accent, maxLines: 1 });
    }
    if (pl.cur) {
      const cur = pl.cur;
      const belt = this.cfg.skin === 'belt';
      const sway = belt ? Math.sin(cur.age * 9) * 0.015 : Math.sin(cur.age * 2.2) * 0.05;
      const pop = Math.min(1, cur.age / 0.25);
      this.drawToken(ctx, c, cur.item, cur.x, cur.y, 224, 66, { glow: true, t, tilt: sway, scale: 0.6 + 0.4 * pop, tint: c.accent });
    }
    if (pl.fly) {
      const f = pl.fly, u = f.t, e = u * u;
      const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(u * Math.PI) * 40;
      this.drawToken(ctx, c, f.item, x, y, 224, 66, { scale: 1 - 0.55 * u, t, tint: c.accent, mood: 'happy' });
    }
  }

  _drawSkySet(ctx, c, t) {
    if (lookOf().backdrop === 'flat') {                     // a plain field: the drop line and the bins are the whole set
      drawFloor(ctx, c, BIN_Y + 30, { seams: false });
      ctx.strokeStyle = alpha(c.bad, 0.45);
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, this.skin.land); ctx.lineTo(W, this.skin.land); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    if (this.arcadeWorld()) {                               // the polar world is the set: only the drop line
      ctx.strokeStyle = alpha(c.bad, 0.45);
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, this.skin.land); ctx.lineTo(W, this.skin.land); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    // flat clouds drifting behind, a sun, and grass the bins stand on
    // the sun is literal light: a warm disc with a lighter core, rays that turn slowly
    const sx = 70, sy = HUD_H + 110;
    ctx.fillStyle = mix(c.bgDeep, c.warning, 0.18);
    for (let k = 0; k < 10; k++) {
      const a = t * 0.2 + (k * Math.PI) / 5;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, 70, a - 0.12, a + 0.12); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = mix(c.bgDeep, c.warning, 0.7);
    ctx.beginPath(); ctx.arc(sx, sy, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mix(c.warning, c.label, 0.4);
    ctx.beginPath(); ctx.arc(sx - 7, sy - 7, 10, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const x = ((i * 190 + t * (8 + i * 3)) % (W + 200)) - 100;
      const y = HUD_H + 70 + (i % 2) * 120 + i * 18;
      blob(ctx, x, y, 62 - i * 6, 20, 7, 0.12, i);
      ctx.fillStyle = mix(c.bgDeep, c.label, 0.14 + (i % 2) * 0.05);
      ctx.fill();
    }
    drawFloor(ctx, c, BIN_Y + 30, { col: mix(c.bgSurface, c.s3, 0.25), seams: false });
    ctx.strokeStyle = alpha(c.bad, 0.45);
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, this.skin.land); ctx.lineTo(W, this.skin.land); ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawBeltSet(ctx, c, t) {
    const pl = this.play;
    // the field-guide conveyor: a framed belt with sliding diagonal treads and two roller holes
    const x0 = 14, x1 = W - 70, bh = 104, y = BELT_Y - 34 - bh / 2, r = 14;
    ctx.fillStyle = c.track;
    rr(ctx, x0, y, x1 - x0, bh, r); ctx.fill();
    ctx.save();
    rr(ctx, x0, y, x1 - x0, bh, r); ctx.clip();
    ctx.fillStyle = alpha(c.stroke, 0.4);
    for (let k = x0 - bh - 40 + (pl.belt % 40); k < x1; k += 40) {
      ctx.beginPath();
      ctx.moveTo(k, y); ctx.lineTo(k + 20, y); ctx.lineTo(k + 20 + bh, y + bh); ctx.lineTo(k + bh, y + bh);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 3;
    rr(ctx, x0 + 1.5, y + 1.5, x1 - x0 - 3, bh - 3, r - 1); ctx.stroke();
    for (const rx of [x0 + 18, x1 - 18]) {
      ctx.beginPath(); ctx.arc(rx, y + bh / 2, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = c.bgDeep; ctx.fill();
      ctx.strokeStyle = c.stroke; ctx.lineWidth = 3; ctx.stroke();
    }
    // the drop at the end: a hatched gap, a notch of danger
    const tx = x1 + 8, tw = W - 10 - tx;
    ctx.fillStyle = alpha(c.bad, 0.18);
    rr(ctx, tx, y, tw, bh, r); ctx.fill();
    ctx.save();
    rr(ctx, tx, y, tw, bh, r); ctx.clip();
    ctx.fillStyle = alpha(c.bad, 0.55);
    for (let k = tx - bh; k < tx + tw; k += 22) {
      ctx.beginPath();
      ctx.moveTo(k, y); ctx.lineTo(k + 10, y); ctx.lineTo(k + 10 + bh, y + bh); ctx.lineTo(k + bh, y + bh);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = c.bad;
    ctx.lineWidth = 3;
    rr(ctx, tx + 1.5, y + 1.5, tw - 3, bh - 3, r - 1); ctx.stroke();
    if (!this.arcadeWorld()) drawFloor(ctx, c, BIN_Y + 30, { col: mix(c.bgSurface, c.stroke, 0.35), seams: true });
  }

  _drawBin(ctx, c, b, i, t, lit = false) {
    const g = b.g;
    const col = this.tone(g.tone ?? g.id);
    const crate = this.cfg.skin === 'belt';
    const x = b.x, y = BIN_Y + (b.flash > 0 ? -10 * Math.sin(Math.min(1, b.flash) * Math.PI) : 0), w = b.w, h = BIN_H;
    if (lit) {
      ctx.fillStyle = alpha(c.good, 0.35 + 0.2 * Math.sin(t * 8));
      rr(ctx, x - 8, y - 8, w + 16, h + 16, 22); ctx.fill();
    }
    const mood = b.flash > 0.2 ? 'happy' : b.sad > 0 ? 'oops' : 'smile';
    if (!crate && this.arcadeWorld()) {
      this._drawIgloo(ctx, c, b, x, y, w, col, mood, t + i);
      if (!lit) this.hit('bin', { x, y: y - 6, w, h: h + 12 }, i);
      return;
    }
    // the field-guide bin button: flat deep fill, tone rim, solid tone lip
    const rad = crate ? 10 : 18;
    ctx.fillStyle = col;
    if (lookOf().lip > 0) { rr(ctx, x, y + 5, w, h, rad); ctx.fill(); }
    ctx.fillStyle = mix(mix(c.bgDeep, col, 0.1), c.good, Math.min(1, b.flash) * 0.45);
    rr(ctx, x, y, w, h, rad); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    rr(ctx, x + 1.25, y + 1.25, w - 2.5, h - 2.5, rad - 1); ctx.stroke();
    if (!crate && lookOf().lip > 0) {
      ctx.fillStyle = darken(col, 0.55);
      rr(ctx, x + 8, y - 4, w - 16, 12, 6); ctx.fill();
    }
    const fc = lighten(col, 0.3);
    ctx.fillStyle = fc;
    ctx.beginPath(); ctx.arc(x + w / 2, y + 30, 19, 0, Math.PI * 2); ctx.fill();
    drawFace(ctx, x + w / 2, y + 31, 17, { col: fc, c, mood, t: t + i });
    const f = this.fitText(ctx, c, g.label, w - 14, 18, 13, 800, true);
    ctx.font = font(c, 800, f.size, true);
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, k) => ctx.fillText(l, x + w / 2, y + 68 + (k - (f.lines.length - 1) / 2) * (f.size + 2)));
    ctx.textAlign = 'left';
    if (!lit) this.hit('bin', { x, y: y - 6, w, h: h + 12 }, i);
  }

  /** The bin as an igloo: the group's sign across the dome, a friend peeking from the tunnel (his face is the bin's mood). */
  _drawIgloo(ctx, c, b, x, y, w, col, mood, t) {
    const g = b.g;
    const ih = clamp(w * 0.75, 60, 84), base = y + BIN_H - 6, cx = x + w / 2, iw = Math.min(w - 8, 240);
    drawIgloo(ctx, c, { x: cx, base, w: iw, h: ih, col, glow: Math.min(1, b.flash), mood, t });
    const sw = Math.min(w - 16, iw - 10);
    const f = this.fitText(ctx, c, g.label, sw - 14, 17, 11, 800, true);
    const sh = f.lines.length * (f.size + 2) + 12, sy = base - ih * 0.6 + 13 - sh;
    ctx.fillStyle = darken(col, 0.45);
    rr(ctx, cx - sw / 2, sy + 3, sw, sh, 8); ctx.fill();
    ctx.fillStyle = mix(mix(c.bgSurface, col, 0.35), c.good, Math.min(1, b.flash) * 0.45);
    rr(ctx, cx - sw / 2, sy, sw, sh, 8); ctx.fill();
    ctx.font = font(c, 800, f.size, true);
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, k) => ctx.fillText(l, cx, sy + 6 + f.size / 2 + 1 + k * (f.size + 2)));
    ctx.textAlign = 'left';
  }
}

export { SKINS as SORT_SKINS };
