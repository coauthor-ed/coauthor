import { html, css } from 'lit';
import {
  normalizeFocusRect, focusScale, focusTranslate, cameraScale,
  focusAnchorPoint, resolveCalloutAnchor, projectFocusPoint,
} from '../focusRect.js';
import { openImageLightbox } from '../../ui/components/imageLightbox.js';
import { CourseSourceManager } from '../CourseSourceManager.js';

/** Caption plus the visible attribution CC BY needs: "<caption> · Credit: <credit> (<license>)". Both parts optional. Plain text (Lit escapes it). */
export function imageCaptionText(image) {
  const credit = image?.credit ? `Credit: ${image.credit}${image.license ? ` (${image.license})` : ''}` : '';
  return [image?.caption, credit].filter(Boolean).join(' \u00b7 ');
}


/**
 * Shared "image beside/above/below the block's own content" layout —
 * originally built for content-block@1, now also used by poe-predict@1.
 * Shadow DOM means CSS can't just be shared by reference across components,
 * so this is imported into each plugin's own `static styles` array instead
 * (see e.g. ChoiceListBase.styles / poe-predict's `static styles = [ChoiceListBase.styles, css\`...\`]`
 * for the same pattern already used in this codebase).
 *
 * A consuming plugin wraps its own content in `<div class="cb-text">…</div>`
 * and pairs it with `renderBlockImage(image)` inside a `cb-layout-${position}`
 * wrapper — see content-block.js's render() for the reference usage.
 */
