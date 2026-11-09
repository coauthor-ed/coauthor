import { OrganelleZoomSimulation } from '../base/OrganelleZoomSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

const COLORS = {
  bgDeep:      '#0a0f1e',
  bgCell:      '#0d1f3c',
  rerBase:     '#4f46e5', // Deep indigo for Rough ER
  rerHighlight:'#818cf8',
  serBase:     '#0d9488', // Teal for Smooth ER
  serHighlight:'#2dd4bf',
  ribosome:    '#facc15', // Yellow dots
  amino:       '#ef4444', // Red for amino acid
  protein:     '#f87171', // Folded protein
  lipid:       '#fbbf24', // Yellow/orange for lipid
  vesicleRER:  '#6366f1',
  vesicleSER:  '#14b8a6',
  label:       '#e2e8f0',
  labelMuted:  '#94a3b8',
};

const GLOSSARY = [
  { term: 'Endoplasmic Reticulum', desc: 'A network of membranes in the cell connected\nto the nucleus, like a bustling factory.' },
  { term: 'Rough ER (RER)', desc: 'Studded with ribosomes. It folds and modifies\nproteins made by the ribosomes.' },
  { term: 'Smooth ER (SER)', desc: 'Lacks ribosomes. It synthesizes lipids (fats)\nand detoxifies harmful substances.' },
  { term: 'Ribosome', desc: 'Tiny molecular machines on the Rough ER\nthat read mRNA to build proteins.' },
  { term: 'Lumen', desc: 'The inside space of the ER where proteins\nand lipids are folded and processed.' },
  { term: 'Transport Vesicle', desc: 'A small membrane bubble that pinches off\nthe ER to carry materials to the Golgi.' }
];

export class EndoplasmicReticulumScene extends OrganelleZoomSimulation {
  static WIDTH  = 700;
  static HEIGHT = 500;
  static ARIA_LABEL =
    'Zoomed-in Endoplasmic Reticulum. Shows both Rough ER on the left and Smooth ER on the right. ' +
    'Drop Amino Acids to see protein folding, and Lipids to see vesicle formation.';

  static CONTROLS = [
    { type: 'button', id: 'reset', label: 'Reset' },
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume   = true;
    
    this._phaseRER = 'idle'; // 'idle' | 'folding' | 'vesicle'
    this._timeRER  = 0;
    this._phaseSER = 'idle'; // 'idle' | 'synthesizing' | 'vesicle'
    this._timeSER  = 0;
    
    this._bgCache      = null;
    this._bubbleTimer  = 0;
  }

  async setup() {
    await super.setup();
    
    this.addInputSlot({ id: 'amino-slot', x: 160, y: 390, r: 26, accepts: ['amino'], label: 'Rough ER' });
    this.addInputSlot({ id: 'lipid-slot', x: 550, y: 390, r: 26, accepts: ['lipid'], label: 'Smooth ER' });
    
    this.setPalette([
      { id: 'amino', label: 'Amino Acid', shortLabel: 'AA', color: COLORS.amino },
      { id: 'lipid', label: 'Lipid Precursor', shortLabel: 'Lipid', color: COLORS.lipid },
    ]);
    
    this._buildBgCache();
    this._drawInitialFrame(this._ctx);
  }

  onControlChange(id, value) {
    if (id === 'reset') this._reset();
  }

  destroy() {
    this._bgCache = null;
    super.destroy();
  }

  _buildBgCache() {
    const W = EndoplasmicReticulumScene.WIDTH;
    const H = EndoplasmicReticulumScene.HEIGHT;
    const oc  = new OffscreenCanvas(W, H);
    const ctx = oc.getContext('2d');
    const rg  = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
    rg.addColorStop(0, COLORS.bgCell);
    rg.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    this._bgCache = oc;
  }

