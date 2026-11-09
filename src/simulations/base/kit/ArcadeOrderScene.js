/**
 * ArcadeOrderScene - put things in order: steps of a process, a timeline, a
 * size or energy ladder. The pieces of one sequence float in the field; tap
 * them in order before the fuse burns down. A wrong piece shows why (what
 * comes next, and why) and the sequence stays; the fuse running out costs a
 * heart and the sequence comes back later.
 * Shared behaviour (pace, why card, mix-ups, boss round, HUD): ArcadeScene.
 *
 * Skins (CONFIG.skin): 'stack' (default: pieces build a tower, bottom up) and
 * 'train' (pieces couple up as carriages behind an engine).
 *
 * CONFIG = {
 *   title: 'In order',
 *   sequences: [{ title: 'Hydro power: first to last', items: ['Water high in the dam', ... | { name, art?, why? }], why? }],
 *   skin?: 'stack', rounds?: all sequences, lives?: 3, relaxed?: false,
 *   fuse?: 5 (seconds per piece at the start),
 * }
 * 3-6 pieces per sequence (the train fits 5).
 */
import { ArcadeScene, itemName, shuffle, HUD_H } from './ArcadeScene.js';
import { W, rr, font, mix, alpha, darken, drawFloor, drawMeter } from './SimLook.js';

const FIELD = [[60, 150], [270, 150], [60, 240], [270, 240], [60, 330], [270, 330]];
const FIELD_TRAIN = [[90, 150], [280, 150], [470, 150], [90, 250], [280, 250], [470, 250]];
const HOW = {
  stack: 'Tap the pieces in order, from the first to the last, to build the tower before the fuse burns out.',
  train: 'Tap the carriages in order to couple the train before the fuse burns out.',
};

export class ArcadeOrderScene extends ArcadeScene {
  static KIND = 'In order';
  static HOW = HOW.stack;
  static ARIA_LABEL = 'An ordering game: tap the pieces of a sequence in the right order before the fuse runs out.';
  static DEFAULTS = { fuse: 5, skin: 'stack' };

  checkConfig(cfg) {
    const p = [];
    cfg.how = cfg.how || HOW[cfg.skin];
    if (!HOW[cfg.skin]) p.push(`CONFIG.skin must be one of ${Object.keys(HOW).join(', ')}`);
    const seqs = cfg.sequences || [];
    if (seqs.length < 2) p.push('CONFIG.sequences needs at least 2 sequences');
    const max = cfg.skin === 'train' ? 5 : 6;
    for (const q of seqs) {
      if (!q.title) p.push('every sequence needs a title (what order: "first to last", "smallest to largest")');
      const n = (q.items || []).length;
      if (n < 3 || n > max) p.push(`sequence "${q.title}" needs 3-${max} items (has ${n})`);
      if (new Set((q.items || []).map(itemName)).size !== n) p.push(`sequence "${q.title}" has repeated items`);
    }
    return p;
  }

  menuSample() { return (this.cfg.sequences?.[0]?.items || []).slice(0, 3).map((x) => ({ name: itemName(x) })); }
  menuTint(c) { return c.s5; }
  bossPool() { return this.cfg.sequences; }
  mascotSpot() {
    const pl = this.play;
    const next = pl?.pieces?.find((p) => p.order === (pl.placed?.length ?? 0));
    const at = next ? { x: next.x + 60, y: next.y } : null;
    return this.cfg.skin === 'train' ? { x: 38, y: 416, h: 72, lookAt: at } : { x: 70, y: 500, h: 92, lookAt: at };
  }

  beginRun(run) {
    const seqs = this.cfg.sequences;
    run.queue = shuffle(seqs).slice(0, this.cfg.rounds ?? seqs.length);
    this.play = { seq: null, pieces: [], placed: [], fuse: 0, fuseMax: 1, fly: [] };
    this._next();
  }

