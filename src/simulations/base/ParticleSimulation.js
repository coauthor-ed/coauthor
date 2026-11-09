import { CanvasSimulation } from './CanvasSimulation.js';

let _particleIdCounter = 0;

export class ParticleSimulation extends CanvasSimulation {
  static BOUNDARY = 'wrap'; // 'wrap' | 'bounce' | 'membrane'
  /** applyBrownianMotion() below perturbs every particle's velocity on every
   *  _tick() — genuinely perpetual motion that never settles, so this base
   *  opts every subclass out of the come-to-rest default rather than making
   *  each one (OsmosisScene, ...) declare it. See SimulationBase's class doc. */
  static CONTINUOUS = true;

  constructor(container, config) {
    super(container, config);
    this.particles = [];
  }

  addParticle(props) {
    this.particles.push({
      // A plain incrementing counter is all a local particle id needs — no
      // need for crypto.randomUUID()'s cryptographic strength, and it also
      // requires a secure context (HTTPS or localhost), which breaks this
      // under the local dev server when reached via a non-localhost host.
      id: `p${++_particleIdCounter}`,
      x: 0, y: 0, vx: 0, vy: 0,
      r: 5, color: '#ffffff', type: 'generic', mass: 1,
      ...props
    });
  }

  removeParticle(id) {
    this.particles = this.particles.filter(p => p.id !== id);
  }

  applyBrownianMotion(dt) {
    for (const p of this.particles) {
      p.vx += (Math.random() - 0.5) * 50 * dt;
      p.vy += (Math.random() - 0.5) * 50 * dt;
    }
  }

  resolveCollisions() {
    const len = this.particles.length;
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const min_dist = p1.r + p2.r;
        
        if (dist < min_dist && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          
          const v1n = p1.vx * nx + p1.vy * ny;
          const v2n = p2.vx * nx + p2.vy * ny;
          if (v1n > v2n) continue;
          
          const m1 = p1.mass;
          const m2 = p2.mass;
          
          const v1n_after = (v1n * (m1 - m2) + 2 * m2 * v2n) / (m1 + m2);
          const v2n_after = (v2n * (m2 - m1) + 2 * m1 * v1n) / (m1 + m2);
          
          p1.vx += (v1n_after - v1n) * nx;
          p1.vy += (v1n_after - v1n) * ny;
          p2.vx += (v2n_after - v2n) * nx;
          p2.vy += (v2n_after - v2n) * ny;

          const overlap = min_dist - dist;
          p1.x -= nx * overlap * 0.5;
          p1.y -= ny * overlap * 0.5;
          p2.x += nx * overlap * 0.5;
          p2.y += ny * overlap * 0.5;
          
          this._onCollision(p1, p2);
        }
      }
    }
  }

  enforceBoundary() {
    const W = this.constructor.WIDTH;
    const H = this.constructor.HEIGHT;
    const boundary = this.constructor.BOUNDARY;

    for (const p of this.particles) {
      if (boundary === 'wrap') {
        if (p.x < 0) p.x += W;
        if (p.x >= W) p.x -= W;
        if (p.y < 0) p.y += H;
        if (p.y >= H) p.y -= H;
      } else if (boundary === 'bounce') {
        if (p.x < p.r) { p.x = p.r; p.vx *= -1; }
        if (p.x > W - p.r) { p.x = W - p.r; p.vx *= -1; }
        if (p.y < p.r) { p.y = p.r; p.vy *= -1; }
        if (p.y > H - p.r) { p.y = H - p.r; p.vy *= -1; }
      } else if (boundary === 'membrane') {
        // Simple top/bottom bounce, left/right check membrane
        if (p.y < p.r) { p.y = p.r; p.vy *= -1; }
        if (p.y > H - p.r) { p.y = H - p.r; p.vy *= -1; }
        if (p.x < p.r) { p.x = p.r; p.vx *= -1; }
        if (p.x > W - p.r) { p.x = W - p.r; p.vx *= -1; }
        
        // Let subclasses define membrane interactions via _classifyParticle
        const action = this._classifyParticle(p);
        if (action === 'block') {
          // generic membrane is assumed in middle horizontally for demo, subclass overrides this logic normally
          if (p.x > W/2 - 10 && p.x < W/2 + 10) {
            p.vx *= -1;
          }
        }
      }
    }
  }

  _onCollision(a, b) {}
  _classifyParticle(p) { return 'pass'; }

  _tick(ctx, dt) {
    this.applyBrownianMotion(dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.resolveCollisions();
    this.enforceBoundary();
    
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawParticles(ctx);
    this._drawOverlay(ctx, dt);
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  }

  _drawOverlay(ctx, dt) {}
}
