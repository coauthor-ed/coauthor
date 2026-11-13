/**
 * Narration model: the pure half of narrated lessons (PLAN.md W1, phase N1).
 *
 * A lesson may carry `narrationRef`, a bundle-relative path to a
 * `coauthor-narration@1` sidecar written by tools/narration/build-narration.py.
 * Each sidecar segment is one beat of the lesson, addressed by
 * `{ block: <block id>, step: <STEP id or b<N>> }`, with its audio, duration,
 * the speakable `text`, and word timings `[startMs, endMs, charOffset]`
 * (charOffset indexes `text`).
 *
 * Everything here is pure and DOM-free so test/unit can run it under plain
 * node: segment lookup, the word under the playhead, caption phrases, the
 * timed-read fallback for beats with no audio, the lesson timeline the
 * scrubber draws, the stale-audio diff (shared with
 * tools/narration/check-narration.mjs) and a light sidecar shape check
 * (shared with tools/validation/lesson.js).
 */

export const NARRATION_FORMAT = 'coauthor-narration@1';

/** Words per second a beat with no audio is "read" at (timed fallback). */
export const TIMED_WORDS_PER_SEC = 3;
/** A timed beat never flashes past: a one-word beat still holds this long. */
export const TIMED_MIN_MS = 1500;

/** The derived step name a beat without an authored STEP id has: b1, b2 ... */
export const derivedStep = (stepIndex) => `b${(stepIndex | 0) + 1}`;

/**
 * Indexes a sidecar's segments for lookup. Never throws on a malformed
 * sidecar: anything unusable is simply not indexed.
 * @returns {{ byKey: Map<string, object>, byBlock: Map<string, object[]>, segments: object[] }}
 */
export function indexSegments(sidecar) {
  const segments = Array.isArray(sidecar?.segments) ? sidecar.segments.filter((s) => s && s.block) : [];
  const byKey = new Map();
  const byBlock = new Map();
  for (const s of segments) {
    byKey.set(`${s.block}#${s.step}`, s);
    if (!byBlock.has(s.block)) byBlock.set(s.block, []);
    byBlock.get(s.block).push(s);
  }
  return { byKey, byBlock, segments };
}

/**
 * The segment for one beat of the lesson, or null (the beat then falls back
 * to a timed read). Tried in order:
 *  1. `{block, step: stepId}` where stepId is the beat's authored STEP id;
 *  2. `{block, step: b<N>}` the derived name of beat N (stepIndex N-1);
 *  3. a segment of that block whose 1-based `beat` equals stepIndex + 1;
 *  4. a question's single `prompt` segment, on its first beat.
 * @param {ReturnType<typeof indexSegments>} index
 * @param {{block: string, stepId?: string|null, stepIndex?: number}} at
 */
export function findSegment(index, { block, stepId = null, stepIndex = 0 } = {}) {
  if (!index || !block) return null;
  const i = Number.isInteger(stepIndex) && stepIndex >= 0 ? stepIndex : 0;
  if (stepId) {
    const s = index.byKey.get(`${block}#${stepId}`);
    if (s) return s;
  }
  const d = index.byKey.get(`${block}#${derivedStep(i)}`);
  if (d) return d;
  const list = index.byBlock.get(block) || [];
  const byBeat = list.find((s) => s.step !== 'prompt' && Number(s.beat) === i + 1);
  if (byBeat) return byBeat;
  if (i === 0) return list.find((s) => s.step === 'prompt') || null;
  return null;
}

/**
 * Voices (Q-43). A sidecar may offer several narrator voices, built at
 * authoring time: top-level `voices: [{ id, label, name, rate, pitch }]`,
 * the first being the default. A segment's own top-level `audio`,
 * `durationMs`, `words`, `cues` (and `voice`, `rate`, `pitch`, `ttsHash`)
 * are the DEFAULT voice's, exactly as in a one-voice sidecar, so an older
 * engine keeps playing it; every other voice sits in `seg.voices[id]` with
 * the same fields plus its own `textHash`. Text, await, hint and free are
 * shared. A sidecar with no `voices` list has one voice and no picker.
 * @returns {Array<{id: string, label: string, name: string}>}
 */
