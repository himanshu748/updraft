import type {Ghost} from '../shared/api.ts'
import {fps} from '../shared/sim.ts'

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

/** Seconds the player leads (+) or trails (-) a ghost, from the gap in x at their speed. */
export function leadSeconds(x: number, rivalX: number, speed: number): number {
  return (x - rivalX) / Math.max(speed, 1) / fps
}
