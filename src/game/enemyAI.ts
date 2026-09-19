/**
 * Enemy Tank AI Controller
 * Manages tactical maneuvering, ballistic trajectory calculation, and return-fire.
 */

import { Tank } from './tank.ts';
import { Terrain } from '../engine/terrain.ts';
import { ParticleSystem } from './particles.ts';
import { Projectile } from './projectile.ts';
import { audio } from '../engine/audio.ts';

export type AIPhase = 'idle' | 'maneuvering' | 'aiming' | 'firing' | 'done';

export class EnemyAI {
  public phase: AIPhase = 'idle';
  private phaseTimer: number = 0;

  private enemyTank: Tank;
  private playerTank: Tank;
  private terrain: Terrain;
  private particles: ParticleSystem;

  // Maneuvering state
  private moveDir: -1 | 0 | 1 = 0;
  private moveTargetDist: number = 0;
  private moveProgress: number = 0;

  // Aiming state
  private targetAngleDeg: number = 45;
  private targetPowerPct: number = 60;

  // Accuracy progression (gets slightly more accurate each shot at the same target)
  private consecutiveShots: number = 0;

  constructor(enemyTank: Tank, playerTank: Tank, terrain: Terrain, particles: ParticleSystem) {
    this.enemyTank = enemyTank;
    this.playerTank = playerTank;
    this.terrain = terrain;
    this.particles = particles;
  }

  public setTargets(enemyTank: Tank, playerTank: Tank) {
    this.enemyTank = enemyTank;
    this.playerTank = playerTank;
    this.phase = 'idle';
    this.consecutiveShots = 0;
  }

  public startTurn(windMph: number) {
    if (!this.enemyTank.isAlive || this.enemyTank.isFlippedOnBack()) {
      this.phase = 'done';
      return;
    }

    this.consecutiveShots++;

    // 1. Plan tactical movement: 65% chance to reposition on a dune
    if (Math.random() < 0.65) {
      // Pick direction: move toward player or away to a higher dune spot
      const dirChoice: -1 | 1 = Math.random() > 0.4 ? -1 : 1;
      this.moveDir = dirChoice;
      this.moveTargetDist = 55 + Math.random() * 85;
      this.moveProgress = 0;
      this.phase = 'maneuvering';
      this.phaseTimer = 1.0;
    } else {
      this.phase = 'aiming';
      this.phaseTimer = 0.8;
      this.calculateBallistics(windMph);
    }
  }

  private calculateBallistics(windMph: number) {
    const dx = Math.abs(this.playerTank.x - this.enemyTank.x);
    const dy = this.playerTank.y - this.enemyTank.y; // Positive if player is lower, negative if higher

    // Desired elevation angle (high arcing artillery shot)
    const baseAngle = 48 + Math.random() * 14;
    const rad = (baseAngle * Math.PI) / 180;

    // Standard ballistic formula with gravity = 480 px/s²
    // Range R = (v^2 * sin(2*theta)) / g (approximate for flat ground)
    const g = 480;
    const sin2theta = Math.sin(2 * rad);

    // Initial speed approximation
    let vEstimate = Math.sqrt((dx * g) / Math.max(0.2, sin2theta));

    // Wind compensation: if wind is blowing left (toward player), need less speed; if blowing right, need more speed
    vEstimate -= windMph * 1.8;

    // Height offset compensation
    if (dy < 0) {
      // Player is higher up: need more speed
      vEstimate += Math.abs(dy) * 0.45;
    } else {
      // Player is lower down: need slightly less speed
      vEstimate -= dy * 0.25;
    }

    // Map speed (160 to 940) to power percentage (5% to 100%)
    let power = ((vEstimate - 160) / 780) * 100;

    // Human-like AI inaccuracy (narrows with consecutive shots)
    const maxInaccuracyPct = Math.max(3, 10 - this.consecutiveShots * 2.5);
    const errorPct = (Math.random() * 2 - 1) * maxInaccuracyPct;
    power += errorPct;

    this.targetPowerPct = Math.max(12, Math.min(100, Math.round(power)));
    this.targetAngleDeg = Math.round(baseAngle);
  }

  public update(dt: number, windMph: number): Projectile | null {
    if (this.phase === 'idle' || this.phase === 'done' || this.enemyTank.isFlippedOnBack()) {
      this.phase = 'done';
      return null;
    }

    // Phase 1: Maneuvering (Driven purely by physics)
    if (this.phase === 'maneuvering') {
      this.enemyTank.driveManual(this.moveDir, dt, this.terrain, this.particles);
      this.moveProgress += Math.abs(this.enemyTank.vx) * dt;
      this.phaseTimer -= dt;

      if (this.moveProgress >= this.moveTargetDist || this.phaseTimer <= 0) {
        this.phase = 'aiming';
        this.phaseTimer = 0.9;
        this.calculateBallistics(windMph);
      }
      return null;
    }

    // Phase 2: Aiming (Smooth barrel pivot)
    if (this.phase === 'aiming') {
      this.phaseTimer -= dt;
      // Smoothly rotate barrel toward target angle
      const diff = this.targetAngleDeg - this.enemyTank.barrelAngleDeg;
      this.enemyTank.barrelAngleDeg += diff * Math.min(1.0, 5.0 * dt);

      if (this.phaseTimer <= 0) {
        this.phase = 'firing';
      }
      return null;
    }

    // Phase 3: Firing
    if (this.phase === 'firing') {
      this.phase = 'done';

      const tip = this.enemyTank.getBarrelTip();
      this.particles.emitMuzzleBlast(tip.x, tip.y, tip.worldAngleRad);
      this.enemyTank.applyRecoil(this.targetPowerPct, tip.worldAngleRad);
      audio.playFire();

      return new Projectile(
        tip.x,
        tip.y,
        tip.worldAngleRad,
        this.targetPowerPct,
        windMph
      );
    }

    return null;
  }
}
