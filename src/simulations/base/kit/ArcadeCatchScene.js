/**
 * ArcadeCatchScene - spot it: is this item a member of the target group?
 * Quill holds one group in mind (the sign says "Catch 1/2") and items drop one
 * at a time. Steer him under a member to catch it; let a non-member fall.
 * The target changes every few items, so the learner keeps re-deciding
 * (docs/sprints/completed/arcade-quill-catch.md).
 *
 *   - a member caught: score, streak; Quill cheers on every 5th in a row;
 *   - a non-member caught: the why card ("0.75 is not 1/2: ..."), the streak
 *     resets, no heart lost; the item goes back up and must be let through;
 *   - a member that falls: a heart and a short why; it comes back later;
 *   - a non-member let through: a small score, the streak kept.
 * Shared behaviour (pace, why card, mix-ups, boss round, HUD, keyboard, the
 * attract demo): ArcadeScene. Quill himself is SimQuill, the app's own bird.
 *
 * Skins (CONFIG.skin), same rules, different world:
 *   'ice'     (default) Quill on an ice floe under a night sky; fish drop into the sea
 *   'orchard' Quill in a cap with a basket under a mango tree; fruit drops on the grass
 *
 * CONFIG = {
 *   title: "Quill's Catch",
 *   groups: [{ id: 'half', label: '1/2', tone?: 1-8, why?: 'one of two equal parts' }],
 *   items:  [{ name: '2/4', is: 'half' | ['half', ...], why?, myth? }],
 *   targets?: ['half', 'quarter'],  (the order the target takes; default: every group)
 *   perTarget?: 6,  (items before the target changes)
 *   share?: 0.5,    (fraction of items that are members of the current target, 0.3-0.7)
 *   skin?: 'ice', rounds?: 18, lives?: 3, relaxed?: false, fall?: 6 (seconds to fall at the start),
 *   how?: 'one line that replaces the default how-to', boss?: true,
 * }
 * It is the same deck shape as ArcadeSortScene, so any Sort deck can drive a
 * Catch game. An item that belongs to every target is refused: it could never
 * be a non-example.
 *
 * Controls: drag or point to steer, tap a spot to walk there; Left/Right or
 * A/D keys.
 */
import { ArcadeScene, itemName, shuffle, HUD_H, drawPolarSky } from './ArcadeScene.js';
import { lookOf } from './lookProfile.js';
import { W, H, rr, font, mix, alpha, lighten, darken, luma, blob, outBack } from './SimLook.js';
import { drawQuill } from './SimQuill.js';

const SKINS = {
  ice: { how: 'Steer Quill under each fish that matches the sign. Let the others splash into the sea.', gone: 'Splash! That one was a catch.', thing: 'fish' },
  orchard: { how: 'Move Quill under each mango that matches the sign. Let the others fall on the grass.', gone: 'Thud! That one was a catch.', thing: 'mango' },
};
const GROUND = 418;                  // the floe's top, or the grass line
const Q_H = 104;                     // Quill's height in px
const CATCH_Y = GROUND - 52;         // his beak (or the basket rim)
const REACH = 62;                    // how far from his middle a catch still counts
const SPAWN_Y = HUD_H + 92;
const LAND_Y = GROUND + 58;          // where a missed item splashes or lands
const ITEM_W = 118, ITEM_H = 48;
const RUN_SPEED = 560;               // px per second, steering
const BANNER_S = 1.5;

export class ArcadeCatchScene extends ArcadeScene {
  static KIND = 'Spot it';
  static HOW = SKINS.ice.how;
  static ARIA_LABEL = 'A catching game: a sign names a group; steer Quill under each falling item that belongs to it and let the others fall.';
  static DEFAULTS = { fall: 6, perTarget: 6, share: 0.5, rounds: 18, skin: 'ice' };
  static DRAGGABLE = true;
  static ATTRACT_S = 6.4;
  static OWN_MASCOT = true;   // Quill is the player
  static INTRO_S = 0;         // the sign is its own opening

