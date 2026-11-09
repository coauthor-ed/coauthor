/**
 * semanticSimilarityEvaluator.js — pure scoring logic for semantic-descriptive@1.
 *
 * Ported near-verbatim from coaching-poc-v5.html. No DOM, no UI, no model
 * loading — every function that needs an embedding takes an `embed(text)`
 * function as a parameter so this module stays testable without the ~23MB
 * on-device model and reusable by both the runtime plugin and the authoring
 * app's scoring-preview sandbox (see fuzzy-descriptive/v1/scoring.js for the
 * same split).
 *
 * The plugin (index.js) is responsible for loading the vendored transformers.js
 * pipeline and wrapping it in an `embed` function; this module never imports
 * anything from /vendor/.
 */

export function cosineSim(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * Folds Unicode sub/superscript digits (v₁, v₂, x², x³...) down to plain
 * ASCII (v1, v2, x^2, x^3) before anything is matched or embedded. The BERT
 * WordPiece vocab tokenizes "₁" as its own token distinct from "1" (in-vocab,
 * but not the same embedding), and it always defeats fastAcceptedMatch's
 * exact/substring tier since accepted[] is authored in plain ASCII — measured
 * against the real vendored model, that alone dropped one rubric point of
 * q-bank-020 from a 1.0 exact match to a 0.49 embedding fallback (below the
 * "addressed" threshold) for an answer that was otherwise identical.
 * Superscript digits fold to `^` + digit, not the bare digit — "x²" and
 * "x^2" are the same expression, "x2" is not.
 *
 * Also folds the handful of LaTeX macros a student's typed `$...$` math is
 * overwhelmingly likely to use (via the equation composer, or hand-typed)
 * down to the matching Unicode symbol a rubric author's plain-prose
 * `accepted[]`/`level2Template` text overwhelmingly uses instead — same
 * asymmetry, same fix, as the sub/superscript case above: confirmed
 * empirically (see docs cross-referenced from a real grading complaint) that
 * "r\sqrt{2}" and "r√2" are the identical answer but share zero literal
 * substring before this fold, and differ enough as raw token sequences that
 * even the embedding-similarity fallback isn't reliably above threshold.
 * `\sqrt{X}` and the unbraced `\sqrt X` (a single following token — a brace
 * group is required for anything longer) both fold to `√X`; this file is
 * applied to accepted text too, but a real rubric author's plain-prose
 * phrase essentially never itself contains a `\sqrt{...}` command, so this
 * is a no-op there in practice, purely additive for student `$...$` spans.
 */
export function normalizeMathNotation(text) {
  if (!text) return text;
  return text
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((c) => SUPERSCRIPT_DIGITS.indexOf(c)).join('')}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String(SUBSCRIPT_DIGITS.indexOf(c)))
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1')
    .replace(/\\sqrt\s+([a-zA-Z0-9]+)/g, '√$1')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '×')
    .replace(/\\pm/g, '±');
}

/**
 * Splits on line breaks first, then on `.!?` within each line — a
 * derivation/proof answer is typically one step per line with no terminal
 * punctuation at all (or uses "=>" instead of a full stop), which the old
 * punctuation-only split treated as a single sentence spanning the entire
 * answer, collapsing every rubric window into one giant blob and
 * systematically depressing similarity against short accepted phrases.
 */
export function splitIntoSentences(text) {
  const lines = text.split(/\n+/);
  const sentences = [];
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    const parts = trimmedLine.match(/[^.!?]+[.!?]*/g) || [trimmedLine];
    for (const part of parts) {
      const s = part.trim();
      if (s) sentences.push(s);
    }
  }
  return sentences.length ? sentences : [text.trim()].filter(Boolean);
}