export const blockImageLayoutStyles = css`
  .cb-layout-right,
  .cb-layout-left {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }
  .cb-layout-right { flex-direction: row; }
  .cb-layout-left  { flex-direction: row-reverse; }

  .cb-layout-right .cb-text,
  .cb-layout-left  .cb-text {
    flex: 1 1 0;
    min-width: 0;
  }

  .cb-layout-above,
  .cb-layout-below {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .cb-layout-above { flex-direction: column-reverse; }
  .cb-layout-below { flex-direction: column; }

  .cb-image-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    /* Anchors .cb-zoom-trigger's corner position. */
    position: relative;
  }

  /* Non-intrusive tap-to-zoom trigger — shown only when resolveImageLayout()
     reports zoomAffordance:true (the image has been shrunk below a
     comfortable reading size). Small, icon-only, low-contrast-until-hovered:
     deliberately not a labelled button, so it never competes with the
     current beat's text for attention. Uses the same scrim tokens as the
     reveal spotlight (--reveal-scrim*) since both sit on top of arbitrary
     photo content rather than page chrome. */
  .cb-zoom-trigger {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--reveal-scrim);
    color: var(--reveal-on-scrim);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.75;
    transition: opacity 0.15s, background 0.15s;
  }
  .cb-zoom-trigger:hover,
  .cb-zoom-trigger:focus-visible {
    opacity: 1;
    background: var(--reveal-scrim-strong);
  }
  .cb-zoom-trigger:focus-visible {
    outline: 2px solid var(--reveal-on-scrim);
    outline-offset: 2px;
  }
  .cb-layout-background .cb-zoom-trigger {
    /* .cb-image-wrap is absolutely positioned edge-to-edge for the
       background layout — z-index above the scrim text so it stays
       reachable. */
    z-index: 3;
  }

  /* Side-by-side: the image takes a bit under half the row. It was 38% of a
     column capped at 800px — about 300px, small enough that a labelled diagram
     was unreadable while most of the display sat empty. */
  .cb-layout-right .cb-image-wrap,
  .cb-layout-left  .cb-image-wrap {
    flex: 1.5 1 55%;
    max-width: 60%;
    /* Same fix, same reason, as .cb-sim-wrap's own sticky rule
       (content-block.js): progressive disclosure lets the text column beside
       this grow far taller than the viewport, and the row itself
       (align-items: flex-start) otherwise leaves the image pinned to the
       *top* of that row — so scrolling down to a later beat scrolls the
       image straight off the top of the screen while the beat text (and any
       sibling simulation, which already had this rule) stays in view. This
       is what the current beat's own reveal.images swap-in was scrolling
       away from before the student ever saw it. */
    position: sticky;
    top: calc(var(--lesson-sticky-header-h, 0px) + 12px);
  }

  /* Above/below run the full width of a container that is now much wider, so
     the constraint that matters is vertical: at 1180px these sources would
     render ~800px tall and push the text off screen, and the student would be
     scrolling to see what they were just told to look at. Capping the column
     rather than the <img> keeps its width:100% / height:auto intact — setting
     width:auto on the image instead lets it take its natural 1536px and
     overflow, because the focus wrappers between it and the column have no
     width of their own. */
  .cb-layout-above .cb-image-wrap,
  .cb-layout-below .cb-image-wrap {
    max-width: 820px;
    /* Flush with .cb-text's own left edge (68ch max-width, no align-self of
       its own — see content-block.js), not centered on the column: on a wide
       viewport the column is far wider than either the image or the 68ch
       text cap, and centering only the image left them with no shared edge
       to read as one slide. */
    align-self: flex-start;
    width: 100%;
  }
  /* The height-capped tier (.cb-image-capped, below) shrinks the <img> itself
     but the column-width rule above still sizes the *wrap* — without this,
     a portrait image capped down to a few hundred px sits lost inside an
     820px box, and .cb-zoom-trigger (absolutely positioned against this
     wrap's own corner) ends up nowhere near the image it's meant to zoom. */
  .cb-layout-above .cb-image-wrap.cb-image-capped,
  .cb-layout-below .cb-image-wrap.cb-image-capped {
    width: fit-content;
    max-width: 100%;
  }

  .cb-image-wrap img {
    width: 100%;
    height: auto;
    border-radius: 8px;
    overflow: hidden;
    display: block;
    box-shadow: var(--shadow-md);
    background: var(--shell-bg);
  }

  /* Light/dark diagram pair (see renderBlockImage()'s srcDark doc comment).
     Both <img> occupy the same slot; exactly one is shown at a time, purely
     via these tokens flipping with html[data-theme] in theme.css — no JS
     re-render needed. Higher specificity than the plain .cb-image-wrap img
     rule above (two classes vs. one) so it always wins for these two. */
  .cb-image-wrap img.cb-image-variant-light { display: var(--cb-image-light-display, block); }
  .cb-image-wrap img.cb-image-variant-dark  { display: var(--cb-image-dark-display, none); }

  /* The last tier resolveImageLayout() picks before folding text onto the
     image entirely: the image no longer gets its full natural height, so it
     shrinks (rather than the text losing its budget) and the tap-to-zoom
     trigger (imageLightbox.js) becomes the way to see it at full size. */
  .cb-image-wrap.cb-image-capped {
    position: relative;
  }
  .cb-image-wrap.cb-image-capped img {
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: min(48vh, 420px);
    margin: 0 auto;
  }

  .cb-caption {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-style: italic;
    text-align: center;
  }

  /* ── position: "background" — text over a full-bleed image ───────────────
     The slide fills the space it is given and the text sits on top of the
     image rather than above or beside it.

     This exists because of a specific failure of the below position: each revealed beat
     is another paragraph of text, so the image underneath walks further down
     the page on every click — the thing the student was told to look at slides
     away from them, once per beat. The below position itself now animates
     that walk smoothly instead of snapping (content-block.js's willUpdate()/updated()
     pair, flipAnimate.js) rather than reserving space to prevent it outright
     — but a smooth slide is still a slide, and for a full-bleed hero image
     the better answer is for it to never move at all. Overlaying removes the
     problem entirely: the image never moves because the text was never above it.

     An authored choice, not a default — it needs an image with somewhere quiet
     to put words, so it is offered in the editor and never inferred. */
  .cb-layout-background {
    position: relative;
    display: flex;
    align-items: flex-end;
    min-height: min(70vh, 640px);
    border-radius: 12px;
    overflow: hidden;
    background: var(--shell-bg);
  }
  .cb-layout-background .cb-image-wrap {
    position: absolute;
    inset: 0;
    display: block;
  }
  .cb-layout-background .cb-image-wrap img,
  .cb-layout-background .cb-image-viewport {
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }
  .cb-layout-background .cb-image-wrap img {
    object-fit: cover;
  }
  .cb-layout-background .cb-focus-group {
    width: 100%;
    height: 100%;
  }
  /* The caption has no room to sit under a full-bleed image; it rides with the
     text instead, where the scrim already guarantees it is legible. */
  .cb-layout-background .cb-caption {
    position: relative;
    z-index: 2;
    align-self: flex-start;
  }
  .cb-layout-background .cb-text {
    position: relative;
    z-index: 1;
    width: 100%;
    padding: 1.5rem;
    box-sizing: border-box;
    /* Legibility over an image whose brightness cannot be known in advance —
       and it really cannot: the spotlight can leave a near-white panel
       directly behind the words. So the wash stays at full strength for the
       whole height the text actually occupies and only fades over the last
       fifth, which is above the text and exists purely to avoid a hard edge
       across the picture. An earlier version ramped from the bottom and left
       the heading sitting on the transparent end of the gradient, unreadable.
       The text-shadow is the second line of defence for a heading that wraps
       past the top of the box. */
    background: linear-gradient(
      to top,
      var(--reveal-scrim-strong, rgb(0 0 0 / 0.86)) 0%,
      var(--reveal-scrim-strong, rgb(0 0 0 / 0.86)) 72%,
      var(--reveal-scrim, rgb(0 0 0 / 0.55)) 88%,
      transparent 100%
    );
    color: var(--reveal-on-scrim, #ffffff);
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.75);
    padding-top: 3rem;
    /* A prior beat recedes less here than it does on a plain background. The
       0.7 dim is comfortable against the page, but over a photograph it
       compounds with whatever is showing through the scrim, and grey-on-busy
       stops being readable rather than merely quiet. */
    --reveal-dim: 0.85;
    --reveal-past-color: rgba(255, 255, 255, 0.85);
  }

  @media (max-width: 600px) {
    .cb-layout-background { min-height: min(62vh, 460px); }
    .cb-layout-background .cb-text { padding: 1rem; }
  }

  /* Responsive: stack side-by-side layouts on narrow viewports */
  @media (max-width: 600px) {
    .cb-layout-right,
    .cb-layout-left {
      flex-direction: column;
    }
    .cb-layout-right .cb-image-wrap,
    .cb-layout-left  .cb-image-wrap {
      /* Stacked layout puts the image in normal document flow above/below
         the text rather than beside it, so sticking it mid-scroll would
         fight the very text it's meant to sit next to — same reasoning as
         .cb-sim-wrap's own mobile override in content-block.js. */
      position: static;
      flex: unset;
      max-width: 100%;
    }
  }

  /* ── Media entrance (mediaStep) ──────────────────────────────────────
     Played once, only on a .cb-image-wrap/.cb-sim-wrap that was gated
     behind mediaStep and is entering the DOM now that its beat was
     reached — never on a block whose media is visible from the first beat.
     A CSS *animation*, not a *transition*, for the same reason .rv-step's
     own entry uses one (content-block.js's own comment on .rv-step): the
     element has no previously-painted state for a transition to start from,
     since it did not exist in the DOM a moment ago. */
  @keyframes cb-media-pop {
    from { opacity: 0; transform: translateY(var(--motion-reveal-rise, 8px)); }
    to   { opacity: 1; transform: none; }
  }
  .cb-media-pop {
    animation: cb-media-pop var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
  }
  @keyframes cb-media-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  /* Same Shadow-DOM caveat as blockImageFocusStyles' own copy below: the
     global reduced-motion rule in theme.css is written against the universal
     selector and does not pierce Shadow DOM, so this has to be re-declared
     here too. Only the travel is dropped — the cross-fade stays, since a
     beat's media popping in with no indication anything happened reads as a
     bug, not an accommodation. */
  @media (prefers-reduced-motion: reduce) {
    .cb-media-pop { animation-name: cb-media-fade; }
  }
`;

