/** Tiny synthesized sound effects: no audio files, no recording. */
export class Sfx {
  private ctx: AudioContext | undefined
  private on = true

  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext()
    void this.ctx.resume()
  }

  toggle(): boolean {
    this.on = !this.on
    return this.on
  }

  private tone(
    freq: number,
    end: number,
    dur: number,
    type: OscillatorType,
    gain = 0.15,
    delay = 0,
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.on) return
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(end, t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
  }

  whoosh(): void {
    this.tone(240, 820, 0.25, 'triangle', 0.08)
  }
  ring(): void {
    this.tone(880, 1320, 0.18, 'sine', 0.12)
    this.tone(1320, 1760, 0.2, 'sine', 0.08, 0.06)
  }
  finish(): void {
    for (const [i, f] of [523, 659, 784, 1046].entries())
      this.tone(f, f, 0.22, 'triangle', 0.12, i * 0.09)
  }
  crash(): void {
    this.tone(300, 60, 0.35, 'sawtooth', 0.08)
  }
}
