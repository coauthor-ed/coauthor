const CUE_RE = /<!--\s*CUE:([a-zA-Z0-9_-]+)\s*-->/g;

/** Replace <!-- CUE:id --> with a real, tiny, non-zero-area inline anchor
 *  element marked passes through as raw HTML unchanged. Must run on the
 *  markdown TEXT, before marked.parse() — see MarkdownRenderer._parseMarkdown(). */
export function renderCueAnchors(md) {
  return String(md ?? '').replace(CUE_RE, (_, id) =>
    `<span class="cb-cue-anchor" data-cue-id="${id}" aria-hidden="true"></span>`);
}
