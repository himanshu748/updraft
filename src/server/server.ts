import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {context, reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  type DayRsp,
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
  medalFor,
  type RunReq,
  type RunRsp,
  type ShareReq,
  type ShareRsp,
} from '../shared/api.ts'
import {dailyCourse} from '../shared/bot.ts'
import {
  addDays,
  type DayKey,
  dayKey,
  formatTime,
  isDayKey,
  prettyDay,
} from '../shared/day.ts'
import {isValidInput, simulate} from '../shared/sim.ts'
import {
  dbBest,
  dbBoard,
  dbClaimDayPost,
  dbClaimShare,
  dbCountFlight,
  dbDayPost,
  dbFlairDay,
  dbFlaired,
  dbFlights,
  dbGhosts,
  dbInput,
  dbMarkFinished,
  dbPlayers,
  dbRank,
  dbReleaseDayPost,
  dbReleaseShare,
  dbSaveRun,
  dbSetDayPost,
  dbSetFlairDay,
  dbSetShare,
  dbShare,
  dbSlowerThan,
  dbStreak,
} from './db.ts'

const ghostCount = 24

type AnyRsp =
  | DayRsp
  | RunRsp
  | ShareRsp
  | UiResponse
  | TriggerResponse
  | ErrorRsp

class HttpError extends Error {
  readonly status: number
  constructor(status: number, msg: string) {
    super(msg)
    this.status = status
  }
}

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    if (err instanceof HttpError) {
      writeJson<ErrorRsp>(
        err.status,
        {error: err.message, status: err.status},
        rspMsg,
      )
      return
    }
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(
      500,
      {error: 'internal server error', status: 500},
      rspMsg,
    )
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1).split('?')[0] as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.Day:
        rsp = await routeDay()
        break
      case Endpoint.Run:
        rsp = await routeRun(await readJson<RunReq>(reqMsg))
        break
      case Endpoint.Share:
        rsp = await routeShare(await readJson<ShareReq>(reqMsg))
        break
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
      case Endpoint.OnDailyPost:
        await ensureDayPost(dayKey())
        if (endpoint === Endpoint.OnDailyPost) await clearLapsedFlair(dayKey())
        rsp = {}
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  const status =
    'error' in rsp && typeof rsp.status === 'number' ? rsp.status : 200
  writeJson<PartialJsonValue>(status, rsp as PartialJsonValue, rspMsg)
}

/** The day a post races: set when the post was made, so old posts keep their own course. */
function postDay(): DayKey {
  const day = context.postData?.day
  return isDayKey(day) ? day : dayKey()
}

async function routeDay(): Promise<DayRsp> {
  const day = postDay()
  const today = dayKey()
  const user = context.username ?? null
  const {par} = dailyCourse(day)
  const board = await dbBoard(day, ghostCount)
  const ghosts = await dbGhosts(day, board)
  let me: DayRsp['me'] = null
  let myComment: string | null = null
  if (user) {
    const frames = await dbBest(day, user)
    const input = frames === undefined ? undefined : await dbInput(day, user)
    const rank = await dbRank(day, user)
    if (frames !== undefined && input && rank) me = {frames, rank, input}
    const share = await dbShare(day, user).catch(() => {
      console.warn('comment receipt unavailable')
      return undefined
    })
    if (share && frames !== undefined && share.frames <= frames)
      myComment = share.url
  }
  return {
    day,
    today,
    username: user,
    players: await dbPlayers(day),
    flights: await dbFlights(day),
    par,
    board: board.slice(0, 10),
    yesterday: await dbBoard(addDays(day, -1), 3),
    ghosts,
    me,
    myComment,
    streak: user ? await dbStreak(user, today).catch(unavailableStreak) : 0,
  }
}

async function routeRun(req: RunReq): Promise<RunRsp> {
  if (!isValidInput(req?.input)) throw new HttpError(400, 'bad input')
  const day = postDay()
  const today = dayKey()
  const {course, par} = dailyCourse(day)
  const result = simulate(course, req.input)
  const user = context.username
  await dbCountFlight(day).catch((err: unknown) => {
    console.warn(`flight count skipped; ${err}`)
  })
  const finished = result.status === 'finished'

  const improved =
    finished && user
      ? await dbSaveRun(day, user, result.frames, req.input)
      : false
  let streak = user ? await dbStreak(user, today).catch(unavailableStreak) : 0
  if (finished && user && day === today) {
    const before = streak
    streak = await dbMarkFinished(user, today).catch(unavailableStreak)
    if (streak !== null && (streak !== before || improved))
      await syncFlair(user, streak, today)
  }
  const players = await dbPlayers(day)
  const others =
    players - (user && (await dbBest(day, user)) !== undefined ? 1 : 0)
  const slower = finished
    ? await dbSlowerThan(day, result.frames).catch((err: unknown) => {
        console.warn(`field comparison unavailable; ${err}`)
        return null
      })
    : 0
  const best = user ? ((await dbBest(day, user)) ?? null) : null
  return {
    status: result.status,
    frames: result.frames,
    progress: result.progress,
    rings: result.rings,
    medal: finished ? medalFor(result.frames, par) : 'none',
    saved: Boolean(user) && finished,
    improved,
    best,
    rank: user ? ((await dbRank(day, user)) ?? null) : null,
    players,
    beat:
      slower === null
        ? null
        : others > 0
          ? Math.round((100 * Math.min(slower, others)) / others)
          : 100,
    streak,
  }
}

