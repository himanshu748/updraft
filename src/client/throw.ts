import {maxLaunch} from '../shared/sim.ts'

/** The throw a tap (and the Space key) launches. Pulled back and a little up. */
export const coachedThrow = {lx: -95, ly: 35}

/** Movement under this, in CSS pixels, is a tap rather than an aim. */
export const tapSlop = 18

/**
 * A tap launches the coached throw. A drag back to the left uses that aim.
 * A drag that points forward is not a throw.
 */
export function resolveThrow(
  lx: number,
  ly: number,
  movedPx: number,
): {lx: number; ly: number} | null {
  if (movedPx < tapSlop) return {...coachedThrow}
  if (lx < 0 && Math.hypot(lx, ly) > maxLaunch * 0.12) return {lx, ly}
  return null
}
