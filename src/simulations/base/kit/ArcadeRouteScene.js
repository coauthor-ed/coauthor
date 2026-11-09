/**
 * ArcadeRouteScene - run an item down a yes/no key to its group.
 * The item is the runner; a gate comes towards it asking one question of the
 * key, with a YES door and a NO door (they swap sides from gate to gate, so a
 * side is never the cue). Tap the side of the door to steer. The right door:
 * on to the next question; the last one keys the item out. The wrong door
 * shows why and the SAME question comes again; no door at all when the gate
 * arrives costs a heart. The trail on the left is the key so far - the chain
 * of reasoning the game is really drilling.
 * Shared behaviour (pace, why card, mix-ups, boss round, HUD): ArcadeScene.
 *
 * The view is from behind the runner, down the track to the horizon of the polar world:
 * a gate appears small at the horizon's foot and grows as it comes; the question hangs on a
 * board across the top from the moment it appears, so the whole gate time is thinking time.
 *
 * Skins (CONFIG.skin): 'road' (default: an ice road, the item on a sled, barrier doors) and
 * 'rail' (two tracks over the snow, the item on a little train, signal gantries).
 *
 * CONFIG = {
 *   title: 'Work or not? Key run',
 *   groups: [{ id: 'zero', label: 'Zero work', tone?, why? }],   every key leaf
 *   key: { ask: 'Does the object move?', yes: <node | groupId>, no: <node | groupId> },
 *   items: [{ name: 'You push a wall that stays put', is: 'zero', why?, myth? }],
 *   skin?: 'road', rounds?: 8 (items), lives?: 3, relaxed?: false, gate?: 6 (seconds at the start),
 * }
 */
import { ArcadeScene, itemName, HUD_H, SKY_HZ, isDarkTheme, drawPine } from './ArcadeScene.js';
import { H, rr, font, mix, alpha, lighten, darken, pill, chipSize } from './SimLook.js';

const RUN_Y = 440;                 // the runner's depth (f = 1)
const TRACK_X1 = 480;              // the right-hand panel starts here
const LANE = [270, 410];           // the two lanes' middles at the runner's depth
const VP_X = 340;                  // the vanishing point sits on the horizon (SKY_HZ)
const F_NEAR = (H - SKY_HZ) / (RUN_Y - SKY_HZ);   // the depth factor at the bottom edge
const Z_NEAR = 1 / F_NEAR;         // world depth there (f = 1 / z)
const F0 = 0.2, F_HIT = 0.86;      // a gate appears at the horizon's foot and arrives at the runner
const Z_LOOP = 12;
const PINES = [[-1, 1.2, 1], [1, 2.6, 0], [-1, 4.1, 0], [1, 5.3, 2], [-1, 6.9, 1], [1, 8.4, 1], [-1, 9.8, 2], [1, 11.1, 0]];   // side, depth, size
const HOW = {
  road: 'Tap the side of the door that answers the question, before the gate reaches you.',
  rail: 'Tap the track that answers the signal\'s question, before the train reaches it.',
};

export class ArcadeRouteScene extends ArcadeScene {
  static KIND = 'Run the key';
  static HOW = HOW.road;
  static ARIA_LABEL = 'A key-running game: each item runs through yes/no gates of a key; steer through the right door to reach its group.';
  static DEFAULTS = { gate: 6, rounds: 8, skin: 'road' };

