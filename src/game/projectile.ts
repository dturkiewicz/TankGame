/**
 * Ballistics Projectile Engine
 * Calculates trajectory with gravity, wind resistance, sub-step collision, and terrain cratering.
 */

import { Terrain } from '../engine/terrain.ts';
import { Tank } from './tank.ts';
import { ParticleSystem } from './particles.ts';
import { Camera } from '../engine/camera.ts';
import { audio } from '../engine/audio.ts';

export interface ProjectileHitResult {
  hitTerrain: boolean;
  hitTank: Tank | null;
  x: number;
  y: number;
}

export class Projectile {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number = 3.5;
  public isAlive: boolean = true;
  public blastRadius: number = 42;

  // Ballistics constants
  private gravity: number = 480; // px/s²
  private windFactor: number = 2.4; // px/s² per mph

  constructor(
    startX: number,
    startY: number,
    angleRad: number,
    powerPct: number, // 0 to 100
    windMph: number
  ) {
    this.x = startX;
    this.y = startY;

    // Power mapping: 5% ~ 180 px/s, 100% ~ 920 px/s
    const speed = 160 + (powerPct / 100) * 780;
    this.vx = Math.cos(angleRad) * speed;
    this.vy = Math.sin(angleRad) * speed;

    this.windFactor = windMph * 3.2;
  }

  public update(
    dt: number,
    terrain: Terrain,
    tanks: Tank[],
    particles: ParticleSystem,
    camera: Camera
  ): ProjectileHitResult | null {
    if (!this.isAlive) return null;

    // Physics sub-stepping to prevent tunneling at high velocity
    const steps = 4;
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      // Wind and gravity
      this.vx += this.windFactor * subDt;
      this.vy += this.gravity * subDt;

      this.x += this.vx * subDt;
      this.y += this.vy * subDt;

      // Spawn subtle smoke trail
      if (Math.random() < 0.45) {
        particles.emitSmokeTrail(this.x, this.y);
      }

      // Check collision with tanks first
      for (const tank of tanks) {
        if (!tank.isAlive) continue;
        const dx = this.x - tank.x;
        const dy = this.y - (tank.y - 12);
        const distSq = dx * dx + dy * dy;

        // Direct hit radius ~ 22px
        if (distSq <= 22 * 22) {
          return this.explode(this.x, this.y, terrain, tanks, particles, camera, tank);
        }
      }

      // Check collision with terrain
      const groundY = terrain.getHeight(this.x);
      if (this.y >= groundY) {
        // Impact with terrain
        const hitX = this.x;
        const hitY = groundY;
        return this.explode(hitX, hitY, terrain, tanks, particles, camera, null);
      }

      // Despawn if fallen off bounds
      if (this.y > 2000) {
        this.isAlive = false;
        return null;
      }
    }

    return null;
  }

  private explode(
    x: number,
    y: number,
    terrain: Terrain,
    tanks: Tank[],
    particles: ParticleSystem,
    camera: Camera,
    directHitTank: Tank | null
  ): ProjectileHitResult {
    this.isAlive = false;

    // Deform terrain with crater
    terrain.addCrater(x, y, this.blastRadius);

    let affectedTank: Tank | null = directHitTank;

    // Check splash damage & blast impulse on nearby tanks
    for (const tank of tanks) {
      if (!tank.isAlive) continue;
      const dist = Math.hypot(tank.x - x, (tank.y - 10) - y);
      tank.applyBlastImpulse(x, y, 120);

      if (dist <= this.blastRadius + 14) {
        const damage = Math.round(Math.max(25, 100 * (1 - dist / (this.blastRadius + 18))));
        tank.takeDamage(damage);
        affectedTank = tank;
      }
    }

    // Camera shake and visual/audio effects
    if (directHitTank || (affectedTank && !affectedTank.isAlive)) {
      camera.addShake(0.65);
      particles.emitExplosion(x, y, true);
      audio.playExplosion();
      if (affectedTank && !affectedTank.isPlayer && !affectedTank.isAlive) {
        audio.playVictory();
      }
    } else {
      camera.addShake(0.28);
      particles.emitExplosion(x, y, false);
      audio.playTerrainHit();
    }

    return {
      hitTerrain: true,
      hitTank: affectedTank,
      x,
      y,
    };
  }
}
