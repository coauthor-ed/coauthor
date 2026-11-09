import { CellViewSimulation } from '../base/CellViewSimulation.js';
import { SimDraw } from '../base/SimDrawUtils.js';

const C = {
  bgDeep:     '#0a0f1e',
  bgCell:     '#0d1f3c',
  cytoplasm:  'rgba(30,58,95,0.40)',
  membrane:   '#4f9cf7',
  memGlow:    'rgba(79,156,247,0.20)',
  nucleus:    '#6366f1',
  nucleusGlo: 'rgba(99,102,241,0.30)',
  er:         '#818cf8',
  ser:        '#a78bfa',
  golgi:      '#ec4899',
  lysosome:   '#ef4444',
  ribosome:   '#94a3b8',
  protein:    '#ef4444',
  lipid:      '#fcd34d',
  vesicle:    'rgba(148,163,184,0.6)',
  label:      '#e2e8f0',
  labelBg:    'rgba(30,41,59,0.85)',
};

const W = 800, H = 500;
const CX = W / 2, CY = H / 2;
const RX = 360, RY = 230;

const ZONES = {
  nucleus: { x: 120, y: 250, r: 60, label: 'Nucleus' },
  rer:     { x: 260, y: 170, w: 90, h: 120, label: 'Rough ER' },
  ser:     { x: 250, y: 350, w: 80, h: 80, label: 'Smooth ER' },
  golgi:   { x: 500, y: 250, w: 100, h: 160, label: 'Golgi Apparatus' },
  membrane:{ x: 740, y: 250, r: 30, label: 'Cell Membrane' }
};

export class ManufacturingPipelineScene extends CellViewSimulation {
  static WIDTH = W;
  static HEIGHT = H;
  static ARIA_LABEL = "Simulation of the cell's manufacturing pipeline involving the Nucleus, ER, and Golgi.";
  static CONTROLS = [
    { type: 'button', id: 'reset', label: 'Reset Pipeline' }
  ];

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;
    this._time = 0;
    this._bgCache = null;
    
    // Interactions
    this._onClick = this._handleClick.bind(this);
    this._onDown = this._handleDown.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onUp = this._handleUp.bind(this);

