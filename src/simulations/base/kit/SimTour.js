/**
 * Adapted from wheresryan22/anatomy@e6600ff examples/raptor-engine/live.js (MIT, (c) 2026 Ryan)
 * Adapted from wheresryan22/anatomy@e6600ff examples/dial-indicator/build.mjs (MIT, (c) 2026 Ryan)
 *
 * SimTour - R13: an idle self-demo that hands over to the learner, and one
 * model feeding picture, number and screen-reader text.
 *
 *   const tr = tour(steps, { start: 1.4, resume: 3.6, hold: 2.2, cycles: 1, resumes: 2 });
 *   tr.reset(t)        arm it (call from enter(stage)): the first run starts at t + start
 *   tr.touch(t)        learner input (pointer down / drag / key): the tour lets go NOW and
 *                      re-arms at t + resume if a run was cut short (and resumes are left)
 *   tr.stop()          off for good (until the next reset)
 *   tr.poll(t)         -> { index, step } once when a new step is due, else null (edge)
 *   tr.at(t)           -> { phase, index, step, k }  phase: 'wait' | 'run' | 'done' | 'off'
 *   tr.busy(t)         true while waiting to start or running (feed it to busy())
 *   tr.done(t)         phase is 'done' or 'off': the loop may park
 *   tr.wakeIn(t)       seconds until the tour next changes something (Infinity: never)
 *
 * steps: any values (stop positions, targets, objects); a step object may carry
 * its own { hold } seconds. The tour never touches the scene: it hands back the
 * step and the scene sets the SAME target the learner would set (a spring or
 * follow() then moves the picture). That is why takeover needs no special case
 * and has no jump: on touch() the tour simply stops issuing steps and the
 * learner's input becomes the next target, eased from where things are now.
 *
 * Time in, state out: the scene feeds the scene clock t and its input events;
 * the tour owns no timers and no rAF. It never runs under reducedMotion().
 *
 * Waking and parking (the trade-off). A parked SimScene loop does not tick, and
 * its clock stops, so nothing on the scene clock can wake it later. The cheap
 * correct design is the one used here: busy(t) stays true while the tour is
 * waiting for its idle start (1.4 s), while it holds a step, and during the
 * 3.6 s resume wait; the scene ORs it into busy(), so the loop stays awake for
 * a BOUNDED time: start + cycles * steps * hold (+ resume + one cycle per
 * resume, at most `resumes` times). After that the tour is 'done', busy(t) goes
 * false and the loop parks for good. Rejected: this.after() per step (same
 * awake cost, plus timers to cancel on touch) and setTimeout (scenes may not
 * own timers; the engine owns parking). A tour that re-arms forever is never
 * offered: a touch after the tour finished turns it off.
 *
 * describer(root, { announce, quiet }) - the screen-reader half of "one model,
 * three outputs". The scene derives picture, readout chip and words from the
 * same model object in the same frame; describe() is the only path to the
 * live region and writes on a STATE CHANGE only:
 *   const sr = describer(this.container);           // or { announce: (text) => ... }
 *   sr.describe(text, t)   text unchanged -> no write; changed -> written now, or,
 *                          with quiet > 0, once it has stayed the same for quiet s
 *   sr.flush(t)            write a pending text whose quiet time is up (call from update)
 *   sr.pending()           true while a text waits for its quiet time (OR into busy())
 *   sr.last                the last text written;  sr.destroy() removes the region
 * Default region: a visually-hidden aria-live="polite" div appended to root
 * (pattern of SimPick.js). No document (Node) -> silently a no-op.
 *
 * say(el, text) - the visual readout writer of live.js: sets el.textContent only
 * when it changed (null el or no DOM: no-op). Returns true when it wrote.
 */
import { reducedMotion } from './SimAnim.js';

/** Defaults from anatomy references/motion.md:12 and dial-indicator build.mjs:210. */
export const TOUR = { start: 1.4, resume: 3.6, hold: 2.2 };

const holdOf = (step, hold) => (step && typeof step === 'object' && Number.isFinite(step.hold) ? Math.max(0.05, step.hold) : hold);

/**
 * An idle tour over `steps`. @opts start, resume, hold, cycles, resumes, reduced
 * (reduced: () => boolean, defaults to SimAnim.reducedMotion; for tests).
 */
