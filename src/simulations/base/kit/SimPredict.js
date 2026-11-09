/**
 * SimPredict - predict-then-observe for canvas scenes (pairs with SimScene and
 * SimLook). The learner commits to a guess BEFORE the scene shows what happens;
 * the reveal then says whether the guess held. Scenes that make the learner
 * predict teach better than ones they only watch (audit: 4.41 vs 3.68), and
 * most beat-driven scenes have no such step.
 *
 *   const gate = predictGate(this, {
 *     prompt: 'When does Car B catch Car A?',
 *     options: [{ id: '2', text: '2 hours' }, { id: '3', text: '3 hours' }, { id: '4', text: '4 hours' }],
 *     answer: '3',                      id of the right option; omit when any guess is fine (an opinion)
 *     at: { x: 340, y: 470 },           chip row anchor (centre, vertical middle); default bottom centre
 *     revealAfter: 0.7,                 seconds from commit to reveal (via scene.after)
 *     onCommit(id) {}, onReveal({ id, correct }) {},   your hooks: start the run, show the result
 *     size: 16,
 *   });
 *   enter(stage)   { gate.reset(); }            re-arm on every beat that asks
 *   pointerDown(p) { return gate.pointerDown(p); }
 *   draw(ctx, c)   { ...scene...; gate.draw(ctx, c); }       the prompt bar, chips, verdict
 *   busy()         { return gate.busy; }                       true from commit to reveal
 *   onControlChange(id, v) { if (id === 'guess') gate.choose(v); }   keyboard path: a select control
 *
 *   gate.state    'asking' | 'committed' | 'revealed'
 *   gate.choice   chosen id or null;  gate.correct  true | false | null (null: no answer declared)
 *   gate.revealed boolean;  gate.locked  true once committed (a guess cannot be changed)
 *
 * Reveal runs on scene.after(), which the base drops on a stage change, so a
 * gate left mid-run never fires into the next beat. A right guess calls
 * scene.celebrate(); a wrong one scene.oops(), each at the chosen chip (a 'tick'
 * look puts its tick beside the verdict line instead, on the next draw). Draw
 * the REVEALED picture only when gate.revealed (or your own onReveal state), so
 * the answer is never on screen while the learner is deciding. ASCII only.
 */
import { pill, chipRow, captionBar, W, H, MIN_PX } from './SimLook.js';
import { findMode } from './SimFind.js';

export function predictGate(scene, o = {}) {
  const opts = o.options ?? [];
  if (opts.length < 2) throw new Error('predictGate: needs at least two options');
  if (o.answer != null && !opts.some((x) => String(x.id) === String(o.answer))) throw new Error('predictGate: answer is not one of the options');
  const at = o.at ?? { x: W / 2, y: H - 36 };
  const g = {
    state: 'asking', choice: null, correct: null, boxes: [], tickDue: false,
    get revealed() { return g.state === 'revealed'; },
    get locked() { return g.state !== 'asking'; },
    get busy() { return g.state === 'committed'; },
    reset() { g.state = 'asking'; g.choice = null; g.correct = null; g.boxes = []; g.tickDue = false; },
    choose(id) {
      if (g.state !== 'asking') return false;
      const opt = opts.find((x) => String(x.id) === String(id));
      if (!opt) return false;
      g.choice = String(opt.id);
      g.state = 'committed';
      o.onCommit?.(g.choice);
      scene.animateFor?.(((o.revealAfter ?? 0.7) + 0.5) * 1000);
      scene.after((o.revealAfter ?? 0.7), () => {
        if (g.state !== 'committed') return;
        g.state = 'revealed';
        g.correct = o.answer == null ? null : g.choice === String(o.answer);
        const b = g.boxes.find((x) => x.id === g.choice);
        const cx = b ? b.x0 + b.w / 2 : at.x, cy = b ? b.y0 + b.h / 2 : at.y;
        // A tick look (plain) marks the verdict line instead: on the chip it would cover the words.
        if (g.correct === true && findMode() === 'tick') g.tickDue = true;
        else if (g.correct === true) scene.celebrate?.(cx, cy - 20, 24);
        else if (g.correct === false) scene.oops?.(cx, cy);
        o.onReveal?.({ id: g.choice, correct: g.correct });
      });
      return true;
    },
    pointerDown(p) {
      if (g.state !== 'asking' || !p) return false;
      const hit = g.boxes.find((b) => p.x >= b.x0 - 4 && p.x <= b.x0 + b.w + 4 && p.y >= b.y0 - 4 && p.y <= b.y0 + b.h + 4);
      return hit ? g.choose(hit.id) : false;
    },
    draw(ctx, c) {
      const size = Math.max(MIN_PX, o.size ?? 16);
      if (o.prompt) captionBar(ctx, c, o.prompt, W / 2, o.promptY ?? 12, { maxW: 620, size, maxLines: 2 });
      const picked = (x) => String(x.id) === g.choice;
      const tone = (x) => {
        if (g.state === 'asking') return c.accent;
        if (g.state === 'committed') return picked(x) ? c.warning : c.stroke;
        if (o.answer != null && String(x.id) === String(o.answer)) return c.good;
        return picked(x) ? c.bad : c.stroke;
      };
      const row = chipRow(ctx, c, opts.map((x) => ({ text: x.text, bg: tone(x) })), at.x, at.y, { align: 'center', size, gap: 10, wrapAt: 620 });
      g.boxes = row.map((b, i) => ({ ...b, id: String(opts[i].id) }));
      if (g.state === 'revealed' && g.correct != null) {
        const topY = Math.min(...g.boxes.map((b) => b.y0));
        const v = pill(ctx, c, g.correct ? 'You predicted it.' : 'Not quite. Look again.', at.x, Math.max(20, topY - 24), { bg: g.correct ? c.good : c.bad, size: MIN_PX + 1 });
        if (g.tickDue) { g.tickDue = false; scene.celebrate?.(v.x0 - 24, v.y0 + v.h / 2, 24); }
      }
    },
  };
  return g;
}
