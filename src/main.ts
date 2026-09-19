/**
 * Dune Artillery - Main Game Controller
 * Inspired by the minimalist gameplay and endless journey of Desert Golfing.
 * Features tactical driving and turn-based artillery duels with enemy AI.
 */

import './style.css';
import { Terrain } from './engine/terrain.ts';
import { Camera } from './engine/camera.ts';
import { Renderer } from './render/renderer.ts';
import { Tank } from './game/tank.ts';
import { Projectile } from './game/projectile.ts';
import { ParticleSystem } from './game/particles.ts';
import { GameState } from './game/gameState.ts';
import { InputManager } from './game/input.ts';
import { EnemyAI } from './game/enemyAI.ts';
import { audio } from './engine/audio.ts';

type TurnState = 'none' | 'exploding' | 'enemy_turn' | 'enemy_firing' | 'player_destroyed' | 'resetting';

class GameApp {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private terrain: Terrain;
  private camera: Camera;
  private particles: ParticleSystem;
  private gameState: GameState;
  private input: InputManager;
  private enemyAI!: EnemyAI;

  private playerTank!: Tank;
  private enemyTank!: Tank;
  private activeProjectile: Projectile | null = null;
  private currentShooter: 'player' | 'enemy' = 'player';

  private isSimulatingTurn: boolean = false;
  private transitionState: TurnState = 'none';
  private transitionTimer: number = 0;
  private lastTime: number = 0;

  // DOM Elements
  private targetDisplay: HTMLElement;
  private shotsDisplay: HTMLElement;
  private lastShotDisplay: HTMLElement;
  private windArrow: HTMLElement;
  private windValue: HTMLElement;
  private statusBanner: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private soundIcon: HTMLElement;
  private resetBtn: HTMLButtonElement;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.targetDisplay = document.getElementById('target-display')!;
    this.shotsDisplay = document.getElementById('shots-display')!;
    this.lastShotDisplay = document.getElementById('last-shot-display')!;
    this.windArrow = document.getElementById('wind-arrow')!;
    this.windValue = document.getElementById('wind-value')!;
    this.statusBanner = document.getElementById('status-banner')!;
    this.soundBtn = document.getElementById('sound-btn') as HTMLButtonElement;
    this.soundIcon = document.getElementById('sound-icon')!;
    this.resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;

    // Initialize systems
    this.resizeCanvas();
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.renderer = new Renderer(this.canvas);
    this.particles = new ParticleSystem();
    this.gameState = new GameState();

    const baseGroundY = Math.max(480, this.canvas.height * 0.65);
    this.terrain = new Terrain(2026, baseGroundY);

    this.input = new InputManager(this.canvas);
    this.setupTargets();

    this.setupListeners();
    this.updateHUD();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;