/** Contiguous 1..maxLen sentence windows, e.g. [0], [1], [0,1], [1,2], [0,1,2]... */
export function buildWindows(sentences, maxLen = 3) {
  const out = [];
  const cap = Math.min(maxLen, sentences.length);
  for (let len = 1; len <= cap; len++) {
    for (let i = 0; i + len <= sentences.length; i++) {
      out.push({ text: sentences.slice(i, i + len).join(' '), start: i, len });
    }
  }
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A one-word accepted term's plain singular/plural flip ("pipes" <-> "pipe"),
 * or null if `word` is multi-word or too short for the heuristic to be safe.
 * Deliberately narrow (a trailing-s add/drop only) — this is a substring-match
 * patch, not a stemmer.
 */
function pluralVariant(word) {
  if (word.includes(' ') || word.length <= 3) return null;
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return `${word}s`;
}

/**
 * Mark schemes are enumerated-term lists, not open paraphrase tolerance —
 * try a literal exact/substring match before ever calling the embedding model.
 *
 * Also tolerates the one lexical variant a content author most often forgets
 * to enumerate: a bare singular/plural flip of a one-word accepted term (a
 * rubric listing "pipes" should still fast-match an answer that says "pipe").
 * Checked at a word boundary so it can't false-positive inside an unrelated
 * word (e.g. the "s"-stripped form of "loss" matching inside "close").
 *
 * Also tolerant of insignificant whitespace differences around operators in
 * a math expression — an author typing an accepted string as
 * "x^2 + y^2 - xy" and a student typing "x^2+y^2-xy" (or any other spacing)
 * mean the identical expression, but the checks above are exact-substring on
 * the literal characters, so spacing alone would otherwise push a verbatim-
 * correct answer past this fast path and into the much less reliable
 * embedding tier. `$` delimiters are stripped the same way, for the same
 * reason — they're LaTeX typesetting punctuation, not math content, and a
 * multi-line derivation typically re-opens `$...$` on every line, so an
 * accepted phrase spanning what the student wrote as several separate spans
 * (e.g. the same cross-term-free expression repeated across consecutive
 * lines, each its own `$...$`) would otherwise have its contiguity broken by
 * `$$` sitting between two lines that are otherwise a verbatim match.
 * Compared as an ADDITIONAL disjunct (never replacing the exact-character
 * checks above), so it can only make more things match, and it never touches
 * the plural-variant regex below, which still runs against the original
 * (non-compacted) `v` — collapsing whitespace/`$` there would corrupt its
 * `\b` word-boundary semantics.
 */
export function fastAcceptedMatch(val, accepted) {
  const v = normalizeMathNotation(val.trim().toLowerCase());
  if (!v) return false;
  const vCompact = v.replace(/[\s$]+/g, '');
  return accepted.some((a) => {
    const acc = normalizeMathNotation(a.toLowerCase());
    if (v === acc || v.includes(acc) || (v.length >= 4 && acc.includes(v))) return true;
    const accCompact = acc.replace(/[\s$]+/g, '');
    if (accCompact.length >= 3 && (vCompact.includes(accCompact) || (vCompact.length >= 4 && accCompact.includes(vCompact)))) return true;
    const variant = pluralVariant(acc);
    return variant ? new RegExp(`\\b${escapeRegExp(variant)}\\b`).test(v) : false;
  });
}

export function classify(score, thresholds) {
  if (score >= thresholds.high) return 'addressed';
  if (score >= thresholds.low) return 'partial';
  return 'missing';
}

const MATH_SYMBOL_CHARS = `${SUBSCRIPT_DIGITS}${SUPERSCRIPT_DIGITS}√±×÷∑∫Δθπλμ`;
const MATH_SIGNAL_RE = new RegExp(
  [
    `[${MATH_SYMBOL_CHARS}]`,        // unicode math symbol or sub/superscript digit
    `\\$[^$\\n]+\\$`,                // a $...$ LaTeX span
    `[a-zA-Z]\\d`,                   // plain-ASCII variable subscript, e.g. v1, x2
    `\\^\\s*\\d`,                    // caret exponent, e.g. x^2
    '>=|<=',                        // ASCII comparison operators
    `\\d\\s*[+\\-*/^]\\s*\\d`,       // digit operator digit
    `[a-zA-Z]\\s*=\\s*[\\d(]`,       // letter = digit/paren
  ].join('|')
);

/**
 * Fallback default for a question's `answerMode` ('math' | 'text') when the
 * author/AI-drafting prompt omits it — sniffs the rubric's own authored text
 * (accepted terms, level1/clue/level2Template) for math signals. Deliberately
 * per-question, not per-subject: a physics/maths chapter has plenty of pure
 * prose "explain why" questions, and English/social-studies occasionally has
 * a ratio or date arithmetic, so a subject code alone would misclassify both
 * directions. An explicit `answerMode` on the item always wins over this —
 * it exists only to give un-annotated/legacy content a reasonable default.
 */
export function detectAnswerMode(rubric) {
  const text = (rubric || [])
    .flatMap((r) => [r.level1, r.clue, r.level2Template, ...(r.accepted || [])])
    .filter(Boolean)
    .join(' \n ');
  return MATH_SIGNAL_RE.test(text) ? 'math' : 'text';
}

/**
 * Pulls out `$...$`-delimited LaTeX spans from a free-text answer — the
 * convention the equation-composer UI writes when a student inserts a
 * composed expression, but also usable for hand-typed LaTeX. Used by
 * scoreFullAnswer's math-equivalence tier (see `checkMathEquivalence` there);
 * this module stays vendor-free, so the actual equivalence check (ComputeEngine)
 * is injected by the caller, same pattern as `embed`.
 */
export function extractMathSpans(text) {
  if (!text) return [];
  const spans = [];
  const re = /\$([^$\n]+)\$/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[1].trim();
    if (s) spans.push(s);
  }
  return spans;
}