  _drawBackground(ctx) {
    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);
    else { ctx.fillStyle = COLORS.bgDeep; ctx.fillRect(0, 0, EndoplasmicReticulumScene.WIDTH, EndoplasmicReticulumScene.HEIGHT); }
  }

  _reset() {
    this._phaseRER = 'idle';
    this._timeRER = 0;
    this._phaseSER = 'idle';
    this._timeSER = 0;
    this.outputParticles = [];
    this.clearSlots();
    this._announce('Simulation reset.');
  }

  _canPlaceMolecule(id) {
    if (id === 'amino') return this._phaseRER === 'idle';
    if (id === 'lipid') return this._phaseSER === 'idle';
    return false;
  }

  _onInputDrop(molecule, slot) {
    if (molecule.id === 'amino') {
      this._phaseRER = 'folding';
      this._timeRER = 0;
      this.clearSlots();
      this._announce('Amino acid enters the Rough ER lumen to be folded into a complex protein.');
    } else if (molecule.id === 'lipid') {
      this._phaseSER = 'synthesizing';
      this._timeSER = 0;
      this.clearSlots();
      this._announce('Lipid precursor enters the Smooth ER for synthesis and processing.');
    }
  }

  _update(dt) {
    this._bubbleTimer += dt;
    
    // Update RER state
    if (this._phaseRER === 'folding') {
        this._timeRER += dt;
        if (this._timeRER >= 8.0) {
            this._phaseRER = 'vesicle';
            this._timeRER = 0;
            this._announce('Protein folded. A transport vesicle is pinching off to carry it to the Golgi.');
        }
    } else if (this._phaseRER === 'vesicle') {
        this._timeRER += dt;
        if (this._timeRER >= 8.0) {
            this._phaseRER = 'idle';
            this._timeRER = 0;
            this._refreshPaletteChips();
        }
    }
    
    // Update SER state
    if (this._phaseSER === 'synthesizing') {
        this._timeSER += dt;
        if (this._timeSER >= 8.0) {
            this._phaseSER = 'vesicle';
            this._timeSER = 0;
            this._announce('Lipids synthesized. A transport vesicle is pinching off from the Smooth ER.');
        }
    } else if (this._phaseSER === 'vesicle') {
        this._timeSER += dt;
        if (this._timeSER >= 8.0) {
            this._phaseSER = 'idle';
            this._timeSER = 0;
            this._refreshPaletteChips();
        }
    }
  }

  drawOuterMembrane(ctx) {
    // We will draw both ER regions in this function to keep them under the overlay and slots
    this._drawRER(ctx);
    this._drawSER(ctx);
  }

  _drawRER(ctx) {
    ctx.save();
    const cx = 180;
    const cy = 250;
    
    // Draw 3D folded cisternae using layered bezier curves
    const folds = 5;
    
    for (let i = 0; i < folds; i++) {
        const foldY = cy - 60 + i * 28;
        const width = 180 + Math.sin(i * 0.8) * 40;
        const height = 50;
        
        ctx.beginPath();
        // 3D folded look
        ctx.moveTo(cx - width/2, foldY);
        ctx.bezierCurveTo(cx - width/4, foldY - height, cx + width/4, foldY - height, cx + width/2, foldY);
        ctx.bezierCurveTo(cx + width/2 + 20, foldY + 25, cx + width/4, foldY + height, cx, foldY + height);
        ctx.bezierCurveTo(cx - width/4, foldY + height, cx - width/2 - 20, foldY + 25, cx - width/2, foldY);
        ctx.closePath();
        
        // Darker shadow underneath
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 8;
        
        const grad = ctx.createLinearGradient(cx - width/2, foldY - height, cx + width/2, foldY + height);
        grad.addColorStop(0, COLORS.rerHighlight);
        grad.addColorStop(0.5, COLORS.rerBase);
        grad.addColorStop(1, '#2e1065'); // dark indigo base
        
        ctx.fillStyle = grad;
        ctx.fill();
        
        // Highlight rim
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Ribosomes as 3D spheres
        // Use a seeded or consistent approach based on 'i' to avoid jitter if redrawing constantly
        // Math.sin provides a pseudo-random distribution
        for (let j = 0; j < 40; j++) {
            const hash1 = Math.abs(Math.sin(i * 123 + j * 321));
            const hash2 = Math.abs(Math.cos(i * 321 + j * 123));
            const rx = cx + (hash1 - 0.5) * width;
            const ry = foldY + (hash2 - 0.5) * height * 1.5;
            
            // Check if roughly in bounds
            if (Math.pow((rx - cx)/(width/2 + 10), 2) + Math.pow((ry - foldY)/(height), 2) < 1) {
                const rGrad = ctx.createRadialGradient(rx-1, ry-1, 0.5, rx, ry, 3.5);
                rGrad.addColorStop(0, '#fef08a');
                rGrad.addColorStop(1, '#ca8a04');
                ctx.beginPath();
                ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = rGrad;
                ctx.fill();
            }
        }
    }
    
    // Draw animation elements
    if (this._phaseRER === 'folding' || this._phaseRER === 'vesicle') {
        let ax = cx;
        let ay = cy - 20;
        
        if (this._phaseRER === 'folding') {
            // Jiggle inside lumen
            ax += Math.sin(this._timeRER * 10) * 15;
            ay += Math.cos(this._timeRER * 8) * 15;
            
            // Protein folds (changes from amino acid to folded protein color)
            const t = this._timeRER / 8.0;
            
            SimDraw.drawGlow(ctx, ax, ay, 20, COLORS.protein, 0.5 * t);
            
            // Draw folding chain
            ctx.strokeStyle = COLORS.protein;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            for(let p=0; p<6; p++) {
                ctx.lineTo(ax + Math.sin(p*2.5 + this._timeRER * 2) * 15, ay + Math.cos(p*1.5 + this._timeRER * 2) * 15);
            }
            ctx.stroke();
            
        } else if (this._phaseRER === 'vesicle') {
            // Vesicle pinching off and floating up
            const t = this._timeRER / 8.0; // 0 to 1
            // Start at the edge of the RER (e.g. cx + 100)
            ax = cx + 80 + t * 40; // float right
            ay = cy - 40 - t * 80; // float up
            
            // Draw vesicle as a 3D bubble
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 6;
            ctx.beginPath();
            ctx.arc(ax, ay, 22, 0, Math.PI * 2);
            const vgrad = ctx.createRadialGradient(ax-6, ay-6, 3, ax, ay, 22);
            vgrad.addColorStop(0, '#a5b4fc');
            vgrad.addColorStop(0.3, COLORS.rerHighlight);
            vgrad.addColorStop(1, '#312e81');
            ctx.fillStyle = vgrad;
            ctx.fill();
            
            // Draw protein inside (pulsing)
            ctx.shadowColor = 'transparent';
            SimDraw.drawGlow(ctx, ax, ay, 12, COLORS.protein, 0.8 + Math.sin(t * 30) * 0.2);
            ctx.fillStyle = COLORS.protein;
            ctx.beginPath();
            ctx.arc(ax, ay, 7, 0, Math.PI*2);
            ctx.fill();
        }
    }
    
    ctx.restore();
  }
  
  _drawBezierPath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
        const xc = (pts[i-1][0] + pts[i][0]) / 2;
        const yc = (pts[i-1][1] + pts[i][1]) / 2;
        if (i === 1) ctx.lineTo(xc, yc);
        else ctx.quadraticCurveTo(pts[i-1][0], pts[i-1][1], xc, yc);
        if (i === pts.length - 1) ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
  }

  _drawSER(ctx) {
    ctx.save();
    
    // Draw tubules as 3D cylinders with gradients and overlapping highlights
    const branches = [
        [ [280, 260], [380, 200], [460, 190], [540, 150], [600, 140] ],
        [ [310, 290], [410, 310], [500, 320], [580, 300] ],
        [ [390, 210], [440, 130], [520, 100] ],
        [ [420, 300], [470, 380], [550, 400] ],
        [ [470, 190], [520, 260], [600, 270] ],
        [ [440, 130], [490, 160], [550, 210] ]
    ];
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Bottom shadow layer
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;
    ctx.lineWidth = 32;
    ctx.strokeStyle = '#042f2e'; // Very dark teal
    branches.forEach(pts => this._drawBezierPath(ctx, pts));
    
    // Base tube color
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 30;
    ctx.strokeStyle = '#0f766e';
    branches.forEach(pts => this._drawBezierPath(ctx, pts));
    
    // Highlight 1 (gives cylindrical rounding)
    ctx.lineWidth = 18;
    ctx.strokeStyle = COLORS.serBase; // #0d9488
    branches.forEach(pts => this._drawBezierPath(ctx, pts));
    
    // Highlight 2 (inner shine)
    ctx.lineWidth = 8;
    ctx.strokeStyle = COLORS.serHighlight; // #2dd4bf
    branches.forEach(pts => this._drawBezierPath(ctx, pts));
    
    // Inner core bright shine
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#99f6e4';
    branches.forEach(pts => this._drawBezierPath(ctx, pts));
    
    // Draw animation elements
    if (this._phaseSER === 'synthesizing' || this._phaseSER === 'vesicle') {
        let ax = 480;
        let ay = 260;
        
        if (this._phaseSER === 'synthesizing') {
            // Move through tubule (following branch 0 roughly)
            const t = this._timeSER / 8.0;
            // 280 to 540 over 8 seconds
            ax = 320 + t * 220;
            ay = 240 - t * 60 + Math.sin(t * Math.PI * 4) * 15;
            
            SimDraw.drawGlow(ctx, ax, ay, 20, COLORS.lipid, 0.8 + Math.sin(t * 20) * 0.2);
            ctx.fillStyle = COLORS.lipid;
            ctx.beginPath();
            ctx.arc(ax, ay, 8 + Math.sin(this._timeSER * 10) * 2, 0, Math.PI*2);
            ctx.fill();
            
        } else if (this._phaseSER === 'vesicle') {
            // Vesicle pinching off and floating away
            const t = this._timeSER / 8.0; // 0 to 1
            ax = 540 + t * 40;
            ay = 180 - t * 60;
            
            // Draw vesicle
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 6;
            ctx.beginPath();
            ctx.arc(ax, ay, 22, 0, Math.PI * 2);
            const vgrad = ctx.createRadialGradient(ax-6, ay-6, 3, ax, ay, 22);
            vgrad.addColorStop(0, '#5eead4');
            vgrad.addColorStop(0.3, COLORS.serHighlight);
            vgrad.addColorStop(1, '#0f766e');
            ctx.fillStyle = vgrad;
            ctx.fill();
            
            // Draw lipid inside
            ctx.shadowColor = 'transparent';
            SimDraw.drawGlow(ctx, ax, ay, 12, COLORS.lipid, 0.8 + Math.sin(t * 30) * 0.2);
            ctx.fillStyle = COLORS.lipid;
            ctx.beginPath();
            ctx.arc(ax, ay, 8, 0, Math.PI*2);
            ctx.fill();
        }
    }
    
    ctx.restore();
  }

  _drawOverlay(ctx) {
    this._drawLabelPill(ctx, 'Rough ER', 200, 70, { bg: '#4f46e5dd' });
    this._drawLabelPill(ctx, 'Smooth ER', 500, 70, { bg: '#0d9488dd' });

    const bob = Math.sin(this._bubbleTimer * 1.4) * 3;

    if (this._phaseRER === 'idle' && this._phaseSER === 'idle') {
      this._drawCallout(ctx, EndoplasmicReticulumScene.WIDTH / 2, 120 + bob,
        'Welcome to the Endoplasmic Reticulum (ER)!\nThe ER has two main parts: Rough and Smooth.\nDrag molecules to see how they work.',
        { maxW: 420, bg: '#1e293bdd' });
    } else if (this._phaseRER === 'folding') {
      this._drawCallout(ctx, 250, 130,
        'Rough ER: Protein Folding\nThe amino acid chain enters the ER lumen where it\nis folded and modified into a functional protein.',
        { maxW: 380, bg: '#312e81dd', color: '#a5b4fc' });
    } else if (this._phaseRER === 'vesicle') {
      this._drawCallout(ctx, 250, 130 + bob,
        'Transport Vesicle\nA section of the ER membrane pinches off, forming a vesicle\nthat carries the newly folded protein to the Golgi apparatus.',
        { maxW: 420, bg: '#064e3bcc', color: '#6ee7b7' });
    } else if (this._phaseSER === 'synthesizing') {
      this._drawCallout(ctx, 450, 130,
        'Smooth ER: Lipid Synthesis\nThe tubular Smooth ER lacks ribosomes. It specializes in\nsynthesizing lipids (fats) and detoxifying harmful molecules.',
        { maxW: 400, bg: '#134e4add', color: '#5eead4' });
    } else if (this._phaseSER === 'vesicle') {
      this._drawCallout(ctx, 450, 130 + bob,
        'Transport Vesicle\nThe synthesized lipids are packaged into a transport vesicle\nto be sent to other parts of the cell or the cell membrane.',
        { maxW: 420, bg: '#064e3bcc', color: '#6ee7b7' });
    }
    
    // Draw Glossary Card in bottom left
    let glosIdx = Math.floor((this._time || 0) / 7) % GLOSSARY.length;
    if (isNaN(glosIdx) || glosIdx < 0) glosIdx = 0;
    
    this._drawGlossaryCard(ctx, 15, EndoplasmicReticulumScene.HEIGHT - 15, GLOSSARY[glosIdx]);
  }

  // ── Drawing helpers ─────────────────────────────────────────────────────────

  _drawCallout(ctx, cx, cy, text, { bg = '#1e293bdd', color = COLORS.label, maxW = 300 } = {}) {
    const lines  = text.split('\n');
    const lineH  = 18;
    const padX   = 16, padY = 12;
    const tailH  = 12;

    ctx.save();
    ctx.font = '500 13px Inter,system-ui';

    let textW = 0;
    for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
    textW = Math.min(textW, maxW - padX * 2);

    const bw = textW + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const bx = Math.max(6, Math.min(EndoplasmicReticulumScene.WIDTH - bw - 6, cx - bw / 2));
    const by = cy - bh - tailH;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fillStyle = bg;
    ctx.fill();

    const tailX = Math.max(bx + 14, Math.min(bx + bw - 14, cx));
    ctx.beginPath();
    ctx.moveTo(tailX - 8, by + bh);
    ctx.lineTo(tailX + 8, by + bh);
    ctx.lineTo(tailX,     by + bh + tailH);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + padY + i * lineH, bw - padX * 2));
    ctx.restore();
  }

  _drawGlossaryCard(ctx, x, y, termItem) {
    ctx.save();
    ctx.font = 'bold 12px Inter,system-ui';
    const termW = ctx.measureText(`📖 ${termItem.term}`).width;
    
    ctx.font = '500 11px Inter,system-ui';
    const lines = termItem.desc.split('\n');
    let maxW = termW;
    lines.forEach(l => maxW = Math.max(maxW, ctx.measureText(l.trim()).width));
    
    const padX = 14, padY = 12;
    const lineH = 16;
    const w = maxW + padX * 2;
    const h = 20 + lines.length * lineH + padY;
    
    // Background and border
    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 8);
    ctx.fillStyle = '#0f172add'; // Dark slate background with some transparency
    ctx.fill();
    ctx.strokeStyle = '#3b82f655';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title
    ctx.fillStyle = '#93c5fd'; // Light blue title
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 12px Inter,system-ui';
    ctx.fillText(`📖 ${termItem.term}`, x + padX, y - h + padY);
    
    // Description lines
    ctx.fillStyle = COLORS.labelMuted;
    ctx.font = '500 11px Inter,system-ui';
    lines.forEach((l, i) => {
        ctx.fillText(l.trim(), x + padX, y - h + padY + 22 + i * lineH);
    });
    
    // Loading bar at bottom
    const t = (this._time % 7) / 7; // 7 seconds per term
    ctx.beginPath();
    ctx.roundRect(x + 2, y - 4, (w - 4) * t, 2, 1);
    ctx.fillStyle = '#3b82f688';
    ctx.fill();
    
    ctx.restore();
  }
}
