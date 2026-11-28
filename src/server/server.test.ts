import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, test} from 'node:test'
import {type Context, reddit, redis, runWithContext} from '@devvit/web/server'
import {
  type DayRsp,
  Endpoint,
  type ErrorRsp,
  type RunRsp,
  type ShareRsp,
} from '../shared/api.ts'
import {autopilot, dailyCourse} from '../shared/bot.ts'
import {addDays, dayKey} from '../shared/day.ts'
import {type RunInput, simulate} from '../shared/sim.ts'
import {dbBest, dbInput, dbSaveRun} from './db.ts'
import {installMemoryRedis} from './memoryRedis.ts'
import {onReq} from './server.ts'

const today = dayKey()
let server: Server
let serverURL: string
let restoreRedis: () => void
let comments: string[] = []
const submitComment = reddit.submitComment.bind(reddit)
const setUserFlair = reddit.setUserFlair.bind(reddit)
const removeUserFlair = reddit.removeUserFlair.bind(reddit)

before(async () => {
  restoreRedis = installMemoryRedis(redis)
  reddit.submitComment = (async (opts: {text: string}) => {
    comments.push(opts.text)
    return {permalink: '/r/updraft/comments/abc/def/'}
  }) as unknown as typeof reddit.submitComment
  reddit.setUserFlair = async () => {}
  reddit.removeUserFlair = async () => {}
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
/** Same route as the autopilot but releasing late, so it lands a slower (or no) time. */
function slower(input: RunInput): RunInput {
  return {...input, lx: input.lx + 30}
}

test('a fresh post has an empty board and the day course par', async () => {
  const {status, json} = await call<DayRsp>(Endpoint.Day, {user: 'alice'})
  assert.equal(status, 200)
  assert.equal(json.day, today)
  assert.equal(json.players, 0)
  assert.deepEqual(json.board, [])
  assert.deepEqual(json.par, dailyCourse(today).par)
  assert.equal(json.me, null)
})

test('an unreadable personal replay does not block the course or scoreboard', async () => {
  const day = addDays(today, -41)
  const user = 'unreadable-personal-replay'
  const input = best(day)
  const {frames} = simulate(dailyCourse(day).course, input)
  await dbSaveRun(day, user, frames, input)
  const read = redis.hGet
  redis.hGet = async (key, field) => {
    if (key === `runs:${day}` && field === user)
      throw Error('personal replay unavailable')
    return read(key, field)
  }
  try {
    const {status, json} = await call<DayRsp>(Endpoint.Day, {user, day})
    assert.equal(status, 200)
    assert.equal(json.day, day)
    assert.deepEqual(json.board, [{rank: 1, name: user, frames}])
    assert.deepEqual(json.ghosts, [{name: user, frames, input}])
    assert.equal(json.me, null)
  } finally {
    redis.hGet = read
  }
})

test('unavailable race tallies do not hide the course or scoreboard', async () => {
  const day = addDays(today, -42)
  const user = 'unavailable-race-tallies'
  const input = best(day)
  const {frames} = simulate(dailyCourse(day).course, input)
  await dbSaveRun(day, user, frames, input)
  const get = redis.get
  const zCard = redis.zCard
  redis.get = async key => {
    if (key === `flights:${day}`) throw Error('flight counter unavailable')
    return get(key)
  }
  redis.zCard = async key => {
    if (key === `board:${day}`) throw Error('player tally unavailable')
    return zCard(key)
  }
  try {
    const {status, json} = await call<DayRsp>(Endpoint.Day, {user, day})
    assert.equal(status, 200)
    assert.equal(json.day, day)
    assert.equal(json.players, null)
    assert.equal(json.flights, null)
    assert.deepEqual(json.board, [{rank: 1, name: user, frames}])
    assert.deepEqual(json.ghosts, [{name: user, frames, input}])
  } finally {
    redis.get = get
    redis.zCard = zCard
  }
})

test('the server re-flies the input and ranks the time it measured', async () => {
  const input = best(today)
  const expected = dailyCourse(today).bot.frames
  const {json} = await call<RunRsp>(Endpoint.Run, {
    user: 'alice',
    body: {day: today, input},
  })
  assert.equal(json.status, 'finished')
  assert.equal(json.frames, expected)
  assert.equal(json.medal, 'silver')
  assert.equal(json.improved, true)
  assert.equal(json.rank, 1)
  assert.equal(json.streak, 1)

  const again = await call<RunRsp>(Endpoint.Run, {
    user: 'alice',
    body: {day: today, input},
  })
  assert.equal(again.json.improved, false)
  assert.equal(again.json.streak, 1)

  const day = await call<DayRsp>(Endpoint.Day, {user: 'alice'})
  assert.equal(day.json.players, 1)
  assert.equal(day.json.flights, 2)
  assert.deepEqual(day.json.board, [{rank: 1, name: 'alice', frames: expected}])
  assert.deepEqual(day.json.ghosts[0]?.input, input)
  assert.equal(day.json.me?.frames, expected)
})

test('a delayed slower finish cannot overwrite a concurrent faster score or ghost', async () => {
  const day = addDays(today, -12)
  const user = 'concurrent-finish'
  const fasterInput = {lx: -40, ly: 10, toggles: []}
  const slowerInput = {lx: -45, ly: 10, toggles: []}
  const score = redis.zScore
  let signalRead = () => {}
  const read = new Promise<void>(resolve => {
    signalRead = resolve
  })
  let resume = () => {}
  const wait = new Promise<void>(resolve => {
    resume = resolve
  })
  let holdFirstRead = true
  redis.zScore = async (key, member) => {
    const result = await score(key, member)
    if (holdFirstRead && key === `board:${day}` && member === user) {
      holdFirstRead = false
      signalRead()
      await wait
    }
    return result
  }
  const lateFinish = dbSaveRun(day, user, 900, slowerInput)
  try {
    await Promise.race([read, lateFinish])
    assert.equal(await dbSaveRun(day, user, 700, fasterInput), true)
    resume()
    assert.equal(await lateFinish, false)
    assert.equal(await dbBest(day, user), 700)
    assert.deepEqual(await dbInput(day, user), fasterInput)
  } finally {
    resume()
    redis.zScore = score
    await lateFinish.catch(() => undefined)
  }
})

test('unreadable saved replays do not block the daily course or other ghosts', async () => {
  const day = addDays(today, -11)
  const input = best(day)
  for (const user of ['damaged-replay', 'invalid-replay', 'valid-replay']) {
    const run = await call<RunRsp>(Endpoint.Run, {
      user,
      day,
      body: {day, input},
    })
    assert.equal(run.json.saved, true)
  }
  await redis.hSet(`runs:${day}`, {
    'damaged-replay': '{',
    'invalid-replay': JSON.stringify({lx: 0}),
  })

  const rsp = await call<DayRsp>(Endpoint.Day, {user: 'damaged-replay', day})
  assert.equal(rsp.status, 200)
  assert.equal(rsp.json.day, day)
  assert.ok(rsp.json.board.some(entry => entry.name === 'damaged-replay'))
  assert.ok(rsp.json.board.some(entry => entry.name === 'invalid-replay'))
  assert.deepEqual(
    rsp.json.ghosts.map(ghost => ghost.name),
    ['valid-replay'],
  )
  assert.equal(rsp.json.me, null)
})

test('a crash is not saved and a slower finish ranks behind', async () => {
  const crash = await call<RunRsp>(Endpoint.Run, {
    user: 'bob',
    body: {day: today, input: {lx: -5, ly: 0, toggles: []}},
  })
  assert.equal(crash.json.status, 'crashed')
  assert.equal(crash.json.saved, false)
  assert.equal(crash.json.best, null)

  const r = await call<RunRsp>(Endpoint.Run, {
    user: 'bob',
    body: {day: today, input: slower(best(today))},
  })
  if (r.json.status === 'finished') {
    assert.ok(r.json.frames !== dailyCourse(today).bot.frames)
    const board = (await call<DayRsp>(Endpoint.Day, {user: 'bob'})).json.board
    assert.equal(board.length, 2)
    assert.ok((board[0]?.frames ?? 0) <= (board[1]?.frames ?? 0))
  }
})

test('logged-out players can fly but nothing is saved', async () => {
  const {json} = await call<RunRsp>(Endpoint.Run, {
    body: {day: today, input: best(today)},
  })
  assert.equal(json.status, 'finished')
  assert.equal(json.saved, false)
  assert.equal(json.rank, null)
  const day = await call<DayRsp>(Endpoint.Day)
  assert.equal(day.json.username, null)
  assert.ok(!day.json.board.some(b => b.name === 'undefined'))
})

test('old posts keep their own day and do not touch the streak', async () => {
  const past = addDays(today, -3)
  const {json} = await call<RunRsp>(Endpoint.Run, {
    user: 'carol',
    day: past,
    body: {day: past, input: best(past)},
  })
  assert.equal(json.status, 'finished')
  assert.equal(json.streak, 0)
  const d = await call<DayRsp>(Endpoint.Day, {user: 'carol', day: past})
  assert.equal(d.json.day, past)
  assert.equal(d.json.board[0]?.name, 'carol')
})

test('tampered input is rejected', async () => {
  const {status, json} = await call<ErrorRsp>(Endpoint.Run, {
    user: 'alice',
    body: {day: today, input: {lx: 999, ly: 0, toggles: []}},
  })
  assert.equal(status, 400)
  assert.equal(json.error, 'bad input')
})

test('sharing posts the best time as a comment', async () => {
  comments = []
  const {status, json} = await call<ShareRsp>(Endpoint.Share, {
    user: 'alice',
    body: {day: today},
  })
  assert.equal(status, 200)
  assert.equal(
    json.commentUrl,
    'https://www.reddit.com/r/updraft/comments/abc/def/',
  )
  assert.equal(json.existing, false)
  assert.match(comments[0] ?? '', /#1 of \d+/)
  const again = await call<ShareRsp>(Endpoint.Share, {
    user: 'alice',
    body: {day: today},
  })
  assert.equal(again.json.existing, true)
  assert.equal(again.json.commentUrl, json.commentUrl)
  assert.equal(comments.length, 1, 'a second tap must not post again')
  const day = await call<DayRsp>(Endpoint.Day, {user: 'alice'})
  assert.equal(day.json.myComment, json.commentUrl)
  const anon = await call<ErrorRsp>(Endpoint.Share, {body: {day: today}})
  assert.equal(anon.status, 401)
})

test('the server replays the input and ignores a client-supplied time', async () => {
  const input = best(today)
  const flown = simulate(dailyCourse(today).course, input)
  const {json} = await call<RunRsp>(Endpoint.Run, {
    user: 'nils',
    body: {day: today, input, frames: 1, status: 'finished'},
  })
  assert.equal(json.status, 'finished')
  assert.equal(json.frames, flown.frames)
  assert.notEqual(json.frames, 1)
  const again = await call<RunRsp>(Endpoint.Run, {
    user: 'nils',
    body: {day: today, input, frames: 1},
  })
  assert.equal(again.json.frames, flown.frames)
  assert.equal(again.json.improved, false)
})

test('bad toggle lists are rejected before they can rank', async () => {
  const bad = [
    {lx: -90, ly: 40, toggles: [5, 5]},
    {lx: -90, ly: 40, toggles: [9, 3]},
    {lx: -90, ly: 40, toggles: [1.5]},
    {lx: -90, ly: 40, toggles: Array.from({length: 4001}, (_, i) => i)},
  ]
  for (const input of bad) {
    const {status, json} = await call<ErrorRsp>(Endpoint.Run, {
      user: 'mina',
      body: {day: today, input},
    })
    assert.equal(status, 400)
    assert.equal(json.error, 'bad input')
  }
  const day = await call<DayRsp>(Endpoint.Day)
  assert.equal(
    day.json.board.some(b => b.name === 'mina'),
    false,
  )
})

test('a day in the body cannot score a different course', async () => {
  const other = addDays(today, -2)
  const input = best(today)
  const {json} = await call<RunRsp>(Endpoint.Run, {
    user: 'otto',
    body: {day: other, input},
  })
  assert.equal(json.frames, simulate(dailyCourse(today).course, input).frames)
  const todayBoard = await call<DayRsp>(Endpoint.Day, {user: 'otto'})
  const otherBoard = await call<DayRsp>(Endpoint.Day, {
    user: 'otto',
    day: other,
  })
  assert.equal(
    todayBoard.json.board.some(b => b.name === 'otto'),
    true,
  )
  assert.equal(
    otherBoard.json.board.some(b => b.name === 'otto'),
    false,
  )
})

test('unexpected failures return a generic error to the player', async t => {
  t.mock.method(console, 'error', () => {})
  t.mock.method(redis, 'zRange', async () => {
    throw new Error('redis diagnostic')
  })
  const {status, json} = await call<ErrorRsp>(Endpoint.Day)
  assert.equal(status, 500)
  assert.deepEqual(json, {error: 'internal server error', status: 500})
})

test('invalid saved post dates fall back to today', async () => {
  const {status, json} = await call<DayRsp>(Endpoint.Day, {day: '2026-13-01'})
  assert.equal(status, 200)
  assert.equal(json.day, today)
})

test('unknown routes 404', async () => {
  assert.equal((await call<ErrorRsp>('api/nope')).status, 404)
  assert.equal((await call<ErrorRsp>(Endpoint.Day, {body: {}})).status, 404)
})

test('one share posts while a concurrent request and a missing receipt cannot post again', async () => {
  const user = 'concurrent-share'
  await call<RunRsp>(Endpoint.Run, {user, body: {input: best(today)}})
  const saveHash = redis.hSet
  const postComment = reddit.submitComment
  let signalSubmit = () => {}
  const submitted = new Promise<void>(resolve => {
    signalSubmit = resolve
  })
  let releasePost = () => {}
  const posted = new Promise<void>(resolve => {
    releasePost = resolve
  })
  let posts = 0
  reddit.submitComment = async opts => {
    posts++
    signalSubmit()
    await posted
    return postComment(opts)
  }
  redis.hSet = async (key, values) => {
    if (key === `shares:${today}`) throw Error('share receipt unavailable')
    return saveHash(key, values)
  }
  const share = () => call<ShareRsp>(Endpoint.Share, {user, body: {day: today}})
  try {
    const first = share()
    await Promise.race([submitted, first])
    try {
      assert.equal((await share()).status, 409)
    } finally {
      releasePost()
    }
    assert.equal((await first).status, 200)
    assert.equal((await share()).status, 409)
    assert.equal(posts, 1)
  } finally {
    reddit.submitComment = postComment
    redis.hSet = saveHash
  }
})

test('a failed flight counter does not discard a verified finish', async () => {
  const user = 'counter-failure'
  const increment = redis.incrBy
  redis.incrBy = async (key, amount) => {
    if (key === `flights:${today}`) throw Error('counter unavailable')
    return increment(key, amount)
  }
  try {
    const input = best(today)
    const {status, json} = await call<RunRsp>(Endpoint.Run, {
      user,
      body: {day: today, input},
    })
    assert.equal(status, 200)
    assert.equal(json.saved, true)
    assert.equal(json.improved, true)
    const day = await call<DayRsp>(Endpoint.Day, {user})
    assert.equal(day.json.me?.frames, json.frames)
  } finally {
    redis.incrBy = increment
  }
})

test('an unavailable field comparison does not discard a verified finish', async () => {
  const user = 'field-comparison-failure'
  const range = redis.zRange
  redis.zRange = async (key, start, stop, options) => {
    if (key === `board:${today}` && options?.by === 'score')
      throw Error('field comparison unavailable')
    return range(key, start, stop, options)
  }
  try {
    const input = best(today)
    const {status, json} = await call<RunRsp>(Endpoint.Run, {
      user,
      body: {day: today, input},
    })
    assert.equal(status, 200)
    assert.equal(json.saved, true)
    assert.equal(json.improved, true)
    assert.equal(json.beat, null)
    assert.equal(json.best, json.frames)
    const day = await call<DayRsp>(Endpoint.Day, {user})
    assert.equal(day.json.me?.frames, json.frames)
  } finally {
    redis.zRange = range
  }
})

for (const failure of ['read', 'write'] as const) {
  test(`a failed streak ${failure} does not discard a verified finish`, async () => {
    const user = `streak-${failure}-failure`
    const key = `streak:${user}`
    const readHash = redis.hGetAll
    const writeHash = redis.hSet
    if (failure === 'read') {
      redis.hGetAll = async k => {
        if (k === key) throw Error('streak read unavailable')
        return readHash(k)
      }
    } else {
      redis.hSet = async (k, values) => {
        if (k === key) throw Error('streak write unavailable')
        return writeHash(k, values)
      }
    }
    const body = {day: today, input: best(today)}
    let frames: number
    try {
      const {status, json} = await call<RunRsp>(Endpoint.Run, {user, body})
      assert.equal(status, 200)
      assert.equal(json.saved, true)
      assert.equal(json.improved, true)
      assert.equal(json.streak, null)
      frames = json.frames
    } finally {
      redis.hGetAll = readHash
      redis.hSet = writeHash
    }
    const day = await call<DayRsp>(Endpoint.Day, {user})
    assert.equal(day.json.me?.frames, frames)
    const retry = await call<RunRsp>(Endpoint.Run, {user, body})
    assert.equal(retry.json.improved, false)
    assert.equal(retry.json.streak, 1)
  })
}

test('the daily race survives an unavailable streak', async t => {
  const user = 'day-streak-failure'
  const input = best(today)
  const frames = simulate(dailyCourse(today).course, input).frames
  await dbSaveRun(today, user, frames, input)
  const get = redis.hGetAll.bind(redis)
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})
  t.mock.method(redis, 'hGetAll', async (key: string) => {
    if (key === `streak:${user}`) throw new Error('streak read unavailable')
    return get(key)
  })
  const {status, json} = await call<DayRsp>(Endpoint.Day, {user})
  assert.equal(status, 200)
  assert.equal(json.day, today)
  assert.equal(json.username, user)
  assert.deepEqual(json.par, dailyCourse(today).par)
  assert.equal(json.me?.frames, frames)
  assert.ok(json.board.some(row => row.name === user))
  assert.equal(json.streak, null)
})

test('the daily race survives an unreadable comment receipt', async t => {
  const user = 'broken-comment-receipt'
  const input = best(today)
  const frames = simulate(dailyCourse(today).course, input).frames
  await dbSaveRun(today, user, frames, input)
  await redis.hSet(`shares:${today}`, {[user]: 'invalid-json'})
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})

  const {status, json} = await call<DayRsp>(Endpoint.Day, {user})
  assert.equal(status, 200)
  assert.deepEqual(json.par, dailyCourse(today).par)
  assert.equal(json.me?.frames, frames)
  assert.ok(json.board.some(row => row.name === user))
  assert.equal(json.myComment, null)
})