    if (this.camera) {
      this.camera.resize(this.canvas.width, this.canvas.height);
    }
  }

  private setupTargets() {
    const targetIdx = this.gameState.currentTargetIndex;

    const prevPlayerX = this.playerTank ? this.playerTank.x : 220;
    const playerX = 220 + (targetIdx - 1) * 1400;
    const dist = 1000 + Math.min(1200, targetIdx * 75) + (Math.random() * 160 - 80);
    const enemyX = this.terrain.findStableSpot(playerX + dist - 60, playerX + dist + 60);

    // Remove any explosion craters to the next point!
    this.terrain.clearCraters(Math.min(prevPlayerX, playerX) - 300, enemyX + 400);

    // Player Tank (spawned directly on terrain with zero world penetration)
    if (!this.playerTank) {
      this.playerTank = new Tank(
        {
          x: playerX,
          isPlayer: true,
          baseColor: '#3c4e38', // Desert camo olive
          accentColor: '#5c7257',
          treadColor: '#283325',
        },
        this.terrain
      );
    } else {
      this.playerTank.x = playerX;
      this.playerTank.alignToTerrain(this.terrain);
      this.playerTank.resetHealth();
    }
    this.playerTank.refillFuel();
    this.input.updateFuelUI(100);

    // Enemy Tank (spawn directly on terrain)
    this.enemyTank = new Tank(
      {
        x: enemyX,
        isPlayer: false,
        baseColor: '#963d32', // Terracotta crimson
        accentColor: '#b85448',
        treadColor: '#4f1e18',
      },
      this.terrain
    );

    // AI Controller
    if (!this.enemyAI) {
      this.enemyAI = new EnemyAI(this.enemyTank, this.playerTank, this.terrain, this.particles);
    } else {
      this.enemyAI.setTargets(this.enemyTank, this.playerTank);
    }

    this.transitionState = 'none';
    this.isSimulatingTurn = false;
    this.input.setCanFire(true);
    this.input.setTurnBadge(true);
    this.input.setPlayerTank(this.playerTank);
    this.camera.frameTargets(this.playerTank.x, this.playerTank.y, this.enemyTank.x, this.enemyTank.y);
    this.showBanner(targetIdx === 1 ? 'TARGET 1' : `TARGET ${targetIdx}`, 1800);
  }

  private setupListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    this.input.onFire(() => this.fireArtillery());

    // Sound toggle
    this.soundBtn.addEventListener('click', () => {
      const isMuted = audio.toggleMute();
      this.soundIcon.textContent = isMuted ? '🔇' : '🔊';
    });
    this.soundIcon.textContent = audio.getIsMuted() ? '🔇' : '🔊';

    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        const isMuted = audio.toggleMute();
        this.soundIcon.textContent = isMuted ? '🔇' : '🔊';
      }
    });

    // Reset button
    this.resetBtn.addEventListener('click', () => {
      if (confirm('Start over from Target 1?')) {
        this.gameState.resetProgress();
        this.activeProjectile = null;
        this.isSimulatingTurn = false;
        this.transitionState = 'none';
        this.particles.clear();
        this.terrain.clearCraters();
        this.setupTargets();
        this.updateHUD();
      }
    });
  }

  private fireArtillery() {
    if (this.isSimulatingTurn || !this.playerTank.isAlive || this.playerTank.isFlippedOnBack()) return;

    this.isSimulatingTurn = true;
    this.currentShooter = 'player';
    this.input.setCanFire(false);
    this.gameState.recordShot(this.input.aim.angleDeg, this.input.aim.powerPct);
    this.updateHUD();

    const tip = this.playerTank.getBarrelTip();

    // Muzzle blast visual, physical recoil & audio
    this.particles.emitMuzzleBlast(tip.x, tip.y, tip.worldAngleRad);
    this.playerTank.applyRecoil(this.input.aim.powerPct, tip.worldAngleRad);
    this.camera.addShake(0.35);
    audio.playFire();

    this.activeProjectile = new Projectile(
      tip.x,
      tip.y,
      tip.worldAngleRad,
      this.input.aim.powerPct,
      this.gameState.windMph
    );
  }

  private updateHUD() {
    this.targetDisplay.textContent = String(this.gameState.currentTargetIndex);
    this.shotsDisplay.textContent = String(this.gameState.totalShots);

    if (this.gameState.lastShotAngle !== null && this.gameState.lastShotPower !== null) {
      this.lastShotDisplay.textContent = `${this.gameState.lastShotAngle}° / ${this.gameState.lastShotPower}%`;
    } else {
      this.lastShotDisplay.textContent = '--';
    }

    const wind = this.gameState.windMph;
    const absWind = Math.abs(wind);
    this.windValue.textContent = `${absWind} MPH`;

    if (wind > 0) {
      this.windArrow.style.transform = 'rotate(0deg)';
      this.windArrow.style.opacity = '1';
    } else if (wind < 0) {
      this.windArrow.style.transform = 'rotate(180deg)';
      this.windArrow.style.opacity = '1';
    } else {
      this.windArrow.style.transform = 'rotate(0deg)';
      this.windArrow.style.opacity = '0.3';
    }
  }

  private showBanner(text: string, durationMs: number = 2200) {
    this.statusBanner.textContent = text;
    this.statusBanner.classList.add('visible');
    setTimeout(() => {
      this.statusBanner.classList.remove('visible');
    }, durationMs);
  }

  private loop(currentTime: number) {
    const dt = Math.min(0.06, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    // 1. Update particles
    this.particles.update(dt);

    // Subtle atmospheric desert wind particles
    if (Math.random() < 0.25) {
      const leftWorld = this.camera.screenToWorld(0, 0).x;
      const rightWorld = this.camera.screenToWorld(this.canvas.width, 0).x;
      const topWorld = this.camera.screenToWorld(0, 0).y;
      const bottomWorld = this.camera.screenToWorld(0, this.canvas.height).y;
      this.particles.emitWindBreeze(leftWorld, rightWorld, topWorld, bottomWorld, this.gameState.windMph);
    }

    // 2. Interactive driving during player's turn
    if (this.transitionState === 'none' && !this.isSimulatingTurn && this.playerTank.isAlive) {
      const dir = this.input.driveDirection;
      if (dir !== 0) {
        this.playerTank.driveManual(dir, dt, this.terrain, this.particles);
        this.input.updateFuelUI(this.playerTank.fuel);
      }
    }

    // 3. Update physics on both tanks
    this.playerTank.update(dt, this.terrain, this.particles, this.gameState.windMph);
    this.enemyTank.update(dt, this.terrain, this.particles, this.gameState.windMph);

    // Check if player died (shot, fallen off cliff, or flipped on back!)
    if (!this.playerTank.isAlive && this.transitionState !== 'player_destroyed' && this.transitionState !== 'exploding') {
      this.transitionState = 'player_destroyed';
      this.transitionTimer = 1.8;
      this.input.setCanFire(false);
      this.currentShooter = 'player';
      const isFlipped = this.playerTank.isFlippedOnBack();
      this.showBanner(isFlipped ? 'TANK FLIPPED! DESTROYED!' : 'TANK DESTROYED! RE-DEPLOYING...', 2200);
      this.particles.emitExplosion(this.playerTank.x, this.playerTank.y, true);
      audio.playExplosion();
      this.camera.addShake(0.55);
    }

    // Check if enemy died (shot, self-destruction, falling, or flipped on back!)
    if (!this.enemyTank.isAlive && this.transitionState !== 'exploding' && this.transitionState !== 'player_destroyed') {
      this.transitionState = 'exploding';
      this.transitionTimer = 1.6;
      const isFlipped = this.enemyTank.isFlippedOnBack();
      let msg = 'TARGET DESTROYED!';
      if (isFlipped) {
        msg = 'ENEMY FLIPPED! DESTROYED!';
      } else if (this.currentShooter === 'enemy') {
        msg = 'ENEMY SELF-DESTRUCTED!';
      }
      this.showBanner(msg, 2200);
      this.particles.emitExplosion(this.enemyTank.x, this.enemyTank.y, true);
      audio.playExplosion();
      this.camera.addShake(0.55);
    }

    // 4. Projectile flight simulation
    if (this.activeProjectile && this.activeProjectile.isAlive) {
      this.camera.trackProjectile(
        this.activeProjectile.x,
        this.activeProjectile.y,
        this.playerTank.x,
        this.enemyTank.x
      );

      const hit = this.activeProjectile.update(
        dt,
        this.terrain,
        [this.playerTank, this.enemyTank],
        this.particles,
        this.camera
      );

      if (hit) {
        if (!this.enemyTank.isAlive) {
          // Handled by enemy death check
        } else if (this.currentShooter === 'player') {
          // Enemy survived player shot: trigger Enemy Turn!
          this.transitionState = 'enemy_turn';
          this.transitionTimer = 0.8;
          this.showBanner("ENEMY'S TURN", 1600);
          this.input.setTurnBadge(false);
        } else {
          // Enemy fired at player
          if (!this.playerTank.isAlive) {
            // Handled by player death check
          } else {
            // Player survived enemy shot: return turn to player!
            this.transitionState = 'resetting';
            this.transitionTimer = 0.8;
            this.showBanner('YOUR TURN', 1400);
          }
        }
      }
    }

    // 5. Enemy AI Turn Handling
    if (this.transitionState === 'enemy_turn') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        // When enemy's turn arrives, check if enemy is flipped upside down!
        if (this.enemyTank.isFlippedOnBack()) {
          this.transitionState = 'exploding';
          this.transitionTimer = 1.6;
          this.showBanner('ENEMY FLIPPED! DESTROYED!', 2200);
          this.particles.emitExplosion(this.enemyTank.x, this.enemyTank.y, true);
          audio.playExplosion();
          this.camera.addShake(0.55);
          this.enemyTank.takeDamage(100);
        } else {
          this.transitionState = 'enemy_firing';
          this.enemyAI.startTurn(this.gameState.windMph);
        }
      }
    } else if (this.transitionState === 'enemy_firing') {
      // If enemy flipped over during turn maneuver
      if (this.enemyTank.isFlippedOnBack()) {
        this.transitionState = 'exploding';
        this.transitionTimer = 1.6;
        this.showBanner('ENEMY FLIPPED! DESTROYED!', 2200);
        this.particles.emitExplosion(this.enemyTank.x, this.enemyTank.y, true);
        audio.playExplosion();
        this.camera.addShake(0.55);
        this.enemyTank.takeDamage(100);
      } else {
        const enemyProj = this.enemyAI.update(dt, this.gameState.windMph);
        if (enemyProj) {
          this.activeProjectile = enemyProj;
          this.currentShooter = 'enemy';
          this.camera.addShake(0.32);
        }
      }
    }

    // 6. Post-shot & Lifecycle Transitions
    if (this.transitionState === 'exploding') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        // Target defeated: Advance round and setup next target (removes craters to next point!)
        this.gameState.advanceTarget();
        this.updateHUD();
        this.setupTargets();
      }
    } else if (this.transitionState === 'player_destroyed') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        // Re-deploy player on the terrain with craters removed and spawn clearance
        const playerX = 220 + (this.gameState.currentTargetIndex - 1) * 1400;
        this.terrain.clearCraters(playerX - 250, this.enemyTank.x + 350);
        this.playerTank.x = playerX;
        this.playerTank.alignToTerrain(this.terrain);
        this.enemyTank.alignToTerrain(this.terrain);
        this.playerTank.resetHealth();
        this.playerTank.refillFuel();
        this.input.updateFuelUI(100);

        this.transitionState = 'none';
        this.isSimulatingTurn = false;
        this.activeProjectile = null;
        this.input.setCanFire(true);
        this.input.setTurnBadge(true);
        this.camera.frameTargets(this.playerTank.x, this.playerTank.y, this.enemyTank.x, this.enemyTank.y);
      }
    } else if (this.transitionState === 'resetting') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        // It is now the player's turn! Check if player is flipped upside down
        if (this.playerTank.isFlippedOnBack()) {
          this.transitionState = 'player_destroyed';
          this.transitionTimer = 1.8;
          this.input.setCanFire(false);
          this.currentShooter = 'player';
          this.showBanner('TANK FLIPPED! DESTROYED!', 2200);
          this.particles.emitExplosion(this.playerTank.x, this.playerTank.y, true);
          audio.playExplosion();
          this.camera.addShake(0.55);
          this.playerTank.takeDamage(100);
        } else {
          // Return turn to player
          this.playerTank.refillFuel();
          this.input.updateFuelUI(100);
          this.camera.frameTargets(this.playerTank.x, this.playerTank.y, this.enemyTank.x, this.enemyTank.y);
          this.transitionState = 'none';
          this.isSimulatingTurn = false;
          this.activeProjectile = null;
          this.input.setCanFire(true);
          this.input.setTurnBadge(true);
        }
      }
    } else if (!this.isSimulatingTurn) {
      // Active player turn check: if player flipped upside down during driving or standstill
      if (this.playerTank.isFlippedOnBack()) {
        this.input.setCanFire(false);
        if (this.playerTank.upsideDownTimer > 0.6) {
          this.transitionState = 'player_destroyed';
          this.transitionTimer = 1.8;
          this.currentShooter = 'player';
          this.showBanner('TANK FLIPPED! DESTROYED!', 2200);
          this.particles.emitExplosion(this.playerTank.x, this.playerTank.y, true);
          audio.playExplosion();
          this.camera.addShake(0.55);
          this.playerTank.takeDamage(100);
        }
      }

      const isAiming = this.input.aim.isDragging && !this.playerTank.isFlippedOnBack();
      this.camera.frameTargets(this.playerTank.x, this.playerTank.y, this.enemyTank.x, this.enemyTank.y, isAiming);
    }

    this.camera.update(dt);
  }

  private render() {
    const theme = this.gameState.getCurrentTheme();
    this.renderer.render(
      this.terrain,
      this.camera,
      this.playerTank,
      this.enemyTank,
      this.activeProjectile,
      this.particles,
      theme,
      this.input.aim,
      !this.isSimulatingTurn && this.playerTank.isAlive && !this.playerTank.isFlippedOnBack(),
      this.gameState.lastShotAngle,
      this.gameState.lastShotPower
    );
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
