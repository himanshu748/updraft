/** Tiny synthesized sound effects: no audio files, no recording. */
export class Sfx {
  private ctx: AudioContext | undefined
  on = true

  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext()
    void this.ctx.resume()
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
    this.rustle(0.18, 1400, 0.09)
    this.tone(220, 740, 0.22, 'triangle', 0.06)
    this.tone(110, 180, 0.16, 'sine', 0.04)
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
    this.rustle(0.28, 480, 0.14)
    this.tone(240, 55, 0.3, 'triangle', 0.07)
  }

  /** A short band-passed noise burst: paper, not a buzzer. */
  private rustle(dur: number, freq: number, gain: number): void {
    const ctx = this.ctx
    if (!ctx || !this.on) return
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = 0.7
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filter).connect(g).connect(ctx.destination)
    src.start(t)
    src.stop(t + dur)
  }
}
