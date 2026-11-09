// Shared flat two-tone character library for the "sort the crowd" key scenes
// (KeyBuilderScene.js) and their worked companions. Every creature is drawn in
// a 48x48 box. Body colour = the item's identity tone (a --sim-series-N token);
// every shadow, highlight and eye is a theme token at partial opacity, so both
// themes stay legible. No hex values anywhere.
//
// characterSvg(art, tone) -> '<svg ...>' string. `art` is a key of ART.

const EYES = (x1, x2, y, r = 3.4) =>
  `<circle class="eye" cx="${x1}" cy="${y}" r="${r}"/><circle class="eye" cx="${x2}" cy="${y}" r="${r}"/>` +
  `<circle class="spark" cx="${x1 + 1}" cy="${y - r * 0.35}" r="${r * 0.32}"/><circle class="spark" cx="${x2 + 1}" cy="${y - r * 0.35}" r="${r * 0.32}"/>`;
const BLUSH = (x1, x2, y) => `<ellipse class="blush" cx="${x1}" cy="${y}" rx="2.8" ry="1.8"/><ellipse class="blush" cx="${x2}" cy="${y}" rx="2.8" ry="1.8"/>`;
const SMILE = (x, y, w = 6) => `<path class="mouth" d="M${x} ${y} q${w / 2} 3 ${w} 0"/>`;

function star(cx, cy, outer, inner) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? inner : outer;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
function petals(cx, cy, dist, r) {
  return [-90, -18, 54, 126, 198].map(deg => {
    const a = (deg * Math.PI) / 180;
    return `<circle class="body" cx="${(cx + dist * Math.cos(a)).toFixed(1)}" cy="${(cy + dist * Math.sin(a)).toFixed(1)}" r="${r}"/>`;
  }).join('');
}

// Short spokes with round tips around a body (virus).
function spikes(cx, cy, r1, r2) {
  return Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4 + 0.2;
    const x1 = (cx + r1 * Math.cos(a)).toFixed(1), y1 = (cy + r1 * Math.sin(a)).toFixed(1);
    const x2 = (cx + r2 * Math.cos(a)).toFixed(1), y2 = (cy + r2 * Math.sin(a)).toFixed(1);
    return `<path class="line" d="M${x1} ${y1} L${x2} ${y2}"/><circle class="body" cx="${x2}" cy="${y2}" r="2.6"/>`;
  }).join('');
}

