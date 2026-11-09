import { html, svg } from 'lit';
import { appUrl } from '../../../core/basePath.js';
import { gradeLabel } from '../../../core/gradeLabel.js';
import {
  iconArrowRight, iconGuide, iconDoor, iconFork, iconShieldHome, iconCheck, iconClock, iconBolt, iconNib, iconCompass,
} from '../../icons/uiIcons.js';
import { GUIDE_ICON, AUDIENCE, formatDate } from '../guides/guideKit.js';
import { DAWN_STARS, sparkle } from './landingArt.js';

/**
 * The rest of <landing-view>'s grown-ups half and its night footer
 * (docs/sprints/completed/landing-page-and-guides.md, "Page structure" 4-7):
 * three doorways (one idea through three interests), a commons, private by
 * design, the guides library, the shelf, and the footer. Templates only; the
 * small state they read (open door, widget values, guide filter) lives on the
 * view and comes in as `v`.
 */

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** "n/d" in lowest terms, or a whole number. */
export function frac(n, d) {
  if (!n) return '0';
  const g = gcd(n, d);
  return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
}

/** A small stacked fraction for prose. */
const fr = (s) => {
  const [a, b] = String(s).split('/');
  return b ? html`<span class="fr"><span>${a}</span><span>${b}</span></span>` : html`<b>${a}</b>`;
};

// -- three doorways ----------------------------------------------------------

const DOORS = [
  { id: 'kitchen', name: 'Kitchen', for: 'For the child who loves to cook', art: svg`<path d="M34 46h32v8a16 16 0 0 1-32 0z"></path><path d="M66 50h6a6 6 0 0 1 0 12h-6"></path><path d="M40 40c0-6 6-6 6-12M52 40c0-6 6-6 6-12"></path>` },
  { id: 'cricket', name: 'Cricket pitch', for: 'For the child who lives for cricket', art: svg`<path d="M30 70l26-40 8 5-26 40z"></path><path d="M54 33l6-9"></path><circle cx="70" cy="62" r="7"></circle>` },
  { id: 'music', name: 'Music room', for: 'For the child who hums all day', art: svg`<path d="M42 66V32l28-6v34"></path><ellipse cx="36" cy="66" rx="7" ry="5"></ellipse><ellipse cx="64" cy="60" rx="7" ry="5"></ellipse>` },
];

export function doorways(v) {
  return html`
    <section class="doors-sec" aria-labelledby="lv-doors" data-rv>
      <header class="sec-head">
        <span class="kicker rv">${iconDoor} Match the medium to the mind</span>
        <h3 id="lv-doors" class="poster small rv" style="--i:1">Same fractions. <span class="ink-key">Three doorways.</span></h3>
        <p class="lede rv" style="--i:2">Children learn fastest through what they already love. A course can teach one idea through cooking, cricket or music, and the maths stays exactly the same. Open a door.</p>
      </header>
      <div class="doors rv" style="--i:3" role="tablist" aria-label="Three ways into fractions">
        ${DOORS.map((d) => html`
          <button class="door ${v.door === d.id ? 'open' : ''}" role="tab" aria-selected=${v.door === d.id ? 'true' : 'false'}
            aria-controls="lv-door-panel" @click=${() => v.openDoor(d.id)}>
            <span class="frame">
              <span class="behind" aria-hidden="true"><svg viewBox="0 0 100 100">${d.art}</svg></span>
              <span class="leaf" aria-hidden="true">
                <svg class="leaf-art" viewBox="0 0 100 160" preserveAspectRatio="none"><path d="M8 160V58a42 42 0 0 1 84 0v102"></path><path d="M22 150V62a28 28 0 0 1 56 0v88"></path></svg>
                <span class="knob"></span>
              </span>
            </span>
            <span class="step-stone" aria-hidden="true"></span>
            <span class="plaque"><b>${d.name}</b><small>${d.for}</small></span>
          </button>`)}
      </div>
      <div id="lv-door-panel" class="door-panel ${v.door ? 'on' : ''}" role="tabpanel" aria-live="polite">
        ${v.door === 'kitchen' ? kitchen(v) : v.door === 'cricket' ? cricket(v) : v.door === 'music' ? music(v) : html`
          <p class="door-wait">Each door opens onto a small activity about the same idea: <b>parts of a whole</b>.</p>`}
      </div>
    </section>`;
}