export function sidecarVoices(sidecar) {
  const list = Array.isArray(sidecar?.voices) ? sidecar.voices : [];
  const seen = new Set();
  const out = [];
  for (const v of list) {
    if (!v || typeof v.id !== 'string' || !v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push({ id: v.id, label: typeof v.label === 'string' && v.label.trim() ? v.label.trim() : v.id, name: typeof v.name === 'string' ? v.name : '' });
  }
  return out;
}

/** The voice to use: `wanted` when the sidecar offers it, else its first (default), else null (one voice). */
export function pickVoice(sidecar, wanted) {
  const vs = sidecarVoices(sidecar);
  if (!vs.length) return null;
  return vs.some((v) => v.id === wanted) ? wanted : vs[0].id;
}

const VOICE_FIELDS = ['audio', 'durationMs', 'words', 'cues', 'voice', 'rate', 'pitch', 'ttsHash'];
const voiceCache = new WeakMap();

/**
 * One segment as voice `voiceId` speaks it: the default segment with that
 * voice's fields laid over (same object each call, so identity checks hold),
 * carrying `voiceId` and `defaultSeg`. The segment itself when the voice is
 * the default, unknown, has no audio for this beat, or is stale (its
 * `textHash` differs from the segment's): the default voice then reads it.
 */
export function segmentForVoice(seg, voiceId) {
  if (!seg || !voiceId) return seg;
  const alt = seg.voices?.[voiceId];
  if (!alt || typeof alt.audio !== 'string' || !alt.audio) return seg;
  if (alt.textHash && seg.textHash && alt.textHash !== seg.textHash) return seg;
  let m = voiceCache.get(seg);
  if (!m) { m = new Map(); voiceCache.set(seg, m); }
  let out = m.get(voiceId);
  if (!out) {
    out = { ...seg, voiceId, defaultSeg: seg };
    delete out.voices;
    for (const k of VOICE_FIELDS) if (alt[k] !== undefined) out[k] = alt[k];
    m.set(voiceId, out);
  }
  return out;
}

/**
 * The same spoken position in another voice's audio of one beat. The word
 * under `ms` in `from` is found by its char offset in `to` (both index the
 * same text, so this holds even if the two word lists differ in length).
 * `wordStart`: the start of that word in `to` (where a switched voice
 * resumes, so no word is cut); else the same fraction into it (a smooth
 * clock, e.g. scene time). Falls back to the duration ratio.
 */
export function mapVoiceMs(from, to, ms, { wordStart = false } = {}) {
  const fw = from?.words || [];
  const tw = to?.words || [];
  const t = Math.max(0, Number(ms) || 0);
  const ratio = () => {
    const a = Number(from?.durationMs) || 0;
    const b = Number(to?.durationMs) || 0;
    return a > 0 && b > 0 ? Math.round(Math.min(b, t * (b / a))) : t;
  };
  if (!fw.length || !tw.length) return ratio();
  const i = wordIndexAt(fw, t);
  if (i < 0) return wordStart ? 0 : Math.round(Math.min(tw[0][0], t * (tw[0][0] / Math.max(1, fw[0][0]))));
  const ch = fw[i][2];
  let k = 0;
  for (let j = 0; j < tw.length; j++) { if (tw[j][2] <= ch) k = j; else break; }
  if (wordStart) return tw[k][0];
  const fEnd = i + 1 < fw.length ? fw[i + 1][0] : Math.max(fw[i][1], Number(from?.durationMs) || fw[i][1]);
  const tEnd = k + 1 < tw.length ? tw[k + 1][0] : Math.max(tw[k][1], Number(to?.durationMs) || tw[k][1]);
  const frac = Math.max(0, Math.min(1, (t - fw[i][0]) / Math.max(1, fEnd - fw[i][0])));
  return Math.round(tw[k][0] + frac * (tEnd - tw[k][0]));
}

/**
 * Index of the word being spoken at `ms` (media time): the last word whose
 * start is <= ms. -1 before the first word. Binary search, words sorted by start.
 * @param {Array<[number, number, number]>} words
 */
export function wordIndexAt(words, ms) {
  if (!Array.isArray(words) || !words.length || !(ms >= words[0][0])) return -1;
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (words[mid][0] <= ms) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * The text span of each word: [charStart, charEnd) into `text`. A word ends
 * where the next starts (trailing space and punctuation trimmed off the word,
 * punctuation kept: "claim." reads as one word on screen).
 */
export function wordSpans(text, words) {
  const t = String(text ?? '');
  const out = [];
  for (let i = 0; i < (words?.length || 0); i++) {
    const start = Math.max(0, Math.min(t.length, words[i][2] | 0));
    let end = i + 1 < words.length ? Math.max(start, Math.min(t.length, words[i + 1][2] | 0)) : t.length;
    while (end > start && /\s/.test(t[end - 1])) end--;
    out.push([start, end]);
  }
  return out;
}

/**
 * Caption phrases as word ranges [first, last] (inclusive). The sidecar's own
 * `lines` win when present; otherwise phrases break after a sentence end, or
 * after a comma/semicolon once a phrase is long enough, and never run past
 * `maxWords` / `maxChars`.
 */
export function captionPhrases(seg, { maxWords = 14, maxChars = 96 } = {}) {
  const words = seg?.words || [];
  if (Array.isArray(seg?.lines) && seg.lines.length) {
    return seg.lines
      .filter((r) => Array.isArray(r) && r.length >= 2)
      .map(([a, b]) => [Math.max(0, a | 0), Math.min(words.length - 1, b | 0)])
      .filter(([a, b]) => b >= a);
  }
  const spans = wordSpans(seg?.text, words);
  const text = String(seg?.text ?? '');
  const out = [];
  let first = 0;
  for (let i = 0; i < spans.length; i++) {
    const w = text.slice(spans[i][0], spans[i][1]);
    const n = i - first + 1;
    const chars = spans[i][1] - spans[first][0];
    const nextChars = i + 1 < spans.length ? spans[i + 1][1] - spans[first][0] : 0;
    const sentence = /[.!?]["')”]?$/.test(w);
    const pause = /[,;:]$/.test(w) && n >= 6;
    if (sentence || pause || n >= maxWords || nextChars > maxChars || i === spans.length - 1) {
      out.push([first, i]);
      first = i + 1;
    } else if (chars > maxChars) {
      out.push([first, i]);
      first = i + 1;
    }
  }
  return out;
}

/** Which phrase holds word `wi` (the first one before any word is spoken). */
export function phraseAt(phrases, wi) {
  if (!phrases?.length) return -1;
  if (wi < 0) return 0;
  const k = phrases.findIndex(([a, b]) => wi >= a && wi <= b);
  return k === -1 ? phrases.length - 1 : k;
}

/** A word reduced to what speech and print share: lower case, letters and digits only. */
export function normWord(w) {
  return String(w ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The spoken words of a segment as strings (one per `words` entry). */
export function segmentWordTexts(seg) {
  const text = String(seg?.text ?? '');
  return wordSpans(text, seg?.words || []).map(([a, b]) => text.slice(a, b));
}

/**
 * Lines spoken words up with the words printed on the page, for an in-place
 * highlight on a text slide. The spoken text is derived from the markdown
 * (math read out, images dropped, [[say:]] overrides), so the two lists do
 * not match one to one: each spoken word looks a few printed words ahead for
 * its match and is -1 when it has none (a spoken "over" for a printed
 * fraction, say). Returns, per spoken word, the printed word's index or -1.
 * @param {string[]} spoken
 * @param {string[]} printed
 */
export function alignWords(spoken, printed, lookahead = 8) {
  const p = (printed || []).map(normWord);
  const out = [];
  let j = 0;
  for (const w of spoken || []) {
    const n = normWord(w);
    let hit = -1;
    if (n) {
      for (let k = j; k < Math.min(p.length, j + lookahead); k++) {
        if (p[k] === n) { hit = k; break; }
      }
    }
    out.push(hit);
    if (hit >= 0) j = hit + 1;
  }
  return out;
}

/** The printed word to light for spoken word `wi`: its own match, else the last matched before it. */
export function alignedIndexAt(map, wi) {
  for (let i = Math.min(wi, (map?.length || 0) - 1); i >= 0; i--) if (map[i] >= 0) return map[i];
  return -1;
}

/**
 * Whether a segment reads the slide's own printed words, so they can be lit
 * in place (a text slide). A teacher-script segment (sidecar `source:
 * "script"`) says something else and gets a caption instead: lighting the
 * prose would hit stray words. `source: "slide"` and the timed fallback read
 * the slide. An older sidecar with no `source`: true when most spoken words
 * line up with the printed ones (alignWords), at least `min` of them.
 * @param {object} seg
 * @param {string[]} printed the printed words of the current beat
 */
export function readsSlideText(seg, printed, min = 0.7) {
  if (!seg) return false;
  if (seg.source === 'script') return false;
  if (seg.source || seg.timed) return true;
  const spoken = (seg.words?.length ? segmentWordTexts(seg) : String(seg.text ?? '').split(/\s+/)).filter((w) => normWord(w));
  if (!spoken.length) return true;
  const hits = alignWords(spoken, printed).filter((i) => i >= 0).length;
  return hits / spoken.length >= min;
}

/** Plain words of a beat's text, for the timed fallback. */
export function countWords(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

/** How long a beat with no audio is read for, at `rate` (1 = normal). */
export function timedReadMs(text, rate = 1) {
  const words = countWords(text);
  const r = rate > 0 ? rate : 1;
  return Math.max(TIMED_MIN_MS, Math.round((words / TIMED_WORDS_PER_SEC) * 1000 / r));
}

/**
 * A stand-in segment for a beat with no audio: its words spread evenly over
 * the timed read, so captions still step word by word. Times are at rate 1
 * (media time), like a real segment's; the pacer scales its clock by rate.
 */
export function timedSegment(text, { block = null, step = null } = {}) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const words = [];
  const re = /\S+/g;
  let m;
  const n = countWords(t);
  const dur = timedReadMs(t, 1);
  const per = n ? dur / n : dur;
  let i = 0;
  while ((m = re.exec(t))) {
    words.push([Math.round(i * per), Math.round((i + 1) * per), m.index]);
    i++;
  }
  return { block, step, text: t, words, cues: [], durationMs: dur, timed: true };
}

/**
 * Cue ids due by media time `ms` that have not fired yet. `cue.t` is ms into
 * the segment's audio (beats.mjs / build-narration.py write it).
 */
export function dueCues(cues, ms, fired) {
  const out = [];
  for (const c of cues || []) {
    if (!c || !c.id || fired?.has?.(c.id)) continue;
    if (Number.isFinite(c.t) && c.t <= ms) out.push(c.id);
  }
  return out;
}

/**
 * Visual focus cues (spec W1 D29n, the focus contract). A cue id
 *   focus.<ids>  lights those parts and dims the rest (several ids joined by + or ,)
 *   show.<ids>   reveal on cue: the parts stay hidden from the beat's start until
 *                this cue, then appear lit (the newest arrival), the rest dimmed
 *   focus.none   clears the light and the dim (revealed parts stay)
 *   focus.all    the same, and reveals every part still held
 * `focus:` / `show:` work too. Returns null for any other cue id.
 */
export function parseFocusCue(id) {
  const m = /^(focus|show)[.:](.+)$/.exec(String(id || ''));
  if (!m) return null;
  const rest = m[2].trim();
  if (m[1] === 'focus' && (rest === 'none' || rest === 'all')) return { kind: rest, ids: [] };
  // focus.rest: nothing lit, every tagged part dimmed (the narration has moved
  // off the picture, e.g. to a note), the same state a beat starts in.
  if (m[1] === 'focus' && rest === 'rest') return { kind: 'focus', ids: ['narr-rest'] };
  const ids = rest.split(/[+,]/).map((x) => x.trim()).filter(Boolean);
  return ids.length ? { kind: m[1], ids } : null;
}

/**
 * The focus at beat time `ms`, folded from the beat's cue marks in time order,
 * so it is the same however the time was reached (play, scrub, replay, voice
 * switch). `on`: lit ids (empty = no focus, nothing dimmed); `held`: ids of
 * show cues not reached yet (hidden); `any`: the beat carries focus cues at all;
 * `rest`: it does, and none has fired yet (all tagged parts dimmed).
 * `cues` and `ms` must share one clock (the default voice's, as scenes get it).
 */
export function focusAt(cues, ms) {
  const list = (cues || []).filter((c) => c && Number.isFinite(c.t) && parseFocusCue(c.id))
    .slice().sort((a, b) => a.t - b.t);
  const held = new Set();
  for (const c of list) { const f = parseFocusCue(c.id); if (f.kind === 'show') f.ids.forEach((i) => held.add(i)); }
  let on = [];
  let fired = 0;
  const t = Number.isFinite(ms) ? ms : (ms === Infinity ? Infinity : 0);
  for (const c of list) {
    if (c.t > t) break;
    fired++;
    const f = parseFocusCue(c.id);
    if (f.kind === 'none') on = [];
    else if (f.kind === 'all') { on = []; held.clear(); }
    else { on = f.ids.slice(); if (f.kind === 'show') f.ids.forEach((i) => held.delete(i)); }
  }
  // rest: the beat carries focus cues but none has fired yet (Q-77): its
  // tagged parts wait, dimmed, so the last beat's picture never reads as
  // what is being spoken. A cue at the beat's first word ends it at once.
  return { on, held: [...held], any: list.length > 0, rest: list.length > 0 && fired === 0 };
}

/** "blocks/L01/blk-l01-s01.json" -> "blk-l01-s01": a block's id by convention. */
export function refBasename(ref) {
  const s = String(ref || '').split('?')[0].split('/').pop() || '';
  return s.replace(/\.json$/i, '');
}

/**
 * The lesson laid out as beats for the scrubber: one entry per segment, in
 * lesson order, plus one entry for a block with no segment at all (it still
 * takes part, as a timed read or a wait for an answer).
 * @param {Array<object>} lessonBlocks lessonData.blocks
 * @param {ReturnType<typeof indexSegments>} index
 * @param {Map<number,string>} [knownIds] block index -> real id, as blocks load
 * @returns {Array<{blockIndex:number, beatIndex:number, block:string, ms:number, seg:object|null}>}
 */
export function buildTimeline(lessonBlocks, index, knownIds = new Map()) {
  const out = [];
  (lessonBlocks || []).forEach((b, blockIndex) => {
    const id = knownIds.get(blockIndex) || b?.id || refBasename(b?.blockRef);
    const segs = (index?.byBlock.get(id) || []).slice()
      .sort((x, y) => (Number(x.beat) || 0) - (Number(y.beat) || 0));
    if (!segs.length) {
      out.push({ blockIndex, beatIndex: 0, block: id, ms: 4000, seg: null });
      return;
    }
    for (const seg of segs) {
      const beatIndex = seg.step === 'prompt' ? 0 : Math.max(0, (Number(seg.beat) || 1) - 1);
      out.push({ blockIndex, beatIndex, block: id, ms: Math.max(800, Number(seg.durationMs) || 0), seg });
    }
  });
  return out;
}

/** The timeline entry the cursor is on (the last one at or before it). */
export function timelineIndexOf(timeline, { blockIndex, beatIndex }) {
  let best = -1;
  for (let i = 0; i < (timeline?.length || 0); i++) {
    const e = timeline[i];
    if (e.blockIndex < blockIndex || (e.blockIndex === blockIndex && e.beatIndex <= beatIndex)) best = i;
    else break;
  }
  return best;
}

/**
 * Stale-audio diff: the lesson's current beats (tools/narration/beats.mjs
 * loadBeats().beats, each with its textHash) against the sidecar's segments.
 * Pure: hashing and file checks stay with the caller.
 * @returns {Array<{kind:'MISSING'|'STALE'|'ORPHAN', key:string, beat?:object, seg?:object}>}
 */
export function diffNarration(beats, segments) {
  const have = new Map((segments || []).map((s) => [`${s.block}#${s.step}`, s]));
  const out = [];
  for (const b of beats || []) {
    const key = `${b.block}#${b.step}`;
    const s = have.get(key);
    have.delete(key);
    if (!s) out.push({ kind: 'MISSING', key, beat: b });
    else if (s.textHash !== b.textHash) out.push({ kind: 'STALE', key, beat: b, seg: s });
  }
  for (const [key, seg] of have) out.push({ kind: 'ORPHAN', key, seg });
  return out;
}

/**
 * Light shape check of a `coauthor-narration@1` sidecar. Errors make the
 * sidecar unusable; warnings are worth fixing but the pacer copes.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkSidecarShape(sc) {
  const errors = [];
  const warnings = [];
  if (!sc || typeof sc !== 'object') return { errors: ['narration sidecar is not an object'], warnings };
  if (sc.format !== NARRATION_FORMAT) errors.push(`narration sidecar format must be "${NARRATION_FORMAT}"`);
  if (!Array.isArray(sc.segments)) { errors.push('narration sidecar needs a segments array'); return { errors, warnings }; }
  if (sc.voices != null && (!Array.isArray(sc.voices) || sc.voices.some((v) => !v || typeof v.id !== 'string' || !v.id))) {
    errors.push('narration sidecar voices must be [{ id, label, name, rate, pitch }]');
  }
  const ids = new Set(sidecarVoices(sc).map((v) => v.id));
  const seen = new Set();
  sc.segments.forEach((s, i) => {
    const at = `segments[${i}]`;
    if (!s || typeof s !== 'object') { errors.push(`${at} is not an object`); return; }
    if (!s.block || typeof s.block !== 'string') errors.push(`${at} needs a block id`);
    if (!s.step || typeof s.step !== 'string') errors.push(`${at} needs a step (STEP id, b<N> or prompt)`);
    const key = `${s.block}#${s.step}`;
    if (seen.has(key)) errors.push(`${at} repeats ${key}`);
    seen.add(key);
    if (s.audio != null && typeof s.audio !== 'string') errors.push(`${at}.audio must be a path`);
    if (!s.audio) warnings.push(`${at} (${key}) has no audio: it will be read on a timer`);
    if (typeof s.text !== 'string') errors.push(`${at}.text must be a string`);
    if (s.durationMs != null && !(Number(s.durationMs) > 0)) errors.push(`${at}.durationMs must be a positive number`);
    if (s.words != null) {
      if (!Array.isArray(s.words)) errors.push(`${at}.words must be an array`);
      else {
        const bad = s.words.findIndex((w, j) => !Array.isArray(w) || w.length < 3 || !w.every(Number.isFinite)
          || w[0] > w[1] || (j > 0 && w[0] < s.words[j - 1][0]) || w[2] < 0 || (typeof s.text === 'string' && w[2] > s.text.length));
        if (bad !== -1) errors.push(`${at}.words[${bad}] must be [startMs, endMs, charOffset], in order, inside text`);
      }
    }
    if (s.cues != null && (!Array.isArray(s.cues) || s.cues.some((c) => !c || typeof c.id !== 'string'))) {
      errors.push(`${at}.cues must be [{ id, char, t }]`);
    }
    if (s.await != null && s.await !== 'answer' && s.await !== 'interact') errors.push(`${at}.await must be "answer" or "interact"`);
    if (s.free != null && typeof s.free !== 'boolean') errors.push(`${at}.free must be true or false`);
    if (s.closed != null && typeof s.closed !== 'boolean') errors.push(`${at}.closed must be true or false`);
    if (s.hint != null && typeof s.hint !== 'string') errors.push(`${at}.hint must be a string (the "Your turn" line)`);
    if (s.lines != null && !Array.isArray(s.lines)) errors.push(`${at}.lines must be word ranges [[first, last], ...]`);
    if (s.voices != null) {
      if (typeof s.voices !== 'object' || Array.isArray(s.voices)) errors.push(`${at}.voices must be { <voice id>: { audio, durationMs, words, cues } }`);
      else for (const [id, v] of Object.entries(s.voices)) {
        if (!v || typeof v !== 'object') { errors.push(`${at}.voices.${id} is not an object`); continue; }
        if (!ids.has(id)) warnings.push(`${at}.voices.${id} is not in the sidecar's voices list: never played`);
        if (v.words != null && (!Array.isArray(v.words) || v.words.some((w, j) => !Array.isArray(w) || w.length < 3 || !w.every(Number.isFinite) || (j > 0 && w[0] < v.words[j - 1][0])))) {
          errors.push(`${at}.voices.${id}.words must be [startMs, endMs, charOffset], in order`);
        }
        if (v.audio != null && typeof v.audio !== 'string') errors.push(`${at}.voices.${id}.audio must be a path`);
      }
    }
    if (s.textHash != null && !/^[0-9a-f]{64}$/.test(String(s.textHash))) warnings.push(`${at}.textHash is not a sha256 hex digest`);
  });
  return { errors, warnings };
}
