import { noteLineHtml, SIM_LOOK_DOM_CSS } from './kit/SimLookDom.js';
import { normalizeBeatMap } from './kit/beatMap.js';

/**
 * DomBeats - opt-in beat and note plumbing for a DomSimulation scene; other scenes are unaffected.
 * A scene extends withBeats(DomSimulation), keeps static BEAT_STEP_MAP and static BEAT_MAPS as literals
 * (tools read them), and writes onStep(step, beat, count) only. Optional static NOTES (one line per step)
 * is mounted once as the last child of root (class css-note) and re-synced on every beat and every render({ html }).
 * Not for a scene with its own beat state machine (a dwell chain): that scene keeps its own onBeatChange.
 * SvgScene is not supported here (it has its own onBeatChange, which reads BEAT_MAPS by count too).
 * A beat-less mount (count MAX_SAFE_INTEGER) lands on the last beat of BEAT_STEP_MAP. All mixin state lives in this._wb; the only names added are onBeatChange, onStep (yours), NOTES and render.
 */

// A note value: a string, { en }, or an array of those (one row each).
const rowOf = (t) => (t && typeof t === 'object' ? t.en : t);

function syncNote(s) {
  const notes = s.constructor.NOTES;
  if (!notes || !s.root) return;
  const raw = notes[s.stepIndex ?? 0] ?? notes[0];
  const rows = [].concat(raw ?? []).map(rowOf).filter((t) => typeof t === 'string' && t).map((text) => ({ text }));
  const wb = s._wb;
  if (!wb.note || wb.note.parentNode !== s.root) {
    if (!rows.length) return;
    if (![...s._injectedStyles.keys()].some((c) => c.includes('.sl-note-line'))) s.injectStyle(SIM_LOOK_DOM_CSS);
    wb.note = document.createElement('div');
    wb.note.className = 'css-note';
  }
  const kids = s.root.children;
  if (kids[kids.length - 1] !== wb.note) s.root.appendChild(wb.note);   // always the last child, whenever the scene built its DOM
  wb.note.innerHTML = rows.length ? noteLineHtml(rows) : '';
}

/**
 * Wraps a DomSimulation so a scene gets count-keyed BEAT_MAPS, onStep(step, beat, count) and one NOTES line.
 */
export function withBeats(Base) {
  if (typeof Base.prototype.onBeatChange === 'function') throw new Error('withBeats: ' + Base.name + ' has its own onBeatChange; wrap DomSimulation');
  return class BeatScene extends Base {
    constructor(container, config) {
      super(container, config);
      this._wb = { note: null };
    }

    onBeatChange(beat, count) {
      const C = this.constructor;
      const n = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
      const map = normalizeBeatMap(C.BEAT_MAPS?.[n] ?? C.BEAT_STEP_MAP, C.name);
      if (!Array.isArray(map) || !map.length) { syncNote(this); return; }
      const b = Math.trunc(Number.isFinite(beat) ? beat : 0);
      const i = Math.max(0, Math.min(b, map.length - 1));
      const step = map[i][0].idx;
      this.stepIndex = step;
      if (this.root) this.root.dataset.step = String(step);
      syncNote(this);
      this.onStep?.(step, i, n);
      this.animateFor?.();
      this.requestUiUpdate?.();
    }

    render(opts) {
      const root = super.render(opts);
      if (typeof opts?.html === 'string') { syncNote(this); this.relayout(); }   // a scene that builds its DOM after render() gets the note on its first beat
      return root;
    }
  };
}