export function tour(steps, o = {}) {
  const list = Array.from(steps ?? []);
  const n = list.length;
  const start = o.start ?? TOUR.start, resume = o.resume ?? TOUR.resume, hold = o.hold ?? TOUR.hold;
  const cycles = Math.max(1, Math.floor(o.cycles ?? 1));
  const isStill = o.reduced ?? reducedMotion;
  // One run: from step index `from`, `count` steps, starting at armAt.
  let off = true, armAt = 0, from = 0, count = 0, resumesLeft = 0, applied = -1;
  // Cumulative step start times of the current run (cached per run).
  let starts = [];
  const plan = () => {
    starts = [0];
    for (let i = 0; i < count; i++) starts.push(starts[i] + holdOf(list[(from + i) % n], hold));
  };
  const locate = (t) => {
    if (off || !n || isStill()) return { phase: 'off', index: -1, step: undefined, k: 0, i: -1 };
    if (t < armAt) return { phase: 'wait', index: -1, step: undefined, k: 0, i: -1 };
    const e = t - armAt;
    if (e >= starts[count]) {
      const last = (from + count - 1) % n;
      return { phase: 'done', index: last, step: list[last], k: 1, i: count };
    }
    let i = 0;
    while (i + 1 < count && starts[i + 1] <= e) i++;
    const index = (from + i) % n;
    return { phase: 'run', index, step: list[index], k: (e - starts[i]) / (starts[i + 1] - starts[i]), i };
  };
  const api = {
    get length() { return n; },
    reset(t = 0) {
      off = !n || isStill();
      armAt = t + start; from = 0; count = n * cycles; resumesLeft = Math.max(0, Math.floor(o.resumes ?? 2));
      applied = -1;
      plan();
      return api;
    },
    touch(t = 0) {
      if (off) return api;
      const s = locate(t);
      if (s.phase === 'off' || s.phase === 'done') { off = true; return api; }
      if (s.phase === 'run') {
        // Cut short mid-run: the next run picks up after the step on screen.
        if (resumesLeft <= 0) { off = true; return api; }
        resumesLeft -= 1;
        from = (s.index + 1) % n; count = n;
        plan();
      }
      // In 'wait' (not started yet, or already re-armed) just push the start back.
      armAt = t + resume;
      applied = -1;
      return api;
    },
    stop() { off = true; return api; },
    at(t) { const s = locate(t); return { phase: s.phase, index: s.index, step: s.step, k: s.k }; },
    poll(t) {
      const s = locate(t);
      if (s.phase !== 'run' || s.i === applied) return null;
      applied = s.i;
      return { index: s.index, step: s.step };
    },
    busy(t) { const p = locate(t).phase; return p === 'wait' || p === 'run'; },
    done(t) { return !api.busy(t); },
    running(t) { return locate(t).phase === 'run'; },
    wakeIn(t) {
      const s = locate(t);
      if (s.phase === 'wait') return armAt - t;
      if (s.phase === 'run') return armAt + starts[s.i + 1] - t;
      return Infinity;
    },
  };
  return api;
}

/** Visual readout writer: textContent only on change. Returns true when it wrote. */
export function say(el, text) {
  if (!el) return false;
  const s = String(text);
  if (el.textContent === s) return false;
  el.textContent = s;
  return true;
}

const HIDDEN = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';

/** Screen-reader writer: one live region, written on state change only. @opts announce, quiet */
export function describer(root, o = {}) {
  const quiet = Math.max(0, o.quiet ?? 0);
  let live = null, last = null, want = null, since = 0;
  const write = (text) => {
    last = text;
    if (o.announce) { o.announce(text); return; }
    if (typeof document === 'undefined' || !root || typeof root.appendChild !== 'function') return;
    if (!live) {
      live = document.createElement('div');
      live.className = 'sim-tour-live';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');
      live.style.cssText = HIDDEN;
      root.appendChild(live);
    }
    live.textContent = text;
  };
  const api = {
    get last() { return last; },
    describe(text, t = 0) {
      const s = String(text ?? '');
      if (s === want) return api.flush(t);
      want = s; since = t;
      if (s === last) return false;          // changed back before it was spoken
      return api.flush(t);
    },
    flush(t = 0) {
      if (want === null || want === last) return false;
      if (quiet > 0 && t - since < quiet) return false;
      write(want);
      return true;
    },
    pending() { return want !== null && want !== last && quiet > 0; },
    destroy() { live?.remove?.(); live = null; },
  };
  return api;
}