const ART = {
  // ---- microbes ----------------------------------------------------------
  bacterium: `<path class="line" d="M39 25 q3 -7 6 -1 t3 -4"/>
   <rect class="body" x="5" y="14" width="34" height="22" rx="11"/>
   <path class="shade" d="M5 25 h34 a11 11 0 0 1 -11 11 h-12 a11 11 0 0 1 -11 -11z"/>
   <rect class="rim" x="5" y="14" width="34" height="22" rx="11"/>
   <path class="hi" d="M12 19 q4 -3 9 -3"/>
   ${EYES(18, 27, 24)}${BLUSH(13, 32, 29)}${SMILE(19, 29)}`,
  cyano: `<rect class="body" x="4" y="14" width="40" height="22" rx="11"/>
   <path class="shade" d="M4 25 h40 a11 11 0 0 1 -11 11 h-18 a11 11 0 0 1 -11 -11z"/>
   <path class="dline" d="M15 15 v20 M33 15 v20"/>
   <circle class="chl" cx="9" cy="22" r="2"/><circle class="chl" cx="39" cy="29" r="2"/><circle class="chl" cx="24" cy="18" r="1.8"/>
   <path class="hi" d="M8 19 q3 -3 6 -3"/>
   ${EYES(20, 28, 25)}${SMILE(21, 30)}`,
  yeast: `<circle class="body" cx="36" cy="35" r="8"/>
   <ellipse class="body" cx="22" cy="25" rx="16" ry="18"/>
   <path class="shade" d="M7 28 C9 41 35 42 37 28 C33 36 11 36 7 28Z"/>
   <circle class="nuc" cx="27" cy="14" r="4.5"/><circle class="nuc2" cx="28" cy="13" r="1.5"/>
   <path class="hi" d="M10 19 q3 -7 9 -8"/>
   ${EYES(17, 26, 25)}${BLUSH(12, 31, 31)}${SMILE(17, 30)}`,
  hypha: `<path class="sline" d="M5 41 C12 34 9 22 19 24 C28 26 26 36 34 30"/>
   <path class="sline" style="stroke-width:5" d="M14 30 C10 26 12 20 8 17"/>
   <path class="dline" style="stroke-width:7" d="M9 38 l0 0 M18 27 l1 3 M24 34 l3 -2"/>
   <circle class="body" cx="36" cy="21" r="10"/>
   <path class="shade" d="M27 24 C29 33 43 33 46 22 C44 28 32 30 27 24Z"/>
   <path class="hi" d="M29 15 q3 -5 8 -5"/>
   ${EYES(32.5, 39.5, 20, 3)}${SMILE(33, 25, 5)}`,
  protist: `<path class="line" d="M15 25 q-8 1 -9 -6 t3 -9"/>
   <ellipse class="body" cx="29" cy="27" rx="16" ry="14"/>
   <path class="shade" d="M13 29 C17 42 41 42 45 29 C40 37 18 37 13 29Z"/>
   <circle class="nuc" cx="36" cy="19" r="4.6"/><circle class="nuc2" cx="37" cy="18" r="1.5"/>
   <circle class="chl" cx="19" cy="31" r="2.2"/><circle class="chl" cx="25" cy="38" r="2"/><circle class="chl" cx="40" cy="35" r="2"/>
   <path class="hi" d="M17 21 q3 -5 8 -6"/>
   ${EYES(24, 32, 27, 3.2)}${SMILE(25, 32)}`,
  // The pond eukaryote and the amoeba share one body.
  pond: `<path class="body" d="M9 27 C5 14 19 6 30 9 C43 12 45 26 39 34 C33 43 17 43 12 36 C9 33 9 30 9 27Z"/>
   <path class="shade" d="M10 30 C14 38 30 40 40 30 C38 38 30 43 20 42 C13 41 9 35 10 30Z"/>
   <circle class="nuc" cx="31" cy="17" r="5.5"/><circle class="nuc2" cx="32" cy="16" r="1.8"/>
   <path class="hi" d="M11 19 q3 -6 9 -7"/>
   ${EYES(18, 27, 27)}${BLUSH(13, 32, 32)}${SMILE(19, 32)}`,
  // ---- fungi / plants ----------------------------------------------------
  mushroom: `<path class="line" d="M6 43 q6 -4 12 0 t12 0 t12 0"/>
   <rect class="body" x="17" y="26" width="14" height="15" rx="5"/>
   <path class="body" d="M5 27 C5 12 15 5 24 5 C33 5 43 12 43 27Z"/>
   <path class="shade" d="M5 27 h38 c0 4 -7 6 -19 6 s-19 -2 -19 -6z"/>
   <circle class="spot" cx="15" cy="16" r="3.2"/><circle class="spot" cx="28" cy="12" r="2.6"/><circle class="spot" cx="35" cy="20" r="2.2"/>
   <path class="hi" d="M11 19 q3 -7 9 -8"/>
   ${EYES(21, 27, 35)}${SMILE(21, 38)}`,
  sprout: `<path class="body" d="M23 20 C9 22 4 9 7 3 C19 3 26 10 23 20Z"/>
   <path class="body" d="M25 20 C39 22 44 9 41 3 C29 3 22 10 25 20Z"/>
   <path class="vein" d="M22 17 C17 14 13 10 10 6"/><path class="vein" d="M26 17 C31 14 35 10 38 6"/>
   <circle class="body" cx="24" cy="31" r="13"/>
   <path class="shade" d="M11 31 a13 13 0 0 0 26 0 a13 13 0 0 1 -26 0z"/>
   <path class="hi" d="M15 26 q3 -6 9 -6"/>
   ${EYES(19, 29, 31)}${BLUSH(14, 34, 36)}${SMILE(21, 35)}`,
  spirogyra: `<rect class="body" x="2" y="15" width="15" height="22" rx="6"/>
   <rect class="body" x="16.5" y="15" width="15" height="22" rx="6"/>
   <rect class="body" x="31" y="15" width="15" height="22" rx="6"/>
   <path class="vein" style="stroke-width:2.4;opacity:.4" d="M4 34 C11 14 17 38 24 20 C29 10 38 36 45 18"/>
   <path class="dline" d="M16.5 17 v18 M31 17 v18"/>
   <path class="hi" d="M6 20 q3 -3 7 -3"/>
   ${EYES(20.5, 28, 25, 3)}${SMILE(21.5, 30, 5)}`,
  moss: `<path class="line" style="stroke-width:2" d="M13 22 v-11 M24 19 v-14 M36 22 v-10"/>
   <ellipse class="body" cx="13" cy="9" rx="3" ry="4"/><ellipse class="body" cx="24" cy="4.5" rx="3" ry="4"/><ellipse class="body" cx="36" cy="10" rx="3" ry="4"/>
   <path class="body" d="M2 43 C2 27 13 22 24 22 C35 22 46 27 46 43Z"/>
   <path class="shade" d="M2 43 C4 36 13 34 24 34 C35 34 44 36 46 43Z"/>
   <circle class="spot" cx="8" cy="34" r="2"/><circle class="spot" cx="40" cy="33" r="2.2"/><circle class="spot" cx="30" cy="27" r="1.8"/>
   <path class="hi" d="M9 30 q4 -5 10 -5"/>
   ${EYES(18, 30, 32)}${BLUSH(13, 35, 37)}${SMILE(21, 36)}`,
  fern: `<ellipse class="body" cx="10" cy="17" rx="5" ry="13" transform="rotate(-36 10 17)"/>
   <ellipse class="body" cx="24" cy="12" rx="5" ry="12"/>
   <ellipse class="body" cx="38" cy="17" rx="5" ry="13" transform="rotate(36 38 17)"/>
   <path class="vein" d="M24 2 v20 M9 9 l4 12 M39 9 l-4 12"/>
   <path class="dline" d="M20 8 l4 3 l4 -3 M20 15 l4 3 l4 -3"/>
   <circle class="body" cx="24" cy="34" r="12"/>
   <path class="shade" d="M12 34 a12 12 0 0 0 24 0 a12 12 0 0 1 -24 0z"/>
   <path class="hi" d="M16 29 q3 -5 8 -5"/>
   ${EYES(19.5, 28.5, 34)}${SMILE(21, 38)}`,
  pine: `<rect class="trunk" x="21" y="42" width="6" height="6" rx="1.5"/>
   <path class="body" d="M24 21 L46 43 H2Z"/>
   <path class="body" d="M24 11 L42 31 H6Z"/>
   <path class="body" d="M24 1 L37 19 H11Z"/>
   <path class="dline" d="M6 31 H42 M2 43 H46 M11 19 H37"/>
   <circle class="spot" cx="10" cy="40" r="1.6"/><circle class="spot" cx="38" cy="40" r="1.6"/>
   ${EYES(19, 29, 35)}${SMILE(21, 39)}`,
  flower: `${petals(24, 24, 13, 8)}
   <circle class="ctr" cx="24" cy="24" r="11"/>
   <path class="hi" d="M17 20 q3 -4 7 -4"/>
   ${EYES(20, 28, 23, 3)}${BLUSH(16, 32, 28)}${SMILE(21, 27, 6)}`,
  critter: `<ellipse class="body" cx="14" cy="12" rx="5" ry="9" transform="rotate(-14 14 12)"/>
   <ellipse class="body" cx="34" cy="12" rx="5" ry="9" transform="rotate(14 34 12)"/>
   <ellipse class="ear" cx="14" cy="13" rx="2.4" ry="5.5" transform="rotate(-14 14 13)"/>
   <ellipse class="ear" cx="34" cy="13" rx="2.4" ry="5.5" transform="rotate(14 34 13)"/>
   <ellipse class="body" cx="24" cy="30" rx="15" ry="13"/>
   <path class="shade" d="M9 31 a15 13 0 0 0 30 0 a15 13 0 0 1 -30 0z"/>
   <ellipse class="body" cx="16" cy="43" rx="5" ry="3"/><ellipse class="body" cx="32" cy="43" rx="5" ry="3"/>
   <path class="hi" d="M14 24 q3 -6 10 -6"/>
   ${EYES(18.5, 29.5, 28)}<ellipse class="nose" cx="24" cy="32.5" rx="2" ry="1.5"/>${BLUSH(13, 35, 33)}${SMILE(21, 34.5)}`,
  // ---- more microbes (L10) -----------------------------------------------
  archaeon: `<path class="line" style="stroke-width:2.2" d="M15 9 q-3 -3 0 -6 M24 8 q-3 -3 0 -6 M33 9 q-3 -3 0 -6"/>
   <circle class="body" cx="24" cy="28" r="17"/>
   <path class="shade" d="M7 30 a17 17 0 0 0 34 0 C36 40 12 40 7 30Z"/>
   <circle class="rim" cx="24" cy="28" r="17"/>
   <circle class="spot" cx="12" cy="22" r="1.8"/><circle class="spot" cx="37" cy="21" r="1.8"/><circle class="spot" cx="34" cy="38" r="1.6"/>
   <path class="hi" d="M14 20 q4 -7 11 -7"/>
   ${EYES(18.5, 29.5, 28)}${BLUSH(13, 35, 33)}${SMILE(21, 33)}`,
  virus: `${spikes(24, 25, 14, 20)}
   <circle class="body" cx="24" cy="25" r="14"/>
   <path class="shade" d="M10 27 a14 14 0 0 0 28 0 C33 36 15 36 10 27Z"/>
   <path class="dline" d="M13 18 l7 -3 l7 3 M18 36 l6 -3 l6 3"/>
   <path class="hi" d="M14 20 q3 -6 9 -6"/>
   ${EYES(19, 29, 25, 3)}${SMILE(21, 30, 6)}`,
  // ---- simple animals (L06) ---------------------------------------------
  sponge: `<ellipse class="body" cx="6" cy="36" rx="4.5" ry="6.5"/><ellipse class="body" cx="43" cy="33" rx="4" ry="6"/>
   <path class="body" d="M8 44 C4 32 8 19 14 13 H34 C40 19 44 32 40 44Z"/>
   <path class="shade" d="M8 44 C11 38 37 38 40 44Z"/>
   <ellipse class="nuc" cx="24" cy="13" rx="10" ry="3.8"/><ellipse class="rim" cx="24" cy="13" rx="10" ry="3.8"/>
   <circle class="spot" cx="13" cy="32" r="1.8"/><circle class="spot" cx="35" cy="27" r="1.8"/><circle class="spot" cx="33" cy="39" r="1.6"/>
   <path class="hi" d="M12 24 q1 -5 4 -7"/>
   ${EYES(19, 29, 28)}${BLUSH(15, 33, 33)}${SMILE(21, 32)}`,
  hydra: `<path class="line" style="stroke-width:3.4" d="M16 12 C11 8 8 6 5 6 M20 9 C18 5 16 3 13 2 M28 9 C30 5 32 3 35 2 M32 12 C37 8 40 6 43 6"/>
   <path class="body" d="M14 42 C14 30 16 20 18 14 H30 C32 20 34 30 34 42Z"/>
   <rect class="body" x="8" y="41" width="32" height="5.5" rx="2.7"/>
   <ellipse class="nuc" cx="24" cy="14" rx="6" ry="2.4"/>
   <path class="shade" d="M14 42 C16 38 32 38 34 42Z"/>
   <path class="hi" d="M19 22 q0 -4 2 -6"/>
   ${EYES(20.5, 27.5, 27, 3)}${SMILE(21, 33, 6)}`,
  flatworm: `<path class="body" d="M3 31 C3 17 15 13 26 17 C36 21 42 21 46 27 C42 38 29 42 16 40 C8 39 3 37 3 31Z"/>
   <path class="shade" d="M5 34 C12 44 34 44 45 29 C40 36 27 40 15 38 C10 37 6 36 5 34Z"/>
   <path class="vein" d="M14 27 C22 24 32 27 41 26 M14 33 C22 31 32 33 40 31"/>
   <path class="hi" d="M8 22 q5 -6 12 -5"/>
   ${EYES(9, 16, 25, 3.2)}${SMILE(9.5, 30, 5)}`,
  roundworm: `<path class="sline" style="stroke-width:8" d="M36 41 C14 47 4 31 12 21 C18 13 29 13 34 18"/>
   <path class="dash" style="stroke-width:8;stroke-dasharray:1 7" d="M36 41 C14 47 4 31 12 21 C18 13 29 13 34 18"/>
   <circle class="body" cx="38" cy="20" r="8.5"/>
   <path class="hi" d="M32 14 q3 -4 8 -4"/>
   ${EYES(35, 42, 19, 3)}${SMILE(36, 24, 5)}`,
  // ---- conservation flagships (L11) -------------------------------------
  hornbill: `<path class="line" style="stroke:var(--sim-warning);stroke-width:2.4" d="M18 42 v5 M27 42 v5"/>
   <path class="body" d="M4 33 C2 27 5 21 9 22Z"/>
   <ellipse class="body" cx="21" cy="31" rx="16" ry="12.5"/>
   <path class="shade" d="M5 33 C9 44 33 44 37 33 C30 39 12 39 5 33Z"/>
   <ellipse class="light" cx="20" cy="34" rx="8" ry="4.5"/>
   <circle class="body" cx="30" cy="16" r="9"/>
   <path class="beak" d="M35 13 C42 12 47 16 47 22 C43 20 39 21 35 22Z"/>
   <path class="beak" d="M31 9 C35 3 42 5 44 12 C40 9 36 9 33 12Z"/>
   <path class="hi" d="M23 12 q3 -4 7 -4"/>
   ${EYES(29, 33.5, 15, 2.4)}`,
  deer: `<path class="line" style="stroke-width:2.6" d="M16 14 C13 8 14 4 11 1 M14 9 C11 8 9 8 7 5 M32 14 C35 8 34 4 37 1 M34 9 C37 8 39 8 41 5"/>
   <ellipse class="body" cx="9" cy="20" rx="6.5" ry="3.4" transform="rotate(-26 9 20)"/><ellipse class="body" cx="39" cy="20" rx="6.5" ry="3.4" transform="rotate(26 39 20)"/>
   <ellipse class="ear" cx="9" cy="20" rx="4" ry="1.7" transform="rotate(-26 9 20)"/><ellipse class="ear" cx="39" cy="20" rx="4" ry="1.7" transform="rotate(26 39 20)"/>
   <ellipse class="body" cx="24" cy="27" rx="15" ry="16"/>
   <path class="shade" d="M9 30 a15 16 0 0 0 30 0 C33 41 15 41 9 30Z"/>
   <ellipse class="light" cx="24" cy="37" rx="8" ry="5.5"/>
   <ellipse class="nose" cx="24" cy="35" rx="2.6" ry="1.8"/>
   <path class="hi" d="M14 19 q4 -6 11 -6"/>
   ${EYES(17.5, 30.5, 26, 3.2)}${BLUSH(12, 36, 31)}`,
  lion: `<circle class="body" cx="24" cy="26" r="21"/>
   <path class="shade" d="M3 28 a21 21 0 0 0 42 0 C38 42 10 42 3 28Z"/>
   <circle class="body" cx="10" cy="9" r="5.5"/><circle class="body" cx="38" cy="9" r="5.5"/>
   <circle class="ear" cx="10" cy="9" r="2.4"/><circle class="ear" cx="38" cy="9" r="2.4"/>
   <ellipse class="light" cx="24" cy="28" rx="14" ry="13"/>
   <ellipse class="light" cx="24" cy="35" rx="7.5" ry="5.5"/>
   <path class="nose" d="M21 30.5 h6 l-3 3.5Z"/>
   <path class="hi" d="M10 16 q4 -8 12 -9"/>
   ${EYES(17.5, 30.5, 25, 3.2)}<path class="mouth" d="M24 34 v2 M20.5 37 q3.5 3 7 0"/>`,
  // ---- invertebrates / protochordate ------------------------------------
  earthworm: `<path class="sline" d="M5 36 C11 22 19 44 27 30 C32 21 36 26 38 24"/>
   <path class="dash" d="M5 36 C11 22 19 44 27 30 C32 21 36 26 38 24"/>
   <circle class="body" cx="39" cy="22" r="8.5"/>
   <path class="hi" d="M33 16 q3 -4 7 -4"/>
   ${EYES(36, 43, 21, 3)}${SMILE(37, 26, 5)}`,
  beetle: `<path class="line" style="stroke-width:2.2" d="M10 20 l-7 -5 M9 29 h-7 M10 37 l-7 6 M38 20 l7 -5 M39 29 h7 M38 37 l7 6"/>
   <path class="line" style="stroke-width:1.8" d="M20 6 l-4 -4 M28 6 l4 -4"/>
   <ellipse class="body" cx="24" cy="29" rx="15" ry="16"/>
   <path class="shade" d="M9 31 a15 16 0 0 0 30 0 a15 16 0 0 1 -30 0z"/>
   <path class="dline" d="M24 15 v30"/>
   <circle class="spot" cx="16" cy="33" r="2"/><circle class="spot" cx="32" cy="35" r="2"/>
   <circle class="body" cx="24" cy="12" r="8"/>
   <path class="hi" d="M19 8 q3 -3 6 -3"/>
   ${EYES(20.5, 27.5, 12, 3)}${SMILE(21, 16, 6)}`,
  snail: `<path class="body" d="M3 43 C3 35 8 31 14 31 H41 C45 31 46 36 43 40 C41 43 38 43 36 43Z"/>
   <path class="line" style="stroke-width:2.4" d="M7 32 l-3 -9 M15 32 l1 -9"/>
   <circle class="eye" cx="4" cy="22" r="2.8"/><circle class="eye" cx="16" cy="22" r="2.8"/>
   <circle class="spark" cx="4.8" cy="21" r="0.9"/><circle class="spark" cx="16.8" cy="21" r="0.9"/>
   <circle class="body" cx="30" cy="21" r="14"/>
   <circle class="shade" cx="30" cy="21" r="14"/>
   <path class="dash2" d="M30 21 m0 0 a3 3 0 1 1 3 3 a6.5 6.5 0 1 1 -6.5 -6.5 a10 10 0 1 1 10 10"/>
   <path class="hi" d="M21 14 q4 -6 11 -5"/>
   ${SMILE(6, 38, 5)}<ellipse class="blush" cx="12" cy="39" rx="2.4" ry="1.6"/>`,
  octopus: `<path class="sline" style="stroke-width:5" d="M11 30 C4 36 8 42 3 45 M18 33 C15 41 20 44 14 47 M30 33 C33 41 28 44 34 47 M37 30 C44 36 40 42 45 45"/>
   <ellipse class="body" cx="24" cy="21" rx="16" ry="17"/>
   <path class="shade" d="M8 23 C10 38 38 38 40 23 C36 32 12 32 8 23Z"/>
   <circle class="spot" cx="14" cy="11" r="2"/><circle class="spot" cx="33" cy="9" r="1.6"/>
   <path class="hi" d="M12 15 q4 -8 12 -8"/>
   ${EYES(18, 30, 22)}${BLUSH(13, 35, 27)}${SMILE(21, 27)}`,
  starfish: `<polygon class="body" stroke-linejoin="round" style="stroke:var(--t);stroke-width:5" points="${star(24, 26, 19, 9.5)}"/>
   <polygon class="shade" stroke-linejoin="round" style="stroke:none" points="${star(24, 30, 15, 6)}"/>
   <circle class="spot" cx="24" cy="9" r="1.6"/><circle class="spot" cx="8" cy="20" r="1.6"/><circle class="spot" cx="40" cy="20" r="1.6"/><circle class="spot" cx="14" cy="38" r="1.6"/><circle class="spot" cx="34" cy="38" r="1.6"/>
   ${EYES(20, 28, 25, 3)}${SMILE(21, 30, 6)}`,
  amphioxus: `<path class="body" d="M2 27 C8 11 32 8 46 25 C34 40 10 41 2 27Z"/>
   <path class="shade" d="M4 30 C12 42 36 40 46 26 C34 36 12 36 4 30Z"/>
   <path class="vein" style="stroke-width:3;opacity:.4" d="M8 26 C18 19 32 19 43 25"/>
   <path class="dline" d="M18 17 l4 8 l-3 8 M26 16 l4 8 l-3 9 M34 19 l3 6 l-2 6"/>
   <path class="hi" d="M9 20 q6 -6 14 -6"/>
   ${EYES(11, 18, 24, 3)}${SMILE(11.5, 29, 5)}`,
  // ---- vertebrates -------------------------------------------------------
  carp: `<path class="body" d="M35 24 L47 13 L47 35Z"/>
   <path class="body" d="M14 14 C18 5 27 6 31 14Z"/>
   <ellipse class="body" cx="21" cy="25" rx="17" ry="12.5"/>
   <path class="shade" d="M5 27 C9 38 33 38 38 27 C31 33 12 33 5 27Z"/>
   <path class="dline" d="M13 17 q-3 8 0 16 M26 19 q4 4 0 9 M32 21 q3 3 0 6"/>
   <path class="hi" d="M10 18 q4 -4 10 -4"/>
   ${EYES(11, 19, 22, 3)}${SMILE(8, 28, 5)}`,
  frog: `<ellipse class="body" cx="9" cy="39" rx="7" ry="4.5"/><ellipse class="body" cx="39" cy="39" rx="7" ry="4.5"/>
   <ellipse class="body" cx="24" cy="30" rx="18" ry="13"/>
   <ellipse class="light" cx="24" cy="37" rx="10" ry="5"/>
   <circle class="body" cx="14" cy="16" r="8"/><circle class="body" cx="34" cy="16" r="8"/>
   <path class="hi" d="M9 12 q3 -4 7 -4"/>
   ${EYES(14, 34, 15, 4)}<path class="mouth" d="M12 31 q12 9 24 0"/>${BLUSH(10, 38, 33)}`,
  lizard: `<path class="sline" style="stroke-width:6" d="M30 30 C40 30 40 38 45 35 C47 34 47 32 46 31"/>
   <path class="sline" style="stroke-width:4" d="M16 33 l-4 9 M27 35 l4 8 M17 26 l-5 -6 M28 26 l5 -6"/>
   <ellipse class="body" cx="24" cy="29" rx="16" ry="9.5"/>
   <path class="shade" d="M8 31 C12 40 36 40 40 31 C34 36 14 36 8 31Z"/>
   <path class="dline" d="M18 22 l3 4 M25 21 l3 4 M32 23 l3 4"/>
   <circle class="body" cx="11" cy="20" r="9"/>
   <path class="hi" d="M6 15 q3 -4 7 -4"/>
   ${EYES(8, 14.5, 19, 3)}${SMILE(8.5, 24, 5)}`,
  sparrow: `<path class="line" style="stroke:var(--sim-warning);stroke-width:2.4" d="M19 41 v6 M29 41 v6"/>
   <path class="body" d="M19 12 q5 -10 10 0Z"/>
   <ellipse class="body" cx="6" cy="31" rx="5" ry="9" transform="rotate(14 6 31)"/><ellipse class="body" cx="42" cy="31" rx="5" ry="9" transform="rotate(-14 42 31)"/>
   <circle class="body" cx="24" cy="27" r="16"/>
   <path class="shade" d="M8 29 a16 16 0 0 0 32 0 C34 38 14 38 8 29Z"/>
   <path class="beak" d="M20.5 28 L27.5 28 L24 34Z"/>
   <path class="hi" d="M13 19 q4 -6 11 -6"/>
   ${EYES(17.5, 30.5, 24, 3.4)}${BLUSH(12, 36, 30)}`,
  ostrich: `<path class="line" style="stroke-width:3.2" d="M20 40 v7 M29 40 v7"/>
   <path class="sline" style="stroke-width:6" d="M29 27 C31 19 24 17 27 10"/>
   <ellipse class="body" cx="22" cy="32" rx="17" ry="11"/>
   <path class="shade" d="M6 34 C10 44 34 44 38 34 C32 40 12 40 6 34Z"/>
   <ellipse class="light" cx="18" cy="31" rx="9" ry="6" transform="rotate(-10 18 31)"/>
   <circle class="body" cx="26" cy="9" r="8"/>
   <path class="beak" d="M32 8 L40 10 L32 13Z"/>
   <path class="hi" d="M20 4 q3 -3 7 -2"/>
   ${EYES(23, 29.5, 8, 2.7)}`,
  tiger: `<circle class="body" cx="9" cy="12" r="6.5"/><circle class="body" cx="39" cy="12" r="6.5"/>
   <circle class="ear" cx="9" cy="12" r="3"/><circle class="ear" cx="39" cy="12" r="3"/>
   <circle class="body" cx="24" cy="27" r="19"/>
   <path class="stripe" d="M6 22 h7 M6 29 h6 M42 22 h-7 M42 29 h-6 M24 9 v7 M18 10 v5 M30 10 v5"/>
   <ellipse class="light" cx="24" cy="35" rx="9" ry="6.5"/>
   <path class="nose" d="M21 31 h6 l-3 3.5Z"/>
   <path class="hi" d="M13 19 q4 -7 11 -7"/>
   ${EYES(16.5, 31.5, 25, 3.4)}<path class="mouth" d="M24 34.5 v2 M20 37 q4 3 8 0"/>`,
  dolphin: `<path class="body" d="M39 26 C43 21 46 17 47 12 C43 15 41 17 38 21Z"/>
   <path class="body" d="M39 27 C43 32 46 36 47 41 C43 38 41 36 38 32Z"/>
   <path class="body" d="M20 17 C24 7 32 7 34 12 C30 12 27 14 26 18Z"/>
   <ellipse class="body" cx="24" cy="27" rx="18" ry="12"/>
   <ellipse class="body" cx="7" cy="32" rx="8" ry="3.4"/>
   <path class="light" d="M10 33 C16 40 32 40 40 31 C32 36 18 36 10 33Z"/>
   <path class="hi" d="M14 20 q6 -6 14 -5"/>
   ${EYES(14, 22, 25, 3)}<path class="mouth" d="M4 33 q5 3 10 0"/>${BLUSH(19, 27, 30)}`,
};

