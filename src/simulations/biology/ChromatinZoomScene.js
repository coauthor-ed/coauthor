import { CanvasSimulation } from '../base/CanvasSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

/**
 * ChromatinZoomScene — Part 1.5 "DNA Packaging: From Chromatin to Chromosomes"
 * 
 * Demonstrates the structural hierarchy of DNA packaging in 4 distinct zoom levels.
 * Uses Next/Previous phase buttons with cinematic zoom transitions between the states.
 * 
 * Tailored for CBSE Class 9 Biology Curriculum.
 */

const COLORS = {
  bgDeep:        '#050811',
  bgCell:        '#0d1f3c',
  dnaStrand:     '#38bdf8',
  dnaBase1:      '#f43f5e', // red
  dnaBase2:      '#34d399', // green
  dnaBase3:      '#fbbf24', // yellow
  dnaBase4:      '#818cf8', // indigo
  histone:       '#f472b6', // pink
  histoneShadow: '#be185d',
  labelMuted:    '#94a3b8',
  textMain:      '#f8fafc',
};

const GLOSSARY = [
  { term: 'DNA', desc: 'The long, thread-like molecule that carries the genetic\ninstructions of life (2 nm wide).' },
  { term: 'Histones', desc: 'Special proteins that act like tiny spools for the DNA\nthread to wrap around, preventing tangles.' },
  { term: 'Nucleosome', desc: 'A fundamental unit of packaging: a segment of DNA\nwrapped around a cluster of 8 histone proteins.' },
  { term: 'Chromatin', desc: 'The loose, tangled network of DNA and histones found\nin a resting cell (Interphase).' },
  { term: 'Chromosome', desc: 'The highly condensed, tightly coiled X-shaped structure\nvisible only when the cell prepares to divide.' }
];

export class ChromatinZoomScene extends CanvasSimulation {
  static WIDTH = 600;
  static HEIGHT = 500;
  static ARIA_LABEL = 'DNA Packaging simulator showing distinct structural levels from DNA to Chromosome.';

  static CONTROLS = [
    { type: 'button', id: 'prev', label: '⬅️ Previous Phase' },
    { type: 'button', id: 'next', label: 'Next Phase ➡️' }
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;
    
    this.currentLevel = 1; // 1 to 4
    this.time = 0;
    
    // Transition State
    this.transitioning = false;
    this.transitionProgress = 0; // 0.0 to 1.0
    this.transitionDirection = 1; // 1 for zooming out (next), -1 for zooming in (prev)
    this.targetLevel = 1;
    this.transitionDuration = 1.2; // seconds
  }

  async setup() {
    await super.setup();
    this._canvas.setAttribute('role', 'img');
    this._canvas.setAttribute('aria-label', this.constructor.ARIA_LABEL);
    this._drawInitialFrame(this._ctx);
  }

  onControlChange(id, value) {
    if (this.transitioning) return; // Block input during transitions
    
    if (id === 'next' && this.currentLevel < 4) {
      this.targetLevel = this.currentLevel + 1;
      this.transitionDirection = 1;
      this.transitioning = true;
      this.transitionProgress = 0;
    } else if (id === 'prev' && this.currentLevel > 1) {
      this.targetLevel = this.currentLevel - 1;
      this.transitionDirection = -1;
      this.transitioning = true;
      this.transitionProgress = 0;
    }
  }

