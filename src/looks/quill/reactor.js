import { EventBus } from '../../core/EventBus.js';
import { LookManager } from '../../core/LookManager.js';
import { CUES } from '../../core/cues.js';
import { celebrate } from '../../ui/celebrate.js';
import { quillStage } from './stage.js';
import { createPool } from './cameoPlan.js';

/**
 * The Quill look's reactor: cues in, Quill out.
 *
 * Views and plugins emit cues (src/core/cues.js) saying what happened; this
 * module alone decides how Quill answers, per the choreography table in
 * docs/ui-ux-design-system.md 1.1.2. LookManager imports it from
 * registry/looks.json ("reactor") and calls start() while the Quill look is
 * active, and the returned stop() when it is not.
 *
 * Design: the reactor owns no Quill of its own. An emitter that has a place
 * for the companion on screen (a <quill-coach>, a <quill-mascot> in its own
 * template) hands that element over as `companion`, and the reactor drives it
 * (face, act, line, show / hide). So the element stays where its layout is,
 * while the decision of what he does lives here. The restraint budget (one
 * act per 20 s, one at a time) stays in QuillMascot.perform(), so every act
 * from here goes through it. The math-workspace coach answers its own math:*
 * cue family; this reactor arms it (quillStage) and keeps <quill-coach> off
 * the questions it claims (below).
 *
 * Where no companion is on screen, the act goes to <quill-cameo>, which comes
 * to an edge for it: a find (cue:found) under its own find-only rules, any
 * other act under the same 20 s budget. It loads with the first act it plays.
 * A find has no emitter with a companion to hand over (a scene emits it), so the
 * cameo finds out by asking: a stage with a Quill of its own in view says so, and
 * that Quill acts instead of the cameo (QuillCameo.js, same rules).
 *
 * Variety: a cue picks from a small pool, never the same act twice running
 * (createPool). Math.random only, never the crypto APIs: the portal is plain
 * HTTP. Confetti belongs to the cheer alone (lesson complete, full test score,
 * a day-streak milestone).
 *
 * Rows with no reaction here (lesson start, first wrong, error) are rows the
 * app has never shown; the cues exist so a look can answer them without
 * touching call sites.
 */

// <quill-coach>, second consecutive miss and on. Wrong answers are progress,
// never failure, and he is never `sad` at the student.
const COACH_LINES = [
  'Wrong answers welcome. They earn interest here.',
  'I got that one wrong too. Want a hint?',
  'Close. Try reading the question once more.',
];
const COACH_MS = 7000;

// mini-game@1 intro. A game's `objective` already states the goal in the
// header, so this says something else. Picked once per mount.
const GAME_INTRO_LINES = [
  'Ready when you are.',
  "Let's see what you've got.",
  'Your move.',
  'Give it a go.',
  'Time to play.',
];
const GAME_INTRO_MS = 3600;

