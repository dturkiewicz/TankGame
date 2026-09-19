/**
 * Fast Polygonal (Piecewise-Linear) Desert Terrain Engine
 * Generates geometric sand dunes using zero-trigonometry integer hashing.
 * Features ultra-fast linear height interpolation and constant-slope segments.
 */

export interface Crater {
  x: number;
  y: number;
  radius: number;
}

export class Terrain {
  private baseSeed: number;
  public readonly segmentWidth: number = 25; // 25px polygonal facet width
  private minX: number = -1000;
  private maxX: number = 5000;

  // Vertex heights: index -> world Y coordinate
  private vertexHeights: Map<number, number> = new Map();
  // Segment angles: index -> slope angle in radians of segment [i, i+1]
  private segmentAngles: Map<number, number> = new Map();

  private baseWorldY: number = 600; // Reference ground line

  constructor(seed: number = 1337, baseWorldY: number = 600) {
    this.baseSeed = seed;
    this.baseWorldY = baseWorldY;
    this.prepopulate(this.minX, this.maxX);
  }

  public setBaseWorldY(y: number) {
    this.baseWorldY = y;
  }

  /**
   * 32-bit Integer Bit-Mixing Hash (Zero trigonometry, sub-nanosecond execution)
   * Returns a deterministic uniform pseudo-random number in [-1, 1].
   */
  private hash(index: number, salt: number = 0): number {
    let h = ((index + salt * 1013) * 374761393 + this.baseSeed * 668265263) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 2147483648) - 1.0;
  }

  /**
   * Procedural Polygonal Dune Altitude at vertex index
   * Synthesizes rolling facets mapped to physical world-pixel wavelengths.
   * Scales dynamically with segmentWidth to guarantee non-volatile, navigable slopes.
   */
  private proceduralVertexHeight(i: number): number {
    const worldX = i * this.segmentWidth;

    // Macro ridge layer: broad rolling dunes across 850px wavelength, amplitude 130px
    const macroCell = Math.floor(worldX / 850);
    const macroT = (worldX - macroCell * 850) / 850;
    const macroSmooth = macroT * macroT * (3 - 2 * macroT);
    const hMacro = this.hash(macroCell, 1) * (1 - macroSmooth) + this.hash(macroCell + 1, 1) * macroSmooth;

    // Mid facet layer: natural desert undulations across 320px wavelength, amplitude 32px
    const midCell = Math.floor(worldX / 320);
    const midT = (worldX - midCell * 320) / 320;
    const midSmooth = midT * midT * (3 - 2 * midT);
    const hMid = this.hash(midCell, 2) * (1 - midSmooth) + this.hash(midCell + 1, 2) * midSmooth;

    // Micro facet layer: subtle low-poly surface shifts across 120px wavelength, amplitude 8px
    const microCell = Math.floor(worldX / 120);
    const microT = (worldX - microCell * 120) / 120;
    const microSmooth = microT * microT * (3 - 2 * microT);
    const hMicro = this.hash(microCell, 3) * (1 - microSmooth) + this.hash(microCell + 1, 3) * microSmooth;

    return this.baseWorldY + hMacro * 130 + hMid * 32 + hMicro * 8;
  }

  public getVertexHeight(i: number): number {
    let y = this.vertexHeights.get(i);
    if (y === undefined) {
      y = this.proceduralVertexHeight(i);
      this.vertexHeights.set(i, y);
    }
    return y;
  }

  private updateSegmentAngle(i: number) {
    const y0 = this.getVertexHeight(i);
    const y1 = this.getVertexHeight(i + 1);
    this.segmentAngles.set(i, Math.atan2(y1 - y0, this.segmentWidth));
  }

  private prepopulate(fromX: number, toX: number) {
    const startIdx = Math.floor(fromX / this.segmentWidth) - 1;
    const endIdx = Math.ceil(toX / this.segmentWidth) + 1;

    for (let i = startIdx; i <= endIdx; i++) {
      if (!this.vertexHeights.has(i)) {
        this.vertexHeights.set(i, this.proceduralVertexHeight(i));
      }
    }

    for (let i = startIdx; i <= endIdx; i++) {
      if (!this.segmentAngles.has(i)) {
        this.updateSegmentAngle(i);
      }
    }
  }

  public ensureRange(startX: number, endX: number) {
    const padding = 1200;
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
   * Fast Linear Height Query (Zero Trigonometry)
   * Exact height along the straight polygonal facet connecting vertex i and i+1.
   */
  public getHeight(x: number): number {
    this.ensureRange(x, x);

    const idx = Math.floor(x / this.segmentWidth);
    const t = (x - idx * this.segmentWidth) / this.segmentWidth;

    const y0 = this.getVertexHeight(idx);
    const y1 = this.getVertexHeight(idx + 1);

    return y0 + (y1 - y0) * t;
  }

  /**
   * Instant O(1) Slope Angle Query (Zero Runtime Trigonometry)
   * Returns precalculated slope angle in radians for the segment under x.
   */
  public getAngle(x: number): number {
    this.ensureRange(x, x);
    const idx = Math.floor(x / this.segmentWidth);
    return this.segmentAngles.get(idx) ?? 0;
  }

  /**
   * Deform terrain by carving polygonal crater facets
   */
  public addCrater(cx: number, cy: number, radius: number) {
    const rSq = radius * radius;
    const startIdx = Math.floor((cx - radius * 1.25) / this.segmentWidth);
    const endIdx = Math.ceil((cx + radius * 1.25) / this.segmentWidth);

    for (let i = startIdx; i <= endIdx; i++) {
      const x = i * this.segmentWidth;
      const dist = Math.abs(x - cx);

      if (dist < radius) {
        // Polygonal faceted scoop
        const scoop = Math.sqrt(rSq - dist * dist);
        const craterFloor = cy + scoop;
        const currentY = this.getVertexHeight(i);
        if (craterFloor > currentY) {
          this.vertexHeights.set(i, craterFloor);
        }
      } else if (dist < radius * 1.22) {
        // Polygonal ejecta rim on edge vertices
        const currentY = this.getVertexHeight(i);
        const rimStrength = (1 - (dist - radius) / (radius * 0.22)) * (radius * 0.12);
        this.vertexHeights.set(i, currentY - rimStrength);
      }
    }

    // Immediately update precalculated angles for all affected segments
    for (let i = startIdx - 1; i <= endIdx + 1; i++) {
      this.updateSegmentAngle(i);
    }
  }

  /**
   * Remove any explosion craters across a range [minX, maxX] or globally,
   * restoring natural procedural polygonal dunes.
   */
  public clearCraters(minX?: number, maxX?: number) {
    if (minX === undefined || maxX === undefined) {
      for (const [idx] of this.vertexHeights) {
        this.vertexHeights.set(idx, this.proceduralVertexHeight(idx));
      }
      for (const [idx] of this.segmentAngles) {
        this.updateSegmentAngle(idx);
      }
      return;
    }

    const startIdx = Math.floor(minX / this.segmentWidth) - 1;
    const endIdx = Math.ceil(maxX / this.segmentWidth) + 1;

    for (let i = startIdx; i <= endIdx; i++) {
      if (this.vertexHeights.has(i)) {
        this.vertexHeights.set(i, this.proceduralVertexHeight(i));
      }
    }
    for (let i = startIdx - 1; i <= endIdx + 1; i++) {
      if (this.segmentAngles.has(i)) {
        this.updateSegmentAngle(i);
      }
    }
  }

  /**
   * Find a flat polygonal facet to spawn a tank
   */
  public findStableSpot(minX: number, maxX: number): number {
    this.ensureRange(minX, maxX);
    const startIdx = Math.floor(minX / this.segmentWidth);
    const endIdx = Math.ceil(maxX / this.segmentWidth);

    let bestIdx = Math.floor((startIdx + endIdx) / 2);
    let minSlope = Infinity;

    for (let i = startIdx; i <= endIdx; i++) {
      const slope = Math.abs(this.segmentAngles.get(i) ?? 0);
      if (slope < minSlope) {
        minSlope = slope;
        bestIdx = i;
        if (minSlope < 0.08) break; // Near-flat facet found
      }
    }

    // Spawn at the center of the selected flat segment
    return bestIdx * this.segmentWidth + this.segmentWidth * 0.5;
  }

  /**
   * Fast Polygonal Background Dune Height (Layered low-poly silhouettes)
   */
  public getBackdropDuneHeight(x: number, layer: number = 1): number {
    const segW = layer === 1 ? 110 : 180;
    const idx = Math.floor(x / segW);
    const t = (x - idx * segW) / segW;
    const offset = layer === 1 ? -120 : -220;

    const salt = layer * 99;
    const h0 = this.hash(idx, salt) * (130 / layer);
    const h1 = this.hash(idx + 1, salt) * (130 / layer);

    return this.baseWorldY + offset + (h0 + (h1 - h0) * t);
  }
}
