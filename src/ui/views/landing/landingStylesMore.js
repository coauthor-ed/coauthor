import { css } from 'lit';

/**
 * Styles for the live parts of <landing-view> (the real slide, the arcade
 * cabinet, the maths field) and the sections in landingMore.js. Same rules
 * as landingStyles.js: --landing-* tokens only; ambient loops only under
 * [data-live]; reveals through .rv; nothing moves under reduced motion.
 */
export const landingStylesMore = css`
  /* ---- stop 2: the real slide ------------------------------------------- */
  .screen.live { background: var(--landing-floe); }
  .screen.live .real {
    position: absolute; left: 0; top: 0; border: 0; display: block; background: transparent;
    width: 820px; height: 615px; transform-origin: 0 0; transform: scale(var(--k, 0.6));
    opacity: 0; pointer-events: none; transition: opacity 120ms;
  }
  .screen.live .real.on { opacity: 1; pointer-events: auto; }
  .device.turning { animation: turn 450ms cubic-bezier(0.45, 0, 0.3, 1); }
  @keyframes turn { 0% { transform: none; } 50% { transform: rotateY(90deg) scale(0.96); } 100% { transform: none; } }
  .read-ctl { display: flex; justify-content: center; margin-top: 22px; }
  .pill-btn {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    font: inherit; font-weight: 900; font-size: 0.95rem; padding: 10px 18px; border-radius: 999px;
    color: var(--landing-sky-top); background: var(--landing-explorer); border: 0;
    box-shadow: 0 4px 0 color-mix(in srgb, var(--landing-explorer) 55%, var(--landing-sky-top));
    transition: transform 80ms;
  }
  .pill-btn svg { width: 18px; height: 18px; }
  .pill-btn:active { transform: translateY(4px); box-shadow: none; }
  .lookswitch { display: inline-flex; padding: 5px; gap: 4px; border-radius: 999px; background: var(--landing-night-panel); border: 1.5px solid var(--landing-night-edge); }
  .lookswitch button {
    font: inherit; font-weight: 900; font-size: 0.92rem; cursor: pointer; padding: 8px 18px; border-radius: 999px; border: 0;
    color: var(--landing-on-night-soft); background: none;
  }
  .lookswitch button[aria-checked='true'] { color: var(--landing-sky-top); background: var(--landing-floe); box-shadow: 0 3px 0 var(--landing-floe-shade); }
  .lookswitch button:nth-child(2)[aria-checked='true'] { color: var(--landing-on-cta); background: var(--landing-dawn-2); box-shadow: 0 3px 0 var(--landing-dawn-1); }

  /* ---- stop 3: one big cabinet, the marquees are the tabs ---------------- */
  .arcade { width: min(820px, 100%); margin-top: 18px; display: flex; flex-direction: column; align-items: center; }
  .marquees { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: min(640px, 100%); position: relative; z-index: 2; }
  .mq {
    position: relative; cursor: pointer; font: inherit; text-align: center; color: inherit;
    padding: 16px 14px 12px; border-radius: 22px 22px 8px 8px; background: var(--landing-sky-top);
    border: 4px solid var(--cab); box-shadow: 0 6px 0 color-mix(in srgb, var(--cab) 55%, var(--landing-sky-top));
    transform: translateY(10px); opacity: 0.7; transition: transform 250ms var(--ease-spring), opacity 200ms;
  }
  .mq.catch { --cab: var(--landing-planet-b); }
  .mq.judge { --cab: var(--landing-aurora-3); }
  .mq[aria-selected='true'] { transform: none; opacity: 1; }
  .mq:hover { opacity: 1; }
  .mq b { display: block; font-family: var(--lv-display); font-weight: 700; font-size: clamp(1.15rem, 2.4vw, 1.5rem); line-height: 1.1; color: var(--landing-display-grad-1); }
  .mq small { display: block; margin-top: 3px; font-weight: 900; font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--landing-on-night-soft); }
  .mq .bulbs { opacity: 0.35; }
  .mq[aria-selected='true'] .bulbs { opacity: 0.9; }
  [data-live] .in .mq[aria-selected='true'] .bulbs { animation: chase 400ms steps(2) 0s 18; }
  .cab-big {
    --cab: var(--landing-planet-b);
    position: relative; width: 100%; margin-top: -4px; padding: 18px 46px 16px; box-sizing: border-box;
    border-radius: 22px 22px 30px 30px; background: var(--cab);
    box-shadow: inset 0 -12px 0 color-mix(in srgb, var(--cab) 60%, var(--landing-sky-top)), 0 50px 70px -40px var(--landing-sky-top), 0 0 110px -30px var(--landing-glow);
    transition: background 300ms;
  }
  .cab-big.judge { --cab: var(--landing-aurora-3); }
  .cab-side { position: absolute; top: 24px; bottom: 60px; width: 22px; border-radius: 12px; background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--cab) 55%, var(--landing-sky-top)) 0 14px, transparent 14px 26px); opacity: 0.8; }
  .cab-side.l { left: 12px; }
  .cab-side.r { right: 12px; }
  .cab-live {
    position: relative; border-radius: 18px; overflow: hidden;
    /* the game's 680x520 canvas plus its one-line caption: no jump while a game swaps.
       The ratio is a floor, not a fixed size: a spacer shares the grid cell with the
       game, so a narrow screen where the caption wraps grows the box instead of
       clipping the Play button. */
    display: grid; grid-template-columns: minmax(0, 1fr); min-height: 300px; --cab-ar: 680 / 580;
    background: var(--landing-sky-top); border: 5px solid var(--landing-sky-top);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--landing-on-night) 12%, transparent);
  }
  .cab-live::before { content: ''; grid-area: 1 / 1; aspect-ratio: var(--cab-ar); }
  .cab-mount { grid-area: 1 / 1; min-width: 0; }
  /* App tokens re-pointed at the night palette, so the mounted block and the
     maths field below sit in the sky instead of on app paper. */
  .cab-mount, .maths-try {
    --bg-base: var(--landing-sky-top);
    --bg-surface: color-mix(in srgb, var(--landing-sky-mid) 55%, var(--landing-sky-top));
    --bg-panel: color-mix(in srgb, var(--landing-sky-mid) 70%, var(--landing-sky-top));
    --bg-panel-2: var(--landing-sky-mid);
    --border-color: var(--landing-night-edge);
    --border-hover: color-mix(in srgb, var(--landing-on-night) 40%, transparent);
    --lip-color: var(--landing-sky-top);
    --text-main: var(--landing-on-night);
    --text-soft: var(--landing-on-night-soft);
    --text-muted: var(--landing-on-night-soft);
    --primary-color: var(--landing-explorer);
    --primary-hover: color-mix(in srgb, var(--landing-explorer) 60%, var(--landing-sky-top));
    --primary-light: color-mix(in srgb, var(--landing-explorer) 20%, transparent);
    --primary-text: var(--landing-explorer);
    --on-primary: var(--landing-sky-top);
    color: var(--landing-on-night);
  }
  .cab-wait { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 10px; font-weight: 800; color: var(--landing-on-night-soft); }
  .cab-big .deck { margin-top: 12px; }
  .cab-big .deck span { text-transform: none; letter-spacing: 0; font-size: 0.9rem; }
  .cab-note .for-gu { display: block; margin-top: 8px; font-size: 0.92rem; }
  .cab-note a { color: var(--landing-display-grad-1); font-weight: 800; display: inline-flex; align-items: center; gap: 6px; }
  .cab-note a svg { width: 16px; height: 16px; }

  /* ---- stop 5: your turn ---------------------------------------------- */
  .maths-try { margin: 26px 0 0; width: 100%; max-width: 520px; }
  .guide-link { display: inline-flex; align-items: center; gap: 8px; margin-top: 4px; font-weight: 800; color: var(--landing-explorer); }
  .guide-link svg { width: 18px; height: 18px; }

  /* ---- grown-ups: shared ------------------------------------------------- */
  .sec-head { display: flex; flex-direction: column; gap: 14px; max-width: 46rem; }
  .sec-head .kicker, .note-card .kicker { align-self: flex-start; }
  .sec-head.row { max-width: none; flex-direction: row; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
  .paper .sec-head .lede, .paper .note-card .lede { color: var(--landing-ink-soft); }
  .poster.small { font-size: clamp(1.8rem, 4.4vw, 3.4rem); margin: 0; }
  .ink-key { position: relative; color: var(--landing-grownup); white-space: nowrap; }
  .ink-key::after {
    content: ''; position: absolute; left: -2%; right: -2%; bottom: 0.02em; height: 0.2em; z-index: -1;
    background: color-mix(in srgb, var(--landing-dawn-2) 70%, transparent); transform: skewX(-12deg); border-radius: 4px;
  }
  .ink-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .ink-list li { position: relative; padding-left: 28px; line-height: 1.5; font-weight: 600; color: var(--landing-ink-soft); }
  .ink-list li b { color: var(--landing-ink); }
  .ink-list li::before { content: ''; position: absolute; left: 2px; top: 0.42em; width: 14px; height: 10px; border-left: 3px solid var(--landing-moss); border-bottom: 3px solid var(--landing-moss); transform: rotate(-45deg); }
  .ink-link { display: inline-flex; align-items: center; gap: 6px; font-weight: 900; color: var(--landing-grownup); text-underline-offset: 4px; }
  .ink-link svg { width: 17px; height: 17px; }
  .fr { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; line-height: 1; font-weight: 900; font-size: 0.82em; margin: 0 2px; }
  .fr > span + span { border-top: 2px solid currentColor; padding-top: 1px; }

  /* ---- three doorways ---------------------------------------------------- */
  .doors-sec { margin-top: clamp(80px, 10vw, 140px); }
  .doors { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(16px, 3vw, 40px); margin-top: 34px; }
  .door { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
  .frame {
    position: relative; width: min(190px, 100%); aspect-ratio: 5 / 7; perspective: 700px;
    border-radius: 999px 999px 8px 8px; background: var(--landing-paper-shadow);
    border: var(--lv-ink-w) solid var(--landing-ink); box-shadow: 6px 7px 0 var(--landing-paper-shadow);
  }
  .behind { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; display: grid; place-items: center; background: radial-gradient(circle at 50% 70%, var(--landing-dawn-3), var(--landing-dawn-2)); }
  .behind svg { width: 62%; fill: none; stroke: var(--landing-on-cta); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
  .leaf {
    position: absolute; inset: 0; border-radius: inherit; transform-origin: 0 50%;
    background: var(--door, var(--landing-grownup)); transition: transform 700ms var(--ease-spring);
  }
  .door:nth-child(1) .leaf { --door: var(--landing-cta); }
  .door:nth-child(2) .leaf { --door: var(--landing-moss); }
  .door:nth-child(3) .leaf { --door: var(--landing-author); }
  .leaf-art { position: absolute; inset: 0; width: 100%; height: 100%; }
  .leaf-art path { fill: none; stroke: color-mix(in srgb, var(--landing-ink) 70%, transparent); stroke-width: 3; vector-effect: non-scaling-stroke; }
  .leaf::before { content: ''; position: absolute; left: 22%; right: 22%; top: 14%; height: 22%; border-radius: 999px 999px 6px 6px; background: color-mix(in srgb, var(--landing-dawn-3) 55%, transparent); border: 2.5px solid color-mix(in srgb, var(--landing-ink) 70%, transparent); }
  .step-stone { display: block; width: min(220px, 112%); height: 14px; margin-top: -14px; border-radius: 6px; background: var(--landing-paper-shadow); border: 2.5px solid var(--landing-ink); }
  .knob { position: absolute; right: 14%; top: 56%; width: 12px; height: 12px; border-radius: 50%; background: var(--landing-dawn-2); border: 2px solid var(--landing-ink); }
  .door:hover .leaf { transform: rotateY(-14deg); }
  .door.open .leaf { transform: rotateY(-72deg); }
  .door:focus-visible .frame { outline: 3px solid var(--landing-grownup); outline-offset: 6px; }
  .plaque { display: flex; flex-direction: column; gap: 2px; }
  .plaque b { font-family: var(--lv-poster); font-weight: 400; font-size: 1.15rem; text-transform: uppercase; }
  .plaque small { color: var(--landing-ink-soft); font-weight: 700; font-size: 0.9rem; }
  .door.open .plaque b { color: var(--landing-grownup); }
  .door-panel { margin-top: 30px; padding: 24px clamp(18px, 3vw, 32px); border-radius: 20px; border: var(--lv-ink-w) dashed var(--landing-ink-soft); }
  .door-panel.on { border-style: solid; border-color: var(--landing-ink); background: var(--landing-paper-2); box-shadow: 8px 10px 0 var(--landing-paper-shadow); animation: panel-in 420ms var(--ease-settle); }
  @keyframes panel-in { from { opacity: 0; transform: translateY(14px); } }
  .door-wait { margin: 0; text-align: center; font-weight: 700; color: var(--landing-ink-soft); }
  .widget { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 26px; align-items: center; }
  .w-copy { display: flex; flex-direction: column; gap: 14px; }
  .w-q { margin: 0; font-family: var(--lv-display); font-weight: 600; font-size: 1.25rem; line-height: 1.35; }
  .w-big { margin: 0; font-family: var(--lv-display); font-weight: 700; font-size: 1.6rem; display: flex; align-items: center; gap: 8px; }
  .w-say { margin: 0; min-height: 1.5em; font-weight: 700; color: var(--landing-ink-soft); line-height: 1.5; }
  .w-opts { display: flex; flex-wrap: wrap; gap: 10px; }
  .ink-chip {
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font: inherit; font-weight: 800; font-size: 1rem;
    padding: 9px 15px; border-radius: 12px; color: var(--landing-ink); background: var(--landing-paper);
    border: 2.5px solid var(--landing-ink); box-shadow: 3px 4px 0 var(--landing-ink); transition: transform 80ms, box-shadow 80ms;
  }
  .ink-chip:active:not([disabled]) { transform: translate(3px, 4px); box-shadow: none; }
  .ink-chip[disabled] { opacity: 0.45; cursor: default; }
  .ink-chip.solid { background: var(--landing-moss); color: var(--landing-paper-2); }
  .ink-chip.right { background: var(--landing-moss); color: var(--landing-paper-2); animation: pop 420ms var(--ease-spring); }
  .ink-chip.wrong { background: color-mix(in srgb, var(--landing-grownup) 22%, var(--landing-paper)); animation: wobble 480ms ease-out; }
  .cup { width: min(200px, 100%); justify-self: center; overflow: visible; }
  .cup-glass { fill: color-mix(in srgb, var(--landing-author) 10%, var(--landing-paper)); stroke: var(--landing-ink); stroke-width: 3; stroke-linejoin: round; }
  .cup-milk { fill: var(--landing-floe); stroke: none; clip-path: inset(calc((1 - var(--f, 0.75)) * 100%) 0 0 0); transition: clip-path 900ms var(--ease-settle); }
  :host([data-theme='dark']) .cup-milk { fill: var(--landing-ink-soft); }
  .cup-tick { stroke: var(--landing-ink); stroke-width: 2.5; stroke-linecap: round; }
  .cup-lbl { font-family: var(--lv-display); font-weight: 700; font-size: 13px; fill: var(--landing-ink); text-anchor: middle; }
  .over { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; padding: 18px; border-radius: 16px; background: color-mix(in srgb, var(--landing-moss) 18%, var(--landing-paper)); border: 2.5px solid var(--landing-ink); }
  .ball { width: 38px; height: 38px; border-radius: 50%; background: var(--landing-paper-2); border: 2.5px solid var(--landing-ink); position: relative; transition: background 300ms, transform 300ms var(--ease-spring); }
  .ball::after { content: ''; position: absolute; inset: 7px 15px; border-left: 2px dashed color-mix(in srgb, var(--landing-ink) 40%, transparent); border-right: 2px dashed color-mix(in srgb, var(--landing-ink) 40%, transparent); }
  .ball.done { background: var(--landing-grownup); transform: rotate(40deg) scale(1.06); }
  .mbar { position: relative; display: flex; height: 76px; padding: 0; border-radius: 10px; overflow: hidden; background: var(--landing-paper); border: 2.5px solid var(--landing-ink); }
  .mbar.full { border-color: var(--landing-moss); box-shadow: 0 0 0 4px color-mix(in srgb, var(--landing-moss) 30%, transparent); }
  .mbar.over { border-color: var(--landing-grownup); }
  .mbar .bnote { flex: 0 0 calc(var(--w) / 8 * 100%); display: grid; place-items: center; font-size: 1.2rem; color: var(--landing-paper-2); background: var(--landing-author); border-right: 2px solid var(--landing-paper-2); animation: panel-in 300ms var(--ease-spring); }
  .mbar .bnote:nth-child(3n + 2) { background: var(--landing-moss); }
  .mbar .bnote:nth-child(3n) { background: var(--landing-cta); color: var(--landing-on-cta); }
  .mbar .beats { position: absolute; inset: auto 0 2px 0; display: grid; grid-template-columns: repeat(4, 1fr); pointer-events: none; }
  .mbar .beats i { font-style: normal; font-size: 0.7rem; font-weight: 900; text-align: center; color: var(--landing-ink-soft); opacity: 0.6; }

  /* ---- a commons, private by design ------------------------------------------ */
  .two-up { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(28px, 4vw, 56px); margin-top: clamp(90px, 10vw, 150px); align-items: start; }
  .note-card {
    position: relative; display: flex; flex-direction: column; gap: 16px; padding: 30px clamp(20px, 3vw, 32px) 28px;
    background: var(--landing-paper-2); border: var(--lv-ink-w) solid var(--landing-ink); border-radius: 6px 6px 20px 20px;
    box-shadow: 9px 11px 0 var(--landing-paper-shadow);
  }
  .note-card.commons { transform: rotate(-0.8deg); }
  .note-card.private { transform: rotate(0.9deg); margin-top: 36px; }
  .tree { width: 100%; height: auto; overflow: visible; }
  .t-branch, .t-back { fill: none; stroke: var(--landing-ink); stroke-width: 4; stroke-linecap: round; }
  .t-back { stroke-dasharray: 8 10; stroke: var(--landing-ink-soft); }
  .t-node circle { fill: var(--landing-moss); stroke: var(--landing-ink); stroke-width: 3; }
  .t-shelf path { fill: none; stroke: var(--landing-ink); stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
  .t-lbl { font-family: var(--lv-poster); font-size: 15px; fill: var(--landing-ink); text-transform: uppercase; }
  .t-card rect { fill: var(--landing-paper); stroke: var(--landing-ink); stroke-width: 3; }
  .t-card path { stroke: var(--landing-ink-soft); stroke-width: 3; stroke-linecap: round; }
  .t-card circle { fill: var(--landing-grownup); }
  .t-card { offset-rotate: 0deg; offset-distance: 100%; }
  .in .t-card.c1 { animation: ride 1.8s var(--ease-settle) 600ms both; }
  .in .t-card.c2 { animation: ride 1.8s var(--ease-settle) 2.2s both; }
  @keyframes ride { from { offset-distance: 0%; } to { offset-distance: 100%; } }
  .house-wrap { position: relative; width: min(320px, 100%); align-self: center; }
  .house { width: 100%; height: auto; overflow: visible; }
  .h-roof, .h-wall, .h-ground { fill: none; stroke: var(--landing-ink); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  .h-wall { fill: var(--landing-paper); }
  .h-win { fill: color-mix(in srgb, var(--landing-dawn-2) 40%, var(--landing-paper)); stroke: var(--landing-ink); stroke-width: 3; }
  .h-dev { fill: var(--landing-sky-top); stroke: var(--landing-ink); stroke-width: 2.5; }
  .h-bar { stroke: var(--landing-explorer); stroke-width: 4; stroke-linecap: round; }
  .h-door { fill: var(--landing-grownup); stroke: var(--landing-ink); stroke-width: 3; }
  .h-lock path { fill: none; stroke: var(--landing-ink); stroke-width: 3; }
  .h-lock rect { fill: var(--landing-dawn-2); stroke: var(--landing-ink); stroke-width: 2.5; }
  .stamp {
    position: absolute; right: -6px; top: 6px; padding: 6px 12px; border-radius: 8px; text-align: center;
    font-family: var(--lv-poster); font-size: 0.95rem; line-height: 1.15; text-transform: uppercase; color: var(--landing-grownup);
    border: 3px solid var(--landing-grownup); transform: rotate(10deg) scale(1); opacity: 0.9;
  }
  .in .stamp { animation: stamp 520ms cubic-bezier(0.3, 1.6, 0.5, 1) 900ms both; }
  @keyframes stamp { from { opacity: 0; transform: rotate(-8deg) scale(2.2); } to { opacity: 0.9; transform: rotate(10deg) scale(1); } }

  /* ---- the guides library ---------------------------------------------------- */
  .lib { margin-top: clamp(90px, 10vw, 150px); }
  .aud-chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .aud {
    font: inherit; font-weight: 900; cursor: pointer; padding: 9px 16px; border-radius: 999px;
    color: var(--landing-ink); background: var(--landing-paper-2); border: 2.5px solid var(--landing-ink);
  }
  .aud[aria-selected='true'] { background: var(--tone); color: var(--landing-paper-2); box-shadow: 3px 3px 0 var(--landing-ink); }
  .aud.tone-student[aria-selected='true'] { color: var(--landing-on-cta); }
  .tone-student { --tone: var(--landing-explorer); }
  .tone-parent { --tone: var(--landing-grownup); }
  .tone-author { --tone: var(--landing-author); }
  .lib-grid { list-style: none; margin: 36px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 30px 22px; }
  .gcard {
    position: relative; height: 100%; display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: inherit;
    padding: 28px 20px 18px 28px; border-radius: 6px 18px 18px 6px; background: var(--landing-paper-2);
    border: var(--lv-ink-w) solid var(--landing-ink); box-shadow: 5px 6px 0 var(--landing-paper-shadow);
    transition: transform var(--motion-base) var(--ease-spring), box-shadow var(--motion-base);
  }
  .gcard::before { content: ''; position: absolute; left: 13px; top: 0; bottom: 0; border-left: 2px solid color-mix(in srgb, var(--landing-grownup) 45%, transparent); }
  .gcard:hover, .gcard:focus-visible { transform: translateY(-4px) rotate(-0.4deg); box-shadow: 8px 11px 0 var(--landing-paper-shadow); }
  .gcard .tab { position: absolute; top: -15px; right: 18px; padding: 4px 12px 6px; border-radius: 10px 10px 4px 4px; font-size: 0.72rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; background: var(--tone); color: var(--landing-paper-2); border: 2px solid var(--landing-ink); transition: transform var(--motion-base) var(--ease-spring); }
  .gcard.tone-student .tab { color: var(--landing-on-cta); }
  .gcard:hover .tab { transform: translateY(-4px); }
  .gic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; color: var(--landing-ink); background: color-mix(in srgb, var(--tone) 26%, var(--landing-paper-2)); border: 2px solid var(--landing-ink); }
  .gic svg { width: 23px; height: 23px; }
  .gcard b { font-family: var(--lv-display); font-weight: 700; font-size: 1.25rem; line-height: 1.15; }
  .gsum { flex: 1; line-height: 1.5; color: var(--landing-ink-soft); font-weight: 600; }
  .gmeta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.82rem; font-weight: 800; color: var(--landing-ink-soft); }
  .gmeta span { display: inline-flex; align-items: center; gap: 4px; }
  .gmeta svg { width: 14px; height: 14px; }
  .gmeta .live { color: var(--landing-ink); background: color-mix(in srgb, var(--landing-explorer) 32%, transparent); padding: 0 8px; border-radius: 999px; }
  .pclip { position: absolute; left: 32px; top: -22px; width: 22px; height: 54px; }
  .pclip path { fill: none; stroke: var(--landing-ink-soft); stroke-width: 3; stroke-linecap: round; }
  .lib-all { margin-top: 30px; }

  /* ---- on the shelf ---------------------------------------------------------- */
  .shelf-sec { margin-top: clamp(80px, 9vw, 130px); }
  .bookshelf { position: relative; margin-top: 28px; padding: 0 16px; }
  .spines { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-end; gap: 6px; height: 230px; overflow-x: auto; }
  .spine {
    flex: 0 0 64px; height: var(--h); display: flex; flex-direction: column; justify-content: space-between; align-items: center;
    padding: 12px 6px; border-radius: 6px 6px 2px 2px; border: 2.5px solid var(--landing-ink); box-sizing: border-box;
    background: var(--sp); color: var(--landing-paper-2); transform-origin: 50% 100%; transition: transform 300ms var(--ease-spring);
  }
  .spine:hover { transform: rotate(-5deg); }
  .s-explorer { --sp: var(--landing-explorer); color: var(--landing-on-cta); }
  .s-grownup { --sp: var(--landing-grownup); }
  .s-author { --sp: var(--landing-author); }
  .s-moss { --sp: var(--landing-moss); }
  .s-cta { --sp: var(--landing-cta); color: var(--landing-on-cta); }
  .sp-title { writing-mode: vertical-rl; transform: rotate(180deg); font-family: var(--lv-display); font-weight: 700; font-size: 1rem; line-height: 1.1; max-height: 150px; overflow: hidden; }
  .sp-meta { font-size: 0.66rem; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; }
  .plank { display: block; height: 20px; margin: 0 -16px; border-radius: 4px; background: color-mix(in srgb, var(--landing-cta-lip) 70%, var(--landing-ink)); box-shadow: 0 10px 0 var(--landing-paper-shadow); }

  /* ---- footer: the night again -------------------------------------------------- */
  .foot {
    position: relative; isolation: isolate; overflow: hidden; color: var(--landing-on-night);
    background: linear-gradient(180deg, var(--landing-sky-low), var(--landing-sky-mid) 30%, var(--landing-sky-top) 80%);
    padding: clamp(80px, 10vw, 140px) 0 36px;
  }
  .foot::before { content: ''; position: absolute; left: 0; right: 0; top: -1px; height: 40px; z-index: 1; background: var(--landing-paper); clip-path: polygon(0 0, 100% 0, 100% 40%, 92% 75%, 84% 45%, 74% 80%, 64% 50%, 54% 85%, 44% 48%, 34% 78%, 24% 42%, 14% 74%, 6% 46%, 0 70%); }
  .foot-sky { position: absolute; inset: 0; z-index: -1; }
  .foot-sky svg { width: 100%; height: 100%; display: block; }
  .foot .tw g { animation: twinkle 3.6s ease-in-out infinite; animation-play-state: paused; transform-box: fill-box; transform-origin: center; }
  .foot[data-live] .tw g { animation-play-state: running; }
  /* The group itself also takes .tw's twinkle (landingStyles.js): gated the
     same way, or it ran off-screen for the life of the page (Q-56). */
  .foot .tw { animation-play-state: paused; }
  .foot[data-live] .tw { animation-play-state: running; }
  .foot .spk { fill: var(--landing-star); }
  .foot-main { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: clamp(24px, 5vw, 70px); align-items: center; }
  .foot-quill { position: relative; display: flex; flex-direction: column; align-items: center; }
  .foot-quill quill-mascot { --quill-size: clamp(120px, 14vw, 180px); margin-bottom: -14px; position: relative; z-index: 1; }
  .foot-floe { width: clamp(160px, 18vw, 230px); height: 30px; border-radius: 14px 14px 40px 40px; background: var(--landing-floe); box-shadow: inset 0 -9px 0 var(--landing-floe-shade), 0 18px 40px -10px var(--landing-sky-top); }
  .foot-copy h2 { font-size: clamp(2.2rem, 6vw, 4.4rem); }
  .foot-copy .actions { margin-top: 28px; justify-content: flex-start; }
  .foot-base { margin-top: clamp(60px, 8vw, 100px); padding-top: 24px; border-top: 1.5px solid var(--landing-night-edge); display: flex; flex-direction: column; gap: 10px; }
  .foot-base nav { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-bottom: 6px; }
  .foot-base nav a { display: inline-flex; align-items: center; gap: 6px; color: var(--landing-on-night); font-weight: 800; text-decoration: none; }
  .foot-base nav a:hover { text-decoration: underline; text-underline-offset: 4px; }
  .foot-base nav svg { width: 17px; height: 17px; }
  .foot-base .fine { margin: 0; font-size: 0.86rem; line-height: 1.55; color: var(--landing-on-night-soft); max-width: 60em; text-align: left; }
  .foot-base .fine a { color: var(--landing-on-night); }

  /* ---- responsive ------------------------------------------------------------- */
  @media (max-width: 960px) {
    .two-up { grid-template-columns: minmax(0, 1fr); }
    .note-card.private { margin-top: 0; }
    .lib-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .widget { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 560px) {
    .ink-key { white-space: normal; }
    .cab-big { padding: 10px 8px 12px; border-radius: 16px 16px 22px 22px; }
    .cab-side { display: none; }
    .cab-live { border-width: 3px; border-radius: 12px; min-height: 220px; --cab-ar: 680 / 610; }
    .mq { padding: 12px 8px 10px; }
    .doors { gap: 10px; }
    .plaque small { display: none; }
    .plaque b { font-size: 0.9rem; }
    .lib-grid { grid-template-columns: minmax(0, 1fr); }
    .foot-main { grid-template-columns: minmax(0, 1fr); justify-items: center; text-align: center; }
    .foot-copy .actions { justify-content: center; }
    .note-card.commons, .note-card.private { transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .device.turning { animation: none; }
    .t-card { animation: none !important; offset-distance: 100%; }
    .stamp { animation: none !important; }
    .leaf { transition: none; }
    .cup-milk { transition: none; }
    [data-live] .in .mq .bulbs { animation: none; }
  }
`;
