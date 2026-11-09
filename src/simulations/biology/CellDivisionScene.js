import { CanvasSimulation } from '../base/CanvasSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * CellDivisionScene - a guided, two-path visualiser for mitosis and meiosis.
 *
 * The drawing is intentionally a model rather than a literal microscope image:
 * the coloured homologues make chromosome movement and genetic mixing visible
 * to a Class 9 learner while the spindle and chromatid geometry retain the
 * important biological landmarks.
 */

const COLORS = {
  bg: '#070b18',
  bgMid: '#101a35',
  cell: '#193b62',
  cellLight: '#2c6590',
  membrane: '#73c7ff',
  membraneSoft: 'rgba(115, 199, 255, 0.18)',
  nucleus: '#6d5ce7',
  nucleusLight: '#a79cff',
  spindle: '#7dd3fc',
  spindleSoft: 'rgba(125, 211, 252, 0.22)',
  pole: '#f8fafc',
  text: '#f8fafc',
  muted: '#a7b4ca',
  faint: '#5f7191',
  crossover: '#fde68a',
  success: '#6ee7b7',
  mitosis: '#60a5fa',
  meiosis: '#f472b6',
};

const HOMOLOGUE_PAIRS = [
  { maternal: '#fb7185', paternal: '#fda4af', recombinant: '#fbbf24' },
  { maternal: '#38bdf8', paternal: '#7dd3fc', recombinant: '#c084fc' },
  { maternal: '#a78bfa', paternal: '#c4b5fd', recombinant: '#34d399' },
  { maternal: '#f59e0b', paternal: '#fcd34d', recombinant: '#60a5fa' },
];

const MITOSIS_STAGES = [
  {
    label: 'Interphase',
    short: 'Prepare',
    title: 'DNA is copied',
    text: 'The cell grows and copies each chromosome. The DNA is still loose chromatin inside the nucleus.',
  },
  {
    label: 'Prophase',
    short: 'Pack',
    title: 'Chromosomes condense',
    text: 'Copied sister chromatids coil into visible X-shaped chromosomes. A spindle begins to form.',
  },
  {
    label: 'Metaphase',
    short: 'Line up',
    title: 'Chromosomes meet at the equator',
    text: 'Spindle fibres attach at each centromere and line every chromosome up in the middle.',
  },
  {
    label: 'Anaphase',
    short: 'Pull apart',
    title: 'Sister chromatids separate',
    text: 'The two identical chromatids of every chromosome are pulled to opposite poles.',
  },
  {
    label: 'Telophase + cytokinesis',
    short: 'Split',
    title: 'Two identical cells form',
    text: 'New nuclei form and the cell pinches in two. Each daughter keeps the full diploid chromosome set.',
  },
];

const MEIOSIS_STAGES = [
  {
    label: 'Interphase',
    short: 'Prepare',
    title: 'DNA is copied once',
    text: 'The cell copies its chromosomes before meiosis begins. There is no second copying between the two divisions.',
  },
  {
    label: 'Prophase I',
    short: 'Pair + mix',
    title: 'Homologues pair and cross over',
    text: 'Maternal and paternal homologues pair as tetrads. Small DNA segments can exchange at chiasmata.',
  },
  {
    label: 'Metaphase I',
    short: 'Pair line up',
    title: 'Pairs line up at the equator',
    text: 'Each homologous pair lines up together. Their orientation is random, adding another source of variation.',
  },
  {
    label: 'Anaphase I',
    short: 'Separate pairs',
    title: 'Homologous chromosomes separate',
    text: 'One homologue moves to each pole. Sister chromatids remain attached at their centromeres.',
  },
  {
    label: 'Telophase I',
    short: 'Two cells',
    title: 'Two haploid cells appear',
    text: 'The chromosome number has been reduced by half. Each chromosome is still duplicated.',
  },
  {
    label: 'Metaphase II',
    short: 'Line up again',
    title: 'Both cells divide again',
    text: 'The two cells form new spindles. This time, chromosomes line up singly.',
  },
  {
    label: 'Anaphase II',
    short: 'Split sisters',
    title: 'Sister chromatids separate',
    text: 'The second division is like mitosis: sister chromatids move to opposite poles.',
  },
  {
    label: 'Telophase II',
    short: 'Make gametes',
    title: 'Four unique haploid cells form',
    text: 'Four cells result, each with one chromosome from every pair and a unique combination of genes.',
  },
];