function kitchen(v) {
  const fill = v.kitchenPick === '3/8' ? 3 / 8 : 3 / 4;
  const opts = [['1/4', false], ['3/8', true], ['1/2', false]];
  return html`
    <div class="widget kitchen">
      <svg class="cup" viewBox="0 0 120 150" aria-hidden="true">
        <path class="cup-glass" d="M20 20h80l-8 118H28z"></path>
        <path class="cup-milk" style="--f:${fill}" d="M20 20h80l-8 118H28z"></path>
        ${[1, 2, 3, 4, 5, 6, 7].map((i) => svg`<path class="cup-tick ${i % 2 ? '' : 'long'}" d="M${92 + i} ${138 - i * 14.75}h${i % 2 ? -10 : -18}"></path>`)}
        <text class="cup-lbl" x="60" y="${138 - 6 * 14.75 + 4}">3/4</text>
        <text class="cup-lbl" x="60" y="${138 - 3 * 14.75 + 4}">3/8</text>
      </svg>
      <div class="w-copy">
        <p class="w-q">A kheer recipe needs ${fr('3/4')} cup of milk. You make <b>half</b> the recipe. How much milk?</p>
        <div class="w-opts">
          ${opts.map(([s, right]) => html`<button class="ink-chip ${v.kitchenPick === s ? (right ? 'right' : 'wrong') : ''}"
            @click=${() => v.pickKitchen(s, right)}>${fr(s)} cup</button>`)}
        </div>
        <p class="w-say">${v.kitchenPick === '3/8'
          ? html`Yes. Half of ${fr('3/4')} is ${fr('3/8')}: the cup now fills to the 3 of 8 marks.`
          : v.kitchenPick ? html`Not quite. Split ${fr('3/4')} into eighths first: ${fr('3/4')} is ${fr('6/8')}. Half of 6 eighths is...`
          : 'Tap an answer. The cup will show you.'}</p>
      </div>
    </div>`;
}

function cricket(v) {
  const n = v.balls;
  return html`
    <div class="widget cricket">
      <div class="over" aria-label="${n} of 6 balls bowled">
        ${[0, 1, 2, 3, 4, 5].map((i) => html`<span class="ball ${i < n ? 'done' : ''}" style="--i:${i}"></span>`)}
      </div>
      <div class="w-copy">
        <p class="w-q">An over has <b>6 balls</b>. Bowl a few, and watch what fraction of the over is done.</p>
        <p class="w-big" aria-live="polite">${n} of 6 = ${fr(`${n}/6`)}${n && frac(n, 6) !== `${n}/6` ? html` = ${fr(frac(n, 6))}` : ''}</p>
        <div class="w-opts">
          <button class="ink-chip solid" ?disabled=${n >= 6} @click=${v.bowl}>Bowl a ball</button>
          <button class="ink-chip" @click=${v.resetOver}>New over</button>
        </div>
        <p class="w-say">${n === 6 ? 'Over complete: 6 of 6 is one whole over.' : n === 3 ? html`Halfway: 3 of 6 is ${fr('1/2')}.` : n === 4 ? html`4 of 6 is the same as ${fr('2/3')}: two balls in every three.` : 'Try 3 balls, then 4.'}</p>
      </div>
    </div>`;
}

const NOTES = [['1/2', 'half note'], ['1/4', 'quarter note'], ['1/8', 'eighth note']];

function music(v) {
  const notes = v.notes;
  const eighths = notes.reduce((s, n) => s + 8 / Number(n.split('/')[1]), 0);
  const over = eighths > 8;
  return html`
    <div class="widget music">
      <div class="mbar ${over ? 'over' : eighths === 8 ? 'full' : ''}" aria-label="A bar of music, ${frac(eighths, 8)} full">
        ${notes.map((n) => html`<span class="bnote" style="--w:${8 / Number(n.split('/')[1])}">${fr(n)}</span>`)}
        <span class="beats" aria-hidden="true">${[1, 2, 3, 4].map((b) => html`<i>${b}</i>`)}</span>
      </div>
      <div class="w-copy">
        <p class="w-q">A bar holds <b>one whole</b>: four beats. Fill it with notes.</p>
        <div class="w-opts">
          ${NOTES.map(([s, name]) => html`<button class="ink-chip" ?disabled=${eighths >= 8} @click=${() => v.addNote(s)}>+ ${name} ${fr(s)}</button>`)}
          <button class="ink-chip" @click=${v.clearBar}>Clear</button>
        </div>
        <p class="w-say" aria-live="polite">${over ? 'Too much: that is more than one bar. Clear it and try again.'
          : eighths === 8 ? html`Full bar! ${notes.map((n, i) => html`${i ? ' + ' : ''}${fr(n)}`)} = 1`
          : notes.length ? html`So far: ${fr(frac(eighths, 8))} of the bar.` : 'Add notes until the bar is exactly full.'}</p>
      </div>
    </div>`;
}

// -- a commons, and private by design ------------------------------------------------

const BRANCH = 'M60 200C140 200 170 110 260 104S400 76 470 70';
const BACK = 'M470 70C540 76 560 150 500 188S380 222 322 222';

