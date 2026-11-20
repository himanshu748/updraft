#!/usr/bin/env -S node --experimental-strip-types --no-warnings=ExperimentalWarning
// Local browser preview: the real server routes over in-memory Redis, with a few seeded ghosts.
import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {extname, join} from 'node:path'
import {type Context, redis, runWithContext} from '@devvit/web/server'
import {autopilot, dailyCourse} from '../shared/bot.ts'
import {dayKey} from '../shared/day.ts'
import {simulate} from '../shared/sim.ts'
import {dbSaveRun} from './db.ts'
import {installMemoryRedis} from './memoryRedis.ts'
import {onReq} from './server.ts'

installMemoryRedis(redis)
const port = Number(process.env.PORT ?? 5180)
const publicDir = join(import.meta.dirname, '../../public')
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.map': 'application/json',
}

async function seed(): Promise<void> {
  const day = dayKey()
  const {course} = dailyCourse(day)
  const base = autopilot(course)
  const pilots = [
    'gust_buster',
    'paper_ace',
    'origami_otto',
    'kite_runner',
    'thermal_tina',
    'loopdeloop',
  ]
  let n = 0
  for (let shift = 0; shift < 40 && n < pilots.length; shift++) {
    const input = {
      ...base,
      lx: base.lx + ((shift * 7) % 23) - 11,
      ly: base.ly + ((shift * 5) % 31) - 15,
    }
    const r = simulate(course, input)
    if (r.status === 'finished')
      await dbSaveRun(day, pilots[n++] as string, r.frames, input)
  }
}

const server = createServer(async (req, rsp) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    const user = req.headers.cookie?.match(/user=(\w+)/)?.[1] ?? 'himanshu748'
    const ctx = {
      appName: 'updraft',
      postId: 't3_preview',
      subredditName: 'updraft_dev',
      userId: 't2_preview',
      username: user,
    }
    await runWithContext(ctx as unknown as Context, () => onReq(req, rsp))
    return
  }
  const file = url.pathname === '/' ? 'game.html' : url.pathname.slice(1)
  try {
    const body = await readFile(join(publicDir, file.replace(/\.\./g, '')))
    rsp.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    })
    rsp.end(body)
  } catch {
    rsp.writeHead(404).end('not found')
  }
})

await seed()
server.listen(port, () =>
  console.log(
    `Updraft preview on http://localhost:${port} (splash: /splash.html)`,
  ),
)
