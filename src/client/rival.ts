import type {Ghost} from '../shared/api.ts'
import type {Course} from '../shared/course.ts'
import {fps, type RunInput, simulate} from '../shared/sim.ts'

const checkpoints = [25, 50, 75] as const
export const parPilot = 'par pilot'
export const personalBest = 'your best'

export function pilotName(name: string): string {
  if (name === parPilot) return 'the par pilot'
  if (name === personalBest) return personalBest
  return `u/${name}`
}

/** Compare first crossings at the same points on the course. Negative means ahead. */
export function rivalSplits(course: Course, player: RunInput, rival: RunInput) {
  function crossings(input: RunInput): number[] {
    const frames: number[] = []
    simulate(course, input, flight => {
      let next = checkpoints[frames.length]
      while (next !== undefined && flight.progress * 100 >= next) {
        frames.push(flight.frame)
        next = checkpoints[frames.length]
      }
    })
    return frames
  }

  const playerFrames = crossings(player)
  const rivalFrames = crossings(rival)
  return checkpoints.flatMap((percent, index) => {
    const playerFrame = playerFrames[index]
    const rivalFrame = rivalFrames[index]
    if (playerFrame === undefined || rivalFrame === undefined) return []
    return [{percent, delta: playerFrame - rivalFrame}]
  })
}

/**
 * The ghost to chase: the player's own pick while it can still be raced, else the pilot
 * just faster than their best (the one just slower when they lead, the fastest before
 * their first time). Works from the ghosts, which reach further down the board than the
 * ten rows shown.
 */
export function pickRival(
  ghosts: readonly Ghost[],
  me: string | null,
  myFrames: number | null,
  stored: string | null,
): string | null {
  const others = ghosts
    .filter(g => g.name !== me)
    .sort((a, b) => a.frames - b.frames)
  if (stored && others.some(g => g.name === stored)) return stored
  if (myFrames === null) return others[0]?.name ?? null
  const ahead = others.filter(g => g.frames < myFrames)
  const behind = others.filter(g => g.frames >= myFrames)
  return (ahead.at(-1) ?? behind[0])?.name ?? null
}

export function pickRaceTarget(
  ghosts: readonly Ghost[],
  me: string | null,
  myFrames: number | null,
  stored: string | null,
): string {
  if (stored === parPilot || (stored === personalBest && myFrames !== null))
    return stored
  return (
    pickRival(ghosts, me, myFrames, stored) ??
    (myFrames === null ? parPilot : personalBest)
  )
}

/** Seconds the player leads (+) or trails (-) a ghost, from the gap in x at their speed. */
export function leadSeconds(x: number, rivalX: number, speed: number): number {
  return (x - rivalX) / Math.max(speed, 1) / fps
}
