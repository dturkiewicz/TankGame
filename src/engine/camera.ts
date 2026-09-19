/**
 * Smooth Tracking Camera with Dynamic Zoom & Screen Shake
 * Inspired by Desert Golfing's serene cinematic framing.
 */

export class Camera {
  public x: number = 0;
  public y: number = 0;
  public targetX: number = 0;
  public targetY: number = 0;
  public zoom: number = 1.0;
  public targetZoom: number = 1.0;

  // Viewport dimensions
  public viewportWidth: number = 1200;
  public viewportHeight: number = 800;

  // Screen shake
  private shakeTrauma: number = 0;
  private shakeOffsetX: number = 0;
  private shakeOffsetY: number = 0;

  constructor(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public resize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public addShake(amount: number) {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + amount);
  }

  public update(dt: number) {
    // Smooth position interpolation (critically damped)
    const posLerp = 1.0 - Math.pow(0.001, dt);
    this.x += (this.targetX - this.x) * posLerp;
    this.y += (this.targetY - this.y) * posLerp;

    // Smooth zoom interpolation
    const zoomLerp = 1.0 - Math.pow(0.005, dt);
    this.zoom += (this.targetZoom - this.zoom) * zoomLerp;

    // Screen shake decay & calculation
    if (this.shakeTrauma > 0) {
      const shakePower = Math.pow(this.shakeTrauma, 2);
      const maxOffset = 14 * shakePower;
      this.shakeOffsetX = (Math.random() * 2 - 1) * maxOffset;
      this.shakeOffsetY = (Math.random() * 2 - 1) * maxOffset;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.0);
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  /**
   * Set framing target to cover player and enemy, guaranteeing player is always in view
   */
  public frameTargets(playerX: number, playerY: number, enemyX: number, _enemyY: number, isAiming: boolean = false) {
    const dist = Math.abs(enemyX - playerX);
    const isPortrait = this.viewportHeight > this.viewportWidth;

    if (isAiming) {
      // While aiming: pull camera back smoothly to frame the trajectory arc & battlefield
      if (isPortrait) {
        const fitZoom = (this.viewportWidth * 0.82) / (dist + 260);
        this.targetZoom = Math.min(1.05, Math.max(0.52, fitZoom));
        const worldSpan = this.viewportWidth / this.targetZoom;
        this.targetX = playerX + worldSpan * 0.28;
        this.targetY = playerY - 90;
      } else {
        const fitZoom = (this.viewportWidth * 0.78) / (dist + 300);
        this.targetZoom = Math.min(0.95, Math.max(0.55, fitZoom));
        const worldSpan = this.viewportWidth / this.targetZoom;
        this.targetX = playerX + worldSpan * 0.24;
        this.targetY = playerY - 80;
      }
    } else {
      // When NOT aiming: zoom in close to the 2x player tank for clear driving view
      if (isPortrait) {
        this.targetZoom = 1.25;
        this.targetX = playerX + 70;
        this.targetY = playerY - 60;
      } else {
        this.targetZoom = 1.05;
        this.targetX = playerX + 120;
        this.targetY = playerY - 55;
      }
    }
  }

  /**
   * Track projectile in flight
   */
  public trackProjectile(projX: number, projY: number, playerX: number, enemyX: number) {
    this.targetX = projX + 60; // slightly ahead of shell
    this.targetY = projY - 40;

    // Keep zoom stable or slightly widened to see arc
    const span = Math.abs(enemyX - playerX);
    const wideZoom = Math.min(1.0, Math.max(0.6, (this.viewportWidth * 0.7) / span));
    this.targetZoom = wideZoom;
  }

  /**
   * Focus on single position (e.g. driving tank)
   */
  public focusOn(x: number, y: number, zoom: number = 0.95) {
    this.targetX = x + 120;
    this.targetY = y - 80;
    this.targetZoom = zoom;
  }

  /**
   * Transform world coordinates to screen coordinates
   */
  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const screenX = (worldX - this.x) * this.zoom + this.viewportWidth / 2 + this.shakeOffsetX;
    const screenY = (worldY - this.y) * this.zoom + this.viewportHeight / 2 + this.shakeOffsetY;
    return { x: screenX, y: screenY };
  }

  /**
   * Transform screen coordinates to world coordinates
   */
  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const worldX = (screenX - this.viewportWidth / 2 - this.shakeOffsetX) / this.zoom + this.x;
    const worldY = (screenY - this.viewportHeight / 2 - this.shakeOffsetY) / this.zoom + this.y;
    return { x: worldX, y: worldY };
  }
}