export function commonsAndPrivate() {
  return html`
    <div class="two-up">
      <article class="note-card commons" data-rv aria-labelledby="lv-commons">
        <span class="tape t1" aria-hidden="true"></span>
        <span class="kicker rv">${iconFork} A commons, not a company</span>
        <h3 id="lv-commons" class="poster small rv" style="--i:1">Copy it. <span class="ink-key">Change it.</span> Share it back.</h3>
        <svg class="tree rv" style="--i:2" viewBox="0 0 560 270" aria-hidden="true">
          <path class="t-branch" d="${BRANCH}"></path>
          <path class="t-back" d="${BACK}"></path>
          <g class="t-node" transform="translate(60 200)"><circle r="9"></circle></g>
          <g class="t-node" transform="translate(470 70)"><circle r="9"></circle></g>
          <g class="t-shelf" transform="translate(250 240)"><path d="M-30 0h140"></path><path d="M-20 0v-34h14v34M-2 0v-44h14v44M16 0v-28h14v28"></path></g>
          <text class="t-lbl" x="14" y="232">A course repo</text>
          <text class="t-lbl" x="414" y="44">Your copy</text>
          <text class="t-lbl" x="236" y="266">Back on the shelf</text>
          <g class="t-card c1" style="offset-path: path('${BRANCH}')"><rect x="-26" y="-18" width="52" height="36" rx="6"></rect><path d="M-16 -6h32M-16 4h22"></path></g>
          <g class="t-card c2" style="offset-path: path('${BACK}')"><rect x="-26" y="-18" width="52" height="36" rx="6"></rect><path d="M-16 -6h32M-16 4h22"></path><circle cx="16" cy="10" r="5"></circle></g>
        </svg>
        <ul class="ink-list rv" style="--i:3">
          <li>Any git repository of lessons can be a <b>course source</b>. Courses are plain files anyone can read.</li>
          <li>Copy a course, adapt it for your child, and share it back for other families.</li>
          <li>Honest about trust: a source runs its own simulations inside the app, so add only sources you trust.</li>
        </ul>
        <a class="ink-link rv" style="--i:4" href="#/guides/adding-a-course-source">How course sources work ${iconArrowRight}</a>
      </article>

      <article class="note-card private" data-rv aria-labelledby="lv-private">
        <span class="tape t2" aria-hidden="true"></span>
        <span class="kicker rv">${iconShieldHome} Private by design</span>
        <h3 id="lv-private" class="poster small rv" style="--i:1">Your child's progress <span class="ink-key">stays home.</span></h3>
        <div class="house-wrap rv" style="--i:2" aria-hidden="true">
          <svg class="house" viewBox="0 0 260 200">
            <path class="h-roof" d="M20 92L130 18l110 74"></path>
            <path class="h-wall" d="M44 80v104h172V80"></path>
            <rect class="h-win" x="66" y="104" width="78" height="56" rx="6"></rect>
            <rect class="h-dev" x="80" y="114" width="50" height="36" rx="5"></rect>
            <path class="h-bar" d="M86 140v-8M96 140v-14M106 140v-10M116 140v-18"></path>
            <rect class="h-door" x="166" y="116" width="34" height="68" rx="4"></rect>
            <g class="h-lock" transform="translate(183 150)"><path d="M-8 -2v-6a8 8 0 0 1 16 0v6"></path><rect x="-11" y="-2" width="22" height="18" rx="4"></rect></g>
            <path class="h-ground" d="M6 184h248"></path>
          </svg>
          <span class="stamp">No accounts<br>No tracking</span>
        </div>
        <ul class="ink-list rv" style="--i:3">
          <li>Progress is saved in this browser, <b>on this device only</b>. Nothing is sent to us.</li>
          <li>No sign-up, no email, no password, and no ads.</li>
          <li>Save a backup file and restore it on a new device whenever you like.</li>
          <li>A press-and-hold gate keeps the parent area for grown-ups.</li>
        </ul>
        <a class="ink-link rv" style="--i:4" href="#/guides/backing-up-progress">Backing up progress ${iconArrowRight}</a>
      </article>
    </div>`;
}

// -- the guides library ------------------------------------------------------------------