  _tick(ctx, dt) {
    this.time += dt;

    if (this.transitioning) {
      this.transitionProgress += dt / this.transitionDuration;
      if (this.transitionProgress >= 1.0) {
        this.transitionProgress = 1.0;
        this.currentLevel = this.targetLevel;
        this.transitioning = false;
      }
    }

    this._drawBackground(ctx);

    const cx = ChromatinZoomScene.WIDTH / 2;
    const cy = 270;

    if (!this.transitioning) {
      // Draw static state
      ctx.save();
      this._drawLevel(ctx, this.currentLevel);
      ctx.restore();
    } else {
      // Draw cinematic zoom transition
      const ease = this._easeInOutCubic(this.transitionProgress);
      
      let scaleCurr, alphaCurr;
      let scaleTarget, alphaTarget;
      
      if (this.transitionDirection === 1) {
        // Zooming OUT (Next Phase)
        // Current level shrinks and fades out
        scaleCurr = 1.0 - (ease * 0.8); // 1.0 -> 0.2
        alphaCurr = 1.0 - ease;
        // Target level shrinks to normal size and fades in
        scaleTarget = 5.0 - (ease * 4.0); // 5.0 -> 1.0
        alphaTarget = ease;
      } else {
        // Zooming IN (Previous Phase)
        // Current level grows and fades out
        scaleCurr = 1.0 + (ease * 4.0); // 1.0 -> 5.0
        alphaCurr = 1.0 - ease;
        // Target level grows to normal size and fades in
        scaleTarget = 0.2 + (ease * 0.8); // 0.2 -> 1.0
        alphaTarget = ease;
      }
      
      // Draw Target (Back layer when zooming out, Front when zooming in)
      if (this.transitionDirection === 1) {
         this._drawScaledLevel(ctx, this.targetLevel, cx, cy, scaleTarget, alphaTarget);
         this._drawScaledLevel(ctx, this.currentLevel, cx, cy, scaleCurr, alphaCurr);
      } else {
         this._drawScaledLevel(ctx, this.currentLevel, cx, cy, scaleCurr, alphaCurr);
         this._drawScaledLevel(ctx, this.targetLevel, cx, cy, scaleTarget, alphaTarget);
      }
    }
    
    this._drawOverlay(ctx);
  }

  _easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  _drawScaledLevel(ctx, level, cx, cy, scale, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    this._drawLevel(ctx, level);
    ctx.restore();
  }

  _drawLevel(ctx, level) {
    if (level === 1) this._drawLevel1(ctx);
    else if (level === 2) this._drawLevel2(ctx);
    else if (level === 3) this._drawLevel3(ctx);
    else if (level === 4) this._drawLevel4(ctx);
  }

  _drawInitialFrame(ctx) {
    this._tick(ctx, 0);
  }

  _drawBackground(ctx) {
    const W = ChromatinZoomScene.WIDTH;
    const H = ChromatinZoomScene.HEIGHT;
    
    const grad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W);
    grad.addColorStop(0, COLORS.bgCell);
    grad.addColorStop(1, COLORS.bgDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // --- Visual Level 1: DNA Double Helix ---
  _drawLevel1(ctx) {
    const cx = ChromatinZoomScene.WIDTH / 2;
    const cy = 270;
    const amplitude = 50;
    const frequency = 0.04;
    const speed = 2.5;
    
    ctx.lineWidth = 3;
    
    const colors = [COLORS.dnaBase1, COLORS.dnaBase2, COLORS.dnaBase3, COLORS.dnaBase4];
    const phaseOffset = this.time * speed;
    
    // Draw bases (rungs)
    for (let x = -20; x <= 620; x += 20) {
      const y1 = cy + Math.sin(x * frequency - phaseOffset) * amplitude;
      const y2 = cy + Math.sin(x * frequency - phaseOffset + Math.PI) * amplitude;
      
      const cIdx = Math.floor(Math.abs(x) / 20) % 4;
      const cIdx2 = (cIdx + 2) % 4;
      
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, (y1 + y2) / 2);
      ctx.strokeStyle = colors[cIdx];
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x, (y1 + y2) / 2);
      ctx.lineTo(x, y2);
      ctx.strokeStyle = colors[cIdx2];
      ctx.stroke();
    }
    
    ctx.strokeStyle = COLORS.dnaStrand;
    ctx.shadowColor = COLORS.dnaStrand;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 5;
    
    // Back strand
    ctx.beginPath();
    for (let x = -30; x <= 630; x += 5) {
      const y2 = cy + Math.sin(x * frequency - phaseOffset + Math.PI) * amplitude;
      if (x === -30) ctx.moveTo(x, y2); else ctx.lineTo(x, y2);
    }
    ctx.stroke();
    
