import { css } from 'lit';

/**
 * Styles for <landing-view>. Colours come only from --landing-* tokens in
 * theme.css. Scroll-linked parts read one custom property set from JS:
 * --sy on the hero (pixels scrolled), --p on the hand-off (0 to 1).
 */
export const landingStyles = css`
  :host {
    display: block;
    position: relative;
    font-family: 'Nunito', system-ui, sans-serif;
    color: var(--landing-on-night);
    background: var(--landing-sky-top);
    --lv-gutter: 16px;
    --lv-max: 1220px;
    --lv-bar-h: 64px;
    --lv-ink-w: 2.5px;
    --lv-rise: 22px;
    --lv-display: 'Fredoka', 'Nunito', sans-serif;
    --lv-poster: 'Dela Gothic One', 'Fredoka', sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .wrap { width: min(var(--lv-max), 100% - 2 * var(--lv-gutter)); margin-inline: auto; }
  button { font-family: inherit; }
  :focus-visible { outline: 3px solid var(--landing-explorer); outline-offset: 3px; }
  .paper :focus-visible { outline-color: var(--landing-grownup); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  /* ---- scroll progress + top bar ------------------------------------ */
  .progress {
    position: fixed; inset: 0 0 auto 0; height: 4px; z-index: 60;
    transform-origin: 0 50%;
    transform: scaleX(var(--lv-progress, 0));
    background: linear-gradient(90deg, var(--landing-explorer), var(--landing-aurora-2), var(--landing-dawn-1), var(--landing-display-grad-3));
    pointer-events: none;
  }
  .bar-slot { position: sticky; top: 0; z-index: 50; height: 0; }
  .bar {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
    width: min(var(--lv-max), 100% - 2 * var(--lv-gutter));
    height: var(--lv-bar-h);
    display: flex; align-items: center; gap: 10px;
    padding: 0 10px 0 12px;
    border-radius: 22px;
    background: color-mix(in srgb, var(--landing-sky-top) 92%, transparent);
    border: 1.5px solid var(--landing-night-edge);
    box-shadow: 0 12px 30px -14px var(--landing-sky-top);
    transition: background var(--motion-base), border-color var(--motion-base), color var(--motion-base);
  }
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .bar {
      background: color-mix(in srgb, var(--landing-sky-top) 62%, transparent);
      -webkit-backdrop-filter: blur(14px) saturate(1.3);
      backdrop-filter: blur(14px) saturate(1.3);
    }
  }
  :host([data-bar='paper']) .bar {
    background: var(--landing-paper-2);
    border: var(--lv-ink-w) solid var(--landing-ink);
    box-shadow: 4px 5px 0 var(--landing-paper-shadow);
    color: var(--landing-ink);
    -webkit-backdrop-filter: none; backdrop-filter: none;
  }
  .logo {
    display: flex; align-items: center; gap: 10px;
    font-family: var(--lv-display); font-weight: 700; font-size: 1.3rem;
    color: inherit; text-decoration: none; margin-right: auto; white-space: nowrap;
    background: none; border: 0; padding: 4px; cursor: pointer;
  }
  .logo coauthor-logo { --logo-size: 38px; }
  .bar nav { display: flex; gap: 2px; }
  .bar nav button {
    display: inline-flex; align-items: center; gap: 6px;
    background: none; border: 0; color: inherit; opacity: 0.86;
    font-weight: 800; font-size: 0.92rem; padding: 8px 12px; border-radius: 999px; cursor: pointer;
  }
  .bar nav button svg { width: 17px; height: 17px; }
  .bar nav button:hover { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); }
  .icon-btn {
    display: grid; place-items: center; width: 42px; height: 42px; flex: none;
    border-radius: 14px; cursor: pointer; color: inherit;
    background: color-mix(in srgb, currentColor 8%, transparent);
    border: 1.5px solid color-mix(in srgb, currentColor 26%, transparent);
  }
  .icon-btn:active { transform: translateY(2px); }
  /* Same spin-in as the app bar's theme toggle (AppShell .icon-btn.spin). */
  .icon-btn { overflow: hidden; }
  .icon-btn.spin svg { animation: icon-spin 450ms cubic-bezier(0.2, 1.3, 0.4, 1); }
  @keyframes icon-spin { from { transform: rotate(-100deg) scale(0.6); } to { transform: none; } }

  /* Flat chips with a lip (house look): never gloss. */
  .cta {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    font-family: var(--lv-display); font-weight: 700; font-size: 1.12rem; letter-spacing: 0.01em;
    padding: 15px 26px; border-radius: 18px; border: 0; cursor: pointer; text-decoration: none; white-space: nowrap;
    background: var(--landing-cta); color: var(--landing-on-cta);
    box-shadow: 0 6px 0 var(--landing-cta-lip);
    transition: transform 80ms, box-shadow 80ms, filter var(--motion-fast);
  }
  .cta svg { transition: transform var(--motion-base) var(--ease-spring); }
  .cta:hover { filter: brightness(1.06); }
  .cta:hover svg { transform: translateX(4px); }
  .cta:active { transform: translateY(6px); box-shadow: 0 0 0 var(--landing-cta-lip); }
  .cta.ghost {
    background: color-mix(in srgb, var(--landing-sky-top) 40%, transparent);
    color: var(--landing-on-night);
    box-shadow: 0 6px 0 color-mix(in srgb, var(--landing-on-night) 30%, transparent), inset 0 0 0 2px color-mix(in srgb, var(--landing-on-night) 45%, transparent);
  }
  .cta.ghost:active { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--landing-on-night) 45%, transparent); }
  .cta.small { font-size: 0.95rem; padding: 10px 16px; border-radius: 13px; box-shadow: 0 4px 0 var(--landing-cta-lip); }
  .cta.small:active { transform: translateY(4px); }
  .cta.big { font-size: clamp(1.15rem, 2.4vw, 1.5rem); padding: 20px 34px; border-radius: 22px; box-shadow: 0 7px 0 var(--landing-cta-lip); }

  /* ---- shared type ---------------------------------------------------- */
  .kicker {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 14px 7px 10px; border-radius: 999px;
    font-weight: 900; font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--landing-explorer);
    background: color-mix(in srgb, var(--landing-explorer) 14%, var(--landing-sky-top));
    border: 1.5px solid color-mix(in srgb, var(--landing-explorer) 45%, transparent);
  }
  .kicker svg { width: 16px; height: 16px; }
  .display {
    font-family: var(--lv-display); font-weight: 700;
    letter-spacing: -0.025em; line-height: 1; margin: 0;
    text-wrap: balance;
  }
  /* The key phrase: a gradient fill, a brush swash painted under it from
     left to right, and a sparkle that pops at its end. The swash is one
     tapered stroke (assets/landing/swash.svg, same-origin: the CSP img-src
     blocks data: URIs) used as a mask stretched to the phrase, so it never
     tiles or clips; the paint underneath is the same token gradient as the
     text, so it changes with the theme. */
  .key {
    position: relative; display: inline-block; white-space: nowrap;
    background: linear-gradient(95deg, var(--landing-display-grad-1), var(--landing-display-grad-2) 48%, var(--landing-display-grad-3));
    -webkit-background-clip: text; background-clip: text;
    color: transparent;
    padding: 0 0.04em 0.08em;
    text-shadow: none;
    --swash: linear-gradient(90deg, var(--landing-display-grad-1), var(--landing-display-grad-2) 55%, var(--landing-display-grad-3));
    --gleam: var(--landing-display-grad-1);
  }
  .key::after {
    content: ''; position: absolute; left: -1%; right: -3%; bottom: -0.1em; height: 0.24em;
    background: var(--swash);
    -webkit-mask: url('assets/landing/swash.svg') no-repeat 0 0 / 100% 100%;
    mask: url('assets/landing/swash.svg') no-repeat 0 0 / 100% 100%;
    opacity: 0.92;
    pointer-events: none;
  }
  .key::before {
    content: ''; position: absolute; right: -0.2em; top: -0.12em; width: 0.3em; height: 0.3em;
    background: var(--gleam);
    clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
    transform: scale(0); pointer-events: none;
  }
  .in .key::after, .hero .key::after { animation: swash-in 760ms cubic-bezier(0.65, 0, 0.25, 1) 480ms both; }
  .in .key::before, .hero .key::before { animation: gleam-pop 900ms var(--ease-spring) 1150ms both; }
  .hero[data-live] .key::before { animation: gleam-pop 900ms var(--ease-spring) 1150ms both, gleam-twinkle 5.2s ease-in-out 2.4s infinite; }
  @keyframes swash-in {
    from { clip-path: inset(0 100% 0 0); transform: translateY(0.04em) skewX(-8deg); }
    to { clip-path: inset(0 0 0 0); transform: none; }
  }
  @keyframes gleam-pop {
    0% { transform: scale(0) rotate(-90deg); }
    60% { transform: scale(1.35) rotate(10deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
  @keyframes gleam-twinkle {
    0%, 82%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
    88% { transform: scale(0.45) rotate(45deg); opacity: 0.6; }
    94% { transform: scale(1.25) rotate(90deg); opacity: 1; }
  }
  .lede { font-size: clamp(1.05rem, 1.6vw, 1.22rem); line-height: 1.6; color: var(--landing-on-night-soft); margin: 0; max-width: 34em; }
  .lede b { color: var(--landing-on-night); font-weight: 800; }

  /* Reveal: once per block, 520 ms rise, 70 ms stagger. */
  .rv { opacity: 0; transform: translateY(var(--lv-rise)); }
  .in .rv, .in.rv {
    opacity: 1; transform: none;
    transition: opacity 520ms var(--ease-settle) calc(var(--i, 0) * 70ms), transform 620ms var(--ease-settle) calc(var(--i, 0) * 70ms);
  }

  /* Ambient loops: paused unless their section is on screen. */
  .amb { animation-play-state: paused !important; }
  [data-live] .amb { animation-play-state: running !important; }
  .typing i, .tip svg { animation-play-state: paused; }
  [data-live] .typing i, [data-live] .tip svg { animation-play-state: running; }

  /* ---- night: sky layers --------------------------------------------- */
  .night { position: relative; isolation: isolate; }
  .layer { position: absolute; inset: -14px; width: calc(100% + 28px); height: calc(100% + 28px); pointer-events: none; }
  .layer svg { width: 100%; height: 100%; display: block; }
  .stars { fill: var(--landing-star); }
  .s-a1 { stop-color: var(--landing-aurora-1); }
  .s-a2 { stop-color: var(--landing-aurora-2); }
  .s-a3 { stop-color: var(--landing-aurora-3); }
  .s-star { stop-color: var(--landing-star); }
  .s-sea { stop-color: var(--landing-sea); }
  .s-sea-deep { stop-color: var(--landing-sea-deep); }
  .s-floe-shade { stop-color: var(--landing-floe-shade); }
  .s-berg { stop-color: var(--landing-berg); }

  .tw { fill: var(--landing-star); transform-box: fill-box; transform-origin: center; animation: twinkle 3.6s ease-in-out infinite; }
  @keyframes twinkle { 0%, 100% { opacity: 0.25; transform: scale(0.55); } 50% { opacity: 1; transform: scale(1); } }
  .aurora { animation: aurora 40s ease-in-out infinite alternate; }
  @keyframes aurora { from { transform: translateX(-50px) skewX(-2deg); } to { transform: translateX(60px) skewX(3deg); } }
  .comet { opacity: 0; animation: comet 9s linear 2s infinite; }
  @keyframes comet {
    0% { opacity: 0; transform: translate(0, 0); }
    2% { opacity: 1; }
    13% { opacity: 0; transform: translate(-520px, 270px); }
    100% { opacity: 0; transform: translate(-520px, 270px); }
  }
  .planet-a { fill: var(--landing-planet-a); }
  .planet-a-band { fill: color-mix(in srgb, var(--landing-planet-a) 70%, var(--landing-planet-rim)); }
  .planet-a-shade { fill: color-mix(in srgb, var(--landing-planet-a) 58%, var(--landing-sky-top)); }
  .planet-b { fill: var(--landing-planet-b); }
  .planet-b-shade { fill: color-mix(in srgb, var(--landing-planet-b) 58%, var(--landing-sky-top)); }
  .planet-c { fill: var(--landing-display-grad-1); }
  .planet-c-shade { fill: color-mix(in srgb, var(--landing-display-grad-1) 62%, var(--landing-sky-top)); }
  .rim { fill: none; stroke: var(--landing-planet-rim); stroke-width: 4; stroke-linecap: round; }
  .ring { fill: none; stroke: var(--landing-planet-rim); stroke-width: 7; opacity: 0.85; }
  .moon { fill: var(--landing-floe-shade); }
  .berg { fill: var(--landing-berg); }
  .berg-lit { fill: color-mix(in srgb, var(--landing-berg) 55%, var(--landing-floe)); }
  .glint { fill: var(--landing-aurora-1); opacity: 0.35; }
  .glint-w { fill: var(--landing-star); opacity: 0.22; }

  /* ---- hero: a deep, layered scene ------------------------------------
     Each layer slides down at its own fraction of the scroll, so the far
     sky drifts slowest and the headline sinks behind the foreground ice.
     The pointer adds up to 12 px of sideways depth on fine pointers. */
  .hero {
    position: relative; overflow: hidden; isolation: isolate;
    min-height: max(720px, 100svh);
    display: flex; flex-direction: column;
    background: linear-gradient(180deg, var(--landing-sky-top) 0%, var(--landing-sky-mid) 52%, var(--landing-sky-low) 74%, var(--landing-sky-low) 100%);
    --sy: 0;
  }
  .hero .layer { will-change: transform; }
  .layer .px { width: 100%; height: 100%; transition: transform 600ms var(--ease-settle); }
  .l-far { transform: translate3d(0, calc(var(--sy) * 0.55px), 0); }
  .l-planets { transform: translate3d(0, calc(var(--sy) * 0.42px), 0); }
  .l-bergs { transform: translate3d(0, calc(var(--sy) * 0.22px), 0); }
  .l-far .px { transform: translate(calc(var(--mx, 0) * 4px), calc(var(--my, 0) * 3px)); }
  .l-planets .px { transform: translate(calc(var(--mx, 0) * 8px), calc(var(--my, 0) * 5px)); }
  .l-bergs .px { transform: translate(calc(var(--mx, 0) * 12px), calc(var(--my, 0) * 2px)); }

  .hero-copy {
    position: relative; z-index: 3; flex: 1 0 auto;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
    gap: 18px;
    padding: calc(var(--lv-bar-h) + 40px) 0 28px;
    transform: translate3d(0, calc(var(--sy) * 0.36px), 0);
    opacity: clamp(0, calc(1 - var(--sy) / 520), 1);
  }
  .free-pill {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 8px 16px 8px 12px; border-radius: 999px; line-height: 1.3;
    background: color-mix(in srgb, var(--landing-explorer) 12%, var(--landing-sky-top));
    border: 1.5px solid color-mix(in srgb, var(--landing-explorer) 40%, transparent);
    color: var(--landing-on-night); font-weight: 800; font-size: 0.86rem;
  }
  .free-pill .dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--landing-explorer); box-shadow: 0 0 0 4px color-mix(in srgb, var(--landing-explorer) 25%, transparent); }
  .mega {
    font-size: clamp(3.1rem, 9.6vw, 8.8rem); line-height: 0.92; letter-spacing: -0.035em;
    color: var(--landing-on-night);
    text-shadow: 0 6px 40px color-mix(in srgb, var(--landing-sky-top) 70%, transparent);
  }
  .mega .line { display: block; }
  .mega .key { text-shadow: none; }
  /* Letters drop in one by one on the first line. */
  .mega .ch { display: inline-block; animation: drop-in 700ms var(--ease-spring) both; animation-delay: calc(120ms + var(--c) * 45ms); }
  @keyframes drop-in { from { opacity: 0; transform: translateY(-0.5em) rotate(-8deg); } to { opacity: 1; transform: none; } }
  .mega .key { animation: rise-in 800ms var(--ease-settle) 520ms both; }
  @keyframes rise-in { from { opacity: 0; transform: translateY(0.3em) scale(0.96); } to { opacity: 1; transform: none; } }
  /* The swash hangs below the key line; the lede keeps clear of it. */
  .hero .lede { text-align: center; max-width: 36em; margin-top: clamp(14px, 2.2vw, 30px); }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px 16px; align-items: center; }

  /* Foreground ice, in front of the headline. */
  .fore { position: relative; z-index: 4; height: clamp(170px, 23vh, 240px); flex: none; }
  .ledge { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .ice-top { fill: var(--landing-floe); }
  .ice-crack { fill: none; stroke: var(--landing-floe-shade); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .ice-mound { fill: var(--landing-floe); }
  .ice-streak { fill: none; stroke: var(--landing-floe); stroke-width: 2; stroke-linecap: round; opacity: 0.25; vector-effect: non-scaling-stroke; }
  .ripple { fill: none; stroke: var(--landing-floe); stroke-width: 2; stroke-linecap: round; opacity: 0.4; vector-effect: non-scaling-stroke; }

  /* The signpost: the two tracks, painted on boards. Its foot sits on the
     left ledge's flat top (y 70 of 300 in iceLedge()). */
  .post {
    position: absolute; left: 13%; top: 27%; transform: translate(-50%, -100%);
    display: flex; flex-direction: column; align-items: center;
  }
  .pole { width: 12px; height: 46px; border-radius: 4px 4px 0 0; background: var(--landing-floe-shade); order: 3; }
  .post .snow { order: 0; width: 26px; height: 12px; border-radius: 12px 12px 4px 4px; background: var(--landing-floe); margin-bottom: -4px; position: relative; z-index: 1; }
  /* Each board is nailed to the pole (transform-origin at the pole, which
     is the board's centre less its sideways offset). Hover or focus lifts its tip on a damped spring and slides it out
     a little; leaving settles it back on a softer spring. The tilt lives in
     rotate, the slide in translate, so neither fights the other. The
     linear() springs fall back to plain eases where unsupported. */
  .board {
    --accent: var(--landing-explorer);
    --swing-in: cubic-bezier(0.22, 1.4, 0.36, 1);
    --swing-in: linear(0, 0.112, 0.386, 0.724, 1.039, 1.268, 1.384, 1.39, 1.311, 1.185, 1.05, 0.937, 0.866, 0.84, 0.855, 0.897, 0.951, 1.002, 1.04, 1.061, 1.063, 1.051, 1.032, 1.01, 0.991, 0.979, 0.975, 0.976, 0.983, 0.991, 1, 1.006, 1.01, 1.01, 1.008, 1.005, 1);
    --swing-out: cubic-bezier(0.22, 1, 0.36, 1);
    --swing-out: linear(0, 0.133, 0.405, 0.682, 0.895, 1.026, 1.085, 1.094, 1.076, 1.049, 1.024, 1.006, 0.995, 0.991, 0.991, 0.993, 0.996, 0.998, 1, 1.001, 1.001, 1.001, 1.001, 1, 1);
    --tilt: -4deg; --lift: -5deg; --slide: 8px;
    position: relative; display: grid; grid-template-columns: 48px auto; align-items: center; gap: 10px;
    width: max-content; min-width: 236px; text-align: left; cursor: pointer;
    padding: 9px 40px 9px 10px; margin: 0;
    color: var(--landing-sky-top); background: var(--landing-floe);
    border: 0; border-radius: 12px;
    clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 50%, calc(100% - 26px) 100%, 0 100%);
    box-shadow: inset 0 -5px 0 var(--landing-floe-shade);
    --off: 18px;
    position: relative; z-index: 2;
    transform-origin: calc(50% - var(--off)) 50%;
    transform: rotate(var(--tilt));
    rotate: 0deg; translate: 0 0;
    transition: rotate 700ms var(--swing-out), translate 520ms var(--swing-out), background-color 300ms ease;
  }
  .board:hover, .board:focus-visible {
    rotate: var(--lift); translate: var(--slide) 0;
    background: color-mix(in srgb, var(--accent) 16%, var(--landing-floe));
    transition: rotate 1100ms var(--swing-in), translate 600ms var(--swing-out), background-color 240ms ease;
  }
  .board:focus-visible { outline-offset: 5px; }
  .board.ex { --slide: 8px; translate: 18px 0; order: 1; }
  .board.ex:hover, .board.ex:focus-visible { translate: 26px 0; }
  .board.gu {
    --accent: var(--landing-dawn-1); --tilt: 3deg; --lift: 5deg;
    order: 2; margin-top: 6px; translate: -10px 0; --off: -10px;
    grid-template-columns: auto 48px; padding: 9px 10px 9px 40px;
    clip-path: polygon(26px 0, 100% 0, 100% 100%, 26px 100%, 0 50%);
  }
  .board.gu:hover, .board.gu:focus-visible { translate: -18px 0; }
  .board.gu .spot { order: 2; }
  .board.gu .b-text { text-align: right; }
  /* The sign's picture answers the hover: the telescope tips up to the
     sky, the nib scribbles. */
  .board .spot { transition: scale 600ms var(--swing-in), background-color 300ms ease; }
  .board .spot svg { transition: rotate 700ms var(--swing-out); }
  .board:hover .spot, .board:focus-visible .spot { scale: 1.08; background: color-mix(in srgb, var(--accent) 48%, var(--landing-floe)); }
  .board.ex:hover .spot svg, .board.ex:focus-visible .spot svg { rotate: -14deg; transition: rotate 900ms var(--swing-in); }
  .board.gu:hover .spot svg, .board.gu:focus-visible .spot svg { animation: nib-scribble 900ms ease-in-out; }
  @keyframes nib-scribble {
    0%, 100% { translate: 0 0; rotate: 0deg; }
    20% { translate: -3px 1px; rotate: -8deg; }
    40% { translate: 2px -1px; rotate: 6deg; }
    60% { translate: -2px 1px; rotate: -5deg; }
    80% { translate: 1px 0; rotate: 3deg; }
  }
  .board .spot { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 30%, var(--landing-floe)); }
  .board .spot svg { width: 38px; height: 38px; overflow: visible; }
  .board .who { display: block; font-size: 0.68rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: var(--landing-sky-mid); }
  .board .name { display: block; font-family: var(--lv-display); font-weight: 700; font-size: 1.22rem; line-height: 1.1; }
  .t-tube { fill: var(--landing-sky-mid); }
  .t-cap { fill: var(--landing-sky-top); }
  .board .t-cap { fill: var(--landing-sky-top); }
  .t-legs { stroke: var(--landing-sky-mid); stroke-width: 3; stroke-linecap: round; fill: none; }
  .t-star { fill: var(--landing-cta); }
  .t-lines { stroke: var(--landing-floe); stroke-width: 2.5; stroke-linecap: round; fill: none; }
  .n-nib { fill: var(--landing-cta); }
  .n-slit { stroke: var(--landing-sky-top); stroke-width: 2; }
  .n-hole { fill: var(--landing-sky-top); }

  /* Quill on the right ledge (flat top at y 64 of 300). His feet are at
     y 276 of the rig's 300-unit box, 0.1 x --quill-size above its bottom. */
  .q-stand {
    position: absolute; left: 86%; top: 27%;
    transform: translate(-50%, calc(-100% + var(--quill-size) * 0.1));
    --quill-size: clamp(150px, 16vw, 224px);
  }
  .q-stand .shadow { position: absolute; left: 50%; bottom: calc(var(--quill-size) * 0.075); width: 58%; height: calc(var(--quill-size) * 0.06); transform: translateX(-50%); border-radius: 50%; background: var(--landing-floe-shade); opacity: 0.8; }
  .quill-btn { all: unset; position: relative; z-index: 2; display: block; line-height: 0; cursor: pointer; border-radius: 40%; }
  .quill-btn:focus-visible { outline: 3px solid var(--landing-explorer); outline-offset: -10px; }
  .q-stand quill-mascot { --quill-size: inherit; }
  /* Idle life (heroQuill.js): .q-body takes his one-off moves (a weight
     shift, the lean and gulp of the fish egg); .q-breath breathes slowly
     while the hero is on screen. Both pivot on his feet. */
  .q-body, .q-breath { display: block; line-height: 0; transform-origin: 50% 92%; }
  .q-breath { animation: q-breathe 3.8s ease-in-out infinite; }
  @keyframes q-breathe { 0%, 100% { transform: none; } 50% { transform: scale(1.012, 0.985); } }
  .bubble.pop { animation: bubble-pop 420ms var(--ease-spring); }
  @keyframes bubble-pop { from { transform: scale(0.82); } to { transform: none; } }

  /* Easter eggs: the water throws a fish to Quill, the moon goes round its
     planet, and the Konami code sends a meteor shower. The headline column
     lets taps through to the sky behind it. */
  .hero-copy { pointer-events: none; }
  .hero-copy > * { pointer-events: auto; }
  .moon-hit { pointer-events: auto; cursor: pointer; }
  .moon-hit .hit { fill: transparent; }
  .fish-btn {
    position: absolute; z-index: 2; left: 47.5%; top: 34%; width: 13%; height: 40%;
    background: none; border: 0; padding: 0; cursor: pointer; border-radius: 40%;
  }
  .fish-btn::after {
    content: ''; position: absolute; left: 50%; top: 62%; width: 46px; height: 12px; margin: -6px 0 0 -23px;
    border-radius: 50%; border: 2px solid var(--landing-floe); opacity: 0;
  }
  .fish-btn:hover::after, .fish-btn:focus-visible::after { animation: ripple 1.2s ease-out infinite; }
  @keyframes ripple { from { opacity: 0.7; transform: scale(0.4); } to { opacity: 0; transform: scale(1.6); } }
  .fish-fly { position: absolute; z-index: 6; left: 0; top: 0; width: clamp(36px, 3.6vw, 54px); aspect-ratio: 34 / 20; opacity: 0; pointer-events: none; }
  .fish-fly svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .shower { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
  .shower i {
    position: absolute; left: var(--x); top: var(--y); width: calc(var(--w) * 1.3); height: 4px; border-radius: 4px;
    box-shadow: 0 0 12px color-mix(in srgb, var(--landing-star) 55%, transparent);
    background: linear-gradient(90deg, var(--landing-star), color-mix(in srgb, var(--landing-aurora-2) 60%, transparent) 30%, transparent);
    rotate: -27deg; transform-origin: 0 50%; opacity: 0;
  }
  .hero.showering .shower i { animation: meteor 1.1s cubic-bezier(0.3, 0, 0.8, 0.6) calc(var(--d) * 0.8) both; }
  @keyframes meteor {
    0% { opacity: 0; translate: 0 0; }
    10% { opacity: 1; }
    75% { opacity: 0.9; }
    100% { opacity: 0; translate: -480px 250px; }
  }
  .bubble {
    position: absolute; z-index: 3; bottom: calc(100% - var(--quill-size) * 0.12); left: 50%; translate: -50% 0;
    width: max-content; max-width: 220px;
    background: var(--landing-floe); color: var(--landing-sky-top);
    font-family: var(--lv-display); font-weight: 600; font-size: 1.02rem; line-height: 1.3;
    padding: 12px 16px; border-radius: 20px; margin: 0;
    box-shadow: 0 5px 0 var(--landing-floe-shade), 0 18px 30px -12px var(--landing-sky-top);
    animation: bubble-in 520ms var(--ease-spring) 1300ms both;
  }
  .bubble::after {
    content: ''; position: absolute; left: 50%; bottom: -12px; width: 22px; height: 14px; margin-left: -11px;
    background: var(--landing-floe); clip-path: polygon(0 0, 100% 0, 40% 100%);
  }
  @keyframes bubble-in { from { opacity: 0; transform: translateY(8px) scale(0.85); } to { opacity: 1; transform: none; } }
  /* A fish jumps in the channel now and then. */
  .fish { position: absolute; left: 54.5%; top: 42%; width: 34px; height: 20px; }
  .fish svg { width: 100%; height: 100%; overflow: visible; display: block; }
  .fish-body { fill: var(--landing-aurora-2); }
  .fish-eye { fill: var(--landing-sky-top); }
  .fish .arc { animation: fish-jump 7s cubic-bezier(0.3, 0, 0.6, 1) 3s infinite; opacity: 0; transform-origin: 50% 50%; }
  @keyframes fish-jump {
    0% { opacity: 0; transform: translate(-30px, 30px) rotate(-60deg); }
    2% { opacity: 1; }
    7% { transform: translate(0, -46px) rotate(0deg); }
    12% { opacity: 1; transform: translate(30px, 30px) rotate(70deg); }
    13%, 100% { opacity: 0; transform: translate(30px, 30px) rotate(70deg); }
  }
  .scroll-cue {
    position: absolute; z-index: 5; left: 50%; bottom: 18px; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 8px;
    font-weight: 900; font-size: 0.74rem; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--landing-on-night-soft); background: none; border: 0; cursor: pointer;
  }
  .scroll-cue span { display: block; width: 20px; height: 30px; border-radius: 12px; border: 2px solid currentColor; position: relative; }
  .scroll-cue span::after { content: ''; position: absolute; left: 50%; top: 6px; width: 4px; height: 6px; margin-left: -2px; border-radius: 2px; background: currentColor; animation: cue 1.8s ease-in-out infinite; }
  @keyframes cue { 0% { opacity: 0; transform: translateY(0); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(10px); } }

  /* ---- explorers: the star route ---------------------------------------- */
  .route-sec {
    position: relative; overflow: hidden;
    padding: clamp(72px, 10vw, 140px) 0 clamp(72px, 9vw, 120px);
    background: linear-gradient(180deg, var(--landing-sea-deep) 0%, var(--landing-sky-top) 8%, var(--landing-sky-top) 50%, var(--landing-sky-mid) 100%);
  }
  .route-sec > .layer { opacity: 0.7; }
  .route-head { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr); }
  .route-head > * { grid-area: 1 / 1; }
  .stair { font-size: clamp(2.8rem, 8.4vw, 7.4rem); line-height: 0.95; letter-spacing: -0.035em; }
  .stair span { display: block; }
  .stair .s1 { color: var(--landing-explorer); }
  .stair .s2 { color: var(--landing-dawn-2); padding-left: 0.9em; }
  .stair .s3 { padding-left: 1.8em; }
  .route-head .side { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; justify-self: end; max-width: 25em; padding-top: 1.2em; }

  .route { position: relative; margin-top: clamp(24px, 4vw, 60px); }
  .trail-svg { position: absolute; inset: 0; z-index: 0; overflow: visible; pointer-events: none; }
  .trail-ghost { fill: none; stroke: var(--landing-on-night); stroke-opacity: 0.18; stroke-width: 2; stroke-dasharray: 2 10; stroke-linecap: round; }
  .trail-glow { fill: none; stroke: var(--landing-explorer); stroke-opacity: 0.22; stroke-width: 14; stroke-linecap: round; }
  .trail-line { fill: none; stroke: url(#lv-trail-grad); stroke-width: 4; stroke-linecap: round; }
  .s-ex { stop-color: var(--landing-explorer); }
  .s-dawn { stop-color: var(--landing-dawn-2); }
  .s-pink { stop-color: var(--landing-display-grad-3); }
  .tip { position: absolute; z-index: 0; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
  .tip::before { content: ''; position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%; background: radial-gradient(circle, var(--landing-planet-rim) 0%, color-mix(in srgb, var(--landing-explorer) 40%, transparent) 40%, transparent 70%); }
  .tip svg { position: absolute; left: -12px; top: -12px; width: 24px; height: 24px; fill: var(--landing-floe); animation: spin 6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .stop {
    position: relative; z-index: 1;
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: clamp(40px, 8vw, 128px); align-items: center;
    padding: clamp(44px, 6vw, 84px) 0;
  }
  .stop.flip .art { order: -1; }
  .node {
    position: absolute; z-index: 0; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px;
    border-radius: 50%; background: var(--landing-sky-top);
    border: 3px solid color-mix(in srgb, var(--landing-on-night) 40%, transparent);
    transition: background var(--motion-base), border-color var(--motion-base), transform 500ms var(--ease-spring);
  }
  .node::after { content: ''; position: absolute; inset: -12px; border-radius: 50%; border: 2px solid var(--landing-explorer); opacity: 0; transform: scale(0.4); }
  .wp { position: absolute; left: 3%; width: 1px; height: 1px; visibility: hidden; }
  .wp.top { top: 0; } .wp.bot { bottom: 0; }
  .stop.wide .node { left: 3%; top: 50%; }
  .node.lit { background: var(--landing-explorer); border-color: var(--landing-floe); transform: scale(1.25); }
  .node.lit::after { animation: ping 900ms ease-out both; }
  @keyframes ping { 0% { opacity: 0.9; transform: scale(0.4); } 100% { opacity: 0; transform: scale(1.6); } }

  .copy { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }
  .num {
    font-family: var(--lv-display); font-weight: 700; line-height: 0.78; letter-spacing: -0.04em;
    font-size: clamp(4.6rem, 10vw, 8.6rem);
    color: transparent; -webkit-text-stroke: 2px color-mix(in srgb, var(--landing-explorer) 70%, transparent);
    margin-bottom: -6px; user-select: none;
  }
  .copy h3 { font-size: clamp(2rem, 4.2vw, 3.4rem); color: var(--landing-on-night); }
  .tag {
    display: inline-flex; align-items: center; gap: 8px;
    font-weight: 900; font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--landing-explorer);
  }
  .tag svg { width: 16px; height: 16px; }
  .art { position: relative; display: grid; place-items: center; min-width: 0; }

  /* Stop 1: guess first */
  .blob-wrap { width: 100%; max-width: 520px; }
  .blob-wrap svg { width: 100%; height: auto; overflow: visible; display: block; }
  .blob-glow { fill: var(--landing-explorer); opacity: 0.08; }
  .orbit { fill: none; stroke: var(--landing-star); stroke-width: 1.5; stroke-dasharray: 2 9; stroke-linecap: round; opacity: 0.4; }
  .blob-body { fill: color-mix(in srgb, var(--landing-explorer) 42%, var(--landing-sky-mid)); stroke: var(--landing-explorer); stroke-width: 7; stroke-linejoin: round; }
  .blob-shade { fill: color-mix(in srgb, var(--landing-explorer) 24%, var(--landing-sky-top)); }
  .blob-hi { fill: var(--landing-explorer); opacity: 0.22; }
  .nucleus { fill: color-mix(in srgb, var(--landing-aurora-3) 70%, var(--landing-sky-mid)); stroke: var(--landing-aurora-3); stroke-width: 4; }
  .nucleolus { fill: var(--landing-aurora-3); }
  .mito-body { fill: var(--landing-display-grad-2); stroke: color-mix(in srgb, var(--landing-display-grad-2) 55%, var(--landing-sky-top)); stroke-width: 3; }
  .mito-crista { fill: none; stroke: var(--landing-planet-rim); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .ribo { fill: var(--landing-planet-rim); }
  .drone-body { fill: var(--landing-floe); }
  .drone-shade { fill: var(--landing-floe-shade); }
  .drone-eye { fill: var(--landing-explorer); }
  .drone-rotor { stroke: var(--landing-floe); stroke-width: 3; stroke-linecap: round; }
  .drone { animation: drone-bob 3.4s ease-in-out infinite; }
  .drone.d2 { animation-duration: 4.1s; animation-delay: -1.2s; }
  .drone.d3 { animation-duration: 3.8s; animation-delay: -2.3s; }
  @keyframes drone-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
  .part { transform-box: fill-box; transform-origin: center; transition: transform 300ms var(--ease-spring); }
  .part.hot { transform: scale(1.12); }
  .lbl { opacity: 0; transition: opacity 300ms ease; }
  .lbl path { stroke: var(--landing-on-night); stroke-width: 2; stroke-linecap: round; fill: none; stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 500ms var(--ease-settle); }
  .lbl rect { fill: var(--landing-floe); }
  .lbl text { fill: var(--landing-sky-top); font-family: var(--lv-display); font-weight: 600; font-size: 17px; }
  .lbl.on { opacity: 1; }
  .lbl.on path { stroke-dashoffset: 0; }
  .lbl.right rect { fill: var(--landing-display-grad-1); }

  .quiz {
    width: 100%; display: flex; flex-direction: column; gap: 12px; margin-top: 6px;
    padding: 20px; border-radius: 24px;
    background: var(--landing-night-panel);
    border: 1.5px solid var(--landing-night-edge);
    box-shadow: 0 24px 60px -24px var(--landing-glow);
  }
  .q-ask { margin: 0; font-family: var(--lv-display); font-weight: 600; font-size: 1.2rem; line-height: 1.3; color: var(--landing-on-night); }
  .opts { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .opt {
    width: 100%; display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 12px;
    text-align: left; padding: 10px 12px; border-radius: 16px; cursor: pointer;
    font-size: 0.98rem; font-weight: 700; line-height: 1.35; color: var(--landing-on-night);
    background: color-mix(in srgb, var(--landing-sky-mid) 70%, var(--landing-sky-top));
    border: 2px solid var(--landing-night-edge);
    box-shadow: 0 4px 0 color-mix(in srgb, var(--landing-sky-top) 80%, transparent);
    transition: transform 80ms, border-color var(--motion-fast), background var(--motion-fast);
  }
  .opt:hover:not([disabled]) { border-color: var(--landing-explorer); }
  .opt:active:not([disabled]) { transform: translateY(4px); box-shadow: none; }
  .opt .k { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; font-family: var(--lv-display); font-weight: 700; background: color-mix(in srgb, var(--landing-on-night) 12%, transparent); }
  .opt .mark svg { width: 22px; height: 22px; }
  .opt.wrong, .opt.wrong:hover:not([disabled]) { border-color: var(--landing-display-grad-3); animation: wobble 480ms ease-out; }
  .opt.wrong .k { background: color-mix(in srgb, var(--landing-display-grad-3) 30%, transparent); }
  .opt.right { border-color: var(--landing-explorer); background: color-mix(in srgb, var(--landing-explorer) 20%, var(--landing-sky-top)); animation: pop 420ms var(--ease-spring); }
  .opt.right .k { background: var(--landing-explorer); color: var(--landing-sky-top); }
  .opt[disabled] { cursor: default; }
  .opt[disabled]:not(.right) { opacity: 0.6; }
  @keyframes wobble { 0%, 100% { transform: none; } 25% { transform: translateX(-5px) rotate(-0.6deg); } 50% { transform: translateX(4px) rotate(0.4deg); } 75% { transform: translateX(-2px); } }
  @keyframes pop { 0% { transform: scale(0.97); } 50% { transform: scale(1.03); } 100% { transform: none; } }
  .q-say { display: flex; gap: 12px; align-items: flex-start; min-height: 60px; }
  .q-say quill-mascot { --quill-size: 52px; flex: none; }
  .q-say p {
    margin: 0; padding: 10px 14px; border-radius: 6px 18px 18px 18px; line-height: 1.5; font-weight: 700; font-size: 0.96rem;
    background: color-mix(in srgb, var(--landing-on-night) 10%, transparent); color: var(--landing-on-night);
  }
  .q-say p.yes { background: color-mix(in srgb, var(--landing-explorer) 22%, transparent); }

  /* Stop 2: two ways to read. A tilted tablet with a drag-to-compare split. */
  .device-stage { perspective: 1400px; width: 100%; max-width: 560px; }
  .device {
    position: relative; padding: 14px; border-radius: 30px;
    background: var(--landing-sky-top);
    border: 1.5px solid var(--landing-night-edge);
    box-shadow: 0 50px 80px -40px var(--landing-sky-top), 0 0 90px -30px var(--landing-glow), inset 0 0 0 6px color-mix(in srgb, var(--landing-on-night) 6%, transparent);
    transform: rotateY(-14deg) rotateX(6deg) rotateZ(1deg);
    transition: transform 900ms var(--ease-settle);
  }
  .flip .device { transform: rotateY(14deg) rotateX(6deg) rotateZ(-1deg); }
  .device-stage:hover .device, .device-stage:focus-within .device { transform: none; }
  .screen { position: relative; border-radius: 18px; overflow: hidden; aspect-ratio: 4 / 3; --split: 50%; }
  .look { position: absolute; inset: 0; padding: 18px 18px 46px; display: grid; grid-template-rows: auto auto 1fr auto; gap: 10px; align-content: start; }
  .look.classic { background: var(--landing-floe); color: var(--landing-sky-top); }
  .look.story {
    background: radial-gradient(color-mix(in srgb, var(--landing-dawn-1) 26%, transparent) 1.2px, transparent 1.6px) 0 0 / 10px 10px, var(--landing-dawn-3);
    color: var(--landing-on-cta);
    clip-path: inset(0 0 0 var(--split));
  }
  .look .crumb { font-size: 0.68rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.75; }
  .look h4 { margin: 0; font-size: clamp(1rem, 2vw, 1.3rem); line-height: 1.15; }
  .classic h4 { font-family: var(--lv-display); font-weight: 700; }
  .story h4 {
    font-family: var(--lv-poster); font-weight: 400; text-transform: uppercase; letter-spacing: 0.01em;
    background: var(--landing-display-grad-1); border: 2.5px solid var(--landing-on-cta); padding: 6px 10px; border-radius: 4px;
    box-shadow: 3px 3px 0 var(--landing-on-cta); transform: rotate(-1.5deg); justify-self: start;
  }
  .look .scene { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center; min-height: 0; }
  .classic .scene .fig { border-radius: 14px; background: color-mix(in srgb, var(--landing-explorer) 18%, var(--landing-floe)); padding: 10px; display: grid; place-items: center; aspect-ratio: 4 / 3; }
  .story .scene .fig { border: 2.5px solid var(--landing-on-cta); border-radius: 6px; background: var(--landing-floe); padding: 10px; display: grid; place-items: center; aspect-ratio: 4 / 3; box-shadow: 4px 4px 0 var(--landing-on-cta); }
  .buddy { width: 100%; max-width: 130px; height: auto; display: block; }
  .buddy-eye { fill: var(--landing-on-cta); }
  .buddy-smile { fill: none; stroke: var(--landing-on-cta); stroke-width: 3.5; stroke-linecap: round; }
  .classic .scene p { margin: 0; font-size: 0.86rem; line-height: 1.45; font-weight: 700; }
  .classic .scene p b { color: color-mix(in srgb, var(--landing-explorer) 45%, var(--landing-sky-top)); }
  .speech {
    position: relative; margin: 0; padding: 10px 12px; border-radius: 16px;
    background: var(--landing-floe); border: 2.5px solid var(--landing-on-cta);
    font-family: var(--lv-display); font-weight: 600; font-size: 0.9rem; line-height: 1.3;
  }
  .speech::before { content: ''; position: absolute; left: -12px; top: 18px; width: 14px; height: 14px; background: var(--landing-floe); border-left: 2.5px solid var(--landing-on-cta); border-bottom: 2.5px solid var(--landing-on-cta); transform: rotate(45deg) skew(10deg, 10deg); }
  .look .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .look .chip { font-size: 0.78rem; font-weight: 800; padding: 6px 10px; border-radius: 10px; }
  .classic .chip { background: var(--landing-sky-top); color: var(--landing-floe); }
  .classic .chip.alt { background: color-mix(in srgb, var(--landing-sky-top) 12%, var(--landing-floe)); color: var(--landing-sky-top); }
  .story .chip { background: var(--landing-floe); border: 2px solid var(--landing-on-cta); box-shadow: 2px 2px 0 var(--landing-on-cta); font-family: var(--lv-display); }
  .story .chip.alt { background: var(--landing-cta); }
  .look-name { position: absolute; z-index: 3; bottom: 10px; padding: 4px 10px; border-radius: 999px; font-size: 0.68rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; pointer-events: none; }
  .look-name.l { left: 10px; background: var(--landing-sky-top); color: var(--landing-floe); }
  .look-name.r { right: 10px; background: var(--landing-on-cta); color: var(--landing-dawn-3); }
  .divider { position: absolute; z-index: 2; top: 0; bottom: 0; left: var(--split); width: 4px; margin-left: -2px; background: var(--landing-on-cta); pointer-events: none; }
  .divider::after {
    content: ''; position: absolute; top: 50%; left: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%;
    background: var(--landing-cta); border: 3px solid var(--landing-on-cta);
    box-shadow: 0 4px 0 var(--landing-cta-lip);
  }
  .divider::before { content: ''; position: absolute; z-index: 1; top: 50%; left: 50%; width: 18px; height: 10px; margin: -5px 0 0 -9px; background: var(--landing-on-cta); clip-path: polygon(0 50%, 35% 0, 35% 100%, 0 50%, 100% 50%, 65% 0, 65% 100%, 100% 50%); }
  .split-range { position: absolute; z-index: 4; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
  .screen:has(.split-range:focus-visible) { outline: 3px solid var(--landing-explorer); outline-offset: 4px; }
  .drag-hint { margin-top: 18px; display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 0.9rem; color: var(--landing-on-night-soft); }

  /* Stop 3: the arcade. Two cabinets; marquees are the tabs' look. */
  .stop.wide { grid-template-columns: minmax(0, 1fr); justify-items: center; text-align: center; padding-top: clamp(80px, 10vw, 140px); }
  .stop.wide .copy { align-items: center; }
  .stop.wide .lede { text-align: center; }
  .cabinets { display: grid; grid-template-columns: repeat(2, minmax(0, 360px)); gap: clamp(24px, 5vw, 64px); justify-content: center; width: 100%; margin-top: 12px; }
  .cab { position: relative; display: flex; flex-direction: column; border-radius: 26px 26px 16px 16px; padding: 0 14px 16px; background: var(--cab, var(--landing-planet-b)); box-shadow: inset 0 -10px 0 color-mix(in srgb, var(--cab) 60%, var(--landing-sky-top)), 0 40px 60px -30px var(--landing-sky-top), 0 0 80px -30px var(--landing-glow); }
  .cab.catch { --cab: var(--landing-planet-b); transform: rotate(-2deg); }
  .cab.judge { --cab: var(--landing-aurora-3); transform: rotate(2deg) translateY(28px); }
  .marquee { position: relative; margin: 0 -14px; padding: 14px 16px 12px; border-radius: 26px 26px 6px 6px; background: var(--landing-sky-top); border: 4px solid var(--cab); text-align: center; }
  .marquee b { display: block; font-family: var(--lv-display); font-weight: 700; font-size: 1.5rem; line-height: 1.1; color: var(--landing-display-grad-1); }
  .marquee small { display: block; font-weight: 900; font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--landing-on-night-soft); margin-top: 3px; }
  .bulbs { position: absolute; left: 14px; right: 14px; top: 5px; height: 6px; background: radial-gradient(circle, var(--landing-display-grad-1) 2.2px, transparent 2.8px) 0 0 / 14px 6px repeat-x; opacity: 0.55; }
  .in .bulbs { animation: chase 400ms steps(2) 0s 16; }
  @keyframes chase { 0% { background-position-x: 0; opacity: 1; } 100% { background-position-x: 14px; opacity: 1; } }
  .cab .screen-box { position: relative; margin-top: 14px; aspect-ratio: 4 / 5; border-radius: 14px; overflow: hidden; border: 4px solid var(--landing-sky-top); background: linear-gradient(180deg, var(--landing-sky-top), var(--landing-sky-mid) 70%, var(--landing-sky-low)); }
  .deck { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 14px; font-weight: 900; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--landing-sky-top); }
  .deck kbd { display: inline-grid; place-items: center; min-width: 34px; height: 30px; padding: 0 8px; border-radius: 9px; background: var(--landing-floe); color: var(--landing-sky-top); box-shadow: 0 4px 0 var(--landing-floe-shade); font-family: var(--lv-display); font-weight: 700; font-size: 0.95rem; }

  .scr-goal { position: absolute; z-index: 2; left: 10px; right: 10px; top: 10px; margin: 0; padding: 7px 10px; border-radius: 12px; background: color-mix(in srgb, var(--landing-sky-top) 80%, transparent); font-weight: 800; font-size: 0.86rem; color: var(--landing-on-night); }
  .scr-goal b { color: var(--landing-display-grad-1); font-family: var(--lv-display); font-size: 1.05rem; }
  .scr-aurora { position: absolute; left: -10%; right: -10%; top: 18%; height: 30%; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--landing-aurora-1) 30%, transparent), transparent); transform: skewY(-8deg); }
  .scr-sea { position: absolute; left: 0; right: 0; bottom: 0; height: 20%; background: linear-gradient(180deg, var(--landing-sea), var(--landing-sea-deep)); border-top: 3px solid color-mix(in srgb, var(--landing-aurora-1) 50%, transparent); }
  .catcher { position: absolute; z-index: 2; bottom: 13%; left: 45%; width: 76px; margin-left: -38px; display: flex; flex-direction: column; align-items: center; }
  .catcher quill-mascot { --quill-size: 64px; margin-bottom: -10px; position: relative; z-index: 1; }
  .catcher .mini-floe { width: 76px; height: 16px; border-radius: 8px 8px 20px 20px; background: var(--landing-floe); box-shadow: inset 0 -5px 0 var(--landing-floe-shade); }
  .in .catcher { animation: catcher 7s var(--ease-settle) 300ms 2 both; }
  @keyframes catcher { 0%, 8% { left: 45%; } 22%, 46% { left: 25%; } 60%, 70% { left: 75%; } 86%, 100% { left: 45%; } }
  .fall {
    position: absolute; z-index: 1; top: -12%; margin-left: -30px; width: 60px;
    padding: 8px 0 9px; border-radius: 14px; text-align: center;
    font-family: var(--lv-display); font-weight: 700; font-size: 1.1rem;
    background: var(--landing-floe); color: var(--landing-sky-top); box-shadow: 0 4px 0 var(--landing-floe-shade);
  }
  .fall.bad { background: var(--landing-display-grad-3); color: var(--landing-on-cta); box-shadow: 0 4px 0 color-mix(in srgb, var(--landing-display-grad-3) 55%, var(--landing-sky-top)); }
  .fall.f1 { left: 25%; } .fall.f2 { left: 72%; } .fall.f3 { left: 75%; } .fall.f4 { left: 45%; }
  .in .fall { animation: 7s linear 300ms 2 both; }
  .in .fall.f1 { animation-name: fall-1; }
  .in .fall.f2 { animation-name: fall-2; }
  .in .fall.f3 { animation-name: fall-3; }
  .in .fall.f4 { animation-name: fall-4; }
  @keyframes fall-1 { 0% { top: -12%; opacity: 1; } 20% { top: 58%; opacity: 1; transform: none; } 24% { top: 62%; opacity: 0; transform: scale(0.3); } 100% { top: 62%; opacity: 0; } }
  @keyframes fall-2 { 0%, 22% { top: -12%; opacity: 1; } 48% { top: 98%; opacity: 1; } 50%, 100% { top: 104%; opacity: 0; } }
  @keyframes fall-3 { 0%, 38% { top: -12%; opacity: 1; } 62% { top: 58%; opacity: 1; transform: none; } 66%, 100% { top: 62%; opacity: 0; transform: scale(0.3); } }
  @keyframes fall-4 { 0%, 64% { top: -12%; opacity: 1; } 86% { top: 58%; opacity: 1; transform: none; } 90%, 100% { top: 62%; opacity: 0; transform: scale(0.3); } }
  .plus { position: absolute; z-index: 3; margin-left: -18px; font-family: var(--lv-display); font-weight: 700; font-size: 1.2rem; color: var(--landing-explorer); opacity: 0; top: 50%; }
  .plus.p1 { left: 25%; } .plus.p3 { left: 75%; } .plus.p4 { left: 45%; }
  .in .plus { animation: 7s ease-out 300ms 2 both; }
  .in .plus.p1 { animation-name: plus-1; }
  .in .plus.p3 { animation-name: plus-3; }
  .in .plus.p4 { animation-name: plus-4; }
  @keyframes plus-1 { 0%, 20% { opacity: 0; transform: none; } 22% { opacity: 1; } 34%, 100% { opacity: 0; transform: translateY(-40px); } }
  @keyframes plus-3 { 0%, 62% { opacity: 0; transform: none; } 64% { opacity: 1; } 76%, 100% { opacity: 0; transform: translateY(-40px); } }
  @keyframes plus-4 { 0%, 86% { opacity: 0; transform: none; } 88% { opacity: 1; } 99%, 100% { opacity: 0; transform: translateY(-40px); } }

  .jcard {
    position: absolute; z-index: 2; left: 12%; right: 12%; top: 20%; height: 48%;
    display: flex; flex-direction: column; justify-content: center; gap: 8px;
    padding: 16px; border-radius: 20px; text-align: center;
    background: var(--landing-floe); color: var(--landing-sky-top);
    box-shadow: 0 6px 0 var(--landing-floe-shade), 0 20px 30px -10px var(--landing-sky-top);
    font-family: var(--lv-display); font-weight: 600; font-size: 1.15rem; line-height: 1.25;
  }
  .jcard small { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 0.66rem; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; }
  .jcard.back { transform: rotate(4deg) translateY(10px) scale(0.94); z-index: 1; opacity: 0.85; }
  .stamp { position: absolute; top: 12px; padding: 4px 12px; border-radius: 8px; border: 3px solid currentColor; font-family: var(--lv-poster); font-size: 1.1rem; letter-spacing: 0.04em; transform: rotate(-12deg); opacity: 0; }
  .stamp.myth { right: 12px; color: var(--landing-display-grad-3); }
  .stamp.fact { left: 12px; color: color-mix(in srgb, var(--landing-explorer) 55%, var(--landing-sky-top)); transform: rotate(10deg); }
  .why { position: absolute; z-index: 1; left: 10px; right: 10px; bottom: 10px; margin: 0; padding: 10px 12px; border-radius: 14px; background: var(--landing-night-panel); border: 1.5px solid var(--landing-night-edge); font-weight: 700; font-size: 0.86rem; line-height: 1.4; text-align: left; color: var(--landing-on-night); opacity: 0; }
  .why b { color: var(--landing-explorer); }
  .in .jcard.c1 { animation: card-left 8s var(--ease-settle) 600ms 2 both; }
  .in .jcard.c1 .stamp { animation: stamp-1 8s ease-out 600ms 2 both; }
  .in .jcard.c2 { animation: card-right 8s var(--ease-settle) 600ms 2 both; }
  .in .jcard.c2 .stamp { animation: stamp-2 8s ease-out 600ms 2 both; }
  .in .why.w1 { animation: why-1 8s ease 600ms 2 both; }
  .in .why.w2 { animation: why-2 8s ease 600ms 2 both; }
  @keyframes card-left { 0%, 16% { transform: none; opacity: 1; } 30% { transform: translateX(-140%) rotate(-24deg); opacity: 0; } 100% { transform: translateX(-140%) rotate(-24deg); opacity: 0; } }
  @keyframes stamp-1 { 0%, 8% { opacity: 0; scale: 1.8; } 12%, 100% { opacity: 1; scale: 1; } }
  @keyframes card-right { 0%, 30% { transform: rotate(4deg) translateY(10px) scale(0.94); opacity: 0.85; } 38% { transform: none; opacity: 1; } 62% { transform: none; opacity: 1; } 76%, 100% { transform: translateX(140%) rotate(24deg); opacity: 0; } }
  @keyframes stamp-2 { 0%, 54% { opacity: 0; scale: 1.8; } 58%, 100% { opacity: 1; scale: 1; } }
  @keyframes why-1 { 0%, 26% { opacity: 0; transform: translateY(10px); } 30%, 46% { opacity: 1; transform: none; } 50%, 100% { opacity: 0; } }
  @keyframes why-2 { 0%, 72% { opacity: 0; transform: translateY(10px); } 76%, 100% { opacity: 1; transform: none; } }
  .cab-note { margin: 40px 0 0; font-weight: 700; color: var(--landing-on-night-soft); }
  .cab-note b { color: var(--landing-on-night); }

  /* Stop 4: wrong answers welcome. A chat that types itself in. */
  .chat { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 12px; }
  .msg { display: flex; gap: 10px; align-items: flex-end; max-width: 92%; }
  .msg p { margin: 0; padding: 12px 16px; line-height: 1.45; font-weight: 700; font-size: 1rem; }
  .msg.me { align-self: flex-end; }
  .msg.me p { background: var(--landing-cta); color: var(--landing-on-cta); border-radius: 20px 20px 6px 20px; box-shadow: 0 4px 0 var(--landing-cta-lip); }
  .msg.q p { background: var(--landing-night-panel); color: var(--landing-on-night); border: 1.5px solid var(--landing-night-edge); border-radius: 20px 20px 20px 6px; }
  .msg.q quill-mascot { --quill-size: 44px; flex: none; }
  .msg .who { display: block; font-size: 0.7rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.75; margin-bottom: 2px; }
  .msg.q .who { color: var(--landing-explorer); opacity: 1; }
  .msg { opacity: 0; transform: translateY(14px) scale(0.96); }
  .in .msg { opacity: 1; transform: none; transition: opacity 400ms ease calc(var(--t) * 1s), transform 500ms var(--ease-spring) calc(var(--t) * 1s); }
  .typing { display: inline-flex; gap: 5px; padding: 14px 16px; border-radius: 20px 20px 20px 6px; background: var(--landing-night-panel); border: 1.5px solid var(--landing-night-edge); }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--landing-on-night-soft); animation: dot 900ms ease-in-out infinite; }
  .typing i:nth-child(2) { animation-delay: 150ms; } .typing i:nth-child(3) { animation-delay: 300ms; }
  @keyframes dot { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-4px); opacity: 1; } }
  .msg.tp { opacity: 0; max-height: 0; overflow: hidden; margin-top: -12px; }
  .in .msg.tp { animation: typing-life 1.1s ease both; animation-delay: calc(var(--t) * 1s); transition: none; }
  @keyframes typing-life {
    0% { opacity: 0; max-height: 0; margin-top: -12px; }
    12%, 88% { opacity: 1; max-height: 60px; margin-top: 0; }
    100% { opacity: 0; max-height: 0; margin-top: -12px; }
  }
  .model-pair { display: flex; gap: 14px; align-items: center; margin-bottom: 8px; }
  .model-pair svg { width: 92px; height: 92px; }
  .model-pair .arrow { width: 26px; height: 26px; color: var(--landing-on-night-soft); }
  .model-pair .arrow svg { width: 100%; height: 100%; display: block; }
  .atom-n { fill: var(--landing-display-grad-2); }
  .atom-orbit { fill: none; stroke: var(--landing-on-night-soft); stroke-width: 2; }
  .atom-e { fill: var(--landing-aurora-2); }
  .atom-cloud { fill: var(--landing-aurora-2); }
  .model-pair figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 0.74rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: var(--landing-on-night-soft); }
  .model-pair .old svg { opacity: 0.85; }
  .model-pair .old figcaption { text-decoration: line-through; text-decoration-color: var(--landing-display-grad-3); text-decoration-thickness: 2px; }

  /* Stop 5: type maths. A field that fills itself from a maths keyboard. */
  .mathcard {
    width: 100%; max-width: 440px; padding: 20px; border-radius: 26px;
    background: var(--landing-night-panel); border: 1.5px solid var(--landing-night-edge);
    box-shadow: 0 30px 60px -30px var(--landing-sky-top), 0 0 80px -30px var(--landing-glow);
    transform: rotate(-1.5deg);
  }
  .m-q { margin: 0 0 12px; font-family: var(--lv-display); font-weight: 600; font-size: 1.15rem; color: var(--landing-on-night); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; line-height: 1; font-family: var(--lv-display); font-weight: 700; }
  .frac > span { padding: 1px 4px; }
  .frac > span + span { border-top: 2.5px solid currentColor; }
  .field {
    display: flex; align-items: center; gap: 10px; min-height: 104px; padding: 12px 16px; border-radius: 18px;
    background: var(--landing-floe); color: var(--landing-sky-top);
    border: 3px solid var(--landing-explorer);
    font-family: var(--lv-display); font-weight: 700; font-size: 2rem;
  }
  .field .lhs { opacity: 0.6; font-size: 1.4rem; }
  .field .frac.big { font-size: 2rem; opacity: 0; }
  .field .frac.big > span { min-width: 46px; min-height: 40px; text-align: center; border-radius: 8px; }
  .slot { position: relative; }
  .slot::before { content: ''; position: absolute; inset: 3px 2px; border: 2px dashed color-mix(in srgb, var(--landing-sky-top) 35%, transparent); border-radius: 6px; }
  .slot .v { opacity: 0; }
  .field .ok { margin-left: auto; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: var(--landing-explorer); color: var(--landing-sky-top); opacity: 0; transform: scale(0.4); }
  .field .ok svg { width: 26px; height: 26px; }
  .keys { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
  .key-b { display: grid; place-items: center; height: 46px; border-radius: 12px; font-family: var(--lv-display); font-weight: 700; font-size: 1.15rem; color: var(--landing-on-night); background: color-mix(in srgb, var(--landing-sky-mid) 80%, var(--landing-sky-top)); box-shadow: 0 4px 0 var(--landing-sky-top); }
  .key-b.go { background: var(--landing-cta); color: var(--landing-on-cta); box-shadow: 0 4px 0 var(--landing-cta-lip); }
  .key-b .frac { font-size: 0.78rem; }
  .key-b .frac > span { width: 12px; height: 10px; border: 1.5px solid currentColor; border-radius: 2px; padding: 0; }
  .key-b .frac > span + span { margin-top: 3px; }
  .m-say { margin: 14px 0 0; display: flex; align-items: center; gap: 10px; font-weight: 800; color: var(--landing-on-night); opacity: 0; }
  .m-say quill-mascot { --quill-size: 44px; }
  .in .key-b[data-t] { animation: press 260ms ease both; animation-delay: calc(var(--t) * 1s); }
  @keyframes press { 0%, 100% { transform: none; filter: none; } 50% { transform: translateY(4px); box-shadow: none; filter: brightness(1.4); } }
  .in .frac.big { animation: show 250ms ease 0.6s both; }
  .in .slot .v { animation: show 200ms ease both; animation-delay: calc(var(--t) * 1s + 0.1s); }
  .in .slot { animation: slot-on 200ms ease both; animation-delay: calc(var(--t) * 1s); }
  @keyframes slot-on { to { background: color-mix(in srgb, var(--landing-explorer) 22%, transparent); } }
  .in .field .ok { animation: ok 420ms var(--ease-spring) 3.3s both; }
  .in .m-say { animation: show 400ms ease 3.6s both; }
  @keyframes show { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ok { to { opacity: 1; transform: none; } }

  .route-end { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center; padding-top: clamp(48px, 7vw, 96px); }
  .route-end h3 { font-size: clamp(2rem, 5vw, 3.6rem); }
  .end-star { width: 70px; height: 70px; fill: var(--landing-display-grad-1); filter: drop-shadow(0 0 18px var(--landing-display-grad-1)); }
  .route-end .fine { font-weight: 700; color: var(--landing-on-night-soft); margin: 0; }

  /* ---- hand-off: a pinned, scroll-scrubbed sunrise ---------------------
     The section is tall and its stage sticks to the viewport; JS writes the
     progress (0 to 1) to --p and everything below is a function of it. */
  .dawn { position: relative; height: 260vh; --p: 0; background: var(--landing-dawn-3); }
  .dawn-pin {
    position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden; isolation: isolate;
    background: linear-gradient(180deg, var(--landing-sky-mid) 0%, var(--landing-sky-low) 36%, var(--landing-dawn-1) 62%, var(--landing-dawn-2) 80%, var(--landing-dawn-3) 100%);
    --lift: clamp(0, calc((var(--p) - 0.05) * 1.9), 1);
    --walk: clamp(0, calc((var(--p) - 0.12) * 1.6), 1);
    --tear: clamp(0, calc((var(--p) - 0.72) * 3.6), 1);
  }
  .dawn-pin::before {
    content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: linear-gradient(180deg, var(--landing-sky-mid) 0%, var(--landing-sky-top) 100%);
    opacity: calc(1 - var(--lift));
  }
  .dawn-stars { position: absolute; inset: 0 0 40% 0; z-index: 0; opacity: calc(1 - var(--lift) * 0.85); }
  .dawn-stars svg { width: 100%; height: 100%; display: block; }
  .sun {
    position: absolute; z-index: 1; left: 50%; bottom: 120px; width: min(340px, 70vw); aspect-ratio: 1; margin-left: calc(min(340px, 70vw) / -2);
    border-radius: 50%; background: var(--landing-dawn-3);
    box-shadow: 0 0 0 30px color-mix(in srgb, var(--landing-dawn-3) 45%, transparent), 0 0 0 66px color-mix(in srgb, var(--landing-dawn-2) 28%, transparent), 0 0 0 104px color-mix(in srgb, var(--landing-dawn-2) 12%, transparent);
    transform: translateY(calc(80% - var(--lift) * 62%)) scale(calc(0.8 + var(--lift) * 0.2));
  }
  .rays { position: absolute; z-index: 1; left: 50%; bottom: 120px; width: 160vmax; height: 160vmax; margin-left: -80vmax; margin-bottom: -80vmax; pointer-events: none;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--landing-dawn-3) 22%, transparent) 0deg 6deg, transparent 6deg 18deg);
    -webkit-mask: radial-gradient(circle, black 10%, transparent 55%); mask: radial-gradient(circle, black 10%, transparent 55%);
    opacity: calc(var(--lift) * 0.9);
    transform: translateY(calc(30% - var(--lift) * 26%)) rotate(calc(var(--p) * 40deg));
  }
  .dawn-copy { position: absolute; z-index: 3; left: 0; right: 0; top: calc(var(--lv-bar-h) + 7vh); display: grid; justify-items: center; text-align: center; }
  .dawn-copy > * { grid-area: 1 / 1; }
  .say-a, .say-b { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 0 var(--lv-gutter); }
  .say-a { opacity: clamp(0, calc((0.4 - var(--p)) * 6), 1); transform: translateY(calc((1 - clamp(0, calc((0.4 - var(--p)) * 6), 1)) * -30px)); }
  .say-b { opacity: clamp(0, calc((var(--p) - 0.36) * 6), 1); transform: translateY(calc((1 - clamp(0, calc((var(--p) - 0.36) * 6), 1)) * 40px)); }
  .dawn h2 { font-size: clamp(2.4rem, 7.2vw, 5.6rem); color: var(--landing-on-night); text-shadow: 0 4px 30px color-mix(in srgb, var(--landing-sky-top) 50%, transparent); }
  .dawn .say-b .key { background: linear-gradient(95deg, var(--landing-dawn-3), var(--landing-floe)); -webkit-background-clip: text; background-clip: text; }
  .dawn .say-b .key { --swash: var(--landing-dawn-3); --gleam: var(--landing-floe); }
  .dawn .say-b .key::after, .dawn .say-b .key::before { animation: none; transform: none; }
  .dawn .lede { text-align: center; color: var(--landing-on-night); }
  .dawn .kicker { color: var(--landing-dawn-2); background: color-mix(in srgb, var(--landing-dawn-2) 12%, var(--landing-sky-top)); border-color: color-mix(in srgb, var(--landing-dawn-2) 45%, transparent); }
  .shelf { position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; height: 150px; width: 100%; display: block; }
  .shelf-top { fill: var(--landing-floe); }
  .shelf-face { fill: var(--landing-floe-shade); }
  .walker { position: absolute; z-index: 6; left: 50%; bottom: 112px; transform: translateX(calc(-50% + (var(--walk) - 1) * 50vw)); }
  .walker quill-mascot { --quill-size: clamp(110px, 13vw, 150px); }
  .waddle { display: block; transform-origin: 50% 95%; }
  .walking .waddle { animation: waddle 420ms ease-in-out infinite; }
  @keyframes waddle { 0%, 100% { transform: rotate(-5deg) translateY(0); } 50% { transform: rotate(5deg) translateY(-6px); } }
  .prints { position: absolute; z-index: 3; left: 0; bottom: 116px; height: 10px; width: calc(50vw * var(--walk)); background: radial-gradient(ellipse 5px 3px, var(--landing-floe-shade) 90%, transparent) 0 0 / 34px 10px repeat-x; opacity: 0.8; }
  .tear { position: absolute; z-index: 5; left: 0; right: 0; bottom: 0; height: 116px; transform: translateY(calc((1 - var(--tear)) * 102%)); }
  .tear svg { position: absolute; left: 0; top: -38px; width: 100%; height: 40px; display: block; }
  .tear-paper { fill: var(--landing-paper); }
  .tear .fill { position: absolute; inset: 0; background: var(--landing-paper); }

  /* ---- grown-ups: paper collage ---------------------------------------- */
  .paper {
    position: relative; isolation: isolate; color: var(--landing-ink);
    background: radial-gradient(ellipse 70% 40% at 50% 0%, var(--landing-lamp), transparent 70%), var(--landing-paper);
    padding: clamp(24px, 4vw, 48px) 0 clamp(80px, 9vw, 120px);
  }
  .paper::before {
    content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background: url('assets/textures/paper-grain.svg');
    opacity: 0.1; mix-blend-mode: multiply;
  }
  :host([data-theme='dark']) .paper::before { mix-blend-mode: normal; opacity: 0.05; }
  .paper .kicker {
    color: var(--landing-ink); background: var(--landing-paper-2);
    border: 2px solid var(--landing-ink); box-shadow: 3px 3px 0 var(--landing-paper-shadow);
  }
  .paper .kicker svg { color: var(--landing-grownup); }
  .poster-head { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 20em); gap: 24px 40px; align-items: end; }
  .poster {
    margin: 18px 0 0; font-family: var(--lv-poster); font-weight: 400; font-synthesis: none;
    font-size: clamp(2.1rem, 6.4vw, 5.5rem); line-height: 1; letter-spacing: -0.015em; text-transform: uppercase;
    color: var(--landing-ink);
  }
  .poster .no { position: relative; display: inline-block; white-space: nowrap; }
  .poster .no::after {
    content: ''; position: absolute; left: -3%; right: -3%; top: 46%; height: 0.1em; border-radius: 0.05em;
    background: var(--landing-grownup); transform: rotate(-3deg) scaleX(0); transform-origin: 0 50%;
  }
  .in .poster .no::after { transform: rotate(-3deg) scaleX(1); transition: transform 600ms var(--ease-settle) 900ms; }
  .poster .yes { display: block; color: var(--landing-grownup); font-size: 0.72em; margin-top: 0.18em; }
  .poster .yes .key { background: none; color: inherit; }
  .poster .yes .key { --swash: var(--landing-dawn-1); --gleam: var(--landing-display-grad-2); }
  .poster-head .lede { color: var(--landing-ink-soft); font-size: 1.08rem; padding-bottom: 10px; }
  .poster-head .lede b { color: var(--landing-ink); }
  .poster-head .wand-art { position: absolute; right: 0; top: 0; width: min(380px, 32vw); height: auto; overflow: visible; transform: rotate(-6deg); }

  .ink { stroke: var(--landing-ink); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .wand-stick { fill: none; stroke: var(--landing-ink); stroke-width: 9; stroke-linecap: round; }
  .wand-band { fill: none; stroke: var(--landing-paper-2); stroke-width: 9; stroke-dasharray: 10 18; }
  .wand-star { fill: var(--landing-dawn-2); }
  .fizz { fill: var(--landing-dawn-2); transform-box: fill-box; transform-origin: center; }
  .fizz.dull { fill: var(--landing-ink-soft); }
  .page { fill: var(--landing-paper); }
  .crease { fill: none; stroke: var(--landing-ink-soft); stroke-width: 1.8; stroke-linecap: round; }
  .in .fizz { animation: fizzle 1400ms var(--ease-settle) both; animation-delay: calc(var(--d) * 160ms + 300ms); }
  @keyframes fizzle { from { opacity: 0; transform: translate(-30px, -18px) scale(1.4); } to { opacity: 1; transform: none; } }

  .board-grid { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: clamp(32px, 5vw, 72px); align-items: start; margin-top: clamp(40px, 6vw, 80px); }
  .clip {
    position: relative; padding: 30px 26px 40px; background: var(--landing-paper-2);
    border: 1.5px solid var(--landing-paper-shadow);
    box-shadow: 10px 14px 0 var(--landing-paper-shadow);
    transform: rotate(-2.4deg);
    clip-path: polygon(0 0, 100% 0, 100% 96%, 94% 100%, 86% 96.5%, 76% 99.5%, 64% 96%, 52% 99.5%, 40% 96.5%, 28% 100%, 16% 96.5%, 6% 99%, 0 96%);
  }
  .tape { position: absolute; z-index: 2; width: 110px; height: 30px; background: color-mix(in srgb, var(--landing-dawn-2) 55%, transparent); border-left: 2px dashed color-mix(in srgb, var(--landing-ink) 12%, transparent); border-right: 2px dashed color-mix(in srgb, var(--landing-ink) 12%, transparent); }
  .tape.t1 { top: -12px; left: 30px; transform: rotate(-8deg); }
  .tape.t2 { top: -10px; right: 24px; transform: rotate(6deg); }
  .clip-wrap { position: relative; padding-top: 14px; }
  .clip .masthead { display: flex; justify-content: space-between; border-bottom: 2.5px solid var(--landing-ink); padding-bottom: 6px; margin-bottom: 14px; font-weight: 900; font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--landing-ink-soft); }
  .clip h3 { margin: 0 0 14px; font-family: var(--lv-poster); font-weight: 400; font-size: clamp(1.4rem, 2.6vw, 2rem); line-height: 1.05; text-transform: uppercase; }
  .clip .quote { margin: 0 0 16px; padding-left: 14px; border-left: 4px solid var(--landing-grownup); font-weight: 800; font-size: 1.05rem; line-height: 1.45; }
  .clip .quote span { color: var(--landing-grownup); }
  .clip ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .clip li { display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: start; line-height: 1.45; color: var(--landing-ink-soft); font-weight: 600; }
  .clip li .x { color: var(--landing-grownup); margin-top: 2px; }
  .clip li .x svg { width: 20px; height: 20px; }
  /* A text decoration, not a drawn bar, so it follows the text when a line wraps. */
  .strike { text-decoration: line-through 2.5px; text-decoration-color: transparent; }
  .in .strike { text-decoration-color: var(--landing-grownup); transition: text-decoration-color 400ms ease calc(900ms + var(--i) * 450ms); }
  .note {
    position: relative; margin: 26px 0 0 auto; width: max-content; max-width: 100%;
    font-family: var(--lv-display); font-weight: 600; font-size: 1.35rem; line-height: 1.2; color: var(--landing-grownup);
    transform: rotate(-4deg); text-align: right; padding-right: 8px;
  }
  .scrawl { position: absolute; width: 74px; height: 50px; overflow: visible; }
  .scrawl path { fill: none; stroke: var(--landing-grownup); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
  .in .scrawl path { stroke-dashoffset: 0; transition: stroke-dashoffset 700ms ease-out 2.4s; }
  .note .scrawl { left: -78px; top: -34px; }

  .map {
    position: relative; padding: 28px clamp(18px, 3vw, 34px) 30px; border-radius: 18px;
    background: var(--landing-paper-2); border: var(--lv-ink-w) solid var(--landing-ink);
    box-shadow: 10px 12px 0 var(--landing-paper-shadow);
    transform: rotate(0.8deg);
  }
  .map .label { position: absolute; top: -17px; left: 24px; padding: 5px 12px; border-radius: 8px; background: var(--landing-moss); color: var(--landing-paper-2); border: 2px solid var(--landing-ink); font-weight: 900; font-size: 0.74rem; letter-spacing: 0.12em; text-transform: uppercase; transform: rotate(-2deg); }
  .map h3 { margin: 6px 0 4px; font-family: var(--lv-poster); font-weight: 400; font-size: clamp(1.3rem, 2.4vw, 1.8rem); line-height: 1.1; }
  .map > p { margin: 0 0 8px; color: var(--landing-ink-soft); font-weight: 600; line-height: 1.5; }
  .steps-box { position: relative; margin-top: 8px; }
  .steps { position: relative; z-index: 1; list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 34px 22px; }
  .steps li:nth-child(1) { grid-area: 1 / 1; } .steps li:nth-child(2) { grid-area: 1 / 2; } .steps li:nth-child(3) { grid-area: 1 / 3; }
  .steps li:nth-child(4) { grid-area: 2 / 3; } .steps li:nth-child(5) { grid-area: 2 / 2; } .steps li:nth-child(6) { grid-area: 2 / 1; }
  .road { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 0; }
  .road path { fill: none; stroke: var(--landing-ink-soft); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 3 9; opacity: 0.6; }
  .step { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 6px; padding-top: 30px; }
  .stone { position: relative; width: 56px; height: 52px; display: grid; place-items: center; transition: transform 420ms var(--ease-spring); }
  .stone svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .stone-fill { fill: var(--landing-paper); stroke: var(--landing-ink); stroke-width: 2.5; stroke-linejoin: round; transition: fill 300ms; }
  .stone-lip { fill: var(--landing-paper-shadow); }
  .stone b { position: relative; font-family: var(--lv-poster); font-weight: 400; font-size: 1.25rem; color: var(--landing-ink); transition: color 300ms; }
  .step.lit .stone { transform: translateY(-4px) rotate(-4deg); }
  .step.lit .stone-fill { fill: var(--landing-moss); }
  .step.lit .stone b { color: var(--landing-paper-2); }
  .step h4 { margin: 4px 0 0; font-family: var(--lv-poster); font-weight: 400; font-size: 1.1rem; letter-spacing: 0; }
  .step p { margin: 0; line-height: 1.45; color: var(--landing-ink-soft); font-weight: 600; font-size: 0.95rem; }
  .map-quill { position: absolute; z-index: 2; left: 0; top: 0; pointer-events: none; transition: transform 700ms var(--ease-settle); transform: translate(var(--qx, 0px), var(--qy, 0px)); }
  .map-quill quill-mascot { --quill-size: 50px; }

  .paper-foot { margin-top: clamp(64px, 8vw, 110px); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px 40px; align-items: center; padding: 28px clamp(20px, 4vw, 40px); border-radius: 22px; border: var(--lv-ink-w) dashed var(--landing-ink-soft); }
  .paper-foot h3 { margin: 0 0 6px; font-family: var(--lv-poster); font-weight: 400; font-size: clamp(1.3rem, 2.6vw, 2rem); line-height: 1.1; }
  .paper-foot p { margin: 0; color: var(--landing-ink-soft); font-weight: 700; line-height: 1.5; }
  .paper-foot .btns { display: flex; flex-wrap: wrap; gap: 14px; }
  .ink-btn {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer; text-decoration: none;
    font-family: var(--lv-display); font-weight: 700; font-size: 1.05rem;
    padding: 13px 20px; border-radius: 14px; color: var(--landing-ink); background: var(--landing-paper-2);
    border: var(--lv-ink-w) solid var(--landing-ink); box-shadow: 3px 4px 0 var(--landing-ink);
    transition: transform 80ms, box-shadow 80ms;
  }
  .ink-btn:active { transform: translate(3px, 4px); box-shadow: none; }
  .ink-btn svg { width: 20px; height: 20px; }
  .ink-btn.solid { background: var(--landing-grownup); color: var(--landing-paper-2); }

  /* ---- responsive ------------------------------------------------------ */
  @media (max-width: 960px) {
    .bar nav { display: none; }
    .far-opt { display: none; }
    .route-head, .poster-head, .board-grid { grid-template-columns: minmax(0, 1fr); }
    .poster-head .wand-art { position: relative; top: 0; justify-self: end; width: min(300px, 70vw); margin-top: -10px; }
    .stop { grid-template-columns: minmax(0, 1fr); gap: 36px; padding: 56px 0 56px 34px; }
    .stop.flip .art { order: 0; }
    .stop.wide { padding-left: 34px; justify-items: stretch; text-align: left; }
    .stop.wide .copy { align-items: flex-start; }
    .stop.wide .lede { text-align: left; }
    .node, .stop.wide .node { left: 11px; top: 70px; }
    .device, .flip .device { transform: rotateY(-8deg) rotateX(4deg); }
    .cabinets { grid-template-columns: minmax(0, 360px); justify-content: start; gap: 40px; }
    .cab.judge { transform: rotate(1.5deg); }
    .q-stand { left: 79%; }
    .route-head { gap: 24px; }
    .route-head > * { grid-area: auto; }
    .route-head .side { justify-self: start; padding-top: 0; }
    .bubble { display: none; }
    .bubble.said { display: block; left: auto; right: 0; translate: none; max-width: 180px; font-size: 0.92rem; padding: 10px 13px; }
    .bubble.said::after { left: 66%; }
  }
  @media (max-width: 560px) {
    .cta { white-space: normal; }
    .free-pill { font-size: 0.78rem; border-radius: 16px; }
    .hero-copy { padding-top: calc(var(--lv-bar-h) + 28px); gap: 16px; }
    .mega { font-size: clamp(2.9rem, 14.4vw, 4rem); }
    .actions { width: 100%; }
    .actions .cta { flex: 1 1 100%; }
    .fore { height: 240px; margin-top: 110px; }
    .post { left: 30%; top: 23.4%; }
    .board { min-width: 0; grid-template-columns: 40px auto; padding: 7px 30px 7px 8px; }
    .board.gu { grid-template-columns: auto 40px; padding: 7px 8px 7px 30px; }
    .board .spot { width: 40px; height: 40px; }
    .board .spot svg { width: 32px; height: 32px; }
    .board .name { font-size: 1.05rem; }
    .board .who { font-size: 0.6rem; }
    .board.ex { translate: 10px 0; --off: 10px; }
    .board.ex:hover, .board.ex:focus-visible { translate: 16px 0; }
    .board.gu { translate: -6px 0; --off: -6px; }
    .board.gu:hover, .board.gu:focus-visible { translate: -12px 0; }
    .q-stand { left: 82%; --quill-size: 124px; }
    .planet-big { display: none; }
    .logo coauthor-logo::part(word) { display: none; }
    .stair .s2 { padding-left: 0.5em; } .stair .s3 { padding-left: 1em; }
    .steps { grid-template-columns: minmax(0, 1fr); gap: 18px; }
    .steps li:nth-child(n) { grid-area: auto; }
    .step { display: grid; grid-template-columns: 56px 1fr; column-gap: 14px; padding-top: 0; }
    .step .stone { grid-row: span 2; }
    .road, .map-quill { display: none; }
    .paper-foot { grid-template-columns: minmax(0, 1fr); }
    .note .scrawl { display: none; }
    .clip { padding: 26px 18px 36px; }
    .map { padding: 26px 16px 24px; }
    .look { padding: 12px; gap: 6px; }
    .look .scene p { font-size: 0.74rem; }
    .speech { font-size: 0.76rem; padding: 7px 9px; }
    .look .chip { font-size: 0.68rem; padding: 4px 7px; }
    .mathcard { padding: 16px; }
    .field { font-size: 1.6rem; min-height: 92px; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
    .rv, .msg { opacity: 1; transform: none; }
    .msg.tp { display: none; }
    .hero-copy, .l-far, .l-planets, .l-bergs { transform: none; opacity: 1; }
    .dawn { height: auto; }
    .dawn-pin { position: relative; height: 100svh; min-height: 640px; --p: 1; }
    .lbl path, .scrawl path { stroke-dashoffset: 0; }
    .strike { text-decoration-color: var(--landing-grownup); }
    .poster .no::after { transform: rotate(-3deg) scaleX(1); }
    .field .frac.big, .slot .v, .m-say, .field .ok { opacity: 1; transform: none; }
    .fall, .plus, .why.w1, .jcard.c1, .fish .arc, .shower { display: none; }
    .why.w2 { opacity: 1; }
    .jcard.c2 { transform: none; opacity: 1; }
    .jcard.c2 .stamp { opacity: 1; }
  }
`;