/**
 * ComputeEngine's LaTeX parser treats a bare subscript (`v_1`, `v_{1}`) as
 * *indexing* into a sequence named `v`, not as a single symbol named "v1" —
 * confirmed empirically: it produces an 'incompatible-type'/'unexpected-
 * token' error node instead of a usable expression, so `v_1` and `v_2` never
 * come out as independent comparable symbols. This matters a lot here
 * specifically, since subscripted single-letter variables (v_1, v_2, x_1...)
 * are exactly how physics/maths answers write things. Rewriting
 * `letter_digits` to `\mathrm{letterdigits}` before parsing makes
 * ComputeEngine treat it as one atomic identifier instead, which is what a
 * subscripted variable actually means. Used by the plugin's injected
 * checkMathEquivalence before ce.parse() on both the student span and
 * `expectedMath` — this module still never imports ComputeEngine itself.
 *
 * Two passes, not one `\{?...\}?` regex: a single optional-brace pattern
 * greedily consumes any `}` immediately following the digit run, including
 * one that isn't the subscript's own closing brace at all — e.g. `x_1` as
 * the last token inside `\sqrt{x_1x_2}` matched `1}` as if `{1}` had been
 * braced, eating `\sqrt{...}`'s own closing delimiter and leaving it
 * unbalanced (confirmed empirically: `\sqrt{x_1x_2}` came out as
 * `\sqrt{\mathrm{x1}\mathrm{x2}` — one brace short — and ComputeEngine then
 * fails to parse it at all). Handling the braced (`x_{1}`) and bare (`x_1`)
 * forms as two separate passes means neither can ever consume a brace that
 * wasn't actually part of its own match.
 */
export function normalizeLatexSubscripts(latex) {
  if (!latex) return latex;
  return latex
    .replace(/([a-zA-Z])_\{([0-9]+)\}/g, '\\mathrm{$1$2}')
    .replace(/([a-zA-Z])_([0-9]+)/g, '\\mathrm{$1$2}');
}

/**
 * Walks an ordered list of `$...$` spans (as returned by `extractMathSpans`,
 * already in left-to-right textual order) and, via the caller's
 * `checkStepConsistency(prevLatex, currLatex) => 'consistent'|'broken'|'unverifiable'`,
 * builds a prefix-consistency array: `chainOk[k]` is true only when every
 * link from span 0 up to and including span `k` was 'consistent'. A single
 * broken or unverifiable link anywhere earlier in the chain means no later
 * span can be trusted as an unbroken continuation of the derivation, so once
 * a link fails, every subsequent `chainOk` entry is false too (and later
 * links are reported as 'broken' by inheritance rather than re-probed —
 * there is nothing more precise to learn about them once the prefix is
 * already untrusted).
 *
 * Used by `scoreFullAnswer`'s symbolic tier (a rubric point only earns its
 * automatic full-credit match off a span whose `chainOk` is true) and,
 * separately, by the plugin after scoring to surface `warnings` to the
 * student/reviewer — see docs/descriptive-questions-and-cbse-marks.md for
 * exactly what `checkStepConsistency` can and can't recognize (it is a
 * heuristic over the common algebraic-move vocabulary, not a proof checker).
 * `warnings` only records the *first* break in the chain (the root cause),
 * not every downstream span that inherits it.
 *
 * `classifySpan(latex) => 'step' | 'term'`, if given, pre-filters which
 * spans even enter the sequential chain: only 'step'-classified spans (a
 * relation, or a malformed span that was clearly attempting to be one — see
 * mathConsistency.js's `classifySpan` for the exact rule) are compared
 * against their neighbors. A 'term' span (e.g. a bare quantity named inline,
 * "adding $4x_1x_2$ to both sides") is skipped entirely — not compared, not
 * flagged — since it was never a proof step to begin with; treating it as
 * one was a real false positive (a fully correct derivation flagged as
 * broken purely because an intermediate quantity was named inline before
 * being used). `chainOk` stays indexed by original span position either
 * way; a skipped 'term' span's own entry is irrelevant (always left `true`)
 * since `expectedMath` targets are always relations and never match a term.
 * Omitting `classifySpan` treats every span as a step (prior behavior).
 */
