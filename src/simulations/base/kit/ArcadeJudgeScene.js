/**
 * ArcadeJudgeScene - true or false, one statement at a time. Built for myths
 * and misconceptions: the learner commits, and a wrong call shows the evidence
 * straight away. One card at a time on purpose (a field of pop-ups splits
 * attention and rewards guessing - the lesson of an earlier whack-a-mole game).
 * A wrong call shows why and the statement comes back later; the timer running
 * out costs a heart. Busting a myth (calling a false one false) earns a badge.
 * Shared behaviour (pace, why card, mix-ups, boss round, HUD): ArcadeScene.
 *
 * Skins (CONFIG.skin): 'cards' (default: swipe the card right for true, left
 * for false, or tap the buttons) and 'doors' (the statement waits at two
 * doors; open the TRUE door or the FALSE door before the candle burns down).
 *
 * CONFIG = {
 *   title: 'Myth or fact?',
 *   statements: [{ text: 'Friction destroys energy.', truth: false, why: 'it turns kinetic energy into heat', myth?: true, art? }],
 *   skin?: 'cards', rounds?: 10, lives?: 3, relaxed?: false, think?: 9 (seconds per card at the start),
 * }
 * Aim for a mix: about half true, half false, so "always false" never wins.
 * Keyboard: Right arrow or T calls TRUE, Left arrow or F calls FALSE.
 */
import { lookOf } from './lookProfile.js';
import { ArcadeScene, drawIgloo } from './ArcadeScene.js';
import { W, rr, font, mix, alpha, lighten, darken, drawFloor, drawBadge } from './SimLook.js';

const HOW = {
  cards: 'Swipe the card right if it is true, left if it is false - or tap the buttons.',
  doors: 'Open the TRUE door or the FALSE door before the candle burns down.',
};
const CARD = { x: W / 2, y: 250, w: 420, h: 220 };

export class ArcadeJudgeScene extends ArcadeScene {
  static KIND = 'True or false';
  static HOW = HOW.cards;
  static ARIA_LABEL = 'A true-or-false game: judge one statement at a time; a wrong call shows the evidence.';
  static DEFAULTS = { think: 9, rounds: 10, skin: 'cards' };
  static DRAGGABLE = true;
  static ATTRACT_S = 4.2;

  checkConfig(cfg) {
    const p = [];
    cfg.how = cfg.how || HOW[cfg.skin];
    if (!HOW[cfg.skin]) p.push(`CONFIG.skin must be one of ${Object.keys(HOW).join(', ')}`);
    const st = cfg.statements || [];
    if (st.length < 4) p.push('CONFIG.statements needs at least 4 statements');
    for (const s of st) {
      if (!s.text || typeof s.truth !== 'boolean') p.push(`statement ${JSON.stringify(s).slice(0, 60)} needs text and truth: true|false`);
      if (!s.why) p.push(`statement "${String(s.text).slice(0, 40)}" needs a why (the evidence shown after a wrong call)`);
    }
    const t = st.filter((s) => s.truth).length;
    if (st.length >= 4 && (t < st.length * 0.25 || t > st.length * 0.75)) p.push(`statements are ${t} true of ${st.length}: keep between a quarter and three quarters true`);
    return p;
  }

  menuSample() { return [{ name: 'TRUE', art: false }, { name: 'FALSE', art: false }]; }