const GLOSSARY = [
  { term: 'Chromatin', desc: 'The loose, uncoiled form of DNA present in the nucleus.\nIt condenses into distinct chromosomes before division.' },
  { term: 'Homologous chromosomes', desc: 'A matching pair: one chromosome came from each parent.\nThey carry the same genes, but may carry different versions.' },
  { term: 'Sister chromatids', desc: 'Two identical copies of one chromosome,\nheld together at a centromere after DNA is copied.' },
  { term: 'Centromere', desc: 'The pinched region joining sister chromatids.\nSpindle fibres attach here during division.' },
  { term: 'Centrosome', desc: 'An organelle that organizes spindle fibres.\nThey migrate to opposite poles of the cell during division.' },
  { term: 'Spindle fibres', desc: 'Protein fibres that reach from opposite poles\nand move chromosomes to their correct destinations.' },
  { term: 'Metaphase plate', desc: 'The invisible central plane (equator) of the cell\nwhere chromosomes align before being pulled apart.' },
  { term: 'Crossing over', desc: 'An exchange of DNA between homologues in Prophase I.\nIt creates new gene combinations.' },
  { term: 'Chiasmata', desc: 'The physical contact points where homologous chromosomes\ntangle and exchange genetic material during crossing over.' },
  { term: 'Diploid / haploid', desc: 'Diploid cells have two chromosome sets.\nHaploid cells have one set, ready to form gametes.' },
  { term: 'Gamete', desc: 'A reproductive cell (like sperm or egg).\nThey are haploid, meaning they carry only one set of chromosomes.' },
  { term: 'Cytokinesis', desc: 'The physical division of the cytoplasm\nthat completes the formation of daughter cells.' },
];

export class CellDivisionScene extends CanvasSimulation {
  static WIDTH = 800;
  static HEIGHT = 500;
  static ARIA_LABEL =
    'Mitosis and meiosis visualiser. Choose a pathway to see chromosomes condense, '
    + 'attach to spindle fibres, separate, and form daughter cells.';

  static CONTROLS = [
    { type: 'button', id: 'mitosis', label: 'Mitosis', activeBg: '#60a5fa', inactiveBg: 'rgba(255,255,255,0.06)' },
    { type: 'button', id: 'meiosis', label: 'Meiosis', activeBg: '#f472b6', inactiveBg: 'rgba(255,255,255,0.06)' },
    { type: 'button', id: 'play', icon: 'play-pause' },
    { type: 'button', id: 'replay', label: 'Replay' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;
    this.mode = 'mitosis';
    this.stageIndex = 0;
    this.stageTime = 0;
    this.totalTime = 0;
    this.stageDuration = 4.5;
    this.isPlaying = true;
    this._live = null;
    this._announcedStage = -1;
    this._specks = Array.from({ length: 34 }, (_, i) => ({
      x: (i * 137 + 31) % 800,
      y: 56 + ((i * 71 + 19) % 330),
      r: 0.5 + (i % 3) * 0.35,
      a: 0.15 + (i % 4) * 0.05,
    }));
  }

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    this._live = document.createElement('div');
    this._live.setAttribute('aria-live', 'polite');
    this._live.setAttribute('aria-atomic', 'true');
    this._live.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
    this.container.appendChild(this._live);
    this._drawInitialFrame(this._ctx);
  }

  onControlChange(id) {
    if (id === 'mitosis' || id === 'meiosis') {
      this._setMode(id);
    } else if (id === 'play') {
      this.isPlaying = !this.isPlaying;
      this._announce(this.isPlaying ? 'Animation playing.' : 'Animation paused.');
    } else if (id === 'replay') {
      this._reset(true);
    }
  }

  destroy() {
    this._live?.remove();
    this._live = null;
    super.destroy();
  }

  _setMode(mode) {
    this.mode = mode;
    this._reset(false);
    this._announce(`${mode === 'mitosis' ? 'Mitosis' : 'Meiosis'} selected. ${this._stages()[0].title}.`);
  }

  _reset(announce = true) {
    this.stageIndex = 0;
    this.stageTime = 0;
    this.totalTime = 0;
    this.isPlaying = true;
    this._announcedStage = -1;
    if (announce) this._announce(`${this.mode === 'mitosis' ? 'Mitosis' : 'Meiosis'} replayed.`);
    if (this._ctx) this._drawInitialFrame(this._ctx);
  }

  _stages() {
    return this.mode === 'mitosis' ? MITOSIS_STAGES : MEIOSIS_STAGES;
  }

