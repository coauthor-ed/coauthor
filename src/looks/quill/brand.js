import '../../ui/components/QuillLoader.js';
import '../../ui/components/CoAuthorLogo.js';
import '../../ui/components/QuillMascot.js';

/**
 * The Quill look's brand module: what the neutral slots render while Quill
 * is the look (src/ui/components/LookSlots.js; contract in
 * docs/ui-ux-design-system.md 1.1.1b).
 *
 * Quill is the base look, so this module is imported statically by
 * LookSlots.js and handed to LookManager (provideBrand): first paint, the
 * index.html loading overlay and the authoring app's plugin previews all get
 * these elements without waiting for an import. The pieces every screen
 * needs load with it; the rest load with the view that places them
 * (loadBrandPieces() in that view's module), as before.
 */

/** slot kind -> the element that fills it. `load` defines a lazy one. */
export const slots = {
  loader: { tag: 'quill-loader' },
  logo: { tag: 'coauthor-logo' },
  companion: { tag: 'quill-mascot' },
  signature: { tag: 'quill-signature', load: () => import('../../ui/components/QuillSignature.js') },
  coach: { tag: 'quill-coach', load: () => import('../../ui/components/QuillCoach.js') },
  'math-coach': { tag: 'quill-math-coach', load: () => import('../../ui/components/QuillMathCoach.js') },
  stagehand: { tag: 'quill-stagehand', load: () => import('../../core/components/diorama/QuillStagehand.js') },
};

/** Moving between pages and story slides: Quill turns the page. */
export { turnPage, canTurnPage } from '../../ui/pageTurn.js';

/** Chrome copy that names the companion. Keys are read with brandCopy(). */
export const copy = {
  // Story narration header (content-block story bubble, StoryTheatre panel).
  narrator: 'Quill explains',
  // SimViewPrefs "Window moves": the choice where the stagehand does it.
  stagehandMoves: 'Quill moves them',
  // The label on a guide's > [!QUILL] tip.
  companionName: 'Quill',

  // Lesson complete: the line under the heading, and the way back.
  completeEmpty: 'That is the whole lesson. Nothing left to do here.',
  completeClean: '{right} right, none wrong. Suspiciously smooth.',
  completeMixed: 'You were wrong {wrongTimes} and right {right} - that is how it is supposed to go.',
  backToCourse: 'Back to the path',
  // Test results headline, by score.
  testHigh: 'Nearly flawless.',
  testMid: 'Solid work.',
  testLow: 'Worth another pass.',
  // The tag on a picked wrong option.
  wrongTag: 'Not this one',
  // A course card's footer on Home.
  cardKind: 'Interactive Lesson',
  cardCta: 'Explore \u2192',
  // The last line of a built-up answer (semantic-descriptive).
  answerBuilt: 'Masterpiece complete!',
};

/** Marks the app places beside words, read with brandIcon(). */
export const icons = {
  hint: '\u{1F4A1}',
  sparkle: '\u2728',
  write: '\u270D\uFE0F',
  pen: '\u{1F58A}\uFE0F',
  party: '\u{1F389}',
  rubricMet: '\u2B50',
  rubricPartial: '\u{1F440}',
  rubricMissing: '\u274C',
  rubricNumeric: '\u{1F522}',
  scene: '\u{1F52C}',
  setup: '\u{1F9E9}',
  remote: '\u{1F310}',
};

/** His reaction under a checked try-block in a student guide, per verdict:
 *  [expression, act, lines]. */
export const guideReactions = {
  right: ['heart', 'cheer', ['Brilliant! You got it.', 'Yes! That is exactly right.', 'Full marks. Well done!']],
  part: ['happy', '', ['Good start. Read the feedback above, fix one thing, and check again.', 'Nearly there. Look at what is missing, then try once more.']],
  coach: ['surprised', '', ['Some points need more work. Read the hint for each one, then check again.']],
  zero: ['surprised', '', ['Not yet, and that is fine. Read the feedback, then have another go.']],
};
