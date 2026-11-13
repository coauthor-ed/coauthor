import { html, css } from 'lit';
import { SimulationLoader } from '../SimulationLoader.js';
import { controlCurrent, optValue, optLabel, toControlValue } from '../../simulations/base/SimControls.js';
import { answerStageQueries } from './stageAnswer.js';
import { brandIcon } from '../../ui/components/LookSlots.js';
import { measureRestTop, restTopChanged, sideRestExtra } from './blockImageLayout.js';

// scene -> stop answering cue:stage-query, for destroyQuestionSimulation().
const stageAnswers = new WeakMap();

/**
 * simulationHost — a lightweight, non-beat-synced mount/control/destroy
 * helper for attaching a companion `CanvasSimulation` scene to a QUESTION
 * plugin (`mcq-single@2`, and any `QuestionBase` subclass — see
 * `QuestionBase.js`). A question's `data.simulation` carries an optional
 * `role`: `"setup"` mounts immediately, alongside the stem, for a scene that
 * visualizes what the question is ASKING ABOUT (e.g. an interactive figure
 * a numeric problem refers to — "use the slider to see stages 1 through
 * 5"); `"explanation"` (the default, for backward compatibility with every
 * question authored before `role` existed) mounts only once the student has
 * answered, for a scene that explains the ANSWER. Both use this same
 * mount/control/destroy plumbing — only the gating condition and the
 * card's own heading (see `renderSimCard` below) differ, decided by each
 * plugin's own `updated()`/`_renderContent()`, not by this module.
 *
 * A question has no lesson "beats" to sync a scene to the way
 * `content-block@1` does (see `docs/simulation-authoring.md`), so this never
 * calls `onBeatChange()` — it mounts the scene once and lets it run free
 * with its own `CONTROLS`, the same "unsynced" mode `poe-observe-sim@1`
 * already uses for its own simulations.
 *
 * Deliberately NOT shared with `content-block.js`'s own (beat-aware, far
 * more involved) mounting/control code — that component is used by every
 * lesson slide in the platform, and refactoring it was out of scope for
 * adding this to questions. This is a smaller, purpose-built subset for the
 * question-reveal use case; a future cleanup could unify the two if
 * `content-block.js` ever needs to shed its beat-specific logic.
 */

/**
 * @param {HTMLElement} hostEl - empty container the scene should mount into
 * @param {string} src
 * @param {string} [bundleId]
 * @param {{residents?: Function, beside?: Function}} [stage]  passed to answerStageQueries()
 * @param {'setup'|'explanation'} [role]  a question's `simulation.role`; set on the
 *   scene as `hostRole` before setup(), so a scene can tell a setup mount (show the
 *   question, not the answer) from a reveal. Undefined on any other mount.
 * @returns {Promise<{scene: object, SceneClass: Function}>}
 */