  _tick(ctx, dt) {
    if (this.isPlaying) {
      this.totalTime += dt;
      this.stageTime += dt;
      if (this.stageTime >= this.stageDuration && this.stageIndex < this._stages().length - 1) {
        this.stageIndex += 1;
        this.stageTime = 0;
      }
    }
    this._announceStageIfNeeded();
    this._drawScene(ctx);
  }

  _drawInitialFrame(ctx) {
    this._drawScene(ctx);
  }

  _announceStageIfNeeded() {
    if (!this._live || this._announcedStage === this.stageIndex) return;
    this._announcedStage = this.stageIndex;
    const stage = this._stages()[this.stageIndex];
    this._announce(`${this.mode === 'mitosis' ? 'Mitosis' : 'Meiosis'}: ${stage.label}. ${stage.title}.`);
  }

  _announce(message) {
    if (this._live) this._live.textContent = message;
  }

  _drawScene(ctx) {
    const W = CellDivisionScene.WIDTH;
    const H = CellDivisionScene.HEIGHT;
    const stage = this._stages()[this.stageIndex];
    const progress = Math.min(1, this.stageTime / this.stageDuration);
    const eased = this._ease(progress);

    const bg = ctx.createRadialGradient(W / 2, 215, 20, W / 2, 215, 560);
    bg.addColorStop(0, COLORS.bgMid);
    bg.addColorStop(1, COLORS.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    this._drawSpecks(ctx);
    this._drawHeader(ctx, stage);

    if (this.mode === 'mitosis') this._drawMitosis(ctx, eased);
    else this._drawMeiosis(ctx, eased);

    this._drawStageCard(ctx, stage, progress);
    this._drawTimeline(ctx);
    this._drawGlossary(ctx);
  }

  _drawSpecks(ctx) {
    ctx.save();
    for (const speck of this._specks) {
      ctx.globalAlpha = speck.a + Math.sin(this.totalTime * 0.7 + speck.x) * 0.035;
      ctx.fillStyle = '#b6d7ff';
      ctx.beginPath();
      ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawHeader(ctx, stage) {
    const accent = this.mode === 'mitosis' ? COLORS.mitosis : COLORS.meiosis;
    SimDraw.drawPanel(ctx, 16, 12, 768, 38, {
      bg: 'rgba(9, 15, 34, 0.88)',
      stroke: 'rgba(148, 163, 184, 0.18)',
      lineWidth: 1,
      radius: 12,
    });
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 17px Inter, system-ui';
    ctx.fillText('Cell Division Lab', 31, 31);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 11px Inter, system-ui';
    ctx.fillText('Follow the chromosomes', 195, 31);
    ctx.fillStyle = accent;
    ctx.font = '800 11px Inter, system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(this.mode === 'mitosis' ? 'MITOSIS' : 'MEIOSIS', 757, 26);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 10px Inter, system-ui';
    ctx.fillText(stage.label, 757, 39);
    ctx.restore();
  }

  _drawStageCard(ctx, stage, progress) {
    const accent = this.mode === 'mitosis' ? COLORS.mitosis : COLORS.meiosis;
    SimDraw.drawPanel(ctx, 26, 66, 264, 73, {
      bg: 'rgba(11, 22, 44, 0.84)',
      stroke: `${accent}66`,
      lineWidth: 1,
      radius: 12,
    });
    ctx.save();
    ctx.fillStyle = accent;
    ctx.font = '800 11px Inter, system-ui';
    ctx.fillText(`STEP ${this.stageIndex + 1} / ${this._stages().length}`, 42, 87);
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 14px Inter, system-ui';
    ctx.fillText(stage.title, 42, 107);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 10.5px Inter, system-ui';
    this._drawWrappedText(ctx, stage.text, 42, 119, 230, 11, 2);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.roundRect(42, 133, 230, 3, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = accent;
    ctx.roundRect(42, 133, 230 * progress, 3, 2);
    ctx.fill();
    ctx.restore();
  }

  _drawMitosis(ctx, p) {
    const i = this.stageIndex;
    if (i < 4) {
      this._drawLargeCell(ctx, 405, 228, 220, 137, i, p, false);
      if (i === 0) this._drawChromatinCloud(ctx, 405, 228, 73, 0.95);
      if (i === 1) this._drawMitosisProphase(ctx, 405, 228, p);
      if (i === 2) this._drawMitosisMetaphase(ctx, 405, 228, p);
      if (i === 3) this._drawMitosisAnaphase(ctx, 405, 228, p);
    } else {
      this._drawMitosisSplit(ctx, p);
      this._drawComparisonPanel(ctx, [
        ['1', 'division'],
        ['2', 'identical cells'],
        ['growth + repair', 'purpose'],
      ], COLORS.mitosis);
      this._drawModeBadge(ctx, '2 identical diploid daughter cells', COLORS.mitosis);
    }
  }

  _drawMeiosis(ctx, p) {
    const i = this.stageIndex;
    if (i < 4) {
      this._drawLargeCell(ctx, 405, 228, 220, 137, i, p, true);
      if (i === 0) this._drawChromatinCloud(ctx, 405, 228, 73, 0.95);
      if (i === 1) this._drawMeiosisProphaseI(ctx, 405, 228, p);
      if (i === 2) this._drawMeiosisMetaphaseI(ctx, 405, 228, p);
      if (i === 3) this._drawMeiosisAnaphaseI(ctx, 405, 228, p);
    } else if (i === 4) {
      this._drawMeiosisIResult(ctx, p);
    } else if (i < 7) {
      this._drawMeiosisSecondDivision(ctx, p);
    } else {
      this._drawMeiosisFinal(ctx, p);
      this._drawComparisonPanel(ctx, [
        ['2', 'divisions'],
        ['4', 'unique cells'],
        ['gametes + variation', 'purpose'],
      ], COLORS.meiosis);
      this._drawModeBadge(ctx, '4 unique haploid gametes', COLORS.meiosis);
    }
  }

  _drawModeBadge(ctx, text, color) {
    SimDraw.drawLabel(ctx, text, 405, 376, { bg: `${color}33`, color, offsetY: 0 });
  }

  _drawComparisonPanel(ctx, columns, accent) {
    const x = 326;
    const y = 454;
    const width = 458;
    const height = 35;
    SimDraw.drawPanel(ctx, x, y, width, height, {
      bg: 'rgba(10, 19, 39, 0.94)',
      stroke: `${accent}66`,
      lineWidth: 1,
      radius: 8,
    });
    ctx.save();
    columns.forEach(([value, label], index) => {
      const px = x + 18 + index * 150;
      ctx.fillStyle = accent;
      ctx.font = '800 11px Inter, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(value, px, y + 15);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '500 9px Inter, system-ui';
      ctx.fillText(label, px, y + 27);
    });
    ctx.restore();
  }

  _drawLargeCell(ctx, cx, cy, rx, ry, stage, p, meiosis) {
    this._drawCell(ctx, cx, cy, rx, ry, { glow: this.totalTime, pinch: 0 });
    if (stage === 0) {
      this._drawNucleus(ctx, cx, cy, 75, 0.95);
    } else {
      this._drawSpindle(ctx, cx, cy, rx * 0.72, ry * 0.72, 0.82);
      if (stage === 1 && meiosis) {
        this._drawNucleus(ctx, cx, cy, 75, Math.max(0, 0.68 - p * 0.68));
      } else if (stage === 1) {
        this._drawNucleus(ctx, cx, cy, 75, Math.max(0, 0.48 - p * 0.48));
      }
    }
  }

  _drawMitosisProphase(ctx, cx, cy, p) {
    const positions = [
      [-70, -45], [0, -48], [70, -45], [-55, 43], [18, 47], [78, 40], [-2, 2], [47, 6],
    ];
    positions.forEach(([dx, dy], index) => {
      const pair = HOMOLOGUE_PAIRS[Math.floor(index / 2) % HOMOLOGUE_PAIRS.length];
      const color = index % 2 === 0 ? pair.maternal : pair.paternal;
      this._drawChromosome(ctx, cx + dx, cy + dy, 0.38 + p * 0.08, color, { tilt: (index % 3 - 1) * 0.13 });
    });
    this._drawCentrosomes(ctx, cx, cy, 0.8);
    SimDraw.drawLabel(ctx, 'condensing chromosomes', cx, cy - 100, { bg: '#312e81dd', color: COLORS.nucleusLight });
  }

  _drawMitosisMetaphase(ctx, cx, cy, p) {
    this._drawCentrosomes(ctx, cx, cy, 1);
    for (let index = 0; index < 8; index += 1) {
      const pair = HOMOLOGUE_PAIRS[Math.floor(index / 2) % HOMOLOGUE_PAIRS.length];
      const color = index % 2 === 0 ? pair.maternal : pair.paternal;
      const y = cy - 62 + index * 18;
      this._drawChromosome(ctx, cx + Math.sin(index) * 2, y, 0.42, color, { tilt: 0, glow: p });
    }
    SimDraw.drawLabel(ctx, 'metaphase plate', cx, cy + 108, { bg: '#0c4a6edd', color: '#bae6fd' });
  }

  _drawMitosisAnaphase(ctx, cx, cy, p) {
    this._drawCentrosomes(ctx, cx, cy, 1);
    for (let index = 0; index < 8; index += 1) {
      const pair = HOMOLOGUE_PAIRS[Math.floor(index / 2) % HOMOLOGUE_PAIRS.length];
      const color = index % 2 === 0 ? pair.maternal : pair.paternal;
      const y = cy - 62 + index * 18;
      const side = index % 2 === 0 ? -1 : 1;
      const start = cx + side * 4;
      const end = cx + side * 120;
      const x = start + (end - start) * p;
      this._drawChromatid(ctx, x, y, 0.52, color, side < 0 ? -1 : 1);
    }
    SimDraw.drawArrow(ctx, cx - 20, cy + 108, cx - 105, cy + 108, { color: COLORS.spindle, lineWidth: 1.5 });
    SimDraw.drawArrow(ctx, cx + 20, cy + 108, cx + 105, cy + 108, { color: COLORS.spindle, lineWidth: 1.5 });
    SimDraw.drawLabel(ctx, 'sister chromatids move apart', cx, cy - 103, { bg: '#164e63dd', color: '#a5f3fc' });
  }

  _drawMitosisSplit(ctx, p) {
    const separation = 120 + p * 12;
    this._drawCell(ctx, 405 - separation, 228, 133, 104, { glow: this.totalTime, pinch: 0 });
    this._drawCell(ctx, 405 + separation, 228, 133, 104, { glow: this.totalTime + 1, pinch: 0 });
    const nucleiAlpha = Math.min(1, p * 1.5);
    this._drawNucleus(ctx, 405 - separation, 228, 50, nucleiAlpha);
    this._drawNucleus(ctx, 405 + separation, 228, 50, nucleiAlpha);
    this._drawMiniChromosomeSet(ctx, 405 - separation, 228, 0.46, true, false);
    this._drawMiniChromosomeSet(ctx, 405 + separation, 228, 0.46, true, false);
    SimDraw.drawLabel(ctx, 'same diploid set', 405 - separation, 342, { bg: '#1e3a8add', color: '#bfdbfe' });
    SimDraw.drawLabel(ctx, 'same diploid set', 405 + separation, 342, { bg: '#1e3a8add', color: '#bfdbfe' });
  }

  _drawMeiosisProphaseI(ctx, cx, cy, p) {
    this._drawCentrosomes(ctx, cx, cy, 0.82);
    for (let pairIndex = 0; pairIndex < 4; pairIndex += 1) {
      const pair = HOMOLOGUE_PAIRS[pairIndex];
      const x = cx - 100 + pairIndex * 66;
      const y = cy + (pairIndex % 2 === 0 ? -31 : 34);
      this._drawChromosome(ctx, x - 9, y, 0.36, pair.maternal, { tilt: -0.08 });
      this._drawChromosome(ctx, x + 9, y, 0.36, pair.paternal, { tilt: 0.08 });
      if (p > 0.2) this._drawChiasma(ctx, x, y - 1, pair.recombinant, Math.min(1, (p - 0.2) * 2));
    }
    if (p > 0.18) {
      SimDraw.drawLabel(ctx, 'crossing over', cx, cy - 105, { bg: '#713f12dd', color: COLORS.crossover });
      this._drawCrossoverSpark(ctx, cx, cy - 76, p);
    }
  }

  _drawMeiosisMetaphaseI(ctx, cx, cy, p) {
    this._drawCentrosomes(ctx, cx, cy, 1);
    for (let pairIndex = 0; pairIndex < 4; pairIndex += 1) {
      const pair = HOMOLOGUE_PAIRS[pairIndex];
      const y = cy - 54 + pairIndex * 36;
      const offset = Math.sin(pairIndex * 4.7) * 14;
      this._drawChromosome(ctx, cx - 18 + offset * (1 - p), y, 0.4, pair.maternal, { tilt: -0.03 });
      this._drawChromosome(ctx, cx + 18 + offset * (1 - p), y, 0.4, pair.paternal, { tilt: 0.03 });
      ctx.save();
      ctx.strokeStyle = `${COLORS.crossover}66`;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - 14, y);
      ctx.lineTo(cx + 14, y);
      ctx.stroke();
      ctx.restore();
    }
    SimDraw.drawLabel(ctx, 'homologous pairs at the equator', cx, cy + 108, { bg: '#701a75dd', color: '#f5d0fe' });
  }

  _drawMeiosisAnaphaseI(ctx, cx, cy, p) {
    this._drawCentrosomes(ctx, cx, cy, 1);
    for (let pairIndex = 0; pairIndex < 4; pairIndex += 1) {
      const pair = HOMOLOGUE_PAIRS[pairIndex];
      const y = cy - 54 + pairIndex * 36;
      const x = 24 + p * 102;
      const leftColor = pairIndex % 2 === 0 ? pair.recombinant : pair.maternal;
      const rightColor = pairIndex % 2 === 0 ? pair.paternal : pair.recombinant;
      this._drawChromosome(ctx, cx - x, y, 0.4, leftColor, { tilt: -0.04 });
      this._drawChromosome(ctx, cx + x, y, 0.4, rightColor, { tilt: 0.04 });
    }
    SimDraw.drawLabel(ctx, 'homologues separate; sisters stay together', cx, cy - 106, { bg: '#4c1d95dd', color: '#ddd6fe' });
  }

  _drawMeiosisIResult(ctx, p) {
    const separation = 122 + p * 10;
    this._drawCell(ctx, 405 - separation, 228, 132, 102, { glow: this.totalTime, pinch: 0 });
    this._drawCell(ctx, 405 + separation, 228, 132, 102, { glow: this.totalTime + 1, pinch: 0 });
    this._drawSpindle(ctx, 405 - separation, 228, 78, 64, 0.45);
    this._drawSpindle(ctx, 405 + separation, 228, 78, 64, 0.45);
    this._drawMiniChromosomeSet(ctx, 405 - separation, 228, 0.42, false, true);
    this._drawMiniChromosomeSet(ctx, 405 + separation, 228, 0.42, false, true);
    SimDraw.drawLabel(ctx, 'haploid, chromosomes still duplicated', 405, 344, { bg: '#831843dd', color: '#fbcfe8' });
  }

  _drawMeiosisSecondDivision(ctx, p) {
    const outer = 118;
    const centers = [405 - outer, 405 + outer];
    centers.forEach((cx, cellIndex) => {
      this._drawCell(ctx, cx, 228, 120, 92, { glow: this.totalTime + cellIndex, pinch: 0 });
      if (this.stageIndex === 5) {
        this._drawSpindle(ctx, cx, 228, 78, 58, 0.8);
        this._drawMiniChromosomeSet(ctx, cx, 228, 0.42, false, true);
      } else {
        this._drawSpindle(ctx, cx, 228, 78, 58, 0.8);
        const amount = 35 + p * 65;
        for (let j = 0; j < 4; j += 1) {
          const pair = HOMOLOGUE_PAIRS[j];
          const y = 197 + j * 21;
          this._drawChromatid(ctx, cx - amount, y, 0.34, pair.recombinant, -1);
          this._drawChromatid(ctx, cx + amount, y, 0.34, pair.maternal, 1);
        }
      }
    });
    SimDraw.drawLabel(ctx, 'no DNA copying here', 405, 344, { bg: '#831843dd', color: '#fbcfe8' });
  }

  _drawMeiosisFinal(ctx, p) {
    const cells = [
      [285, 176], [525, 176], [285, 286], [525, 286],
    ];
    cells.forEach(([cx, cy], cellIndex) => {
      const lift = Math.min(1, p * 1.3);
      this._drawCell(ctx, cx, cy, 92 + lift * 4, 60 + lift * 3, { glow: this.totalTime + cellIndex, pinch: 0 });
      this._drawNucleus(ctx, cx, cy, 30 + lift * 3, lift);
      this._drawMiniChromosomeSet(ctx, cx, cy, 0.28, false, false, cellIndex);
    });
    SimDraw.drawLabel(ctx, '4 unique haploid cells', 405, 352, { bg: '#9d174ddd', color: '#fce7f3' });
  }

  _drawCell(ctx, cx, cy, rx, ry, { glow = 0, pinch = 0 } = {}) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    const fill = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, 6, cx, cy, rx * 1.2);
    fill.addColorStop(0, COLORS.cellLight);
    fill.addColorStop(0.5, COLORS.cell);
    fill.addColorStop(1, '#0d2344');
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = COLORS.membraneSoft;
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.strokeStyle = COLORS.membrane;
    ctx.lineWidth = 2.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.12, cy - ry * 0.2, rx * 0.72, ry * 0.55, -0.25, Math.PI * 1.05, Math.PI * 1.72);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
    if (pinch > 0) this._drawFurrow(ctx, cx, cy, rx, ry, pinch);
    ctx.restore();
    SimDraw.drawPulse(ctx, cx, cy, Math.min(rx, ry) * 0.8, COLORS.membrane, glow * 0.12);
  }