/**
 * Focus styles for a *staged* block image — kept strictly separate from
 * `.cb-image-wrap` above, which is shared with `poe-predict@1` and
 * `QuestionBase` and must not gain reveal behaviour.
 *
 * ## Why a mask and not a zoom
 *
 * The obvious design — pin the viewport to the image's aspect ratio and
 * `transform: scale()` onto the focus rect — is arithmetically broken for the
 * shape of image this content actually has, and it is worth recording why so
 * nobody rebuilds it.
 *
 * To cover the viewport with no blank gutter, the scale must satisfy
 * `s >= 0.5 / min(cx, 1-cx)` and the same in y. For the canonical case — a
 * left-to-right row of four organisms, first band `{x:0, y:0, w:0.25, h:1}` —
 * `min(1/w, 1/h)` is `min(4, 1) = 1`: *no zoom at all*, a blank gutter across
 * 37.5% of the viewport, and the other three organisms still fully visible.
 * The precise opposite of the intent. `min(1/w,1/h)` is *contain* semantics;
 * a viewport crop needs *cover*, `max(1/w,1/h)`, which here demands `s >= 4`.
 *
 * But cover cannot frame a row-of-N band either: at the image's own ~1.33
 * aspect, a 0.25-wide full-height band has aspect 0.33, so cover at s=4 shows
 * the middle quarter of the band's *height* — it frames the organism's
 * midriff. Framing a whole band needs a viewport aspect equal to the band's,
 * i.e. a 16:3 (4096x768) source for four 4:3 panels. No generator in the
 * authoring loop emits that: ChatGPT offers 1024², 1536x1024, 1024x1536;
 * Imagen/Gemini offer 1:1, 3:4, 4:3, 9:16, 16:9. Row-of-N is not producible.
 *
 * And resolution kills deep zoom regardless. Shipped sources top out around
 * 1029px wide. At s=2, a 700 CSS-px column on a 2x-DPR phone asks 2800 device
 * px of 512 source px — a 5.5x upscale. s=2 is already soft; s=4 is mush.
 *
 * What does work at any zoom, aspect and source resolution is dimming
 * everything *outside* the focus rect. It costs nothing, is
 * resolution-independent, works on the 1024x768 images already in `/content`,
 * and — the part that generalises — it makes `focus` meaningful on an ordinary
 * non-panel image, where the instruction is simply "look here". A gentle scale
 * composes on top as an accent, capped well below where the upscale shows.
 *
 * **Mask is primary; transform is garnish.**
 */
export const blockImageFocusStyles = css`
  .cb-image-viewport {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: 8px;
    line-height: 0;
    /* Load-bearing. The viewport and the group below sit between the <img> and
       the column that sizes it; without a max-width of their own the image
       resolves against its natural size and overflows the layout. */
    max-width: 100%;
  }
  /* The image and its spotlight are transformed *together*, as one group.
     Transforming only the <img> would slide it out from under a mask that is
     still laid out against the untransformed box — the spotlight would land on
     empty space. (This is the same coordinate-space mismatch that makes
     DiagramAnnotator's SVG overlay unusable over a transformed image: it
     measures img.clientWidth, the layout width. Do not layer the two.)

     transform-origin stays at its 50% 50% default and the order (scale then
     translate) is load-bearing: percentages in a CSS translate resolve against
     the element's own border box, unaffected by the outer scale, so
     scale(s) translate(tx, ty) composes as S·T and centring the focus is
     tx = (0.5 - cx), ty = (0.5 - cy). Written the other way round it would
     need t = -s·c instead. Do not set transform-origin or transform-box here. */
  .cb-focus-group {
    position: relative;
    display: block;
    max-width: 100%;
    transform-origin: 50% 50%;
    transition:
      transform var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
  }
  .cb-image-viewport img {
    width: 100%;
    height: auto;
    display: block;
  }

  /* The spotlight. One positioned rect casting an enormous spread shadow
     outward, which dims everything around it in a single compositable layer —
     no second image, no clip-path recalculation per frame. */
  .cb-focus-mask {
    position: absolute;
    pointer-events: none;
    border-radius: 6px;
    box-shadow: 0 0 0 9999px var(--reveal-scrim, rgb(0 0 0 / 0.55));
    opacity: 0;
    transition:
      opacity var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out),
      left var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out),
      top var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out),
      width var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out),
      height var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
  }
  .cb-image-viewport.cb-focused .cb-focus-mask { opacity: 1; }
  
  /* Clean Cut mode: The mask becomes fully opaque using the page background 
     color, completely hiding any "context" or other halves. */
  .cb-image-viewport.cb-mask-opaque .cb-focus-mask {
    box-shadow: 0 0 0 9999px var(--shell-bg);
  }

  /* The label callout — a short author-written tag (e.g. "Nucleus") pinned to
     one edge of the current beat's focus rect. Deliberately a *sibling* of
     .cb-focus-group, not a child of it: the group is what gets
     scale()/translate() applied for the pan/zoom accent, and text rendered
     inside that transform would blur/distort away from 1x. This sits in
     .cb-image-viewport's own unscaled frame instead, positioned via
     projectFocusPoint() (focusRect.js) — the same scale/translate the mask
     uses, applied to a single point rather than a whole rect — so it tracks
     the mask exactly without being subject to the transform itself. Reuses
     the same scrim tokens as the mask/zoom-trigger (--reveal-scrim-strong,
     --reveal-on-scrim): all three sit on top of arbitrary photo content, not
     page chrome, so they share the "must read regardless of what's under it"
     requirement rather than following the light/dark page theme. */
  .cb-callout {
    position: absolute;
    z-index: 2;
    pointer-events: none;
    max-width: min(200px, 40%);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: var(--fw-medium);
    line-height: 1.25;
    background: var(--reveal-scrim-strong);
    color: var(--reveal-on-scrim);
    box-shadow: var(--shadow-sm);
    transition:
      left var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out),
      top var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
  }
  /* Offset from the anchor point in the direction *away* from the rect, so
     the callout reads as pointing back at what it labels. */
  .cb-callout-right  { transform: translate(10px, -50%); }
  .cb-callout-left   { transform: translate(calc(-100% - 10px), -50%); }
  .cb-callout-top    { transform: translate(-50%, calc(-100% - 10px)); }
  .cb-callout-bottom { transform: translate(-50%, 10px); }

  /* Same reason as content-block's own copy: theme.css's reduced-motion block
     is written against the universal selector and does not pierce Shadow DOM.
     Only the *travel* is dropped — the pan and zoom, which is what the
     preference is actually about. The spotlight still cross-fades from one
     region to the next, because a spotlight that teleports with no transition
     is indistinguishable from a rendering glitch, and the whole point of the
     mask is to tell the student where to look next. */
  /* The comic camera: a slow, eased move (about a second) from one beat's
     framing to the next, like an interactive comic turning to the next
     panel. The whole image comes back on a beat with no rect. */
  .cb-image-viewport.cb-cam .cb-focus-group {
    transition: transform var(--motion-camera, 1000ms) var(--motion-camera-ease, cubic-bezier(0.45, 0, 0.25, 1));
    will-change: transform;
  }
  @media (prefers-reduced-motion: reduce) {
    .cb-focus-group { transition: none !important; }
    .cb-callout { transition: none !important; }
  }
`;

