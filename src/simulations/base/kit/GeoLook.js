/**
 * GeoLook - shared look for geography scenes (GeoScene 3D, GeoMap 2D).
 *   GEO_COLOR_MAP      SimLook's map + earth tokens: strata1..6, elevLow/Mid/High/Peak,
 *                      seaShallow/Deep, ice, magma, skyDay/Dusk, mapLand/Ocean
 *   elevColor(c, m)    land/sea ramp for a height in metres (sea negative)
 *   STRATA             ['strata1'..'strata6'], top (young) to bottom (old)
 *   timeAt(t, axis)    time scrub: t in [0,1] -> years on a linear or log axis
 *   formatYears(y)     "50 million years", "12,000 years"
 * Keep one ramp and one strata order across a module: learners read colour as rock type.
 */
import { COLOR_TOKEN_MAP, mix } from './SimLook.js';

export const GEO_COLOR_MAP = {
  ...COLOR_TOKEN_MAP,
  strata1:    ['--sim-strata-1',    '#e8c07a'],
  strata2:    ['--sim-strata-2',    '#c98b4e'],
  strata3:    ['--sim-strata-3',    '#a4603b'],
  strata4:    ['--sim-strata-4',    '#7d8c5c'],
  strata5:    ['--sim-strata-5',    '#6e7394'],
  strata6:    ['--sim-strata-6',    '#4d4262'],
  elevLow:    ['--sim-elev-low',    '#45a862'],
  elevMid:    ['--sim-elev-mid',    '#b2b85e'],
  elevHigh:   ['--sim-elev-high',   '#a07652'],
  elevPeak:   ['--sim-elev-peak',   '#f1f5f9'],
  seaShallow: ['--sim-sea-shallow', '#2bb3c9'],
  seaDeep:    ['--sim-sea-deep',    '#164a86'],
  ice:        ['--sim-ice',         '#cfeaff'],
  magma:      ['--sim-magma',       '#ff5a1f'],
  skyDay:     ['--sim-sky-day',     '#5fb4ff'],
  skyDusk:    ['--sim-sky-dusk',    '#ff9a6b'],
  mapLand:    ['--sim-map-land',    '#2f3b58'],
  mapOcean:   ['--sim-map-ocean',   '#0b1f40'],
};

export const STRATA = ['strata1', 'strata2', 'strata3', 'strata4', 'strata5', 'strata6'];

/** Height in metres -> ramp colour. o: { seaLevel (m, default 0), top (m at full snow, default 5000) }. */
export function elevColor(c, m, o = {}) {
  const sea = o.seaLevel ?? 0, top = o.top ?? 5000;
  if (m < sea) return mix(c.seaShallow, c.seaDeep, Math.min(1, (sea - m) / 4000));
  const u = Math.min(1, (m - sea) / top);
  if (u < 0.3) return mix(c.elevLow, c.elevMid, u / 0.3);
  if (u < 0.75) return mix(c.elevMid, c.elevHigh, (u - 0.3) / 0.45);
  return mix(c.elevHigh, c.elevPeak, (u - 0.75) / 0.25);
}

/** axis: { from, to (years ago, from > to), log (default true when from/to > 100) }. */
export function timeAt(t, axis) {
  const u = Math.max(0, Math.min(1, t));
  const a = Math.max(1, axis.from), b = Math.max(1, axis.to);
  const log = axis.log ?? a / b > 100;
  return log ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * u) : a + (b - a) * u;
}

export function formatYears(y) {
  const r = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  if (y >= 1e9) return `${r(y / 1e9)} billion years`;
  if (y >= 1e6) return `${r(y / 1e6)} million years`;
  if (y >= 1e4) return `${Math.round(y / 1e3).toLocaleString('en-IN')},000 years`;
  return `${Math.round(y).toLocaleString('en-IN')} years`;
}