export function computeChainConsistency(mathSpans, checkStepConsistency, classifySpan) {
  const chainOk = mathSpans.map(() => true);
  const warnings = [];
  if (!checkStepConsistency) return { chainOk, warnings };

  const stepIndices = classifySpan
    ? mathSpans.reduce((acc, s, i) => { if (classifySpan(s) === 'step') acc.push(i); return acc; }, [])
    : mathSpans.map((_, i) => i);

  let prevOk = true;
  for (let j = 1; j < stepIndices.length; j++) {
    const prevIdx = stepIndices[j - 1];
    const currIdx = stepIndices[j];
    const status = prevOk ? checkStepConsistency(mathSpans[prevIdx], mathSpans[currIdx]) : 'broken';
    if (prevOk && status !== 'consistent') {
      warnings.push({ afterSpanIndex: prevIdx, spanIndex: currIdx, status });
    }
    prevOk = prevOk && status === 'consistent';
    chainOk[currIdx] = prevOk;
  }
  return { chainOk, warnings };
}

/**
 * Wraps a raw embed function (e.g. the transformers.js feature-extraction
 * pipeline) with the POC's lowercase/trim memoization. Each caller gets its
 * own cache instance — no shared module-level mutable state.
 */
export function createEmbedder(rawEmbedFn) {
  const cache = new Map();
  return async function embed(text) {
    const normalized = normalizeMathNotation(text);
    const key = normalized.trim().toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const vec = await rawEmbedFn(normalized);
    cache.set(key, vec);
    return vec;
  };
}

/**
 * Standalone numbers in `text`, as a Set (so "45" and "45.0" collapse to the
 * same value 45, and repeats don't matter — only membership does). A digit
 * run immediately preceded by a letter with no separating space (`x1`, `v2`)
 * is skipped — that's a subscripted variable *name*, not a quantity, and
 * counting it would make numbersConsistent() below demand a specific
 * subscript digit appear verbatim in a paraphrase that uses different
 * variable names. `$...$` spans are stripped first for the same reason in
 * the other direction — a LaTeX equation's own digits are the symbolic
 * tier's job (`expectedMath`/checkMathEquivalence), not this plain-prose
 * numeric check, so they're excluded here rather than double-counted. This
 * stripping is only correct for the *accepted phrase* side though (rubric
 * authors write plain prose, essentially never wrapping a phrase in `$...$`
 * themselves) — see `numbersConsistent()`'s `stripMathSpans: false` call for
 * the window/student side, where stripping would do the opposite of what's
 * intended: a student who (correctly, per this app's own math-tools/
 * equation-composer UI) writes their entire final answer inside `$...$` has
 * every one of their digits erased here, so `numbersConsistent()` sees zero
 * numbers in an otherwise fully correct answer and reports a false
 * mismatch — this is not a hypothetical, it was confirmed to be the direct
 * cause of a legitimate "AB = r\sqrt{2}" answer losing its rubric point
 * (the digit 2 only ever appeared inside a `$...$` span).
 */
function extractNumbers(text, { stripMathSpans = true } = {}) {
  const stripped = stripMathSpans
    ? (text || '').replace(/\$[^$\n]+\$/g, ' ')
    : (text || '').replace(/\$/g, ' '); // drop just the delimiters — keep any digits they wrapped
  const matches = stripped.match(/(?<![a-zA-Z])\d+(?:\.\d+)?/g) || [];
  return new Set(matches.map(Number));
}