/**
 * @param {object} image
 * @param {{capped?: boolean, zoomAffordance?: boolean, pop?: boolean, widthPx?: number|null}} [opts]
 *   `capped`/`zoomAffordance`/`widthPx` come from `resolveImageLayout()` — see
 *   there; `widthPx` overrides the side layout's default 60%-of-column width
 *   when a portrait image was shrunk to fit the height budget instead.
 *   `pop` plays the `cb-media-pop` entrance animation, for a block whose
 *   image was gated behind `mediaStep` and is entering the DOM for the first
 *   time now that its beat was reached (never set for an image visible from
 *   the block's first beat, which needs no entrance).
 *
 * Optional `image.srcDark`: a hand-authored recolour of the same diagram for
 * dark mode (an `<img>`-loaded file — SVG or otherwise — can't resolve the
 * host page's CSS custom properties, so a raster/vector diagram can't repaint
 * itself the way a live Canvas simulation does). When present, BOTH images
 * are rendered and CSS alone toggles which is visible via the
 * `--cb-image-light-display`/`--cb-image-dark-display` tokens (theme.css) —
 * those flip instantly with the app's `data-theme` attribute the same way
 * every other themed value does, so the swap needs no JS and no re-render.
 * Omitting `srcDark` renders exactly one `<img>`, unchanged from before.
 */
export function renderBlockImage(image, opts = {}) {
  if (!image?.src) return html``;
  const { capped = false, zoomAffordance = false, pop = false, widthPx = null, bundleId = null } = opts;
  const hasDark = !!image.srcDark;
  return html`
    <div class="cb-image-wrap ${capped ? 'cb-image-capped' : ''} ${pop ? 'cb-media-pop' : ''}"
         style="${widthPx ? `max-width:${Math.round(widthPx)}px` : ''}">
      <img
        class="${hasDark ? 'cb-image-variant-light' : ''}"
        src="${CourseSourceManager.resolveRef(image.src, bundleId)}"
        alt="${image.alt || ''}"
        loading="lazy"
        decoding="async"
      >
      ${hasDark ? html`
      <img
        class="cb-image-variant-dark"
        src="${CourseSourceManager.resolveRef(image.srcDark, bundleId)}"
        alt="${image.alt || ''}"
        loading="lazy"
        decoding="async"
      >` : ''}
      ${zoomAffordance ? renderZoomTrigger(image, bundleId) : ''}
      ${imageCaptionText(image) ? html`<span class="cb-caption">${imageCaptionText(image)}</span>` : ''}
    </div>
  `;
}

/**
 * The non-intrusive "view larger" affordance for an image `resolveImageLayout()`
 * has had to shrink below a comfortable reading size. Icon-only, low visual
 * weight, corner-positioned — deliberately not a labelled button, per the
 * explicit "non-intrusive and non-distracting" requirement this exists to
 * satisfy.
 */
function renderZoomTrigger(image, bundleId = null) {
  return html`
    <button
      type="button"
      class="cb-zoom-trigger"
      aria-label="View image larger"
      title="View larger"
      @click=${() => openImageLightbox(image, bundleId)}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4"/>
      </svg>
    </button>
  `;
}

/** position: "right" (default) | "left" | "above" | "below" */
export function blockLayoutClass(image, simulation) {
  const position = image?.position || simulation?.position || 'right';
  return `cb-layout-${position}`;
}

/**
 * Measure an image's natural pixel dimensions without waiting for it to be
 * the lazy-loaded `<img>` actually mounted in the DOM — `resolveImageLayout`
 * needs to know the aspect ratio *before* picking a layout, which the
 * existing `loading="lazy"` `<img>` (`renderBlockImage`/
 * `renderBlockImageViewport`, deliberately dimension-free per their own
 * comment above) can't provide in time. The browser's own image cache means
 * this costs nothing extra once the real `<img>` mounts with the same `src`.
 */
export function probeImageDimensions(src, bundleId = null) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = CourseSourceManager.resolveRef(src, bundleId);
  });
}

/** Below this rendered width, a dense infographic's baked-in text is assumed
 *  to be unreadable — the empirical case this whole mechanism exists for
 *  (a ~1024px-wide multi-panel diagram scaled into a ~350px phone column). */
const LEGIBLE_MIN_RENDER_WIDTH = 480;
/** A tall image is not allowed to claim so much height that the current beat
 *  has nowhere left to sit — roughly 4 lines of body text. */
const MIN_TEXT_BUDGET_PX = 180;
/** The last, most-constrained tier before folding text onto the image. */
const MIN_CAPPED_HEIGHT_PX = 80;
/** Below this, a side-by-side image isn't worth the column space it costs the
 *  text — degrade to "above" (height-bound, not width-bound there) instead. */
const MIN_SIDE_WIDTH_PX = 260;

/**
 * Decide the actual rendered layout for a block's image at render time,
 * instead of trusting the author's authored `image.position` unconditionally
 * regardless of the image's real aspect ratio or the viewport's real
 * available space (the bug this function exists to fix). The author's
 * position is honored whenever it comfortably fits; otherwise the layout
 * degrades through a defined chain so the current beat's text can never be
 * squeezed off screen by a tall or dense image.
 *
 * Column-width and cap numbers (`0.6`, `820`) are the same constants
 * `blockImageLayoutStyles` already renders against — this function predicts
 * what that CSS will actually produce, it doesn't invent new sizing rules,
 * *except* for a portrait image at the side position (see `sideFit()` below),
 * where it now overrides the CSS's fixed 60% via an inline width.
 *
 * @param {{positionHint?: string, naturalWidth?: number, naturalHeight?: number,
 *   columnWidth?: number, availableHeight?: number, isNarrow?: boolean}} opts
 * @returns {{layout: string, capped: boolean, zoomAffordance: boolean, widthPx: number|null}}
 */
/**
 * Shared degrade-chain arithmetic for both resolveImageLayout() (images)
 * and resolveSimLayout() (simulations). Not exported — each public
 * function applies its own tier-specific policy on top of this (images add
 * `capped`/`zoomAffordance`/a background-scrim tier; simulations omit all
 * three — see docs/sprints/wip/dom-simulation-auto-layout.md §3.3).
 *
 * @param {{positionHint: string, aspect: number, columnWidth: number,
 *   availableHeight: number, isNarrow: boolean, isPortrait: boolean,
 *   minSideWidthPx: number, minTextBudgetPx: number, capHeightPx: number,
 *   allowBackground: boolean, allowCapped: boolean, sideMaxFraction: number,
 *   aboveMaxWidthPx: number, sideFailureFallback: 'above'|'below'}} opts
 * @returns {{layout: string, widthPx: number|null, capped: boolean, renderWidth: number}}
 */
