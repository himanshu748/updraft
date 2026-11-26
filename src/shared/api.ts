import type {Par} from './bot.ts'
import type {DayKey} from './day.ts'
import type {FlightStatus, RunInput} from './sim.ts'

/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

export type Medal = 'gold' | 'silver' | 'bronze' | 'none'

export type BoardEntry = {rank: number; name: string; frames: number}
export type Ghost = {name: string; frames: number; input: RunInput}

/** Everything a post needs to render: its day, the board and ghosts to race. */
export type DayRsp = {
  day: DayKey
  today: DayKey
  username: string | null
  players: number
  flights: number
  par: Par
  board: BoardEntry[]
  /** The day before's top three, so each post celebrates the last podium. */
  yesterday: BoardEntry[]
  ghosts: Ghost[]
  me: {frames: number; rank: number; input: RunInput} | null
  /** Link to the comment you posted about your current best, if any. */
  myComment: string | null
  streak: number
}

export type RunReq = {day: DayKey; input: RunInput}
export type RunRsp = {
  status: FlightStatus
  frames: number
  progress: number
  rings: number
  medal: Medal
  saved: boolean
  improved: boolean
  best: number | null
  rank: number | null
  players: number
  /** Share of other finishers this flight beat, 0-100. Null if unavailable. */
  beat: number | null
  /** Null when the streak could not be confirmed. */
  streak: number | null
}

export type ShareReq = {day: DayKey}
/** `existing` when your best was already commented, so nothing new was posted. */
export type ShareRsp = {commentUrl: string; existing: boolean}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  Day: 'api/day',
  Run: 'api/run',
  Share: 'api/share',
  OnAppInstall: 'internal/on/app/install',
  OnMenuNewPost: 'internal/on/menu/new-post',
  OnDailyPost: 'internal/scheduler/daily-post',
} as const

export const EndpointMethod = {
  [Endpoint.Day]: 'GET',
  [Endpoint.Run]: 'POST',
  [Endpoint.Share]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
  [Endpoint.OnDailyPost]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}

export function medalFor(frames: number, par: Par): Medal {
  if (frames <= par.gold) return 'gold'
  if (frames <= par.silver) return 'silver'
  if (frames <= par.bronze) return 'bronze'
  return 'none'
}