/**
 * Is every number `phraseNumbers` asserts also present somewhere in
 * `windowText`? Used to gate the embedding-similarity tier below: two
 * sentences that are structurally near-identical but conclude with a
 * different number ("...= 180 - 135 = 45" vs "...= 180 - 135 = 35") get a
 * high cosine-similarity score from a general-purpose sentence embedding —
 * confirmed empirically at ~0.83, comfortably in the "addressed" tier under
 * default thresholds — because the embedding is dominated by the shared
 * sentence structure, not the one digit that actually makes the answer
 * right or wrong. A student's own single arithmetic slip (45 vs 35) can
 * otherwise sail through as "correct" at exactly the rubric checkpoint
 * where the slip happened, then get blamed only on a later checkpoint that
 * merely inherits it — which is the numeric-prose counterpart of the
 * chain-consistency bug computeChainConsistency() fixes for `$...$` math
 * spans (see its doc comment); this is that same fix for plain-prose
 * numeric conclusions, which never go through ComputeEngine at all. Only
 * engages when the accepted phrase itself names a number — a purely
 * qualitative rubric point ("explains that X happens because...") is
 * unaffected.
 */
function numbersConsistent(phraseNumbers, windowText) {
  if (!phraseNumbers.size) return true;
  const windowNumbers = extractNumbers(windowText, { stripMathSpans: false });
  for (const n of phraseNumbers) {
    if (!windowNumbers.has(n)) return false;
  }
  return true;
}

// A numeric-mismatched pairing's cosine similarity is multiplied by this
// factor (not clamped to a flat constant — see the multiplication site's own
// comment for why) so it can still win `best`/`bestWin` for feedback
// purposes, but its ceiling (raw similarity 1.0 -> 0.3) stays well below
// DEFAULT_THRESHOLDS.low (0.40) or a typical custom `low`. Deliberately a
// blunt fixed factor, not a precise re-score: the point is "this cannot be
// classified as fully addressed no matter how similar the wording," not
// "compute exactly how partial it is."
const NUMERIC_MISMATCH_SCORE_CAP = 0.3;

export async function maxSimAgainstList(embed, text, phrases) {
  const v = await embed(text);
  let best = -1;
  for (const p of phrases) {
    const s = cosineSim(v, await embed(p));
    if (s > best) best = s;
  }
  return best;
}

/** Tier-2/tier-3 single-blank check: exact/substring match first, embedding fallback. */
export async function scoreBlank(embed, val, accepted) {
  if (fastAcceptedMatch(val, accepted)) return { sim: 1, exact: true };
  const sim = await maxSimAgainstList(embed, val, accepted);
  return { sim, exact: false };
}

/**
 * Full-answer windowed scoring (step 1). For every rubric point, scores every
 * contiguous 1-3 sentence window of the answer against every accepted phrase
 * and keeps the max. The *display* text may differ from the *scored* text: if
 * the winning window is a single sentence, the preceding sentence is
 * prepended for on-screen context — the score itself is always based on the
 * raw best-scoring window.
 *
 * `options.checkMathEquivalence(studentLatex, expectedLatex) => boolean`, if
 * given, adds a symbolic tier ahead of both the literal and embedding tiers:
 * for a rubric point that authors `expectedMath` (a LaTeX target), any
 * `$...$` span in the answer that's algebraically equivalent to it is an
 * unambiguous full match — this is what lets a correctly-rearranged
 * derivation step ("(v1+v2)^2 > 4*v1*v2" vs. the model's own arrangement)
 * score correctly even though it shares no exact wording with `accepted`.
 * Not supplying it (the default) leaves scoring exactly as before.
 *
 * `options.checkStepConsistency(prevLatex, currLatex) => 'consistent'|'broken'|'unverifiable'`,
 * if given alongside `checkMathEquivalence`, gates that symbolic tier: a span
 * only earns its rubric point automatic full credit if `computeChainConsistency`
 * finds the *entire prefix* of the derivation up to that span unbroken. This
 * exists because the symbolic tier alone only ever asks "does the target
 * equation appear somewhere in the answer," which a genuinely broken
 * derivation can still satisfy — e.g. every individual line of a proof by
 * inequality chaining can be independently true even when a step doesn't
 * actually follow from the one before it (a dropped term that happens to
 * still leave a true statement). When a checkpoint's would-be symbolic match
 * sits behind a broken link, it is NOT scored zero here — it simply isn't
 * short-circuited, and falls through to the literal/embedding tiers below
 * exactly as if `expectedMath` had never matched at all.
 *
 * `options.classifySpan(latex) => 'step' | 'term'`, if given alongside
 * `checkStepConsistency`, is passed straight through to
 * `computeChainConsistency` to keep a bare inline quantity (e.g. "adding
 * $4x_1x_2$ to both sides") from being compared against its neighbors as if
 * it were itself a proof step — see that function's doc comment.
 *
 * Returns { [rubricId]: { score, displayText } }.
 */