function _resolveMediaLayout({
  positionHint, aspect, columnWidth, availableHeight, isNarrow, isPortrait,
  minSideWidthPx, minTextBudgetPx, capHeightPx, allowBackground, allowCapped,
  sideMaxFraction, aboveMaxWidthPx, sideFailureFallback,
}) {
  const budget = (Number.isFinite(availableHeight) ? availableHeight : Infinity) - minTextBudgetPx;
  // Side-by-side text lives in its own column (flex:1 1 0, independent
  // height) — it never shares vertical space with the media the way
  // above/below's single shared column does, so reserving minTextBudgetPx
  // out of a SIDE panel's height doesn't defend anything real there. It was
  // capping a landscape phone's side panel to a noticeably smaller size
  // than the height it actually had spare — "cramped" even after the panel
  // had already shrunk once to fit (sideFit()'s whole job). Only sideFit()
  // uses this; every other budget check below keeps sharing the column with
  // text and still needs the reservation.
  const sideBudget = Number.isFinite(availableHeight) ? availableHeight : Infinity;
  const maxSideWidth = columnWidth * sideMaxFraction;
  const aboveWidth = Math.min(columnWidth, aboveMaxWidthPx);
  const aboveHeight = aboveWidth / aspect;

  const result = (layout, widthPx = null, capped = false) => {
    const renderWidth = widthPx != null ? widthPx : (layout === 'background' ? columnWidth : aboveWidth);
    return { layout, widthPx, capped, renderWidth };
  };

  if (positionHint === 'background') {
    return result('background');
  }

  /**
   * The side position's width used to be a flat 60% of the column, full
   * stop — fine for a landscape diagram, but a portrait image at 60% of a
   * *wide* column is even taller in absolute pixels, so on a spacious
   * desktop viewport this would ALWAYS blow the height budget and degrade
   * away from "right" regardless of how much horizontal room was sitting
   * unused right next to the text (the actual bug report this fixes: "ample
   * screen real-estate horizontally... still narrow"). Instead, shrink the
   * side width down to whatever height *does* fit, and only give up on the
   * side position — falling through to the fallback tier, which is bound by
   * height, not width, so extra horizontal space genuinely can't help it —
   * once that shrunk width stops being worth the column space it costs the
   * text.
   */
  function sideFit() {
    if (isNarrow) return null;
    // Portrait: even where the height BUDGET is generous (a tall phone has
    // plenty of vertical room), a side-by-side COLUMN is inherently the
    // scarce dimension for a portrait viewport — a shrunk-to-fit side panel
    // would still read as uncomfortably thin. Skip straight to the fallback
    // tier rather than manufacturing a technically-valid but cramped column.
    if (isPortrait) return null;
    if (maxSideWidth / aspect <= sideBudget) return maxSideWidth; // full ceiling already fits
    if (!Number.isFinite(sideBudget) || sideBudget <= 0) return null;
    const fitWidth = sideBudget * aspect; // width whose height == sideBudget exactly
    return fitWidth >= minSideWidthPx ? fitWidth : null;
  }

  /**
   * Shrinks the above/below width so the media's own aspect-locked height
   * fits the vertical budget — the above/below counterpart to sideFit()'s
   * shrink-to-height-budget math above, only reached by a caller with no
   * capped tier of its own (see the "hint didn't fit" branch below).
   */
  function aboveFit() {
    if (!Number.isFinite(budget) || budget <= 0) return null;
    const fitWidth = budget * aspect; // width whose height == budget exactly
    return fitWidth >= minSideWidthPx ? fitWidth : null;
  }

  const wantsSide = positionHint === 'right' || positionHint === 'left';
  if (wantsSide) {
    const w = sideFit();
    if (w) return result(positionHint, w);
  }
  if ((positionHint === 'above' || positionHint === 'below') && aboveHeight <= budget) {
    return result(positionHint);
  }

  // The hint didn't fit — degrade: side (if not already tried) ->
  // sideFailureFallback -> height-capped (images only) -> background
  // (images only) -> width-shrunk sideFailureFallback (no capped/background
  // tier of their own — simulations) -> sideFailureFallback again, at full
  // width, as the absolute last resort.
  if (!wantsSide) {
    const w = sideFit();
    if (w) return result('right', w);
  }
  if (aboveHeight <= budget) {
    return result(sideFailureFallback);
  }
  if (allowCapped && Number.isFinite(budget) && budget > capHeightPx) {
    // sideFailureFallback, not a hardcoded 'above' — this is still a
    // fallback tier (nothing fit at full size), so it should degrade in the
    // same direction as every other fallback tier above/below it, for the
    // same "media sits after the beat list, not before it" reason (see
    // resolveImageLayout()'s own comment on its sideFailureFallback value).
    return result(sideFailureFallback, null, true);
  }
  if (allowBackground) {
    return result('background');
  }
  // No capped/background tier to fall back on (simulations, §3.3) — rather
  // than handing back the full-column width at a height that blows the
  // budget (leaving part of the panel below the fold, forcing a scroll the
  // student has no reason to expect), shrink the panel's width so its own
  // aspect-locked height fits, mirroring sideFit()'s shrink-to-height-budget
  // math above, just applied to the vertical tier instead of the side one.
  if (!allowCapped) {
    const w = aboveFit();
    if (w) return result(sideFailureFallback, w);
  }
  return result(sideFailureFallback);
}

/**
 * Decide the actual rendered layout for a block's image at render time,
 * instead of trusting the author's authored `image.position` unconditionally
 * regardless of the image's real aspect ratio or the viewport's real
 * available space (the bug this function exists to fix). The author's
 * position is honored whenever it comfortably fits; otherwise the layout
 * degrades through a defined chain so the current beat's text can never be
 * squeezed off screen by a tall or dense image.
 *
 * Column-width and cap numbers (`0.6`, `820`) are the same constants
 * `blockImageLayoutStyles` already renders against — this function predicts
 * what that CSS will actually produce, it doesn't invent new sizing rules,
 * *except* for a portrait image at the side position (see `sideFit()` below),
 * where it now overrides the CSS's fixed 60% via an inline width.
 *
 * @param {{positionHint?: string, naturalWidth?: number, naturalHeight?: number,
 *   columnWidth?: number, availableHeight?: number, isNarrow?: boolean}} opts
 * @returns {{layout: string, capped: boolean, zoomAffordance: boolean, widthPx: number|null}}
 */
