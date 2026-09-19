/**
 * Canvas 2D Renderer for Desert Golfing Aesthetic
 * Renders sky, multi-layer dunes, procedural destructible terrain, tanks, ballistics, and effects.
 */

import { Terrain } from '../engine/terrain.ts';
import { Camera } from '../engine/camera.ts';
import { Tank } from '../game/tank.ts';
import { Projectile } from '../game/projectile.ts';
import { ParticleSystem } from '../game/particles.ts';
import { DesertTheme } from '../game/gameState.ts';
import { AimState } from '../game/input.ts';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not obtain 2D canvas context');
    this.ctx = context;
  }

  public render(
    terrain: Terrain,
    camera: Camera,
    playerTank: Tank,
    enemyTank: Tank,
    projectile: Projectile | null,
    particles: ParticleSystem,
    theme: DesertTheme,
    aimState: AimState,
    canFire: boolean,
    lastShotAngle: number | null = null,
    lastShotPower: number | null = null
  ) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, theme.skyTop);
    skyGrad.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Minimalist Sun
    const sunScreen = camera.worldToScreen(camera.x + 240, camera.y - 280);
    ctx.fillStyle = theme.sunColor;
    ctx.beginPath();
    ctx.arc(sunScreen.x, Math.max(70, sunScreen.y), 38 * camera.zoom, 0, Math.PI * 2);
    ctx.fill();

    // 3. Far Dunes (Parallax Layer 2)
    this.renderBackdropLayer(terrain, camera, 2, theme.duneFar, 0.25);

    // 4. Mid Dunes (Parallax Layer 1)
    this.renderBackdropLayer(terrain, camera, 1, theme.duneMid, 0.55);

    // 5. Main Destructible Foreground Dune Terrain
    this.renderForegroundTerrain(terrain, camera, theme);

    // 6. Tanks
    this.renderTank(playerTank, camera);
    this.renderTank(enemyTank, camera);

    // 7. Aim Trajectory Preview (ONLY when actively aiming/dragging)
    if (canFire && playerTank.isAlive && aimState.isDragging) {
      this.renderAimGuide(playerTank, aimState, camera, lastShotAngle, lastShotPower);
    }

    // 8. Artillery Projectile
    if (projectile && projectile.isAlive) {
      this.renderProjectile(projectile, camera);
    }

    // 9. Particle Effects
    this.renderParticles(particles, camera);
  }

  private renderBackdropLayer(
    terrain: Terrain,
    camera: Camera,
    layer: number,
    color: string,
    parallax: number
  ) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = color;
    ctx.beginPath();

    const bgSegW = layer === 1 ? 110 : 180;
    const leftWorld = camera.screenToWorld(0, 0).x;
    const rightWorld = camera.screenToWorld(w, 0).x;

    const startIdx = Math.floor((leftWorld * parallax) / bgSegW) - 1;
    const endIdx = Math.ceil((rightWorld * parallax) / bgSegW) + 1;

    ctx.moveTo(0, h);

    for (let i = startIdx; i <= endIdx; i++) {
      const bgWorldX = i * bgSegW;
      const worldY = terrain.getBackdropDuneHeight(bgWorldX, layer);
      const screenX = ((bgWorldX / parallax - leftWorld) / (rightWorld - leftWorld)) * w;
      const screenPos = camera.worldToScreen(0, worldY);
      ctx.lineTo(screenX, screenPos.y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  private renderForegroundTerrain(terrain: Terrain, camera: Camera, theme: DesertTheme) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const leftWorld = camera.screenToWorld(-10, 0).x;
    const rightWorld = camera.screenToWorld(w + 10, 0).x;
    terrain.ensureRange(leftWorld, rightWorld);

    ctx.save();

    // Foreground Fill
    ctx.beginPath();
    ctx.moveTo(0, h);

    const segW = terrain.segmentWidth;
    const startIdx = Math.floor(leftWorld / segW) - 1;
    const endIdx = Math.ceil(rightWorld / segW) + 1;
    const points: { x: number; y: number }[] = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const worldX = i * segW;
      const worldY = terrain.getVertexHeight(i);
      const screenPos = camera.worldToScreen(worldX, worldY);
      points.push(screenPos);
      ctx.lineTo(screenPos.x, screenPos.y);
    }

    ctx.lineTo(w + 10, h);
    ctx.closePath();

    // Sand dune gradient fill
    const sandGrad = ctx.createLinearGradient(0, h * 0.3, 0, h);
    sandGrad.addColorStop(0, theme.duneFront);
    sandGrad.addColorStop(1, theme.duneLine);
    ctx.fillStyle = sandGrad;
    ctx.fill();

    // Crisp crest line (Desert Golfing signature polygonal edge)
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) {
        ctx.moveTo(points[i].x, points[i].y);
      } else {
        ctx.lineTo(points[i].x, points[i].y);
      }
    }
    ctx.strokeStyle = theme.duneLine;
    ctx.lineWidth = Math.max(2.5, 3.2 * camera.zoom);
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 3;
    ctx.stroke();

    ctx.restore();
  }

  private renderTank(tank: Tank, camera: Camera) {
    if (!tank.isAlive) return;

    const ctx = this.ctx;
    const screenPos = camera.worldToScreen(tank.x, tank.y);
    const z = camera.zoom;
    const susp = tank.suspensionOffset;

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(tank.angle); // Rotate by rigid body orientation
    ctx.scale(z, z);
    ctx.translate(0, 14); // Offset from center of mass to bottom track line

    // 1. Caterpillar Track Belt, Animated Cleats, and 5 Road Wheels (FLUSH WITH TERRAIN)
    this.renderCaterpillarTracks(tank);

    // 2. Hull Chassis, Turret, and Cannon (rock on suspension springs with hullPitchRock)
    ctx.save();
    ctx.rotate(tank.hullPitchRock);

    // Hull Chassis (Sloped military armor, shifts with central suspension heave)
    ctx.fillStyle = tank.baseColor;
    ctx.beginPath();
    // Lower hull bottom
    ctx.moveTo(-47, -15.5 + susp);
    ctx.lineTo(47, -15.5 + susp);
    // Sloped front glacis armor plate
    ctx.lineTo(38, -29 + susp);
    // Top deck
    ctx.lineTo(-40, -29 + susp);
    // Sloped rear armor
    ctx.lineTo(-47, -15.5 + susp);
    ctx.closePath();
    ctx.fill();

    // Side skirt / fender armor trim
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-49, -15.5 + susp);
    ctx.lineTo(49, -15.5 + susp);
    ctx.stroke();

    // Engine deck cooling louvers (rear deck)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1.6;
    const louverX = tank.isPlayer ? -34 : 16;
    for (let l = 0; l < 4; l++) {
      ctx.beginPath();
      ctx.moveTo(louverX + l * 5, -29 + susp);
      ctx.lineTo(louverX + l * 5, -23 + susp);
      ctx.stroke();
    }

    // Turret Cabin
    ctx.fillStyle = tank.accentColor;
    const turretBaseX = tank.isPlayer ? 10 : -10;
    const turretBaseY = -29 + susp;
    ctx.beginPath();
    // Angular / rounded turret cupola
    ctx.moveTo(turretBaseX - 20, turretBaseY);
    ctx.lineTo(turretBaseX + 20, turretBaseY);
    ctx.lineTo(turretBaseX + 15, turretBaseY - 15);
    ctx.lineTo(turretBaseX - 15, turretBaseY - 15);
    ctx.closePath();
    ctx.fill();

    // Commander optic cupola bump
    ctx.fillStyle = tank.baseColor;
    ctx.beginPath();
    ctx.arc(turretBaseX - (tank.isPlayer ? 6 : -6), turretBaseY - 15, 4.5, Math.PI, 0);
    ctx.fill();

    // Cannon Barrel & Mantlet
    const barrelAngleRad = (tank.barrelAngleDeg * Math.PI) / 180;
    const turretPivotX = tank.isPlayer ? 12 : -12;
    const turretPivotY = turretBaseY - 4;

    ctx.save();
    ctx.translate(turretPivotX, turretPivotY);
    const totalAngle = tank.angle + tank.hullPitchRock;
    ctx.rotate(tank.isPlayer ? -barrelAngleRad - totalAngle : Math.PI + barrelAngleRad - totalAngle);

    // Armored barrel mantlet collar
    ctx.fillStyle = tank.baseColor;
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    // Lengthened barrel tube (52px long)
    ctx.fillStyle = tank.treadColor;
    ctx.fillRect(0, -4.5, 52, 9);

    // Muzzle brake
    ctx.fillStyle = tank.baseColor;
    ctx.fillRect(48, -6.8, 8, 13.6);
    ctx.fillStyle = '#1c1815';
    ctx.fillRect(51, -3.6, 4.5, 7.2);

    ctx.restore();

    // Antenna / Target Flag
    if (!tank.isPlayer) {
      // Enemy targeting flag on rear hull
      ctx.strokeStyle = '#9e2a2b';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-32, turretBaseY);
      ctx.lineTo(-32, turretBaseY - 36);
      ctx.stroke();

      // Fluttering flag banner
      const flutter = Math.sin(performance.now() * 0.008) * 4.5;
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.moveTo(-32, turretBaseY - 36);
      ctx.lineTo(-8 + flutter, turretBaseY - 27);
      ctx.lineTo(-32, turretBaseY - 18);
      ctx.closePath();
      ctx.fill();
    } else {
      // Player antenna on rear hull
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-30, turretBaseY);
      ctx.lineTo(-34, turretBaseY - 32);
      ctx.stroke();

      // Antenna tip
      ctx.fillStyle = '#e76f51';
      ctx.beginPath();
      ctx.arc(-34, turretBaseY - 32, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Health bar if damaged
    if (tank.health < 100) {
      const barW = 72;
      const barH = 5.5;
      const barY = turretBaseY - 28;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(-barW / 2, barY, barW, barH);

      const healthPct = Math.max(0, tank.health / 100);
      ctx.fillStyle = tank.isPlayer ? '#2ecc71' : '#e74c3c';
      ctx.fillRect(-barW / 2, barY, barW * healthPct, barH);
    }

    ctx.restore(); // end hull rock

    ctx.restore(); // end tank transform
  }

  /**
   * Conforming Caterpillar Track Simulation:
   * Dynamic closed-loop rubber/steel belt, animated scrolling cleats/links,
   * 5 independent road wheels at their suspension heights, and drive sprockets.
   */
  private renderCaterpillarTracks(tank: Tank) {
    const ctx = this.ctx;
    const r = tank.wheelRadius; // 7.5
    const idlerX = 46;
    const idlerY = -8.0;
    const sprocketX = -46;
    const sprocketY = -8.0;

    // Road wheel coordinates: bottom touches ground (y = 0) when suspension is 0
    const wheels = tank.wheelXOffsets.map((ox, i) => ({
      x: ox,
      y: -r + 0.5 - tank.wheelSuspension[i]
    }));

    // Construct closed-loop perimeter polyline (clockwise: top -> idler -> bottom wheels -> sprocket)
    const pts: { x: number; y: number }[] = [];

    // 1. Top return run from rear sprocket to front idler (with authentic catenary track sag)
    const topSegments = 8;
    for (let i = 0; i <= topSegments; i++) {
      const t = i / topSegments;
      const x = sprocketX + (idlerX - sprocketX) * t;
      const sag = Math.sin(t * Math.PI) * 1.8;
      const y = -r * 2 - 0.5 + sag;
      pts.push({ x, y });
    }

    // 2. Around front idler (curve around front)
    const idlerSteps = 6;
    for (let i = 1; i <= idlerSteps; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / idlerSteps;
      pts.push({
        x: idlerX + Math.cos(a) * (r - 0.8),
        y: idlerY + Math.sin(a) * (r - 0.8)
      });
    }

    // 3. Bottom run connecting the 5 road wheels from front to back
    for (let i = wheels.length - 1; i >= 0; i--) {
      pts.push({
        x: wheels[i].x,
        y: wheels[i].y + r
      });
    }

    // 4. Around rear drive sprocket (curve around back to top)
    const sprocSteps = 6;
    for (let i = 1; i < sprocSteps; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / sprocSteps;
      pts.push({
        x: sprocketX + Math.cos(a) * (r - 0.5),
        y: sprocketY + Math.sin(a) * (r - 0.5)
      });
    }

    // Draw Continuous Track Rubber/Steel Belt
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = tank.treadColor || '#231d18';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Draw Animated Tread Links / Cleats around perimeter
    let totalLen = 0;
    const segLens: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      const d = Math.hypot(next.x - pts[i].x, next.y - pts[i].y);
      segLens.push(d);
      totalLen += d;
    }

    const linkSpacing = 8.0;
    const offset = ((tank.treadOffset % linkSpacing) + linkSpacing) % linkSpacing;
    const numLinks = Math.floor(totalLen / linkSpacing);

    ctx.strokeStyle = '#4e433a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();

    let curDist = offset;
    let segIdx = 0;
    let accumulatedDist = 0;

    for (let k = 0; k < numLinks; k++) {
      const targetDist = curDist;
      curDist += linkSpacing;

      while (segIdx < pts.length && accumulatedDist + segLens[segIdx] < targetDist) {
        accumulatedDist += segLens[segIdx];
        segIdx++;
      }
      if (segIdx >= pts.length) break;

      const p1 = pts[segIdx];
      const p2 = pts[(segIdx + 1) % pts.length];
      const segLen = segLens[segIdx] || 1;
      const t = (targetDist - accumulatedDist) / segLen;

      const px = p1.x + (p2.x - p1.x) * t;
      const py = p1.y + (p2.y - p1.y) * t;

      // Tangent and outward normal for clockwise polygon (nx = ty, ny = -tx)
      const tx = (p2.x - p1.x) / segLen;
      const ty = (p2.y - p1.y) / segLen;
      const nx = ty;
      const ny = -tx;

      // Subtle cleat depth: slightly reduced on bottom so it sits flush on the sand
      const cleatDepth = (ny > 0.3) ? 0.9 : 2.8;
      ctx.moveTo(px, py);
      ctx.lineTo(px + nx * cleatDepth, py + ny * cleatDepth);
    }
    ctx.stroke();

    // Draw 5 Road Wheels at their actual suspension heights
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      // Outer rubber tire
      ctx.fillStyle = '#2c231c';
      ctx.beginPath();
      ctx.arc(w.x, w.y, r - 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Steel wheel rim
      ctx.fillStyle = tank.accentColor;
      ctx.beginPath();
      ctx.arc(w.x, w.y, r - 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Rotating hub bolts
      ctx.fillStyle = '#1a140f';
      for (let s = 0; s < 4; s++) {
        const spokeAngle = tank.wheelRot + (s * Math.PI * 2) / 4 + i * 0.6;
        const sx = w.x + Math.cos(spokeAngle) * 2.8;
        const sy = w.y + Math.sin(spokeAngle) * 2.8;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Drive Sprocket (Rear)
    ctx.fillStyle = '#1e1813';
    ctx.beginPath();
    ctx.arc(sprocketX, sprocketY, r - 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tank.baseColor;
    ctx.beginPath();
    ctx.arc(sprocketX, sprocketY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Idler Wheel (Front)
    ctx.fillStyle = '#261f18';
    ctx.beginPath();
    ctx.arc(idlerX, idlerY, r - 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tank.accentColor;
    ctx.beginPath();
    ctx.arc(idlerX, idlerY, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }



  private renderAimGuide(
    tank: Tank,
    aimState: AimState,
    camera: Camera,
    lastShotAngle: number | null = null,
    lastShotPower: number | null = null
  ) {
    const ctx = this.ctx;
    const tip = tank.getBarrelTip();

    const speed = 160 + (aimState.powerPct / 100) * 780;
    const rad = tip.worldAngleRad;

    // Ballistics preview arc (short minimalist dotted trajectory)
    ctx.save();
    ctx.fillStyle = 'rgba(70, 40, 20, 0.7)';

    const previewSteps = 16;
    const dt = 0.055;
    let simX = tip.x;
    let simY = tip.y;
    let simVx = Math.cos(rad) * speed;
    let simVy = Math.sin(rad) * speed;

    for (let i = 1; i <= previewSteps; i++) {
      simVx += 0; // slight wind preview omitted for pure trajectory intuition
      simVy += 480 * dt;
      simX += simVx * dt;
      simY += simVy * dt;

      const pt = camera.worldToScreen(simX, simY);
      const alpha = 1.0 - i / previewSteps;
      const dotSize = Math.max(1.5, (4 - i * 0.18) * camera.zoom);

      ctx.fillStyle = `rgba(50, 30, 15, ${alpha * 0.75})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Forward aiming guide line & target reticle
    if (aimState.isDragging) {
      // 1. Sleek drag aim line
      ctx.beginPath();
      ctx.moveTo(aimState.dragStartX, aimState.dragStartY);
      ctx.lineTo(aimState.dragCurrentX, aimState.dragCurrentY);
      ctx.strokeStyle = 'rgba(195, 55, 35, 0.75)';
      ctx.lineWidth = 3.0;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Start anchor circle
      ctx.beginPath();
      ctx.arc(aimState.dragStartX, aimState.dragStartY, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(195, 55, 35, 0.7)';
      ctx.fill();

      // 3. Current drag reticle / indicator
      ctx.beginPath();
      ctx.arc(aimState.dragCurrentX, aimState.dragCurrentY, 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(195, 55, 35, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(aimState.dragCurrentX, aimState.dragCurrentY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b4a';
      ctx.fill();

      // 4. Large Floating Angle & Power HUD Badge
      const hasLastShot = lastShotAngle !== null && lastShotPower !== null;
      const currentText = `${aimState.angleDeg}° • ${aimState.powerPct}%`;
      const lastText = hasLastShot ? `LAST: ${lastShotAngle}° • ${lastShotPower}%` : '';

      ctx.font = 'bold 20px "Space Mono", monospace';
      const curMetrics = ctx.measureText(currentText);

      ctx.font = 'bold 12px "Space Mono", monospace';
      const lastMetrics = hasLastShot ? ctx.measureText(lastText) : { width: 0 };

      const contentWidth = Math.max(curMetrics.width, lastMetrics.width);
      const paddingX = 14;
      const boxW = contentWidth + paddingX * 2;
      const boxH = hasLastShot ? 54 : 36;

      // Keep badge on-screen and positioned above the user's touch
      const badgeX = Math.max(boxW / 2 + 12, Math.min(this.canvas.width - boxW / 2 - 12, aimState.dragCurrentX));
      const badgeY = Math.max(boxH / 2 + 56, aimState.dragCurrentY - (hasLastShot ? 46 : 34));

      // Background rounded card with sleek subtle shadow & border
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;

      ctx.fillStyle = 'rgba(42, 26, 15, 0.92)';
      ctx.beginPath();
      ctx.roundRect(badgeX - boxW / 2, badgeY - boxH / 2, boxW, boxH, 8);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = 'rgba(235, 180, 115, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Render Current Angle & Power (Big & Bold!)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 20px "Space Mono", monospace';
      ctx.fillStyle = '#fff9ee';
      const curY = hasLastShot ? badgeY - 10 : badgeY;
      ctx.fillText(currentText, badgeX, curY);

      // Render Last Shot telemetry
      if (hasLastShot) {
        ctx.font = 'bold 12px "Space Mono", monospace';
        ctx.fillStyle = '#d4a373';
        ctx.fillText(lastText, badgeX, badgeY + 14);
      }
    }

    ctx.restore();
  }

  private renderProjectile(projectile: Projectile, camera: Camera) {
    const ctx = this.ctx;
    const screenPos = camera.worldToScreen(projectile.x, projectile.y);
    const z = camera.zoom;

    ctx.save();
    ctx.fillStyle = '#221811';
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, projectile.radius * z, 0, Math.PI * 2);
    ctx.fill();

    // Hot trailing core
    ctx.fillStyle = '#f39c12';
    ctx.beginPath();
    ctx.arc(screenPos.x - (projectile.vx * 0.004 * z), screenPos.y - (projectile.vy * 0.004 * z), (projectile.radius * 0.6) * z, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderParticles(particles: ParticleSystem, camera: Camera) {
    const ctx = this.ctx;
    const z = camera.zoom;
    const list = particles.getParticles();

    for (const p of list) {
      const screenPos = camera.worldToScreen(p.x, p.y);
      const alpha = Math.max(0, p.life / p.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, Math.max(1, p.size * z), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
