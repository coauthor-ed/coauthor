/**
 * The story cast's speech bubble box, shared by SAY bubbles (sayBubbles.js)
 * and a cast figure's spoken line (CastFigure.speak(), the cast coach), so
 * every line a cast character says looks the same. Declarations only, tokens
 * only (invariant 9); each user wraps them in its own selector.
 */
export const BUBBLE_BOX = `
  background: var(--bubble-fill); color: var(--text-main);
  border: 2.5px solid var(--bubble-ink); border-radius: 18px;
  box-shadow: var(--shadow-sm);
`;

/** The name over a line. */
export const BUBBLE_NAME = `
  display: block; margin-bottom: 1px;
  font-family: var(--font-heading); font-weight: var(--fw-heavy);
  font-size: 0.74rem; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.5;
  color: var(--accent-coral);
`;