const MATH_EVENTS = ['math:step-checked', 'math:milestone', 'math:stuck', 'math:hint', 'math:goal', 'math:card-unlocked'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const POOLS = {
  correct: ['nod', 'clap', 'peek'],
  found: ['clap', 'inktick'],
  solved: ['twirl', 'dance', 'slide'],
  missAgain: ['snack', 'shrug'],
  revealRight: ['twirl', 'clap'],
};

/** The big moment: `cheer` + confetti. The act goes through the mascot's
 *  own `act` property, so a just-rendered <quill-mascot> plays it in its first
 *  update, the moment its rig exists and before any style pass: his first
 *  brow change snaps, as it always has, instead of transitioning. */
function cheerWithConfetti(q) {
  if (q && 'act' in q) q.act = 'cheer';
  celebrate('lesson');
}

/** The act goes on the element as a property: a just-rendered <quill-mascot>
 *  plays it in its first update, the moment its rig exists. */
function actOn(q, act) {
  if (q && 'act' in q) q.act = act;
  else q?.perform?.(act);
}

export function start() {
  const picks = Object.fromEntries(Object.entries(POOLS).map(([k, list]) => [k, createPool(list)]));
  let cameoLoad = null;
  let castLoad = null;
  // A course with a story cast (LookManager.cast()) gets its narrator for the
  // cameo instead of Quill: Quill never shows in a cast course.
  const castFigure = () => LookManager.cast?.()?.overlay?.figure || null;
  const cameo = () => {
    const fig = castFigure();
    if (fig) return (castLoad ||= import('../../core/cast/CastCameo.js')).then((m) => m.castCameo(fig));
    return (cameoLoad ||= import('./QuillCameo.js').then((m) => m.quillCameo()));
  };
  const serve = (act, p) => { cameo().then((c) => c.serve(act, p || {})).catch(() => {}); };
  const clearStage = () => { cameoLoad?.then((c) => c.leave()); castLoad?.then((m) => m.leaveCastCameo()); };
  // A test is sober by rule, whatever a scene inside it may announce.
  const sober = () => /^#\/test\//.test(location.hash);

  // math-workspace@1 questions belong to <quill-math-coach>: <quill-coach>
  // stays quiet on them. Claimed by type when the question's beat arrives
  // (outside assess mode) and by any math:* traffic carrying its id.
  const mathIds = new Set();
  const isMath = (p) => !!p?.questionId && mathIds.has(p.questionId);

  const on = {
    'lesson:beat-changed': (p) => {
      const cur = p?.current;
      if (cur?.id && String(cur.type || '').startsWith('math-workspace@') && cur.mode !== 'assess') mathIds.add(cur.id);
      clearStage();
    },

    [CUES.CORRECT]: (p) => {
      // A finished semantic-descriptive chain: a bigger answer than a nod.
      if (p?.big) { serve('twirl', p); return; }
      if (isMath(p)) return;
      p?.companion?.hide?.();
      // The third in a row is cue:streak's, which follows at once.
      if (p?.run && p.run % 3 === 0) return;
      serve(picks.correct(), p);
    },

    [CUES.STREAK]: (p) => { serve('dance', p); },

    // A day-streak milestone (7, 30): a cheer and confetti, like the end of a
    // lesson. The award that brings it lands on any right answer, so he drops
    // the smaller act already running. Never during a test.
    [CUES.STREAK_MILESTONE]: (p) => {
      if (sober()) return;
      celebrate('lesson');
      cameo().then((c) => c.milestone('cheer', p)).catch(() => {});
    },

    // He thinks it over with the learner, wherever there is room.
    [CUES.PREDICT]: (p) => { serve('think', p); },
    [CUES.HINT]: (p) => { serve('think', p); },

    // A first miss is normal; commenting on it would be nagging.
    [CUES.WRONG]: () => {},

    [CUES.WRONG_AGAIN]: (p) => {
      const coach = p?.companion;
      if (isMath(p) || !coach?.show) return;
      coach.show(COACH_LINES[Math.min((p.misses || 2) - 2, COACH_LINES.length - 1)], COACH_MS);
      const m = coach.mascot;
      m?.setExpression('surprised');
      m?.perform(picks.missAgain());
    },

    // The verdict chip / story narrator on a POE recap. Right: a twirl. A
    // wrong prediction is a surprising outcome, so a wow, never sad.
    [CUES.REVEAL]: (p) => {
      const q = p?.companion;
      q?.setExpression?.(p.correct ? 'heart' : 'surprised');
      actOn(q, p.correct ? picks.revealRight() : 'wow');
    },

    // A concept found in a scene. The cameo holds the find rules, and hands the
    // act to a Quill already by the scene. Past its novelty he drops to a small
    // act, a nod or a peek.
    [CUES.FOUND]: (p) => {
      if (sober()) return;
      const act = p?.small ? 'nod' : p?.lookAt ? 'point' : picks.found();
      cameo().then((c) => c.find(p, act, p?.small || !p?.lookAt ? 'nod' : 'peek')).catch(() => {});
    },

    // Same shape as "Lesson start": a wave and a line, non-blocking. Not when
    // the scene stands its own Quill inside the game (it greets in setup()).
    [CUES.GAME_START]: (p) => {
      const q = p?.companion;
      if (!q || p.sceneCompanion) return;
      q.perform?.('wave');
      q.speak?.(pick(GAME_INTRO_LINES), GAME_INTRO_MS);
    },

    [CUES.GAME_SOLVED]: (p) => {
      const q = p?.companion;
      // The game's top level, or solved at the first try: the big one.
      const act = p?.top || p?.attempts === 1 ? 'backflip' : picks.solved();
      if (q) {
        q.setExpression?.('heart');
        // He stands in the layout here, so a slide stays on the spot.
        q.perform?.(act, act === 'slide' ? { target: { inPlace: true } } : undefined);
      } else if (p?.host) {
        cameo().then((c) => c.find({ ...p, key: p.key ?? 'solved' }, act, 'twirl')).catch(() => {});
      }
    },

    // Never `sad` on a retry: the student is the one having a hard time.
    [CUES.GAME_RETRY]: (p) => {
      const q = p?.companion;
      q?.setExpression?.('surprised');
      if (p?.reason === 'retry') q?.perform?.('shrug');
    },

    [CUES.IDLE]: (p) => { p?.companion?.perform?.('peek'); },

    [CUES.LESSON_COMPLETE]: (p) => {
      clearStage();
      cheerWithConfetti(p?.companion);
    },

    // Band-keyed face, never `sad`. Confetti and a cheer only for a clean
    // sweep, a bow for a good score, and only live: never when re-opening an
    // old attempt.
    [CUES.TEST_RESULT]: (p) => {
      const q = p?.companion;
      const pct = Number(p?.pct) || 0;
      q?.setExpression?.(pct >= 90 ? 'heart' : pct >= 60 ? 'happy' : 'surprised');
      if (!p?.live) return;
      clearStage();
      if (p?.perfect) cheerWithConfetti(q);
      else if (pct >= 60) actOn(q, 'bow');
    },
  };
  const claim = (p) => { if (p?.questionId) mathIds.add(p.questionId); };

  for (const [ev, fn] of Object.entries(on)) EventBus.on(ev, fn);
  MATH_EVENTS.forEach((e) => EventBus.on(e, claim));
  quillStage.active = true;

  return function stop() {
    for (const [ev, fn] of Object.entries(on)) EventBus.off(ev, fn);
    MATH_EVENTS.forEach((e) => EventBus.off(e, claim));
    clearStage();
    quillStage.active = false;
  };
}
