/**
 * SimNarration - narration helpers for scenes a narrated lesson drives (narration.md sec 5, 6, 8a). Generic kit helper, not a scene.
 *
 *   withNarrationCues(Base)   mixin: cue log + seek, so replay and scrub back restore the picture
 *   narrOn(scene, f)          call from the scene's narrationFocus(f), see below
 *   narrKeepColourCss(ids, sel)  css for the scene's css() that keeps a lit part's own colour
 *
 * withNarrationCues
 * The engine (content-block narration contract, SimulationBase doc) fires onCue(id) once per beat at the
 * cue's word time, and, for a scene with static SEEKABLE = true, calls seek(beat, ms) at each beat start,
 * resume, scrub and about 8 times a second while the audio plays. A cue fires only once per beat, so a
 * replay of the same beat (back to its start) would leave the last cue's picture on screen. This mixin
 * keeps the scene consistent with the audio position instead:
 *   - each cue is logged with the beat time it arrived at (the last seek time seen);
 *   - when the time goes back (replay, scrub inside the beat) the scene drops its cue effects
 *     (cueReset(base)) and re-applies, in order, every logged cue at or before the new time;
 *   - as the time moves on again, logged cues are re-applied as their time comes round
 *     (the engine does not fire them a second time).
 * A new beat clears the log; the scene's own onStep restores that beat's start state as before.
 * Pause needs nothing: the picture stays where the audio stopped.
 *
 * Scene contract (all on the scene class):
 *   static CUES        array of the cue ids it understands; others are ignored
 *   applyCue(id, ms)   show the cue; ms = how long ago it was due (0 when live), so a sweep can start part-way
 *   cueBase()          optional: snapshot of the learner's state when the beat started (default null)
 *   cueReset(base)     drop all cue effects, back to that snapshot
 * Field names: all state in this._nc (never the base classes' reserved names).
 * A cue move is the teacher's hand, never the learner's: applyCue must NOT call interactDone. Send
 * interactDone(id) only from an end-of-gesture event (click; change or pointer up for a slider or drag, never input
 * or pointermove), and only after a real change by the learner.
 * Cue ids and their effects go in the scene header comment and the course cue table. tools/narration-lint.mjs
 * checks a plain script cue id against static CUES.
 *
 * narrOn / narrKeepColourCss
 * Use when the engine's lit glow on a part would read as a data colour (e.g. blue = case on a crowd dot). The scene
 * marks its root with the lit ids while narrated (data-narr-on), and narrKeepColourCss(ids, sel) turns the glow off on
 * those parts (sel = the part class; the part carries data-narr="<id>"). Dimming is untouched. Narration off: no
 * attribute, no rule matches, no pixel changes.
 */

/** Seek steps back by more than this (ms) count as a jump back; smaller ones are timer jitter. */
const BACK_MS = 300;

export function withNarrationCues(Base) {
  return class NarrationCueScene extends Base {
    static SEEKABLE = true;

    _ncs() {
      if (!this._nc) this._nc = { beat: -1, log: [], applied: new Set(), lastMs: 0, base: null };
      return this._nc;
    }

    onCue(id) {
      if (!(this.constructor.CUES || []).includes(id)) return;
      const nc = this._ncs();
      if (!nc.log.some((c) => c.id === id)) nc.log.push({ id, ms: nc.lastMs });
      nc.applied.add(id);
      this.applyCue(id, 0);
    }

    seek(beat, ms) {
      const nc = this._ncs();
      const t = Number.isFinite(ms) ? ms : 0;
      if (beat !== nc.beat) {
        nc.beat = beat;
        nc.log = [];
        nc.applied = new Set();
        nc.lastMs = t;
        nc.base = this.cueBase?.() ?? null;
        return;
      }
      if (t < nc.lastMs - BACK_MS && nc.applied.size) {
        nc.applied = new Set();
        this.cueReset(nc.base);
      }
      nc.lastMs = t;
      for (const c of nc.log) {
        if (nc.applied.has(c.id) || c.ms > t) continue;
        nc.applied.add(c.id);
        this.applyCue(c.id, t - c.ms);
      }
    }

    /** Tells the narration that the learner did what the beat asked (await "interact"; spec D15). */
    interactDone(id) {
      const el = this.root || this.container;
      el?.dispatchEvent?.(new CustomEvent('scene-interact-done', { bubbles: true, composed: true, detail: { id } }));
    }
  };
}

/** Call from the scene's narrationFocus(f): marks the root with the lit ids while narrated. */
export function narrOn(scene, f) {
  const r = scene?.root;
  if (!r) return;
  if (f?.narrated) r.setAttribute('data-narr-on', (f.on || []).join(' '));
  else r.removeAttribute('data-narr-on');
}

/** CSS for the scene's css(): a lit part keeps its own colour (no glow filter). sel defaults to the crowd dot class. */
export const narrKeepColourCss = (ids, sel = '.scw-dot') =>
  `${ids.map((i) => `[data-narr-on~="${i}"] ${sel}[data-narr~="${i}"]`).join(',\n')} { filter: none !important; }\n`;

export const narrDotsCss = narrKeepColourCss;

/* ---- Tagging helpers (attributes only: inert with narration off). From the epi course's NarrTags.js. ----
 *   na(n)                    ' data-narr="n"' ('-' = data-narr-hide, '' = nothing)
 *   tagFirst(html, n)        tag the first element of an html string
 *   tagTop(html, n)          tag every top-level element of an html or svg string (children untouched)
 *   tagEach(html, tag, ids)  tag the k-th <tag ...> of an html string with ids[k] (missing: untouched)
 *   tagEl(el, n)             tag one live element ('-' = hide, '' = untag)
 *   tagLive(live, key, people, idOf)  tag a crowdLive (SimCrowd) scene's dots after crowdLive ran
 */
export const na = (n) => (!n ? '' : n === '-' ? ' data-narr-hide=""' : ` data-narr="${n}"`);

export const tagFirst = (html, n) => (n && html ? html.replace(/^(\s*<[\w-]+)/, `$1${na(n)}`) : html);

const VOID = new Set(['br', 'img', 'input', 'hr', 'wbr', 'meta', 'link', 'source', 'col', 'area', 'base', 'embed', 'track', 'param']);
export function tagTop(html, n) {
  if (!n || !html) return html;
  let depth = 0;
  return html.replace(/<(\/?)([\w-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/g, (m, close, name, rest) => {
    if (close) { depth--; return m; }
    const self = /\/\s*$/.test(rest) || VOID.has(name.toLowerCase());
    const out = depth === 0 ? `<${name}${na(n)}${rest}>` : m;
    if (!self) depth++;
    return out;
  });
}

export function tagEl(e, n) {
  if (!e) return;
  if (n === '-') {
    if (e.hasAttribute('data-narr')) e.removeAttribute('data-narr');
    if (!e.hasAttribute('data-narr-hide')) e.setAttribute('data-narr-hide', '');
    return;
  }
  if (e.hasAttribute('data-narr-hide')) e.removeAttribute('data-narr-hide');
  if (!n) { if (e.hasAttribute('data-narr')) e.removeAttribute('data-narr'); return; }
  if (e.getAttribute('data-narr') !== n) e.setAttribute('data-narr', n);
}

export function tagLive(live, key, people, idOf) {
  for (const p of people) tagEl(live?.get?.(`${key}|${p.id}`), idOf(p));
}

export function tagEach(html, tag, ids) {
  let i = 0;
  return html.replace(new RegExp(`<${tag}(?=[\\s>])`, 'g'), (m) => { const n = ids[i++]; return n ? m + na(n) : m; });
}