  checkConfig(cfg) {
    const p = [];
    cfg.how = cfg.how || HOW[cfg.skin];
    if (!HOW[cfg.skin]) p.push(`CONFIG.skin must be one of ${Object.keys(HOW).join(', ')}`);
    const ids = new Set((cfg.groups || []).map((g) => g.id));
    if (ids.size < 2) p.push('CONFIG.groups needs at least 2 groups (the leaves of the key)');
    const leaves = new Set();
    const walk = (n, depth) => {
      if (typeof n === 'string') { leaves.add(n); if (!ids.has(n)) p.push(`key leaf "${n}" is not a group id`); return; }
      if (!n || !n.ask || n.yes === undefined || n.no === undefined) { p.push(`key node ${JSON.stringify(n).slice(0, 60)} needs ask, yes and no`); return; }
      if (depth > 8) { p.push('key is deeper than 8 questions'); return; }
      walk(n.yes, depth + 1); walk(n.no, depth + 1);
    };
    walk(cfg.key, 0);
    for (const id of ids) if (!leaves.has(id)) p.push(`group "${id}" is not a leaf of the key`);
    const items = cfg.items || [];
    if (items.length < 3) p.push('CONFIG.items needs at least 3 items');
    for (const it of items) {
      if (!it.name) p.push('every item needs a name');
      if (!ids.has(it.is)) p.push(`item "${it.name}": "is" must be one group id (got ${JSON.stringify(it.is)})`);
    }
    return p;
  }

  menuSample() { return (this.cfg.items || []).slice(0, 3); }
  menuTint(c) { return c.accent; }
  mascotSpot() {
    const pl = this.play;
    return { x: 96, y: 508, h: 86, lookAt: pl?.cur ? { x: pl.rx, y: RUN_Y } : null };
  }

  /**
   * Every yes/no fork from the key's root to the item's group (the first path found).
   * A group can be a leaf under several branches (e.g. "zero work" for "did not move" and
   * "force not along the motion"); an item then sets `route: ['no']` / `['yes', 'no']` to
   * name its own answers fork by fork.
   */
  _forks(item) {
    const out = [];
    if (Array.isArray(item.route)) {
      let n = this.cfg.key;
      for (const a of item.route) {
        if (typeof n === 'string') break;
        const yes = a === 'yes';
        out.push({ node: n, yes });
        n = yes ? n.yes : n.no;
      }
      if (n === item.is) return out;
      out.length = 0;
    }
    const find = (n) => {
      if (typeof n === 'string') return n === item.is;
      out.push({ node: n, yes: true });
      if (find(n.yes)) return true;
      out[out.length - 1].yes = false;
      if (find(n.no)) return true;
      out.pop();
      return false;
    };
    find(this.cfg.key);
    return out;
  }

  beginRun(run) {
    run.queue = this.balanced(this.cfg.items, (it) => it.is, Math.min(this.cfg.rounds, this.cfg.items.length * 2));
    this.play = { cur: null, gate: null, lane: -1, rx: 340, trail: [], scroll: 0, keyed: null };
    this._next();
  }

  _next() {
    const item = this.run.queue.shift();
    const pl = this.play;
    pl.trail = [];
    pl.keyed = null;
    if (!item) { pl.cur = null; return; }
    pl.cur = { item, forks: this._forks(item), fi: 0, age: 0 };
    this._gate();
  }

  _gate() {
    const pl = this.play;
    pl.lane = -1;
    pl.gate = { f: F0, yesSide: Math.random() < 0.5 ? 0 : 1, age: 0, hit: null };
  }

  _group(id) { return this.cfg.groups.find((g) => g.id === id); }

  tapPlay(p) {
    const pl = this.play;
    if (!pl.cur || !pl.gate || pl.gate.hit) return;
    pl.lane = p.x < 340 ? 0 : 1;
  }

  tickPlay(d, real) {
    const pl = this.play;
    pl.scroll += d * 120;
    pl.rx += ((pl.lane < 0 ? 340 : LANE[pl.lane]) - pl.rx) * Math.min(1, real * 12);
    if (pl.keyed) return;
    const cur = pl.cur, g = pl.gate;
    if (!cur || !g) return;
    cur.age += real;
    g.age += real;
    if (g.hit) {
      g.hit.t += real;
      if (g.hit.t >= 0.35) this._resolve();
      return;
    }
    g.f += ((F_HIT - F0) / this.cfg.gate) * d;
    if (g.f >= F_HIT) g.hit = { t: 0, lane: pl.lane };
  }