export function resolveImageLayout({
  positionHint = 'right',
  naturalWidth,
  naturalHeight,
  columnWidth,
  availableHeight,
  isNarrow = false,
} = {}) {
  // Dimensions not measured yet (probe in flight) — render exactly what the
  // author asked for, same as before this function existed. `content-block.js`
  // re-resolves once the probe settles, so this is a one-time initial state,
  // not a permanent fallback.
  if (!naturalWidth || !naturalHeight || !columnWidth) {
    return { layout: positionHint, capped: false, zoomAffordance: false, widthPx: null };
  }

  const aspect = naturalWidth / naturalHeight;
  const r = _resolveMediaLayout({
    positionHint,
    aspect,
    columnWidth,
    availableHeight,
    isNarrow,
    isPortrait: false,                 // images don't get the new short-circuit — see §3.2/§9.7
    minSideWidthPx: MIN_SIDE_WIDTH_PX,
    minTextBudgetPx: MIN_TEXT_BUDGET_PX,
    capHeightPx: MIN_CAPPED_HEIGHT_PX,
    allowBackground: true,
    allowCapped: true,
    sideMaxFraction: 0.6,
    aboveMaxWidthPx: 820,
    // 'below', not 'above' — matches resolveSimLayout()'s own choice (§3.2)
    // and for the identical reason: an "above" fallback sits visually
    // *before* the entire progressively-revealed beat list, not just the
    // current beat, so once enough beats accumulate to exceed the viewport,
    // no scroll-alignment of the current beat can keep both it and the
    // media in view at once — the media just scrolls off-screen, invisible,
    // for every beat after the first one or two (this was a real, reported
    // bug: a portrait image degrading to "above" on a mobile/portrait
    // viewport vanished on every beat past the first). A sticky "above"
    // panel was tried and rejected: sticky only works for the side ("right"/
    // "left") tier because that media sits *beside* the text column, never
    // behind it — "above"/"below" share one column, so a stuck "above"
    // panel paints over whatever past-beat text scrolls underneath it.
    // "below" has no such conflict: the media sits after all the beats, in
    // normal flow, and _scrollBeatBlockAlign() (content-block.js) already
    // pins the current beat to the top of the viewport for a "below" panel,
    // leaving the media visible below it — exactly the mechanism that
    // already works cleanly for every simulation. This is a deliberate
    // change from this function's own prior behavior (this line used to
    // read 'above', preserving pre-adaptive-layout output bit-for-bit) — an
    // explicit author `image.position: "above"` still renders "above"
    // directly whenever it fits (the branch above this one), unaffected;
    // only the *fallback*, taken when no authored hint fits at all, changes.
    sideFailureFallback: 'below',
  });

  return {
    layout: r.layout,
    capped: r.capped,
    zoomAffordance: r.capped || r.renderWidth < LEGIBLE_MIN_RENDER_WIDTH,
    widthPx: r.widthPx,
  };
}

// Simulation "flow" position tuning — see
// docs/sprints/wip/dom-simulation-auto-layout.md §11.2 (open item §9.8: not
// yet verified against real authored content).
const MIN_FLOW_COLUMN_WIDTH_PX = 560; // below this, wrapping isn't worth it at all
const FLOW_MAX_FRACTION = 0.35;       // deliberately much smaller than the side tier's 0.6
const MIN_FLOW_WIDTH_PX = 160;        // panel-side floor — no raster legibility floor applies
const MIN_WRAP_TEXT_WIDTH_PX = 340;   // ~45ch — the wrap column while the float is tall

/**
 * Side-panel "fit at rest" helpers (Q-55, Q-57; shared with poe-predict@1 by
 * Q-59). A side panel is sticky at header + 12 px, and _availableHeight()
 * budgets for that STUCK position; on a fresh slide (scroll 0) the row sits
 * lower (progress bar, gap above the row), so a panel sized to the budget
 * ended under the fixed action bar. The rest offset is how much lower.
 */

/** The side row's top in page coordinates (where the panel sits at scroll
 *  0), or null without a row. Depends only on what is above the row, never
 *  on the panel's own size, so measuring it cannot loop. */
export function measureRestTop(row) {
  if (!row) return null;
  return Math.round(row.getBoundingClientRect().top + (document.scrollingElement?.scrollTop || 0));
}

/** True when a new measureRestTop() reading should replace the cached one
 *  (ignores sub-3 px jitter). */
export function restTopChanged(prev, next) {
  if (next === prev) return false;
  if (next != null && prev != null && Math.abs(next - prev) < 3) return false;
  return true;
}

/** How much lower than its sticky spot the side row sits at rest; 0 until
 *  measured. */
export function sideRestExtra(restTop) {
  if (restTop == null || typeof window === 'undefined') return 0;
  const parsed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lesson-sticky-header-h'));
  const stickyTop = (Number.isFinite(parsed) ? parsed : 120) + 12;
  return Math.max(0, restTop - stickyTop);
}

/** Shrinks a side-tier resolveImageLayout() result so the image and its
 *  caption fit above the action bar at rest. The tier never changes, only
 *  the width. `captionEl` is the rendered .cb-caption (null before paint). */
export function fitSideImageAtRest(result, { naturalWidth, naturalHeight, captionEl, restExtra, availableHeight }) {
  if (!result || (result.layout !== 'right' && result.layout !== 'left') || result.widthPx == null) return result;
  if (!naturalWidth || !naturalHeight) return result;
  const aspect = naturalWidth / naturalHeight;
  const capH = captionEl ? captionEl.getBoundingClientRect().height + 6 : 0;
  const overflow = result.widthPx / aspect + restExtra + capH - availableHeight;
  if (overflow <= 0) return result;
  return { ...result, widthPx: Math.max(0, result.widthPx - overflow * aspect) };
}

/**
 * Q-60: the image fit content-block and poe-predict run (resolveImageLayout
 * + fitSideImageAtRest), packaged as a Lit reactive controller for hosts
 * that had none: QuestionBase and mcq-single@2. Listeners are attached only
 * once `active()` is true (an image or a setup sim), so a question with no
 * media pays nothing. Every listener just asks the host to re-render.
 *
 *   this._mediaFit = new BlockImageFitController(this, {
 *     image: () => this._data?.image, bundleId: () => this._ctx?.bundleId,
 *     active: () => ..., });
 *   const fit = this._mediaFit.resolve();   // in render(), or null
 *
 * Questions never take the background tier (text over the picture): a
 * picture that fits nowhere falls back to the capped tier below the text.
 */
export class BlockImageFitController {
  constructor(host, { image, bundleId = () => null, active = () => !!image()?.src } = {}) {
    this.host = host;
    this._image = image;
    this._bundleId = bundleId;
    this._active = active;
    this._dims = null;
    this._probedSrc = null;
    this._columnWidth = 0;
    this._narrow = false;
    this._shortLandscape = false;
    this._restTop = null;
    this._last = null;
    this._attached = false;
    host.addController(this);
  }

  hostConnected() {
    if (this._wasAttached) this._attach();
  }

