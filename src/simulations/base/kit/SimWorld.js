/**
 * SimWorld - the world behind a DOM or SVG scene, in CSS: the same settings SimLook paints on canvas
 * (kit/paperKind.js SETTINGS: sky | field | water | parchment | casefile | none; riso and lab stay the paper of
 * SimLookDom), from the same --sim-set-* tokens, so night and day need no theme selector inside a
 * shadow root (a night-only token is transparent by day and the other way round).
 *
 * Where it shows: a scene root with the kit's .sl-backdrop class (SimLookDom; SvgScene), and the
 * .sl-world layer DomSimulation puts behind every scene root. A scene that paints its own opaque
 * root background covers the layer; one that leaves the root transparent stands in the world.
 * DomSimulation sets data-sim-setting on the scale wrap (resolved through the look). The floor band a
 * stage paints (SimSvg backdropSvg) reads --sl-floor. Not a scene: no class export.
 */
// The setting assets resolve next to this module (absolute, so the CSS works inside any shadow root).
const PAPER_GRAIN = new URL('./paper/grain.svg', import.meta.url).href;
const SET = (name) => new URL(`./paper/${name}.svg`, import.meta.url).href;

export const SIM_WORLD_CSS = `
.sl-world { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.sl-world::before, .sl-world::after { content: ''; position: absolute; inset: 0; pointer-events: none; }
/* The worlds (kit/paperKind.js SETTINGS; DomSimulation sets data-sim-setting on the scale wrap, resolved through the look):
   sky | field | water | parchment | none. The same world SimLook paints on canvas, from the same --sim-set-* tokens; night
   and day come from the tokens alone (a night-only token is transparent by day and the other way round), so no theme
   selector is needed inside a shadow root. Layers back to front: sky or water, the aurora or the shafts, the band at the
   horizon, the light (the pool behind the hero by night, the sun side by day), stars (before), the ground plane (after,
   a kit mask: far ridge at 55%, near ground solid). A stage's own floor band (SimSvg backdropSvg) reads --sl-floor. */
[data-sim-setting="sky"] :is(.sl-backdrop, .sl-world), [data-sim-setting="field"] :is(.sl-backdrop, .sl-world) {
  --sl-hz: 78%; --sl-floor: var(--sim-set-ground);
  background-color: var(--sim-set-ground);
  background-image:
    radial-gradient(ellipse 60% 55% at 50% 50%, var(--sim-set-pool), transparent 70%),
    radial-gradient(ellipse 70% 60% at 18% 8%, color-mix(in srgb, var(--sim-set-sun) 85%, transparent), transparent 70%),
    radial-gradient(ellipse 9% 4% at 20% 22%, color-mix(in srgb, var(--sim-set-sun) 60%, transparent) 98%, transparent),
    radial-gradient(ellipse 11% 5% at 56% 16%, color-mix(in srgb, var(--sim-set-sun) 60%, transparent) 98%, transparent),
    radial-gradient(ellipse 8% 4% at 86% 26%, color-mix(in srgb, var(--sim-set-sun) 60%, transparent) 98%, transparent),
    linear-gradient(180deg, transparent, color-mix(in srgb, var(--sim-set-band) 55%, transparent)),
    linear-gradient(172deg, transparent 22%, color-mix(in srgb, var(--sim-set-aurora) 20%, transparent) 46%, transparent 58%, color-mix(in srgb, var(--sim-set-aurora) 13%, transparent) 68%, transparent 82%),
    linear-gradient(180deg, var(--sim-set-sky-top), var(--sim-set-sky-low));
  background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 20%, 100% 46%, 100% var(--sl-hz);
  background-position: 0 0, 0 0, 0 0, 0 0, 0 0, 0 calc(var(--sl-hz) - 20%), 0 6%, 0 0;
  background-repeat: no-repeat;
}
[data-sim-setting="field"] :is(.sl-backdrop, .sl-world) { --sl-hz: 66%; }
[data-sim-setting="sky"] :is(.sl-backdrop, .sl-world)::before, [data-sim-setting="field"] :is(.sl-backdrop, .sl-world)::before {
  inset: 0 0 calc(100% - var(--sl-hz) + 6%) 0; opacity: 1;
  background: var(--sim-set-star);
  -webkit-mask: url("${SET('stars')}") 0 0 / 340px 340px repeat;
  mask: url("${SET('stars')}") 0 0 / 340px 340px repeat;
}
[data-sim-setting="sky"] :is(.sl-backdrop, .sl-world)::after {
  inset: auto 0 0 0; height: 30%; opacity: 1;
  background: linear-gradient(180deg, var(--sim-set-ground-far) 0 42%, var(--sim-set-ground) 42%);
  -webkit-mask: url("${SET('hills')}") center bottom / 100% 100% no-repeat;
  mask: url("${SET('hills')}") center bottom / 100% 100% no-repeat;
}
[data-sim-setting="field"] :is(.sl-backdrop, .sl-world)::after {
  inset: auto 0 0 0; height: 38%; opacity: 1;
  background: linear-gradient(180deg, var(--sim-set-ground-far) 0 13%, var(--sim-set-ground) 13%);
  -webkit-mask: url("${SET('field')}") center bottom / 100% 100% no-repeat;
  mask: url("${SET('field')}") center bottom / 100% 100% no-repeat;
}
[data-sim-setting="water"] :is(.sl-backdrop, .sl-world) {
  --sl-floor: var(--sim-set-sand);
  background-color: var(--sim-set-water-deep);
  background-image:
    url("${SET('caustics')}"),
    linear-gradient(180deg, var(--sim-set-sun), var(--sim-set-sun)),
    linear-gradient(180deg, var(--sim-set-water-top), var(--sim-set-water-deep));
  background-size: 100% auto, 100% 9%, 100% 100%;
  background-position: 0 6%, 0 0, 0 0;
  background-repeat: no-repeat;
}
[data-sim-setting="water"] :is(.sl-backdrop, .sl-world)::before {
  inset: 0 0 18% 0; opacity: 1;
  background: linear-gradient(104deg, transparent 9%, color-mix(in srgb, var(--sim-set-shaft) 20%, transparent) 10% 15%, transparent 16%,
    transparent 25%, color-mix(in srgb, var(--sim-set-shaft) 18%, transparent) 26% 30%, transparent 31%,
    transparent 41%, color-mix(in srgb, var(--sim-set-shaft) 15%, transparent) 42% 45%, transparent 46%);
  -webkit-mask: linear-gradient(180deg, #000, transparent 95%);
  mask: linear-gradient(180deg, #000, transparent 95%);
}
[data-sim-setting="water"] :is(.sl-backdrop, .sl-world)::after {
  inset: auto 0 0 0; height: 17%; opacity: 1;
  background: var(--sim-set-sand);
  -webkit-mask: url("${SET('sand')}") center bottom / 100% 100% no-repeat;
  mask: url("${SET('sand')}") center bottom / 100% 100% no-repeat;
}
[data-sim-setting="parchment"] :is(.sl-backdrop, .sl-world) {
  --sl-floor: var(--sim-set-parchment);
  background-color: var(--sim-set-parchment);
  background-image:
    url("${PAPER_GRAIN}"),
    radial-gradient(ellipse 60% 55% at 50% 50%, color-mix(in srgb, var(--sim-set-pool) 60%, transparent), transparent 70%),
    radial-gradient(ellipse 70% 60% at 18% 8%, color-mix(in srgb, var(--sim-set-sun) 50%, transparent), transparent 70%),
    linear-gradient(180deg, transparent, color-mix(in srgb, var(--sim-set-band) 35%, transparent)),
    linear-gradient(180deg, var(--sim-set-wash-top), var(--sim-set-wash-low));
  background-size: 128px 128px, 100% 100%, 100% 100%, 100% 22%, 100% 71%;
  background-position: 0 0, 0 0, 0 0, 0 49%, 0 0;
  background-repeat: repeat, no-repeat, no-repeat, no-repeat, no-repeat;
}
[data-sim-setting="parchment"] :is(.sl-backdrop, .sl-world)::before {
  inset: 0 0 36% 0; opacity: 0.7;
  background: var(--sim-set-star);
  -webkit-mask: url("${SET('stars')}") 0 0 / 340px 340px repeat;
  mask: url("${SET('stars')}") 0 0 / 340px 340px repeat;
}
[data-sim-setting="parchment"] :is(.sl-backdrop, .sl-world)::after {
  inset: auto 0 0 0; height: 33%; opacity: 1;
  background: color-mix(in srgb, var(--sim-set-parchment) 95%, black) url("${PAPER_GRAIN}") 0 0 / 128px 128px repeat;
  -webkit-mask: url("${SET('parchment')}") center bottom / 100% 100% no-repeat;
  mask: url("${SET('parchment')}") center bottom / 100% 100% no-repeat;
}
/* casefile (an opt-in per-course desk; packs/look/plain/SPEC.md sec 8): the desk round the edge, the manila folder with
   its tab (before), the ruled paper card on it (after), and by night the dim lamp: the card's edges fall away into
   --sim-set-shade (transparent by day). The same numbers as SimLook casefileRects: desk 12, tab 18, pad 9. Specific
   enough to beat SimLookDom's backdrop 'flat' rules (plain keeps backdrop flat and paints this setting only). */
.sim-dom-scale-wrap[data-sim-setting="casefile"][data-sim-paper] :is(.sl-backdrop, .sl-world) {
  --cf-d: 12px; --cf-tab: 18px; --cf-pad: 9px; --sl-floor: color-mix(in srgb, var(--sim-label) 5%, transparent);
  --sim-bg-surface: var(--sim-set-paper); --sim-panel: var(--sim-set-paper);   /* forms and cards are paper here (SimScene does the same on canvas) */
  isolation: isolate;
  background: var(--sim-set-desk);
}
.sim-dom-scale-wrap[data-sim-setting="casefile"][data-sim-paper] :is(.sl-backdrop, .sl-world)::before {
  display: block; content: ''; position: absolute; z-index: -1; pointer-events: none; opacity: 1;
  inset: var(--cf-d); -webkit-mask: none; mask: none;
  background:
    linear-gradient(var(--sim-set-folder-edge), var(--sim-set-folder-edge)) 30px var(--cf-tab) / min(174px, 30% - 16px) 1px no-repeat,
    linear-gradient(var(--sim-set-folder), var(--sim-set-folder)) 0 var(--cf-tab) / 100% calc(100% - var(--cf-tab) - 3px) no-repeat,
    linear-gradient(var(--sim-set-folder), var(--sim-set-folder)) 22px 0 / min(190px, 30%) calc(var(--cf-tab) + 6px) no-repeat,
    linear-gradient(var(--sim-set-folder-edge), var(--sim-set-folder-edge)) 0 var(--cf-tab) / 100% calc(100% - var(--cf-tab)) no-repeat;
  border-radius: 5px;
  filter: drop-shadow(0 5px 7px color-mix(in srgb, black 45%, transparent));
}
.sim-dom-scale-wrap[data-sim-setting="casefile"][data-sim-paper] :is(.sl-backdrop, .sl-world)::after {
  display: block; content: ''; position: absolute; z-index: -1; pointer-events: none; opacity: 1;
  inset: calc(var(--cf-d) + var(--cf-tab) + var(--cf-pad)) calc(var(--cf-d) + var(--cf-pad)) calc(var(--cf-d) + var(--cf-pad));
  -webkit-mask: none; mask: none;
  background-color: var(--sim-set-card);
  background-image:
    radial-gradient(ellipse 75% 85% at 50% 30%, transparent 45%, var(--sim-set-shade)),
    repeating-linear-gradient(180deg, transparent 0 27px, var(--sim-set-rule) 27px 28px);
  background-size: 100% 100%, calc(100% - 20px) calc(100% - 60px);
  background-position: 0 0, 10px 54px;
  background-repeat: no-repeat;
  box-shadow: 0 1.5px 5px color-mix(in srgb, black 30%, transparent);
}
/* The quiet casefile (LookProfile casefile: 'quiet', plain since 2026-11-05): the same insets, so a scene lays out as on
   the desk, but only the paper, one hairline folder rule with its tab outlined, the card flat. No desk, fill or shadow. */
.sim-dom-scale-wrap[data-sim-setting="casefile"][data-sim-casefile="quiet"][data-sim-paper] :is(.sl-backdrop, .sl-world) { background: var(--sim-set-desk); }
.sim-dom-scale-wrap[data-sim-setting="casefile"][data-sim-casefile="quiet"][data-sim-paper] :is(.sl-backdrop, .sl-world)::before {
  background: linear-gradient(var(--sim-set-folder-edge), var(--sim-set-folder-edge)) 0 var(--cf-tab) / 100% 1px no-repeat;
  border-radius: 0; filter: none;
}
.sim-dom-scale-wrap[data-sim-setting="casefile"][data-sim-casefile="quiet"][data-sim-paper] :is(.sl-backdrop, .sl-world)::after {
  inset: var(--cf-d) auto auto calc(var(--cf-d) + 22px);
  width: min(190px, 30%); height: calc(var(--cf-tab) + 1px); box-sizing: border-box;
  background: none; box-shadow: none;
  border: 1px solid var(--sim-set-folder-edge); border-bottom: 0; border-radius: 3px 3px 0 0;
}
[data-sim-setting="none"] :is(.sl-backdrop, .sl-world) { background: var(--sim-bg-surface); }
[data-sim-setting="none"] :is(.sl-backdrop, .sl-world)::before, [data-sim-setting="none"] :is(.sl-backdrop, .sl-world)::after { display: none; }
`;
