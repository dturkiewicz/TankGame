/**
 * Game Progression and State Management
 * Persistent Desert Golfing style target-to-target tracking.
 */

export interface DesertTheme {
  name: string;
  skyTop: string;
  skyBottom: string;
  duneFar: string;
  duneMid: string;
  duneFront: string;
  duneLine: string;
  sunColor: string;
}

export const THEMES: DesertTheme[] = [
  // 1. Classic Desert Golfing Noon
  {
    name: 'High Noon',
    skyTop: '#ebcd9f',
    skyBottom: '#f5dfbe',
    duneFar: '#dfb77e',
    duneMid: '#d4a466',
    duneFront: '#c8924f',
    duneLine: '#9e6d33',
    sunColor: '#fff9ee',
  },
  // 2. Golden Hour
  {
    name: 'Golden Hour',
    skyTop: '#e69865',
    skyBottom: '#f0be89',
    duneFar: '#d18654',
    duneMid: '#be6e39',
    duneFront: '#a55726',
    duneLine: '#7c3811',
    sunColor: '#ffea9f',
  },
  // 3. Twilight Mirage
  {
    name: 'Twilight',
    skyTop: '#6b4e71',
    skyBottom: '#b37d8a',
    duneFar: '#9c6674',
    duneMid: '#824e5c',
    duneFront: '#693845',
    duneLine: '#451f2b',
    sunColor: '#f9d2a4',
  },
  // 4. Cool Desert Dawn
  {
    name: 'Desert Dawn',
    skyTop: '#a3c2c2',
    skyBottom: '#e0cdb8',
    duneFar: '#baa58b',
    duneMid: '#ab9171',
    duneFront: '#967954',
    duneLine: '#6b5133',
    sunColor: '#fff5dd',
  },
];

export class GameState {
  public currentTargetIndex: number = 1;
  public totalShots: number = 0;
  public shotsOnCurrentTarget: number = 0;
  public windMph: number = 0; // Negative = blowing left, positive = blowing right

  private storageKey = 'dune_artillery_save_v1';

  constructor() {
    this.load();
    this.generateWind();
  }

  public generateWind() {
    if (this.currentTargetIndex <= 1) {
      this.windMph = 0; // Calm wind for target 1
    } else {
      // Scale wind variability with target index
      const maxWind = Math.min(18, 5 + Math.floor(this.currentTargetIndex * 0.8));
      this.windMph = Math.floor((Math.random() * 2 - 1) * maxWind);
    }
  }

  public recordShot() {
    this.totalShots++;
    this.shotsOnCurrentTarget++;
    this.save();
  }

  public advanceTarget() {
    this.currentTargetIndex++;
    this.shotsOnCurrentTarget = 0;
    this.generateWind();
    this.save();
  }

  public getCurrentTheme(): DesertTheme {
    const cycleIndex = Math.floor((this.currentTargetIndex - 1) / 5) % THEMES.length;
    return THEMES[cycleIndex];
  }

  public resetProgress() {
    this.currentTargetIndex = 1;
    this.totalShots = 0;
    this.shotsOnCurrentTarget = 0;
    this.generateWind();
    this.save();
  }

  private save() {
    const data = {
      currentTargetIndex: this.currentTargetIndex,
      totalShots: this.totalShots,
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      // LocalStorage might be disabled in private mode
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.currentTargetIndex === 'number') {
          this.currentTargetIndex = Math.max(1, parsed.currentTargetIndex);
        }
        if (typeof parsed.totalShots === 'number') {
          this.totalShots = Math.max(0, parsed.totalShots);
        }
      }
    } catch {
      // Ignore load error
    }
  }
}