  /** Attract demo, in the menu's right column over Quill: one true card is read, leans right, and is
   *  called TRUE. At rest (u = 1) the card sits over the two answers. */
  menuDemo(ctx, c, t, u) {
    const s = (this.cfg.statements || []).find((x) => x.truth) || this.cfg.statements?.[0];
    if (!s) return;
    const lean = u < 0.35 ? 0 : u < 0.62 ? (u - 0.35) / 0.27 : 1;
    const fly = u < 0.62 || u >= 1 ? 0 : (u - 0.62) / 0.3;
    const back = u >= 0.92 && u < 1 ? (u - 0.92) / 0.08 : 0;
    const pop = Math.min(1, u / 0.12);
    const dx = u >= 1 ? 0 : lean * 30 + fly * 440;
    const a = u >= 1 ? 1 : fly > 0 ? 1 - fly : 1;
    const cx = 560, y = 120, py = 196;
    ['FALSE', 'TRUE'].forEach((label, i) => {
      const x = i ? cx + 58 : cx - 58;
      const col = i ? c.good : c.s6;
      const on = i === 1 && lean > 0.6 && u < 1;
      ctx.fillStyle = on ? col : mix(c.bgSurface, col, 0.35);
      rr(ctx, x - 48, py - 17, 96, 34, 17); ctx.fill();
      ctx.font = font(c, 800, 15, true);
      ctx.fillStyle = on ? c.bgDeep : c.label;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, py + 1);
    });
    if (back > 0) this._statement(ctx, c, s, cx, y, 220, 96, { scale: Math.max(0.01, back) * 0.9, alpha: back, tint: c.accent });
    else this._statement(ctx, c, s, cx + dx, y - fly * 20, 220, 96, { scale: (0.85 + 0.15 * pop) * 0.9, rot: dx / 900, alpha: a, tint: lean > 0.6 && u < 1 ? mix(c.accent, c.good, lean) : c.accent });
    ctx.textAlign = 'left';
  }

  mascotSpot() {
    const cur = this.play?.cur;
    if (this.cfg.skin === 'doors') return { x: 292, y: 470, h: 80, lookAt: cur ? { x: W / 2, y: 158 } : null };
    return { x: 62, y: 404, h: 84, lookAt: cur ? { x: CARD.x + cur.dx, y: CARD.y } : null };
  }

  keyPlay(key, down) {
    if (!down) return false;
    const k = key.toLowerCase();
    const truth = k === 'arrowright' || k === 't' ? true : k === 'arrowleft' || k === 'f' ? false : null;
    if (truth === null || !this.play?.cur) return false;
    if (this.cfg.skin === 'doors') this._call(truth, truth === !!this.play.cur.doorsTrueLeft ? 150 : W - 150, 372);
    else { this.play.cur.dx = truth ? 140 : -140; this._call(truth, W / 2 + (truth ? 140 : -140), CARD.y); }
    return true;
  }
  menuTint(c) { return c.s5; }
  bossPool() { return this.cfg.statements; }

  beginRun(run) {
    run.queue = this.balanced(this.cfg.statements, (s) => String(s.truth), Math.min(this.cfg.rounds, this.cfg.statements.length * 2));
    this.play = { cur: null, drag: null, out: null, badge: 0, doorOpen: -1 };
    this._next();
  }

  _next() {
    const pl = this.play;
    const s = this.run.queue.shift();
    pl.cur = s ? { s, left: this.cfg.think, age: 0, dx: 0, doorsTrueLeft: Math.random() < 0.5 } : null;
    pl.doorOpen = -1;
  }

  tickPlay(d, real) {
    const pl = this.play;
    pl.badge = Math.max(0, pl.badge - real);
    if (pl.out) {
      pl.out.t += real / 0.35;
      if (pl.out.t >= 1) { pl.out = null; if (this.itemDone()) this._next(); else pl.cur = null; }
      return;
    }
    const cur = pl.cur;
    if (!cur) return;
    cur.age += real;
    if (!pl.drag) cur.dx *= Math.exp(-real * 12);
    cur.left -= d;
    if (cur.left <= 0) {
      const s = cur.s;
      pl.cur = null;
      this.slip({ item: s, title: 'Time ran out!', said: 'no call', answer: `${s.truth ? 'TRUE' : 'FALSE'}: ${s.text}`, why: s.why });
    }
  }

  afterWhy(w) { if (w.lostLife || !this.play.cur) this._next(); }

  _call(said, x, y) {
    const pl = this.play;
    const cur = pl.cur;
    if (!cur || pl.out) return;
    const s = cur.s;
    if (said === s.truth) {
      this.right(x, y - 60, s);
      if (!s.truth && s.myth) { pl.badge = 1.4; this.floatText('MYTH BUSTED', W / 2, CARD.y - 140, { bg: this.colors.s4, size: 20 }); }
      pl.out = { t: 0, dir: said ? 1 : -1, s, dx: cur.dx };
      if (this.cfg.skin === 'doors') pl.doorOpen = this._doorFor(said);
    } else {
      this.requeue(s);
      pl.cur = null;
      this.wrongTry({ item: s, said: said ? 'TRUE' : 'FALSE', title: `It is ${s.truth ? 'TRUE' : 'FALSE'}.`, answer: s.text, why: s.why, x, y });
      this.itemDone();
    }
  }

  _doorFor(truth) {
    const tl = this.play.cur?.doorsTrueLeft;
    return truth === !!tl ? 0 : 1;
  }

  onHit(id, data, p) {
    if (id === 'call') this._call(data, p.x, p.y);
    else if (id === 'door') this._call(data, p.x, p.y);
    else if (id === 'card' && this.cfg.skin === 'cards') this.play.drag = { x0: p.x, dx0: this.play.cur?.dx || 0 };
  }

  movePlay(p) {
    const pl = this.play;
    if (!pl.drag || !pl.cur) return false;
    pl.cur.dx = pl.drag.dx0 + (p.x - pl.drag.x0);
    this.animateFor?.();
    return false;
  }

  releasePlay() {
    const pl = this.play;
    if (!pl.drag) return;
    pl.drag = null;
    const dx = pl.cur?.dx || 0;
    if (Math.abs(dx) > 90) this._call(dx > 0, CARD.x + dx, CARD.y);
  }

  floeY() { return this.cfg.skin === 'doors' ? 470 : 420; }

  drawPlay(ctx, c, t) {
    const pl = this.play;
    if (this.cfg.skin === 'doors') this._drawDoors(ctx, c, t); else this._drawCards(ctx, c, t);
    if (pl.badge > 0) drawBadge(ctx, c, 'star', W / 2, CARD.y - 170, 22 * Math.min(1, pl.badge * 3), c.s4);
  }

  _statement(ctx, c, s, cx, cy, w, h, o = {}) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(o.rot || 0);
    if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale); // scale the drawing, never the layout, so text does not reflow
    ctx.globalAlpha *= o.alpha ?? 1;
    const tint = o.tint || c.accent;
    ctx.fillStyle = darken(tint, 0.45);
    if (lookOf().lip > 0) { rr(ctx, -w / 2, -h / 2 + 7, w, h, 22); ctx.fill(); }
    ctx.fillStyle = mix(c.bgSurface, tint, 0.16);
    rr(ctx, -w / 2, -h / 2, w, h, 22); ctx.fill();
    ctx.strokeStyle = tint;
    ctx.lineWidth = 3;
    rr(ctx, -w / 2, -h / 2, w, h, 22); ctx.stroke();
    if (lookOf().gloss > 0) { ctx.fillStyle = alpha(lighten(tint, 0.7), 0.15); rr(ctx, -w / 2 + 14, -h / 2 + 8, w - 28, 16, 8); ctx.fill(); }
    const f = this.fitText(ctx, c, s.text, w - 60, 26, 16, 800, true, Math.max(2, Math.floor((h - 30) / 22)));
    ctx.font = font(c, 800, f.size, true);
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, i) => ctx.fillText(l, 0, (i - (f.lines.length - 1) / 2) * (f.size + 6)));
    if (this.isBoss(s)) { ctx.font = font(c, 800, 13); ctx.fillStyle = c.warning; ctx.fillText('BOSS CARD - x2', 0, -h / 2 + 30); }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  _timer(ctx, c, x, y, u) {
    ctx.strokeStyle = mix(c.bgSurface, c.stroke, 0.6);
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = u < 0.3 ? c.bad : c.warning;
    ctx.beginPath(); ctx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u); ctx.stroke();
  }

  _drawCards(ctx, c, t) {
    const pl = this.play;
    // a small stack of waiting cards behind
    for (let k = 2; k >= 1; k--) {
      if (this.run.queue.length >= k) {
        ctx.fillStyle = mix(c.bgSurface, c.stroke, 0.3 + k * 0.1);
        rr(ctx, CARD.x - CARD.w / 2 + k * 10, CARD.y - CARD.h / 2 + k * 8, CARD.w - k * 20, CARD.h, 22); ctx.fill();
      }
    }
    const cur = pl.cur;
    if (pl.out) {
      const u = pl.out.t;
      this._statement(ctx, c, pl.out.s, CARD.x + pl.out.dx + pl.out.dir * u * 520, CARD.y - u * 40, CARD.w, CARD.h, { rot: pl.out.dir * u * 0.5, tint: pl.out.dir > 0 ? c.good : c.s6 });
    } else if (cur) {
      const pop = Math.min(1, cur.age / 0.25);
      const lean = cur.dx / 600;
      const tint = cur.dx > 40 ? mix(c.accent, c.good, Math.min(1, cur.dx / 120)) : cur.dx < -40 ? mix(c.accent, c.s6, Math.min(1, -cur.dx / 120)) : c.accent;
      this._statement(ctx, c, cur.s, CARD.x + cur.dx, CARD.y, CARD.w, CARD.h, { rot: lean, tint, scale: 0.8 + 0.2 * pop });
      this.hit('card', { x: CARD.x - CARD.w / 2, y: CARD.y - CARD.h / 2, w: CARD.w, h: CARD.h });
      this._timer(ctx, c, CARD.x + CARD.w / 2 - 34 + cur.dx, CARD.y - CARD.h / 2 + 34, Math.max(0, cur.left / this.cfg.think));
    }
    this._callButton(ctx, c, false, 150, 452, t);
    this._callButton(ctx, c, true, W - 150, 452, t);
  }

  _callButton(ctx, c, truth, cx, cy, t) {
    const col = truth ? c.good : c.s6;
    const w = 200, h = 64, x = cx - w / 2, y = cy - h / 2;
    ctx.fillStyle = darken(col, 0.4);
    if (lookOf().lip > 0) { rr(ctx, x, y + 6, w, h, h / 2); ctx.fill(); }
    ctx.fillStyle = col;
    rr(ctx, x, y, w, h, h / 2); ctx.fill();
    if (lookOf().gloss > 0) { ctx.fillStyle = alpha(lighten(col, 0.6), 0.45); rr(ctx, x + 14, y + 7, w - 28, 14, 7); ctx.fill(); }
    drawBadge(ctx, c, truth ? 'check' : 'cross', truth ? x + w - 32 : x + 32, cy, 17, darken(col, 0.25));
    ctx.font = font(c, 800, 24, true);
    ctx.fillStyle = c.bgDeep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truth ? 'TRUE' : 'FALSE', cx + (truth ? -14 : 14), cy + 2);
    ctx.textAlign = 'left';
    this.hit('call', { x, y, w, h: h + 6 }, truth);
  }

  _drawDoors(ctx, c, t) {
    const pl = this.play;
    if (!this.arcadeWorld()) drawFloor(ctx, c, 470, { col: mix(c.bgSurface, c.s2, 0.25), seams: true });
    const cur = pl.cur || (pl.out ? { s: pl.out.s, left: 0, doorsTrueLeft: pl.out.dir > 0 === (pl.doorOpen === 0) } : null);
    const trueLeft = cur ? cur.doorsTrueLeft : true;
    for (let side = 0; side < 2; side++) {
      const truth = side === 0 ? trueLeft : !trueLeft;
      const col = truth ? c.good : c.s6;
      const dx = side === 0 ? 150 : W - 150, dy = 372, dw = 150, dh = 186;
      const open = pl.doorOpen === side ? Math.min(1, (pl.out?.t ?? 1) * 1.6) : 0;
      if (this.arcadeWorld()) {   // an igloo each: the called one's doorway lights up warm
        const iw = 210, ih = 140, base = dy + dh / 2;
        drawIgloo(ctx, c, { x: dx, base: base - 6 * open, w: iw, h: ih, col, glow: open });
        ctx.font = font(c, 800, 24, true);
        ctx.fillStyle = c.label;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(truth ? 'TRUE' : 'FALSE', dx, base - ih - 22);
        this.hit('door', { x: dx - iw / 2, y: base - ih - 44, w: iw, h: ih + 44 }, truth);
        continue;
      }
      ctx.fillStyle = darken(col, 0.55);
      rr(ctx, dx - dw / 2 - 10, dy - dh / 2 - 10, dw + 20, dh + 16, 20); ctx.fill();
      ctx.fillStyle = mix(c.bgDeep, c.warning, 0.35 * open);
      rr(ctx, dx - dw / 2, dy - dh / 2, dw, dh, 14); ctx.fill();
      ctx.fillStyle = mix(c.bgSurface, col, 0.4);
      rr(ctx, dx - dw / 2, dy - dh / 2, dw * (1 - 0.8 * open), dh, 14); ctx.fill();
      ctx.fillStyle = lighten(col, 0.3);
      ctx.beginPath(); ctx.arc(dx - dw / 2 + dw * (1 - 0.8 * open) - 18, dy + 10, 7, 0, Math.PI * 2); ctx.fill();
      ctx.font = font(c, 800, 24, true);
      ctx.fillStyle = c.label;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(truth ? 'TRUE' : 'FALSE', dx, dy - dh / 2 - 26);
      this.hit('door', { x: dx - dw / 2, y: dy - dh / 2 - 44, w: dw, h: dh + 44 }, truth);
    }
    if (cur && !pl.out) {
      this._statement(ctx, c, cur.s, W / 2, 158, 360, 150, { tint: c.accent });
      // the candle: it burns down with the time left
      const u = Math.max(0, cur.left / this.cfg.think);
      const ch = 20 + 80 * u, cx = W / 2, by = 450;
      ctx.fillStyle = mix(c.bgSurface, c.label, 0.75);
      rr(ctx, cx - 12, by - ch, 24, ch, 5); ctx.fill();
      const fl = 1 + Math.sin(t * 20) * 0.1;
      ctx.fillStyle = c.warning;
      ctx.beginPath(); ctx.ellipse(cx, by - ch - 14, 7 * fl, 13 * fl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mix(c.warning, c.label, 0.6);
      ctx.beginPath(); ctx.ellipse(cx, by - ch - 11, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'left';
  }
}

export { HOW as JUDGE_SKINS };
