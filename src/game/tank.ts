/**
 * Tank Entity - Pure 2D Rigid Rectangle Physics Simulation
 * All movement, ground reaction, friction, teetering, and recoil
 * are simulated purely using Newton's equations of motion (F = ma, tau = I * alpha).
 */

import { Terrain } from '../engine/terrain.ts';
import { ParticleSystem } from './particles.ts';

export interface TankConfig {
  x: number;
  isPlayer: boolean;
  baseColor: string;
  accentColor: string;
  treadColor: string;
}

export class Tank {
  // Rigid Body State (Center of Mass)
  public x: number;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public angle: number = 0; // Body orientation in radians
  public angularVelocity: number = 0; // rad/s

  // Rigid Rectangle Dimensions & Mass Properties
  public readonly halfWidth: number = 48; // 96px width
  public readonly halfHeight: number = 14; // 28px height
  public readonly trackLength: number = 104;
  public readonly wheelRadius: number = 7.5;
  public readonly wheelXOffsets: number[] = [-36, -18, 0, 18, 36];
  public wheelSuspension: number[] = [0, 0, 0, 0, 0];

  // Contact points: 9 points along caterpillar track profile with raised idlers, plus 2 roof corners
  public static readonly CONTACT_POINTS = [
    { u: -48, v: 6, isBottom: true },   // Rear sprocket (raised by 8px)
    { u: -38, v: 11, isBottom: true },  // Rear curved transition
    { u: -26, v: 14, isBottom: true },  // Rear road wheel
    { u: -13, v: 14, isBottom: true },  // Mid-rear wheel
    { u: 0, v: 14, isBottom: true },    // Center wheel
    { u: 13, v: 14, isBottom: true },   // Mid-front wheel
    { u: 26, v: 14, isBottom: true },   // Front road wheel
    { u: 38, v: 11, isBottom: true },   // Front curved transition
    { u: 48, v: 6, isBottom: true },    // Front idler (raised by 8px)
    { u: -48, v: -14, isBottom: false },// Roof rear corner
    { u: 48, v: -14, isBottom: false }, // Roof front corner
  ];

  public readonly mass: number = 1.0;
  public readonly inertia: number = 850; // (1/12) * mass * (W^2 + H^2)

  // Status
  public isPlayer: boolean;
  public isAlive: boolean = true;
  public health: number = 100;
  public onGround: boolean = false;
  public groundedPointsCount: number = 0;
  public isResting: boolean = false;
  private restingGroundY: number = 0;
  private restTimer: number = 0;
  public upsideDownTimer: number = 0;

  // Visual & gameplay fields
  public barrelAngleDeg: number = 45;
  public fuel: number = 100;
  public readonly maxFuel: number = 100;
  public treadOffset: number = 0;
  public wheelRot: number = 0;
  public hullPitchRock: number = 0;
  public get suspensionOffset(): number {
    return this.wheelSuspension[2] ?? 0;
  }

  // Visual styling
  public baseColor: string;
  public accentColor: string;
  public treadColor: string;

  // Drive motor input for physics integration (-1, 0, 1)
  private driveInput: number = 0;

  constructor(config: TankConfig, terrain: Terrain) {
    this.x = config.x;
    this.isPlayer = config.isPlayer;
    this.baseColor = config.baseColor;
    this.accentColor = config.accentColor;
    this.treadColor = config.treadColor;

    this.alignToTerrain(terrain);
  }

  public isFlippedOnBack(): boolean {
    // Upside down when hull angle has rolled past ~90 degrees in either direction
    // (Math.cos(angle) < -0.05 indicates normal vector points down toward ground)
    return Math.cos(this.angle) < -0.05;
  }

  public alignToTerrain(terrain: Terrain) {
    // Multi-point ground sampling across the 72px road-wheel wheelbase
    const rearGroundY = terrain.getHeight(this.x - 36);
    const frontGroundY = terrain.getHeight(this.x + 36);
    this.angle = Math.atan2(frontGroundY - rearGroundY, 72);

    const cosA = Math.cos(this.angle);
    const sinA = Math.sin(this.angle);
    const initialY = terrain.getHeight(this.x) - this.halfHeight;

    // Check all contact points (both bottom tracks and hull corners) against local terrain
    let maxPenetration = 0;
    for (const cp of Tank.CONTACT_POINTS) {
      const px = this.x + cp.u * cosA - cp.v * sinA;
      const py = initialY + cp.u * sinA + cp.v * cosA;
      const groundY = terrain.getHeight(px);
      const penetration = py - groundY;
      if (penetration > maxPenetration) {
        maxPenetration = penetration;
      }
    }

    // Spawn clearance: elevate tank so NO contact point penetrates the terrain on spawn
    const spawnClearance = 4.0;
    this.y = initialY - Math.max(0, maxPenetration) - spawnClearance;
    this.vx = 0;
    this.vy = 0;
    this.angularVelocity = 0;
    this.onGround = false;
    this.isResting = false;
    this.restingGroundY = terrain.getHeight(this.x);
    this.restTimer = 0;
    this.upsideDownTimer = 0;
    for (let i = 0; i < this.wheelSuspension.length; i++) {
      this.wheelSuspension[i] = 0;
    }
  }