  checkConfig(cfg) {
    const p = [];
    cfg.how = cfg.how || SKINS[cfg.skin]?.how;
    if (!SKINS[cfg.skin]) p.push(`CONFIG.skin must be one of ${Object.keys(SKINS).join(', ')}`);
    const groups = cfg.groups || [];
    if (groups.length < 2) p.push('CONFIG.groups needs at least 2 groups');
    const ids = new Set();
    for (const g of groups) {
      if (!g.id || !g.label) p.push(`group ${JSON.stringify(g)} needs id and label`);
      if (ids.has(g.id)) p.push(`duplicate group id ${g.id}`);
      ids.add(g.id);
    }
    const items = cfg.items || [];
    for (const it of items) {
      if (!it.name) p.push(`item ${JSON.stringify(it).slice(0, 60)} needs a name`);
      const is = [].concat(it.is || []);
      if (is.some((g) => !ids.has(g))) p.push(`item "${it.name}": "is" must name group id(s) from CONFIG.groups (got ${JSON.stringify(it.is)})`);
    }
    const targets = cfg.targets || groups.map((g) => g.id);
    if (!targets.length) p.push('CONFIG.targets is empty');
    for (const tg of targets) {
      if (!ids.has(tg)) { p.push(`target "${tg}" is not a group id`); continue; }
      const mem = items.filter((it) => [].concat(it.is || []).includes(tg)).length;
      if (mem < 3) p.push(`target "${tg}" needs at least 3 member items (has ${mem})`);
      if (items.length - mem < 3) p.push(`target "${tg}" needs at least 3 non-member items (has ${items.length - mem})`);
    }
    for (const it of items) {
      if (targets.length && targets.every((tg) => [].concat(it.is || []).includes(tg))) p.push(`item "${it.name}" belongs to every target, so it is never a non-example`);
    }
    if (!(cfg.share >= 0.3 && cfg.share <= 0.7)) p.push('CONFIG.share must be between 0.3 and 0.7');
    if (!(cfg.perTarget >= 3)) p.push('CONFIG.perTarget must be at least 3');
    return p;
  }

  get skin() { return SKINS[this.cfg.skin] || SKINS.ice; }
  get targets() { return this.cfg.targets || this.cfg.groups.map((g) => g.id); }
  _group(id) { return this.cfg.groups.find((g) => g.id === id); }
  _isIn(item, tg) { return [].concat(item.is || []).includes(tg); }
  _home(item) { return this.cfg.groups.find((g) => this._isIn(item, g.id)); }
  _why(item) { return item.why || this._home(item)?.why || ''; }
  bossPool() { return this.cfg.items; }

