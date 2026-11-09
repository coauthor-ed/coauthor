// SimLegacy.js - the kit backdrop for a canvas scene that is not a SimScene.
//
// A legacy CanvasSimulation paints its own flat bgDeep. One call in its place puts it on the same
// paper as every SimScene (riso, or graph for maths) with the course's faint setting behind it
// (chemistry: the lab wall), read from the host exactly as SimScene reads them:
//
//   ctx.clearRect(0, 0, W, H);
//   drawKitBackdrop(ctx, this, W, H);        // was: ctx.fillStyle = this.colors.bgDeep; ctx.fillRect(...)
//
// The kit palette is read once per this.colors object, so a theme change (_reloadColors builds a new
// one) repaints in the new theme. State lives in one field, scene._kitBg, clear of the reserved names.

import { loadColors, setFrame, setPaper, setSetting, drawBackdrop } from './SimLook.js';
import { paperKindOf, settingOf } from './paperKind.js';

/** style: drawBackdrop's ('plain' default: lighter corners, for a busy legacy frame). o: drawBackdrop's. */
export function drawKitBackdrop(ctx, scene, w, h, style = 'plain', o = {}) {
  const C = scene.constructor;
  let k = scene._kitBg;
  if (!k || k.src !== scene.colors) {
    k = scene._kitBg = {
      src: scene.colors,
      c: loadColors(scene.container),
      paper: paperKindOf(scene.container, C.PAPER),
      setting: settingOf(scene.container, C.SETTING),
    };
  }
  setFrame(w, h);
  setPaper(k.paper);
  setSetting(k.setting);
  try { drawBackdrop(ctx, k.c, style, o); } finally { setFrame(null); setPaper(null); setSetting(null); }
}
