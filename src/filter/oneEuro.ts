// 1e Filter (Casiez et al.) - low-lag jitter removal for noisy signals.
// Raw landmark coordinates jitter a lot frame to frame; without this the
// "aligned / green" signal flickers badly.

class LowPass {
  private hat = 0;
  private lastRaw = 0;
  private started = false;

  filter(x: number, alpha: number): number {
    this.hat = this.started ? alpha * x + (1 - alpha) * this.hat : x;
    this.lastRaw = x;
    this.started = true;
    return this.hat;
  }

  hasLastRaw(): boolean {
    return this.started;
  }

  get raw(): number {
    return this.lastRaw;
  }
}

export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | null = null;

  constructor(
    private minCutoff = 1.7,
    private beta = 0.3,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param t timestamp in seconds */
  filter(value: number, t: number): number {
    let dt = 1 / 60;
    if (this.lastT != null && t > this.lastT) dt = t - this.lastT;
    this.lastT = t;

    const rawDeriv = this.x.hasLastRaw() ? (value - this.x.raw) / dt : 0;
    const edx = this.dx.filter(rawDeriv, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, this.alpha(cutoff, dt));
  }
}

import type { Landmark } from '../pose/types';

/** Per-landmark x/y smoothing across a stream of pose results. */
export class PoseFilter {
  private fx: OneEuro[] = [];
  private fy: OneEuro[] = [];

  reset(): void {
    this.fx = [];
    this.fy = [];
  }

  /** @param tMs timestamp in milliseconds */
  apply(lms: Landmark[], tMs: number): Landmark[] {
    const t = tMs / 1000;
    return lms.map((p, i) => {
      this.fx[i] ??= new OneEuro();
      this.fy[i] ??= new OneEuro();
      return { ...p, x: this.fx[i].filter(p.x, t), y: this.fy[i].filter(p.y, t) };
    });
  }
}