  _next() {
    const pl = this.play;
    const seq = this.run.queue.shift();
    pl.seq = seq || null;
    pl.placed = [];
    pl.fly = [];
    if (!seq) { pl.pieces = []; return; }
    const spots = shuffle(this.cfg.skin === 'train' ? FIELD_TRAIN : FIELD).slice(0, seq.items.length);
    pl.pieces = seq.items.map((it, i) => ({
      item: typeof it === 'string' ? { name: it } : it, order: i,
      x: spots[i][0] + (Math.random() - 0.5) * 16, y: spots[i][1] + (Math.random() - 0.5) * 16,
      age: -i * 0.08, id: i,
    }));
    pl.fuseMax = this.cfg.fuse * seq.items.length;
    pl.fuse = pl.fuseMax;
  }

  _slotPos(i, n) {
    if (this.cfg.skin === 'train') return { x: 150 + i * 118, y: 452, w: 112, h: 58 };
    return { x: 572, y: 468 - i * 58, w: 190, h: 50 };
  }

  tickPlay(d, real) {
    const pl = this.play;
    for (const p of pl.pieces) p.age += real;
    pl.fly = pl.fly.filter((f) => (f.t += real / 0.3) < 1);
    if (!pl.seq) return;
    pl.fuse -= d;
    if (pl.fuse <= 0) {
      const seq = pl.seq;
      pl.seq = null;
      pl.pieces = [];
      this.slip({ item: seq, title: 'The fuse burned out!', said: 'ran out of time', answer: seq.items.map(itemName).join('  >  '), why: seq.why });
    }
  }

  afterWhy(w) { if (w.lostLife) this._next(); }

  onHit(id, pid) {
    if (id !== 'piece') return;
    const pl = this.play;
    const seq = pl.seq;
    const p = pl.pieces.find((q) => q.id === pid);
    if (!seq || !p) return;
    const want = pl.placed.length;
    if (p.order === want) {
      pl.pieces = pl.pieces.filter((q) => q !== p);
      const s = this._slotPos(want, seq.items.length);
      pl.fly.push({ item: p.item, x0: p.x, y0: p.y, x1: s.x, y1: s.y, t: 0 });
      pl.placed.push(p.item);
      this.right(s.x, s.y - 34, seq);
      if (pl.placed.length === seq.items.length) {
        this.celebrate(this.cfg.skin === 'train' ? W / 2 : 572, 360, 26, { notable: true, small: true });
        const done = pl.seq;
        this.after(0.7, () => { if (pl.seq === done) { if (this.itemDone()) this._next(); else { pl.seq = null; pl.pieces = []; } } });
      }
    } else {
      const next = seq.items[want];
      const nx = typeof next === 'string' ? { name: next } : next;
      this.wrongTry({ item: seq, said: itemName(p.item), title: `Not "${itemName(p.item)}" yet.`, answer: `Next: ${itemName(nx)}`, why: nx.why || seq.why, x: p.x, y: p.y });
    }
  }

  floeY() { return this.cfg.skin === 'train' ? 470 : 496; }

