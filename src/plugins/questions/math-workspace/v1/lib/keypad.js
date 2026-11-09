/**
 * keypad.js - topic-aware key sets for the math keypad.
 *
 * Each key: { face, insert, title, tone }. face is plain text (unicode
 * escapes, ASCII-only source); insert is MathLive LaTeX where #@ is the
 * current selection and #? a new placeholder; #-commands (#undo, #clear ...)
 * are field actions. icon names an icon face instead of text. tone: 'topic' keys get the
 * topic colour, 'op' keys the neutral chip, 'nav' keys the muted chip.
 */

const k = (face, insert, title, tone = 'topic') => ({ face, insert, title: title || face, tone });
/** A key whose face is drawn by MathLive (glyphs the UI fonts lack). */
const t = (tex, insert, title) => ({ face: '', tex, insert, title, tone: 'topic' });

const COMMON = [
  k('x', 'x', 'x', 'op'),
  k('( )', '\\left(#@\\right)', 'Brackets', 'op'),
  k('a/b', '\\frac{#@}{#?}', 'Fraction', 'op'),
  k('x\u00b2', '#@^{2}', 'Squared', 'op'),
  k('x\u207f', '#@^{#?}', 'Power', 'op'),
  k('\u221a', '\\sqrt{#@}', 'Square root', 'op'),
  k('\u00b1', '\\pm', 'Plus or minus', 'op'),
  k('=', '=', 'Equals', 'op'),
  k('\u2190', '#left', 'Move left', 'nav'),
  k('\u2192', '#right', 'Move right', 'nav'),
  k('del', '#backspace', 'Delete', 'nav'),
  { face: '', icon: 'undo', insert: '#undo', title: 'Undo', tone: 'nav' },
  { face: '', icon: 'redo', insert: '#redo', title: 'Redo', tone: 'nav' },
  { face: '', icon: 'clear', insert: '#clear', title: 'Clear this box', tone: 'nav' },
];

const TOPIC = {
  algebra: [k('y', 'y'), k('a', 'a'), k('b', 'b'), k('\u00d7', '\\times'), k('\u00f7', '\\div'), k('|x|', '\\left|#@\\right|', 'Absolute value')],
  quadratics: [k('or', '\\lor ', 'or'), k('b\u00b2\u22124ac', 'b^2-4ac', 'Discriminant'), k('\u0394', '\\Delta', 'Delta'), k('\u03b1', '\\alpha'), k('\u03b2', '\\beta')],
  trig: [k('sin', '\\sin'), k('cos', '\\cos'), k('tan', '\\tan'), k('\u03b8', '\\theta', 'theta'), k('\u03c0', '\\pi', 'pi'), k('sin\u00b2', '\\sin^2'), k('cos\u00b2', '\\cos^2'), k('sec', '\\sec'), k('cosec', '\\csc'), k('cot', '\\cot'), k('\u00b0', '^{\\circ}', 'degrees')],
  binomial: [t('{}^nC_r', '\\binom{#?}{#?}', 'n choose r'), k('!', '!', 'factorial'), k('n', 'n'), k('r', 'r'), t('T_{r+1}', 'T_{r+1}', 'General term'), k('\u00b7', '\\cdot', 'times')],
  progressions: [k('n', 'n'), k('a', 'a'), k('d', 'd'), k('r', 'r'), t('T_n', 'T_{n}', 'nth term'), t('S_n', 'S_{n}', 'Sum of n terms'), k('\u03a3', '\\sum_{#?}^{#?}', 'Sigma sum')],
  calculus: [k('\u222b', '\\int #? \\, dx', 'Integral'), k('dx', '\\,dx'), t('e^x', 'e^{#?}', 'e to the power'), k('ln', '\\ln'), k('+C', '+C', 'Constant'), k('sin', '\\sin'), k('cos', '\\cos')],
  inequalities: [k('<', '<'), k('\u2264', '\\le', 'less or equal'), k('>', '>'), k('\u2265', '\\ge', 'greater or equal'), k('\u221e', '\\infty', 'infinity'), k('\u2212\u221e', '-\\infty', 'minus infinity'), t('\\cup', '\\cup', 'union'), k('[', '['), k(']', ']'), k('(', '('), k(')', ')'), k(',', ',')],
  coordinate: [k('y', 'y'), k('m', 'm'), k('c', 'c'), t('x_1', 'x_1', 'x 1'), t('y_1', 'y_1', 'y 1'), t('x_2', 'x_2', 'x 2'), t('y_2', 'y_2', 'y 2')],
  matrices: [k('[2\u00d72]', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', '2 by 2 matrix'), k('|A|', '\\left|#@\\right|', 'Determinant'), t('A^{-1}', '#@^{-1}', 'Inverse'), t('A^T', '#@^{T}', 'Transpose')],
  vectors: [t('\\vec{v}', '\\vec{#?}', 'Vector'), t('\\hat{i}', '\\hat{i}', 'i hat'), t('\\hat{j}', '\\hat{j}', 'j hat'), t('\\hat{k}', '\\hat{k}', 'k hat'), k('\u00b7', '\\cdot', 'dot product'), k('\u00d7', '\\times', 'cross product'), k('|v|', '\\left|#@\\right|', 'Magnitude')],
  stats: [t('\\bar{x}', '\\bar{x}', 'mean'), k('\u03c3', '\\sigma'), k('\u03a3', '\\sum'), k('n', 'n'), k('f', 'f'), k('\u221a', '\\sqrt{#@}')],
};

export function keysFor(topic) {
  return { topic: TOPIC[topic] || TOPIC.algebra, common: COMMON };
}

export const TOPIC_LABEL = {
  algebra: 'Algebra', quadratics: 'Quadratics', trig: 'Trigonometry', progressions: 'Progressions',
  binomial: 'Binomial', calculus: 'Calculus', matrices: 'Matrices', vectors: 'Vectors',
  inequalities: 'Inequalities', coordinate: 'Coordinate geometry', stats: 'Statistics',
};

/** Topic colour: one of the closed categorical tokens. */
export const TOPIC_TONE = {
  algebra: 'var(--content-series-1)', quadratics: 'var(--content-series-5)', trig: 'var(--content-series-4)',
  progressions: 'var(--content-series-3)', binomial: 'var(--content-series-2)', calculus: 'var(--content-series-6)',
  matrices: 'var(--accent-blue)', vectors: 'var(--accent-violet)', inequalities: 'var(--accent-blue)',
  coordinate: 'var(--accent-teal)', stats: 'var(--accent-amber)',
};
