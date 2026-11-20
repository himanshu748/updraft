import {type DayKey, weekday} from './day.ts'
import {hashString, makeRng} from './rng.ts'

export interface Thermal {
  x: number
  w: number
  lift: number
  top: number
}
export interface WindBand {
  x0: number
  x1: number
  y0: number
  y1: number
  wx: number
}
export interface Ring {
  x: number
  y: number
}
export interface Balloon {
  x: number
  y: number
  r: number
  amp: number
  period: number
  phase: number
  hue: number
}
export interface Theme {
  name: string
  skyTop: string
  skyBottom: string
  far: string
  near: string
  ground: string
  sun: string
}
export interface Course {
  day: DayKey
  name: string
  theme: Theme
  variant: number
  finishX: number
  start: {x: number; y: number}
  ground: number[]
  thermals: Thermal[]
  winds: WindBand[]
  rings: Ring[]
  balloons: Balloon[]
}

export const groundStep = 80
export const ceiling = 680
export const ringRadius = 36

export const themes: readonly Theme[] = [
  {
    name: 'Sunday Drift',
    skyTop: '#ffb8a0',
    skyBottom: '#ffe9c7',
    far: '#e9a3a8',
    near: '#b97a95',
    ground: '#6f5a7e',
    sun: '#fff3d6',
  },
  {
    name: 'Mist Monday',
    skyTop: '#9fc7e8',
    skyBottom: '#e4f1f7',
    far: '#a9c4cf',
    near: '#7fa3ae',
    ground: '#4f7480',
    sun: '#ffffff',
  },
  {
    name: 'Tailwind Tuesday',
    skyTop: '#5fb6f2',
    skyBottom: '#c9ecff',
    far: '#8ccf9f',
    near: '#57a774',
    ground: '#3a7d50',
    sun: '#fff7b0',
  },
  {
    name: 'Windy Wednesday',
    skyTop: '#7aa0f0',
    skyBottom: '#d6e2ff',
    far: '#a2a8d8',
    near: '#7478b8',
    ground: '#4d4f8a',
    sun: '#fffbe0',
  },
  {
    name: 'Thermal Thursday',
    skyTop: '#ff9a62',
    skyBottom: '#ffe0a3',
    far: '#e8b07a',
    near: '#c98552',
    ground: '#8c5a36',
    sun: '#fff0c0',
  },
  {
    name: 'Flyday',
    skyTop: '#4fc3c8',
    skyBottom: '#d3f5ee',
    far: '#7fcfb0',
    near: '#46a58a',
    ground: '#2e7663',
    sun: '#fffde8',
  },
  {
    name: 'Starlit Saturday',
    skyTop: '#2b2f6b',
    skyBottom: '#6b5ca8',
    far: '#4f4a8c',
    near: '#38336e',
    ground: '#221f4a',
    sun: '#f4f1ff',
  },
]

const adjectives = [
  'Copper',
  'Silver',
  'Lazy',
  'Brisk',
  'Golden',
  'Paper',
  'Velvet',
  'Crooked',
  'Sleepy',
  'Lucky',
]
const nouns = [
  'Gale',
  'Ridge',
  'Canyon',
  'Meadow',
  'Spire',
  'Hollow',
  'Breeze',
  'Valley',
  'Harbor',
  'Bluff',
]

/** The day's course. Pure function of the day (and a variant, bumped only if the autopilot can't finish). */
export function generateCourse(day: DayKey, variant = 0): Course {
  const rng = makeRng(hashString(`updraft:${day}:${variant}`))
  const pick = <T>(xs: readonly T[]): T =>
    xs[Math.floor(rng() * xs.length)] as T
  const range = (lo: number, hi: number): number => lo + rng() * (hi - lo)
  const theme = themes[weekday(day)] as Theme
  const finishX = Math.round(range(6200, 7600))

  const ground: number[] = []
  let from = 120
  let to = 120
  for (let i = 0, x = 0; x <= finishX + 1200; i++, x += groundStep) {
    if (x < 240) ground.push(300)
    else if (x > finishX - 300) ground.push(40)
    else {
      const k = (i - 3) % 6
      if (k === 0) {
        from = to
        to = Math.round(range(30, 210))
      }
      const t = k / 6
      ground.push(Math.round(from + (to - from) * t * t * (3 - 2 * t)))
    }
  }
  const thermals: Thermal[] = []
  const winds: WindBand[] = []
  const rings: Ring[] = []
  const balloons: Balloon[] = []
  const at = (x: number): number => groundAtArr(ground, x)

  for (let x = 1000; x < finishX - 500; x += Math.round(range(520, 760))) {
    const roll = rng()
    if (roll < 0.36) {
      thermals.push({
        x,
        w: Math.round(range(200, 320)),
        lift: Math.round(range(160, 240)) / 100,
        top: Math.round(range(460, 620)),
      })
    } else if (roll < 0.58) {
      const y0 = Math.round(range(at(x) + 80, 420))
      const head = rng() < 0.45
      winds.push({
        x0: x - 120,
        x1: x + Math.round(range(300, 520)),
        y0,
        y1: y0 + Math.round(range(110, 200)),
        wx: (head ? -1 : 1) * (Math.round(range(60, 130)) / 100),
      })
    } else if (roll < 0.82) {
      const n = rng() < 0.4 ? 2 : 1
      for (let i = 0; i < n; i++) {
        const bx = x + i * Math.round(range(90, 150))
        balloons.push({
          x: bx,
          y: Math.round(range(at(bx) + 110, 470)),
          r: Math.round(range(24, 34)),
          amp: Math.round(range(20, 70)),
          period: Math.round(range(150, 260)),
          phase: Math.floor(rng() * 260),
          hue: Math.floor(rng() * 360),
        })
      }
    } else {
      const y = Math.round(range(at(x) + 90, 440))
      for (let i = 0; i < 3; i++)
        rings.push({x: x + i * 70, y: y + (i - 1) * 24})
    }
    if (rng() < 0.35)
      rings.push({x: x + 300, y: Math.round(range(at(x + 300) + 80, 480))})
  }

  return {
    day,
    name: `${pick(adjectives)} ${pick(nouns)}`,
    theme,
    variant,
    finishX,
    start: {x: 120, y: 340},
    ground,
    thermals,
    winds,
    rings,
    balloons,
  }
}

function groundAtArr(ground: readonly number[], x: number): number {
  if (x <= 0) return ground[0] ?? 0
  const i = Math.floor(x / groundStep)
  const a = ground[i] ?? ground[ground.length - 1] ?? 0
  const b = ground[i + 1] ?? a
  const t = (x - i * groundStep) / groundStep
  return a + (b - a) * t
}

export function groundAt(course: Course, x: number): number {
  return groundAtArr(course.ground, x)
}

/** Triangle-wave bob, plain arithmetic so it replays identically everywhere. */
export function balloonY(b: Balloon, frame: number): number {
  const p = ((frame + b.phase) % b.period) / b.period
  const tri = Math.abs(2 * p - 1)
  return b.y + b.amp * (tri * 2 - 1)
}
