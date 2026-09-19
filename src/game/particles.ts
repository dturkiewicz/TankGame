/**
 * Minimalist Particle Engine for Desert Dust, Smoke & Explosions
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity?: number;
  drag?: number;
  grow?: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];

  public update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      const drag = p.drag ?? 0.98;
      p.vx *= Math.pow(drag, dt * 60);
      p.vy *= Math.pow(drag, dt * 60);

      const grav = p.gravity ?? 0;
      p.vy += grav * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.grow) {
        p.size += p.grow * dt;
      }
    }
  }

  public emitWindBreeze(minX: number, maxX: number, minY: number, maxY: number, windMph: number) {
    if (Math.abs(windMph) < 1) return;
    const x = windMph > 0 ? minX - 50 : maxX + 50;
    const y = minY + Math.random() * (maxY - minY);
    const vx = windMph * 15 + (Math.random() - 0.5) * 20;
    const vy = (Math.random() - 0.5) * 10;
    this.particles.push({
      x,
      y,
      vx,
      vy,
      life: 2.5 + Math.random() * 1.5,
      maxLife: 4.0,
      size: 1.5 + Math.random() * 1.5,
      color: 'rgba(210, 175, 120, 0.45)',
      drag: 1.0,
      gravity: 2,
    });
  }

  public emitSandDust(x: number, y: number, count: number = 6, speed: number = 50) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.5;
      const spd = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 3 + Math.random() * 4,
        color: Math.random() > 0.5 ? '#cca06d' : '#dfbd88',
        gravity: 40,
        drag: 0.92,
        grow: 6,
      });
    }
  }

  public emitMuzzleBlast(x: number, y: number, barrelAngle: number) {
    // Flash spark
    for (let i = 0; i < 10; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const spd = 120 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(barrelAngle + spread) * spd,
        vy: Math.sin(barrelAngle + spread) * spd,
        life: 0.15 + Math.random() * 0.15,
        maxLife: 0.3,
        size: 2 + Math.random() * 3,
        color: '#ffc107',
        drag: 0.85,
      });
    }
    // Muzzle smoke
    for (let i = 0; i < 5; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const spd = 40 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(barrelAngle + spread) * spd,
        vy: Math.sin(barrelAngle + spread) * spd,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1.0,
        size: 4,
        color: 'rgba(235, 220, 200, 0.65)',
        drag: 0.9,
        grow: 12,
      });
    }
  }

  public emitSmokeTrail(x: number, y: number) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 3,
      y: y + (Math.random() - 0.5) * 3,
      vx: (Math.random() - 0.5) * 5,
      vy: -10 + (Math.random() - 0.5) * 5,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      size: 2.5,
      color: 'rgba(240, 235, 225, 0.45)',
      drag: 0.95,
      grow: 6,
    });
  }

  public emitExplosion(x: number, y: number, isTank: boolean = false) {
    const count = isTank ? 40 : 25;

    // Hot fiery debris / sparks
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * (isTank ? 260 : 160);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        size: 3 + Math.random() * 3,
        color: isTank
          ? (Math.random() > 0.4 ? '#e74c3c' : '#f39c12')
          : (Math.random() > 0.5 ? '#d35400' : '#b0834c'),
        gravity: 280,
        drag: 0.94,
      });
    }

    // Heavy sand / smoke billow
    const smokeCount = isTank ? 24 : 15;
    for (let i = 0; i < smokeCount; i++) {
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.2;
      const speed = 40 + Math.random() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        size: 8 + Math.random() * 8,
        color: isTank ? 'rgba(70, 50, 40, 0.5)' : 'rgba(215, 175, 125, 0.6)',
        gravity: 30,
        drag: 0.9,
        grow: 18,
      });
    }
  }

  public getParticles(): Particle[] {
    return this.particles;
  }

  public clear() {
    this.particles = [];
  }
}
