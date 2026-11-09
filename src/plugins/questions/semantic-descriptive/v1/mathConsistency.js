import { normalizeLatexSubscripts } from 'core/evaluators/semanticSimilarityEvaluator.js';

const RELATION_OPERATORS = new Set(['Equal', 'Less', 'LessEqual', 'Greater', 'GreaterEqual']);

/**
 * Is `side` equal to "the square root of `other`" — i.e. does taking the
 * square root of `other` land on `side`? Tried two ways:
 *
 *   1. `side` is a literal `Sqrt(...)` node — unwrap it and compare its own
 *      argument to `other` directly. This is what "take the square root of
 *      both sides" actually means when a student writes `\sqrt{...}`, and it
 *      sidesteps a real ComputeEngine limitation confirmed empirically:
 *      `simplify()` will NOT reduce `sqrt(x)^2` back to `x` without a sign
 *      assumption it has no way to infer from context (`sqrt(x)^2 = |x|` in
 *      general) — even though the surrounding proof's own premises (e.g.
 *      "x1, x2 are positive reals") make that assumption obviously valid.
 *      Unwrapping the Sqrt node directly needs no such assumption at all.
 *   2. Fallback: square `side` and simplify — covers the rarer case where a
 *      square root isn't written with an explicit `\sqrt{}` (e.g. a
 *      fractional exponent), where the sign issue above doesn't arise.
 */
function isSqrtOf(ce, isZero, side, other) {
  if (side?.operator === 'Sqrt' && isZero(side.op1, other)) return true;
  try {
    return isZero(ce.box(['Square', side]).simplify(), other);
  } catch {
    return false;
  }
}

/**
 * Is `latex` shaped like a proof *step* (a relation: `=`, `<`, `<=`, `>`,
 * `>=`), or is it just a bare inline *term* (a plain quantity, e.g. a
 * student writing "adding $4x_1x_2$ to both sides" — a quantity named for
 * context, not a claim being made)? Only 'step'-classified spans belong in
 * the sequential chain `checkStepConsistency` walks — comparing a bare term
 * against its neighboring relations as if it were itself a step is a
 * category error, and was a real false-positive: `checkStepConsistency`
 * correctly rejects "4x1x2" as not-a-relation (`validRelation` below), but
 * treating that rejection as a *chain break* wrongly flagged an otherwise
 * fully consistent derivation just because the student named an
 * intermediate quantity inline before using it.
 *
 * A span that fails to parse entirely, or parses with a relation operator
 * but a malformed sub-expression (e.g. a duplicated/nested subscript), is
 * still classified 'step' — it was very likely *attempting* to be a step
 * (this is exactly the shape of the original reported bug: a `\geq` relation
 * present, just with one malformed operand), so it stays in the chain and
 * `checkStepConsistency` reports it 'unverifiable' rather than being
 * silently dropped as if it were harmless inline decoration.
 */
function classifySpan(ce, latex) {
  let expr;
  try {
    expr = ce.parse(normalizeLatexSubscripts(latex));
  } catch {
    return 'step';
  }
  return expr && RELATION_OPERATORS.has(expr.operator) ? 'step' : 'term';
}

/**
 * Builds the two DI callbacks `scoreFullAnswer`'s chain-gating expects (see
 * its doc comment in semanticSimilarityEvaluator.js, and
 * `computeChainConsistency`'s) — shared by semantic-descriptive@1 and @2,
 * both of which load their own ComputeEngine instance and pass it in here
 * (same DI shape as `checkMathEquivalence`, which lives inline in each
 * plugin's `_loadMathCheckers()` since it's short enough not to need this).
 *
 * `checkStepConsistency(prevLatex, currLatex)` recognizes the handful of
 * algebraic moves a CBSE stepwise proof/derivation actually uses, checked in
 * order against each relation's two operands (`op1`/`op2` — ComputeEngine
 * canonicalizes `>=`/`<=` to `LessEqual`, so which operand was originally
 * left/right of the operator doesn't matter, only that both lines'
 * op1-vs-op1 and op2-vs-op2 are compared consistently):
 *
 *   1. Same delta both sides — `simplify(curr.opN - prev.opN)` equal for
 *      N=1,2. A delta of 0 on both sides also covers pure restatement/
 *      factoring/simplification (e.g. "x1^2+x2^2+2x1x2" -> "(x1+x2)^2"); a
 *      nonzero-but-equal delta covers "add/subtract the same quantity to
 *      both sides".
 *   2. Same ratio both sides — `simplify(curr.opN / prev.opN)` equal for
 *      N=1,2 — covers "multiply/divide both sides by the same quantity".
 *   3. Square/square-root, either direction, per side via `isSqrtOf()` above
 *      — covers "take the square root of both sides" / "square both sides".
 *
 * This is deliberately NOT a general proof checker (see the plugin's
 * `_loadMathCheckers()` doc comment and docs/descriptive-questions-and-cbse-
 * marks.md for the full scope/limits) — it recognizes a fixed, small
 * vocabulary of moves and returns 'broken' for anything else it can't
 * explain, even a real proof step that uses a move outside that vocabulary
 * (e.g. an identity substitution). Returns 'unverifiable' rather than a
 * silent pass whenever either span isn't itself a clean, fully-valid
 * relation expression (a parse error, or a malformed sub-expression like a
 * duplicated/nested subscript) — a span that doesn't even parse is itself
 * worth a human glance, not something to wave through as consistent.
 *
 * `classifySpan(latex)` is `computeChainConsistency`'s pre-filter — see its
 * own doc comment above.
 */
export function makeStepConsistencyChecker(ce) {
  const isZero = (a, b) => {
    try { return ce.box(['Subtract', a, b]).simplify().is(0) === true; } catch { return false; }
  };
  const validRelation = (e) => !!e && RELATION_OPERATORS.has(e.operator) && e.isValid !== false
    && e.op1?.isValid !== false && e.op2?.isValid !== false;

  const checkStepConsistency = function checkStepConsistency(prevLatex, currLatex) {
    let prev;
    let curr;
    try {
      prev = ce.parse(normalizeLatexSubscripts(prevLatex));
      curr = ce.parse(normalizeLatexSubscripts(currLatex));
    } catch {
      return 'unverifiable';
    }
    if (!validRelation(prev) || !validRelation(curr)) return 'unverifiable';

    try {
      const d1 = ce.box(['Subtract', curr.op1, prev.op1]).simplify();
      const d2 = ce.box(['Subtract', curr.op2, prev.op2]).simplify();
      if (isZero(d1, d2)) return 'consistent';
    } catch { /* try the next move */ }

    try {
      const r1 = ce.box(['Divide', curr.op1, prev.op1]).simplify();
      const r2 = ce.box(['Divide', curr.op2, prev.op2]).simplify();
      if (isZero(r1, r2)) return 'consistent';
    } catch { /* try the next move */ }

    try {
      if (isSqrtOf(ce, isZero, curr.op1, prev.op1) && isSqrtOf(ce, isZero, curr.op2, prev.op2)) return 'consistent';
      if (isSqrtOf(ce, isZero, prev.op1, curr.op1) && isSqrtOf(ce, isZero, prev.op2, curr.op2)) return 'consistent';
    } catch { /* no recognized move explains this transition */ }

    return 'broken';
  };

  return { checkStepConsistency, classifySpan: (latex) => classifySpan(ce, latex) };
}