  _resolve() {
    const pl = this.play, cur = pl.cur, g = pl.gate;
    const fork = cur.forks[cur.fi];
    const lane = g.hit.lane;
    const said = lane < 0 ? null : (lane === g.yesSide ? 'yes' : 'no');
    const want = fork.yes ? 'yes' : 'no';
    const name = itemName(cur.item);
    const leaf = this._group(cur.item.is);
    const answer = `${name}: "${fork.node.ask}" - ${want.toUpperCase()}`;
    const why = cur.item.why || leaf?.why || '';
    if (said === want) {
      this.right(pl.rx, RUN_Y - 40, cur.item);
      pl.trail.push({ ask: fork.node.ask, said });
      cur.fi += 1;
      if (cur.fi >= cur.forks.length) {
        pl.gate = null;
        pl.keyed = { t: 0, label: leaf.label };
        this.celebrate(pl.rx, RUN_Y - 30, 18);
        this.floatText(leaf.label, pl.rx, RUN_Y - 70, { bg: this.tone(leaf.tone ?? leaf.id), size: 18 });
        this.after(0.9, () => { if (this.itemDone()) this._next(); else pl.cur = null; });
      } else this._gate();
      return;
    }
    if (said === null) {
      pl.gate = null;
      this.slip({ item: cur.item, title: 'The gate got there first!', said: 'no door', answer, why, x: pl.rx, y: RUN_Y });
      return;
    }
    this.wrongTry({ item: cur.item, said: said.toUpperCase(), title: `Not ${said.toUpperCase()}.`, answer, why, x: pl.rx, y: RUN_Y });
    this._gate();
  }

  afterWhy(w) {
    const pl = this.play;
    if (w.lostLife) this._next();
    else if (!pl.gate && pl.cur && !pl.keyed) this._gate();
  }

  floeY() { return SKY_HZ; }   // the ice meets the horizon: the track runs out to it, under the sky

  /** Perspective: a point x wide of the middle at the runner's depth, seen at depth factor f (1 at the runner, 0 at the horizon). */
  _px(xn, f) { return VP_X + (xn - VP_X) * f; }
  _py(f) { return SKY_HZ + (RUN_Y - SKY_HZ) * f; }
  /** A strip of ground from the horizon to the bottom edge between x0 and x1 (measured at the runner's depth). */
  _strip(ctx, x0, x1) {
    ctx.beginPath();
    ctx.moveTo(VP_X, SKY_HZ);
    ctx.lineTo(this._px(x1, F_NEAR), H); ctx.lineTo(this._px(x0, F_NEAR), H);
    ctx.closePath(); ctx.fill();
  }

  drawPlay(ctx, c, t) {
    const pl = this.play;
    const rail = this.cfg.skin === 'rail';
    if (rail) this._drawRail(ctx, c); else this._drawRoad(ctx, c);
    this._drawSides(ctx, c);
    if (pl.cur && !pl.keyed) this._drawBeam(ctx, c, pl.rx);
    this._drawTrail(ctx, c);
    this._drawEnds(ctx, c);
    if (pl.gate) this._drawGate(ctx, c, t, pl.gate);
    if (pl.cur) {
      const bob = Math.sin(t * 9) * (rail ? 1 : 2.5);
      const lean = (pl.rx - 340) / 700;
      if (rail) this._drawEngine(ctx, c, pl.rx, RUN_Y + 14, t);
      else this._drawSled(ctx, c, pl.rx, RUN_Y + 30, t);
      this.drawToken(ctx, c, pl.cur.item, pl.rx, RUN_Y + bob, 190, 58, { glow: !pl.keyed, t, tilt: lean, tint: c.accent, mood: pl.keyed ? 'happy' : pl.gate?.hit && pl.gate.hit.lane < 0 ? 'oops' : 'smile' });
    }
    if (pl.gate) this._drawAsk(ctx, c, pl.gate);
  }