    // Front strand
    ctx.beginPath();
    for (let x = -30; x <= 630; x += 5) {
      const y1 = cy + Math.sin(x * frequency - phaseOffset) * amplitude;
      if (x === -30) ctx.moveTo(x, y1); else ctx.lineTo(x, y1);
    }
    ctx.stroke();
  }

  // --- Visual Level 2: Nucleosomes ---
  _drawLevel2(ctx) {
    const cx = ChromatinZoomScene.WIDTH / 2;
    const cy = 270;
    
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.dnaStrand;
    ctx.shadowColor = COLORS.dnaStrand;
    ctx.shadowBlur = 5;
    
    const numHistones = 9;
    const spacing = 75;
    const startX = cx - ((numHistones - 1) * spacing) / 2;
    
    const bob = Math.sin(this.time) * 10;
    
    // Draw linker DNA (back layer)
    ctx.beginPath();
    ctx.moveTo(startX - 60, cy + bob);
    for (let i = 0; i < numHistones; i++) {
      const hx = startX + i * spacing;
      const hy = cy + Math.sin(this.time * 1.5 + i) * 15 + bob;
      ctx.lineTo(hx - 13, hy - 13);
      ctx.lineTo(hx + 13, hy + 13);
      if (i < numHistones - 1) {
          const nx = startX + (i + 1) * spacing;
          const ny = cy + Math.sin(this.time * 1.5 + i + 1) * 15 + bob;
          ctx.bezierCurveTo(hx + 30, hy + 25, nx - 30, ny - 25, nx - 13, ny - 13);
      }
    }
    ctx.lineTo(startX + (numHistones - 1) * spacing + 60, cy + bob);
    ctx.stroke();
    
    // Draw Histone Octamers (front layer)
    for (let i = 0; i < numHistones; i++) {
      const hx = startX + i * spacing;
      const hy = cy + Math.sin(this.time * 1.5 + i) * 15 + bob;
      
      const grad = ctx.createRadialGradient(hx - 5, hy - 5, 2, hx, hy, 18);
      grad.addColorStop(0, '#fbcfe8'); 
      grad.addColorStop(0.5, COLORS.histone);
      grad.addColorStop(1, COLORS.histoneShadow);
      
      ctx.beginPath();
      ctx.arc(hx, hy, 18, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowBlur = 0;
      ctx.fill();
      
      // Draw DNA wrapped over the histone
      ctx.beginPath();
      ctx.arc(hx, hy, 18, Math.PI * 0.7, Math.PI * 2.3);
      ctx.strokeStyle = COLORS.dnaStrand;
      ctx.shadowBlur = 5;
      ctx.stroke();
    }
  }

  // --- Visual Level 3: Chromatin Fiber ---
  _drawLevel3(ctx) {
    const cx = ChromatinZoomScene.WIDTH / 2;
    const cy = 270;
    
    const loops = 22;
    const width = 580;
    const radius = 35;
    const startX = cx - width / 2;
    
    ctx.lineWidth = 2.5;
    
    // Draw back half of the coiled solenoid
    for (let x = startX; x <= startX + width; x += 4) {
       const progress = (x - startX) / width;
       const angle = progress * Math.PI * 2 * loops - this.time * 1.5;
       
       const py = cy + Math.sin(angle) * radius + Math.sin(x * 0.05 + this.time) * 12;
       const z = Math.cos(angle); 
       
       if (z < 0) {
           ctx.beginPath();
           ctx.arc(x, py, 7, 0, Math.PI * 2);
           ctx.fillStyle = COLORS.histoneShadow;
           ctx.fill();
           ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
           ctx.stroke();
       }
    }
    
    // Draw front half of the coiled solenoid
    for (let x = startX; x <= startX + width; x += 4) {
       const progress = (x - startX) / width;
       const angle = progress * Math.PI * 2 * loops - this.time * 1.5;
       
       const py = cy + Math.sin(angle) * radius + Math.sin(x * 0.05 + this.time) * 12;
       const z = Math.cos(angle); 
       
       if (z >= 0) {
           ctx.beginPath();
           ctx.arc(x, py, 9, 0, Math.PI * 2);
           ctx.fillStyle = COLORS.histone;
           ctx.fill();
           
           ctx.strokeStyle = COLORS.dnaStrand;
           ctx.beginPath();
           ctx.arc(x, py, 9, -Math.PI / 4, Math.PI);
           ctx.stroke();
       }
    }
  }

  // --- Visual Level 4: Condensed Chromosome ---
  _drawLevel4(ctx) {
    const cx = ChromatinZoomScene.WIDTH / 2;
    const cy = 270;
    
    const arms = [
      { ang: -0.5, len: 120 },
      { ang: 0.5, len: 120 },
      { ang: Math.PI - 0.5, len: 140 },
      { ang: Math.PI + 0.5, len: 140 }
    ];
    
    ctx.shadowColor = COLORS.dnaStrand;
    ctx.shadowBlur = 10;
    
    for (const arm of arms) {
       ctx.save();
       ctx.translate(cx, cy);
       ctx.rotate(arm.ang);
       
       const bob = Math.sin(this.time * 2 + arm.ang) * 1.5;
       ctx.rotate(bob * 0.02);
       
       ctx.strokeStyle = COLORS.dnaStrand;
       
       // Base silhouette glow
       ctx.fillStyle = 'rgba(147, 51, 234, 0.25)';
       ctx.beginPath();
       ctx.roundRect(0, -22, arm.len, 44, 22);
       ctx.fill();
       
       // Dense scribble lines to represent the looped scaffolds
       ctx.lineWidth = 2;
       ctx.beginPath();
       for (let x = 0; x <= arm.len; x += 1.5) {
           let yOffset = (Math.random() - 0.5) * 44;
           let taper = Math.sin((x / arm.len) * Math.PI);
           yOffset *= taper;
           
           if (x === 0) ctx.moveTo(x, yOffset);
           else ctx.lineTo(x, yOffset);
       }
       ctx.stroke();
       
       // Tiny histone clusters packed inside
       for (let i = 0; i < 75; i++) {
           const lx = Math.random() * arm.len;
           const ly = (Math.random() - 0.5) * 40 * Math.sin((lx / arm.len) * Math.PI);
           const lr = 2 + Math.random() * 2.5;
           
           ctx.beginPath();
           ctx.arc(lx, ly, lr, 0, Math.PI * 2);
           ctx.fillStyle = (Math.random() > 0.4) ? COLORS.histoneShadow : COLORS.dnaStrand;
           ctx.fill();
       }
       
       ctx.restore();
    }
    
    // Centromere (Kinetochore area)
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    const cGrad = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 20);
    cGrad.addColorStop(0, '#fbcfe8');
    cGrad.addColorStop(1, COLORS.histoneShadow);
    ctx.fillStyle = cGrad;
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // --- UI Overlays ---
  _drawOverlay(ctx) {
    let title = '';
    let text = '';
    let bg = '';
    let color = '';
    
    // Determine which level to describe (use target level if transitioning)
    const levelToDescribe = this.transitioning ? this.targetLevel : this.currentLevel;
    
    if (levelToDescribe === 1) {
      title = '1. DNA Double Helix (2 nm)';
      text = 'The uncoiled genetic code. Two sugar-phosphate backbones connected\nby complementary base pairs in a twisted ladder shape.';
      bg = 'rgba(15, 23, 42, 0.85)';
      color = '#7dd3fc';
    } else if (levelToDescribe === 2) {
      title = '2. Nucleosomes (11 nm)';
      text = 'DNA wraps around clusters of 8 histone proteins to prevent tangling.\nOften described visually as "beads on a string".';
      bg = 'rgba(80, 20, 60, 0.85)';
      color = '#fbcfe8';
    } else if (levelToDescribe === 3) {
      title = '3. Chromatin Fiber (30 nm)';
      text = 'Nucleosomes coil together into a thicker, denser fiber (solenoid).\nThis is the functional state of DNA in a resting cell (Interphase).';
      bg = 'rgba(20, 70, 40, 0.85)';
      color = '#6ee7b7';
    } else if (levelToDescribe === 4) {
      title = '4. Condensed Chromosome (1400 nm)';
      text = 'During cell division (Metaphase), chromatin fibers loop and scaffold\ninto highly compact X-shaped sister chromatids for safe transport.';
      bg = 'rgba(50, 10, 80, 0.85)';
      color = '#d8b4fe';
    }
    
    const fullText = `${title}\n${text}`;
    
    // Animate the callout box alpha during transition to show it's updating
    let overlayAlpha = 1.0;
    if (this.transitioning) {
        // dip to 0 at 0.5 progress, then back to 1
        overlayAlpha = Math.abs(this.transitionProgress - 0.5) * 2;
    }
    
    ctx.save();
    ctx.globalAlpha = overlayAlpha;
    this._drawCallout(ctx, ChromatinZoomScene.WIDTH / 2, 70, fullText, {
      bg, color, maxW: 480
    });
    ctx.restore();
    
    // Glossary
    let glosIdx = Math.floor(this.time / 6) % GLOSSARY.length;
    if (isNaN(glosIdx) || glosIdx < 0) glosIdx = 0;
    this._drawGlossaryCard(ctx, 15, ChromatinZoomScene.HEIGHT - 15, GLOSSARY[glosIdx]);
  }

  _drawCallout(ctx, cx, cy, text, { bg = '#1e293bdd', color = '#fff', maxW = 300 } = {}) {
    const lines  = text.split('\n');
    const lineH  = 18;
    const padX   = 16, padY = 12;

    ctx.save();
    ctx.font = '500 13px Inter,system-ui';

    let textW = 0;
    for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
    textW = Math.min(textW, maxW - padX * 2);

    const bw = textW + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const bx = Math.max(6, Math.min(ChromatinZoomScene.WIDTH - bw - 6, cx - bw / 2));
    const by = Math.max(6, cy - bh / 2);

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    
    // Make the first line (title) bold
    lines.forEach((l, i) => {
      if (i === 0) ctx.font = 'bold 14px Inter,system-ui';
      else ctx.font = '500 13px Inter,system-ui';
      ctx.fillText(l, bx + bw / 2, by + padY + i * lineH, bw - padX * 2);
    });
    
    ctx.restore();
  }

  _drawGlossaryCard(ctx, x, y, termItem) {
    ctx.save();
    ctx.font = 'bold 12.5px Inter,system-ui';
    const termW = ctx.measureText(`📖 ${termItem.term}`).width;
    
    ctx.font = '500 11.5px Inter,system-ui';
    const lines = termItem.desc.split('\n');
    let maxW = termW;
    lines.forEach(l => maxW = Math.max(maxW, ctx.measureText(l.trim()).width));
    
    const padX = 14, padY = 12;
    const lineH = 16.5;
    const w = maxW + padX * 2;
    const h = 22 + lines.length * lineH + padY;
    
    ctx.beginPath();
    ctx.roundRect(x, y - h, w, h, 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#93c5fd'; 
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 12.5px Inter,system-ui';
    ctx.fillText(`📖 ${termItem.term}`, x + padX, y - h + padY);
    
    ctx.fillStyle = COLORS.labelMuted;
    ctx.font = '500 11.5px Inter,system-ui';
    lines.forEach((l, i) => {
        ctx.fillText(l.trim(), x + padX, y - h + padY + 24 + i * lineH);
    });
    
    const t = (this.time % 6) / 6; 
    ctx.beginPath();
    ctx.roundRect(x + 2, y - 4, (w - 4) * t, 2, 1);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.fill();
    
    ctx.restore();
  }
}