  hostDisconnected() {
    this._wasAttached = this._attached;
    this._detach();
  }

  hostUpdated() {
    if (!this._attached && this.host.isConnected && this._active()) this._attach();
    const layout = this._last?.layout;
    const row = (layout === 'right' || layout === 'left')
      ? this.host.shadowRoot?.querySelector(`.cb-layout-${layout}`) : null;
    const next = measureRestTop(row?.querySelector(':scope > .cb-image-wrap') ? row : null);
    if (!restTopChanged(this._restTop, next)) return;
    this._restTop = next;
    this.host.requestUpdate();
  }

  _attach() {
    if (this._attached || typeof window === 'undefined') return;
    this._attached = true;
    const update = () => this.host.requestUpdate();
    this._mq = window.matchMedia('(max-width: 600px)');
    this._mqShort = window.matchMedia('(max-height: 600px) and (orientation: landscape)');
    this._narrow = this._mq.matches;
    this._shortLandscape = this._mqShort.matches;
    this._onMq = () => { this._narrow = this._mq.matches; this._shortLandscape = this._mqShort.matches; update(); };
    this._mq.addEventListener('change', this._onMq);
    this._mqShort.addEventListener('change', this._onMq);
    this._ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && Math.abs(w - this._columnWidth) > 1) { this._columnWidth = w; update(); }
    });
    this._ro.observe(this.host);
    // A pure viewport-height change never resizes the host (see content-block.js).
    this._onResize = () => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; update(); });
    };
    window.addEventListener('resize', this._onResize);
  }

  _detach() {
    if (!this._attached) return;
    this._attached = false;
    this._mq?.removeEventListener('change', this._onMq);
    this._mqShort?.removeEventListener('change', this._onMq);
    this._ro?.disconnect();
    window.removeEventListener('resize', this._onResize);
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  /** Same budget poe-predict uses: below the sticky head, above the action bar. */
  availableHeight() {
    if (typeof window === 'undefined') return Infinity;
    const root = getComputedStyle(document.documentElement);
    const headerH = parseFloat(root.getPropertyValue('--lesson-sticky-header-h')) || 120;
    const footerH = parseFloat(root.getPropertyValue('--lesson-chrome-bottom')) || 0;
    return Math.max(0, window.innerHeight - headerH - footerH - 40);
  }

  /** The layout for the image now (call from render()), or null without one. */
  resolve() {
    const image = this._image();
    if (!image?.src) { this._last = null; return null; }
    const bundleId = this._bundleId();
    if (this._probedSrc !== image.src) {
      this._probedSrc = image.src;
      this._dims = null;
      probeImageDimensions(image.src, bundleId).then((dims) => {
        if (dims && this._probedSrc === image.src) { this._dims = dims; this.host.requestUpdate(); }
      });
    }
    const availableHeight = this.availableHeight();
    let result = resolveImageLayout({
      positionHint: image.position || 'right',
      naturalWidth: this._dims?.naturalWidth,
      naturalHeight: this._dims?.naturalHeight,
      columnWidth: this._columnWidth,
      availableHeight,
      isNarrow: this._narrow || this._shortLandscape,
    });
    if (result.layout === 'background' && image.position !== 'background') {
      result = { layout: 'below', capped: true, zoomAffordance: true, widthPx: null };
    }
    this._last = fitSideImageAtRest(result, {
      naturalWidth: this._dims?.naturalWidth,
      naturalHeight: this._dims?.naturalHeight,
      captionEl: this.host.shadowRoot?.querySelector('.cb-image-wrap .cb-caption'),
      restExtra: sideRestExtra(this._restTop),
      availableHeight,
    });
    return this._last;
  }
}

/**
 * Simulation counterpart to resolveImageLayout() — see
 * docs/sprints/wip/dom-simulation-auto-layout.md §3 for the full design.
 * No async-probe state (a DomSimulation's aspect ratio is known
 * synchronously) and no raster-image concepts (no capped tier, no
 * zoomAffordance — a scaled DomSimulation stays legible at any size).
 *
 * @param {{positionHint?: string, aspect: number, columnWidth?: number,
 *   availableHeight?: number, isNarrow?: boolean, isPortrait?: boolean}} opts
 *   `aspect` is required: the simulation's designW / designH (from its
 *   DomSimulation subclass's WIDTH/HEIGHT, or PORTRAIT_WIDTH/HEIGHT when
 *   the caller has already decided portrait applies — see
 *   content-block.js's _activeSimDesignDims()).
 * @returns {{layout: string, widthPx: number|null}}
 */
export function resolveSimLayout({
  positionHint = 'below',
  aspect,
  columnWidth,
  availableHeight,
  isNarrow = false,
  isPortrait = false,
  designWidth,
  minScale,
  // Opt-in: renders the 'above'/'below' tier at up to this width instead of
  // the shared 820px default every other simulation still renders against,
  // BYPASSING the fit/degrade pipeline below rather than just raising its
  // width ceiling. That pipeline's whole job is protecting a side TEXT column
  // from being squeezed off-screen by media that renders too tall for the
  // viewport (see _resolveMediaLayout()'s own doc comment) - real for an
  // image or a side-by-side simulation, but moot for this opt-in, whose
  // entire point is a slide with no side text to protect (a `content-block@1`
  // game with minimal/no accompanying prose, e.g. the diversity course's
  // real-time arcade games - "reserve full screen real estate for the game"
  // is a real authoring ask). Routing it through the ordinary fit check
  // instead just re-degrades every wide request straight back to a side
  // panel the moment the scene's own aspect ratio makes the wide render
  // taller than the normal height budget - which, for anything wider than a
  // roughly square design, is most of the time. The scene should still pick
  // a properly widescreen WIDTH/HEIGHT so the resulting height stays
  // reasonable (see the diversity course's SortRush/KeyDash/WhackAMyth kit
  // games) — this option trusts that choice rather than re-deriving it.
  // Author opt-in only (`simulation.fullWidth: true`, content-block.js's
  // _resolveSimLayout()) — every simulation that doesn't set it keeps the
  // unchanged 820px default and the unchanged degrade behavior.
  wideMaxWidthPx,
} = {}) {
  if (!aspect || !columnWidth) {
    return { layout: positionHint, widthPx: null };
  }

  if (positionHint === 'flow') {
    const fits = !isNarrow && !isPortrait && columnWidth >= MIN_FLOW_COLUMN_WIDTH_PX;
    if (fits) {
      const flowWidth = Math.min(columnWidth * FLOW_MAX_FRACTION, columnWidth - MIN_WRAP_TEXT_WIDTH_PX);
      if (flowWidth >= MIN_FLOW_WIDTH_PX) return { layout: 'flow', widthPx: flowWidth };
    }
    // Not enough room to wrap sensibly — degrade into the normal chain,
    // starting from 'below' (never re-attempts a side tier: a flow-sized
    // panel is authored smaller than a side panel needs to be to look right).
    positionHint = 'below';
  }

  if (wideMaxWidthPx && (positionHint === 'above' || positionHint === 'below')) {
    return { layout: positionHint, widthPx: Math.min(columnWidth, wideMaxWidthPx) };
  }

  const r = _resolveMediaLayout({
    positionHint,
    aspect,
    columnWidth,
    availableHeight,
    isNarrow,
    isPortrait,
    // Shared with images for now (open item §9.2) - raised for a scene that opts
    // in with a MIN_SCALE: shrink-to-fit would otherwise render a tall board at
    // an unreadable fraction of its design size, so below that scale the panel
    // degrades to the full-width tier instead. No opt-in, no change.
    minSideWidthPx: Math.max(MIN_SIDE_WIDTH_PX, (minScale || 0) * (designWidth || 0)),
    minTextBudgetPx: MIN_TEXT_BUDGET_PX,
    capHeightPx: MIN_CAPPED_HEIGHT_PX,   // unused (allowCapped:false), harmless to pass
    allowBackground: false,               // §3.3
    allowCapped: false,
    sideMaxFraction: 0.6,
    aboveMaxWidthPx: 820,
    sideFailureFallback: 'below',         // §3.2 — deliberately differs from images' 'above'
  });

  return { layout: r.layout, widthPx: r.widthPx };
}

