import { appUrl } from './basePath.js';
import { marked } from '../../vendor/marked.esm.js';
import { maskMath } from './markdown/mathMask.js';
import { MathRenderer } from './components/MathRenderer.js';
import { AUDIENCES, extractTries, slugify } from './guides/guideMarkdown.js';

/**
 * People-facing guides (docs/sprints/completed/landing-page-and-guides.md, "Guides
 * system"). Reads what tools/guides/build-guides.mjs publishes to
 * guides/dist/: index.json (one entry per guide) and md/<slug>.md (the body,
 * frontmatter already stripped).
 *
 * Rendering lives here, not in the view (invariant 8): Markdown to sanitised
 * HTML, heading ids that match the build's (shared guideMarkdown.js), callouts,
 * maths, local links rewritten to app routes, and coauthor-try blocks cut out
 * as numbered slots for the view to mount through mountPlugin.
 */

let domPurifyPromise = null;
function loadDOMPurify() {
  if (!domPurifyPromise) domPurifyPromise = import('../../vendor/dompurify.js').then((m) => m.default);
  return domPurifyPromise;
}

// MarkdownRenderer's allowlist plus what a guide needs: same-origin images,
// ids on headings (for the table of contents and ?h= deep links) and the
// try-block slot. Still no script, style, iframe, form or on* attribute.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'blockquote',
    'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'code', 'pre', 'sub', 'sup', 'br', 'hr', 'span', 'div', 'mark', 'kbd', 'img',
  ],
  ALLOWED_ATTR: ['href', 'class', 'id', 'src', 'alt', 'title', 'data-try', 'data-callout', 'aria-hidden', 'colspan', 'rowspan', 'loading'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/|\.\/|\.\.\/|media\/)/i,
};

const CALLOUTS = { TIP: 'Tip', NOTE: 'Note', WARNING: 'Careful' };
// > [!QUILL] or > [!QUILL heart]: a tip in Quill's voice, with his face.
const QUILL_FACES = ['happy', 'surprised', 'sad', 'heart'];

let indexPromise = null;

export const GuideService = {
  AUDIENCES,

  /** The published index, cached for the page's life. Resolves to
   *  { guides: [] , missing: true } when guides/dist/ was never built. */
  loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(appUrl('guides/dist/index.json'), { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => ({ guides: Array.isArray(data.guides) ? data.guides : [], built: data.built }))
        .catch((e) => {
          console.warn('[GuideService] no guide index:', e.message);
          indexPromise = null; // try again next time
          return { guides: [], missing: true };
        });
    }
    return indexPromise;
  },

  async list(audience) {
    const { guides } = await this.loadIndex();
    return audience ? guides.filter((g) => g.audience === audience) : guides;
  },

  async get(slug) {
    const { guides } = await this.loadIndex();
    return guides.find((g) => g.slug === slug) || null;
  },

  /** Previous and next guide within the same audience. */
  async neighbours(slug) {
    const meta = await this.get(slug);
    if (!meta) return { prev: null, next: null };
    const list = await this.list(meta.audience);
    const i = list.findIndex((g) => g.slug === slug);
    return { prev: list[i - 1] || null, next: list[i + 1] || null };
  },

  async loadMarkdown(slug) {
    const r = await fetch(appUrl(`guides/dist/md/${encodeURIComponent(slug)}.md`));
    if (!r.ok) throw new Error(`Guide "${slug}" could not be loaded (HTTP ${r.status}).`);
    return r.text();
  },

  /**
   * @returns {Promise<{ html: string, tries: Array<{ data?: object, error?: string }> }>}
   */
  async render(md) {
    const { text: withSlots, tries: rawTries } = extractTries(md);
    const tries = rawTries.map((json) => {
      try { return { data: JSON.parse(json) }; } catch (e) { return { error: e.message }; }
    });

    // Code is shielded from the maths mask: a shell line with a $ in it is
    // not an equation.
    const code = [];
    const shielded = withSlots.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$|`[^`\n]+`/gm, (m) => {
      code.push(m);
      return `%%%CODE${code.length - 1}%%%`;
    });
    const { text: masked, blocks } = maskMath(shielded);
    const restored = masked.replace(/%%%CODE(\d+)%%%/g, (_, i) => code[Number(i)]);

    let out = marked.parse(restored, { async: false, gfm: true });
    const DOMPurify = await loadDOMPurify();
    out = DOMPurify.sanitize(out, SANITIZE_CONFIG);
    out = this._decorate(out);

    for (let i = 0; i < blocks.length; i++) {
      const rendered = await MathRenderer.renderToString(blocks[i].latex, { displayMode: blocks[i].displayMode });
      out = out.replace(`%%%MATH${i}%%%`, rendered);
    }
    return { html: out, tries };
  },

  /** Post-sanitise touches done on a detached DOM tree: heading ids, callout
   *  boxes, link and image rewriting. Only adds attributes and classes. */
  _decorate(htmlText) {
    const tpl = document.createElement('template');
    tpl.innerHTML = htmlText;
    const root = tpl.content;
    const seen = new Map();
    for (const h of root.querySelectorAll('h2, h3')) {
      let id = slugify(h.textContent);
      const n = seen.get(id) || 0;
      seen.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      h.id = id;
    }
    for (const bq of root.querySelectorAll('blockquote')) {
      const first = bq.firstElementChild;
      const m = first && /^\s*\[!(TIP|NOTE|WARNING|QUILL)(?:\s+([a-z]+))?\]\s*/.exec(first.innerHTML);
      if (!m) continue;
      first.innerHTML = first.innerHTML.slice(m[0].length);
      if (!first.textContent.trim() && !first.querySelector('img')) first.remove();
      bq.classList.add('callout');
      bq.dataset.callout = m[1].toLowerCase();
      if (m[1] === 'QUILL') {
        // Quill says it: the view puts the look's companion (a <companion-slot>) in this slot.
        const slot = document.createElement('span');
        slot.className = 'quill-slot';
        slot.dataset.face = QUILL_FACES.includes(m[2]) ? m[2] : 'happy';
        slot.setAttribute('aria-hidden', 'true');
        bq.prepend(slot);
        continue;
      }
      const label = document.createElement('p');
      label.className = 'callout-label';
      label.textContent = CALLOUTS[m[1]];
      bq.prepend(label);
    }
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      } else if (href.startsWith('#/')) {
        // an app route; leave it
      } else if (href.startsWith('#')) {
        a.dataset.anchor = href.slice(1);
      } else {
        const [slug, anchor] = href.split('#');
        a.setAttribute('href', `#/guides/${slug}${anchor ? `?h=${anchor}` : ''}`);
      }
    }
    for (const img of root.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src');
      if (src.startsWith('media/')) img.setAttribute('src', appUrl(`guides/dist/${src}`));
      img.setAttribute('loading', 'lazy');
      // ![alt](media/x.png "Caption") alone in a paragraph: a captioned figure.
      const p = img.parentElement;
      const caption = img.getAttribute('title');
      if (caption && p?.tagName === 'P' && p.childNodes.length === 1) {
        const fig = document.createElement('figure');
        fig.className = 'shot';
        const cap = document.createElement('figcaption');
        cap.textContent = caption;
        img.removeAttribute('title');
        p.replaceWith(fig);
        fig.append(img, cap);
      }
    }
    const div = document.createElement('div');
    div.append(root);
    return div.innerHTML;
  },
};
