import {balloonY, type Course, ceiling, groundAt, ringRadius} from './course.ts'

/** Player input: a launch drag and the frames where "hold" toggles (starts released). */
export interface RunInput {
  lx: number
  ly: number
  toggles: number[]
}

export type FlightStatus = 'flying' | 'finished' | 'crashed' | 'timeout'

export const fps = 60
export const maxFrames = fps * 90
export const maxLaunch = 120
export const maxToggles = 4000
const minHx = 0.25
const minSpeed = 0.6
const stallSpeed = 1.4
const maxSpeed = 9
const gravity = 0.06
const drag = 0.00025
const ringBoost = 2.2
const planeRadius = 8
// cos/sin of the per-frame pitch rates as literals: Math.cos/sin can differ by an ulp between engines.
const fastCos = 0.99920010666097792
const fastSin = 0.039989334186634161
const slowCos = 0.99980000666657776
const slowSin = 0.01999866669333308
/** With no input a paper plane settles into a shallow glide at this heading. */
const glideHy = -0.12

export function clampLaunch(lx: number, ly: number): {lx: number; ly: number} {
  const c = (v: number): number =>
    Math.max(-maxLaunch, Math.min(maxLaunch, Math.round(v)))
  return {lx: c(lx), ly: c(ly)}
}

export function isValidInput(input: unknown): input is RunInput {
  if (!input || typeof input !== 'object') return false
  const {lx, ly, toggles} = input as Partial<RunInput>
  if (!Number.isInteger(lx) || !Number.isInteger(ly)) return false
  if (Math.abs(lx as number) > maxLaunch || Math.abs(ly as number) > maxLaunch)
    return false
  if (!Array.isArray(toggles) || toggles.length > maxToggles) return false
  let prev = -1
  for (const t of toggles) {
    if (!Number.isInteger(t) || t <= prev || t >= maxFrames) return false
    prev = t
  }
  return true
}

export class Flight {
  x: number
  y: number
  hx: number
  hy: number
  speed: number
  frame = 0
  status: FlightStatus = 'flying'
  rings: boolean[]
  ringsTaken = 0
  inThermal = false
  readonly course: Course

  /** Launch drag (lx, ly) in screen pixels, pulled back from the plane; y down like the screen. */
  constructor(course: Course, lx: number, ly: number) {
    this.course = course
    this.x = course.start.x
    this.y = course.start.y
    const {lx: cx, ly: cy} = clampLaunch(lx, ly)
    let dx = -cx
    let dy = cy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) {
      dx = 1
      dy = 0
    } else {
      dx /= len
      dy /= len
    }
    this.hx = dx
    this.hy = dy
    this.clampHeading()
    const power = Math.min(len, maxLaunch) / maxLaunch
    this.speed = 2.5 + 4.5 * power
    this.rings = course.rings.map(() => false)
  }

  private clampHeading(): void {
    if (this.hx < minHx) {
      this.hx = minHx
      this.hy = (this.hy < 0 ? -1 : 1) * Math.sqrt(1 - minHx * minHx)
    }
  }

  step(hold: boolean): FlightStatus {
    if (this.status !== 'flying') return this.status
    const {hx, hy} = this
    const stalled = this.speed < stallSpeed
    let c = 1
    let s = 0
    if (stalled) [c, s] = [fastCos, -fastSin]
    else if (hold) [c, s] = [fastCos, fastSin]
    else if (hy > glideHy + 0.02) [c, s] = [slowCos, -slowSin]
    else if (hy < glideHy - 0.02) [c, s] = [slowCos, slowSin]
    this.hx = hx * c - hy * s
    this.hy = hx * s + hy * c
    const n = Math.sqrt(this.hx * this.hx + this.hy * this.hy)
    this.hx /= n
    this.hy /= n
    this.clampHeading()

    this.speed += -gravity * this.hy - drag * this.speed * this.speed
    this.speed = Math.max(minSpeed, Math.min(maxSpeed, this.speed))

    let wx = 0
    let wy = 0
    this.inThermal = false
    for (const t of this.course.thermals) {
      const d = Math.abs(this.x - t.x)
      const half = t.w / 2
      if (d < half && this.y < t.top) {
        wy += t.lift * (1 - d / half)
        this.inThermal = true
      }
    }
    for (const w of this.course.winds) {
      if (this.x >= w.x0 && this.x <= w.x1 && this.y >= w.y0 && this.y <= w.y1)
        wx += w.wx
    }
    const sink = 0.5 / (1 + 0.3 * this.speed * this.speed)

    this.x += this.hx * this.speed + wx
    this.y += this.hy * this.speed + wy - sink
    this.frame++

    if (this.y > ceiling) {
      this.y = ceiling
      if (this.hy > 0) {
        this.hx = 1
        this.hy = 0
      }
    }

    const rr = (ringRadius + planeRadius) ** 2
    for (let i = 0; i < this.course.rings.length; i++) {
      if (this.rings[i]) continue
      const r = this.course.rings[i]
      if (!r) continue
      const dx = this.x - r.x
      const dy = this.y - r.y
      if (dx * dx + dy * dy < rr) {
        this.rings[i] = true
        this.ringsTaken++
        this.speed = Math.min(maxSpeed, this.speed + ringBoost)
      }
    }

    if (this.x >= this.course.finishX) return this.end('finished')
    if (this.y <= groundAt(this.course, this.x)) return this.end('crashed')
    for (const b of this.course.balloons) {
      const dx = this.x - b.x
      const dy = this.y - balloonY(b, this.frame)
      const r = b.r + planeRadius
      if (dx * dx + dy * dy < r * r) return this.end('crashed')
    }
    if (this.frame >= maxFrames) return this.end('timeout')
    return this.status
  }

  private end(status: FlightStatus): FlightStatus {
    this.status = status
    return status
  }

  get progress(): number {
    const p =
      (this.x - this.course.start.x) /
      (this.course.finishX - this.course.start.x)
    return Math.max(0, Math.min(1, p))
  }
}

export interface RunResult {
  status: FlightStatus
  frames: number
  progress: number
  rings: number
}

/** Replays recorded inputs. Optional onFrame sees every simulated frame (for trails). */
export function simulate(
  course: Course,
  input: RunInput,
  onFrame?: (f: Flight) => void,
): RunResult {
  const f = new Flight(course, input.lx, input.ly)
  let hold = false
  let next = 0
  while (f.status === 'flying') {
    while (next < input.toggles.length && input.toggles[next] === f.frame) {
      hold = !hold
      next++
    }
    f.step(hold)
    onFrame?.(f)
  }
  return {
    status: f.status,
    frames: f.frame,
    progress: f.progress,
    rings: f.ringsTaken,
  }
}

/** Records toggle frames while a live flight is played. */
export class InputRecorder {
  readonly toggles: number[] = []
  private holding = false
  set(hold: boolean, frame: number): void {
    if (hold === this.holding) return
    if (this.toggles[this.toggles.length - 1] === frame) this.toggles.pop()
    else this.toggles.push(frame)
    this.holding = hold
  }
  get hold(): boolean {
    return this.holding
  }
}
