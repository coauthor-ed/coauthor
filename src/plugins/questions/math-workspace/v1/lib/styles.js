import { css } from 'lit';

/**
 * Shared styles for every math-workspace shape element.
 *
 * Tokens only (invariant 9): saturated board colours come from the --mw-*
 * family in src/ui/theme.css, everything else from the existing palette.
 * Chips and buttons are flat fills with a solid lip, never a gloss strip.
 * Comments inside this template use plain words: no backtick characters.
 */
export const mwBaseStyles = css`
  :host {
    display: block;
    font-family: var(--font-family);
    color: var(--text-main);
    --mw-gap: 14px;
    --mw-rail: 52px;
    --mw-node: 40px;
  }
  * { box-sizing: border-box; }
  /* Keep scrolled-to things clear of the lesson's sticky action bar. */
  .mw-card, .row, .bubble, .fork, .keypad, .done { scroll-margin-bottom: calc(128px + var(--mw-dock, 0px)); scroll-margin-top: 84px; }

  /* ---- math-field skin -------------------------------------------- */
  math-field {
    display: block;
    width: 100%;
    min-height: 44px;
    font-size: 1.32rem;
    padding: 6px 8px;
    border: none;
    outline: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-main);
    --caret-color: var(--primary-color);
    --contains-highlight-background-color: var(--primary-light);
    --selection-background-color: var(--primary-light);
    --selection-color: var(--text-main);
    --placeholder-color: var(--text-muted);
    --text-font-family: var(--font-family);
    --prompt-border-color: var(--primary-color);
    --prompt-background-color: var(--primary-light);
  }
  math-field::part(menu-toggle) { display: none; }
  /* The plugin's own keypad has a full-keyboard key, so the in-field toggle
     only costs width (MathLive still opens its keyboard on touch). */
  math-field::part(virtual-keyboard-toggle) { display: none; }
  math-field[read-only] { cursor: default; }

  /* ---- generic chunky card ---------------------------------------- */
  .mw-card {
    position: relative;
    background: var(--bg-surface);
    border: 3px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--press-1) var(--border-hover);
    transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
  }
  .mw-card:focus-within {
    border-color: var(--primary-color);
    box-shadow: var(--press-1) var(--primary-hover);
  }
  .mw-card.ok { border-color: var(--mw-ok-fill); box-shadow: var(--press-1) var(--mw-ok-lip); }
  .mw-card.bad { border-color: var(--mw-bad-fill); box-shadow: var(--press-1) var(--mw-bad-lip); }
  .mw-card.warn { border-color: var(--mw-gold-fill); box-shadow: var(--press-1) var(--mw-gold-lip); }

  /* ---- flat chips with a lip -------------------------------------- */
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 8px 14px;
    border: 2px solid var(--border-hover);
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    color: var(--text-main);
    font-family: var(--font-heading);
    font-weight: var(--fw-strong);
    font-size: 0.95rem;
    line-height: 1.1;
    cursor: pointer;
    box-shadow: 0 3px 0 var(--border-hover);
    transition: transform 0.08s, background var(--motion-fast), border-color var(--motion-fast);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .chip:hover:not(:disabled) { border-color: var(--primary-color); }
  .chip:active:not(:disabled) { transform: translateY(3px); box-shadow: none; }
  .chip:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
  .chip:disabled { opacity: 0.5; cursor: default; }
  .chip.primary { background: var(--primary-color); border-color: var(--primary-hover); color: var(--on-primary); box-shadow: 0 3px 0 var(--primary-hover); }
  .chip.ok { background: var(--mw-ok-fill); border-color: var(--mw-ok-lip); color: var(--mw-on-fill); box-shadow: 0 3px 0 var(--mw-ok-lip); }
  .chip.bad { background: var(--mw-bad-fill); border-color: var(--mw-bad-lip); color: var(--mw-on-fill); box-shadow: 0 3px 0 var(--mw-bad-lip); }
  .chip.gold { background: var(--mw-gold-fill); border-color: var(--mw-gold-lip); color: var(--mw-on-fill); box-shadow: 0 3px 0 var(--mw-gold-lip); }
  .chip.ghost { background: transparent; box-shadow: none; border-style: dashed; }
  .chip.sm { min-height: 32px; padding: 4px 10px; font-size: 0.82rem; }
  .chip svg { width: 18px; height: 18px; flex: none; }

  .icon-btn {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: 0 2px 0 var(--border-color);
    padding: 0;
    flex: none;
  }
  .icon-btn:hover { color: var(--primary-color); border-color: var(--primary-color); }
  .icon-btn:active { transform: translateY(2px); box-shadow: none; }
  .icon-btn:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
  .icon-btn svg { width: 18px; height: 18px; }
  .icon-btn.go { color: var(--mw-on-fill); background: var(--mw-ok-fill); border-color: var(--mw-ok-lip); box-shadow: 0 2px 0 var(--mw-ok-lip); }
  .icon-btn.del:hover { color: var(--mw-bad-fill); border-color: var(--mw-bad-fill); }

  /* ---- speech-ish feedback bubbles -------------------------------- */
  .bubble {
    position: relative;
    margin-top: 10px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background: var(--bg-panel);
    color: var(--text-soft);
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .bubble::before {
    content: '';
    position: absolute;
    top: -7px;
    left: 22px;
    width: 14px;
    height: 14px;
    background: inherit;
    transform: rotate(45deg);
    border-radius: 3px;
  }
  .bubble.bad { background: var(--error-bg); color: var(--text-main); }
  .bubble.warn { background: var(--warn-bg); color: var(--text-main); }
  .bubble.hint { background: var(--info-bg); color: var(--text-main); }
  .bubble.ok { background: var(--success-bg); color: var(--text-main); }
  .bubble.quiet { background: var(--bg-panel); color: var(--text-muted); font-size: 0.88rem; padding: 6px 12px; margin-top: 8px; }
  .bubble strong { font-family: var(--font-heading); font-weight: var(--fw-strong); }
  .bubble .row-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }

  /* ---- XP float, combo, stars ------------------------------------- */
  .xp-float {
    position: absolute;
    z-index: 5;
    pointer-events: none;
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    background: var(--mw-gold-fill);
    color: var(--mw-on-fill);
    box-shadow: 0 3px 0 var(--mw-gold-lip);
    font-family: var(--font-heading);
    font-weight: var(--fw-heavy);
    font-size: 0.9rem;
    white-space: nowrap;
    animation: mw-xp-rise 1.1s var(--ease-settle) forwards;
  }
  @keyframes mw-xp-rise {
    0% { opacity: 0; transform: translate(-50%, 6px) scale(0.6); }
    18% { opacity: 1; transform: translate(-50%, -6px) scale(1.12); }
    70% { opacity: 1; transform: translate(-50%, -28px) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -44px) scale(0.95); }
  }

  .spark {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 6;
    animation: mw-spark 0.9s var(--ease-settle) forwards;
  }
  @keyframes mw-spark {
    0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg) scale(1); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(220deg) scale(0.4); }
  }

  @keyframes mw-pop {
    0% { transform: scale(0.6); }
    55% { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  @keyframes mw-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(2px); }
  }
  @keyframes mw-slide-in {
    0% { opacity: 0; transform: translateY(-14px) scale(0.96); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes mw-glow {
    0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--mw-ok-fill) 22%, transparent); }
    50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--mw-ok-fill) 34%, transparent); }
  }
  @keyframes mw-pulse-ring {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary-color) 45%, transparent), var(--press-1) var(--primary-hover); }
    100% { box-shadow: 0 0 0 12px color-mix(in srgb, var(--primary-color) 0%, transparent), var(--press-1) var(--primary-hover); }
  }
  @keyframes mw-shimmer {
    0% { background-position: 0 -60px; }
    100% { background-position: 0 60px; }
  }
  @keyframes mw-wave {
    0%, 100% { transform: skewY(0deg) scaleX(1); }
    50% { transform: skewY(-6deg) scaleX(0.94); }
  }

  .pop { animation: mw-pop 0.42s var(--ease-spring) both; }
  .shake { animation: mw-shake 0.45s ease-out both; }
  .slide-in { animation: mw-slide-in 0.38s var(--ease-settle) both; }

  .sr-only {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }

  /* ---- small text helpers ----------------------------------------- */
  .kicker {
    font-family: var(--font-heading);
    font-size: var(--fs-kicker);
    font-weight: var(--fw-strong);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .muted { color: var(--text-muted); }

  @media (prefers-reduced-motion: reduce) {
    .pop, .shake, .slide-in, .xp-float, .spark { animation: none !important; }
    .xp-float { opacity: 0; }
    .spark { display: none; }
    .mw-card, .chip { transition: none; }
  }
`;