    this._resetState();
  }

  _resetState() {
    this._phase = 0; // 0: Start, 1: Nuc anim, 2: wait SER, 3: SER anim, 4: Drag, 5: Golgi anim, 6: Export wait, 7: Export anim
    this._animTime = 0;
    this._vesicles = [];
    this._proteins = [];
    this._lipids = [];
    this._dragTarget = null;
    this._dragOffset = { x: 0, y: 0 };
    this._prompt = "Phase 1: Click the Nucleus to send instructions (mRNA) to the Rough ER.";
  }

  async setup() {
    await super.setup();
    this._buildBgCache();
    
    this._canvas.style.cursor = 'default';
    this._canvas.addEventListener('click', this._onClick);
    this._canvas.addEventListener('mousedown', this._onDown);
    this._canvas.addEventListener('mousemove', this._onMove);
    this._canvas.addEventListener('mouseup', this._onUp);
    this._canvas.addEventListener('touchstart', this._onDown, { passive: false });
    this._canvas.addEventListener('touchmove', this._onMove, { passive: false });
    this._canvas.addEventListener('touchend', this._onUp);
    
    this._tick(this._ctx, 0);
  }

  destroy() {
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onClick);
      this._canvas.removeEventListener('mousedown', this._onDown);
      this._canvas.removeEventListener('mousemove', this._onMove);
      this._canvas.removeEventListener('mouseup', this._onUp);
      this._canvas.removeEventListener('touchstart', this._onDown);
      this._canvas.removeEventListener('touchmove', this._onMove);
      this._canvas.removeEventListener('touchend', this._onUp);
    }
    this._bgCache = null;
    super.destroy();
  }

  onControlChange(id, value) {
    if (id === 'reset') {
      this._resetState();
    }
  }

  _buildBgCache() {
    const oc = new OffscreenCanvas(W, H);
    const ctx = oc.getContext('2d');
    const rg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 400);
    rg.addColorStop(0, C.bgCell);
    rg.addColorStop(1, C.bgDeep);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    this._bgCache = oc;
  }

  // --- Interaction Handlers ---

  _getMousePos(e) {
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = W / (rect.width || W);
    const scaleY = H / (rect.height || H);
    let clientX = e.clientX, clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  _handleClick(e) {
    const pos = this._getMousePos(e);
    const hitNuc = Math.hypot(pos.x - ZONES.nucleus.x, pos.y - ZONES.nucleus.y) < ZONES.nucleus.r;
    
    // Check hit on SER
    const inSER = Math.abs(pos.x - ZONES.ser.x) < ZONES.ser.w/2 && Math.abs(pos.y - ZONES.ser.y) < ZONES.ser.h/2;

    if (this._phase === 0 && hitNuc) {
      this._phase = 1;
      this._animTime = 0;
      this._prompt = "Manufacturing proteins on the Rough ER...";
    } else if (this._phase === 2 && inSER) {
      this._phase = 3;
      this._animTime = 0;
      this._prompt = "Synthesizing lipids in the Smooth ER...";
    } else if (this._phase >= 6) {
      // Allow clicking mature vesicles even if we are already in phase 7
      let clicked = false;
      // Check hit on mature vesicles
      for (const v of this._vesicles) {
        if (v.status === 'mature' && Math.hypot(pos.x - v.x, pos.y - v.y) < 35) { // increased hit radius for easier clicking
          v.status = 'exporting';
          v.exportTime = 0;
          clicked = true;
        }
      }
      if (clicked && this._phase === 6) {
        this._phase = 7;
        this._prompt = "Vesicles travel to the cell membrane and release contents.";
      }
    }
  }

  _handleDown(e) {
    if (this._phase !== 4) return;
    const pos = this._getMousePos(e);
    
    // Find draggable vesicle
    for (const v of this._vesicles) {
      if (v.status === 'transport' && Math.hypot(pos.x - v.x, pos.y - v.y) < 25) {
        this._dragTarget = v;
        this._dragOffset.x = v.x - pos.x;
        this._dragOffset.y = v.y - pos.y;
        this._canvas.style.cursor = 'grabbing';
        if (e.preventDefault) e.preventDefault();
        return;
      }
    }
  }

  _handleMove(e) {
    if (this._phase === 4) {
      const pos = this._getMousePos(e);
      let hoverVesicle = false;
      for (const v of this._vesicles) {
        if (v.status === 'transport' && Math.hypot(pos.x - v.x, pos.y - v.y) < 25) hoverVesicle = true;
      }
      this._canvas.style.cursor = this._dragTarget ? 'grabbing' : (hoverVesicle ? 'grab' : 'default');
      
      if (this._dragTarget) {
         const overGolgi = Math.abs(this._dragTarget.x - ZONES.golgi.x) < ZONES.golgi.w/2 + 50 &&
                           Math.abs(this._dragTarget.y - ZONES.golgi.y) < ZONES.golgi.h/2 + 50;
         this._golgiHover = overGolgi;
      } else {
         this._golgiHover = false;
      }
    }

    if (this._dragTarget) {
      if (e.preventDefault) e.preventDefault();
      const pos = this._getMousePos(e);
      this._dragTarget.x = pos.x + this._dragOffset.x;
      this._dragTarget.y = pos.y + this._dragOffset.y;
    }
  }

  _handleUp(e) {
    if (this._dragTarget) {
      const v = this._dragTarget;
      this._dragTarget = null;
      this._canvas.style.cursor = 'grab';
      
      // Check if dropped near/on Golgi
      const overGolgi = Math.abs(v.x - ZONES.golgi.x) < ZONES.golgi.w/2 + 50 &&
                        Math.abs(v.y - ZONES.golgi.y) < ZONES.golgi.h/2 + 50;
                        
      if (overGolgi) {
        v.status = 'at-golgi';
        // Snap to golgi input face
        const gx = ZONES.golgi.x - ZONES.golgi.w/2;
        v.x = gx - 10;
        
        // Check if all transport vesicles reached golgi
        const allAtGolgi = this._vesicles.every(ves => ves.status !== 'transport');
        if (allAtGolgi) {
          this._phase = 5;
          this._animTime = 0;
          this._prompt = "Processing: Golgi Apparatus modifies and repackages the materials...";
        }
      }
      this._golgiHover = false;
    }
  }

  // --- Update Loop ---

  _tick(ctx, dt) {
    this._time += dt;
    ctx.clearRect(0, 0, W, H);

    if (this._bgCache) ctx.drawImage(this._bgCache, 0, 0);

    // Membrane and Cytoplasm
    this.drawCytoplasm(ctx);
    this._drawMembrane(ctx);

    // State Machine Updates
    if (this._phase === 1) {
      this._animTime += dt;
      if (this._animTime > 2.5) {
        this._phase = 2;
        this._prompt = "Phase 2: Click the Smooth ER to synthesize lipids.";
        this._proteins.push({x: ZONES.rer.x + 30, y: ZONES.rer.y - 20});
        this._proteins.push({x: ZONES.rer.x + 30, y: ZONES.rer.y + 20});
      }
    } else if (this._phase === 3) {
      this._animTime += dt;
      if (this._animTime > 2) {
        this._phase = 4;
        this._prompt = "Phase 3: Drag the transport vesicles to the Golgi Apparatus.";
        this._lipids.push({x: ZONES.ser.x + 20, y: ZONES.ser.y});
        // Package them into vesicles
        this._vesicles.push({
          x: ZONES.rer.x + 60, y: ZONES.rer.y,
          type: 'protein', status: 'transport'
        });
        this._vesicles.push({
          x: ZONES.ser.x + 50, y: ZONES.ser.y,
          type: 'lipid', status: 'transport'
        });
      }
    } else if (this._phase === 5) {
      this._animTime += dt;
      let allMature = true;
      // Vesicles move through Golgi
      for (const v of this._vesicles) {
        if (v.status === 'at-golgi') {
          v.x += 40 * dt; // move right faster
          if (v.x > ZONES.golgi.x + ZONES.golgi.w/2 + 15) {
            v.status = 'mature';
          } else {
            allMature = false;
          }
        } else if (v.status !== 'mature') {
          allMature = false;
        }
      }
      
      if (allMature) {
        this._phase = 6;
        this._prompt = "Phase 4: Click the mature vesicles to export them out of the cell.";
      }
    } else if (this._phase === 7) {
      let allExportedAndGone = true;
      for (const v of this._vesicles) {
        if (v.status === 'exporting') {
          v.exportTime += dt;
          const targetX = ZONES.membrane.x;
          const targetY = ZONES.membrane.y;
          // Lerp to membrane
          v.x += (targetX - v.x) * dt * 2;
          v.y += (targetY - v.y) * dt * 2;
          
          if (Math.hypot(v.x - targetX, v.y - targetY) < 5) {
            v.status = 'exported';
          }
          allExportedAndGone = false;
        } else if (v.status === 'exported') {
          v.x += 40 * dt; // drift out of cell
          if (v.x < ZONES.membrane.x + 80) allExportedAndGone = false;
        } else {
          allExportedAndGone = false; // still transport, at-golgi, or mature
        }
      }
      
      if (allExportedAndGone && this._vesicles.length > 0) {
        this._phase = 8;
        this._prompt = "Simulation Complete: All materials successfully exported.";
      }
    } else if (this._phase === 8) {
      for (const v of this._vesicles) {
        if (v.status === 'exported') v.x += 40 * dt;
      }
    }

    // --- Drawing Organelles ---
    
    const bob = (phase) => Math.sin(this._time * 0.8 + phase) * 3;

    // Nucleus
    this._drawNucleus(ctx, ZONES.nucleus.x, ZONES.nucleus.y + bob(0), ZONES.nucleus.r);
    
    // RER
    this._drawRER(ctx, ZONES.rer.x, ZONES.rer.y + bob(1), ZONES.rer.w, ZONES.rer.h);
    
    // SER
    this._drawSER(ctx, ZONES.ser.x, ZONES.ser.y + bob(2), ZONES.ser.w, ZONES.ser.h);
    
    // Golgi
    this._drawGolgi(ctx, ZONES.golgi.x, ZONES.golgi.y + bob(3), ZONES.golgi.w, ZONES.golgi.h);
    if (this._golgiHover) {
       SimDraw.drawPulse(ctx, ZONES.golgi.x, ZONES.golgi.y + bob(3), ZONES.golgi.w/2 + 30, '#a3e635', this._time * 2);
    }

    // Animations (mRNA, etc)
    if (this._phase === 1) {
      this._drawMRNAAnim(ctx);
    }
    if (this._phase === 3) {
      this._drawLipidAnim(ctx);
    }

    // Draw freestanding molecules (before packaging)
    if (this._phase >= 2 && this._phase < 4) {
      if (this._phase < 4) {
        ctx.fillStyle = C.protein;
        for (const p of this._proteins) {
          ctx.beginPath();
          ctx.arc(p.x, p.y + bob(1), 4, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }

    // Draw Vesicles
    for (const v of this._vesicles) {
      const vY = v.y + ((v.status === 'transport' || v.status === 'mature') ? bob(v.x*0.1) : 0);
      
      let alpha = 1;
      let p = 0; // golgi progress
      if (v.status === 'exported') {
        alpha = Math.max(0, 1 - (v.x - ZONES.membrane.x)/50);
      } else if (v.status === 'at-golgi') {
        const golgiLeft = ZONES.golgi.x - ZONES.golgi.w/2;
        p = (v.x - golgiLeft) / ZONES.golgi.w; // 0 to 1
        
        if (p < 0.25) alpha = 1 - (p / 0.25);
        else if (p > 0.75) alpha = (p - 0.75) / 0.25;
        else alpha = 0;
      }
      
      if (alpha > 0) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(v.x, vY, 14, 0, Math.PI*2);
        ctx.fillStyle = C.vesicle;
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Contents
        ctx.fillStyle = v.type === 'protein' ? C.protein : C.lipid;
        ctx.beginPath();
        ctx.arc(v.x, vY, 5, 0, Math.PI*2);
        ctx.fill();
        
        // Add modification tag (carbohydrate) if mature or maturing
        if (v.status === 'mature' || v.status === 'exporting' || v.status === 'exported' || (v.status === 'at-golgi' && p > 0.5)) {
           ctx.fillStyle = '#38bdf8'; // blue tag representing carbohydrate addition
           ctx.beginPath();
           ctx.arc(v.x + 4, vY - 4, 2.5, 0, Math.PI*2);
           ctx.fill();
           ctx.beginPath();
           ctx.arc(v.x + 6, vY - 1, 2.5, 0, Math.PI*2);
           ctx.fill();
        }
        
        // If hover or draggable
        if (v.status === 'transport') {
          SimDraw.drawPulse(ctx, v.x, vY, 14, '#ffffff', this._time);
        } else if (v.status === 'mature') {
          SimDraw.drawPulse(ctx, v.x, vY, 16, '#a3e635', this._time);
          this._drawLabel(ctx, 'Click to Export', v.x, vY - 15);
          
          ctx.save();
          ctx.setLineDash([4, 4]);
          SimDraw.drawArrow(ctx, v.x + 25, vY, ZONES.membrane.x - 25, ZONES.membrane.y, { color: '#a3e635', lineWidth: 2 });
          ctx.restore();
        }

        ctx.globalAlpha = 1;
      }
      
      // Draw processing animation inside Golgi (enzymatic sparks)
      if (v.status === 'at-golgi' && p > 0.1 && p < 0.9) {
         const sparkY = ZONES.golgi.y + Math.sin(p * Math.PI * 6) * 35; 
         SimDraw.drawPulse(ctx, v.x, sparkY, 6, '#38bdf8', this._time * 4);
         ctx.beginPath();
         ctx.arc(v.x, sparkY, 3, 0, Math.PI*2);
         ctx.fillStyle = '#ffffff';
         ctx.fill();
         
         // Secondary processing sparks
         const sparkY2 = ZONES.golgi.y + Math.cos(p * Math.PI * 4) * 25;
         ctx.beginPath();
         ctx.arc(v.x - 10, sparkY2, 2, 0, Math.PI*2);
         ctx.fillStyle = '#fcd34d';
         ctx.fill();
      }
    }
    
    // Exocytosis opening at membrane
    let anyExported = this._vesicles.some(v => v.status === 'exported' && v.x < ZONES.membrane.x + 30);
    if (anyExported) {
      // Draw an opening in the membrane
      ctx.beginPath();
      ctx.arc(ZONES.membrane.x, ZONES.membrane.y, 20, Math.PI/2, Math.PI*1.5);
      ctx.strokeStyle = C.membrane;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Draw Labels
    this._drawLabel(ctx, ZONES.nucleus.label, ZONES.nucleus.x, ZONES.nucleus.y - ZONES.nucleus.r - 10);
    this._drawLabel(ctx, ZONES.rer.label, ZONES.rer.x, ZONES.rer.y - ZONES.rer.h/2 - 10);
    this._drawLabel(ctx, ZONES.ser.label, ZONES.ser.x, ZONES.ser.y - ZONES.ser.h/2 - 10);
    this._drawLabel(ctx, ZONES.golgi.label, ZONES.golgi.x, ZONES.golgi.y - ZONES.golgi.h/2 - 10);

    // Interactive Highlights
    if (this._phase === 0) {
      SimDraw.drawPulse(ctx, ZONES.nucleus.x, ZONES.nucleus.y, ZONES.nucleus.r + 5, C.nucleus, this._time);
    } else if (this._phase === 2) {
      SimDraw.drawPulse(ctx, ZONES.ser.x, ZONES.ser.y, ZONES.ser.w/2 + 10, C.ser, this._time);
    }

    // Draw global prompt
    this._drawPrompt(ctx);
    
    // Draw Success Banner
    if (this._phase === 8) {
      const panelW = 420;
      const panelH = 120;
      ctx.save();
      SimDraw.drawPanel(ctx, CX - panelW/2, CY - panelH/2, panelW, panelH, {
        bg: 'rgba(15, 23, 42, 0.92)',
        stroke: '#10b981',
        lineWidth: 2,
        radius: 12
      });
      ctx.font = '700 24px Inter, system-ui';
      ctx.fillStyle = '#34d399';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("🎉 Manufacturing Complete!", CX, CY - 15);
      
      ctx.font = '500 14px Inter, system-ui';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText("The cell successfully processed and exported the products.", CX, CY + 20);
      ctx.restore();
    }
  }

  // --- Custom Drawing Functions ---

  drawCytoplasm(ctx) {
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.cytoplasm;
    ctx.fill();
  }

  _drawMembrane(ctx) {
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = C.memGlow;
    ctx.lineWidth = 14;
    ctx.stroke();
    
    // The crisp line
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX - 4, RY - 4, 0, 0, Math.PI * 2);
    ctx.strokeStyle = C.membrane;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  _drawNucleus(ctx, x, y, r) {
    SimDraw.drawGlow(ctx, x, y, r + 8, C.nucleusGlo, 0.55);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const gr = ctx.createRadialGradient(x - 15, y - 15, 5, x, y, r);
    gr.addColorStop(0, '#818cf8');
    gr.addColorStop(1, C.nucleus);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Nucleolus
    ctx.beginPath();
    ctx.arc(x + 10, y - 10, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#4f46e5';
    ctx.fill();
  }

  _drawRER(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = C.er;
    ctx.lineWidth = 3;
    
    // Draw wavy lines
    for (let row = -2; row <= 2; row++) {
      ctx.beginPath();
      const ys = y + row * 18;
      for (let dx = -w / 2; dx <= w / 2; dx += 5) {
        const wx = x + dx;
        const wy = ys + Math.sin(dx * 0.15 + this._time * 1.5) * 6;
        dx === -w / 2 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }
    
    // Draw ribosomes on RER
    ctx.fillStyle = C.ribosome;
    for (let row = -2; row <= 2; row++) {
      const ys = y + row * 18;
      for (let dx = -w / 2 + 10; dx < w / 2 - 10; dx += 12) {
        ctx.beginPath();
        ctx.arc(x + dx, ys - 16 + Math.sin(dx * 0.15 + this._time * 1.5) * 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawSER(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = C.ser;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    // Tube-like structure (Smooth ER)
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x - w/2 + 10, y + i * 15);
      ctx.lineTo(x + w/2 - 10, y + i * 15 + Math.sin(this._time*2 + i)*10);
      ctx.stroke();
    }
    // Cross links
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 15); ctx.lineTo(x, y);
    ctx.moveTo(x + 10, y); ctx.lineTo(x + 5, y + 15);
    ctx.stroke();
    
    ctx.restore();
  }

  _drawGolgi(ctx, x, y, w, h) {
    ctx.save();
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    // Stacked curved Golgi sacs
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      const hw = w / 2 - Math.abs(i) * 5;
      const arcH = 30;
      ctx.moveTo(x - hw, y + i * 16 - arcH);
      ctx.quadraticCurveTo(x, y + i * 16 + arcH, x + hw, y + i * 16 - arcH);
      
      const alpha = 1 - Math.abs(i) * 0.1;
      ctx.strokeStyle = C.golgi;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawMRNAAnim(ctx) {
    // mRNA traveling from Nucleus to RER
    const progress = this._animTime / 2.0; 
    if (progress > 1) return;
    
    const startX = ZONES.nucleus.x + 30;
    const startY = ZONES.nucleus.y;
    const endX = ZONES.rer.x - ZONES.rer.w/2 + 10;
    const endY = ZONES.rer.y;
    
    const currX = startX + (endX - startX) * progress;
    const currY = startY + (endY - startY) * progress + Math.sin(progress * Math.PI * 4) * 10;
    
    ctx.beginPath();
    ctx.moveTo(currX - 10, currY - 5);
    ctx.quadraticCurveTo(currX, currY + 10, currX + 10, currY - 5);
    ctx.strokeStyle = '#a3e635'; // distinct color for mRNA
    ctx.lineWidth = 2;
    ctx.stroke();

    SimDraw.drawGlow(ctx, currX, currY, 15, '#a3e635', 0.6);
  }
  
  _drawLipidAnim(ctx) {
    const progress = this._animTime / 1.5;
    if (progress > 1) return;
    
    ctx.globalAlpha = Math.sin(progress * Math.PI);
    ctx.beginPath();
    ctx.arc(ZONES.ser.x, ZONES.ser.y, 6, 0, Math.PI*2);
    ctx.fillStyle = C.lipid;
    ctx.fill();
    SimDraw.drawGlow(ctx, ZONES.ser.x, ZONES.ser.y, 15, C.lipid, 0.8);
    ctx.globalAlpha = 1.0;
  }

  _drawLabel(ctx, text, x, y) {
    SimDraw.drawLabel(ctx, text, x, y);
  }

  _drawPrompt(ctx) {
    ctx.save();
    ctx.font = '600 14px Inter, system-ui';
    const tw = ctx.measureText(this._prompt).width;
    ctx.beginPath();
    ctx.roundRect(CX - tw / 2 - 15, 20, tw + 30, 32, 8);
    ctx.fillStyle = 'rgba(15,23,42,0.9)';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._prompt, CX, 36);
    ctx.restore();
  }
}
