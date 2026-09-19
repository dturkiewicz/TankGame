/**
 * Input Coordinator
 * Manages tank driving controls (left/right buttons and keys), slingshot aiming, and fuel UI.
 */

import { Tank } from './tank.ts';

export interface AimState {
  angleDeg: number;
  powerPct: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  dragCurrentX: number;
  dragCurrentY: number;
}

export class InputManager {
  public aim: AimState = {
    angleDeg: 45,
    powerPct: 60,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragCurrentX: 0,
    dragCurrentY: 0,
  };

  public driveDirection: -1 | 0 | 1 = 0;

  private canvas: HTMLCanvasElement;
  private playerTank: Tank | null = null;
  private onFireCallback: (() => void) | null = null;
  private canFire: boolean = true;
  private canDrive: boolean = true;

  // DOM Elements
  private btnMoveLeft: HTMLButtonElement | null;
  private btnMoveRight: HTMLButtonElement | null;
  private turnBadge: HTMLElement | null;
  private fuelBarFill: HTMLElement | null;
  private fuelText: HTMLElement | null;

  // Key tracking
  private keysPressed = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.btnMoveLeft = document.getElementById('btn-move-left') as HTMLButtonElement | null;
    this.btnMoveRight = document.getElementById('btn-move-right') as HTMLButtonElement | null;
    this.turnBadge = document.getElementById('turn-badge');
    this.fuelBarFill = document.getElementById('fuel-bar-fill');
    this.fuelText = document.getElementById('fuel-text');

