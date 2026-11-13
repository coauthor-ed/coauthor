import { LitElement, html, css } from 'lit';
import { MathRenderer } from '../../core/components/MathRenderer.js';
import { marked } from '../../../vendor/marked.esm.js';
import { maskMath } from '../../core/markdown/mathMask.js';
import { colorizeLatex } from '../../core/markdown/mathColorize.js';
import { renderCueAnchors } from '../../core/markdown/cueMarkers.js';
import { markSay, SAY_TOKEN_GLOBAL_RE } from '../../core/cast/castData.js';
import { GlossaryService } from '../../core/GlossaryService.js';
import { alignWords, alignedIndexAt, readsSlideText, segmentWordTexts } from '../../core/narration/narrationModel.js';

// Render-time HTML sanitization (invariant 6 — see
// docs/sprints/completed/markdown-render-sanitization.md). marked.js treats
// embedded raw HTML and javascript:/data: link targets as valid, well-formed
// Markdown, so a blocklist scrub at authoring/ingestion time is not a
// sufficient defense on its own: this is the render choke point every
// content source (AI-drafted, hand-authored, a future bulk import) passes
// through, so it's sanitized again here regardless of what happened upstream.
// Loaded lazily (not in the eager import map — see CLAUDE.md's vendoring
// rule) and cached module-wide since every <markdown-renderer> instance needs it.
let domPurifyPromise = null;
function loadDOMPurify() {
  if (!domPurifyPromise) {
    domPurifyPromise = import('../../../vendor/dompurify.js').then((m) => m.default);
  }
  return domPurifyPromise;
}

// Allowlist, not a blocklist: exactly the tags/attributes
// MarkdownRenderer's own `static styles` above already anticipates
// rendering, plus the `.cb-cue-anchor` span `renderCueAnchors()` injects as
// raw HTML before `marked.parse()` ever runs (see its own doc comment) and
// `.gl-term`'s `data-gl` (written by GlossaryService.mark() *after* this
// sanitize step, via DOM APIs not innerHTML, but allowlisted here too in
// case a bundle's own prose ever hand-authors one). Deliberately excludes
// `img`/`script`/`style`/`iframe` and any `on*` handler attribute — nothing
// in this codebase's content currently needs inline images inside prose
// text, and every other case (lesson figures, simulations) already resolves
// through `image.src`/`simulation.src`, not inline Markdown.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'code', 'pre', 'sub', 'sup', 'br', 'hr', 'span', 'div', 'mark',
  ],
  ALLOWED_ATTR: ['href', 'class', 'data-cue-id', 'data-gl', 'aria-hidden', 'colspan', 'rowspan'],
  // DOMPurify's own default already rejects javascript:/vbscript: URIs; this
  // narrows further to explicitly exclude data: on the one attribute (href)
  // this allowlist exposes.
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i,
};

// _fitMathDivs()'s tuning: how many animation frames to wait for MathLive's
// own lazy (IntersectionObserver-gated) render before giving up on a given
// math-div, how many shrink-and-remeasure passes to try once it has
// rendered, and the legibility floor below which it stops shrinking and
// leaves the rest to the CSS overflow-x:auto fallback.
const MATH_FIT_MAX_WAIT_FRAMES = 8;
const MATH_FIT_MAX_SHRINK_STEPS = 4;
const MATH_FIT_MIN_PX = 11;

/**
 * A blockquote that opens "<Name>'s note:" ("Senior's note: ...") is an aside,
 * not a pull quote: it gets class "aside-note" and its label a span.note-label,
 * for a look to set as a margin note (plain). Classes only; Quill has no
 * rules for them, so nothing it draws changes. DOM APIs, no innerHTML.
 */