  _drawFurrow(ctx, cx, cy, rx, ry, amount) {
    ctx.save();
    ctx.strokeStyle = `${COLORS.membrane}aa`;
    ctx.lineWidth = 7 + amount * 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(3, rx * (1 - amount)), ry * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawNucleus(ctx, cx, cy, r, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    SimDraw.drawGlow(ctx, cx, cy, r, COLORS.nucleus, 0.22);
    const fill = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 3, cx, cy, r);
    fill.addColorStop(0, COLORS.nucleusLight);
    fill.addColorStop(0.5, COLORS.nucleus);
    fill.addColorStop(1, '#32258f');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.72)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.28, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.restore();
  }

  _drawChromatinCloud(ctx, cx, cy, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(224, 231, 255, 0.74)';
    ctx.lineWidth = 2.2;
    for (let strand = 0; strand < 7; strand += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 34; step += 1) {
        const angle = step * 0.58 + strand * 0.9;
        const radius = r * (0.2 + ((step * 13 + strand * 7) % 19) / 30);
        const x = cx + Math.cos(angle) * radius * 0.82;
        const y = cy + Math.sin(angle * 1.17) * radius * 0.72;
        if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    SimDraw.drawLabel(ctx, 'loose chromatin', cx, cy + r + 22, { bg: '#312e81cc', color: '#c4b5fd' });
  }

  _drawSpindle(ctx, cx, cy, width, height, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const left = cx - width;
    const right = cx + width;
    ctx.strokeStyle = COLORS.spindleSoft;
    ctx.lineWidth = 1.25;
    for (let i = 0; i < 10; i += 1) {
      const y = cy - height * 0.76 + i * height * 0.17;
      ctx.beginPath();
      ctx.moveTo(left, cy);
      ctx.quadraticCurveTo(cx, y, right, cy);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCentrosomes(ctx, cx, cy, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    [-1, 1].forEach(side => {
      const x = cx + side * 157;
      SimDraw.drawGlow(ctx, x, cy, 8, COLORS.pole, 0.22);
      ctx.fillStyle = COLORS.pole;
      ctx.beginPath();
      ctx.arc(x, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      for (let ray = 0; ray < 8; ray += 1) {
        const a = ray * Math.PI / 4 + this.totalTime * 0.1;
        ctx.strokeStyle = 'rgba(248,250,252,0.48)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 7, cy + Math.sin(a) * 7);
        ctx.lineTo(x + Math.cos(a) * 16, cy + Math.sin(a) * 16);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  _drawChromosome(ctx, cx, cy, scale, color, { tilt = 0, glow = 0 } = {}) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    if (glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 * glow;
    }
    this._drawChromatid(ctx, 0, -19 * scale, scale, color, -1, true);
    this._drawChromatid(ctx, 0, 19 * scale, scale, color, 1, true);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-1.2 * scale, -1.4 * scale, 2.1 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawChromatid(ctx, cx, cy, scale, color, direction, xShape = false) {
    const arm = 29 * scale;
    const spread = xShape ? 12 * scale : 0;
    const endX = cx + direction * spread;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(3, 10, 25, 0.72)';
    ctx.lineWidth = 10 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX - direction * arm * 0.55, cy - arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX - direction * arm * 0.55, cy + arm);
    ctx.stroke();
    const shade = ctx.createLinearGradient(cx - arm, cy - arm, cx + arm, cy + arm);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.18, color);
    shade.addColorStop(0.82, color);
    shade.addColorStop(1, '#1e293b');
    ctx.strokeStyle = shade;
    ctx.lineWidth = 7 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX - direction * arm * 0.55, cy - arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX - direction * arm * 0.55, cy + arm);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, 1.25 * scale);
    ctx.beginPath();
    ctx.moveTo(cx - 1 * scale, cy);
    ctx.lineTo(endX - direction * arm * 0.55 - 1 * scale, cy - arm + 3 * scale);
    ctx.stroke();
    ctx.restore();
  }

  _drawMiniChromosomeSet(ctx, cx, cy, scale, diploid, duplicated, variant = 0) {
    const count = 4;
    const cols = diploid ? HOMOLOGUE_PAIRS.map(pair => pair.maternal) : HOMOLOGUE_PAIRS.map((pair, i) => variant % 2 === i % 2 ? pair.recombinant : pair.paternal);
    const colsPerRow = 2;
    cols.forEach((color, index) => {
      const x = cx - 25 + (index % colsPerRow) * 50;
      const y = cy - 20 + Math.floor(index / colsPerRow) * 38;
      if (duplicated) {
        this._drawChromosome(ctx, x, y, scale, color, { tilt: index % 2 ? 0.07 : -0.07 });
      } else if (diploid) {
        // A diploid daughter receives both homologues of every pair.
        this._drawChromatid(ctx, x - 4, y, scale * 1.15, color, -1, false);
        this._drawChromatid(ctx, x + 4, y, scale * 1.15, HOMOLOGUE_PAIRS[index].paternal, 1, false);
      } else {
        this._drawChromatid(ctx, x, y, scale * 1.15, color, index % 2 ? 1 : -1, false);
      }
    });
    if (diploid) {
      ctx.save();
      ctx.fillStyle = 'rgba(248,250,252,0.7)';
      ctx.font = '600 8px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('2n', cx, cy + 48);
      ctx.restore();
    }
  }

  _drawChiasma(ctx, cx, cy, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  _drawCrossoverSpark(ctx, cx, cy, progress) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, progress * 1.4);
    ctx.strokeStyle = COLORS.crossover;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const angle = i * Math.PI / 3 + this.totalTime;
      const inner = 3 + (this.totalTime * 8) % 5;
      const outer = inner + 7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTimeline(ctx) {
    const stages = this._stages();
    const accent = this.mode === 'mitosis' ? COLORS.mitosis : COLORS.meiosis;
    const x = 345;
    const y = 412;
    const width = 420;
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    stages.forEach((stage, index) => {
      const px = x + (stages.length === 1 ? 0 : index * width / (stages.length - 1));
      const active = index <= this.stageIndex;
      ctx.beginPath();
      ctx.arc(px, y, active ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = active ? accent : '#243653';
      ctx.fill();
      ctx.strokeStyle = active ? '#e0f2fe' : '#6680a4';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = active ? COLORS.text : COLORS.faint;
      ctx.font = `${index === this.stageIndex ? '700' : '500'} 9px Inter, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(stage.short, px, y + 19);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 10px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(this.isPlaying ? 'Playing' : 'Paused', 345, 445);
    ctx.fillStyle = COLORS.faint;
    ctx.font = '500 9px Inter, system-ui';
    ctx.fillText('Each step pauses briefly so you can inspect the chromosome movement.', 395, 445);
    ctx.restore();
  }

  _drawGlossary(ctx) {
    const safeTime = (Number.isNaN(this.totalTime) || this.totalTime < 0) ? 0 : this.totalTime;
    const item = GLOSSARY[Math.floor(safeTime / 6) % GLOSSARY.length];
    const x = 15;
    const y = 485;
    const width = 304;
    const lines = item.desc.split('\n');
    const height = 57 + lines.length * 13;
    ctx.save();
    SimDraw.drawPanel(ctx, x, y - height, width, height, {
      bg: 'rgba(10, 19, 39, 0.94)',
      stroke: 'rgba(96, 165, 250, 0.34)',
      lineWidth: 1,
      radius: 9,
    });
    ctx.fillStyle = '#dfbbfe';
    ctx.font = '700 11px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Glossary: ${item.term}`, x + 12, y - height + 11);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 10px Inter, system-ui';
    lines.forEach((line, index) => ctx.fillText(line, x + 12, y - height + 31 + index * 13));
    ctx.fillStyle = 'rgba(96, 165, 250, 0.25)';
    ctx.roundRect(x + 2, y - 4, (width - 4) * ((this.totalTime % 6) / 6), 2, 1);
    ctx.fill();
    ctx.restore();
  }

  _drawWrappedText(ctx, text, x, y, width, lineHeight, maxLines) {
    const words = text.split(' ');
    let line = '';
    let lineIndex = 0;
    words.forEach(word => {
      if (lineIndex >= maxLines) return;
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > width && line) {
        ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = word;
        lineIndex += 1;
      } else {
        line = candidate;
      }
    });
    if (line && lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
  }

  _ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}