/**
 * The same image, wrapped so a focus rect can be spotlit on it as the block's
 * beats advance. Structurally identical to `renderBlockImage` on the outside —
 * same `.cb-image-wrap`, same `<img>`, same caption — so the existing
 * `cb-layout-*` sizing applies unchanged and a slide with an image but no
 * `reveal.focus` renders exactly as it does today.
 *
 * Note `loading="lazy" decoding="async"` is kept: the focus geometry is
 * fraction-based, so it needs no natural dimensions at all and there is
 * nothing to wait for. That is a deliberate advantage of fractions over pixel
 * rects — a below-the-fold image can report `naturalWidth === 0` indefinitely.
 */
/**
 * @param {object} image
 * @param {object} focus
 * @param {{capped?: boolean, zoomAffordance?: boolean, pop?: boolean, widthPx?: number|null}} [opts] Same as `renderBlockImage`'s.
 */
export function renderBlockImageViewport(image, focus, opts = {}) {
  if (!image?.src) return html``;
  const { capped = false, zoomAffordance = false, pop = false, widthPx = null, bundleId = null, camera = false } = opts;
  const rect = normalizeFocusRect(focus);
  const opaqueClass = !camera && focus?.opaque ? 'cb-mask-opaque' : '';
  // Camera mode (reveal.focusMode "camera"): the same group, panned and zoomed
  // onto the rect like a comic panel, with no spotlight and no callout. The
  // viewport is always rendered (even on a beat with no rect), so Lit only
  // changes the style and the CSS transition carries the move.
  const groupStyle = camera ? cameraTransform(rect) : focusTransform(rect, focus?.opaque);
  return html`
    <div class="cb-image-wrap ${capped ? 'cb-image-capped' : ''} ${pop ? 'cb-media-pop' : ''}"
         style="${widthPx ? `max-width:${Math.round(widthPx)}px` : ''}">
      <div class="cb-image-viewport ${rect && !camera ? 'cb-focused' : ''} ${camera ? 'cb-cam' : ''} ${opaqueClass}">
        <div class="cb-focus-group" style="${groupStyle}">
          <img
            src="${CourseSourceManager.resolveRef(image.src, bundleId)}"
            alt="${image.alt || ''}"
            loading="lazy"
            decoding="async"
          >
          <div class="cb-focus-mask" style="${camera ? 'display: none;' : focusMaskStyle(rect)}"></div>
        </div>
        ${camera ? '' : renderFocusCallout(rect, focus)}
      </div>
      ${zoomAffordance ? renderZoomTrigger(image, bundleId) : ''}
      ${imageCaptionText(image) ? html`<span class="cb-caption">${imageCaptionText(image)}</span>` : ''}
    </div>
  `;
}

/** The scale accent — see `src/core/focusRect.js` for the arithmetic. */
function focusTransform(rect, opaque = false) {
  if (!rect) return 'transform: none;';
  const s = focusScale(rect, opaque);
  const { tx, ty } = focusTranslate(rect, s, opaque);
  
  if (s === 1 && tx === 0 && ty === 0) return 'transform: none;';
  return `transform: scale(${s.toFixed(3)}) translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%);`;
}

/** The comic camera's pan and zoom: cameraScale, then the same clamped centring. */
function cameraTransform(rect) {
  const s = cameraScale(rect);
  if (!rect || !(s > 1)) return 'transform: none;';
  const { tx, ty } = focusTranslate(rect, s);
  return `transform: scale(${s.toFixed(3)}) translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%);`;
}

/**
 * Position the spotlight, as a percentage of the group it shares with the
 * `<img>` — so the scale and translate above move both together and the two
 * cannot desync.
 */
function focusMaskStyle(rect) {
  if (!rect) return 'display: none;';
  const pc = (v) => `${(v * 100).toFixed(3)}%`;
  return `left: ${pc(rect.x)}; top: ${pc(rect.y)}; width: ${pc(rect.w)}; height: ${pc(rect.h)};`;
}

/**
 * The label callout — see the `.cb-callout` CSS comment above for why this
 * is a sibling of `.cb-focus-group`, not a child of it. `focus.label`/
 * `focus.anchor` are read off the *original* focus object, same convention
 * `opaque` already uses, since `normalizeFocusRect()` strips everything but
 * `x/y/w/h`. Renders nothing when there's no rect or no label — an author
 * who fills in only x/y/w/h gets exactly today's mask-only rendering.
 */
function renderFocusCallout(rect, focus) {
  const text = focus?.label?.en;
  if (!rect || !text) return '';
  const anchor = resolveCalloutAnchor(rect, focus?.anchor || 'right');
  const s = focusScale(rect, focus?.opaque);
  const t = focusTranslate(rect, s, focus?.opaque);
  const { xPct, yPct } = projectFocusPoint(focusAnchorPoint(rect, anchor), s, t, anchor);
  return html`
    <div class="cb-callout cb-callout-${anchor}" style="left:${xPct}%; top:${yPct}%;" aria-hidden="true">${text}</div>
  `;
}