  // -- the run ----------------------------------------------------------------------------
  beginRun(run) {
    const cfg = this.cfg;
    const segs = Math.max(1, Math.ceil(cfg.rounds / cfg.perTarget));
    const q = [];
    const used = new Map();
    const pick = (pool) => {
      // least-used first, so a short deck cycles evenly
      const sorted = shuffle(pool).sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0));
      const it = sorted[0];
      used.set(it, (used.get(it) || 0) + 1);
      return it;
    };
    for (let s = 0; s < segs; s++) {
      const tg = this.targets[s % this.targets.length];
      const mem = cfg.items.filter((it) => this._isIn(it, tg));
      const non = cfg.items.filter((it) => !this._isIn(it, tg));
      const nm = Math.round(cfg.perTarget * cfg.share);
      const seg = [];
      for (let i = 0; i < cfg.perTarget; i++) seg.push({ it: pick(i < nm ? mem : non), tg, member: i < nm });
      q.push(...interleave(seg));
    }
    run.queue = q.slice(0, cfg.rounds);
    this.play = {
      target: run.queue[0]?.tg || this.targets[0],
      cur: null, gulp: null, banner: null, slow: 0, wait: 0.5,
      q: { x: W / 2, tx: W / 2, v: 0, dir: 0, face: 'happy', faceT: 0, hop: 0, mouth: 0 },
      keyL: false, keyR: false, puffs: [], rings: [], caught: 0,
    };
    this._banner(this.play.target, true);
  }

  _banner(tg, first = false) {
    const pl = this.play;
    pl.target = tg;
    pl.banner = { label: this._group(tg)?.label || tg, t: 0, first };
    pl.slow = first ? 0 : 2;
  }

  _spawn() {
    const pl = this.play;
    const e = this.run.queue[0];
    if (!e) { pl.cur = null; return; }
    const tg = e.tg || pl.target;
    if (tg !== pl.target) { this._banner(tg); return; }
    this.run.queue.shift();
    const it = e.it || e;
    const lastX = pl.lastX ?? pl.q.x;
    const half = (this._chips?.get(itemName(it))?.w || ITEM_W) / 2 + 20;
    let x = half + Math.random() * (W - 2 * half);
    for (let k = 0; k < 6 && Math.abs(x - lastX) < 130; k++) x = half + Math.random() * (W - 2 * half);
    pl.lastX = x;
    pl.cur = { it, x, y: SPAWN_Y, py: SPAWN_Y, age: 0, slow: pl.slow > 0 ? 0.7 : 1, back: 0 };
    if (pl.slow > 0) pl.slow -= 1;
  }

  tickPlay(d, real) {
    const pl = this.play;
    this._steer(real);
    this._fx(real);
    if (pl.banner) {
      pl.banner.t += real;
      if (pl.banner.t >= BANNER_S) { pl.banner = null; pl.wait = 0.25; }
      return;
    }
    if (pl.gulp) {
      pl.gulp.t += real / 0.3;
      if (pl.gulp.t >= 1) {
        pl.gulp = null;
        if (this.itemDone()) pl.wait = 0.35;
      }
      return;
    }
    if (!pl.cur) {
      pl.wait -= real;
      if (pl.wait <= 0 && this.run.queue.length) this._spawn();
      return;
    }
    const cur = pl.cur;
    cur.age += real;
    cur.back = Math.max(0, cur.back - real * 3);
    cur.py = cur.y;
    cur.y += ((CATCH_Y - SPAWN_Y) / this.cfg.fall) * d * cur.slow;
    const member = this._isIn(cur.it, pl.target);
    // crossing the beak line under Quill: a catch
    if (cur.py < CATCH_Y && cur.y >= CATCH_Y && Math.abs(cur.x - pl.q.x) <= this._reach(cur.it)) {
      if (member) this._catch(cur);
      else this._wrongCatch(cur);
      return;
    }
    if (cur.y >= LAND_Y) {
      pl.cur = null;
      this._land(cur.x);
      if (member) {
        const tg = this._group(pl.target);
        pl.q.face = 'sad'; pl.q.faceT = 1.6;
        this.slip({
          item: cur.it, title: this.skin.gone, said: 'let through', answer: `${itemName(cur.it)} = ${tg.label}`,
          why: this._why(cur.it), x: cur.x, y: GROUND,
        });
      } else {
        const r = this.run;
        r.tries += 1; r.right += 1; r.score += 5;
        this.floatText('+5 let it go', cur.x, GROUND - 20, { bg: this.colors.s7, size: 15 });
        if (this.itemDone()) pl.wait = 0.3;
      }
    }
  }

  _catch(cur) {
    const pl = this.play;
    pl.cur = null;
    this.right(pl.q.x, CATCH_Y - 40, cur.it);
    pl.caught += 1;
    pl.q.mouth = 0.45;
    pl.q.face = 'happy';
    if (this.run.streak > 0 && this.run.streak % 5 === 0) { pl.q.hop = 1; pl.q.face = 'surprised'; pl.q.faceT = 1; }
    pl.gulp = { it: cur.it, x0: cur.x, y0: cur.y, t: 0 };
  }

  _wrongCatch(cur) {
    const pl = this.play;
    const tg = this._group(pl.target);
    const home = this._home(cur.it);
    const name = itemName(cur.it);
    pl.q.face = 'surprised'; pl.q.faceT = 2;
    cur.y = CATCH_Y - 96;            // back up: it must be let through this time
    cur.back = 1;
    this.wrongTry({
      item: cur.it, said: tg.label, title: `${name} is not ${tg.label}`,
      answer: home ? `${name} = ${home.label}` : `${name} does not belong with ${tg.label}`,
      why: this._why(cur.it), x: cur.x, y: CATCH_Y,
    });
  }

  afterWhy(w) {
    const pl = this.play;
    if (w.lostLife && !pl.cur && !pl.gulp) pl.wait = 0.3;
  }

  _steer(real) {
    const q = this.play.q;
    const pl = this.play;
    if (pl.keyL || pl.keyR) q.tx = clampX(q.tx + (pl.keyR ? 1 : -1) * RUN_SPEED * real);
    const dx = q.tx - q.x;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), RUN_SPEED * real);
    q.v = real > 0 ? step / real : 0;
    q.x += step;
    const dir = Math.abs(q.v) > 60 ? Math.sign(q.v) : 0;
    if (dir && dir !== q.dir && !this._reduced()) this._puff(q.x - dir * 18, GROUND);
    if (dir) q.dir = dir;
    q.faceT = Math.max(0, q.faceT - real);
    if (q.faceT <= 0) q.face = 'happy';
    q.mouth = Math.max(0, q.mouth - real);
    q.hop = Math.max(0, q.hop - real * 1.6);
  }

  _puff(x, y) {
    for (let i = 0; i < 6; i++) this.play.puffs.push({ x, y: y - 4, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 50, t: 0, r: 3 + Math.random() * 4 });
  }

  _land(x) {
    if (this._reduced()) return;
    this.play.rings.push({ x, y: LAND_Y - 6, t: 0 });
    if (this.cfg.skin === 'orchard') this._puff(x, LAND_Y - 8);
  }

  _fx(real) {
    const pl = this.play;
    for (const p of pl.puffs) { p.t += real; p.x += p.vx * real; p.y += p.vy * real; p.vy += 90 * real; }
    pl.puffs = pl.puffs.filter((p) => p.t < 0.6);
    for (const r of pl.rings) r.t += real;
    pl.rings = pl.rings.filter((r) => r.t < 0.9);
  }

  // -- input --------------------------------------------------------------------------------
  movePlay(p) { this.play.q.tx = clampX(p.x); this.animateFor?.(); return false; }
  tapPlay(p) { this.play.q.tx = clampX(p.x); }
  keyPlay(key, down) {
    const k = key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { this.play.keyL = down; return true; }
    if (k === 'arrowright' || k === 'd') { this.play.keyR = down; return true; }
    return false;
  }

  // -- drawing --------------------------------------------------------------------------------
  drawWorld(ctx, c, t) {
    if (lookOf().backdrop === 'flat') {                     // a plain field: what falls and what catches it are the whole set
      ctx.fillStyle = c.bgSurface;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = mix(c.bgSurface, c.label, 0.05);
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = mix(c.bgSurface, c.label, 0.28);
      ctx.fillRect(0, GROUND - 0.5, W, 1);
      return;
    }
    if (this.cfg.skin === 'orchard') drawOrchard(ctx, c, t);
    else drawIce(ctx, c, t);
  }

  whyHint(ctx, c) {
    // the sign shines through the dimming, so the target stays in mind
    this._sign(ctx, c, this.clock, true);
  }

  drawPlay(ctx, c, t) {
    const pl = this.play;
    this._sign(ctx, c, t);
    const nextE = this.run.queue[0];
    if (nextE && this.phase !== 'end' && !pl.banner) {
      ctx.font = font(c, 700, 13);
      ctx.fillStyle = c.labelMuted;
      ctx.textAlign = 'right';
      ctx.fillText('next', W - 16, HUD_H + 18);
      ctx.textAlign = 'left';
      this._item(ctx, c, nextE.it || nextE, W - 76, HUD_H + 48, { scale: 0.62, alpha: 0.8, t });
    }
    this._fxDraw(ctx, c);
    if (pl.cur) {
      const cur = pl.cur;
      const pop = Math.min(1, cur.age / 0.25);
      this._item(ctx, c, cur.it, cur.x, cur.y, { scale: (0.6 + 0.4 * pop) * (1 + cur.back * 0.15), t: t + cur.age, live: true });
    }
    this._quill(ctx, c, t);
    if (pl.gulp) {
      const g = pl.gulp, u = g.t;
      const x = g.x0 + (pl.q.x - g.x0) * u, y = g.y0 + (CATCH_Y + 6 - g.y0) * u - Math.sin(u * Math.PI) * 26;
      this._item(ctx, c, g.it, x, y, { scale: 1 - 0.8 * u, t, spin: u * 2.4, alpha: 1 - u * 0.5 });
    }
    if (pl.banner) this._drawBanner(ctx, c, t);
  }

  endDecor(ctx, c, t) {
    if (!this.run?.won) return;
    const hop = Math.abs(Math.sin(t * 5)) * 10;
    drawQuill(ctx, c, { x: 112, y: 474 - hop, h: 96, face: 'surprised', mouth: 'open', wingL: 1.1, wingR: -1.1, scarf: Math.sin(t * 4) * 0.2, cap: this.cfg.skin === 'orchard' ? c.s6 : null });
  }

  _quill(ctx, c, t) {
    const q = this.play.q;
    const hop = Math.sin(q.hop * Math.PI) * 30;
    const lean = Math.max(-0.16, Math.min(0.16, q.v / 3200));
    const blink = (t % 4.6) > 4.45 ? 1 : 0;
    const look = this.play.banner ? [-4, -3] : this.play.cur ? [clampN((this.play.cur.x - q.x) / 60, -4, 4), -3] : [0, 0];
    const orchard = this.cfg.skin === 'orchard';
    drawQuill(ctx, c, {
      x: q.x, y: GROUND + 2 - hop, h: Q_H, face: q.face, mouth: q.mouth > 0 ? 'open' : 'closed',
      blink, look, lean, squash: q.hop > 0.85 ? [1.08, 0.92] : [1, 1],
      wingL: orchard ? 0.5 : 0.25 + (q.hop > 0 ? 0.9 : 0) + Math.abs(lean) * 2,
      wingR: orchard ? -0.5 : -0.25 - (q.hop > 0 ? 0.9 : 0) - Math.abs(lean) * 2,
      scarf: Math.sin(t * 3) * 0.12 - lean, shadow: 1 - hop / 60, cap: orchard ? c.s6 : null,
    });
    if (orchard) drawBasket(ctx, c, q.x, GROUND - 26 - hop);
  }

  _fxDraw(ctx, c) {
    const pl = this.play;
    for (const r of pl.rings) {
      const u = r.t / 0.9;
      ctx.strokeStyle = alpha(this.cfg.skin === 'orchard' ? c.labelMuted : lighten(c.seaShallow, 0.5), 1 - u);
      ctx.lineWidth = 3 * (1 - u) + 1;
      for (const k of [1, 0.6]) { ctx.beginPath(); ctx.ellipse(r.x, r.y, 12 + 50 * u * k, 4 + 12 * u * k, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const p of pl.puffs) {
      ctx.fillStyle = alpha(this.cfg.skin === 'orchard' ? mix(c.labelMuted, c.s3, 0.3) : lighten(c.ice, 0.4), 1 - p.t / 0.6);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.t), 0, Math.PI * 2); ctx.fill();
    }
  }

  /** The target sign, top left: "CATCH" and the group. */
  _sign(ctx, c, t, lit = false, tg = this.play?.target, banner = this.play?.banner) {
    const label = this._group(tg)?.label || '';
    const pulse = banner ? 1 + Math.sin(Math.min(1, banner.t / 0.5) * Math.PI) * 0.12 : 1;
    const x = 14, y = HUD_H + 10, w = 196, h = 64;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-w / 2, -h / 2);
    const rim = this.cfg.skin === 'orchard' ? c.s8 : c.s7;
    if (lit) { ctx.fillStyle = alpha(c.good, 0.35 + 0.2 * Math.sin(t * 8)); rr(ctx, -8, -8, w + 16, h + 18, 22); ctx.fill(); }
    ctx.fillStyle = darken(rim, 0.35);
    rr(ctx, 0, 5, w, h, 16); ctx.fill();
    ctx.fillStyle = mix(c.bgDeep, rim, 0.14);
    rr(ctx, 0, 0, w, h, 16); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 3;
    rr(ctx, 1.5, 1.5, w - 3, h - 3, 15); ctx.stroke();
    ctx.font = font(c, 800, 14);
    ctx.fillStyle = c.labelMuted;
    ctx.textBaseline = 'middle';
    ctx.fillText('CATCH', 16, 20);
    const f = this.fitText(ctx, c, label, w - 30, 30, 16, 800, true, 1);
    ctx.font = font(c, 800, f.size, true);
    ctx.fillStyle = c.label;
    ctx.fillText(f.lines[0], 16, 44);
    ctx.restore();
  }

  _drawBanner(ctx, c) {
    const b = this.play.banner;
    const u = b.t / BANNER_S;
    const k = u < 0.2 ? outBack(u / 0.2) : u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, k));
    const w = 380, h = 92, x = (W - w) / 2, y = 168 + (1 - k) * 20;
    ctx.fillStyle = darken(c.s7, 0.4); rr(ctx, x, y + 6, w, h, 24); ctx.fill();
    ctx.fillStyle = c.bgSurface; rr(ctx, x, y, w, h, 24); ctx.fill();
    ctx.strokeStyle = c.s7; ctx.lineWidth = 4; rr(ctx, x, y, w, h, 24); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(c, 800, 15);
    ctx.fillStyle = c.labelMuted;
    ctx.fillText(b.first ? 'FIRST TARGET' : 'NEW TARGET', W / 2, y + 24);
    const f = this.fitText(ctx, c, `Catch ${b.label}`, w - 40, 34, 18, 800, true, 1);
    ctx.font = font(c, 800, f.size, true);
    ctx.fillStyle = c.label;
    ctx.fillText(f.lines[0], W / 2, y + 60);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  /** Chip size for an item: one line where it fits, two for long names. */
  _size(ctx, c, it) {
    const name = itemName(it);
    this._chips = this._chips || new Map();
    let m = this._chips.get(name);
    if (!m) {
      ctx.font = font(c, 800, 22, true);
      const w = Math.round(Math.min(250, Math.max(ITEM_W, ctx.measureText(name).width + 56)));
      const f = this.fitText(ctx, c, name, w - 46, 22, 13, 800, true, 2);
      m = { w, h: f.lines.length > 1 ? 66 : ITEM_H, f };
      this._chips.set(name, m);
    }
    return m;
  }

  _reach(it) { return REACH + ((this._chips?.get(itemName(it))?.w || ITEM_W) - ITEM_W) * 0.35; }

  /** A fish (ice) or a mango (orchard) carrying the item's text on a flat chip. */
  _item(ctx, c, it, x, y, o = {}) {
    const s = o.scale ?? 1;
    const t = o.t ?? 0;
    const orchard = this.cfg.skin === 'orchard';
    const col = orchard ? c.warning : c.s7;
    const { w, h, f } = this._size(ctx, c, it);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((o.spin || 0) + (o.live ? Math.sin(t * 2.4) * 0.05 : 0));
    ctx.scale(s, s);
    ctx.globalAlpha *= o.alpha ?? 1;
    if (orchard) {
      // stem and leaf on top
      ctx.strokeStyle = darken(c.s3, 0.3); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -h / 2 + 2); ctx.quadraticCurveTo(2, -h / 2 - 8, 6, -h / 2 - 12); ctx.stroke();
      ctx.fillStyle = c.s3;
      ctx.beginPath(); ctx.ellipse(16, -h / 2 - 10, 14, 6, -0.4, 0, Math.PI * 2); ctx.fill();
    } else {
      // tail fin on the right, swishing
      const sw = Math.sin(t * 9) * 0.25;
      ctx.save();
      ctx.translate(w / 2 - 4, 2);
      ctx.rotate(sw);
      ctx.fillStyle = darken(col, 0.15);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(28, -18); ctx.quadraticCurveTo(20, 0, 28, 18); ctx.closePath(); ctx.fill();
      ctx.restore();
      // dorsal fin
      ctx.fillStyle = darken(col, 0.15);
      ctx.beginPath(); ctx.moveTo(-14, -h / 2 + 2); ctx.quadraticCurveTo(4, -h / 2 - 16, 22, -h / 2 + 2); ctx.closePath(); ctx.fill();
    }
    // body chip: solid lip, deep fill, tone rim (the house chip)
    const r = Math.min(h / 2, 26);
    ctx.fillStyle = darken(col, 0.35);
    rr(ctx, -w / 2, -h / 2 + 5, w, h, r); ctx.fill();
    ctx.fillStyle = mix(c.bgDeep, col, 0.12);
    rr(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    rr(ctx, -w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, r - 1); ctx.stroke();
    if (!orchard) {
      // eye on the left
      ctx.fillStyle = lighten(c.ice, 0.5);
      ctx.beginPath(); ctx.arc(-w / 2 + 16, -3, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.bgDeep;
      ctx.beginPath(); ctx.arc(-w / 2 + 17, -3, 3, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = alpha(lighten(col, 0.6), 0.35);
      ctx.beginPath(); ctx.ellipse(-w / 2 + 20, -h / 2 + 12, 12, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = font(c, 800, f.size, true);
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, i) => ctx.fillText(l, orchard ? 0 : 8, 1 + (i - (f.lines.length - 1) / 2) * (f.size + 3)));
    if (this.isBoss(it)) { ctx.font = font(c, 800, 11); ctx.fillStyle = c.warning; ctx.fillText('BOSS x2', 0, -h / 2 - 8); }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // -- the menu: a panel on the left, the attract demo on the right -------------------------
  drawMenu(ctx, c, t, u) {
    const C = this.constructor;
    const px = 26, py = 66, pw = 340;
    // lay the text out first, so the panel and PLAY follow its real height
    const title = this.fitText(ctx, c, this.cfg.title, pw - 44, 36, 22, 800, true, 2);
    const how = this.fitText(ctx, c, this.cfg.how || C.HOW, pw - 44, 17, 14, 700, false, 4);
    const ruleText = this.cfg.relaxed ? 'Practice mode: no hearts. Every mix-up shows why.' : 'A wrong catch only breaks your streak. Letting a match fall costs a heart.';
    const rule = this.fitText(ctx, c, ruleText, pw - 44, 15, 14, 700, false, 3);
    const titleY = py + 74;
    const howY = titleY + title.lines.length * (title.size + 6) + 6;
    const ruleY = howY + how.lines.length * (how.size + 6) + 6;
    // PLAY sits at (196, 336) unless a long title or how-to pushes it down
    const playY = Math.max(336, ruleY + rule.lines.length * (rule.size + 5) + 40);
    const ph = playY - py + 66;
    ctx.fillStyle = alpha(c.bgDeep, 0.82);
    rr(ctx, px, py, pw, ph, 24); ctx.fill();
    ctx.strokeStyle = alpha(c.label, 0.14); ctx.lineWidth = 2;
    rr(ctx, px, py, pw, ph, 24); ctx.stroke();
    ctx.textBaseline = 'middle';
    this.drawKicker(ctx, c, C.KIND.toUpperCase(), px + 22, py + 33, { align: 'left' });
    this.drawTitle(ctx, c, title, px + 22, titleY, { align: 'left' });
    ctx.textAlign = 'left';
    ctx.font = font(c, 700, how.size);
    ctx.fillStyle = c.labelMuted;
    how.lines.forEach((l, i) => ctx.fillText(l, px + 22, howY + i * (how.size + 6)));
    ctx.font = font(c, 700, rule.size);
    ctx.fillStyle = c.label;
    rule.lines.forEach((l, i) => ctx.fillText(l, px + 22, ruleY + i * (rule.size + 5)));
    this._button(ctx, c, 'start', 'PLAY', px + pw / 2, playY, 200, 56, this.ctaColor(c), t, { arrow: true });
    ctx.font = font(c, 700, 14);
    ctx.fillStyle = c.labelMuted;
    ctx.textAlign = 'center';
    ctx.fillText(this.best ? `best ${this.best}   -   drag or use the arrow keys` : 'Drag, or use the arrow keys', px + pw / 2, playY + 46);
    ctx.textAlign = 'left';
    this._demo(ctx, c, t, u);
  }

  /** Attract demo (6.4 s, once): two catches and one let-through, then rest. */
  _demo(ctx, c, t, u) {
    const tg = this.targets[0];
    const mem = this.cfg.items.filter((it) => this._isIn(it, tg));
    const non = this.cfg.items.find((it) => !this._isIn(it, tg));
    // the sign for the demo, at the right
    ctx.save(); ctx.translate(W - 14 - 196 - 14, 0); this._sign(ctx, c, t, false, tg, null); ctx.restore();
    const T = u * this.constructor.ATTRACT_S;
    const drops = [
      { it: mem[0], x: 610, t0: 0, catch: true },
      { it: mem[1] || mem[0], x: 470, t0: 2.1, catch: true },
      { it: non, x: 470, t0: 4.2, catch: false },
    ];
    // where Quill is: walk to each catch, then step away from the non-member
    const path = [[0, 540], [1.3, 610], [2.4, 610], [3.5, 470], [4.6, 470], [5.3, 600]];
    let qx = path[path.length - 1][1];
    for (let i = 0; i < path.length - 1; i++) {
      const [ta, xa] = path[i], [tb, xb] = path[i + 1];
      if (T >= ta && T < tb) { const k = (T - ta) / (tb - ta); qx = xa + (xb - xa) * (k * k * (3 - 2 * k)); break; }
    }
    if (u >= 1) qx = 560;
    let mouth = false;
    const fall = 1.9;
    for (const dr of drops) {
      if (!dr.it || u >= 1) continue;
      const k = (T - dr.t0) / fall;
      if (k < 0) continue;
      if (dr.catch) {
        if (k <= 1) this._item(ctx, c, dr.it, dr.x, SPAWN_Y + (CATCH_Y - SPAWN_Y) * k, { scale: 0.85, t: t + k * 3, live: true });
        else if (k < 1.18) { mouth = true; this._item(ctx, c, dr.it, dr.x, CATCH_Y + 4, { scale: 0.85 * (1 - (k - 1) / 0.18), t }); }
      } else if (k <= 1.25) {
        const y = SPAWN_Y + (LAND_Y - SPAWN_Y) * Math.min(1, k / 1.25) ** 1.2;
        this._item(ctx, c, dr.it, dr.x, y, { scale: 0.85, t: t + k * 3, live: true });
      } else if (k < 1.7) {
        const ru = (k - 1.25) / 0.45;
        ctx.strokeStyle = alpha(lighten(c.seaShallow, 0.5), 1 - ru); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(dr.x, LAND_Y - 6, 12 + 46 * ru, 4 + 10 * ru, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    const bob = u >= 1 ? 0 : Math.abs(Math.sin(T * 3)) * 2;
    drawQuill(ctx, c, {
      x: qx, y: GROUND + 2 - bob, h: Q_H, face: 'happy', mouth: mouth ? 'open' : 'closed',
      look: [u >= 1 ? -3 : 0, -3], wingL: 0.25, wingR: -0.25, scarf: Math.sin(t * 3) * 0.12,
      cap: this.cfg.skin === 'orchard' ? c.s6 : null,
    });
    if (this.cfg.skin === 'orchard') drawBasket(ctx, c, qx, GROUND - 26 - bob);
  }
}

// -- module helpers: worlds and props (claim no names on the scene) -----------------------

function clampX(x) { return Math.max(60, Math.min(W - 60, x)); }
function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Shuffle a target segment so members and non-members alternate loosely:
 *  never three of one kind in a row. */
function interleave(seg) {
  for (let tries = 0; tries < 30; tries++) {
    const s = shuffle(seg);
    let ok = true;
    for (let i = 2; i < s.length; i++) if (s[i].member === s[i - 1].member && s[i].member === s[i - 2].member) { ok = false; break; }
    if (ok) return s;
  }
  return shuffle(seg);
}

function isDark(c) { return luma(c.bgDeep) < 0.35; }

/** The polar sky (the base's, shared by every game) with an ice floe for Quill, the sea under it. */
function drawIce(ctx, c, t) {
  drawPolarSky(ctx, c, t);
  // the floe: a snowy top, a shaded front edge with drips, a water line
  const fx0 = 18, fx1 = W - 18, fy = GROUND;
  ctx.fillStyle = mix(c.ice, c.seaDeep, 0.5);
  ctx.beginPath();
  ctx.moveTo(fx0 + 10, fy + 8);
  ctx.lineTo(fx1 - 10, fy + 8);
  ctx.lineTo(fx1 - 24, fy + 40);
  for (let x = fx1 - 40; x > fx0 + 30; x -= 46) ctx.quadraticCurveTo(x + 10, fy + 50, x, fy + 40);
  ctx.lineTo(fx0 + 24, fy + 40);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.ice;
  rr(ctx, fx0, fy - 4, fx1 - fx0, 20, 10); ctx.fill();
  ctx.fillStyle = alpha(lighten(c.ice, 0.6), 0.9);
  for (const [x, w] of [[90, 70], [300, 110], [520, 80]]) { ctx.beginPath(); ctx.ellipse(x, fy - 3, w / 2, 6, 0, Math.PI, 0); ctx.fill(); }
  ctx.strokeStyle = alpha(lighten(c.seaShallow, 0.4), 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, fy + 44 + Math.sin(x / 22 + t * 1.5) * 2);
  ctx.stroke();
}

/** A mango tree's canopy over a grassy field; fruit falls from the leaves. */
function drawOrchard(ctx, c, t) {
  const dark = isDark(c);
  // deeper greens: toward the night in dark theme, toward black in light (a light bgDeep would wash them out)
  const shade = (col, k) => (dark ? mix(col, c.bgDeep, k) : darken(col, k * 0.55));
  const top = dark ? mix(c.skyDay, c.bgDeep, 0.7) : c.skyDay;
  const low = dark ? mix(c.skyDusk, c.bgDeep, 0.55) : mix(c.skyDay, c.skyDusk, 0.35);
  let g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, top); g.addColorStop(1, low);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
  // the sun, low on the right, with slow rays
  const sx = 600, sy = 250;
  ctx.fillStyle = alpha(c.warning, dark ? 0.12 : 0.2);
  for (let k = 0; k < 10; k++) {
    const a = t * 0.15 + (k * Math.PI) / 5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, 90, a - 0.1, a + 0.1); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = mix(c.warning, top, 0.15);
  ctx.beginPath(); ctx.arc(sx, sy, 32, 0, Math.PI * 2); ctx.fill();
  // far hills in two greens
  ctx.fillStyle = mix(c.s3, top, dark ? 0.55 : 0.4);
  ctx.beginPath(); ctx.moveTo(0, 330); ctx.quadraticCurveTo(160, 270, 330, 320); ctx.quadraticCurveTo(500, 280, W, 316); ctx.lineTo(W, GROUND); ctx.lineTo(0, GROUND); ctx.fill();
  ctx.fillStyle = shade(c.s3, dark ? 0.45 : 0.3);
  ctx.beginPath(); ctx.moveTo(0, 370); ctx.quadraticCurveTo(220, 340, 420, 372); ctx.quadraticCurveTo(560, 352, W, 366); ctx.lineTo(W, GROUND); ctx.lineTo(0, GROUND); ctx.fill();
  // grass
  ctx.fillStyle = shade(c.s3, dark ? 0.35 : 0.2);
  ctx.fillRect(0, GROUND - 2, W, H - GROUND + 2);
  ctx.fillStyle = mix(c.s3, c.label, dark ? 0.1 : 0.25);
  ctx.fillRect(0, GROUND - 2, W, 5);
  ctx.strokeStyle = shade(c.s3, dark ? 0.15 : 0.45);
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = (i * 53) % W + 10, y = GROUND + 24 + (i % 4) * 16;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 9); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 10); ctx.stroke();
  }
  // trunk at the left, canopy over the top
  ctx.fillStyle = shade(c.s8, 0.55);
  ctx.beginPath(); ctx.moveTo(28, GROUND); ctx.quadraticCurveTo(44, 260, 30, HUD_H + 60); ctx.lineTo(62, HUD_H + 60); ctx.quadraticCurveTo(70, 260, 76, GROUND); ctx.fill();
  const leafDark = shade(c.s3, dark ? 0.55 : 0.6);
  const leaf = shade(c.s3, dark ? 0.35 : 0.35);
  for (let i = 0; i < 9; i++) {
    blob(ctx, i * 84 + 20, HUD_H + 14 + (i % 2) * 18, 74, 46, 9, 0.12, i * 1.7 + Math.sin(t * 0.6 + i) * 0.05);
    ctx.fillStyle = i % 2 ? leafDark : leaf; ctx.fill();
  }
  // a few ripe mangoes hanging in the leaves
  for (const [x, y] of [[96, 98], [262, 112], [418, 92], [566, 108]]) {
    ctx.fillStyle = mix(c.warning, c.s8, 0.3);
    ctx.beginPath(); ctx.ellipse(x, y, 10, 13, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = alpha(lighten(c.warning, 0.6), 0.5);
    ctx.beginPath(); ctx.ellipse(x - 3, y - 4, 3, 4, 0.4, 0, Math.PI * 2); ctx.fill();
  }
}

/** Quill's basket, held low in front of him (y = its rim), so his face and
 *  scarf stay in view. */
function drawBasket(ctx, c, x, y) {
  const wood = isDark(c) ? mix(c.s8, c.bgDeep, 0.45) : darken(c.s8, 0.3);
  const rw = 30, d = 24;
  ctx.fillStyle = darken(wood, 0.3);
  ctx.beginPath(); ctx.ellipse(x, y, rw, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = wood;
  ctx.beginPath(); ctx.moveTo(x - rw, y); ctx.lineTo(x - rw * 0.75, y + d); ctx.quadraticCurveTo(x, y + d + 5, x + rw * 0.75, y + d); ctx.lineTo(x + rw, y); ctx.quadraticCurveTo(x, y + 8, x - rw, y); ctx.fill();
  ctx.strokeStyle = lighten(wood, 0.25); ctx.lineWidth = 2;
  for (const k of [9, 17]) { ctx.beginPath(); ctx.moveTo(x - rw + k * 0.3, y + k); ctx.quadraticCurveTo(x, y + k + 5, x + rw - k * 0.3, y + k); ctx.stroke(); }
  ctx.strokeStyle = lighten(wood, 0.35); ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.ellipse(x, y, rw, 7, 0, Math.PI, 0, true); ctx.stroke();
}

export { SKINS as CATCH_SKINS };