export function guidesLibrary(v) {
  const all = v.guides || [];
  if (!all.length) return '';
  const aud = v.guideAud;
  const list = all.filter((g) => g.audience === aud).slice(0, 3);
  const newest = [...all].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0]?.slug;
  return html`
    <section class="lib" id="guides" data-rv aria-labelledby="lv-lib">
      <header class="sec-head row">
        <div>
          <span class="kicker rv">${iconGuide} Guides</span>
          <h3 id="lv-lib" class="poster small rv" style="--i:1">Read it. <span class="ink-key">Then try it.</span></h3>
        </div>
        <div class="aud-chips rv" style="--i:2" role="tablist" aria-label="Who the guides are for">
          ${['student', 'parent', 'author'].map((a) => html`<button role="tab" class="aud tone-${a}" aria-selected=${aud === a ? 'true' : 'false'}
            @click=${() => v.setGuideAud(a)}>${AUDIENCE[a].label}</button>`)}
        </div>
      </header>
      <ul class="lib-grid">
        ${list.map((g, i) => html`
          <li class="rv" style="--i:${i + 3}">
            <a class="gcard tone-${g.audience}" href="#/guides/${g.slug}">
              ${g.slug === newest ? svg`<svg class="pclip" viewBox="0 0 22 54" aria-hidden="true"><path d="M7 22V9a4 4 0 0 1 8 0v30a7 7 0 0 1-14 0V14"></path></svg>` : ''}
              <span class="tab">${AUDIENCE[g.audience].label}</span>
              <span class="gic" aria-hidden="true">${GUIDE_ICON[g.icon] || iconGuide}</span>
              <b>${g.title}</b>
              <span class="gsum">${g.summary}</span>
              <span class="gmeta"><span>${iconClock}${g.minutes} min</span>${g.tries ? html`<span class="live">${iconBolt}Try it inside</span>` : ''}<span>Updated ${formatDate(g.updated)}</span></span>
            </a>
          </li>`)}
      </ul>
      <a class="ink-btn lib-all rv" href="#/guides?for=${aud}">All ${AUDIENCE[aud].label.toLowerCase()} guides ${iconArrowRight}</a>
    </section>`;
}

// -- on the shelf --------------------------------------------------------------------------

const SPINE_TONES = ['explorer', 'grownup', 'author', 'moss', 'cta'];

export function shelf(v) {
  const books = v.shelf || [];
  if (!books.length) return '';
  return html`
    <section class="shelf-sec" data-rv aria-labelledby="lv-shelf">
      <header class="sec-head">
        <span class="kicker rv">${iconNib} On the shelf</span>
        <h3 id="lv-shelf" class="poster small rv" style="--i:1">Courses on <span class="ink-key">this device.</span></h3>
        <p class="lede rv" style="--i:2">From the course sources added here. Add more from the Parent area.</p>
      </header>
      <div class="bookshelf rv" style="--i:3">
        <ul class="spines">
          ${books.map((b, i) => html`
            <li class="spine s-${SPINE_TONES[i % SPINE_TONES.length]}" style="--h:${78 + ((i * 37) % 22)}%">
              <span class="sp-title">${b.title}</span>
              <span class="sp-meta">${[b.subject, gradeLabel(b.grade, 'Class')].filter(Boolean).join(' · ')}</span>
            </li>`)}
        </ul>
        <span class="plank" aria-hidden="true"></span>
      </div>
    </section>`;
}

// -- the footer: the night again -------------------------------------------------------------

export function footer(v) {
  return html`
    <footer class="foot" data-sec aria-labelledby="lv-foot">
      <div class="foot-sky" aria-hidden="true">
        <svg viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice"><path class="stars" d="${DAWN_STARS}"></path>
          <g class="tw"><g transform="translate(240 120)">${sparkle('spk')}</g><g transform="translate(1180 80) scale(1.2)">${sparkle('spk')}</g><g transform="translate(860 200) scale(0.8)">${sparkle('spk')}</g></g>
        </svg>
      </div>
      <div class="wrap foot-main" data-rv>
        <div class="foot-quill rv" aria-hidden="true">
          <quill-mascot class="fq" size="sm" .idle=${false}></quill-mascot>
          <span class="foot-floe"></span>
        </div>
        <div class="foot-copy">
          <h2 id="lv-foot" class="display rv" style="--i:1">See you <span class="key">in the first lesson.</span></h2>
          <div class="actions rv" style="--i:2">
            <button class="cta big" @click=${v.startLearning}>Start learning ${iconArrowRight}</button>
            <a class="cta ghost" href="#/guides">${iconGuide} Browse the guides</a>
          </div>
        </div>
      </div>
      <div class="wrap foot-base">
        <nav aria-label="Footer">
          <a href="#/guides?for=student">${iconCompass} Student guides</a>
          <a href="#/guides?for=parent">${iconShieldHome} Parent guides</a>
          <a href="#/guides?for=author">${iconNib} Author guides</a>
        </nav>
        <p class="fine">CoAuthor is free and open source under the <a href="${appUrl('LICENSE')}" target="_blank" rel="noopener">MIT licence</a>. Published courses are shared under CC BY-SA 4.0. No ads, no accounts, no tracking.</p>
        <p class="fine">Fonts: Nunito, Fredoka and Dela Gothic One (SIL Open Font License). Where a course shows maps of India, the boundary comes from the Survey of India.</p>
      </div>
    </footer>`;
}
