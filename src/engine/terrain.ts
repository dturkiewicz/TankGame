/**
 * Procedural Destructible Desert Terrain Engine
 * Generates rolling sand dunes and supports real-time cratering deformations.
 */

export interface Crater {
  x: number;
  y: number;
  radius: number;
}

export class Terrain {
  private baseSeed: number;
  private step: number = 3; // Horizontal pixel step per height sample
  private minX: number = -1000;
  private maxX: number = 5000;
  private heightSamples: Map<number, number> = new Map();
  private baseWorldY: number = 600; // Reference ground line

  constructor(seed: number = 1337, baseWorldY: number = 600) {
    this.baseSeed = seed;
    this.baseWorldY = baseWorldY;
    this.prepopulate(this.minX, this.maxX);
  }

  public setBaseWorldY(y: number) {
    this.baseWorldY = y;
  }

  // Pure procedural dune height function (multi-octave harmonic sines)
  private proceduralHeight(x: number): number {
    const s = this.baseSeed;
    // Layer 1: Long rolling dunes (wavelength ~ 1200px)
    const h1 = Math.sin((x + s * 11) * 0.0012) * 160;
    // Layer 2: Medium dunes (wavelength ~ 450px)
    const h2 = Math.sin((x * 1.5 + s * 37) * 0.0028) * 80;
    // Layer 3: Smaller desert ripples (wavelength ~ 180px)
    const h3 = Math.cos((x * 0.7 - s * 53) * 0.007) * 30;
    // Layer 4: Gentle micro-undulation (wavelength ~ 60px)
    const h4 = Math.sin(x * 0.025 + s) * 8;

    return this.baseWorldY + h1 + h2 + h3 + h4;
  }

  private prepopulate(fromX: number, toX: number) {
    const startIdx = Math.floor(fromX / this.step);
    const endIdx = Math.ceil(toX / this.step);

    for (let i = startIdx; i <= endIdx; i++) {
      if (!this.heightSamples.has(i)) {
        const x = i * this.step;
        this.heightSamples.set(i, this.proceduralHeight(x));
      }
    }
  }

  public ensureRange(startX: number, endX: number) {
    const padding = 1500;
    const requiredMin = startX - padding;
    const requiredMax = endX + padding;

    if (requiredMin < this.minX) {
      this.prepopulate(requiredMin, this.minX);
      this.minX = requiredMin;
    }
    if (requiredMax > this.maxX) {
      this.prepopulate(this.maxX, requiredMax);
      this.maxX = requiredMax;
    }
  }

  /**
   * Get ground Y coordinate for any world X position (interpolated)
   */
  public getHeight(x: number): number {
    this.ensureRange(x, x);

    const idx = Math.floor(x / this.step);
    const t = (x - idx * this.step) / this.step;

    const y0 = this.heightSamples.get(idx) ?? this.proceduralHeight(idx * this.step);
    const y1 = this.heightSamples.get(idx + 1) ?? this.proceduralHeight((idx + 1) * this.step);

    // Smooth Hermite / cosine interpolation
    const smoothT = (1 - Math.cos(t * Math.PI)) * 0.5;
    return y0 + (y1 - y0) * smoothT;
  }

  /**
   * Get surface slope angle in radians
   */
  public getAngle(x: number): number {
    const delta = 4;
    const yA = this.getHeight(x - delta);
    const yB = this.getHeight(x + delta);
    return Math.atan2(yB - yA, delta * 2);
  }

  /**
   * Deform terrain by an explosion crater
   */
  public addCrater(cx: number, cy: number, radius: number) {
    const rSq = radius * radius;
    const startIdx = Math.floor((cx - radius * 1.3) / this.step);
    const endIdx = Math.ceil((cx + radius * 1.3) / this.step);

    for (let i = startIdx; i <= endIdx; i++) {
      const x = i * this.step;
      const dist = Math.abs(x - cx);

      if (dist < radius) {
        // Deep scoop inside the crater
        const scoop = Math.sqrt(rSq - dist * dist);
        const currentY = this.heightSamples.get(i) ?? this.proceduralHeight(x);
        const craterFloor = cy + scoop;

        if (craterFloor > currentY) {
          // Larger Y is lower in canvas coordinate space
          this.heightSamples.set(i, Math.max(currentY, craterFloor));
        }
      } else if (dist < radius * 1.25) {
        // Sand displacement rim around the crater edges
        const currentY = this.heightSamples.get(i) ?? this.proceduralHeight(x);
        const rimStrength = Math.sin(((dist - radius) / (radius * 0.25)) * Math.PI) * (radius * 0.12);
        this.heightSamples.set(i, currentY - rimStrength);
      }
    }
  }

  /**
   * Remove any explosion craters across a range [minX, maxX] or globally,
   * restoring natural procedural desert dunes.
   */
  public clearCraters(minX?: number, maxX?: number) {
    if (minX === undefined || maxX === undefined) {
      for (const [idx] of this.heightSamples) {
        this.heightSamples.set(idx, this.proceduralHeight(idx * this.step));
      }
      return;
    }
    const startIdx = Math.floor(minX / this.step);
    const endIdx = Math.ceil(maxX / this.step);
    for (let i = startIdx; i <= endIdx; i++) {
      if (this.heightSamples.has(i)) {
        this.heightSamples.set(i, this.proceduralHeight(i * this.step));
      }
    }
  }


  /**
   * Find a relatively flat spot on a dune to spawn a tank
   */
  public findStableSpot(minX: number, maxX: number): number {
    let bestX = (minX + maxX) / 2;
    let minSlope = Infinity;

    for (let x = minX; x <= maxX; x += 10) {
      const angle = Math.abs(this.getAngle(x));
      if (angle < minSlope) {
        minSlope = angle;
        bestX = x;
        if (minSlope < 0.12) break; // Good enough
      }
    }
    return bestX;
  }

  /**
   * Background distant dune height query (slower frequency, higher elevation for parallax)
   */
  public getBackdropDuneHeight(x: number, layer: number = 1): number {
    const s = this.baseSeed + layer * 99;
    const scale = layer === 1 ? 0.0008 : 0.0005;
    const offset = layer === 1 ? -120 : -220;

    const h = Math.sin((x + s * 23) * scale) * (140 / layer) +
              Math.cos((x * 0.7 - s * 41) * (scale * 2.2)) * (60 / layer);

    return this.baseWorldY + offset + h;
  }
}