  drawPlay(ctx, c, t) {
    const pl = this.play;
    const train = this.cfg.skin === 'train';
    if (train) this._drawTrainSet(ctx, c, t); else this._drawStackSet(ctx, c);
    if (!pl.seq && !pl.fly.length) return;
    const seq = pl.seq;
    if (seq) {
      const f = this.fitText(ctx, c, seq.title, train ? 560 : 420, 20, 14, 800, true, 1);
      ctx.font = font(c, 800, f.size, true);
      ctx.fillStyle = c.label;
      ctx.textAlign = train ? 'center' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.lines[0], train ? W / 2 : 20, HUD_H + 24);
      ctx.textAlign = 'left';
      drawMeter(ctx, c, train ? 120 : 20, HUD_H + 44, train ? 440 : 420, 12, Math.max(0, pl.fuse / pl.fuseMax), { col: pl.fuse / pl.fuseMax < 0.3 ? c.bad : c.warning });
    }
    const n = seq ? seq.items.length : pl.placed.length;
    for (let i = 0; i < n; i++) {
      const s = this._slotPos(i, n);
      const it = pl.placed[i];
      const flying = pl.fly.some((f) => f.item === it);
      if (it && !flying) this._drawPlaced(ctx, c, it, s, i, t);
      else this._drawEmptySlot(ctx, c, s, i);
    }
    for (const p of pl.pieces) {
      const pop = Math.max(0, Math.min(1, p.age / 0.3));
      const y = p.y + Math.sin(p.age * 2 + p.id) * 5;
      this.drawToken(ctx, c, p.item, p.x + 60, y, 178, 54, { scale: 0.5 + 0.5 * pop, alpha: pop, t, tint: c.s5, face: false });
      if (pop > 0.8) this.hit('piece', { x: p.x + 60 - 89, y: y - 27, w: 178, h: 54 }, p.id);
    }
    for (const f of pl.fly) {
      const u = f.t;
      const x = f.x0 + 60 + (f.x1 - f.x0 - 60) * u, y = f.y0 + (f.y1 - f.y0) * u - Math.sin(u * Math.PI) * 50;
      this.drawToken(ctx, c, f.item, x, y, 196, 54, { t, tint: c.good, face: false, scale: 1 - 0.1 * u });
    }
  }

  _drawStackSet(ctx, c) {
    if (!this.arcadeWorld()) drawFloor(ctx, c, 496, { col: mix(c.bgSurface, c.s2, 0.2), seams: false });
    ctx.fillStyle = alpha(c.label, 0.06);
    rr(ctx, 470, HUD_H + 70, 204, 440 - HUD_H - 44, 16); ctx.fill();
  }

  _drawTrainSet(ctx, c, t) {
    const y = 488;
    ctx.fillStyle = mix(c.stroke, c.s8, 0.3);
    for (let x = 0; x < W; x += 26) { rr(ctx, x, y + 6, 16, 8, 2); ctx.fill(); }
    ctx.fillStyle = mix(c.stroke, c.label, 0.45);
    ctx.fillRect(0, y + 2, W, 4);
    // the engine, waiting at the front
    ctx.fillStyle = darken(c.s6, 0.35);
    rr(ctx, 14, 420, 74, 64, 10); ctx.fill();
    ctx.fillStyle = mix(c.s6, c.bgSurface, 0.15);
    rr(ctx, 14, 416, 74, 62, 10); ctx.fill();
    ctx.fillStyle = mix(c.bgSurface, c.label, 0.5);
    rr(ctx, 26, 426, 30, 22, 5); ctx.fill();
    ctx.fillStyle = darken(c.stroke, 0.4);
    rr(ctx, 60, 396, 16, 22, 4); ctx.fill();
    const puff = (t * 0.8) % 1;
    ctx.fillStyle = alpha(c.label, 0.25 * (1 - puff));
    ctx.beginPath(); ctx.arc(68, 390 - puff * 40, 8 + puff * 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = darken(c.stroke, 0.45);
    for (const dx of [30, 70]) { ctx.beginPath(); ctx.arc(dx, y, 10, 0, Math.PI * 2); ctx.fill(); }
  }

  _drawEmptySlot(ctx, c, s, i) {
    ctx.strokeStyle = alpha(c.labelMuted, 0.5);
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    rr(ctx, s.x - s.w / 2, s.y - s.h / 2, s.w, s.h, 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font(c, 800, 18, true);
    ctx.fillStyle = alpha(c.labelMuted, 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), s.x, s.y);
    ctx.textAlign = 'left';
  }

  _drawPlaced(ctx, c, it, s, i, t) {
    const train = this.cfg.skin === 'train';
    if (train) {
      ctx.fillStyle = darken(c.stroke, 0.45);
      for (const dx of [-32, 32]) { ctx.beginPath(); ctx.arc(s.x + dx, 488, 9, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = mix(c.stroke, c.label, 0.3);
      ctx.fillRect(s.x - s.w / 2 - 6, s.y + 20, 8, 5);
    }
    this.drawToken(ctx, c, it, s.x, s.y, s.w, s.h, { t, tint: this.tone(i + 1), face: false });
  }
}

export { HOW as ORDER_SKINS };