export async function scoreFullAnswer(embed, answerText, rubric, options = {}) {
  const { checkMathEquivalence, checkStepConsistency, classifySpan } = options;
  const sentences = splitIntoSentences(answerText);
  const windows = buildWindows(sentences, 3);
  for (const w of windows) await embed(w.text);
  const mathSpans = checkMathEquivalence ? extractMathSpans(answerText) : [];
  const { chainOk } = computeChainConsistency(mathSpans, checkStepConsistency, classifySpan);

  const results = {};
  for (const r of rubric) {
    let best = -1;
    let bestWin = null;
    let bestNumericMismatch = false;

    // Symbolic tier: checked first, since a correct equation can be
    // algebraically equivalent to `expectedMath` while sharing no literal
    // wording with `accepted` and scoring poorly on both other tiers.
    if (r.expectedMath && mathSpans.length) {
      for (let i = 0; i < mathSpans.length; i++) {
        if (!chainOk[i]) continue; // see checkStepConsistency doc comment above
        if (checkMathEquivalence(mathSpans[i], r.expectedMath)) {
          best = 1;
          bestWin = { text: `$${mathSpans[i]}$`, start: 0, len: 1 };
          break;
        }
      }
    }

    // Fast path: an accepted term appearing literally in some window is an
    // unambiguous match — mark schemes are enumerated terms, not open
    // paraphrase tolerance (mirrors fastAcceptedMatch's exact/substring check
    // already used for tier-2/3 single-blank grading). This also sidesteps
    // the embedding step below, whose length mismatch (a multi-sentence
    // window vs a 1-3 word phrase) can otherwise under-score a verbatim
    // correct answer.
    if (best < 1) {
      for (const w of windows) {
        if (fastAcceptedMatch(w.text, r.accepted)) {
          best = 1;
          bestWin = w;
          break;
        }
      }
    }

    if (best < 1) {
      for (const phrase of r.accepted) {
        const phraseNumbers = extractNumbers(phrase);
        // Embed the phrase filled into its full sentence context
        // (level2Template) rather than the bare phrase alone: comparing a
        // multi-sentence answer window against a 1-3 word phrase is a
        // length/context mismatch that systematically depresses cosine
        // similarity even for an unambiguously correct answer.
        const target = (r.level2Template && r.level2Template.includes('___'))
          ? r.level2Template.replace('___', phrase)
          : phrase;
        const pv = await embed(target);
        for (const w of windows) {
          let s = cosineSim(pv, await embed(w.text));
          // See numbersConsistent()'s doc comment — a structurally similar
          // window that names a different number than this accepted phrase
          // can't be treated as a genuine match on raw cosine similarity.
          // Scaled down (not clamped to a flat constant) so that among
          // several equally-mismatched windows, the one that's otherwise
          // the closest paraphrase still wins bestWin/displayText — the
          // closest-but-wrong line is far more useful to show the student
          // than an arbitrary tie-break pick.
          const mismatch = !numbersConsistent(phraseNumbers, w.text);
          if (mismatch) s *= NUMERIC_MISMATCH_SCORE_CAP;
          if (s > best) {
            best = s;
            bestWin = w;
            bestNumericMismatch = mismatch;
          }
        }
      }
    }
    let displayText = bestWin ? bestWin.text : '';
    if (bestWin && bestWin.len === 1 && bestWin.start > 0) {
      displayText = `${sentences[bestWin.start - 1]} ${bestWin.text}`;
    }
    // `numericMismatch`: true when the winning window is the closest
    // paraphrase match but named a different number than any accepted
    // phrase — lets the UI tell a student "right approach, wrong number"
    // apart from "this wasn't addressed at all" instead of collapsing both
    // into the same generic low score (see numbersConsistent()'s comment).
    results[r.id] = { score: best, displayText, numericMismatch: bestNumericMismatch };
  }
  return results;
}
