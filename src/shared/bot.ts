import {
  balloonY,
  type Course,
  ceiling,
  generateCourse,
  groundAt,
} from './course.ts'
import type {DayKey} from './day.ts'
import {Flight, type RunInput, type RunResult, simulate} from './sim.ts'

/** A simple autopilot: proves each course can be finished and sets its par times. */
export function autopilot(course: Course): RunInput {
  const f = new Flight(course, -90, 40)
  const toggles: number[] = []
  let hold = false
  while (f.status === 'flying') {
    let floor = 0
    for (let dx = 0; dx <= 400; dx += 40)
      floor = Math.max(floor, groundAt(course, f.x + dx))
    let lo = floor + 100
    let hi = ceiling - 40
    for (const b of course.balloons) {
      const ahead = b.x - f.x
      if (ahead < -50 || ahead > 520) continue
      const by = balloonY(
        b,
        f.frame + Math.max(0, Math.round(ahead / Math.max(f.speed, 1))),
      )
      const gap = b.r + 55
      if (f.y >= by) lo = Math.max(lo, by + gap)
      else hi = Math.min(hi, by - gap)
    }
    if (hi < lo) hi = lo + 20
    let want: boolean
    if (f.y < lo) want = f.hy < 0.4 && f.speed > 2
    else if (f.y > hi) want = f.hy < -0.6
    else want = f.hy < -0.08
    const next = f.inThermal && f.y < hi ? f.hy < 0.15 && f.speed > 2 : want
    if (next !== hold) {
      toggles.push(f.frame)
      hold = next
    }
    f.step(hold)
  }
  return {lx: -90, ly: 40, toggles}
}

export interface Par {
  gold: number
  silver: number
  bronze: number
}

export interface DailyCourse {
  course: Course
  par: Par
  bot: RunResult
}

const cache = new Map<DayKey, DailyCourse>()

/** The day's course, re-rolled (deterministically) until the autopilot finishes it. */
export function dailyCourse(day: DayKey): DailyCourse {
  const hit = cache.get(day)
  if (hit) return hit
  let out: DailyCourse | undefined
  for (let v = 0; v < 40 && !out; v++) {
    const course = generateCourse(day, v)
    const bot = simulate(course, autopilot(course))
    if (bot.status === 'finished') {
      out = {
        course,
        bot,
        par: {
          gold: Math.round(bot.frames * 0.9),
          silver: bot.frames,
          bronze: Math.round(bot.frames * 1.2),
        },
      }
    }
  }
  if (!out) throw Error(`no flyable course for ${day}`)
  cache.set(day, out)
  return out
}