  public applyRecoil(powerPct: number, barrelAngleRad: number) {
    this.isResting = false;
    this.restTimer = 0;

    const recoilPower = 28 + (powerPct / 100) * 120;
    const pushDirX = -Math.cos(barrelAngleRad);
    const pushDirY = -Math.sin(barrelAngleRad);

    this.vx += pushDirX * recoilPower;
    this.vy += pushDirY * recoilPower * 0.45;

    const recoilTorque = (this.isPlayer ? -1 : 1) * (0.8 + (powerPct / 100) * 2.2);
    this.angularVelocity += recoilTorque;

    if (this.isPlayer) {
      this.wheelSuspension[0] += 4.5;
      this.wheelSuspension[1] += 2.5;
    } else {
      this.wheelSuspension[4] += 4.5;
      this.wheelSuspension[3] += 2.5;
    }
  }

  public applyBlastImpulse(blastX: number, blastY: number, maxForce: number = 180) {
    const dx = this.x - blastX;
    const dy = (this.y - 10) - blastY;
    const dist = Math.hypot(dx, dy);

    if (dist < 160) {
      const falloff = 1 - dist / 160;
      const force = falloff * maxForce;
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);

      this.vx += nx * force * 1.8;
      this.vy += Math.min(-40, ny * force * 1.4);
      this.onGround = false;
      this.isResting = false;
      this.restTimer = 0;

      this.angularVelocity += (nx >= 0 ? 1 : -1) * force * 0.04;
    }
  }

  public driveManual(dir: -1 | 0 | 1, dt: number, _terrain: Terrain, particles: ParticleSystem): boolean {
    if (dir === 0 || !this.isAlive || this.fuel <= 0) return false;

    this.isResting = false;
    this.restTimer = 0;
    this.driveInput = dir;

    const fuelRate = 12;
    this.fuel = Math.max(0, this.fuel - fuelRate * dt);

    if (this.onGround && Math.random() < 0.45) {
      const cosA = Math.cos(this.angle);
      const sinA = Math.sin(this.angle);
      const emitX = this.x - dir * 42 * cosA;
      const emitY = this.y - dir * 42 * sinA + 12;
      particles.emitSandDust(emitX, emitY, 2, 25);
    }

    return true;
  }

  public getBarrelTip(): { x: number; y: number; worldAngleRad: number } {
    const barrelLength = 52;
    const turretLocalX = this.isPlayer ? 12 : -12;
    const turretLocalY = -19; // Relative to center of mass

    const cosSlope = Math.cos(this.angle);
    const sinSlope = Math.sin(this.angle);

    const pivotWorldX = this.x + (turretLocalX * cosSlope - turretLocalY * sinSlope);
    const pivotWorldY = this.y + (turretLocalX * sinSlope + turretLocalY * cosSlope);

    const aimRad = (this.barrelAngleDeg * Math.PI) / 180;
    const worldAngleRad = this.isPlayer ? -aimRad : Math.PI + aimRad;

    const tipX = pivotWorldX + Math.cos(worldAngleRad) * barrelLength;
    const tipY = pivotWorldY + Math.sin(worldAngleRad) * barrelLength;

    return { x: tipX, y: tipY, worldAngleRad };
  }

  public update(dt: number, terrain: Terrain, _particles: ParticleSystem, _windMph: number = 0): boolean {
    if (!this.isAlive) return false;

    // 1. Resting / Sleep state handler: zero movement, zero self-adjusting
    if (this.isResting) {
      // Check that body is still properly supported across both sides of CoM
      let hasRear = false;
      let hasFront = false;
      const cosA = Math.cos(this.angle);
      const sinA = Math.sin(this.angle);
      for (let i = 0; i < Tank.CONTACT_POINTS.length; i++) {
        const cp = Tank.CONTACT_POINTS[i];
        if (!cp.isBottom) continue;
        const px = this.x + cp.u * cosA - cp.v * sinA;
        const py = this.y + cp.u * sinA + cp.v * cosA;
        const groundY = terrain.getHeight(px);
        if (py >= groundY - 1.5) {
          if (cp.u <= -10) hasRear = true;
          if (cp.u >= 10) hasFront = true;
        }
      }

      const currentGroundY = terrain.getHeight(this.x);
      const groundShift = Math.abs(currentGroundY - this.restingGroundY);
      const isNavigableSlope = Math.abs(Math.sin(this.angle)) < 0.72;

      // Wake up if:
      // - Tank is flipped
      // - Driving requested
      // - Ground under tank altered (e.g. crater exploded nearby)
      // - Incline is an unnavigable cliff where gravity forces slide
      // - Lost stable dual-sided support (e.g. perched on one end, teetering)
      if (this.isFlippedOnBack() || this.driveInput !== 0 || groundShift > 2.5 || !isNavigableSlope || !hasRear || !hasFront) {
        this.isResting = false;
        this.restTimer = 0;
      } else {
        // Body is asleep: position and orientation are completely frozen
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;

        // Smooth visual suspension settling
        const cosA = Math.cos(this.angle);
        const sinA = Math.sin(this.angle);
        for (let i = 0; i < this.wheelXOffsets.length; i++) {
          const ox = this.wheelXOffsets[i];
          const wx = this.x + ox * cosA - 5 * sinA;
          const wy = this.y + ox * sinA + 5 * cosA;
          const groundWY = terrain.getHeight(wx);
          const targetCompress = Math.max(-3.0, Math.min(5.0, wy + 9 - groundWY));
          this.wheelSuspension[i] += (targetCompress - this.wheelSuspension[i]) * Math.min(1.0, 15.0 * dt);
        }

        this.driveInput = 0;
        return false;
      }
    }

    const clampedDt = Math.min(0.04, dt);
    const subSteps = 8;
    const subDt = clampedDt / subSteps;

    const gravity = 520;
    const kNormal = 2400;
    const cNormal = 95;
    const brakeFriction = 0.85;
    const engineForce = 680;
    const linearAirDrag = 0.08;
    const angularDrag = 28.0;

    let totalGroundedThisFrame = 0;
    let frameMinGroundedU = Infinity;
    let frameMaxGroundedU = -Infinity;

    for (let step = 0; step < subSteps; step++) {
      let totalFx = 0;
      let totalFy = this.mass * gravity;
      let totalTorque = 0;

      const cosA = Math.cos(this.angle);
      const sinA = Math.sin(this.angle);

      let subGroundedCount = 0;
      let minGroundedU = Infinity;
      let maxGroundedU = -Infinity;

      // First pass: count grounded bottom points and record support span
      for (let i = 0; i < Tank.CONTACT_POINTS.length; i++) {
        const cp = Tank.CONTACT_POINTS[i];
        const px = this.x + cp.u * cosA - cp.v * sinA;
        const py = this.y + cp.u * sinA + cp.v * cosA;
        const groundY = terrain.getHeight(px);
        if (py >= groundY && cp.isBottom) {
          subGroundedCount++;
          if (cp.u < minGroundedU) minGroundedU = cp.u;
          if (cp.u > maxGroundedU) maxGroundedU = cp.u;
        }
      }

      if (subGroundedCount > totalGroundedThisFrame) {
        totalGroundedThisFrame = subGroundedCount;
      }
      if (minGroundedU < frameMinGroundedU) frameMinGroundedU = minGroundedU;
      if (maxGroundedU > frameMaxGroundedU) frameMaxGroundedU = maxGroundedU;

      // Second pass: apply normal reaction and drive traction / static braking
      for (let i = 0; i < Tank.CONTACT_POINTS.length; i++) {
        const cp = Tank.CONTACT_POINTS[i];
        const px = this.x + cp.u * cosA - cp.v * sinA;
        const py = this.y + cp.u * sinA + cp.v * cosA;
        const groundY = terrain.getHeight(px);

        const penetration = py - groundY;
        if (penetration > 0) {
          // Terrain surface normal pointing UP out of the ground
          const groundAngle = terrain.getAngle(px);
          const normX = Math.sin(groundAngle);
          const normY = -Math.cos(groundAngle);

          // Terrain surface tangent pointing forward along the ground slope
          const tangX = Math.cos(groundAngle);
          const tangY = Math.sin(groundAngle);

          // Velocity of this contact point
          const rx = px - this.x;
          const ry = py - this.y;
          const vPointX = this.vx - this.angularVelocity * ry;
          const vPointY = this.vy + this.angularVelocity * rx;

          // Normal relative velocity (positive when moving deeper into ground)
          const vNorm = -(vPointX * normX + vPointY * normY);

          // Restoring spring-damper normal force
          const fn = Math.max(0, kNormal * penetration + cNormal * vNorm);
          const forceNormX = normX * fn;
          const forceNormY = normY * fn;

          // Tangential forces along terrain surface (driving traction or braking/static friction)
          let forceTangX = 0;
          let forceTangY = 0;

          if (cp.isBottom) {
            const vTang = vPointX * tangX + vPointY * tangY;

            if (this.driveInput !== 0 && subGroundedCount > 0) {
              // Engine active: apply driving tractive force along the terrain surface!
              const drivePerPoint = (this.driveInput * engineForce) / Math.max(2, subGroundedCount);
              const maxGrip = fn * 2.5 + 90;
              const tractMag = Math.max(-maxGrip, Math.min(maxGrip, drivePerPoint));
              const rollDrag = -vTang * 1.0;
              const totalTangMag = tractMag + rollDrag;
              forceTangX = tangX * totalTangMag;
              forceTangY = tangY * totalTangMag;
            } else {
              // Idle / Braking:
              // Exact impulse-based static friction: cancel residual velocity in one substep without oscillation
              const neededBrake = -(vTang / subDt) * (this.mass / Math.max(1, subGroundedCount));
              const maxBrake = fn * brakeFriction;
              const brakeMag = Math.max(-maxBrake, Math.min(maxBrake, neededBrake));
              forceTangX = tangX * brakeMag;
              forceTangY = tangY * brakeMag;
            }
          }

          const ptFx = forceNormX + forceTangX;
          const ptFy = forceNormY + forceTangY;

          totalFx += ptFx;
          totalFy += ptFy;

          // Torque about center of mass: rx * Fy - ry * Fx
          totalTorque += rx * ptFy - ry * ptFx;
        }
      }

      // Pitch damping on ground: prevents seesaw/cradle rocking,
      // but ONLY when the tank has grounded support points on BOTH sides of the center of mass!
      const hasDualSupport = minGroundedU <= -15 && maxGroundedU >= 15;
      if (hasDualSupport) {
        totalTorque -= this.angularVelocity * 45.0;
      }

      // Linear and angular air resistance
      totalFx -= this.vx * linearAirDrag;
      totalFy -= this.vy * linearAirDrag;
      totalTorque -= this.angularVelocity * angularDrag;

      // Integrate Newton's equations
      this.vx += (totalFx / this.mass) * subDt;
      this.vy += (totalFy / this.mass) * subDt;
      this.angularVelocity += (totalTorque / this.inertia) * subDt;

      this.x += this.vx * subDt;
      this.y += this.vy * subDt;
      this.angle += this.angularVelocity * subDt;
    }

    this.onGround = totalGroundedThisFrame > 0;
    this.groundedPointsCount = totalGroundedThisFrame;

    // Track upside down timer (fatal destruction is triggered on that tank's turn!)
    if (this.isFlippedOnBack()) {
      this.isResting = false;
      this.restTimer = 0;
      this.upsideDownTimer += dt;
    } else {
      this.upsideDownTimer = 0;
    }

    // Post-drive resting check: enter sleep when at standstill (only if upright & supported on both sides of CoM!)
    const hasStableSupport = frameMinGroundedU <= -10 && frameMaxGroundedU >= 10;
    if (this.onGround && this.driveInput === 0 && !this.isFlippedOnBack() && hasStableSupport) {
      const speed = Math.hypot(this.vx, this.vy);
      const angSpeed = Math.abs(this.angularVelocity);
      const isNavigableSlope = Math.abs(Math.sin(this.angle)) < 0.72;

      if (totalGroundedThisFrame >= 2 && speed < 6.0 && angSpeed < 0.10 && isNavigableSlope) {
        this.restTimer += dt;
        if (this.restTimer > 0.35) {
          this.isResting = true;
          this.restingGroundY = terrain.getHeight(this.x);
          this.vx = 0;
          this.vy = 0;
          this.angularVelocity = 0;
        }
      } else {
        this.restTimer = 0;
      }
    } else {
      this.restTimer = 0;
      this.isResting = false;
    }

    // Dynamic tread scrolling & wheel rotation based on physical velocity along track heading
    const cosA = Math.cos(this.angle);
    const sinA = Math.sin(this.angle);
    const vAlongTrack = this.vx * cosA + this.vy * sinA + this.angularVelocity * 14;

    this.treadOffset = (this.treadOffset + vAlongTrack * dt) % 8;
    if (this.treadOffset < 0) this.treadOffset += 8;
    this.wheelRot += (vAlongTrack * dt) / this.wheelRadius;

    for (let i = 0; i < this.wheelXOffsets.length; i++) {
      const ox = this.wheelXOffsets[i];
      const wx = this.x + ox * cosA - 5 * sinA;
      const wy = this.y + ox * sinA + 5 * cosA;
      const groundWY = terrain.getHeight(wx);
      const targetCompress = Math.max(-3.0, Math.min(5.0, wy + 9 - groundWY));
      this.wheelSuspension[i] += (targetCompress - this.wheelSuspension[i]) * Math.min(1.0, 20.0 * dt);
    }

    // Reset drive throttle for next frame
    this.driveInput = 0;

    return false;
  }

  public resetHealth() {
    this.health = 100;
    this.isAlive = true;
    this.fuel = this.maxFuel;
  }

  public takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }

  public refillFuel() {
    this.fuel = this.maxFuel;
  }
}