  /** The ice road: a ploughed strip of packed snow between two banks, its centre line running to the horizon. */
  _drawRoad(ctx, c) {
    const pl = this.play, dark = isDarkTheme(c);
    const edge = 150, bank = 44;
    ctx.fillStyle = alpha(lighten(c.ice, 0.4), dark ? 0.45 : 0.85);
    this._strip(ctx, VP_X - edge - bank, VP_X + edge + bank);
    ctx.fillStyle = alpha(mix(c.ice, c.seaDeep, 0.5), dark ? 0.5 : 0.3);   // the banks' shadowed inner slope
    this._strip(ctx, VP_X - edge - 14, VP_X + edge + 14);
    ctx.fillStyle = mix(mix(c.ice, c.seaDeep, dark ? 0.7 : 0.42), c.bgDeep, dark ? 0.25 : 0);
    this._strip(ctx, VP_X - edge, VP_X + edge);
    ctx.fillStyle = alpha(mix(c.warning, c.label, 0.3), 0.8);
    const sp = 0.9, off = (pl.scroll / 110) % sp;
    for (let z = Z_NEAR - off + sp; z < 14; z += sp) {
      const f0 = 1 / z, f1 = 1 / (z + sp * 0.45);
      if (f0 > F_NEAR) continue;
      const w0 = 3.5 * f0, w1 = 3.5 * f1;
      ctx.beginPath();
      ctx.moveTo(VP_X - w0, this._py(f0)); ctx.lineTo(VP_X + w0, this._py(f0)); ctx.lineTo(VP_X + w1, this._py(f1)); ctx.lineTo(VP_X - w1, this._py(f1));
      ctx.closePath(); ctx.fill();
    }
  }

  /** Two tracks over the snow plain: a gravel bed each, rails tapering to the horizon, sleepers sliding towards us. */
  _drawRail(ctx, c) {
    const pl = this.play, dark = isDarkTheme(c);
    ctx.fillStyle = alpha(mix(c.stroke, c.seaDeep, 0.5), dark ? 0.55 : 0.4);
    for (const lx of LANE) this._strip(ctx, lx - 54, lx + 54);
    const sp = 0.3, off = (pl.scroll / 110) % sp;
    ctx.fillStyle = mix(c.stroke, c.s8, 0.3);
    for (let z = Z_NEAR - off + sp; z < 16; z += sp) {
      const f = 1 / z, y = this._py(f), h = Math.max(1.2, 7 * f);
      for (const lx of LANE) { const hw = 46 * f; ctx.fillRect(this._px(lx, f) - hw, y - h / 2, hw * 2, h); }
    }
    ctx.fillStyle = mix(c.stroke, c.label, 0.5);
    for (const lx of LANE) for (const dx of [-31, 31]) this._strip(ctx, lx + dx - 2.2, lx + dx + 2.2);
    ctx.fillStyle = alpha(lighten(c.label, 0.5), 0.35);
    for (const lx of LANE) for (const dx of [-31, 31]) this._strip(ctx, lx + dx - 2.2, lx + dx - 1);
  }

  /** Snow pines passing on both sides, far ones first; an igloo and a signpost far off at the left. */
  _drawSides(ctx, c) {
    const pl = this.play;
    const zs = pl.scroll / 110;
    const trees = PINES.map(([side, z0, k]) => ({ side, k, z: Z_NEAR + 0.3 + (((z0 - zs) % Z_LOOP) + Z_LOOP) % Z_LOOP })).sort((a, b) => b.z - a.z);
    for (const tr of trees) {
      const f = 1 / tr.z;
      if (f > F_NEAR) continue;
      const x = this._px(VP_X + tr.side * (236 + tr.k * 30), f);
      drawPine(ctx, c, x, this._py(f) + 2 * f, (52 + tr.k * 14) * f, Math.min(1, (f - 0.07) * 8));
    }
  }

