import { css } from 'lit';

/**
 * Styles for the long-answers stop (landingDescriptive.js). The sheet plays
 * once when its stop reveals (.in); .rs on the sheet restarts it.
 * Timeline in seconds: point 1 typed 0.5 to 1.7, ticked 2.0; point 2's
 * first try 2.4 to 2.8, hint 3.2, struck 4.3, fix typed 4.8 to 6.1, ticked
 * 6.3, hint gone 6.6, Quill's line 6.8.
 */
export const landingStylesDescriptive = css`
  .d-feats { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; max-width: 34em; }
  .d-feats li { display: flex; gap: 12px; align-items: flex-start; color: var(--landing-on-night-soft); line-height: 1.5; }
  .d-feats b { display: block; color: var(--landing-on-night); font-weight: 800; }
  .d-ic {
    flex: none; width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; margin-top: 2px;
    background: color-mix(in srgb, var(--landing-explorer) 22%, var(--landing-sky-top));
    color: var(--landing-explorer); box-shadow: 0 3px 0 var(--landing-sky-top);
  }
  .d-ic svg { width: 16px; height: 16px; }
  .d-fine { margin: 0; font-size: 0.88rem; color: var(--landing-on-night-soft); opacity: 0.85; max-width: 34em; }

  /* ---- the answer sheet ------------------------------------------------ */
  .sheet {
    position: relative; width: 100%; max-width: 470px; padding: 20px; border-radius: 26px;
    background: var(--landing-night-panel); border: 1.5px solid var(--landing-night-edge);
    box-shadow: 0 30px 60px -30px var(--landing-sky-top), 0 0 80px -30px var(--landing-glow);
    transform: rotate(1.2deg);
  }
  .sh-head { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
  .sh-q { margin: 0; font-family: var(--lv-display); font-weight: 600; font-size: 1.12rem; line-height: 1.3; color: var(--landing-on-night); }
  .marks { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 999px; background: color-mix(in srgb, var(--landing-sky-mid) 70%, var(--landing-sky-top)); }
  .marks b { font-size: 0.74rem; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; color: var(--landing-on-night-soft); margin-left: 2px; }
  .pip { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--landing-explorer); }
  .pt { margin-top: 12px; }
  .pt-label { display: block; font-size: 0.8rem; font-weight: 900; letter-spacing: 0.04em; color: var(--landing-explorer); margin-bottom: 6px; }
  .ans-box {
    position: relative; display: flex; gap: 10px; align-items: flex-start; min-height: 64px; padding: 10px 12px; border-radius: 14px;
    background: var(--landing-floe); color: var(--landing-sky-top);
    border: 3px solid color-mix(in srgb, var(--landing-floe-shade) 70%, transparent);
  }
  .ans { margin: 0; flex: 1; min-width: 0; font-weight: 700; font-size: 0.98rem; line-height: 1.55; }
  .w { opacity: 0; }
  .kw { border-radius: 5px; padding: 0 2px; margin: 0 -2px; }
  .wrong { position: relative; }
  .tick { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--landing-explorer); color: var(--landing-sky-top); opacity: 0; transform: scale(0.4); }
  .tick svg { width: 20px; height: 20px; }
  .d-hint { display: flex; gap: 10px; align-items: center; overflow: hidden; max-height: 0; opacity: 0; margin-top: 0; }
  .d-hint quill-mascot { --quill-size: 42px; flex: none; }
  .d-hint p {
    margin: 0; padding: 10px 14px; border-radius: 16px 16px 16px 6px; font-weight: 700; font-size: 0.92rem; line-height: 1.4;
    background: color-mix(in srgb, var(--landing-dawn-2) 18%, var(--landing-sky-top)); color: var(--landing-dawn-3);
    border: 1.5px solid color-mix(in srgb, var(--landing-dawn-2) 55%, transparent);
  }
  .d-hint b { display: block; font-size: 0.7rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: var(--landing-dawn-2); }
  .sh-say { margin: 14px 0 0; display: flex; align-items: center; gap: 10px; font-weight: 800; color: var(--landing-on-night); opacity: 0; }
  .sh-say quill-mascot { --quill-size: 44px; }
  .replay {
    position: absolute; right: 16px; bottom: -16px; display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--landing-night-edge); cursor: pointer;
    font: inherit; font-size: 0.8rem; font-weight: 800; color: var(--landing-on-night);
    background: color-mix(in srgb, var(--landing-sky-mid) 80%, var(--landing-sky-top)); opacity: 0;
  }
  .replay svg { width: 14px; height: 14px; transform: rotate(180deg); }
  .replay:hover { border-color: var(--landing-explorer); }

  .in .w { animation: d-show 120ms ease both; animation-delay: calc(var(--t) * 1s); }
  .in .kw { animation: d-show 120ms ease calc(var(--t) * 1s) both, d-mark 360ms ease calc(var(--k) * 1s) both; }
  .in .p1 .tick, .in .pip.a { animation: d-ok 420ms var(--ease-spring) 2s both; }
  .in .p2 .tick, .in .pip.b { animation: d-ok 420ms var(--ease-spring) 6.3s both; }
  .in .p2 .ans-box { animation: d-shake 420ms ease 3.1s both; }
  .in .wrong { animation: d-strike 400ms ease 4.3s both; }
  .in .d-hint { animation: d-hint 3.4s ease 3.2s both; }
  .in .sh-say { animation: d-show 400ms ease 6.8s both; }
  .in .replay { animation: d-show 300ms ease 7.2s both; }
  .sheet.rs, .sheet.rs * { animation: none !important; }

  @keyframes d-show { from { opacity: 0; } to { opacity: 1; } }
  @keyframes d-mark { to { background: color-mix(in srgb, var(--landing-explorer) 45%, transparent); } }
  @keyframes d-ok { to { opacity: 1; transform: none; background-color: var(--landing-explorer); } }
  @keyframes d-shake {
    0%, 100% { transform: none; }
    20% { transform: translateX(-6px); border-color: var(--landing-dawn-1); }
    40% { transform: translateX(5px); } 60% { transform: translateX(-3px); }
    80% { transform: translateX(2px); border-color: var(--landing-dawn-1); }
  }
  @keyframes d-strike { to { opacity: 0.45; text-decoration: line-through; text-decoration-color: var(--landing-display-grad-3); text-decoration-thickness: 2px; } }
  @keyframes d-hint {
    0% { max-height: 0; opacity: 0; margin-top: 0; }
    10%, 90% { max-height: 140px; opacity: 1; margin-top: 10px; }
    100% { max-height: 0; opacity: 0; margin-top: 0; }
  }

  /* ---- the real question, in night colours ----------------------------- */
  .desc-try {
    margin: 34px 0 0; width: 100%; max-width: 520px;
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
    --warn-bg: color-mix(in srgb, var(--landing-dawn-2) 18%, var(--landing-sky-top));
    --warn-text: var(--landing-dawn-3);
    color: var(--landing-on-night);
  }
  /* The explanation card after Check (also under the maths try). */
  .desc-try, .maths-try {
    --info-bg: color-mix(in srgb, var(--landing-aurora-2) 14%, var(--landing-sky-top));
    --info-text: var(--landing-aurora-2);
  }

  @media (max-width: 560px) {
    .sheet { padding: 16px; transform: none; }
    .sh-head { flex-direction: column; gap: 8px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .w, .sh-say, .replay, .tick, .pip { opacity: 1; transform: none; animation: none !important; }
    .kw { background: color-mix(in srgb, var(--landing-explorer) 45%, transparent); animation: none !important; }
    .pip { background: var(--landing-explorer); }
    .wrong { opacity: 0.45; text-decoration: line-through; animation: none !important; }
    .d-hint { max-height: none; opacity: 1; margin-top: 10px; animation: none !important; }
    .replay { display: none; }
  }
`;
