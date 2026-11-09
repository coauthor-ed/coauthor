import { CanvasSimulation } from '../base/CanvasSimulation.js';

export class LegoAnimationScene extends CanvasSimulation {
  static WIDTH = 650;
  static HEIGHT = 350;

  constructor(container, config) {
    super(container, config);
    this.allowResume = true;
    this.phase = 0;
    this.blocks = [];
    this.collisions = 0;
    this.boxShake = 0;
    this.castleOpacity = 0;
  }

  async setup() {
    await super.setup();
    
    // Make container relative for absolute positioning of overlay
    this.container.style.position = 'relative';
    
    // Create UI Overlay
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      box-sizing: border-box;
    `;
    this.container.appendChild(this.overlay);
    
    // Text Panel
    this.textPanel = document.createElement('div');
    this.textPanel.style.cssText = `
      background: rgba(255, 255, 255, 0.9);
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      font-weight: bold;
      font-size: 16px;
      line-height: 1.5;
      word-wrap: break-word;
      text-align: center;
      pointer-events: auto;
      max-width: 90%;
      color: #333;
      transition: all 0.3s ease;
    `;
    this.overlay.appendChild(this.textPanel);
    
    // Button Panel
    this.buttonPanel = document.createElement('div');
    this.buttonPanel.style.cssText = 'pointer-events: auto; margin-bottom: 20px;';
    this.overlay.appendChild(this.buttonPanel);
    
    this.shakeBtn = document.createElement('button');
    this.shakeBtn.textContent = 'Shake the Box';
    this.shakeBtn.style.cssText = `
      padding: 12px 24px;
      font-size: 16px;
      cursor: pointer;
      border: none;
      border-radius: 6px;
      background: #007bff;
      color: white;
      font-weight: bold;
      box-shadow: 0 4px 6px rgba(0,123,255,0.3);
      transition: transform 0.1s, background 0.2s;
    `;
    this.shakeBtn.onmousedown = () => { this.shakeBtn.style.transform = 'scale(0.95)'; };
    this.shakeBtn.onmouseup = () => { this.shakeBtn.style.transform = 'scale(1)'; };
    this.shakeBtn.onmouseleave = () => { this.shakeBtn.style.transform = 'scale(1)'; };
    this.shakeBtn.addEventListener('click', () => this.nextPhase());
    this.buttonPanel.appendChild(this.shakeBtn);
    
    // Counter Panel
    this.counterPanel = document.createElement('div');
    this.counterPanel.style.cssText = `
      position: absolute;
      top: 80px; right: 20px;
      background: rgba(0, 0, 0, 0.4);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 14px;
      display: none;
    `;
    this.overlay.appendChild(this.counterPanel);
    
    // Initialize LEGO-like blocks based on biological atomic abundance (CHONPS)
    const types = [
      { id: 'H', color: '#f4f4f4', textColor: '#333', count: 31 },
      { id: 'O', color: '#ff4136', textColor: '#fff', count: 12 },
      { id: 'C', color: '#333333', textColor: '#fff', count: 6 },
      { id: 'N', color: '#0074d9', textColor: '#fff', count: 1 },
      { id: 'P', color: '#ff851b', textColor: '#fff', count: 1 },
      { id: 'S', color: '#ffdc00', textColor: '#333', count: 1 }
    ];
    
    const W = LegoAnimationScene.WIDTH;
    for (const t of types) {
      for (let i = 0; i < t.count; i++) {
        this.blocks.push({
          type: t.id,
          color: t.color,
          textColor: t.textColor,
          x: Math.random() * (W - 60) + 30,
          y: -Math.random() * 300 - 50, // Start above the canvas and fall in
          vx: (Math.random() - 0.5) * 50,
          vy: Math.random() * 50,
          size: 24,
          angle: Math.random() * Math.PI * 2,
          omega: (Math.random() - 0.5) * 10
        });
      }
    }
    
    this.setPhase(0);
    this._drawInitialFrame(this._ctx);
  }

  setPhase(p) {
    this.phase = p;
    this.shakeBtn.style.display = 'none';
    
    switch (p) {
      case 0:
        this.textPanel.textContent = "Here are the atoms found in every living organism";
        this.counterPanel.style.display = 'none';
        // Show shake button after blocks fall
        setTimeout(() => {
          if (this.phase === 0) this.shakeBtn.style.display = 'block';
        }, 2500);
        break;
      case 1:
        this.textPanel.textContent = "The pieces collide thousands of times…";
        this.counterPanel.style.display = 'block';
        
        // Blast the blocks around
        for (const b of this.blocks) {
          b.vx = (Math.random() - 0.5) * 1200;
          b.vy = (Math.random() - 0.5) * 1200;
          b.omega = (Math.random() - 0.5) * 40;
        }
        
        // Progress to next phase automatically
        setTimeout(() => {
          if (this.phase === 1) this.setPhase(2);
        }, 3500);
        break;
      case 2:
        this.textPanel.textContent = "…but they won't assemble into a castle";
        this.counterPanel.style.display = 'block';
        
        // Keep them moving quickly but maybe a bit less chaotic
        setTimeout(() => {
          if (this.phase === 2) this.setPhase(3);
        }, 4000);
        break;
      case 3:
        this.textPanel.textContent = "Having the right ingredients isn't enough. They must be organised.";
        this.counterPanel.style.display = 'none';
        
        // Freeze blocks
        for (const b of this.blocks) {
          b.vx = 0;
          b.vy = 0;
          b.omega = 0;
        }
        // Highlight text (visual change)
        this.textPanel.style.background = '#ffd700';
        this.textPanel.style.boxShadow = '0 0 15px rgba(255,215,0,0.6)';
        break;
    }
  }

  nextPhase() {
    if (this.phase === 0) {
      this.setPhase(1);
    }
  }

  _tick(ctx, dt) {
    const W = LegoAnimationScene.WIDTH;
    const H = LegoAnimationScene.HEIGHT;
    
    // Background fill to clear trail
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, W, H);
    
    // Calculate shake
    let offsetX = 0;
    let offsetY = 0;
    if (this.phase === 1 || this.phase === 2) {
      this.boxShake += dt * 60;
      offsetX = Math.sin(this.boxShake * 1.3) * 6;
      offsetY = Math.cos(this.boxShake * 1.7) * 6;
    }
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    // Draw the "box" container
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    
    // Draw Ghost Castle
    if (this.phase >= 2) {
      if (this.phase === 2 && this.castleOpacity < 1) {
        this.castleOpacity = Math.min(1, this.castleOpacity + dt * 0.8);
      } else if (this.phase === 3 && this.castleOpacity > 0) {
        this.castleOpacity = Math.max(0, this.castleOpacity - dt * 0.5);
      }
      
      if (this.castleOpacity > 0) {
        ctx.globalAlpha = this.castleOpacity * 0.25;
        ctx.fillStyle = '#333';
        
        const cx = W / 2;
        const cy = H / 2 + 30;
        
        // Simple castle silhouette
        ctx.beginPath();
        // Base
        ctx.rect(cx - 70, cy - 20, 140, 80);
        // Left tower
        ctx.rect(cx - 90, cy - 80, 40, 140);
        // Right tower
        ctx.rect(cx + 50, cy - 80, 40, 140);
        // Door
        ctx.rect(cx - 20, cy + 20, 40, 40);
        ctx.fill();
        
        // Crenellations
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          ctx.rect(cx - 90 + i * 16, cy - 90, 8, 10);
          ctx.rect(cx + 50 + i * 16, cy - 90, 8, 10);
          ctx.rect(cx - 60 + i * 20, cy - 30, 10, 10);
        }
        ctx.fill();
        
        ctx.globalAlpha = 1.0;
      }
    }
    
    // Physics parameters
    const gravity = this.phase === 0 ? 800 : 0;
    const damping = this.phase === 0 ? 0.98 : 1.0;
    const margin = 10;
    
    // Update and draw blocks
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      
      if (this.phase < 3) {
        b.vy += gravity * dt;
        
        // Random jiggle when shaking to simulate high energy
        if (this.phase === 1 || this.phase === 2) {
          b.vx += (Math.random() - 0.5) * 200 * dt;
          b.vy += (Math.random() - 0.5) * 200 * dt;
          // Soft speed cap
          const speed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
          if (speed > 800) {
            b.vx = (b.vx / speed) * 800;
            b.vy = (b.vy / speed) * 800;
          }
        }
        
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.omega * dt;
        
        b.vx *= damping;
        b.vy *= damping;
        b.omega *= damping;
        
        // Boundary collisions
        const halfSize = b.size / 2;
        if (b.x < margin + halfSize) { 
          b.x = margin + halfSize; 
          b.vx *= -1; 
          if (this.phase > 0) this.collisions++; 
        }
        if (b.x > W - margin - halfSize) { 
          b.x = W - margin - halfSize; 
          b.vx *= -1; 
          if (this.phase > 0) this.collisions++; 
        }
        // Floor
        if (b.y > H - margin - halfSize) { 
          b.y = H - margin - halfSize; 
          b.vy *= -0.6; // less bouncy on floor
          if (this.phase > 0) this.collisions++; 
        }
        // Ceiling
        if (b.y < margin + halfSize && this.phase > 0) { 
          b.y = margin + halfSize; 
          b.vy *= -1; 
          if (this.phase > 0) this.collisions++; 
        }
        
        // Fast approximate block-block collisions using bounding circles
        for (let j = i + 1; j < this.blocks.length; j++) {
          const b2 = this.blocks[j];
          const dx = b2.x - b.x;
          const dy = b2.y - b.y;
          const distSq = dx*dx + dy*dy;
          
          // Size * 1.2 to roughly bound a square
          const r = b.size * 0.6; 
          const minDist = r + r;
          
          if (distSq < minDist*minDist && distSq > 0.1) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            
            // Separation
            const overlap = minDist - dist;
            b.x -= nx * overlap * 0.5;
            b.y -= ny * overlap * 0.5;
            b2.x += nx * overlap * 0.5;
            b2.y += ny * overlap * 0.5;
            
            // Velocity bounce
            const dvx = b2.vx - b.vx;
            const dvy = b2.vy - b.vy;
            const dot = dvx * nx + dvy * ny;
            
            if (dot < 0) { // moving towards each other
              const e = this.phase > 0 ? 1.0 : 0.3; // bouncy when shaking, sticky when falling
              const impulse = -(1 + e) * dot / 2;
              
              b.vx -= impulse * nx;
              b.vy -= impulse * ny;
              b2.vx += impulse * nx;
              b2.vy += impulse * ny;
              
              if (this.phase > 0) this.collisions++;
            }
          }
        }
      }
      
      // Draw the block
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      
      const s = b.size / 2;
      const bev = b.size * 0.15; // bevel thickness
      
      // Block base
      ctx.fillStyle = b.color;
      ctx.fillRect(-s, -s, b.size, b.size);
      
      // Top/Left highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, -s); ctx.lineTo(s-bev, -s+bev); ctx.lineTo(-s+bev, -s+bev); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(-s, s); ctx.lineTo(-s+bev, s-bev); ctx.lineTo(-s+bev, -s+bev); ctx.fill();
      
      // Bottom/Right shadows
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath(); ctx.moveTo(-s, s); ctx.lineTo(s, s); ctx.lineTo(s-bev, s-bev); ctx.lineTo(-s+bev, s-bev); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s, -s); ctx.lineTo(s, s); ctx.lineTo(s-bev, s-bev); ctx.lineTo(s-bev, -s+bev); ctx.fill();
      
      // Outline
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s, -s, b.size, b.size);
      
      // Lego Pip
      const pipR = b.size * 0.32;
      
      // Pip shadow offset
      ctx.beginPath();
      ctx.arc(bev*0.5, bev*0.5, pipR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fill();
      
      // Pip base
      ctx.beginPath();
      ctx.arc(0, 0, pipR, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.stroke();
      
      // Pip highlight
      ctx.beginPath();
      ctx.arc(-bev*0.4, -bev*0.4, pipR * 0.8, Math.PI * 0.8, Math.PI * 1.8);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Element Symbol (stamped on the pip like the Lego logo)
      ctx.fillStyle = b.textColor;
      ctx.font = `bold ${b.size * 0.45}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.type, 0, 0);
      
      ctx.restore();
    }
    
    ctx.restore();
    
    // Update UI Counter
    if (this.phase === 1 || this.phase === 2) {
      // Add commas to number
      this.counterPanel.textContent = `Collisions: ${this.collisions.toLocaleString()}`;
    }
  }

  _drawInitialFrame(ctx) {
    this._tick(ctx, 0);
  }

  destroy() {
    if (this.overlay) {
      this.overlay.remove();
    }
    super.destroy();
  }
}