  /** The runner's lamp on the snow ahead: a soft wedge up the lane (lit by the lamp, not by the cabinet). */
  _drawBeam(ctx, c, rx) {
    const f1 = 0.42;
    const g = ctx.createLinearGradient(0, this._py(0.96), 0, this._py(f1));
    g.addColorStop(0, alpha(lighten(c.ice, 0.7), isDarkTheme(c) ? 0.16 : 0.1)); g.addColorStop(1, alpha(lighten(c.ice, 0.7), 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(rx - 60, this._py(0.96)); ctx.lineTo(rx + 60, this._py(0.96));
    ctx.lineTo(this._px(rx + 50, f1), this._py(f1)); ctx.lineTo(this._px(rx - 50, f1), this._py(f1));
    ctx.closePath(); ctx.fill();
  }

  /** The sled the item rides (seen from behind): a plank deck on two runners that curl up at the back, a lamp. */
  _drawSled(ctx, c, x, y, t) {
    const wood = mix(c.stroke, c.warning, 0.35);
    ctx.fillStyle = darken(wood, 0.4);
    rr(ctx, x - 112, y - 2, 224, 16, 6); ctx.fill();
    ctx.fillStyle = wood;
    rr(ctx, x - 112, y - 6, 224, 14, 6); ctx.fill();
    ctx.strokeStyle = alpha(darken(wood, 0.5), 0.5); ctx.lineWidth = 1.5;
    for (const dx of [-40, 40]) { ctx.beginPath(); ctx.moveTo(x + dx, y - 4); ctx.lineTo(x + dx, y + 6); ctx.stroke(); }
    ctx.strokeStyle = mix(c.stroke, c.label, 0.45);   // the runners
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + d * 96, y + 8); ctx.lineTo(x + d * 96, y + 16); ctx.lineTo(x + d * 120, y + 16); ctx.quadraticCurveTo(x + d * 132, y + 16, x + d * 132, y + 2); ctx.stroke();
    }
    ctx.fillStyle = c.bad;   // the tail lamp
    ctx.beginPath(); ctx.arc(x, y + 1, 4.5 + Math.sin(t * 6) * 0.5, 0, Math.PI * 2); ctx.fill();
    const puff = (t * 1.3) % 1;   // snow kicked up by the runners
    ctx.fillStyle = alpha(lighten(c.ice, 0.7), 0.35 * (1 - puff));
    for (const dx of [-124, 124]) { ctx.beginPath(); ctx.arc(x + dx, y + 14 + puff * 8, 4 + puff * 7, 0, Math.PI * 2); ctx.fill(); }
  }

