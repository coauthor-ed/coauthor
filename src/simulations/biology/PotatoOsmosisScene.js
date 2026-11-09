import { CanvasSimulation } from '../base/CanvasSimulation.js';
import { showAlert } from '../../ui/components/dialogs.js';

const W = 750;
const H = 450;

const COLORS = {
  bgSurface:    '#111827',
  benchTop:     '#1e293b',
  benchEdge:    '#0f172a',
  water:        'rgba(56, 189, 248, 0.4)',
  glucose:      'rgba(251, 191, 36, 0.4)',
  glass:        'rgba(255, 255, 255, 0.15)',
  glassGlow:    'rgba(255, 255, 255, 0.4)',
  potatoSkin:   '#78350f',
  potatoFlesh:  '#fef3c7',
  scaleBody:    '#334155',
  scalePlat:    '#94a3b8',
  textMain:     '#f8fafc',
  textDark:     '#0f172a',
  lcdBg:        '#bbf7d0',
  lcdText:      '#166534',
  ok:           '#34d399',
  err:          '#f87171'
};

const lerp = (a, b, t) => a + (b - a) * t;

export class PotatoOsmosisScene extends CanvasSimulation {
  static WIDTH  = W;
  static HEIGHT = H;

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;
    
    // UI state
    this.state = 'INIT'; // INIT, CUTTING, SOAKING, ADVANCING_TIME, MEASURING, DONE
    this._time = 0;
    
    // Potato pieces
    this.pieces = [
      { id: 'full', x: 200, y: 350, w: 100, h: 50, mass: '5.0', state: 'full', active: true, targetX: 200, targetY: 350 },
      { id: 'A', x: 200, y: 350, w: 48, h: 48, mass: 2.5, state: 'normal', active: false, targetX: 174, targetY: 350 },
      { id: 'B', x: 252, y: 350, w: 48, h: 48, mass: 2.5, state: 'normal', active: false, targetX: 226, targetY: 350 }
    ];
    
    // Beakers
    this.beakers = [
      { id: 'A', x: 450, y: 300, w: 100, h: 120, type: 'water', label: 'Beaker A (Water)' },
      { id: 'B', x: 600, y: 300, w: 100, h: 120, type: 'glucose', label: 'Beaker B (Salt)' }
    ];

    // Scale
    this.scale = { x: 100, y: 300, w: 140, h: 40, activeMass: 0, showMass: true };
    
    // Simulation state
    this.draggedPiece = null;
    this.hoveredPiece = null;
    this.particles = [];
    this.clockHours = 0;
    this.animatingTime = false;
    this.knifeAlpha = 0;
    
