import type {BoardEntry, Ghost} from '../shared/api.ts'
import {fps} from '../shared/sim.ts'

/**
 * The ghost to chase: the player's own pick while it can still be raced, else the pilot
 * just ahead of them (the one just behind when they lead, #1 before their first time).
 */
export function pickRival(
  board: readonly BoardEntry[],
  ghosts: readonly Ghost[],
  me: string | null,
  stored: string | null,
): string | null {
  const raceable = (name: string): boolean =>
    name !== me && ghosts.some(g => g.name === name)
  if (stored && raceable(stored)) return stored
  const mine = board.find(r => r.name === me)
  const order = mine
    ? [
        ...board.filter(r => r.rank < mine.rank).reverse(),
        ...board.filter(r => r.rank > mine.rank),
      ]
    : board
  return order.find(r => raceable(r.name))?.name ?? null
}

/** Seconds the player leads (+) or trails (-) a ghost, from the gap in x at their speed. */
export function leadSeconds(x: number, rivalX: number, speed: number): number {
  return (x - rivalX) / Math.max(speed, 1) / fps
}
