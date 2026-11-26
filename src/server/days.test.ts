import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, mock, test} from 'node:test'
import {type Context, reddit, redis, runWithContext} from '@devvit/web/server'
import {type DayRsp, Endpoint, type RunRsp} from '../shared/api.ts'
import {autopilot, dailyCourse} from '../shared/bot.ts'
import type {RunInput} from '../shared/sim.ts'
import {installMemoryRedis} from './memoryRedis.ts'
import {onReq} from './server.ts'

mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-20T23:59:00Z')})
const flairs: string[] = []
const posts: unknown[] = []
let server: Server
let serverURL: string
let restoreRedis: () => void
const comments: string[] = []
const submitComment = reddit.submitComment.bind(reddit)
const setUserFlair = reddit.setUserFlair.bind(reddit)
const removeUserFlair = reddit.removeUserFlair.bind(reddit)

before(async () => {
  restoreRedis = installMemoryRedis(redis)
  reddit.submitComment = (async (opts: {text: string}) => {
    comments.push(opts.text)
    return {permalink: '/r/updraft/comments/abc/def/'}
  }) as unknown as typeof reddit.submitComment
  reddit.setUserFlair = (async (o: {text: string}) => {
    flairs.push(o.text)
  }) as unknown as typeof reddit.setUserFlair
  reddit.removeUserFlair = (async (_sub: string, user: string) => {
    flairs.push(`- ${user}`)
  }) as unknown as typeof reddit.removeUserFlair
  reddit.submitCustomPost = (async (o: unknown) => {
    posts.push(o)
    return {id: `t3_p${posts.length}`}
  }) as unknown as typeof reddit.submitCustomPost
  server = createServer(async (req, rsp) => {
    const username = req.headers['x-user'] as string | undefined
    const day = req.headers['x-day'] as string | undefined
    await runWithContext(
      {
        appName: 'updraft',
        postId: 't3_123',
        subredditName: 'updraft_dev',
        userId: username ? 't2_123' : undefined,
        username,
        postData: day ? {day} : undefined,
      } as unknown as Context,
      () => onReq(req, rsp),
    )
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  serverURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(async () => {
  restoreRedis()
  reddit.submitComment = submitComment
  reddit.setUserFlair = setUserFlair
  reddit.removeUserFlair = removeUserFlair
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  )
})

async function call<T>(
  endpoint: string,
  opts: {user?: string; day?: string; body?: unknown} = {},
): Promise<{status: number; json: T}> {
  const headers: Record<string, string> = {}
  if (opts.user) headers['x-user'] = opts.user
  if (opts.day) headers['x-day'] = opts.day
  const rsp = await fetch(`${serverURL}/${endpoint}`, {
    method: opts.body === undefined ? 'GET' : 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  return {status: rsp.status, json: (await rsp.json()) as T}
}

const best = (day: string): RunInput => autopilot(dailyCourse(day).course)
const at = (iso: string): void => mock.timers.setTime(Date.parse(iso))
const fly = (user: string, day: string, lx = 0) =>
  call<RunRsp>(Endpoint.Run, {
    user,
    day,
    body: {day, input: {...best(day), lx: best(day).lx + lx}},
  })

test('the midnight UTC cron posts the new day once', async () => {
  at('2026-11-21T00:01:00Z')
  const [a, b] = await Promise.all([
    call<object>(Endpoint.OnDailyPost, {body: {}}),
    call<object>(Endpoint.OnDailyPost, {body: {}}),
  ])
  await call<object>(Endpoint.OnDailyPost, {body: {}})
  assert.deepEqual([a.status, b.status], [200, 200])
  assert.equal(posts.length, 1)
  assert.deepEqual((posts[0] as {postData: unknown}).postData, {
    day: '2026-11-21',
  })
})

test('several players rank by measured time', async () => {
  const day = '2026-11-21'
  const out = []
  for (const [u, lx] of [
    ['cara', 20],
    ['ann', 0],
    ['bo', 10],
    ['dee', 40],
  ] as const)
    out.push([u, (await fly(u, day, lx)).json])
  const d = await call<DayRsp>(Endpoint.Day, {user: 'cara', day})
  const order = [...out]
    .sort((x, y) => ((x[1] as RunRsp).best ?? 0) - ((y[1] as RunRsp).best ?? 0))
    .map(x => x[0])
  assert.deepEqual(
    d.json.board.map(e => e.name),
    order,
  )
  assert.deepEqual(
    d.json.board.map(e => e.rank),
    [1, 2, 3, 4],
  )
  assert.equal(d.json.players, 4)
  assert.equal(d.json.me?.rank, order.indexOf('cara') + 1)
})

test("the next day's post shows yesterday's podium", async () => {
  at('2026-11-22T08:00:00Z')
  const prev = await call<DayRsp>(Endpoint.Day, {day: '2026-11-21'})
  const d = await call<DayRsp>(Endpoint.Day, {day: '2026-11-22'})
  assert.deepEqual(d.json.yesterday, prev.json.board.slice(0, 3))
  assert.equal(d.json.yesterday.length, 3)
  const empty = await call<DayRsp>(Endpoint.Day, {day: '2026-11-21'})
  assert.deepEqual(empty.json.yesterday, [])
})

test('streaks count consecutive days and reset after a gap', async () => {
  const seen: RunRsp['streak'][] = []
  for (const day of ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-26']) {
    at(`${day}T12:00:00Z`)
    seen.push((await fly('eve', day)).json.streak)
  }
  at('2026-11-27T12:00:00Z')
  const late = await call<DayRsp>(Endpoint.Day, {
    user: 'eve',
    day: '2026-11-27',
  })
  at('2026-11-28T12:00:00Z')
  const gone = await call<DayRsp>(Endpoint.Day, {
    user: 'eve',
    day: '2026-11-28',
  })
  assert.deepEqual(seen, [1, 2, 3, 1])
  assert.equal(late.json.streak, 1)
  assert.equal(gone.json.streak, 0)
  assert.deepEqual(
    flairs.filter(f => f === '- eve' || f.startsWith('✈')),
    ['✈ 2-day updraft', '✈ 3-day updraft', '- eve'],
  )
})

test('the daily cron clears flair once a streak lapses', async () => {
  for (const day of ['2026-12-01', '2026-12-02']) {
    at(`${day}T12:00:00Z`)
    await fly('fay', day)
  }
  flairs.length = 0
  at('2026-12-03T00:01:00Z')
  await call<object>(Endpoint.OnDailyPost, {body: {}})
  assert.deepEqual(flairs, [])
  at('2026-12-04T00:01:00Z')
  await call<object>(Endpoint.OnDailyPost, {body: {}})
  assert.deepEqual(flairs, ['- fay'])
})