    // Bind event handlers
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp   = this._handlePointerUp.bind(this);
  }

  async setup() {
    this._buildDom();
    await super.setup();
    this._stageEl.appendChild(this._canvas);
    
    this._canvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:10px;cursor:default;';
    this._canvas.addEventListener('pointerdown', this._onPointerDown);
    this._canvas.addEventListener('pointermove', this._onPointerMove);
    this._canvas.addEventListener('pointerup', this._onPointerUp);
    this._canvas.addEventListener('pointerleave', this._onPointerUp);
    
    this._updateUI();
  }

  destroy() {
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onPointerDown);
      this._canvas.removeEventListener('pointermove', this._onPointerMove);
      this._canvas.removeEventListener('pointerup', this._onPointerUp);
      this._canvas.removeEventListener('pointerleave', this._onPointerUp);
    }
    if (this._rootEl) { this._rootEl.remove(); this._rootEl = null; }
    super.destroy();
  }

  _buildDom() {
    const style = document.createElement('style');
    style.textContent = `
      .po-root { width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 9px; font-family: Inter, system-ui, sans-serif; color: var(--text-main, #1e293b); }
      .po-controls { display: flex; gap: 10px; padding: 10px; background: var(--bg-panel, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; justify-content: center; align-items: center; }
      .po-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); background: var(--bg-surface, #ffffff); color: var(--text-main, #334155); cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; }
      .po-btn:hover { background: var(--bg-panel, #f1f5f9); }
      .po-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .po-btn.primary { background: var(--primary-color, #3b82f6); border-color: var(--primary-color, #3b82f6); color: var(--on-primary, white); }
      .po-btn.primary:hover { filter: brightness(1.1); }
      .po-stage { position: relative; width: 100%; }
      .po-status { padding: 12px; background: var(--bg-panel, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; text-align: center; font-weight: 500; font-size: 15px; color: var(--text-muted, #64748b); }
      .po-status strong { color: var(--text-main, #0f172a); font-weight: 700; }
      .po-table { width: 100%; margin-top: 10px; border-collapse: collapse; display: none; }
      .po-table.visible { display: table; }
      .po-table th, .po-table td { padding: 8px 12px; border: 1px solid var(--border-color, #cbd5e1); text-align: center; font-size: 14px; color: var(--text-main, #334155); }
      .po-table th { background: var(--bg-panel, #f1f5f9); color: var(--text-muted, #475569); font-weight: 600; }
    `;

    const root = document.createElement('div');
    root.className = 'po-root';
    root.appendChild(style);

    const controls = document.createElement('div');
    controls.className = 'po-controls';
    
    this.btnCut = document.createElement('button');
    this.btnCut.className = 'po-btn primary';
    this.btnCut.textContent = '🔪 Cut Potato';
    this.btnCut.onclick = () => this._cutPotato();
    
    this.btnAdvance = document.createElement('button');
    this.btnAdvance.className = 'po-btn';
    this.btnAdvance.textContent = '⏱ Advance 1 Hour';
    this.btnAdvance.onclick = () => this._advanceTime();
    this.btnAdvance.style.display = 'none';

    this.btnReset = document.createElement('button');
    this.btnReset.className = 'po-btn';
    this.btnReset.textContent = '↻ Reset Experiment';
    this.btnReset.onclick = () => this._reset();
    
    controls.appendChild(this.btnCut);
    controls.appendChild(this.btnAdvance);
    controls.appendChild(this.btnReset);

    const stage = document.createElement('div');
    stage.className = 'po-stage';

    this.statusLine = document.createElement('div');
    this.statusLine.className = 'po-status';
    this.statusLine.innerHTML = '<strong>Step 1:</strong> Cut the potato to get two equal pieces.';
    
    this.dataTable = document.createElement('table');
    this.dataTable.className = 'po-table';
    this.dataTable.innerHTML = `
      <thead>
        <tr>
          <th>Sample</th>
          <th>Environment</th>
          <th>Initial Mass (g)</th>
          <th>Final Mass (g)</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Piece A</td>
          <td>Water (Hypotonic)</td>
          <td>2.5</td>
          <td id="mass-a-final">-</td>
          <td id="mass-a-change">-</td>
        </tr>
        <tr>
          <td>Piece B</td>
          <td>Salt (Hypertonic)</td>
          <td>2.5</td>
          <td id="mass-b-final">-</td>
          <td id="mass-b-change">-</td>
        </tr>
      </tbody>
    `;

    root.appendChild(this.statusLine);
    root.appendChild(stage);
    root.appendChild(controls);
    root.appendChild(this.dataTable);
    this.container.appendChild(root);

    this._rootEl = root;
    this._stageEl = stage;
  }

  _updateUI() {
    if (this.state === 'INIT') {
      this.btnCut.style.display = 'block';
      this.btnAdvance.style.display = 'none';
      this.dataTable.classList.remove('visible');
      this.statusLine.innerHTML = '<strong>Step 1:</strong> Cut the potato into two equal 2.5g pieces.';
    } else if (this.state === 'SOAKING') {
      this.btnCut.style.display = 'none';
      this.btnAdvance.style.display = 'block';
      this.statusLine.innerHTML = '<strong>Step 2:</strong> Drag pieces into the beakers, then advance time.';
    } else if (this.state === 'ADVANCING_TIME') {
      this.btnAdvance.disabled = true;
      this.statusLine.innerHTML = '<strong>Waiting:</strong> 1 hour is passing... osmosis is occurring.';
    } else if (this.state === 'MEASURING') {
      this.btnAdvance.style.display = 'none';
      this.dataTable.classList.add('visible');
      this.statusLine.innerHTML = '<strong>Step 3:</strong> Drag pieces back to the scale to measure final mass.';
    }
  }

  _cutPotato() {
    if (this.state !== 'INIT') return;
    this.state = 'CUTTING';
    this.btnCut.disabled = true;
    this.cutProgress = 0;
    
    // Animate knife and cutting
    const interval = setInterval(() => {
      this.cutProgress += 0.05;
      if (this.cutProgress >= 1) {
        clearInterval(interval);
        this.pieces[0].active = false;
        this.pieces[1].active = true;
        this.pieces[1].x = this.pieces[0].x - 16;
        this.pieces[2].active = true;
        this.pieces[2].x = this.pieces[0].x + 16;
        
        let splitProgress = 0;
        const splitInterval = setInterval(() => {
          splitProgress += 0.1;
          this.pieces[1].x -= 1;
          this.pieces[2].x += 1;
          if (splitProgress >= 1) {
            clearInterval(splitInterval);
            this.state = 'SOAKING';
            this.btnCut.disabled = false;
            this._updateUI();
          }
        }, 30);
      }
    }, 30);
  }

  async _advanceTime() {
    if (this.state !== 'SOAKING') return;
    
    const pA = this._isInBeaker(this.pieces[1], this.beakers[0]) ? this.pieces[1] : (this._isInBeaker(this.pieces[2], this.beakers[0]) ? this.pieces[2] : null);
    const pB = this._isInBeaker(this.pieces[1], this.beakers[1]) ? this.pieces[1] : (this._isInBeaker(this.pieces[2], this.beakers[1]) ? this.pieces[2] : null);
    
    if (!pA || !pB) {
      await showAlert("Place both potato pieces into the beakers first!", "Action Required");
      return;
    }

    this.pieceInWater = pA;
    this.pieceInGlucose = pB;
    this.pieceInWater.environment = 'water';
    this.pieceInGlucose.environment = 'glucose';

    this.state = 'ADVANCING_TIME';
    this.animatingTime = true;
    this._updateUI();

    let steps = 0;
    const interval = setInterval(() => {
      steps++;
      this.clockHours = steps / 30; // animate over ~1 second (30 frames)
      
      // Spawn particles
      if (steps % 3 === 0) {
        this._spawnOsmosisParticles();
      }

      // Update potato sizes
      this.pieceInWater.w = lerp(48, 56, this.clockHours);
      this.pieceInWater.h = lerp(48, 56, this.clockHours);
      
      this.pieceInGlucose.w = lerp(48, 40, this.clockHours);
      this.pieceInGlucose.h = lerp(48, 40, this.clockHours);

      if (steps >= 30) {
        clearInterval(interval);
        this.clockHours = 1;
        this.animatingTime = false;
        this.state = 'MEASURING';
        this.pieceInWater.mass = 2.8;
        this.pieceInGlucose.mass = 2.1;
        this._updateUI();
      }
    }, 33);
  }

  _reset() {
    this.state = 'INIT';
    this.clockHours = 0;
    this.pieces = [
      { id: 'full', x: 200, y: 350, w: 100, h: 50, mass: 5.0, state: 'full', active: true },
      { id: 'A', x: 200, y: 350, w: 48, h: 48, mass: 2.5, state: 'normal', active: false },
      { id: 'B', x: 252, y: 350, w: 48, h: 48, mass: 2.5, state: 'normal', active: false }
    ];
    this.particles = [];
    this._rootEl.querySelector('#mass-a-final').textContent = '-';
    this._rootEl.querySelector('#mass-a-change').textContent = '-';
    this._rootEl.querySelector('#mass-b-final').textContent = '-';
    this._rootEl.querySelector('#mass-b-change').textContent = '-';
    this.btnAdvance.disabled = false;
    this._updateUI();
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  _handlePointerDown(e) {
    if (this.state === 'ADVANCING_TIME' || this.state === 'CUTTING') return;
    const rect = this._canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top)  * (H / rect.height);
    
    // Hit test active pieces
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (p.active && Math.abs(x - p.x) < p.w/2 && Math.abs(y - p.y) < p.h/2) {
        this.draggedPiece = p;
        this.dragOffsetX = p.x - x;
        this.dragOffsetY = p.y - y;
        this._canvas.style.cursor = 'grabbing';
        break;
      }
    }
  }

  _handlePointerMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top)  * (H / rect.height);

    if (this.draggedPiece) {
      this.draggedPiece.x = x + this.dragOffsetX;
      this.draggedPiece.y = y + this.dragOffsetY;
      
      // Update scale active mass if hovering over it
      if (Math.abs(this.draggedPiece.x - this.scale.x) < this.scale.w/2 && 
          Math.abs(this.draggedPiece.y - this.scale.y) < 60) {
        this.scale.activeMass = this.draggedPiece.mass;
      } else {
        this.scale.activeMass = 0;
      }
    } else {
      // Hover detection
      let hovered = null;
      for (const p of this.pieces) {
        if (p.active && Math.abs(x - p.x) < p.w/2 && Math.abs(y - p.y) < p.h/2) {
          hovered = p;
          break;
        }
      }
      if (hovered !== this.hoveredPiece) {
        this.hoveredPiece = hovered;
        this._canvas.style.cursor = hovered ? 'grab' : 'default';
      }
    }
  }

  _handlePointerUp(e) {
    if (this.draggedPiece) {
      // Check drop targets
      const p = this.draggedPiece;
      
      // Drop in Beaker A
      if (this._isInBeaker(p, this.beakers[0])) {
        p.x = this.beakers[0].x;
        p.y = this.beakers[0].y + 20;
      } 
      // Drop in Beaker B
      else if (this._isInBeaker(p, this.beakers[1])) {
        p.x = this.beakers[1].x;
        p.y = this.beakers[1].y + 20;
      }
      // Drop on Scale
      else if (Math.abs(p.x - this.scale.x) < this.scale.w/2 && Math.abs(p.y - this.scale.y) < 60) {
        p.x = this.scale.x;
        p.y = this.scale.y - 15;
        this.scale.activeMass = p.mass;
        if (this.state === 'MEASURING') {
          this._recordData(p);
          setTimeout(() => {
             p.targetX = p.x + 80;
             p.targetY = 350;
             p.autoMove = true;
             this.scale.activeMass = 0;
          }, 800);
        }
      } else {
        // Drop on bench
        p.y = 350;
      }
      
      this.draggedPiece = null;
      this._canvas.style.cursor = this.hoveredPiece ? 'grab' : 'default';
    }
  }

  _isInBeaker(piece, beaker) {
    return Math.abs(piece.x - beaker.x) < beaker.w/2 && Math.abs(piece.y - beaker.y) < beaker.h;
  }

  _recordData(piece) {
    if (piece.environment === 'water') {
      this._rootEl.querySelector('#mass-a-final').textContent = '2.8';
      this._rootEl.querySelector('#mass-a-change').textContent = '+0.3g (Swollen)';
      this._rootEl.querySelector('#mass-a-change').style.color = '#34d399';
    } else if (piece.environment === 'glucose') {
      this._rootEl.querySelector('#mass-b-final').textContent = '2.1';
      this._rootEl.querySelector('#mass-b-change').textContent = '-0.4g (Shrunken)';
      this._rootEl.querySelector('#mass-b-change').style.color = '#f87171';
    }
  }

  _spawnOsmosisParticles() {
    // Beaker A (Water enters potato)
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: this.beakers[0].x + (Math.random() - 0.5) * 60,
        y: this.beakers[0].y + (Math.random() - 0.5) * 60,
        tx: this.beakers[0].x,
        ty: this.beakers[0].y + 20,
        color: COLORS.water,
        life: 1,
        maxLife: 1
      });
    }
    // Beaker B (Water leaves potato)
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: this.beakers[1].x,
        y: this.beakers[1].y + 20,
        tx: this.beakers[1].x + (Math.random() - 0.5) * 80,
        ty: this.beakers[1].y + (Math.random() - 0.5) * 80,
        color: COLORS.water,
        life: 1,
        maxLife: 1
      });
    }
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  _tick(ctx, dt) {
    this._time += dt;

    ctx.clearRect(0, 0, W, H);
    
    // Background (Lab Wall)
    let wallGrad = ctx.createLinearGradient(0, 0, 0, H/2 + 20);
    wallGrad.addColorStop(0, '#0f172a');
    wallGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, W, H/2 + 20);
    
    // Bench top
    let benchGrad = ctx.createLinearGradient(0, H/2 + 20, 0, H - 20);
    benchGrad.addColorStop(0, '#334155');
    benchGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = benchGrad;
    ctx.fillRect(0, H/2 + 20, W, H/2 - 40);
    
    // Bench Edge
    let edgeGrad = ctx.createLinearGradient(0, H - 20, 0, H);
    edgeGrad.addColorStop(0, '#475569');
    edgeGrad.addColorStop(0.2, '#334155');
    edgeGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, H - 20, W, 20);


    // Draw Beakers
    for (const b of this.beakers) {
      this._drawBeaker(ctx, b);
    }
    
    // Draw Scale
    this._drawScale(ctx);
    
    // Draw Particles
    this._drawParticles(ctx, dt);
    
    // Draw Potato pieces
    for (const p of this.pieces) {
      if (p.active) {
        if (p.autoMove) {
          p.x += (p.targetX - p.x) * 0.1;
          p.y += (p.targetY - p.y) * 0.1;
          if (Math.abs(p.x - p.targetX) < 1 && Math.abs(p.y - p.targetY) < 1) p.autoMove = false;
        }
        this._drawPotato(ctx, p);
      }
    }
    
    // Draw Knife (if cutting)
    if (this.state === 'CUTTING' && this.cutProgress < 1) {
      ctx.save();
      let knifeY = 150 + this.cutProgress * 150;
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(this.pieces[0].x - 2, knifeY, 4, 150); // blade
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(this.pieces[0].x - 4, knifeY - 50, 8, 50); // handle
      
      // reflection on blade
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(this.pieces[0].x - 2, knifeY);
      ctx.lineTo(this.pieces[0].x, knifeY + 20);
      ctx.lineTo(this.pieces[0].x, knifeY + 150);
      ctx.lineTo(this.pieces[0].x - 2, knifeY + 150);
      ctx.fill();
      ctx.restore();
    }
    
    // Draw Clock
    this._drawClock(ctx);
  }

  _drawBeaker(ctx, b) {
    ctx.save();
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + b.h/2 + 2, b.w/2 + 4, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Liquid
    let liqGrad = ctx.createLinearGradient(b.x - b.w/2, 0, b.x + b.w/2, 0);
    if (b.type === 'water') {
      liqGrad.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
      liqGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.4)');
      liqGrad.addColorStop(1, 'rgba(56, 189, 248, 0.2)');
    } else {
      liqGrad.addColorStop(0, 'rgba(251, 191, 36, 0.2)');
      liqGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.4)');
      liqGrad.addColorStop(1, 'rgba(251, 191, 36, 0.2)');
    }
    ctx.fillStyle = liqGrad;
    ctx.fillRect(b.x - b.w/2 + 4, b.y - b.h/2 + 20, b.w - 8, b.h - 24);
    
    // Liquid top surface
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - b.h/2 + 20, (b.w - 8)/2, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = b.type === 'water' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(251, 191, 36, 0.5)';
    ctx.fill();

    // Glass body
    ctx.strokeStyle = COLORS.glass;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - b.w/2, b.y - b.h/2);
    ctx.lineTo(b.x - b.w/2, b.y + b.h/2);
    ctx.lineTo(b.x + b.w/2, b.y + b.h/2);
    ctx.lineTo(b.x + b.w/2, b.y - b.h/2);
    ctx.stroke();
    
    // Glass rim
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - b.h/2, b.w/2, 8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Highlight
    ctx.strokeStyle = COLORS.glassGlow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - b.w/2 + 6, b.y - b.h/2 + 10);
    ctx.lineTo(b.x - b.w/2 + 6, b.y + b.h/2 - 10);
    ctx.stroke();
    
    // Label
    ctx.fillStyle = COLORS.textMain;
    ctx.font = '600 13px Inter';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(b.label, b.x, b.y + b.h/2 + 24);
    ctx.shadowColor = 'transparent';
    
    ctx.restore();
  }

  _drawScale(ctx) {
    ctx.save();
    
    // Scale Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(this.scale.x, this.scale.y + 40, this.scale.w/2, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    let bodyGrad = ctx.createLinearGradient(0, this.scale.y, 0, this.scale.y + 40);
    bodyGrad.addColorStop(0, '#475569');
    bodyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(this.scale.x - this.scale.w/2 + 10, this.scale.y + 10, this.scale.w - 20, 30, 4);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Platform support
    ctx.fillStyle = '#64748b';
    ctx.fillRect(this.scale.x - 15, this.scale.y, 30, 10);

    // Platform
    let platGrad = ctx.createLinearGradient(0, this.scale.y - 4, 0, this.scale.y + 4);
    platGrad.addColorStop(0, '#e2e8f0');
    platGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = platGrad;
    ctx.beginPath();
    ctx.roundRect(this.scale.x - this.scale.w/2, this.scale.y - 4, this.scale.w, 8, 4);
    ctx.fill();
    
    // LCD Screen
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(this.scale.x - 32, this.scale.y + 17, 64, 18);
    ctx.fillStyle = COLORS.lcdBg;
    ctx.fillRect(this.scale.x - 30, this.scale.y + 19, 60, 14);
    
    ctx.fillStyle = COLORS.lcdText;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    let massStr = this.scale.activeMass === 0 ? '0.00' : this.scale.activeMass.toFixed(2);
    ctx.fillText(massStr + 'g', this.scale.x + 28, this.scale.y + 30);
    
    ctx.restore();
  }

  _drawPotato(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, p.h/2 + (p.id === 'full' ? 8 : 4), p.w/2 + 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle breathing animation when soaking
    let s = 1;
    if (this.state === 'ADVANCING_TIME' && this._isInBeaker(p, this.beakers[0])) {
      s = 1 + 0.02 * Math.sin(this._time * 10); // swelling
    } else if (this.state === 'ADVANCING_TIME' && this._isInBeaker(p, this.beakers[1])) {
      s = 1 - 0.02 * Math.sin(this._time * 10); // shrinking
    }
    ctx.scale(s, s);

    // Skin
    let skinGrad = ctx.createRadialGradient(-10, -10, 5, 0, 0, Math.max(p.w, p.h));
    skinGrad.addColorStop(0, '#d9a05b'); // lighter tan highlight
    skinGrad.addColorStop(0.6, '#a87139'); // base brown
    skinGrad.addColorStop(1, '#663c14'); // dark brown shadow
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.roundRect(-p.w/2, -p.h/2, p.w, p.h, 15);
    ctx.fill();
    
    // Dimples on skin (eyes)
    if (p.id === 'full' || p.id === 'A' || p.id === 'B') {
        ctx.fillStyle = 'rgba(74, 40, 16, 0.5)';
        let dx1 = p.id === 'B' ? 5 : -15;
        let dx2 = p.id === 'B' ? -5 : 10;
        ctx.beginPath(); ctx.ellipse(dx1, -8, 3, 2, 0.2, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = 'rgba(217, 160, 91, 0.3)';
        ctx.beginPath(); ctx.ellipse(dx1-1, -9, 2, 1, 0.2, 0, Math.PI*2); ctx.fill(); // highlight on dimple
        
        ctx.fillStyle = 'rgba(74, 40, 16, 0.5)';
        ctx.beginPath(); ctx.ellipse(dx2, 12, 2.5, 1.5, -0.4, 0, Math.PI*2); ctx.fill();
    }

    // Flesh
    let fleshGrad = ctx.createLinearGradient(-p.w/2, -p.h/2, p.w/2, p.h/2);
    fleshGrad.addColorStop(0, '#fef9c3'); // pale yellow
    fleshGrad.addColorStop(1, '#fde047'); // slightly warmer yellow
    ctx.fillStyle = fleshGrad;
    
    if (p.id === 'full') {
      // Just full skin for the full potato
    } else {
      // Cut piece: show flesh on one side
      ctx.beginPath();
      // Adjust cut side to look sharper
      if (p.id === 'B') {
        ctx.roundRect(-p.w/2 + 6, -p.h/2 + 1, p.w - 7, p.h - 2, 4);
      } else {
        ctx.roundRect(-p.w/2 + 1, -p.h/2 + 1, p.w - 7, p.h - 2, 4);
      }
      ctx.fill();
      
      // Flesh texture dots for a starchy look
      ctx.fillStyle = '#ca8a04';
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < 8; i++) {
        let dx = -p.w/2 + 12 + (i * 17) % (p.w - 18);
        let dy = -p.h/2 + 8 + (i * 11) % (p.h - 16);
        ctx.beginPath();
        ctx.arc(dx, dy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // Outline the cut edge slightly for depth
      ctx.strokeStyle = 'rgba(168, 113, 57, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (p.id === 'B') {
        ctx.moveTo(-p.w/2 + 6, -p.h/2 + 4);
        ctx.lineTo(-p.w/2 + 6, p.h/2 - 4);
      } else {
        ctx.moveTo(p.w/2 - 6, -p.h/2 + 4);
        ctx.lineTo(p.w/2 - 6, p.h/2 - 4);
      }
      ctx.stroke();
    }
    
    // Label if soaking
    if (this.state === 'MEASURING' && p.id !== 'full') {
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(p.environment === 'water' ? 'Water' : 'Salt', 0, 5);
    }
    
    ctx.restore();
  }

  _drawClock(ctx) {
    ctx.save();
    ctx.translate(650, 100);
    
    // Clock body
    ctx.fillStyle = COLORS.scaleBody;
    ctx.beginPath();
    ctx.roundRect(-50, -25, 100, 50, 8);
    ctx.fill();
    
    // Clock face
    ctx.fillStyle = COLORS.textDark;
    ctx.fillRect(-45, -20, 90, 40);
    
    ctx.fillStyle = COLORS.err;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    
    let mins = Math.floor(this.clockHours * 60);
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    
    let display = `0${h}:${m.toString().padStart(2, '0')}`;
    ctx.fillText(display, 0, 8);
    
    ctx.restore();
  }

  _drawParticles(ctx, dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let p = this.particles[i];
      p.life -= dt * 1.5;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      
      let t = 1 - p.life / p.maxLife;
      let px = lerp(p.x, p.tx, t);
      let py = lerp(p.y, p.ty, t);
      
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
