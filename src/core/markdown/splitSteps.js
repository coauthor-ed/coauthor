/**
 * Split a lesson block's markdown into the ordered beats it is revealed in.
 *
 * A slide arrives one chunk at a time rather than all at once, so that a
 * student clicking Next is taking part in the argument instead of being handed
 * its conclusion (docs/sprints/wip/progressive-disclosure-lesson-slides.md).
 * 84% of shipped blocks carry no image and never will, so this — staged text —
 * is the default treatment, not a fallback.
 *
 * Two modes, never mixed:
 *
 *   - **derived** (the default, and what ~200 blocks use): no step data is
 *     stored anywhere. The split is computed from the markdown's own structure
 *     every time. Nothing to drift, nothing to migrate, nothing to author.
 *   - **authored**: the markdown itself carries `<!-- STEP id="…" -->`
 *     sentinels and they are authoritative. One sentinel anywhere in a body
 *     switches the whole body over — never a mix of authored and derived
 *     boundaries, because "the parts you didn't mark get guessed at" is
 *     impossible to reason about while authoring.
 *
 * The sentinel is an HTML comment for three reasons: it moves with the text
 * when paragraphs are reordered, it is visible in the plain textarea editor,
 * and `marked` renders it to nothing — so an older runtime that knows nothing
 * about steps degrades to today's all-at-once rendering rather than printing
 * the marker. The repo already carries production metadata this way; `<!-- KEY:
 * a -->` is specified in P4 hard constraint 5 and stripped by `KEY_HINT_RE`.
 *
 * `---` is deliberately *not* the separator: it is an export artefact in this
 * corpus, not authorial signal.
 *
 * **Pure, no DOM, and no `lit` import** — that constraint is load-bearing.
 * `test/unit/run.js` auto-discovers every `test/unit/*.test.js` and runs it
 * under plain node, and `blockImageLayout.js` (the other place this logic could
 * plausibly have lived) imports `/vendor/lit.js`.
 */
import { marked } from '../../../vendor/marked.esm.js';
import { maskMath, restoreMath } from './mathMask.js';
import { isSayComment } from '../cast/castData.js';

/** `<!-- STEP id="embryo" -->`, a bare `<!-- STEP -->`, or, with two more
 *  optional attributes (in this fixed order — id, then callout, then line):
 *  `<!-- STEP id="…" callout="result" line="…" -->`. `callout` marks the
 *  step that follows as a named, generically-styled box (only "result" has
 *  a defined treatment today — content-block.js's `.rv-callout-result`,
 *  formalizing the ad hoc red-left-border boxes several math proofs already
 *  used by hand) rather than an ordinary beat; `line` is the optional short
 *  line a `<quill-mascot>` speaks when that step becomes current (see
 *  ProgressiveDisclosureMixin.js's `_renderSteps()`). Both are meaningless
 *  outside authored mode, same as `id`. */
const STEP_SENTINEL = /<!--\s*STEP(?:\s+id\s*=\s*"([^"]*)")?(?:\s+callout\s*=\s*"([^"]*)")?(?:\s+line\s*=\s*"([^"]*)")?\s*-->/gi;

/**
 * A media brief — a production instruction addressed to whoever draws the
 * image, never a sentence a student reads. `applyAssets()` now strips these at
 * conversion and `tools/prose-breaks.js` has cleaned the 13 that shipped, so
 * this is belt and braces: without it a leaked brief would be promoted from an
 * embarrassment buried mid-slide to *its own dedicated beat a student clicks
 * Next to reveal*, which is materially worse than the bug it came from.
 */
const BRIEF_RE = /\[(DIAGRAM|ANIMATION|SIMULATION)\s*:[^\]]*\]/gi;

const HR_ONLY = /^[-_*]{3,}$/;

