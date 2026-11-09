import { ParticleSimulation } from '../base/ParticleSimulation.js';

export class ChemistryCollisionScene extends ParticleSimulation {
  static WIDTH = 650;
  static HEIGHT = 350;
  static BOUNDARY = 'bounce';
  
  static CONTROLS = [
    { type: 'button', id: 'reset', label: 'Reset Ocean' },
    { type: 'slider', id: 'temperature', label: 'Temperature (Speed)', hint: 'Adjust the temperature to observe the formation of stable molecules', min: 1, max: 100, value: 30, trackGradient: 'linear-gradient(to right, #38bdf8 0%, #4ade80 50%, #f87171 100%)' }
  ];

  constructor(container, config) {
    super(container, config);
    this.stableCount = 0;
    this.temperature = 30;
    this.timeCounter = 0;
    this.isSuccess = false;
  }

  async setup() {
    await super.setup();
    this.resetOcean();
  }
  
  resetOcean() {
    this.particles = [];
    this.stableCount = 0;
    
    // Create random basic atoms
    const colors = ['#f87171', '#60a5fa', '#fbbf24', '#a78bfa'];
    
    for (let i = 0; i < 40; i++) {
      this.addParticle({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 100,
        vy: (Math.random() - 0.5) * 100,
        r: 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        mass: 1,
        isStable: false,
        flashTimer: 0,
        flashColor: null
      });
    }
  }

  onControlChange(id, value) {
    if (id === 'reset') {
      this.resetOcean();
    } else if (id === 'temperature') {
      this.temperature = parseInt(value, 10);
    }
  }

  applyBrownianMotion(dt) {
    const tempFactor = this.temperature / 50;
    // Apply a continuous drag so particles don't accelerate infinitely
    const drag = Math.pow(0.1, dt);
    
    for (const p of this.particles) {
      p.vx *= drag;
      p.vy *= drag;
      
      const kick = 800 * tempFactor;
      if (!p.isStable) {
        p.vx += (Math.random() - 0.5) * kick * dt;
        p.vy += (Math.random() - 0.5) * kick * dt;
      } else {
        // Stable molecules move more slowly
        p.vx += (Math.random() - 0.5) * kick * 0.2 * dt;
        p.vy += (Math.random() - 0.5) * kick * 0.2 * dt;
      }
    }
  }

  _onCollision(p1, p2) {
    // Calculate max allowed stable particles based on user constraints
    const diff = Math.abs(this.temperature - 50);
    let maxStable = 0;
    if (diff <= 3) maxStable = 10;
    else if (diff <= 10) maxStable = 10 - ((diff - 3) / 7) * 4;
    else if (diff <= 20) maxStable = 6 - ((diff - 10) / 10) * 4;
    else if (diff <= 30) maxStable = 2 - ((diff - 20) / 10) * 2;
    else maxStable = 0;
    
    maxStable = Math.round(maxStable);
    
    // Calculate current stable particles
    const currentStable = this.particles.filter(p => p.isStable).length;

    // If we exceed the cap, force stable molecules to break apart on collision
    if (p1.isStable && p2.isStable) {
      if (currentStable > maxStable || Math.random() < 0.002 * (this.temperature / 50)) {
        p1.isStable = false;
        p2.isStable = false;
        p1.r = 6;
        p2.r = 6;
        p1.mass = 1;
        p2.mass = 1;
        p1.flashTimer = 0.5;
        p1.flashColor = '#f87171';
        p2.flashTimer = 0.5;
        p2.flashColor = '#f87171';
      }
      return;
    }
    
    if (p1.isStable || p2.isStable) return;

    // Formation check: only allow formation if we have room under the cap
    if (currentStable + 2 <= maxStable) {
      const optimumFactor = Math.max(0, 1 - Math.pow(diff / 40, 2)); 
      const stickChance = 0.03 * optimumFactor;
      
      if (Math.random() < stickChance) {
        p1.isStable = true;
        p2.isStable = true;
        p1.color = '#4ade80'; // glow green
        p2.color = '#4ade80';
        p1.r = 8;
        p2.r = 8;
        p1.mass = 5;
        p2.mass = 5;
        return;
      }
    }

    // Flash red to indicate breaking apart (or failed formation)
    p1.flashTimer = 0.5;
    p1.flashColor = '#f87171';
    p2.flashTimer = 0.5;
    p2.flashColor = '#f87171';
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      if (p.isStable) {
        // Draw strong glow core for stable molecules
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.4)';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.15)';
        ctx.fill();
        
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 15;
      } else {
        ctx.shadowBlur = 0;
      }
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      
      if (p.flashTimer > 0) {
        ctx.fillStyle = p.flashColor;
      } else {
        ctx.fillStyle = p.isStable ? '#ffffff' : p.color;
      }
      
      ctx.fill();
      ctx.shadowBlur = 0; // reset for next draws
    }
  }

  _tick(ctx, dt) {
    if (this.isSuccess) {
      this._drawOceanBackground(ctx);
      this._drawParticles(ctx);
      this._drawOverlay(ctx, dt);
      return;
    }

    this.timeCounter += dt;
    
    // Update timers
    for (const p of this.particles) {
      if (p.flashTimer > 0) {
        p.flashTimer -= dt;
      }
    }
    
    this.applyBrownianMotion(dt);
    
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    
    this.resolveCollisions();
    this.enforceBoundary();
    
    const currentStable = this.particles.filter(p => p.isStable).length;
    if (currentStable >= 10 && !this.isSuccess) {
      this.isSuccess = true;
      if (typeof this.pause === 'function') this.pause();
    }
    
    // Draw background completely overriding superclass clear
    this._drawOceanBackground(ctx);
    
    this._drawParticles(ctx);
    this._drawOverlay(ctx, dt);
  }

  _drawOceanBackground(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Calculate hue based on temperature: cold (190) to hot (280)
    const hue = 190 + (this.temperature / 100) * 90;
    
    // Create gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `hsl(${hue}, 69%, 16%)`);
    grad.addColorStop(1, `hsl(${hue}, 85%, 5%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    
    // Draw subtle waves
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    const time = this.timeCounter;
    
    for (let y = 50; y < h; y += 40) {
      ctx.beginPath();
      // Add a slow vertical bobbing motion to the entire wave row
      const rowBob = Math.sin(time * 0.5 + y * 0.05) * 15;
      
      for (let x = 0; x <= w; x += 10) {
        // Base long wave moving right
        const swell = Math.sin((x * 0.015) + (time * 1.5) + (y * 0.1)) * 12;
        // High frequency ripple moving left
        const ripple = Math.sin((x * 0.08) - (time * 3) + (y * 0.5)) * 3;
        
        const yOffset = swell + rowBob + ripple;
        if (x === 0) ctx.moveTo(x, y + yOffset);
        else ctx.lineTo(x, y + yOffset);
      }
      ctx.stroke();
    }
  }

  _drawOverlay(ctx, dt) {
    const currentStable = this.particles.filter(p => p.isStable).length;
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 220, 36, 6);
    ctx.fill();
    
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Stable molecules: ${currentStable}`, 20, 33);

    if (this.isSuccess) {
      const w = this.canvas.width;
      const h = this.canvas.height;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, h/2 - 40, w, 80);
      
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✅ Ideal Conditions Achieved!', w/2, h/2 + 8);
      ctx.textAlign = 'left';
    }
  }
}
