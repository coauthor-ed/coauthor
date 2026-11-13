import { css } from 'lit';

/**
 * content-block@1 under the plain look (an editorial explainer, look pack
 * plain SPEC sec 2): text-only slides as a centred reading page, the beat
 * rail replaced by a signature-colour bar, the figure (the live object) on
 * the paper under one ink rule, no card and no shadow (2026-11-05), and a
 * numbered figure caption. Every rule is keyed on
 * :host([data-look="plain"]) (LookMixin; Firefox has no :host-context), so
 * Quill renders exactly as before. Listed after theatreStyles so it wins
 * the cascade over the theatre's own rules. Colours are tokens only
 * (src/looks/plain/look.css).
 */
export const plainLookStyles = css`
  /* ── Reading page: a text-only slide is one centred column ── */
  :host([data-look="plain"]) .cb-reading {
    max-width: 68ch;
    margin-inline: auto;
    padding-top: var(--space-2, 8px);
    font-size: 1.15rem;
    line-height: 1.65;
  }
  :host([data-look="plain"]) .cb-reading .rv-steps > .rv-step { padding-left: 0; color: var(--text-main); }
  :host([data-look="plain"]) .cb-reading .rv-steps > .rv-step::before,
  :host([data-look="plain"]) .cb-reading .rv-steps > .rv-step::after,
  :host([data-look="plain"]) .cb-reading .rv-steps > .rv-step > markdown-renderer::before { display: none; }
  :host([data-look="plain"]) .cb-reading .rv-steps > .rv-step > markdown-renderer { padding-left: 0; background: none; }
  :host([data-look="plain"]) .cb-reading .rv-more { text-align: center; }

  /* ── fold: { after: N } (content-block _applyFold): the beats after the
     Nth sit behind one closed disclosure, a hairline and a quiet
     signature-ink line; no animation. ── */
  .cb-fold { margin: 0.75rem 0 0.25rem; border-top: 1px solid var(--rule-soft, var(--border-color)); }
  .cb-fold > summary {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 6px 2px;
    cursor: pointer;
    list-style: none;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--signature-ink, var(--primary-text));
    border-radius: var(--radius-sm, 4px);
  }
  .cb-fold > summary::-webkit-details-marker { display: none; }
  .cb-fold > summary::before {
    content: '';
    flex: none;
    width: 7px;
    height: 7px;
    margin-left: 2px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
  }
  .cb-fold[open] > summary::before { transform: rotate(45deg); margin-top: -4px; }
  .cb-fold > summary:hover .cb-fold-label { text-decoration: underline; text-underline-offset: 3px; }
  .cb-fold > summary:focus-visible { outline: var(--focus-ring, 2px solid var(--primary-color)); outline-offset: 2px; }
  .cb-fold-body { padding-top: 0.25rem; color: var(--text-main); }
  @media print { .cb-fold > summary { display: none; } }

  /* ── Beats beside a figure: no dot rail; the current beat carries a
     short signature-colour bar, past beats stay readable. ── */
  :host([data-look="plain"]) .rv-steps > .rv-step { padding-left: 0; color: var(--text-main); }
  :host([data-look="plain"]) .rv-steps > .rv-step::before,
  :host([data-look="plain"]) .rv-steps > .rv-step::after,
  :host([data-look="plain"]) .rv-steps > .rv-step > markdown-renderer::before { display: none; }
  :host([data-look="plain"]) .rv-steps > .rv-step > markdown-renderer {
    padding-left: 16px;
    background: linear-gradient(var(--signature), var(--signature)) no-repeat 0 4px / 0 calc(100% - 20px);
  }
  :host([data-look="plain"]) .rv-steps > .rv-step.rv-current > markdown-renderer { background-size: 3px calc(100% - 20px); }
  /* The opening beat's drop cap already marks it in the signature colour; a
     bar beside it reads as a stroke of the letter. No bar, same indent. */
  :host([data-look="plain"]) .rv-steps > .rv-step.rv-current > markdown-renderer[dropcap] { background-size: 0 0; }
  /* Past beats dim to the look's --reveal-past-opacity in the ink (>= 4.5:1),
     the same on a reading page and beside a figure. */
  :host([data-look="plain"]) .rv-steps > .rv-step.rv-past { opacity: var(--reveal-past-opacity, 0.7); }
  /* The beat entrance is the mixin's (ProgressiveDisclosureMixin _enterBeat,
     data-enter): content-block's own rv-enter would start before the text is
     rendered, so it is off here, in both motion settings. */
  :host([data-look="plain"]) .rv-step.rv-shown.rv-current:not([data-enter="run"]) { animation: none; }
  :host([data-look="plain"]) .rv-steps > .rv-step.rv-callout-result { margin-left: 0; border-left-color: var(--signature); }
  :host([data-look="plain"]) .cb-layout-right .cb-text,
  :host([data-look="plain"]) .cb-layout-left .cb-text { font-size: 1.03rem; line-height: 1.62; }
  :host([data-look="plain"]) .th-narr { font-size: 1.03rem; line-height: 1.62; }

  /* ── The figure: the live object on the paper under one ink rule. No card,
     no shadow, no side or foot rule (the rule width stays for the theatre's
     own geometry; only its colour goes). ── */
  :host([data-look="plain"]) .cb-sim-wrap .sim-host-container:not(.sim-host-container--frameless) {
    border-color: var(--rule-strong) transparent transparent;
  }
  /* A stage head carries the one rule; the figure under it takes none. */
  :host([data-look="plain"]) .cb-sim-wrap .cb-stage-head ~ .sim-host-container:not(.sim-host-container--frameless) {
    border-top-color: transparent;
  }
  :host([data-look="plain"]) .cb-sim-wrap .sim-host-container:not(.sim-host-container--frameless) {
    border-radius: 0;
    box-shadow: none;
    background: var(--bg-base);
  }
  :host([data-look="plain"]) .cb-sim-wrap .cb-figure { border-radius: 0; box-shadow: none; }
  :host([data-look="plain"]) .th-win {
    border-radius: 0;
    border-color: var(--rule-strong) transparent transparent;
    box-shadow: none;
    background: var(--bg-base);
  }
  :host([data-look="plain"]) .th-stage { box-shadow: none; border-radius: 0; border-color: transparent; background: var(--bg-base); }
  :host([data-look="plain"]) .th-win .cb-stage-head,
  :host([data-look="plain"]) .cb-sim-wrap .cb-stage-head {
    background: transparent;
    color: var(--text-main);
    border-color: var(--rule-strong) transparent transparent;
    border-radius: 0;
    font-size: 0.9rem;
  }
  :host([data-look="plain"]) .th-hb {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: var(--text-muted);
  }
  :host([data-look="plain"]) .th-hb:hover:not(:disabled) { background: var(--bg-panel); color: var(--text-main); }
  :host([data-look="plain"]) .th-sep { background: var(--border-color); }
  :host([data-look="plain"]) .th.plain .th-narr { padding-right: 18px; }

  /* ── Caption: "Fig. 1.4" then one sentence on what to see ── */
  :host([data-look="plain"]) .th-cap {
    margin: 0;
    padding: 10px 0 4px;
    border-top: 1px solid var(--border-color);
  }
  :host([data-look="plain"]) .cb-stage-caption,
  :host([data-look="plain"]) .th-cap {
    font-size: 0.86rem;
    font-style: normal;
    line-height: 1.45;
    color: var(--text-soft);
    text-align: left;
  }
  :host([data-look="plain"]) .cb-stage-caption { margin: 10px 2px 0; }
  :host([data-look="plain"]) .fig-no {
    font-weight: 700;
    color: var(--signature-ink);
    margin-right: 6px;
    font-variant-numeric: lining-nums tabular-nums;
  }
  .th-cap { margin: 8px 2px 0; font-size: 0.84rem; line-height: 1.45; color: var(--text-soft); }

  /* ── stage-scale + phone layout: a phone stacks the figure under the
     text at full width; its strip is one slim row of 40 px targets, so the
     figure starts right under the text. ── */
  @media (max-width: 600px) {
    :host([data-look="plain"]) .cb-sim-wrap > .cb-stage-head {
      padding: 2px 0;
      margin-bottom: 0;
      gap: 2px;
      justify-content: flex-end;
    }
    :host([data-look="plain"]) .cb-sim-wrap > .cb-stage-head .th-hb { width: 40px; height: 40px; }
    :host([data-look="plain"]) .cb-layout-below > .cb-sim-wrap { margin-top: 4px; }
    /* The figure follows the text closely: a short screen has no room for
       a 16px gap plus the "Show full" line's own top margin. */
    :host([data-look="plain"]) .cb-layout-below { gap: 8px; }
    :host([data-look="plain"]) .cb-layout-below .rv-more { margin-top: 4px; }
  }
`;