/** One or more heading lines and nothing else — a chunk with no body under it. */
const HEADING_ONLY = /^(?:#{1,6}[ \t].*(?:\n+#{1,6}[ \t].*)*)$/;

/**
 * A note to authors and agents: an HTML comment on its own line that is not
 * one of the engine's markers (STEP, CUE, KEY). marked renders it to nothing,
 * so it must not cost the student a click either - it is never a beat and
 * never stops the leading title from being pinned.
 */
function isAuthorNote(tok) {
  if (tok.type !== 'html') return false;
  const raw = tok.raw.trim();
  return /^<!--[\s\S]*-->$/.test(raw) && !/^<!--\s*(STEP\b|CUE:|KEY:)/i.test(raw);
}

/** Strip any leaked brief; returns '' if the chunk was nothing but briefs. */
function scrubBriefs(md) {
  BRIEF_RE.lastIndex = 0;
  if (!BRIEF_RE.test(md)) return md;
  BRIEF_RE.lastIndex = 0;
  return md.replace(BRIEF_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Pull a leading level-1 heading off the front. It is the slide's title: it
 * stays pinned above the beats rather than being spent as one, because a first
 * click that reveals only "## A Missing Piece" is a click that bought nothing.
 */
function takeHeader(md) {
  const tokens = marked.lexer(md);
  const first = tokens.find(t => t.type !== 'space' && !isAuthorNote(t));
  if (!first || first.type !== 'heading' || first.depth !== 1) return { header: null, body: md };
  const at = md.indexOf(first.raw);
  if (at === -1) return { header: null, body: md };
  return { header: first.raw.trim(), body: md.slice(at + first.raw.length) };
}

/**
 * Group `marked`'s tokens into beats.
 *
 * Grouping tokens beats any hand-rolled regex here, and adds no dependency —
 * marked is already vendored, already in the import map and already precached
 * in `sw.js`. Tokens carry their exact `.raw` source, and lists, tables, fenced
 * code and blockquotes arrive already atomic, which is what makes rule 5 below
 * free rather than something to implement:
 *
 *   1. a heading is never a beat of its own — it opens the one that follows it
 *      (48% of shipped blocks have a second heading, so this is the difference
 *      between staging and a slideshow of section titles);
 *   2. a paragraph ending in `:` immediately followed by a list is one beat —
 *      the colon is a promise the list keeps;
 *   3. a lone `---` merges forward the same way, and is dropped outright if
 *      nothing follows it;
 *   4. a loose list is never re-split on its internal blank lines — that would
 *      emit N separate `<ul>`s each restarting at 1. marked hands the whole
 *      list over as one token, so this holds by construction.
 */
function deriveChunks(body) {
  // A `<!-- SAY id -->` speaker marker (story cast) is kept, unlike an author
  // note, but it is never a beat and never shifts one: it rides at the front
  // of the chunk that follows it, exactly like a heading (rule 1).
  const isSay = t => t.type === 'html' && isSayComment(t.raw);
  const tokens = marked.lexer(body).filter(t => t.type !== 'space' && t.raw.trim() && (isSay(t) || !isAuthorNote(t)));
  const chunks = [];
  let carry = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const raw = tok.raw.trim();

    if (tok.type === 'heading' || tok.type === 'hr' || isSay(tok)) { carry.push(raw); continue; }

    // A colon-terminated lead-in only merges when a list actually follows it;
    // followed by a paragraph it is an ordinary sentence and its own beat.
    const next = tokens.slice(i + 1).find(t => !isSay(t));
    if (tok.type === 'paragraph' && /:\s*$/.test(raw) && next?.type === 'list') {
      carry.push(raw);
      continue;
    }

    chunks.push([...carry, raw].join('\n\n'));
    carry = [];
  }

  // Anything still held at the end had nothing to merge into. A trailing rule
  // is furniture and goes, and so is a speaker marker with nothing to say; a
  // trailing heading is real content and stays.
  if (carry.length) {
    const kept = carry.filter(c => !HR_ONLY.test(c) && !isSayComment(c));
    if (kept.length) chunks.push(kept.join('\n\n'));
  }

  return chunks;
}

/**
 * Split on the authored sentinels. Text before the first one is step 1.
 *
 * A `##` sub-header is only ever pulled off the body by `takeHeader()` when
 * it's depth 1 (the slide's pinned title); anything lower stays in the body
 * and is meant to open the beat it introduces — same as `deriveChunks`' rule
 * 1. But this function has no token-level heading awareness (deliberately —
 * see file header), so an author who types the `##` before its sentinel
 * instead of after (a real, repeated slip — docs/simulation-authoring.md §4)
 * would otherwise ship a beat that's nothing but that heading. Fixed as a
 * post-pass: a chunk that is a heading and nothing else merges into the beat
 * that follows it, rather than becoming its own.
 */
function sentinelChunks(body) {
  const out = [];
  let last = 0;
  let id = null, callout = null, line = null;
  STEP_SENTINEL.lastIndex = 0;
  let m;
  while ((m = STEP_SENTINEL.exec(body)) !== null) {
    out.push({ id, callout, line, md: body.slice(last, m.index) });
    id = m[1] || null;
    callout = m[2] || null;
    line = m[3] || null;
    last = m.index + m[0].length;
  }
  out.push({ id, callout, line, md: body.slice(last) });

  if (out.length > 1 && HEADING_ONLY.test(out[0].md.trim())) {
    out[1].md = `${out[0].md.trim()}\n\n${out[1].md.replace(/^\s+/, '')}`;
    out.shift();
  }
  return out;
}

/**
 * @param {string} markdown A block's `markdown.en`.
 * @returns {{header: string|null, steps: Array<{id: string|null, callout: string|null, line: string|null, md: string}>, authored: boolean}}
 *   `header` is the pinned title, rendered once and never revealed. `steps` is
 *   never empty for non-empty input — a body with nothing splittable comes back
 *   as a single step, which renders exactly as it does today. `id` is non-null
 *   only for authored steps, and is what `reveal.focus` is keyed by; a derived
 *   split has no stable identity to offer and deliberately does not pretend to.
 *   `callout`/`line` are likewise authored-only — see `STEP_SENTINEL`'s doc
 *   comment above.
 */
export function splitSteps(markdown) {
  const src = String(markdown ?? '');
  if (!src.trim()) return { header: null, steps: [], authored: false };

  // Mask first. Lexing raw markdown would let a multi-line `$$…$$` lex as
  // several paragraphs and be split mid-expression. The shipped corpus has no
  // `$` at all today, but physics content will.
  const { text: masked, blocks: math } = maskMath(src);
  const { header, body } = takeHeader(masked);

  STEP_SENTINEL.lastIndex = 0;
  const authored = STEP_SENTINEL.test(body);
  const raw = authored
    ? sentinelChunks(body)
    : deriveChunks(body).map(md => ({ id: null, callout: null, line: null, md }));

  const steps = [];
  // SAY markers at the very end of a chunk (typed just above a STEP
  // sentinel) belong to the next chunk's first paragraph: they move there,
  // and a chunk that was nothing but markers is not a beat.
  let say = '';
  for (const chunk of raw) {
    let md = scrubBriefs(restoreMath(chunk.md, math).trim());
    if (say) md = `${say}${md}`.trim();
    say = '';
    const lines = md.split('\n');
    let cut = lines.length;
    while (cut > 0 && (!lines[cut - 1].trim() || isSayComment(lines[cut - 1]))) cut--;
    if (cut < lines.length && lines.slice(cut).some(l => l.trim())) {
      say = `${lines.slice(cut).filter(l => l.trim()).join('\n')}\n`;
      md = lines.slice(0, cut).join('\n').trim();
    }
    if (!md || HR_ONLY.test(md)) continue;
    steps.push({ id: chunk.id, callout: chunk.callout, line: chunk.line, md });
  }

  const pinned = header ? restoreMath(header, math) : null;

  // A body whose every chunk was dropped still has to render something, or the
  // block would be a blank slide with a Next button.
  if (!steps.length && pinned) {
    return { header: null, steps: [{ id: null, callout: null, line: null, md: pinned }], authored };
  }

  return { header: pinned, steps, authored };
}

/**
 * How many beats a body is worth, without building them. Used by the authoring
 * summary line and the linter's advisory, which both want the count and not
 * the text.
 */
export function countSteps(markdown) {
  return splitSteps(markdown).steps.length;
}

/**
 * Write the *derived* split back into the markdown as explicit sentinels, so
 * every beat has a name.
 *
 * Needed because `reveal.focus` is keyed by step id and a derived split has no
 * ids — so the moment an author wants to point at one beat, the block has to
 * become authored. And because authored mode is all-or-nothing, inserting a
 * single sentinel would otherwise *change the split it was drawn against*:
 * one sentinel in the middle of a four-chunk body yields two steps, not four,
 * silently re-pairing the rects with the wrong text.
 *
 * Writing all the boundaries at once means the authored split reproduces the
 * derived one exactly, and the author edits from there. Returns the markdown
 * unchanged if it is already authored.
 *
 * Changes no word a student reads: an HTML comment renders to nothing.
 */
export function materializeSteps(markdown) {
  const src = String(markdown ?? '');
  const { header, steps, authored } = splitSteps(src);
  if (authored || !steps.length) return src;

  const used = new Set();
  const name = (md, i) => {
    // Readable beats random here: the sentinel is meant to be legible in the
    // plain textarea editor, which is where most authors will meet it.
    const slug = md.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/)
      .slice(0, 3).join('-').toLowerCase().slice(0, 24);
    let id = slug || `step-${i + 1}`;
    let n = 2;
    while (used.has(id)) id = `${slug || 'step'}-${n++}`;
    used.add(id);
    return id;
  };

  const body = steps.map((s, i) => `<!-- STEP id="${name(s.md, i)}" -->\n${s.md}`).join('\n\n');
  return header ? `${header}\n\n${body}` : body;
}