/** The step trail: rail of nodes and links beside line cards. */
export const mwTrailStyles = css`
  .board {
    position: relative;
    padding: 18px 14px 16px;
    border-radius: var(--radius-lg);
    background-color: var(--mw-board-bg);
    background-image: radial-gradient(var(--mw-board-dot) 1.6px, transparent 1.7px);
    background-size: 22px 22px;
    background-position: 11px 11px;
  }
  .trail { position: relative; display: flex; flex-direction: column; gap: var(--mw-gap); }
  .row {
    position: relative;
    display: grid;
    grid-template-columns: var(--mw-rail) minmax(0, 1fr);
    column-gap: 10px;
    align-items: start;
  }
  .row.mirror { grid-template-columns: minmax(0, 1fr) var(--mw-rail); }
  .row.mirror .rail { order: 2; }
  .rail { position: relative; align-self: stretch; min-height: 52px; }

  /* Link segments: "in" runs from the previous node down into this one,
     "out" runs from this node down to the bottom of the row. */
  .seg {
    position: absolute;
    left: 50%;
    width: 10px;
    margin-left: -5px;
    border-radius: 6px;
    background: repeating-linear-gradient(180deg, var(--border-hover) 0 8px, transparent 8px 14px);
    transition: background var(--motion-base);
  }
  .seg.in { top: calc(-1 * var(--mw-gap) - 2px); height: calc(var(--mw-gap) + 26px); }
  .seg.out { top: 26px; bottom: -2px; }
  .seg.ok {
    background: var(--mw-ok-fill);
    background-image: linear-gradient(180deg, transparent 0 40%, color-mix(in srgb, var(--bg-surface) 55%, transparent) 50%, transparent 60% 100%);
    background-size: 100% 60px;
    animation: mw-shimmer 1.8s linear infinite, mw-glow 2.4s ease-in-out infinite;
  }
  .seg.warn { background: var(--mw-gold-fill); }
  .seg.badsolid { background: var(--mw-bad-fill); opacity: 0.55; }
  [hidden] { display: none !important; }
  .mf-wrap { flex: 1 1 auto; min-width: 0; }
  .cell { min-width: 0; }
  .reasons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
  .seg.bad { background: transparent; }
  .seg.bad::before,
  .seg.bad::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    background: var(--mw-bad-fill);
    border-radius: 5px;
  }
  .seg.bad::before {
    top: 0;
    height: 52%;
    clip-path: polygon(0 0, 100% 0, 100% 78%, 70% 100%, 35% 84%, 0 100%);
    transform: translateX(-5px) rotate(-12deg);
    transform-origin: top center;
    animation: mw-crack-a 0.5s var(--ease-spring) both;
  }
  .seg.bad::after {
    bottom: 0;
    height: 44%;
    clip-path: polygon(0 18%, 30% 0, 66% 16%, 100% 2%, 100% 100%, 0 100%);
    transform: translateX(5px) rotate(11deg);
    transform-origin: bottom center;
    animation: mw-crack-b 0.5s var(--ease-spring) both;
  }
  @keyframes mw-crack-a { 0% { transform: none; } 60% { transform: translateX(-8px) rotate(-17deg); } 100% { transform: translateX(-5px) rotate(-12deg); } }
  @keyframes mw-crack-b { 0% { transform: none; } 60% { transform: translateX(8px) rotate(16deg); } 100% { transform: translateX(5px) rotate(11deg); } }

  .node {
    position: absolute;
    left: calc(50% - var(--mw-node) / 2);
    top: 6px;
    width: var(--mw-node);
    height: var(--mw-node);
    border-radius: 50%;
    display: grid;
    place-items: center;
    z-index: 2;
    background: var(--bg-surface);
    border: 4px solid var(--border-hover);
    box-shadow: 0 4px 0 var(--border-hover);
    color: var(--text-muted);
    font-family: var(--font-heading);
    font-weight: var(--fw-heavy);
    font-size: 0.95rem;
    transition: background var(--motion-fast), border-color var(--motion-fast);
  }
  .node svg { width: 22px; height: 22px; }
  .node.start {
    border-radius: 14px;
    background: var(--primary-color);
    border-color: var(--primary-hover);
    box-shadow: 0 4px 0 var(--primary-hover);
    color: var(--on-primary);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }
  .node.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    animation: mw-pulse-ring 1.6s ease-out infinite;
  }
  .node.ok { background: var(--mw-ok-fill); border-color: var(--mw-ok-lip); box-shadow: 0 4px 0 var(--mw-ok-lip); color: var(--mw-on-fill); }
  .node.warn { background: var(--mw-gold-fill); border-color: var(--mw-gold-lip); box-shadow: 0 4px 0 var(--mw-gold-lip); color: var(--mw-on-fill); }
  .node.bad { background: var(--mw-bad-fill); border-color: var(--mw-bad-lip); box-shadow: 0 4px 0 var(--mw-bad-lip); color: var(--mw-on-fill); }
  .node.lit { animation: mw-pop 0.45s var(--ease-spring) both; }
  .node.bad.lit { animation: mw-shake 0.45s ease-out both; }
  .node .badge {
    position: absolute;
    right: -10px;
    top: -10px;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    border-radius: 10px;
    background: var(--mw-gold-fill);
    border: 2px solid var(--mw-gold-lip);
    display: grid;
    place-items: center;
  }
  .node .badge svg { width: 12px; height: 12px; }

  .line { padding: 4px 6px 4px 8px; }
  .line.slide-in { animation: mw-slide-in 0.38s var(--ease-settle) both; }
  .line-top { display: flex; align-items: center; gap: 6px; }
  .line-top math-field { flex: 1 1 auto; min-width: 0; }
  .line .preview {
    flex: 1 1 auto;
    min-width: 0;
    padding: 8px 8px;
    font-size: 1.32rem;
    cursor: text;
    overflow-x: auto;
    border-radius: var(--radius-sm);
  }
  .line .preview:focus-visible { outline: var(--focus-ring); }
  .line .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 4px 8px;
    font-size: 0.75rem;
    font-weight: var(--fw-strong);
    color: var(--text-muted);
  }
  .line .tag.ms { color: var(--mw-gold-lip); }
  .line .tag svg { width: 14px; height: 14px; }
  .moved-note { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 4px 8px; display: flex; align-items: center; gap: 6px; }
  .moved-swatch { width: 12px; height: 12px; border-radius: 4px; background: var(--mw-moved-bg); box-shadow: 0 2px 0 var(--mw-moved-lip); }

  .start-card {
    padding: 8px 12px;
    font-size: 1.3rem;
    background: color-mix(in srgb, var(--primary-light) 70%, var(--bg-surface));
    border-color: color-mix(in srgb, var(--primary-color) 40%, var(--border-color));
    box-shadow: var(--press-1) color-mix(in srgb, var(--primary-color) 40%, var(--border-hover));
    overflow-x: auto;
  }

  /* ---- goal flag ---------------------------------------------------- */
  .goal .node {
    width: 50px;
    height: 50px;
    left: calc(50% - 25px);
    top: 0;
    background: var(--bg-panel-2);
    border-color: var(--border-hover);
    color: var(--text-muted);
  }
  .goal .node svg { width: 28px; height: 28px; }
  .goal:not(.reached) .node { animation: mw-bob 2.6s ease-in-out infinite; }
  @keyframes mw-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -4px; } }
  /* Path complete: a wave of light runs down every lit node. */
  .board.won .node.ok { animation: mw-win 0.7s var(--ease-spring) both; animation-delay: calc(var(--i, 0) * 90ms); }
  @keyframes mw-win { 0% { scale: 1; } 45% { scale: 1.25; box-shadow: 0 0 0 8px color-mix(in srgb, var(--mw-gold-fill) 45%, transparent), 0 4px 0 var(--mw-ok-lip); } 100% { scale: 1; } }
  .goal.reached .node {
    background: var(--mw-gold-fill);
    border-color: var(--mw-gold-lip);
    box-shadow: 0 5px 0 var(--mw-gold-lip);
    color: var(--mw-on-fill);
    animation: mw-pop 0.6s var(--ease-spring) both;
  }
  .goal.reached .node .flag-cloth { transform-origin: left center; animation: mw-wave 0.9s ease-in-out infinite; }
  .goal-card {
    padding: 10px 14px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 14px;
    min-height: 50px;
    border-style: dashed;
    background: transparent;
    box-shadow: none;
  }
  .goal.reached .goal-card {
    border-style: solid;
    background: color-mix(in srgb, var(--mw-gold-fill) 18%, var(--bg-surface));
    border-color: var(--mw-gold-fill);
    box-shadow: var(--press-1) var(--mw-gold-lip);
  }
  .goal-title { font-family: var(--font-heading); font-weight: var(--fw-strong); font-size: 1.02rem; }
  .stars { display: inline-flex; gap: 4px; }
  .star { width: 30px; height: 30px; color: var(--bg-panel-2); }
  .star.on { color: var(--mw-gold-fill); animation: mw-pop 0.5s var(--ease-spring) both; }
  .star.on:nth-child(2) { animation-delay: 0.15s; }
  .star.on:nth-child(3) { animation-delay: 0.3s; }
  .star path { stroke: var(--mw-gold-lip); stroke-width: 1.5; }
  .star:not(.on) path { stroke: var(--border-hover); }

  /* ---- fork (move chips) and hint ladder ---------------------------- */
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
  .tools .spacer { flex: 1 1 auto; }
  .fork { margin-top: 10px; padding: 12px; }
  .fork-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .fork-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .fork-chips .chip { font-family: var(--font-family); font-weight: var(--fw-strong); }
  .ghost-branch {
    margin-top: 12px;
    padding: 10px 12px;
    border: 3px dashed var(--mw-bad-fill);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--error-bg) 70%, transparent);
    animation: mw-slide-in 0.35s var(--ease-settle) both;
  }
  .ghost-branch .leads { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 6px; font-size: 1.1rem; }
  .dots { display: inline-flex; gap: 3px; margin-left: 4px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border-hover); }
  .dot.on { background: var(--mw-gold-lip); }

  /* ---- check it yourself ------------------------------------------- */
  .cy { margin-top: 8px; padding: 10px; border-radius: var(--radius-sm); background: var(--bg-surface); border: 2px solid var(--border-color); }
  .cy-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cy input {
    width: 90px;
    min-height: 38px;
    padding: 6px 10px;
    font: inherit;
    font-weight: var(--fw-strong);
    border-radius: var(--radius-xs);
    border: 2px solid var(--border-hover);
    background: var(--bg-base);
    color: var(--text-main);
  }
  .cy input:focus { outline: none; border-color: var(--primary-color); }
  .cy-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin-top: 8px; align-items: center; font-size: 0.95rem; }
  .cy-grid .lbl { color: var(--text-muted); font-weight: var(--fw-strong); font-size: 0.82rem; }
  .cy-val { font-family: var(--font-heading); font-weight: var(--fw-strong); }
  .cy-val.t { color: var(--success-text); }
  .cy-val.f { color: var(--error-text); }

  @media (max-width: 520px) {
    :host { --mw-rail: 40px; --mw-node: 34px; --mw-gap: 12px; }
    .board { padding: 14px 8px 12px; border-radius: var(--radius-md); }
    math-field, .line .preview { font-size: 1.15rem; }
    .start-card { font-size: 1.12rem; }
    .node { font-size: 0.85rem; border-width: 3px; }
    .node svg { width: 18px; height: 18px; }
  }

  /* Plain look: the goal is a quiet tick on the success colour. No bob, pop, win wave or stars. */
  :host([data-look="plain"]) .goal .node, :host([data-look="plain"]) .board.won .node.ok { animation: none; }
  :host([data-look="plain"]) .goal.reached .node { background: var(--mw-ok-fill); border-color: var(--mw-ok-lip); box-shadow: none; }
  :host([data-look="plain"]) .goal.reached .goal-card { background: color-mix(in srgb, var(--mw-ok-fill) 10%, var(--bg-surface)); border-color: var(--mw-ok-fill); box-shadow: none; }

  @media (prefers-reduced-motion: reduce) {
    .seg.ok, .node.active, .node.lit, .goal.reached .node, .goal .node, .board.won .node.ok, .goal.reached .flag-cloth,
    .star.on, .line.slide-in, .ghost-branch, .seg.bad::before, .seg.bad::after { animation: none !important; }
  }
`;