  /** The last wagon of the little train (seen from behind): buffers, wheels, a tail lamp, a plough's snow spray. */
  _drawEngine(ctx, c, x, y, t) {
    ctx.fillStyle = darken(c.s6, 0.35);
    rr(ctx, x - 100, y, 200, 34, 10); ctx.fill();
    ctx.fillStyle = mix(c.s6, c.bgSurface, 0.2);
    rr(ctx, x - 100, y - 4, 200, 30, 10); ctx.fill();
    ctx.fillStyle = darken(c.stroke, 0.3);
    for (const dx of [-60, 60]) { rr(ctx, x + dx - 8, y + 20, 16, 10, 3); ctx.fill(); }
    ctx.fillStyle = darken(c.stroke, 0.4);
    for (const dx of [-70, -30, 30, 70]) { ctx.beginPath(); ctx.arc(x + dx, y + 32, 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = c.bad;
    ctx.beginPath(); ctx.arc(x, y + 12, 5 + Math.sin(t * 6) * 0.5, 0, Math.PI * 2); ctx.fill();
    const puff = (t * 1.1) % 1;
    ctx.fillStyle = alpha(lighten(c.ice, 0.7), 0.3 * (1 - puff));
    ctx.beginPath(); ctx.arc(x - 104 - puff * 12, y + 26 - puff * 8, 5 + puff * 8, 0, Math.PI * 2); ctx.arc(x + 104 + puff * 12, y + 26 - puff * 8, 5 + puff * 8, 0, Math.PI * 2); ctx.fill();
  }

  /** The question, hung on a board across the top of the track (readable from the moment a gate appears). */
  _drawAsk(ctx, c, g) {
    const fork = this.play.cur.forks[this.play.cur.fi];
    const f = this.fitText(ctx, c, fork.node.ask, 262, 18, 13, 800, false, 2);
    const bh = f.lines.length * (f.size + 4) + 18, bw = 300, y = HUD_H + 16;
    ctx.strokeStyle = mix(c.stroke, c.label, 0.3); ctx.lineWidth = 3;
    for (const dx of [-120, 120]) { ctx.beginPath(); ctx.moveTo(VP_X + dx, HUD_H); ctx.lineTo(VP_X + dx, y); ctx.stroke(); }
    ctx.fillStyle = darken(c.accent, 0.45);
    rr(ctx, VP_X - bw / 2, y + 4, bw, bh, 12); ctx.fill();
    ctx.fillStyle = mix(c.bgSurface, c.accent, 0.3);
    rr(ctx, VP_X - bw / 2, y, bw, bh, 12); ctx.fill();
    ctx.font = font(c, 800, f.size);
    ctx.fillStyle = c.label;   // readable through the countdown too: that is thinking time
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, i) => ctx.fillText(l, VP_X, y + 9 + f.size / 2 + i * (f.size + 4)));
    ctx.textAlign = 'left';
  }

  /** The gate coming up the track at depth g.f: a YES door and a NO door (a signal gantry on the rail skin). */
  _drawGate(ctx, c, t, g) {
    const pl = this.play;
    const fork = pl.cur.forks[pl.cur.fi];
    const rail = this.cfg.skin === 'rail';
    const f = g.f, y = this._py(f), hit = g.hit;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (rail) {   // the gantry: two posts at the track's edges and a bar over both tracks, lamps at the ends
      const px0 = this._px(VP_X - 160, f), px1 = this._px(VP_X + 160, f), top = y - 78 * f;
      ctx.fillStyle = mix(c.stroke, c.label, 0.3);
      ctx.fillRect(px0 - 3 * f, top, 6 * f, y - top);
      ctx.fillRect(px1 - 3 * f, top, 6 * f, y - top);
      ctx.fillRect(px0, top, px1 - px0, 7 * f);
      ctx.fillStyle = c.warning;
      for (const px of [px0, px1]) { ctx.beginPath(); ctx.arc(px, top - 3 * f, Math.max(1.5, 4 * f), 0, Math.PI * 2); ctx.fill(); }
    } else {   // the barrier's end posts on the banks
      ctx.fillStyle = mix(c.stroke, c.label, 0.25);
      for (const xn of [VP_X - 150, VP_X + 150]) { const hw = Math.max(2, 10 * f); ctx.fillRect(this._px(xn, f) - hw, y - 24 * f, hw * 2, 24 * f); }
    }
    for (let side = 0; side < 2; side++) {
      const yes = side === g.yesSide;
      const lx = this._px(LANE[side], f);
      const chosen = pl.lane === side;
      const col = yes ? c.s3 : c.s6;
      const shake = hit && hit.lane === side && ((hit.lane === g.yesSide) !== fork.yes) ? Math.sin(hit.t * 80) * 4 : 0;
      const dw = (rail ? 88 : 120) * f, dh = (rail ? 32 : 40) * f, r = (rail ? 16 : 12) * f;
      const dy = rail ? y - 70 * f : y - 24 * f;   // the board hangs from the bar; the door stands on the road
      if (rail) { ctx.fillStyle = darken(c.stroke, 0.3); ctx.fillRect(lx - 2 * f + shake, dy - 6 * f, 4 * f, 8 * f); }
      ctx.fillStyle = darken(col, 0.4);
      rr(ctx, lx - dw / 2 + shake, dy + 4 * f, dw, dh, r); ctx.fill();
      ctx.fillStyle = chosen ? lighten(col, 0.25) : col;
      rr(ctx, lx - dw / 2 + shake, dy, dw, dh, r); ctx.fill();
      if (!rail) { ctx.fillStyle = alpha(lighten(col, 0.7), 0.3); rr(ctx, lx - dw / 2 + 10 * f + shake, dy + 4 * f, dw - 20 * f, 8 * f, 4 * f); ctx.fill(); }
      if (chosen) {
        ctx.strokeStyle = c.warning;
        ctx.lineWidth = Math.max(2, 4 * f);
        rr(ctx, lx - dw / 2 - 4 * f, dy - 4 * f, dw + 8 * f, dh + 12 * f, r + 2 * f); ctx.stroke();
      }
      if (f >= 0.35) {
        ctx.font = font(c, 800, Math.max(13, 20 * f), true);
        ctx.fillStyle = c.bgDeep;
        ctx.fillText(yes ? 'YES' : 'NO', lx + shake, dy + dh / 2 + 1);
      }
    }
    ctx.textAlign = 'left';
  }

