import { COLOR_TOKEN_MAP, loadColors, MIN_PX, clamp, clamp01, lerp, mix, inkOn, rr, mulberry32 } from './kit/SimLook.js';

// Default colours for calls that pass none: the closed palette resolved from
// the page (both themes), cached per theme. Scenes should still pass their own
// this.colors values; this only replaces the old hardcoded dark hex defaults.
let _themeKey = null, _themeColors = null;
function themeColors() {
  let el = null, key = '';
  try {
    el = document.documentElement;
    key = el.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch { /* no DOM: fall back to the palette defaults */ }
  if (!_themeColors || key !== _themeKey) { _themeColors = loadColors(el, COLOR_TOKEN_MAP); _themeKey = key; }
  return _themeColors;
}

export const SimDraw = {
  // Shared helpers, so a canvas scene needs no local copy.
  MIN_PX, clamp, clamp01, lerp, mix, inkOn, rr, mulberry32,

  // Sprite caching for particle rendering to avoid expensive gradient fills on low-end devices
  _spriteCache: new Map(), // Map<string, OffscreenCanvas>

  // Lighten/darken a hex color by a fraction (amt > 0 lightens, amt < 0 darkens).
  // The one allowed substitute for a structural gradient (design doc §3.2) —
  // two-tone flat shading instead of createLinearGradient/createRadialGradient.
  shade(hex, amt) {
    let r, g, b;
    if (/^#([0-9a-f]{3})$/i.test(hex)) {
      r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
    } else if (/^#([0-9a-f]{6})$/i.test(hex)) {
      r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16);
    } else return hex;
    const f = 1 + amt, c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(r)},${c(g)},${c(b)})`;
  },

  // Hex color -> rgba(...) string at the given alpha.
  withAlpha(hex, a) {
    let r, g, b;
    if (/^#([0-9a-f]{3})$/i.test(hex)) {
      r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
    } else if (/^#([0-9a-f]{6})$/i.test(hex)) {
      r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16);
    } else return hex;
    return `rgba(${r},${g},${b},${a})`;
  },

  getSprite(key, createFn) {
    if (!this._spriteCache.has(key)) {
      const oc = new OffscreenCanvas(64, 64);
      const ctx = oc.getContext('2d');
      createFn(ctx, oc);
      this._spriteCache.set(key, oc);
    }
    return this._spriteCache.get(key);
  },

  // Consistent glow effect for organelles/molecules (uses sprite caching internally)
  drawGlow(ctx, x, y, r, color, alpha = 0.3) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },
  
  // Rounded-rect panel (for info boxes drawn on canvas)
  // NOTE: opts.bg should be a resolved color (e.g. scene's this.colors.x) —
  // canvas fillStyle cannot resolve CSS var(); the default is the theme's
  // --sim-bg-surface, resolved. Returns the box { x0, y0, w, h }.
  drawPanel(ctx, x, y, w, h, opts = {}) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, opts.radius || 8);
    ctx.fillStyle = opts.bg || themeColors().bgSurface;
    ctx.fill();
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = opts.lineWidth || 1;
      ctx.stroke();
    }
    return { x0: x, y0: y, w, h };
  },
  
  // Label with background pill
  // opts.size is raised to MIN_PX (14). Returns the pill's box { x0, y0, w, h }.
  drawLabel(ctx, text, x, y, opts = {}) {
    const tc = themeColors();
    const size = Math.max(MIN_PX, opts.size ?? MIN_PX);
    ctx.save();
    ctx.font = `600 ${size}px ${tc.fontBody}`;
    const paddingX = 8;
    const paddingY = 4;
    const metrics = ctx.measureText(text);
    const w = metrics.width + paddingX * 2;
    const h = size + 5 + paddingY * 2;
    
    // Draw pill centered at x,y but shifted up usually
    ctx.beginPath();
    ctx.roundRect(x - w/2, y - h - (opts.offsetY || 0), w, h, h/2);
    const bg = opts.bg || tc.bgDeep;
    ctx.fillStyle = bg;
    ctx.fill();
    
    ctx.fillStyle = opts.color || inkOn(tc, bg);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h/2 - (opts.offsetY || 0));
    ctx.restore();
    return { x0: x - w / 2, y0: y - h - (opts.offsetY || 0), w, h };
  },
  
  // Arrow (straight or curved) with optional label
  drawArrow(ctx, x1, y1, x2, y2, opts = {}) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = opts.color || themeColors().labelMuted;
    ctx.lineWidth = opts.lineWidth || 2;
    ctx.stroke();
    
    // Simple arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 10;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI/6), y2 - headLen * Math.sin(angle - Math.PI/6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI/6), y2 - headLen * Math.sin(angle + Math.PI/6));
    ctx.lineTo(x2, y2);
    ctx.fillStyle = opts.color || themeColors().labelMuted;
    ctx.fill();
  },
  
  // Dashed membrane line
  // NOTE: opts.color should be a resolved color (e.g. this.colors.membrane) —
  // canvas strokeStyle cannot resolve CSS var(); fallback kept in sync with
  // sim-theme.css's --sim-membrane dark value.
  drawMembrane(ctx, points, opts = {}) {
    ctx.save();
    ctx.beginPath();
    if (points.length > 0) ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = opts.color || themeColors().accent;
    ctx.lineWidth = opts.lineWidth || 2;
    ctx.stroke();
    ctx.restore();
  },
  
  // Animated particle trail
  drawTrail(ctx, points, color, fade = true) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (fade) ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  },
  
  // Standard molecule/atom circle with label
  drawMolecule(ctx, x, y, r, label, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    
    if (label) {
      const tc = themeColors();
      ctx.font = `700 ${MIN_PX}px ${tc.fontBody}`;
      ctx.fillStyle = inkOn(tc, color);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);
    }
  },
  
  // Animated pulsing ring (for highlighting)
  drawPulse(ctx, x, y, r, color, t) {
    const scale = 1 + (t % 1); // 1 to 2
    const alpha = 1 - (t % 1); // 1 to 0
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r * scale, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
};