export async function mountQuestionSimulation(hostEl, src, bundleId, stage = {}, role = undefined) {
  const module = await SimulationLoader.loadModule(src, bundleId);
  const SceneClass = SimulationLoader.resolveSceneClass(module);

  // DomSimulation's own _resolveIsPortrait() (src/simulations/base/DomSimulation.js)
  // prefers config.isPortrait when supplied, else falls back to measuring the
  // host element's own clientWidth/clientHeight - but `hostEl` here is still
  // empty at this point (nothing appended yet), so its clientHeight reads 0
  // and that fallback silently always resolves to landscape, never portrait,
  // regardless of the actual device. content-block.js avoids this by reading
  // matchMedia('(orientation: portrait)') itself and threading the result
  // through as config.isPortrait (see its own connectedCallback) - this mount
  // path has no beat-aware host component doing that measurement, so read
  // the same signal directly here instead of leaving DomSimulation to guess
  // from a container that isn't laid out yet.
  const isPortrait = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(orientation: portrait)').matches;
  await SimulationLoader.markHost(hostEl, bundleId);
  const scene = new SceneClass(hostEl, { isPortrait });
  stageAnswers.set(scene, answerStageQueries({ ...stage, stage: () => hostEl, frame: () => hostEl.closest('.q-sim-host-container') || hostEl }));
  scene.allowResume = true;
  scene.hostRole = role;
  await scene.setup();

  // A scene built for a lesson slide (the normal case — see
  // docs/simulation-authoring.md) gates its CONTROLS behind reaching its
  // last `BEAT_STEP_MAP` entry, the documented "locked-while-explaining ->
  // free-to-explore-once-explained" handoff — and only unlocks that once
  // `onBeatChange()` has driven it all the way there. A question has no
  // beats to drive it with, and a student arriving here has already
  // committed an answer, so replaying the explanation from its very first
  // beat is the wrong default: jump straight to the fully-unlocked
  // freeplay state instead, the same way every scene's own `onBeatChange`
  // already clamps an out-of-range index to its last valid step (see
  // BEAT_STEP_MAP's `Math.min(beatIndex, BEAT_STEP_MAP.length - 1)`
  // pattern) — this only touches scenes that implement `onBeatChange`;
  // anything else is unaffected. Wrapped defensively: a scene's own
  // onBeatChange throwing must not take the whole question down with it.
  // Q-60: a setup canvas scene publishes its aspect for setupSimFitStyles'
  // height budget (a DOM scene publishes --sim-aspect itself).
  if (role === 'setup' && scene.canvas && SceneClass.WIDTH && SceneClass.HEIGHT) {
    hostEl.closest('.q-sim-host-container')?.style.setProperty('--setup-sim-canvas-aspect', String(SceneClass.WIDTH / SceneClass.HEIGHT));
  }

  try {
    scene.onBeatChange?.(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  } catch (err) {
    console.warn(`[simulationHost] onBeatChange(freeplay) failed for "${src}"`, err);
  }

  if (typeof scene.start === 'function') scene.start();
  if (typeof scene.resume === 'function') scene.resume();
  return { scene, SceneClass };
}

/** Best-effort cleanup — never lets a teardown failure propagate into the
 *  caller's own disconnectedCallback (which must always finish running). */
export function destroyQuestionSimulation(scene) {
  if (scene) stageAnswers.get(scene)?.();
  try { scene?.destroy?.(); } catch { /* best-effort cleanup */ }
}

/**
 * The control types beyond button/slider/select/number: `toggle`, `checkbox`
 * (a boolean) and `segmented` (a row of buttons, value = the option's `value`
 * as a string). Shared by content-block@1 and renderSimControls() so the two
 * Lit hosts cannot drift; the list of types lives in SimControls.js. Returns
 * an empty template for any other type.
 *
 * @param {object} ctrl
 * @param {object} scene
 * @param {(id: string, value: *) => void} onChange
 * @param {() => void} requestUpdate
 * @param {boolean} [isDisabled]
 * @param {boolean} [compact] - the narrow-panel sizing content-block uses
 */
export function renderExtendedControl(ctrl, scene, onChange, requestUpdate, isDisabled = false, compact = false) {
  const cur = controlCurrent(scene, ctrl);
  const label = html`<label style="font-size: 0.85rem; color: var(--text-main); white-space: nowrap;">${ctrl.label || ctrl.id}</label>`;
  if (ctrl.type === 'toggle' || ctrl.type === 'checkbox') {
    return html`
      <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; opacity: ${isDisabled ? '0.4' : '1'};">
        <input type="checkbox" ?disabled=${isDisabled} .checked=${!!cur}
               style="width: 18px; height: 18px; cursor: inherit; accent-color: var(--primary-color);"
               @change=${(e) => { onChange(ctrl.id, toControlValue(ctrl, e.target.checked)); requestUpdate(); }}>
        <span>${ctrl.label || ctrl.id}</span>
      </label>
    `;
  }
  if (ctrl.type === 'segmented') {
    // tall: a row a finger uses (kit/TapLight.js): 44 px and full-size text even in a compact bar.
    const pad = ctrl.tall ? '6px 12px' : compact ? '3px 8px' : '6px 14px';
    const size = ctrl.tall ? '0.95rem' : compact ? '0.7rem' : '0.85rem';
    return html`
      <div style="display: inline-flex; align-items: center; flex-wrap: wrap; gap: 8px; max-width: 100%;">
        ${label}
        <div role="group" aria-label="${ctrl.label || ctrl.id}" style="display: inline-flex; flex-wrap: wrap; max-width: 100%; border-radius: 6px; overflow: hidden; border: 1px solid var(--shell-border); opacity: ${isDisabled ? '0.4' : '1'};">
          ${(ctrl.options || []).map((opt) => {
            const on = String(optValue(opt)) === String(cur);
            return html`<button type="button" aria-pressed="${on ? 'true' : 'false'}" ?disabled=${isDisabled}
              style="padding: ${pad}; ${ctrl.tall ? 'min-height: 44px; ' : ''}border: none; font-family: inherit; font-size: ${size}; font-weight: ${on ? '700' : '500'}; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; background: ${on ? 'var(--primary-color)' : 'var(--shell-bg)'}; color: ${on ? 'var(--on-primary)' : 'var(--text-main)'};"
              @click=${() => { if (isDisabled) return; onChange(ctrl.id, toControlValue(ctrl, optValue(opt))); requestUpdate(); }}>${optLabel(opt)}</button>`;
          })}
        </div>
      </div>
    `;
  }
  return html``;
}

/**
 * Renders `static CONTROLS` (button/slider/select/number/toggle/checkbox/segmented) for a mounted
 * scene — the same control shapes `content-block@1` supports, trimmed to
 * what a question-reveal companion actually needs (no play/pause icon
 * special-case, no reset-all-sliders sweep — add here if a future scene
 * needs them, rather than speculatively carrying content-block's full
 * surface into a context that hasn't asked for it).
 *
 * @param {Function} sceneClass
 * @param {object} scene
 * @param {(id: string, value: *) => void} onChange - forwarded to scene.onControlChange
 * @param {() => void} requestUpdate - the host element's own requestUpdate, so
 *   isControlHidden()/isControlDisabled() re-evaluate after a change
 */
export function renderSimControls(sceneClass, scene, onChange, requestUpdate) {
  if (!sceneClass?.CONTROLS?.length) return html``;
  const controls = sceneClass.CONTROLS;

  const items = controls.map((ctrl) => {
    const isHidden = typeof scene?.isControlHidden === 'function' ? scene.isControlHidden(ctrl.id) : false;
    if (isHidden) return html``;
    const isDisabled = typeof scene?.isControlDisabled === 'function' ? scene.isControlDisabled(ctrl.id) : false;

    if (ctrl.type === 'button') {
      return html`
        <button
          type="button"
          ?disabled=${isDisabled}
          style="padding: 6px 14px; background: var(--primary-color); color: var(--on-primary); border: none; border-radius: 6px; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; opacity: ${isDisabled ? '0.4' : '1'}; font-family: inherit; font-size: 0.85rem; font-weight: var(--fw-medium); height: 34px;"
          @click=${() => { if (isDisabled) return; onChange(ctrl.id, true); requestUpdate(); }}
        >${ctrl.label || 'Action'}</button>
      `;
    }
    if (ctrl.type === 'slider' || ctrl.type === 'range') {
      const valId = `qsim-val-${ctrl.id}`;
      const cur = controlCurrent(scene, ctrl) ?? 50;
      return html`
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <label style="font-size: 0.85rem; color: var(--text-main); white-space: nowrap;">${ctrl.label || ctrl.id}</label>
          <input type="range" min="${ctrl.min ?? 0}" max="${ctrl.max ?? 100}" step="${ctrl.step ?? 1}" .value="${cur}"
                 style="width: 140px; cursor: pointer;"
                 @input=${(e) => {
                   const disp = e.target.parentElement.querySelector(`#${valId}`);
                   if (disp) disp.textContent = `${e.target.value}${ctrl.suffix ?? ''}`;
                   onChange(ctrl.id, e.target.value);
                   // A scene may refuse or snap the value: the thumb and its label go where the scene went.
                   const held = scene?.getControlValue?.(ctrl.id);
                   if (held != null && Number(held) !== Number(e.target.value)) {
                     e.target.value = held;
                     if (disp) disp.textContent = `${held}${ctrl.suffix ?? ''}`;
                   }
                   requestUpdate();
                 }}>
          <!-- .textContent, not a text child: the @input handler above writes the
               label directly, which would delete a Lit text part's node. -->
          <span id="${valId}" style="font-size: 0.85rem; font-weight: bold; min-width: 36px; color: var(--text-main);" .textContent="${`${cur}${ctrl.suffix ?? ''}`}"></span>
        </div>
      `;
    }
    if (ctrl.type === 'select') {
      const cur = controlCurrent(scene, ctrl);
      return html`
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <label style="font-size: 0.85rem; color: var(--text-main); white-space: nowrap;">${ctrl.label || ctrl.id}</label>
          <select style="padding: 4px 8px; border-radius: 4px; background: var(--shell-bg); color: var(--text-main); border: 1px solid var(--shell-border);"
                  @change=${(e) => { onChange(ctrl.id, e.target.value); requestUpdate(); }}>
            ${(ctrl.options || []).map((opt) => html`<option value="${optValue(opt)}" .selected="${cur !== undefined && String(optValue(opt)) === String(cur)}">${optLabel(opt)}</option>`)}
          </select>
        </div>
      `;
    }
    if (ctrl.type === 'number') {
      return html`
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <label style="font-size: 0.85rem; color: var(--text-main); white-space: nowrap;">${ctrl.label || ctrl.id}</label>
          <input type="number" min="${ctrl.min ?? ''}" max="${ctrl.max ?? ''}" step="${ctrl.step ?? 1}" .value="${controlCurrent(scene, ctrl) ?? ''}"
                 style="width: 80px; padding: 4px 8px; border-radius: 4px; background: var(--shell-bg); color: var(--text-main); border: 1px solid var(--shell-border);"
                 @change=${(e) => { onChange(ctrl.id, e.target.value); requestUpdate(); }}>
          ${ctrl.suffix ? html`<span style="font-size: 0.85rem; color: var(--text-main);">${ctrl.suffix}</span>` : ''}
        </div>
      `;
    }
    return renderExtendedControl(ctrl, scene, onChange, requestUpdate, isDisabled);
  });

  return html`
    <div class="q-sim-controls" style="margin-top: 0.75rem; width: 100%; padding: 0.7rem 1rem; box-sizing: border-box; background: var(--bg-surface); border-radius: 8px; display: flex; flex-direction: row; gap: 16px; align-items: center; flex-wrap: wrap;">
      ${items}
    </div>
  `;
}

/**
 * The CSS every `renderSimCard()` caller must carry in its own `static styles`
 * (see that function's doc comment) - the same rules `QuestionBase` keeps
 * inline, exported so a new consumer (poe-predict@1's `role: "setup"` sim)
 * does not have to copy them a third time.
 */
export const companionSimStyles = css`
  .q-sim-host-container {
    width: 100%;
    max-width: 820px;
    margin: 0 auto;
    height: auto;
    border-radius: 12px;
    overflow: hidden;
    background: var(--sim-bg-deep, #0a0f1e);
    line-height: 0;
  }
  .q-sim-host-container canvas:not([data-sim-own-size]):not(.sim-dom-root canvas[style*="width"], .sim-dom-root canvas[style*="height"]) { width: 100% !important; height: auto !important; display: block; }
  .q-sim-host-container .sim-dom-root { line-height: normal; }
  .q-sim-controls { max-width: 820px; margin-left: auto; margin-right: auto; }
  .q-sim-card {
    margin-top: 1.25rem;
    padding: 16px 18px;
    background: var(--bg-surface);
    border-radius: 16px;
    border: 2px solid var(--border-color);
    box-shadow: var(--lip-tile) var(--border-color);
  }
  .cb-layout-right .q-sim-card,
  .cb-layout-left  .q-sim-card { flex: 1.5 1 55%; max-width: 60%; margin-top: 0; }
  @media (max-width: 600px) {
    .cb-layout-right .q-sim-card,
    .cb-layout-left  .q-sim-card { flex: unset; max-width: 100%; width: 100%; box-sizing: border-box; }
  }
`;

/**
 * Fit rules for a `role: "setup"` sim card beside the prompt (Q-59 built them
 * for poe-predict@1; Q-60 shares them with QuestionBase and mcq-single@2).
 * Put AFTER the host's own card rules in `static styles`.
 *
 * - Side by side (min-width 601): the scene is sized from the viewport
 *   HEIGHT so the card ends above the action bar. `--setup-sim-chrome` is
 *   everything in that height that is not the scene; every host sets the
 *   measured value with fitSetupSimAtRest() (card chrome + resting offset;
 *   poe-predict since Q-86, its fixed 170 px default left the card 47 px
 *   under the action bar at 1280x800). A DOM scene
 *   publishes --sim-aspect, a canvas scene --setup-sim-canvas-aspect
 *   (mountQuestionSimulation).
 * - Phone (max-width 600): the card stacks and the page scrolls, as
 *   content-block does since Q-57; the card drops its own chrome so the
 *   scene takes the full column.
 */
export const setupSimFitStyles = css`
  @media (min-width: 601px) {
    .cb-layout-right .q-sim-host-container .sim-dom-scale-wrap,
    .cb-layout-left  .q-sim-host-container .sim-dom-scale-wrap {
      max-width: min(100%, calc((100vh - var(--lesson-sticky-header-h, 0px) - var(--lesson-chrome-bottom, 0px) - var(--setup-sim-chrome, 170px)) * var(--sim-aspect, 1000)));
      margin: 0 auto;
    }
    .cb-layout-right .q-sim-host-container,
    .cb-layout-left  .q-sim-host-container {
      max-width: min(820px, calc(max(240px, 100vh - var(--lesson-sticky-header-h, 0px) - var(--lesson-chrome-bottom, 0px) - var(--setup-sim-chrome, 170px) - 16px) * var(--setup-sim-canvas-aspect, 1000)));
    }
    .cb-layout-right .q-sim-card,
    .cb-layout-left  .q-sim-card {
      position: sticky;
      top: calc(var(--lesson-sticky-header-h, 0px) + 8px);
    }
  }
  @media (max-width: 600px) {
    .cb-layout-right .q-sim-card,
    .cb-layout-left  .q-sim-card {
      padding: 0;
      background: transparent;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
  }
`;

/**
 * Sets `--setup-sim-chrome` on a question's side setup-sim row: the card's
 * own chrome (heading, padding, controls; not the scene) plus how much
 * lower than its sticky spot the row sits at rest (measureRestTop /
 * sideRestExtra, Q-59). Call from the host's updated(). The value does not
 * depend on the scene's size, and sub-3 px changes are ignored, so it
 * cannot loop. A phone clears it (the page scrolls there). `extra`: chrome
 * the host draws below the row (poe-predict's own card padding, Q-86).
 */
export function fitSetupSimAtRest(root, extra = 0) {
  const row = root?.querySelector('.cb-layout-right, .cb-layout-left');
  const card = row?.querySelector(':scope > .q-sim-card');
  const box = card?.querySelector('.q-sim-host-container');
  if (!box || typeof window === 'undefined') return;
  if (window.matchMedia('(max-width: 600px)').matches) {
    row.style.removeProperty('--setup-sim-chrome');
    return;
  }
  // sideRestExtra counts from header + 12; + 8 air above the bar
  const next = Math.round(card.offsetHeight - box.offsetHeight + 20 + extra + sideRestExtra(measureRestTop(row)));
  const prev = parseFloat(row.style.getPropertyValue('--setup-sim-chrome'));
  if (!restTopChanged(Number.isFinite(prev) ? prev : null, next)) return;
  row.style.setProperty('--setup-sim-chrome', `${next}px`);
}

/**
 * The wrapping card shown around a mounted (or loading/failed) companion
 * simulation — shared markup so `QuestionBase` and `mcq-single@2` render an
 * identical block rather than two subtly different ones.
 *
 * `role` picks the card's own heading/icon: `"setup"` (default heading
 * "Explore the setup") visualizes what the question's own stem describes —
 * mounted and shown immediately, alongside the stem, since it's part of
 * understanding the question, not part of its answer. `"explanation"`
 * (heading "See it happen") is the reveal-gated companion shown after the
 * student answers — see `QuestionBase.js`/`mcq-single@2`'s own role-gating
 * for why each only ever renders in its own slot, never both.
 *
 * The whole card carries a `.q-sim-card` class, and the canvas wrapper a
 * `.q-sim-host-container` class — both plain classes, never inline styles,
 * even though this function's own markup used to set `.q-sim-card`'s
 * margin-top inline. That was a real bug in its own right: an inline style
 * always beats a non-`!important` external CSS rule regardless of
 * selector specificity, so a consumer's own `.cb-layout-right .q-sim-card
 * { margin-top: 0 }` override (needed for side-by-side alignment — see
 * below) would have silently never applied while the div kept an inline
 * `style="margin-top: 1.25rem"`. This function only produces markup, it
 * doesn't inject a `<style>` tag — Lit's shadow DOM means CSS has to live
 * in the CONSUMING component's own `static styles` to take effect at all
 * (the same reason `.stem`/`.input-row` are plain classes there, not
 * inline styles) — so every caller of `renderSimCard` MUST include BOTH
 * rules below in its own `static styles`:
 *
 *   .q-sim-card { margin-top: 1.25rem; padding: 16px 18px; background: var(--bg-surface); border-radius: 16px; border: 2px solid var(--border-color); box-shadow: 0 3px 0 var(--border-color); }
 *   .q-sim-host-container { width: 100%; max-width: 820px; margin: 0 auto; height: auto; line-height: 0; }
 *   .q-sim-host-container canvas:not([data-sim-own-size]):not(.sim-dom-root canvas[style*="width"], .sim-dom-root canvas[style*="height"]) { width: 100% !important; height: auto !important; display: block; }
 *   .q-sim-host-container .sim-dom-root { line-height: normal; }
 *   .q-sim-controls { max-width: 820px; margin-left: auto; margin-right: auto; }
 *
 * `.q-sim-host-container .sim-dom-root` restores the text layout the
 * `line-height: 0` rule above collapses for a DomSimulation scene
 * (src/simulations/base/DomSimulation.js) — see its own class doc comment.
 *
 * ...PLUS, for `role: "setup"` to actually sit beside the question's own
 * input field instead of pushing it below the fold (a real report against
 * the stacked-only layout this replaces — a tall sim card, even capped at
 * 820px, is easily ~550px including its heading/controls, more than enough
 * to bury an input on a normal-height screen), the side-by-side sizing
 * that mirrors `content-block.js`'s own `.cb-layout-right .cb-image-wrap`
 * treatment exactly (`QuestionBase.js`/`mcq-single@2`'s `render()` wraps a
 * `role: "setup"` sim in `.cb-layout-right`/`.cb-layout-left` — see there):
 *
 *   .cb-layout-right .q-sim-card, .cb-layout-left .q-sim-card { flex: 1.5 1 55%; max-width: 60%; margin-top: 0; }
 *
 * Omitting any of this reproduces some version of the same class of bug —
 * it has shipped three times now (canvas not scaled to its container;
 * container itself uncapped and free to upscale past its source
 * resolution; card immovably stacked above the input it belongs beside) —
 * before a real screen caught each one in turn.
 *
 * @param {{ canvasHostId: string, controlsTemplate: import('/vendor/lit.js').TemplateResult, failed: boolean, errorMessage?: string, role?: 'setup'|'explanation' }} opts
 */
export function renderSimCard({ canvasHostId, controlsTemplate, failed, errorMessage, role = 'explanation' }) {
  const heading = role === 'setup' ? 'Explore the setup' : 'See it happen';
  const icon = brandIcon(role === 'setup' ? 'setup' : 'scene');
  return html`
    <div class="q-sim-card">
      <h4 style="margin: 0 0 10px 0; color: var(--text-main); font-size: 1.05rem; font-weight: var(--fw-heavy); display: flex; align-items: center; gap: 8px;">
        ${icon ? html`<span style="font-size: 1.2rem;">${icon}</span>` : ''} ${heading}
      </h4>
      ${failed
        ? html`<div style="padding: 12px; color: var(--error-text);">Couldn't load the companion simulation${errorMessage ? `: ${errorMessage}` : '.'}</div>`
        : html`
          <div class="q-sim-host-container" style="touch-action: pan-y;">
            <div id="${canvasHostId}"></div>
          </div>
          ${controlsTemplate}
        `}
    </div>
  `;
}