test('the daily race survives an unavailable ghost lookup', async t => {
  const user = 'ghost-lookup-failure'
  const input = best(today)
  const frames = simulate(dailyCourse(today).course, input).frames
  await dbSaveRun(today, user, frames, input)
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})
  t.mock.method(redis, 'hMGet', async () => {
    throw new Error('ghost lookup unavailable')
  })

  const {status, json} = await call<DayRsp>(Endpoint.Day, {user})
  assert.equal(status, 200)
  assert.deepEqual(json.par, dailyCourse(today).par)
  assert.deepEqual(json.ghosts, [])
  assert.deepEqual(json.me?.input, input)
  assert.ok(json.board.some(row => row.name === user))
})

test('the daily race survives an unavailable previous podium', async t => {
  const user = 'historical-podium-failure'
  const input = best(today)
  const frames = simulate(dailyCourse(today).course, input).frames
  await dbSaveRun(today, user, frames, input)
  const read = redis.zRange.bind(redis)
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})
  t.mock.method(redis, 'zRange', async (...args: Parameters<typeof read>) => {
    if (args[0] === `board:${addDays(today, -1)}`)
      throw new Error('historical podium unavailable')
    return read(...args)
  })

  const {status, json} = await call<DayRsp>(Endpoint.Day, {user})
  assert.equal(status, 200)
  assert.deepEqual(json.par, dailyCourse(today).par)
  assert.deepEqual(json.yesterday, [])
  assert.deepEqual(json.me?.input, input)
  assert.ok(json.board.some(row => row.name === user))
})

