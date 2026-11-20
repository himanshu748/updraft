import {redis} from '@devvit/web/server'
import type {T3} from '@devvit/web/shared'
import type {BoardEntry, Ghost} from '../shared/api.ts'
import {addDays, type DayKey} from '../shared/day.ts'
import type {RunInput} from '../shared/sim.ts'

const boardKey = (day: DayKey): string => `board:${day}`
const runsKey = (day: DayKey): string => `runs:${day}`
const flightsKey = (day: DayKey): string => `flights:${day}`
const streakKey = (user: string): string => `streak:${user}`
const dayPostKey = (day: DayKey): string => `post:${day}`
const sharesKey = (day: DayKey): string => `shares:${day}`

export async function dbBest(
  day: DayKey,
  user: string,
): Promise<number | undefined> {
  return redis.zScore(boardKey(day), user)
}

/** Saves the run if it beats the user's best. Returns whether it did. */
export async function dbSaveRun(
  day: DayKey,
  user: string,
  frames: number,
  input: RunInput,
): Promise<boolean> {
  const best = await dbBest(day, user)
  if (best !== undefined && best <= frames) return false
  await redis.zAdd(boardKey(day), {member: user, score: frames})
  await redis.hSet(runsKey(day), {[user]: JSON.stringify(input)})
  return true
}

export async function dbRank(
  day: DayKey,
  user: string,
): Promise<number | undefined> {
  const r = await redis.zRank(boardKey(day), user)
  return r === undefined ? undefined : r + 1
}

export async function dbPlayers(day: DayKey): Promise<number> {
  return redis.zCard(boardKey(day))
}

/** How many saved finishers are strictly slower than `frames`. */
export async function dbSlowerThan(
  day: DayKey,
  frames: number,
): Promise<number> {
  const slower = await redis.zRange(boardKey(day), frames + 1, '+inf', {
    by: 'score',
  })
  return slower.length
}

export async function dbBoard(day: DayKey, n: number): Promise<BoardEntry[]> {
  const rows = await redis.zRange(boardKey(day), 0, n - 1, {by: 'rank'})
  return rows.map((r, i) => ({rank: i + 1, name: r.member, frames: r.score}))
}

export async function dbInput(
  day: DayKey,
  user: string,
): Promise<RunInput | undefined> {
  const json = await redis.hGet(runsKey(day), user)
  return json ? (JSON.parse(json) as RunInput) : undefined
}

export async function dbGhosts(
  day: DayKey,
  board: readonly BoardEntry[],
): Promise<Ghost[]> {
  if (!board.length) return []
  const inputs = await redis.hMGet(
    runsKey(day),
    board.map(b => b.name),
  )
  const ghosts: Ghost[] = []
  board.forEach((b, i) => {
    const json = inputs[i]
    if (json)
      ghosts.push({name: b.name, frames: b.frames, input: JSON.parse(json)})
  })
  return ghosts
}

export async function dbCountFlight(day: DayKey): Promise<number> {
  return redis.incrBy(flightsKey(day), 1)
}

export async function dbFlights(day: DayKey): Promise<number> {
  return Number((await redis.get(flightsKey(day))) ?? 0)
}

/** Current streak of consecutive days finished, as of `today`. */
export async function dbStreak(user: string, today: DayKey): Promise<number> {
  const s = await redis.hGetAll(streakKey(user))
  if (s.last !== today && s.last !== addDays(today, -1)) return 0
  return Number(s.count ?? 0)
}

export async function dbMarkFinished(
  user: string,
  today: DayKey,
): Promise<number> {
  const s = await redis.hGetAll(streakKey(user))
  if (s.last === today) return Number(s.count ?? 1)
  const count = s.last === addDays(today, -1) ? Number(s.count ?? 0) + 1 : 1
  await redis.hSet(streakKey(user), {last: today, count: `${count}`})
  return count
}

export async function dbDayPost(day: DayKey): Promise<T3 | undefined> {
  return (await redis.get(dayPostKey(day))) as T3 | undefined
}

/** True for exactly one caller per day, so concurrent cron/menu calls post once. */
export async function dbClaimDayPost(day: DayKey): Promise<boolean> {
  return (await redis.incrBy(`postlock:${day}`, 1)) === 1
}

export async function dbReleaseDayPost(day: DayKey): Promise<void> {
  await redis.set(`postlock:${day}`, '0')
}

export async function dbSetDayPost(day: DayKey, t3: T3): Promise<void> {
  await redis.set(dayPostKey(day), t3)
}

export type Share = {frames: number; url: string}

/** The comment a user last posted about their time on `day`. */
export async function dbShare(
  day: DayKey,
  user: string,
): Promise<Share | undefined> {
  const json = await redis.hGet(sharesKey(day), user)
  return json ? (JSON.parse(json) as Share) : undefined
}

/** Records `share` unless a comment for a faster time is already stored. */
export async function dbSetShare(
  day: DayKey,
  user: string,
  share: Share,
): Promise<void> {
  const prev = await dbShare(day, user)
  if (prev && prev.frames < share.frames) return
  await redis.hSet(sharesKey(day), {[user]: JSON.stringify(share)})
}