const NOTE_LABEL = /^\s*([A-Z][\w.\- ]{0,40}?['\u2019]s note:)\s*/;
function markAsideNotes(container) {
  for (const bq of container.querySelectorAll('blockquote')) {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== 'P') continue;
    const head = p.firstChild;
    if (!head) continue;
    if (head.nodeType === 1 && /^(STRONG|EM|B|I)$/.test(head.tagName) && NOTE_LABEL.test(head.textContent || '')) {
      head.classList.add('note-label');
      bq.classList.add('aside-note');
      continue;
    }
    if (head.nodeType !== 3) continue;
    const m = NOTE_LABEL.exec(head.nodeValue || '');
    if (!m) continue;
    const label = document.createElement('span');
    label.className = 'note-label';
    label.textContent = m[1].replace(/:$/, '');
    head.nodeValue = head.nodeValue.slice(m[0].length);
    p.insertBefore(document.createTextNode(' '), head);
    p.insertBefore(label, p.firstChild);
    bq.classList.add('aside-note');
  }
  // A table cell holding only a number (an optional superscript tag after
  // it) is class "num"; a column of them gets its head marked "num" too, and
  // a row headed "Total" is class "total" (plain right-aligns the numbers and
  // sets the total on the tint). Classes only; Quill has no rules for them.
  for (const td of container.querySelectorAll('td')) {
    const own = [...td.childNodes].filter((n) => !(n.nodeType === 1 && n.tagName === 'SUP')).map((n) => n.textContent).join('');
    if (/^\s*[-+]?[\d][\d,.]*\s*%?\s*$/.test(own)) td.classList.add('num');
  }
  for (const table of container.querySelectorAll('table')) {
    const rows = [...table.querySelectorAll('tbody tr')];
    for (const tr of rows) if (/^\s*total\b/i.test(tr.cells[0]?.textContent || '')) tr.classList.add('total');
    const head = table.querySelector('thead tr');
    if (!head || !rows.length) continue;
    [...head.cells].forEach((th, i) => {
      if (rows.every((tr) => !tr.cells[i] || tr.cells[i].classList.contains('num'))) th.classList.add('num');
    });
  }
  // A wide table scrolls inside its own wrapper, so on a phone it never
  // pushes past the column (or a sticky head) on the right.
  for (const table of container.querySelectorAll('table')) {
    if (table.parentElement?.classList.contains('md-tablewrap')) continue;
    const wrap = document.createElement('div');
    wrap.className = 'md-tablewrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  }
}

export class MarkdownRenderer extends LitElement {
  static styles = css`
    /* Ported from the prototype (coauthor_ui_polish_v2 a/styles.css .beat.now .w):
       inline-block so transform applies, starts transparent and 0.35em low, 0.4s
       cubic-bezier(0.16,1,0.3,1). 'both' holds the start state through the
       per-word delay (the prototype's base rule did that job). */
    /* Narrated text slide: the word being spoken, lit in place (narrationWord()). */
    ::highlight(narr-word) { background-color: var(--narr-word-sweep); color: var(--narr-word-now-ink); }
    .rw { display: inline-block; animation: rw-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both; }
    @keyframes rw-in { from { opacity: 0; transform: translateY(0.35em); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .rw { animation: none; opacity: 1; transform: none; } }
    :host {
      display: block;
      line-height: 1.6;
      /* Was hardcoded to system-ui, which meant lesson/preview text never
         picked up either visual language's actual typeface (see
         docs/ui-ux-design-system.md §1 and theme.css's own
         body:has(#aa-shell) override) — this is a shared component (used by
         both the student runtime and the authoring app's content preview),
         so it should follow the same context-sensitive token every other
         shared component does, not opt itself out of theming. */
      font-family: var(--font-family, system-ui, sans-serif);
    }
    :host([inline]) {
      display: inline;
      white-space: inherit;
      overflow: inherit;
      text-overflow: inherit;
    }
    :host([inline]) #content-container {
      display: inline;
    }
    p { margin-top: 0; margin-bottom: 1rem; }
    strong { font-weight: var(--fw-medium); }
    em { font-style: italic; }
    ul, ol { padding-left: 1.5rem; margin-top: 0; margin-bottom: 1rem; }
    a { color: var(--primary-text, #0052cc); text-decoration: none; }
    a:hover { text-decoration: underline; }
    blockquote { border-left: 4px solid var(--border-color, #dfe1e6); padding-left: 1rem; margin-left: 0; color: var(--text-muted, #5e6c84); }
    /* plain (data-look set by content-block@1 on its beats; Firefox has no
       :host-context): a > line is a pull quote in the serif with a
       signature-colour rule; "<Name>'s note:" is a margin note; [dropcap]
       opens a lesson's first slide. Tokens from src/looks/plain/look.css. */
    :host([data-look="plain"]) blockquote {
      margin: 1.4rem 0 1.5rem;
      padding: 0.15rem 0 0.15rem 1.4rem;
      border-left: 4px solid var(--signature);
      color: var(--text-main);
      font-family: var(--font-heading);
      font-size: 1.6em;
      line-height: 1.34;
      font-weight: 500;
      letter-spacing: -0.005em;
    }
    :host([data-look="plain"]) blockquote p:last-child { margin-bottom: 0; }
    :host([data-look="plain"]) blockquote.aside-note {
      margin: 1.25rem 0;
      padding: 0.85rem 1rem 0.9rem 1rem;
      border-left: 3px solid var(--signature);
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
      background: var(--signature-tint);
      font-family: var(--font-family);
      font-size: 0.9em;
      line-height: 1.55;
      font-weight: 400;
      color: var(--text-soft);
    }
    :host([data-look="plain"]) .note-label {
      display: block;
      margin-bottom: 4px;
      font-family: var(--font-family);
      font-size: 0.8rem;
      font-weight: 700;
      font-style: normal;
      letter-spacing: var(--kicker-tracking, 0.1em);
      text-transform: uppercase;
      color: var(--signature-ink);
    }
    :host([data-look="plain"]) h2, :host([data-look="plain"]) h3, :host([data-look="plain"]) h4 {
      font-family: var(--font-family);
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: -0.005em;
      color: var(--text-main);
    }
    /* Beat headings are body-size: the sans, not the display serif (plain
       keeps the serif for display sizes, >= 24px). */
    :host([data-look="plain"]) h2 { font-size: 1.15em; }
    :host([data-look="plain"]) h3, :host([data-look="plain"]) h4 { font-size: 1.02em; }
    :host([data-look="plain"]) strong { font-weight: 600; color: var(--text-main); }
    /* Tables: the SimPanel ruleTableHtml recipe (src/simulations/base/kit/SimPanel.js), so a table in
       the prose and one in a scene read as one: a 1px grid in the rule colour, a tinted head row
       (small, bold, wrapping), labels left and numbers right in the sans with tabular figures, a
       bold total row on the tint, tags as small muted superscripts. */
    :host([data-look="plain"]) .md-tablewrap { margin: 0.35rem 0 1.25rem; }
    :host([data-look="plain"]) table { font-variant-numeric: lining-nums tabular-nums; border-collapse: collapse; border: 0; border-radius: 0; box-shadow: none; font-size: 0.94em; line-height: 1.4; }
    :host([data-look="plain"]) th, :host([data-look="plain"]) td { border: 1px solid var(--border-color); padding: 12px 14px; vertical-align: middle; }
    :host([data-look="plain"]) th { background: var(--bg-panel); font-size: 0.86em; font-weight: 700; line-height: 1.35; letter-spacing: normal; text-transform: none; color: var(--text-main); vertical-align: bottom; text-wrap: balance; }
    :host([data-look="plain"]) td { color: var(--text-main); }
    :host([data-look="plain"]) th.num, :host([data-look="plain"]) td.num { text-align: right; }
    :host([data-look="plain"]) td.num { white-space: nowrap; }
    :host([data-look="plain"]) tr:has(td.num) > td:first-child { font-weight: 600; }
    :host([data-look="plain"]) tr.total > td { background: var(--bg-panel); font-weight: 700; }
    :host([data-look="plain"]) td sup { font-size: 0.7em; font-weight: 400; color: var(--text-muted); margin-left: 2px; line-height: 0; }
    @media (max-width: 640px) {
      :host([data-look="plain"]) table { font-size: 0.86em; }
      :host([data-look="plain"]) th, :host([data-look="plain"]) td { padding: 10px 8px; }
    }
    :host([dropcap]) #content-container > p:first-child::first-letter {
      float: left;
      font-family: var(--font-heading);
      font-weight: 700;
      font-size: 3.6em;
      line-height: 0.82;
      padding: 0.08em 0.1em 0 0;
      color: var(--signature);
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.2rem; margin-bottom: 0.5rem; line-height: 1.3; font-family: var(--font-heading, inherit); font-weight: var(--fw-strong); }
    /* A progressively-revealed block renders one <markdown-renderer> per beat,
       so a sub-heading that opens a beat is the first child of its own shadow
       root and its margin-top has nothing above it to collapse against. Left
       alone, every one of the 117 blocks with a sub-heading gains ~1rem at
       that boundary versus how it rendered before staging. Harmless in the
       single-renderer case, where :first-child's margin collapsed out anyway. */
    #content-container > :first-child { margin-top: 0; }
    h1 { font-size: 1.5rem; } h2 { font-size: 1.25rem; } h3 { font-size: 1.1rem; }
    .md-tablewrap { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 1rem; }
    .md-tablewrap > table { margin-bottom: 0; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
    th, td { border: 1px solid var(--border-color, #dfe1e6); padding: 8px; text-align: left; }
    th { background: var(--bg-panel, #f4f5f7); font-weight: var(--fw-medium); }
    code { font-family: monospace; background: var(--bg-panel, #f4f5f7); padding: 2px 4px; border-radius: 4px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    pre { background: var(--bg-panel, #f4f5f7); padding: 1rem; border-radius: 8px; overflow-x: auto; font-family: monospace; }
    /* MathLive's math-span/math-div lazy-render themselves via an
       IntersectionObserver, only calling render() once actually visible
       (a perf optimisation, since layout is expensive at scale). Before
       that first render, both elements are visually empty, and an empty
       *inline* box (math-span's default display) as the sole child of an
       <li> collapses to a genuine 0×0 box — no strut, no line box — unlike
       the same empty content inside a <p>, which still gets one from the
       paragraph's own line-height. IntersectionObserver treats a 0-area
       target as never-intersecting regardless of on-screen position (per
       spec, intersectionRatio is computed against target area), so a math
       expression that is the *entire* content of a bullet — "*   $x$" —
       never renders: it's permanently invisible to its own observer. Forcing
       a non-zero box up front (inline-block, since min-width/min-height are
       no-ops on plain inline boxes) breaks that deadlock; the element still
       snaps to its real size the moment it does render. */
    math-span { display: inline-block; min-width: 1px; }
    /* Q-84: inline maths runs a little larger than the prose (as KaTeX's own
       1.21em does), so its superscripts and nested fractions, drawn at 0.7 of
       it, stay at or above 12 px in 15-16 px body text. */
    math-span { font-size: 1.15em; }
    math-span, math-div { min-height: 1em; }

    /* A block ($$…$$) equation as a "card" rather than bare glyphs on the
       page background — same card language (--bg-panel, --radius-md) the
       rest of the app already uses (.path-card, the radius scale), applied here once
       so every math-heavy slide gets it for free, not per-course CSS. */
    math-div {
      display: block;
      margin: 0.9rem 0;
      padding: 0.85rem 1rem;
      background: var(--bg-panel);
      border-radius: var(--radius-md, 12px);
      /* MathLive (like KaTeX) lays a formula out as one nowrap run
         internally — there is no supported way to break a formula's own
         glyphs across lines, so a long equation can't literally "wrap" the
         way prose does. What actually keeps it from needing a scrollbar on a
         narrow phone is shrinking to fit: same clamp(min, vw, max) pattern
         theme.css already uses for --fs-display/--fs-h1, so a card this wide
         (~360-400px) lands near the floor and anything wider than ~450px is
         unaffected. overflow-x stays as a safety net only — for a formula
         long enough that even the floor size doesn't fit, scrolling beats
         silently clipping it. */
      font-size: clamp(0.82rem, 3.6vw, 1rem);
      overflow-x: auto;
      animation: eq-pop-in var(--motion-reveal, 380ms) var(--motion-reveal-ease, ease-out);
    }
    /* Plays once, on mount — a freshly-created <markdown-renderer> is exactly
       what a progressive-disclosure beat creates for each newly-revealed
       step (ProgressiveDisclosureMixin.js's _renderSteps()), so an equation
       settles into view rather than appearing as a flat cut, with no
       coordination needed between this component and whatever revealed it.
       A CSS *animation* (unlike a transition) plays on an element arriving
       already in the DOM with no prior state to transition from — same
       reasoning as content-block.js's own rv-enter keyframe. */
    @keyframes eq-pop-in {
      from { opacity: 0; transform: scale(0.94); }
      to   { opacity: 1; transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      /* theme.css's own reduced-motion block can't pierce this shadow root —
         re-declared locally, same pattern content-block.js and
         semantic-descriptive/v1/styles.js already use. */
      math-div { animation: none; }
    }

    /* Tap-to-gloss words (core/GlossaryService.js). A dotted rule, not a link
       colour: the word keeps reading as prose and only invites a tap. */
    .gl-term {
      cursor: pointer;
      text-decoration: underline dotted var(--primary-color, #0052cc);
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
      border-radius: 3px;
    }
    .gl-term:hover { background: var(--primary-light, #ecf3ff); }
    .gl-term:focus-visible { outline: 3px solid var(--primary-color, #0052cc); outline-offset: 1px; }

    .cb-cue-anchor {
      display: inline-block;
      width: 1px;
      height: 1em;
      overflow: hidden;
      vertical-align: text-bottom;
    }
  `;

  static properties = {
    content: { type: String },
    inline: { type: Boolean },
    highlight: { type: String },
    /** Variable -> CSS color value (e.g. `var(--sim-series-2)`), applied to
     *  every math block's LaTeX before rendering — see mathColorize.js. */
    mathColors: { type: Object },
    /** Bundle whose glossary.json marks hard words as tap-to-gloss. Unset =
     *  no marking (questions, tests and the authoring preview never set it). */
    glossaryBundle: { type: String },
    /** Classic lesson mode's word-by-word entrance for the current beat
     *  (lesson-modes-plan.md, prototype v2 a/). Opt-in, read once when the
     *  content renders; off everywhere else (questions, tests, authoring). */
    revealWords: { type: Boolean, attribute: 'reveal-words' }
  };

  constructor() {
    super();
    this.content = '';
    this.highlight = '';
    this.mathColors = null;
  }

  /**
   * Parses Markdown using marked.js, while safely extracting and restoring LaTeX math.
   */
  async _parseMarkdown(md, out = {}) {
    if (!md) return '';

    // `<!-- SAY id -->` speaker markers (story cast) become text tokens that
    // ride inside their paragraph through marked and the sanitiser; updated()
    // turns those paragraphs into bubbles (core/cast/sayBubbles.js).
    const said = markSay(md);
    out.says = this.inline ? [] : said.says;
    md = this.inline ? said.text.replace(SAY_TOKEN_GLOBAL_RE, '') : said.text;

    // The three masking regexes live in core/markdown/mathMask.js so that
    // splitSteps.js can mask identically before lexing — a splitter that
    // disagreed with the renderer about where an expression starts would cut a
    // reveal step through the middle of one.
    const withCues = renderCueAnchors(md);
    const { text: parsedMd, blocks: mathBlocks } = maskMath(withCues, { inline: this.inline });

    // Use marked.js to generate HTML from the safe markdown string
    let resultHtml = marked.parse(parsedMd, { async: false });

    // Sanitize before the math-restoration loop below, not after: the
    // %%%MATHn%%% placeholders are still plain text at this point (nothing
    // for a sanitizer to strip), and MathLive/KaTeX's own rendered markup
    // (math-span/math-div custom elements, inline style attrs) doesn't exist
    // yet — inserting it after sanitization means it's never at risk of
    // being mangled by the allowlist above.
    const DOMPurify = await loadDOMPurify();
    resultHtml = DOMPurify.sanitize(resultHtml, SANITIZE_CONFIG);

    // 5. If inline mode is requested, convert paragraph wrappers to inline spans
    if (this.inline) {
       resultHtml = resultHtml.replace(/<p>/g, '<span>').replace(/<\/p>/g, '</span>');
    }

    // Restore math blocks asynchronously
    for (let i = 0; i < mathBlocks.length; i++) {
      const block = mathBlocks[i];
      const latex = this.mathColors ? colorizeLatex(block.latex, this.mathColors) : block.latex;
      const renderedMath = await MathRenderer.renderToString(latex, { displayMode: block.displayMode });
      resultHtml = resultHtml.replace(`%%%MATH${i}%%%`, renderedMath);
    }

    return resultHtml;
  }

  /**
   * Shrinks a display ($$…$$) equation's font-size, beyond the static
   * clamp() `math-div`'s own CSS already applies, if it still overflows its
   * card. The static clamp alone only covers the common case (a short
   * symbolic formula) — several shipped equations pad a formula with
   * `\text{...}` prose (e.g. "Area of minor segment = Area of sector OAB -
   * Area of triangle OAB") and can still overflow a narrow phone even at the
   * clamp's floor. Bails out fast — for the overwhelming majority of
   * equations that already fit, this is a couple of cheap reads and nothing
   * else. `overflow-x: auto` stays as the fallback for whatever still
   * doesn't fit at `MATH_FIT_MIN_PX` — better to scroll than to either clip
   * or shrink text into illegibility.
   */
  _fitMathDivs(container) {
    container.querySelectorAll('math-div').forEach((el) => this._waitForMathRender(el, 0));
  }

  /** MathLive's math-div/math-span lazy-render via an IntersectionObserver
   *  (see the sizing-bug comment on math-span above) — there's no event to
   *  await, so this polls a bounded number of frames for its shadow root to
   *  actually have rendered content before measuring anything. Gives up
   *  quietly (today's clamp+scroll behavior, unchanged) if it never does —
   *  e.g. a beat that isn't on screen yet and won't render until scrolled
   *  into view. */
  _waitForMathRender(el, attempt) {
    if (!el.isConnected || attempt >= MATH_FIT_MAX_WAIT_FRAMES) return;
    requestAnimationFrame(() => {
      const rendered = el.shadowRoot?.querySelector('[part="render"]')?.firstElementChild;
      if (!rendered) { this._waitForMathRender(el, attempt + 1); return; }
      this._shrinkMathDivToFit(el);
    });
  }

  /** font-size, not `transform: scale()` — MathLive's own layout is
   *  entirely em-relative, so reducing it reflows to a smaller box on its
   *  own, with no dead-space compensation to work out. A handful of
   *  synchronous remeasures (bounded by MATH_FIT_MAX_SHRINK_STEPS) converges
   *  in practice within one or two passes; this is small, infrequent
   *  per-element DOM measurement, the same category as content-block.js's
   *  own _measureSimControls(). */
  _shrinkMathDivToFit(el) {
    for (let i = 0; i < MATH_FIT_MAX_SHRINK_STEPS; i++) {
      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow <= 1) return;
      const current = parseFloat(getComputedStyle(el).fontSize);
      if (!(current > MATH_FIT_MIN_PX + 0.5)) return;
      const next = Math.max(MATH_FIT_MIN_PX, current * (el.clientWidth / el.scrollWidth) * 0.97);
      el.style.fontSize = `${next}px`;
    }
  }

  /**
   * Wraps each word of plain prose in a span that fades in on a short
   * stagger, then unwraps them again so selection, find-in-page and screen
   * readers see ordinary text. Runs AFTER glossary marking and skips anything
   * a span must not split: math (MathLive renders lazily from its host's
   * text), glossary terms, code. Each word rises 0.35em while fading in
   * (prototype v2 a/), 26ms apart; the spans are inline-block, which does
   * not change line breaking because the whitespace between words stays
   * ordinary text nodes. The stagger shrinks for a long beat so the whole
   * thing is readable within ~0.9s, so autoplay's dwell is not eaten.
   */
  _revealWords(container) {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SKIP = 'math-span, math-div, .gl-term, code, pre, kbd, svg, .katex, .say-name';
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim() && !n.parentElement?.closest(SKIP))
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const words = nodes.reduce((n, t) => n + t.textContent.split(/\s+/).filter(Boolean).length, 0);
    if (!words) return;
    const step = Math.min(26, 900 / words);
    let wi = 0;
    const spans = [];
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of node.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (!part.trim()) { frag.appendChild(document.createTextNode(part)); continue; }
        const span = document.createElement('span');
        span.className = 'rw';
        span.style.animationDelay = `${Math.round(wi++ * step)}ms`;
        span.textContent = part;
        frag.appendChild(span);
        spans.push(span);
      }
      node.parentNode.replaceChild(frag, node);
    }
    clearTimeout(this._unwrapTimer);
    this._unwrapTimer = setTimeout(() => {
      for (const span of spans) if (span.isConnected) span.replaceWith(document.createTextNode(span.textContent));
      container.normalize();
    }, Math.round(wi * step) + 450);
  }

  async updated(changedProperties) {
    super.updated(changedProperties);
    if (!changedProperties.has('content') && !changedProperties.has('highlight') && !changedProperties.has('mathColors') && !changedProperties.has('glossaryBundle')) return;
    // (`highlight` re-renders entirely, to apply new highlights over fresh HTML.)
    const container = this.shadowRoot.getElementById('content-container');
    if (!container) return;
    try {
      const parsed = {};
      container.innerHTML = await this._parseMarkdown(this.content, parsed);
      markAsideNotes(container);
      if (parsed.says?.length) await this._applySay(container, parsed.says);
      if (this.highlight) this._applyHighlight(container, this.highlight);
      if (this.glossaryBundle) (await GlossaryService.load(this.glossaryBundle))?.mark(container);
      if (this.revealWords && changedProperties.has('content')) this._revealWords(container);
      // Fire-and-forget: doesn't block `md-rendered` below, same reasoning
      // as that event already not waiting on MathLive's own async paint.
      this._fitMathDivs(container);
    } finally {
      // Announce that the element now has its real height.
      //
      // Everything above runs *after* Lit's update and awaits KaTeX once per
      // math block, so a freshly-created renderer is an empty, zero-height box
      // for at least a microtask — long enough that anything measuring it, or
      // animating on the assumption it has been laid out, gets the wrong
      // answer. In a `finally` so that a KaTeX failure cannot leave a listener
      // waiting for ever.
      //
      // Progressive disclosure no longer depends on this: reveal steps are all
      // in the DOM from mount and animate off a class, which needs no timing
      // signal at all. Kept because "this renderer now has content" is a real
      // thing to be able to wait for, and `whenRendered()` below is the
      // supported way to.
      this._rendered = true;
      this.dispatchEvent(new CustomEvent('md-rendered', { bubbles: true, composed: true }));
    }
  }

  /**
   * Resolves once this renderer has real content in it — immediately if it
   * already does. The promise form exists because a caller that attaches a
   * listener after `updated()` has already run would otherwise wait forever;
   * `DiagramAnnotator.js:38-42` guards a cached `<img>`'s `load` the same way.
   */
  whenRendered() {
    if (this._rendered) return Promise.resolve();
    return new Promise(resolve => this.addEventListener('md-rendered', () => resolve(), { once: true }));
  }

  /** Speech bubbles for SAY paragraphs, from the open course's cast. Loaded
   *  only when a text has a SAY marker. Never throws: at worst the paragraphs
   *  stay paragraphs. */
  async _applySay(container, says) {
    try {
      const [{ CourseCast }, { applySay }] = await Promise.all([
        import('../../core/cast/CourseCast.js'),
        import('../../core/cast/sayBubbles.js'),
      ]);
      applySay(container, says, await CourseCast.whenReady());
    } catch (e) {
      container.querySelectorAll('p').forEach((p) => {
        for (const n of p.childNodes) if (n.nodeType === 3) n.nodeValue = n.nodeValue.replace(SAY_TOKEN_GLOBAL_RE, '');
      });
      console.warn('[MarkdownRenderer] SAY bubbles failed', e);
    }
  }

  /**
   * The printed words of this renderer, lined up with `seg`'s spoken words
   * (cached per segment). Returns false when there is no content yet.
   */
  _narrPrep(seg) {
    const container = this.shadowRoot?.getElementById('content-container');
    if (!container) return false;
    const stale = this._narrSeg !== seg || !this._narrToks || this._narrToks.some((t) => !t.node.isConnected);
    if (stale) {
      const SKIP = 'math-span, math-div, .katex, code, pre, kbd, svg, .say-name';
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.textContent.trim() && !n.parentElement?.closest(SKIP)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      });
      const toks = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(node.textContent))) toks.push({ node, start: m.index, end: m.index + m[0].length, text: m[0] });
      }
      const printed = toks.map((t) => t.text);
      this._narrToks = toks;
      this._narrSeg = seg;
      this._narrMap = alignWords(segmentWordTexts(seg), printed);
      this._narrOwn = readsSlideText(seg, printed);
    }
    return true;
  }

  /**
   * Whether `seg` reads this prose (so its words can be lit in place). A
   * teacher-script beat does not: the host shows a caption instead.
   */
  narrationReadsProse(seg) {
    return !!seg && this._narrPrep(seg) && this._narrOwn;
  }

  /**
   * Narrated text slide (NarrationPacer via LessonEngine and content-block):
   * lights the printed word that spoken word `wi` of `seg` lines up with,
   * using the CSS Custom Highlight API, so the prose itself is not touched.
   * seg null or wi < 0 clears it, and so does a segment that does not read
   * this prose (narrationReadsProse()). A browser without the API shows the
   * prose unlit. Returns true when a word is lit.
   */
  narrationWord(seg, wi) {
    const reg = globalThis.CSS?.highlights;
    if (!reg || typeof Highlight !== 'function') return false;
    const clear = () => {
      if (this._narrHl && reg.get('narr-word') === this._narrHl) reg.delete('narr-word');
      this._narrHl = null;
    };
    if (!seg || !(wi >= 0) || !this.narrationReadsProse(seg)) { clear(); return false; }
    const t = this._narrToks[alignedIndexAt(this._narrMap, wi)];
    if (!t) { clear(); return false; }
    const range = document.createRange();
    range.setStart(t.node, t.start);
    range.setEnd(t.node, t.end);
    this._narrHl = new Highlight(range);
    reg.set('narr-word', this._narrHl);
    return true;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._narrHl) this.narrationWord(null, -1);
  }

  _applyHighlight(container, term) {
    if (!term || term.trim() === '') return;
    const escapedTerm = term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const regex = new RegExp('(' + escapedTerm + ')', 'gi');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const nodesToReplace = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentNode && n.parentNode.nodeName === 'MARK') continue;
      if (regex.test(n.nodeValue)) {
        nodesToReplace.push(n);
      }
    }
    
    // Escapes HTML special chars to prevent XSS from unescaped text nodes
    const esc = str => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    
    nodesToReplace.forEach(textNode => {
      const span = document.createElement('span');
      span.innerHTML = esc(textNode.nodeValue).replace(regex, '<mark>$1</mark>');
      textNode.parentNode.replaceChild(span, textNode);
    });
  }

  _onGlossaryTap(e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('.gl-term');
    if (!el) return;
    e.preventDefault();
    GlossaryService.open(this.glossaryBundle, el.dataset.gl, el);
  }

  render() {
    return html`<div id="content-container" @click=${this._onGlossaryTap} @keydown=${this._onGlossaryTap}></div>`;
  }
}

customElements.define('markdown-renderer', MarkdownRenderer);