    this.bindEvents();
    this.syncUI();
  }

  public setPlayerTank(tank: Tank) {
    this.playerTank = tank;
    this.syncUI();
  }

  public setCanFire(can: boolean) {
    this.canFire = can;
    this.canDrive = can;
    if (this.btnMoveLeft) this.btnMoveLeft.disabled = !can;
    if (this.btnMoveRight) this.btnMoveRight.disabled = !can;
    if (!can) {
      this.driveDirection = 0;
    }
  }

  public setTurnBadge(isPlayer: boolean) {
    if (!this.turnBadge) return;
    if (isPlayer) {
      this.turnBadge.textContent = 'YOUR TURN';
      this.turnBadge.classList.remove('enemy');
    } else {
      this.turnBadge.textContent = 'ENEMY TURN';
      this.turnBadge.classList.add('enemy');
    }
  }

  public updateFuelUI(fuelPct: number) {
    const pct = Math.max(0, Math.min(100, Math.round(fuelPct)));
    if (this.fuelBarFill) {
      this.fuelBarFill.style.width = `${pct}%`;
    }
    if (this.fuelText) {
      this.fuelText.textContent = `FUEL ${pct}%`;
    }
  }

  public onFire(callback: () => void) {
    this.onFireCallback = callback;
  }

  private triggerFire() {
    if (!this.canFire || !this.onFireCallback || this.playerTank?.isFlippedOnBack()) return;
    this.setCanFire(false);
    this.onFireCallback();
  }

  private bindEvents() {
    // Drive Left button (pointer events support touch + mouse hold)
    if (this.btnMoveLeft) {
      const startLeft = (e: Event) => {
        e.preventDefault();
        if (this.canDrive && !this.playerTank?.isFlippedOnBack()) {
          this.driveDirection = -1;
          this.btnMoveLeft?.classList.add('active');
        }
      };
      const stopLeft = (e: Event) => {
        e.preventDefault();
        if (this.driveDirection === -1) {
          this.driveDirection = 0;
        }
        this.btnMoveLeft?.classList.remove('active');
      };

      this.btnMoveLeft.addEventListener('pointerdown', startLeft);
      this.btnMoveLeft.addEventListener('pointerup', stopLeft);
      this.btnMoveLeft.addEventListener('pointercancel', stopLeft);
      this.btnMoveLeft.addEventListener('pointerleave', stopLeft);
    }

    // Drive Right button
    if (this.btnMoveRight) {
      const startRight = (e: Event) => {
        e.preventDefault();
        if (this.canDrive && !this.playerTank?.isFlippedOnBack()) {
          this.driveDirection = 1;
          this.btnMoveRight?.classList.add('active');
        }
      };
      const stopRight = (e: Event) => {
        e.preventDefault();
        if (this.driveDirection === 1) {
          this.driveDirection = 0;
        }
        this.btnMoveRight?.classList.remove('active');
      };

      this.btnMoveRight.addEventListener('pointerdown', startRight);
      this.btnMoveRight.addEventListener('pointerup', stopRight);
      this.btnMoveRight.addEventListener('pointercancel', stopRight);
      this.btnMoveRight.addEventListener('pointerleave', stopRight);
    }

    // Pointer / Touch / Drag aiming directly on canvas
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.canFire || this.playerTank?.isFlippedOnBack()) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const screenX = (e.clientX - rect.left) * scaleX;
      const screenY = (e.clientY - rect.top) * scaleY;

      this.aim.isDragging = true;
      this.aim.dragStartX = screenX;
      this.aim.dragStartY = screenY;
      this.aim.dragCurrentX = screenX;
      this.aim.dragCurrentY = screenY;

      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.aim.isDragging || !this.canFire || this.playerTank?.isFlippedOnBack()) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const screenX = (e.clientX - rect.left) * scaleX;
      const screenY = (e.clientY - rect.top) * scaleY;

      this.aim.dragCurrentX = screenX;
      this.aim.dragCurrentY = screenY;

      // Desert Golfing slingshot mechanic: pulling backwards & downwards charges power & angle
      const dx = this.aim.dragStartX - this.aim.dragCurrentX;
      const dy = this.aim.dragCurrentY - this.aim.dragStartY;

      if (Math.hypot(dx, dy) > 12) {
        let rad = Math.atan2(dy, dx);
        let deg = (rad * 180) / Math.PI;

        // Clamp between 5 and 85 degrees
        deg = Math.max(5, Math.min(85, deg));
        this.aim.angleDeg = Math.round(deg);

        // Power scaled by drag length
        const pullDist = Math.hypot(dx, dy);
        const power = Math.max(5, Math.min(100, Math.round((pullDist / 180) * 100)));
        this.aim.powerPct = power;

        if (this.playerTank) {
          this.playerTank.barrelAngleDeg = this.aim.angleDeg;
        }
      }
    });

    const finishDrag = (e: PointerEvent) => {
      if (!this.aim.isDragging) return;
      this.aim.isDragging = false;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture might already be released
      }

      const dx = this.aim.dragStartX - this.aim.dragCurrentX;
      const dy = this.aim.dragCurrentY - this.aim.dragStartY;

      // Only fire if dragged with intention (more than 24px)
      if (Math.hypot(dx, dy) > 24 && this.canFire && !this.playerTank?.isFlippedOnBack()) {
        this.triggerFire();
      }
    };

    this.canvas.addEventListener('pointerup', finishDrag);
    this.canvas.addEventListener('pointercancel', finishDrag);

    // Keyboard driving & aiming
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this.keysPressed.add(e.code);

      if (this.canDrive && !this.playerTank?.isFlippedOnBack()) {
        if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          this.driveDirection = -1;
          this.btnMoveLeft?.classList.add('active');
        } else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          this.driveDirection = 1;
          this.btnMoveRight?.classList.add('active');
        }
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!this.playerTank?.isFlippedOnBack()) {
          this.triggerFire();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.code);

      const leftActive = this.keysPressed.has('ArrowLeft') || this.keysPressed.has('KeyA');
      const rightActive = this.keysPressed.has('ArrowRight') || this.keysPressed.has('KeyD');

      if (leftActive) {
        this.driveDirection = -1;
      } else if (rightActive) {
        this.driveDirection = 1;
      } else {
        this.driveDirection = 0;
        this.btnMoveLeft?.classList.remove('active');
        this.btnMoveRight?.classList.remove('active');
      }
    });
  }

  public syncUI() {
    if (this.playerTank) {
      this.playerTank.barrelAngleDeg = this.aim.angleDeg;
      this.updateFuelUI(this.playerTank.fuel);
    }
  }
}
