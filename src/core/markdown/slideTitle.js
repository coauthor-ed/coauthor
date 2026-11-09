/**
 * A slide's title: the heading its markdown opens with (author notes and
 * STEP sentinels, both HTML comments, may come first). Used where a look
 * hoists the title out of the slide into the lesson head (plain: LessonSession
 * shows it, content-block@1 drops it from its first beat), so both sides
 * agree on exactly one rule. Pure, no DOM, no lit.
 */
const LEAD_RE = /^((?:\s*<!--[\s\S]*?-->)*\s*)(#{1,3})[ \t]+([^\n]*?)[ \t#]*(?:\r?\n|$)/;

/** Inline markdown to plain text, for a title shown outside the renderer. */
function plainText(md) {
  return md
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The leading heading's text (plain), or null when the markdown does not open with one. */
export function leadingHeading(md) {
  const m = LEAD_RE.exec(String(md ?? ''));
  return m && m[3].trim() ? plainText(m[3]) : null;
}

/** The markdown without its leading heading (unchanged when it has none). */
export function stripLeadingHeading(md) {
  const src = String(md ?? '');
  const m = LEAD_RE.exec(src);
  if (!m || !m[3].trim()) return src;
  // Keep any comments (sentinels) that came before the heading.
  return (m[1].trim() + '\n\n' + src.slice(m[0].length)).replace(/^\s+/, '');
}

/** The title of a block (its data, as mounted): the markdown's opening heading. */
export function slideTitleOf(data) {
  const md = data?.markdown?.en ?? data?.markdown;
  return typeof md === 'string' ? leadingHeading(md) : null;
}
