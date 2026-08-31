// Short WebAudio tones. iOS has no vibration API on the web, so feedback is
// sound + on-screen colour only. Call resume() from a user gesture first.
export class Cues {
  private ctx: AudioContext | null = null;

  resume(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    void this.ctx?.resume().catch(() => undefined);
  }

  private blip(freq: number, dur: number, delay = 0, gain = 0.14): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** Rising two-note chime when the pose locks in. */
  aligned(): void {
    this.blip(660, 0.12);
    this.blip(990, 0.13, 0.1);
  }

  /** Click on capture. */
  shutter(): void {
    this.blip(1250, 0.05, 0, 0.12);
  }
}
