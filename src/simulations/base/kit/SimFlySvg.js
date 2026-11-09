/** SimFlySvg.js
 * SimFlySvg - keyed tokens that fly from A to B on the live layer (SimSvg liveLayer), on springs
 * (SimAnim springStep per axis), retargetable mid-flight (the velocity carries on), with a stagger.
 * Works in an SvgScene and in any withClock(DomSimulation). Original code.
 *
 * Call it on every animate() pass the token shows (a pass that skips a key drops its flight), like the
 * other live recipes. A flight still moving calls live.more(), so the clock runs on until it lands:
 * after a tap that changes a target, call this.liveFrame() (or this.repaint()) and the clock wakes.
 *
 *   flyTo(live, key, from, to, o) -> { x, y, p, moving, age }   the token's position this pass.
 *                    from {x, y}: where it starts on its FIRST pass (null: starts at rest on to);
 *                    to {x, y}: its target; a new target retargets it.
 *                    o = { preset = 'smooth' (SimAnim SPRINGS name or { period, zeta }),
 *                          delay (s: waited before a flight from rest starts; a new target given while
 *                          it rests waits again), arc (px lift at mid-flight, default 0) }.
 *                    p: 0..1 how far along this leg; age: seconds since it landed (-1 while flying),
 *                    so a landing can kick or pop.
 *   flyMany(live, items, o) -> [pos]   items [{ key, from, to, delay? }]; item i waits o.lag * i
 *                    (default TIMING.stagger) on top of o.delay; o as flyTo.
 *   flying(live) -> bool   any flight still waiting or moving (OR it into scene logic; busy() already
 *                    stays true while the clock runs for it).
 *   flyChip(live, key, text, from, to, o) -> { el, pos }   flyTo + liveChip (SimSvg): the chip lifts a
 *                    little in the air and squashes on landing; o = flyTo opts + liveChip opts.
 * Reduced motion and skip(): tokens jump to their targets (no delay).
 */
import { springStep, kick, uiSpring, reducedMotion, TIMING } from './SimAnim.js';
import { liveChip } from './SimSvg.js';

const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const PREFIX = 'fly|';
const near = (a, b) => Math.abs(a - b) < 0.01;

/** One token's position this pass (see the header). */
export function flyTo(live, key, from, to, o = {}) {
  const t = live.t ?? 0;
  const f = live.state(PREFIX + key, () => {
    const s = from ?? to;
    return {
      x: { x: s.x, v: 0 }, y: { x: s.y, v: 0 }, tx: s.x, ty: s.y, sx: s.x, sy: s.y,
      wait: 0, last: t, moving: false, landed: t - 10,
    };
  });
  // A new target: a flight from rest waits its delay; one in the air turns at once, keeping its speed.
  if (!near(f.tx, to.x) || !near(f.ty, to.y)) {
    if (!f.moving) { f.wait = Math.max(0, o.delay ?? 0); f.sx = f.x.x; f.sy = f.y.x; }
    f.tx = to.x; f.ty = to.y; f.moving = true;
  }
  let dt = t - f.last;
  f.last = t;
  if (!(dt > 0)) dt = 0;   // a clock restart (play) or a repaint at the same time
  if (f.moving) {
    if (live.skipping || reducedMotion()) {
      f.x = { x: f.tx, v: 0 }; f.y = { x: f.ty, v: 0 }; f.wait = 0;
    } else if (f.wait > 0) {
      const used = Math.min(f.wait, dt);
      f.wait -= used; dt -= used;
      if (f.wait <= 0) { f.sx = f.x.x; f.sy = f.y.x; }
    }
    if (dt > 0) {
      const mx = springStep(f.x, f.tx, dt, o.preset ?? 'smooth');
      const my = springStep(f.y, f.ty, dt, o.preset ?? 'smooth');
      if (!mx && !my) { f.moving = false; f.landed = t; }
    } else if (f.x.x === f.tx && f.y.x === f.ty && f.wait <= 0) { f.moving = false; f.landed = t; }
    if (f.moving) live.more();
  }
  const L = Math.hypot(f.tx - f.sx, f.ty - f.sy);
  const p = f.moving ? (L > 0.5 ? clamp01(1 - Math.hypot(f.tx - f.x.x, f.ty - f.y.x) / L) : 1) : 1;
  const lift = f.moving && f.wait <= 0 && o.arc ? o.arc * 4 * p * (1 - p) : 0;
  return { x: f.x.x, y: f.y.x - lift, p, moving: f.moving, waiting: f.moving && f.wait > 0, age: f.moving ? -1 : t - f.landed };
}

/** Several tokens, item i waiting o.lag * i more than o.delay (see the header). */
export function flyMany(live, items, o = {}) {
  const lag = o.lag ?? TIMING.stagger, d0 = o.delay ?? 0;
  return items.map((it, i) => flyTo(live, it.key, it.from, it.to, { ...o, delay: it.delay ?? d0 + lag * i }));
}

/** True while any flight on this live layer waits or moves. */
export function flying(live) {
  for (const f of live.states(PREFIX)) if (f.moving) return true;
  return false;
}

/** A chip that flies: flyTo + liveChip, lifted in the air and squashed on landing. */
export function flyChip(live, key, text, from, to, o = {}) {
  const pos = flyTo(live, key, from, to, o);
  const air = pos.moving && !pos.waiting ? Math.sin(Math.PI * pos.p) : 0;
  const landing = pos.age >= 0 && pos.age < 0.6 && !live.skipping;
  const land = landing ? kick(pos.age, uiSpring('playful')) : 0;
  if (landing && !reducedMotion()) live.more();
  const scale = (o.scale ?? 1) * (1 + 0.1 * air + 0.08 * land);
  const el = liveChip(live, key, text, pos.x, pos.y, { ...o, scale });
  return { el, pos };
}