test('a failed player tally does not discard a verified finish', async t => {
  const user = 'player-tally-unavailable'
  const input = best(today)
  const frames = simulate(dailyCourse(today).course, input).frames
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})
  t.mock.method(redis, 'zCard', async () => {
    throw new Error('player tally unavailable')
  })

  const {status, json} = await call<RunRsp>(Endpoint.Run, {
    user,
    body: {day: today, input},
  })
  assert.equal(status, 200)
  assert.equal(json.status, 'finished')
  assert.equal(json.saved, true)
  assert.equal(json.best, frames)
  assert.equal(json.players, null)
  assert.equal(json.beat, null)
  assert.equal(await dbBest(today, user), frames)
})

for (const stat of ['personal best', 'rank'] as const) {
  test(`a failed ${stat} lookup does not discard a verified finish`, async t => {
    const user = `run-stat-${stat.replace(' ', '-')}`
    const input = best(today)
    const frames = simulate(dailyCourse(today).course, input).frames
    const score = redis.zScore
    t.mock.method(console, 'error', () => {})
    t.mock.method(console, 'warn', () => {})
    if (stat === 'personal best') {
      let reads = 0
      t.mock.method(redis, 'zScore', async (key: string, member: string) => {
        if (key === `board:${today}` && member === user && ++reads === 2)
          throw new Error('personal best unavailable after save')
        return score(key, member)
      })
    } else {
      t.mock.method(redis, 'zRank', async () => {
        throw new Error('rank unavailable')
      })
    }

    const {status, json} = await call<RunRsp>(Endpoint.Run, {
      user,
      body: {day: today, input},
    })
    assert.equal(status, 200)
    assert.equal(json.status, 'finished')
    assert.equal(json.saved, true)
    assert.equal(json.improved, true)
    assert.equal(json.best, stat === 'personal best' ? null : frames)
    if (stat === 'personal best') assert.equal(json.beat, null)
    else assert.equal(json.rank, null)
    assert.equal(await dbBest(today, user), frames)
    assert.deepEqual(await dbInput(today, user), input)
  })
}