  _drawTrail(ctx, c) {
    const pl = this.play;
    if (!pl.cur) return;
    ctx.font = font(c, 800, 14);
    ctx.fillStyle = c.labelMuted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('THE KEY SO FAR', 14, HUD_H + 22);
    let y = HUD_H + 48;
    for (const s of pl.trail.slice(-4)) {
      const f = this.fitText(ctx, c, s.ask, 150, 14, 12, 700, false, 2);
      ctx.font = font(c, 700, f.size);
      ctx.fillStyle = c.label;
      f.lines.forEach((l, i) => ctx.fillText(l, 14, y + i * (f.size + 2)));
      y += f.lines.length * (f.size + 2) + 12;
      pill(ctx, c, s.said.toUpperCase(), 14, y, { bg: s.said === 'yes' ? c.s3 : c.s6, align: 'left', size: 13 });
      y += 32;
    }
  }

  /** Where the key can end: a signpost, one arrow board per group, the reached one lit green. */
  _drawEnds(ctx, c) {
    const pl = this.play;
    const x0 = TRACK_X1 + 14, n = this.cfg.groups.length;
    ctx.font = font(c, 800, 14);
    ctx.fillStyle = c.labelMuted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('WHERE IT CAN END', x0, HUD_H + 22);
    const y0 = HUD_H + 50, step = 36;
    ctx.fillStyle = mix(c.stroke, c.label, 0.3);   // the post, with a snow cap
    rr(ctx, x0 + 6, y0 - 22, 10, (n - 1) * step + 54, 4); ctx.fill();
    ctx.fillStyle = alpha(lighten(c.ice, 0.7), 0.9);
    rr(ctx, x0 + 3, y0 - 26, 16, 8, 4); ctx.fill();
    let y = y0;
    for (const g of this.cfg.groups) {
      const bg = pl.keyed && g.label === pl.keyed.label ? c.good : mix(this.tone(g.tone ?? g.id), c.bgSurface, 0.35);
      const { w, h } = chipSize(ctx, c, g.label, 14);
      pill(ctx, c, g.label, x0 + 12, y, { bg, align: 'left', size: 14 });
      ctx.fillStyle = bg;   // the arrow tip
      ctx.beginPath(); ctx.moveTo(x0 + 12 + w - 2, y - h / 2 + 2); ctx.lineTo(x0 + 12 + w + 10, y); ctx.lineTo(x0 + 12 + w - 2, y + h / 2 - 2); ctx.closePath(); ctx.fill();
      y += step;
    }
  }
}

export { HOW as ROUTE_SKINS };