/** Single-answer shapes (expression, slots, solution-set, interval). */
export const mwPadStyles = css`
  .wrap { position: relative; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .tools .spacer { flex: 1 1 auto; }
  .tools .count { font-size: 0.82rem; color: var(--text-muted); font-weight: var(--fw-strong); }
  .dots { display: inline-flex; gap: 3px; margin-left: 4px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border-hover); }
  .dot.on { background: var(--mw-gold-lip); }
  .hint-tag { display: inline-flex; align-items: center; gap: 6px; }
  .hint-tag svg { width: 18px; height: 18px; color: var(--info-text); }
  .fx-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 10; }
  .pad {
    position: relative;
    padding: 16px;
    border-radius: var(--radius-lg);
    background-color: var(--mw-board-bg);
    background-image: radial-gradient(var(--mw-board-dot) 1.6px, transparent 1.7px);
    background-size: 22px 22px;
    background-position: 11px 11px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .answer { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 12px; }
  .answer .lead { font-family: var(--font-heading); font-weight: var(--fw-strong); color: var(--text-muted); white-space: nowrap; font-size: 0.95rem; }
  .answer math-field { flex: 1 1 auto; min-width: 0; }
  .status-dot {
    width: 34px; height: 34px; flex: none; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--bg-panel-2); color: var(--text-muted);
  }
  .status-dot svg { width: 20px; height: 20px; }
  .status-dot.ok { background: var(--mw-ok-fill); color: var(--mw-on-fill); box-shadow: 0 3px 0 var(--mw-ok-lip); animation: mw-pop 0.45s var(--ease-spring) both; }
  .status-dot.bad { background: var(--mw-bad-fill); color: var(--mw-on-fill); box-shadow: 0 3px 0 var(--mw-bad-lip); animation: mw-shake 0.45s ease-out both; }
  .status-dot.warn { background: var(--mw-gold-fill); color: var(--mw-on-fill); box-shadow: 0 3px 0 var(--mw-gold-lip); }

  .done {
    display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--mw-gold-fill) 18%, var(--bg-surface));
    border: 3px solid var(--mw-gold-fill);
    box-shadow: var(--press-1) var(--mw-gold-lip);
    animation: mw-pop 0.5s var(--ease-spring) both;
  }
  .done .flag { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: var(--mw-gold-fill); color: var(--mw-on-fill); box-shadow: 0 3px 0 var(--mw-gold-lip); }
  .done .flag svg { width: 24px; height: 24px; }
  .done .flag .flag-cloth { transform-origin: left center; animation: mw-wave 0.9s ease-in-out infinite; }
  .done-title { font-family: var(--font-heading); font-weight: var(--fw-strong); font-size: 1.05rem; }
  .stars { display: inline-flex; gap: 4px; }
  .star { width: 28px; height: 28px; color: var(--bg-panel-2); }
  .star.on { color: var(--mw-gold-fill); animation: mw-pop 0.5s var(--ease-spring) both; }
  .star.on:nth-child(2) { animation-delay: 0.15s; }
  .star.on:nth-child(3) { animation-delay: 0.3s; }
  .star path { stroke: var(--mw-gold-lip); stroke-width: 1.5; }
  .star:not(.on) path { stroke: var(--border-hover); }

  /* Plain look: a tick on the success colour, no pop and no stars (shapeBase.doneTpl). */
  :host([data-look="plain"]) .done { animation: none; background: color-mix(in srgb, var(--mw-ok-fill) 10%, var(--bg-surface)); border-color: var(--mw-ok-fill); box-shadow: none; }
  :host([data-look="plain"]) .done .flag { background: var(--mw-ok-fill); box-shadow: none; }

  @media (max-width: 520px) {
    .pad { padding: 12px 10px; border-radius: var(--radius-md); }
    math-field { font-size: 1.15rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .status-dot.ok, .status-dot.bad, .done, .done .flag .flag-cloth, .star.on { animation: none !important; }
  }
`;