// Fall-backs so a typo in a config draws a neutral blob instead of throwing.
export const ART_KEYS = Object.keys(ART);

export function characterSvg(art, tone, size) {
  const body = ART[art] || ART.pond;
  const dim = size ? ` width="${size}" height="${size}"` : '';
  return `<svg class="ek-av" viewBox="0 0 48 48"${dim} style="--t:var(--sim-series-${tone})" aria-hidden="true">${body}</svg>`;
}

export const CHARACTER_CSS = `
.ek-av { display:block; width:30px; height:30px; flex:none; overflow:visible; }
.ek-av .body { fill:var(--t); }
.ek-av .line { fill:none; stroke:var(--t); stroke-width:2.6; stroke-linecap:round; }
.ek-av .sline { fill:none; stroke:var(--t); stroke-width:9; stroke-linecap:round; stroke-linejoin:round; }
.ek-av .dash { fill:none; stroke:var(--sim-bg-deep); stroke-width:9; stroke-dasharray:1.4 4.6; opacity:.3; }
.ek-av .dash2 { fill:none; stroke:var(--sim-bg-deep); stroke-width:1.8; stroke-linecap:round; opacity:.4; }
.ek-av .shade { fill:var(--sim-bg-deep); opacity:.2; }
.ek-av .rim { fill:none; stroke:var(--sim-bg-deep); stroke-width:2.4; opacity:.3; }
.ek-av .dline { fill:none; stroke:var(--sim-bg-deep); stroke-width:1.6; stroke-linecap:round; opacity:.32; }
.ek-av .stripe { fill:none; stroke:var(--sim-bg-deep); stroke-width:3.2; stroke-linecap:round; opacity:.45; }
.ek-av .hi { fill:none; stroke:var(--sim-label); stroke-width:2.2; stroke-linecap:round; opacity:.55; }
.ek-av .vein { fill:none; stroke:var(--sim-bg-deep); stroke-width:1.6; stroke-linecap:round; opacity:.3; }
.ek-av .eye { fill:var(--sim-bg-deep); }
.ek-av .spark { fill:var(--sim-label); }
.ek-av .mouth { fill:none; stroke:var(--sim-bg-deep); stroke-width:1.8; stroke-linecap:round; }
.ek-av .blush { fill:var(--sim-series-6); opacity:.5; }
.ek-av .nuc { fill:var(--sim-bg-deep); opacity:.3; }
.ek-av .nuc2 { fill:var(--sim-label); opacity:.6; }
.ek-av .spot { fill:var(--sim-label); opacity:.65; }
.ek-av .ear { fill:var(--sim-bg-deep); opacity:.25; }
.ek-av .nose { fill:var(--sim-bg-deep); }
.ek-av .light { fill:var(--sim-label); opacity:.28; }
.ek-av .chl { fill:var(--sim-chloro); }
.ek-av .ctr { fill:var(--sim-series-2); }
.ek-av .beak { fill:var(--sim-warning); }
.ek-av .trunk { fill:var(--sim-waste); }
`;