function unavailableStreak(error: unknown): null {
  console.warn(`streak unavailable; ${error}`)
  return null
}

async function syncFlair(
  username: string,
  streak: number,
  today: DayKey,
): Promise<void> {
  const sub = context.subredditName
  if (!sub) return
  try {
    if (streak >= 2) {
      await reddit.setUserFlair({
        subredditName: sub,
        username,
        text: `✈ ${streak}-day updraft`,
      })
      await dbSetFlairDay(username, today)
    } else if (await dbFlairDay(username)) {
      await reddit.removeUserFlair(sub, username)
      await dbSetFlairDay(username, '')
    }
  } catch (err) {
    console.warn(`flair skipped; ${err}`)
  }
}

/** Streaks lapse at midnight without a request, so the daily cron clears their flair (retrying failures). */
async function clearLapsedFlair(today: DayKey): Promise<void> {
  for (const user of await dbFlaired())
    if ((await dbStreak(user, today)) === 0) await syncFlair(user, 0, today)
}

async function routeShare(req: ShareReq): Promise<ShareRsp> {
  const user = context.username
  const t3 = context.postId
  if (!user || !t3) throw new HttpError(401, 'log in to share')
  const day = postDay()
  if (req?.day !== day) throw new HttpError(400, 'wrong day')
  const best = await dbBest(day, user)
  const rank = await dbRank(day, user)
  if (best === undefined || !rank)
    throw new HttpError(400, 'finish a flight first')
  const prev = await dbShare(day, user)
  if (prev && prev.frames <= best) return {commentUrl: prev.url, existing: true}
  const {par} = dailyCourse(day)
  const medal = medalFor(best, par)
  const badge = {gold: '🥇', silver: '🥈', bronze: '🥉', none: '✈️'}[medal]
  const players = await dbPlayers(day)
  if (!(await dbClaimShare(day, user, best))) {
    const receipt = await dbShare(day, user)
    if (receipt && receipt.frames <= best)
      return {commentUrl: receipt.url, existing: true}
    throw new HttpError(409, 'share already started; check the post comments')
  }
  let comment: Awaited<ReturnType<typeof reddit.submitComment>>
  try {
    comment = await reddit.submitComment({
      id: t3,
      text: `${badge} Flew ${prettyDay(day)}'s Updraft in **${formatTime(best)}**, #${rank} of ${players}. Catch my ghost!`,
      runAs: 'USER',
    })
  } catch (err) {
    await dbReleaseShare(day, user, best)
    throw err
  }
  const url = new URL(comment.permalink, 'https://www.reddit.com/').toString()
  try {
    await dbSetShare(day, user, {frames: best, url})
  } catch (err) {
    console.warn(`share receipt skipped; ${err}`)
  }
  return {commentUrl: url, existing: false}
}

async function ensureDayPost(day: DayKey): Promise<string> {
  const existing = await dbDayPost(day)
  if (existing) return existing
  if (!(await dbClaimDayPost(day)))
    throw Error(`${day} post is already being created`)
  const {course} = dailyCourse(day)
  let post: Awaited<ReturnType<typeof reddit.submitCustomPost>>
  try {
    post = await reddit.submitCustomPost({
      title: `Updraft · ${prettyDay(day)} · ${course.name} (${course.theme.name})`,
      postData: {day},
      textFallback: {
        text: 'Throw a paper plane through today’s wind course and race everyone’s ghosts.',
      },
    })
  } catch (err) {
    await dbReleaseDayPost(day)
    throw err
  }
  await dbSetDayPost(day, post.id)
  return post.id
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const day = dayKey()
  const id = await ensureDayPost(day)
  const post = await reddit.getPostById(id as `t3_${string}`)
  return {
    showToast: {text: `Today's Updraft is up.`, appearance: 'success'},
    navigateTo: post.url,
  }
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
  await once(reqMsg, 'end')
  try {
    return JSON.parse(`${Buffer.concat(chunks)}`)
  } catch {
    throw new HttpError(400, 'bad json')
  }
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
