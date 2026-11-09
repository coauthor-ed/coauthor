import { html } from 'lit';
import { iconArrowRight, iconCheck, iconClipboard, iconGuide } from '../../icons/uiIcons.js';
import { SHOWCASE_BUNDLE } from '../../../core/ShowcaseService.js';
import '../../components/TryBlock.js';

/**
 * The explorer stop for long answers (structured-descriptive@1): a drawn
 * answer sheet that coaches itself point by point, then the real question
 * from the showcase bundle to try. The drawn sheet mirrors what the plugin
 * really does: one box per rubric point, keyword matching that reads "not",
 * and a hint for a missed point only (coached mode).
 */

// Each answer is typed word by word; *word* marks a key word that lights up
// when the point is checked.
const P1 = 'Water moves *into* the raisin by *osmosis.*';
const P2_WRONG = 'Because the raisin gets wet.';
const P2_FIX = 'There is *less water* inside the raisin than outside, so water moves in.';

/** Words that appear one after another from `start` seconds; a *key
 *  phrase* (one or more words) lights up at `checkAt` seconds. */
function typed(text, start, step, checkAt) {
  let i = 0;
  return text.split(/(\*[^*]+\*)/).filter(Boolean).flatMap((seg) => {
    const kw = seg.startsWith('*');
    return seg.replace(/\*/g, '').split(' ').filter(Boolean).map((word) => html`<span class="w ${kw ? 'kw' : ''}" style="--t:${(start + i++ * step).toFixed(2)};--k:${checkAt}">${word}</span> `);
  });
}

const FEATURES = [
  ['Split into points', 'The question is broken into the points an examiner looks for. You answer one point at a time.'],
  ['A hint, not the answer', 'If a point is missing, you get a hint for that point only. Then you fix it yourself.'],
  ['It reads "not" carefully', 'Writing "water does not move by osmosis" will not earn the osmosis point.'],
];

/**
 * @param {{ question: object|null, replay: (e: Event) => void }} v
 */
export function stopDescriptive(v) {
  return html`
    <article class="stop desc-stop" data-rv>
      <span class="node" aria-hidden="true"></span>
      <div class="copy">
        <span class="num rv" aria-hidden="true">06</span>
        <span class="tag rv" style="--i:1">${iconClipboard} Explain in words</span>
        <h3 class="display rv" style="--i:2">Long answers, <span class="key">coached.</span></h3>
        <p class="lede rv" style="--i:3">Most learning apps only check one-word answers. Here you also practise the <b>3-mark and 5-mark answers</b> from your board exam, with help at every step.</p>
        <ul class="d-feats rv" style="--i:4" role="list">
          ${FEATURES.map(([h, p], i) => html`<li style="--n:${i}"><span class="d-ic" aria-hidden="true">${iconCheck}</span><span><b>${h}</b>${p}</span></li>`)}
        </ul>
        <p class="d-fine rv" style="--i:5">It looks for key words, so it is a coach, not an examiner. A parent or teacher can still read your answer.</p>
      </div>
      <div class="art rv" style="--i:2">
        <div class="sheet" role="img" aria-label="An answer sheet with two points. The first point is right and gets a tick. The second answer misses the reason, so Quill gives a hint. The student fixes it, and both points get a tick.">
          <div class="sh-head">
            <p class="sh-q">A dry raisin swells up when you leave it in water. Why?</p>
            <span class="marks" aria-hidden="true"><i class="pip a"></i><i class="pip b"></i><b>2 marks</b></span>
          </div>
          <div class="pt p1">
            <span class="pt-label">1. Which way does the water move?</span>
            <div class="ans-box"><p class="ans">${typed(P1, 0.5, 0.17, 2.0)}</p><span class="tick">${iconCheck}</span></div>
          </div>
          <div class="pt p2">
            <span class="pt-label">2. Why does it move that way?</span>
            <div class="ans-box"><p class="ans"><span class="wrong">${typed(P2_WRONG, 2.4, 0.12, 9)}</span>${typed(P2_FIX, 4.8, 0.1, 6.3)}</p><span class="tick">${iconCheck}</span></div>
            <div class="d-hint">
              <quill-mascot size="mini" .idle=${false} expression="surprised"></quill-mascot>
              <p><b>Hint for this point</b>Where is there more water: inside the raisin, or outside it?</p>
            </div>
          </div>
          <p class="sh-say"><quill-mascot size="mini" .idle=${false} expression="heart"></quill-mascot>Both points covered. Full marks!</p>
          <button class="replay" @click=${v.replay} aria-label="Play the answer sheet again">${iconArrowRight} Play again</button>
        </div>
        ${v.question ? html`<try-block class="desc-try" lazy label="Your turn" .data=${v.question} .bundleId=${SHOWCASE_BUNDLE}></try-block>` : ''}
        <a class="guide-link" href="#/guides/answering-descriptive-questions">${iconGuide} How long answers are checked ${iconArrowRight}</a>
      </div>
    </article>`;
}

/** Restart the sheet's animation from the start. */
export function replaySheet(e) {
  const sheet = e.currentTarget.closest('.sheet');
  if (!sheet) return;
  sheet.classList.add('rs');
  void sheet.offsetWidth;
  sheet.classList.remove('rs');
}
