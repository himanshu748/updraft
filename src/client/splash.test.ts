import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {runInNewContext} from 'node:vm'
import {build} from 'esbuild'
import {dailyCourse} from '../shared/bot.ts'
import {prettyDay} from '../shared/day.ts'

test('an archived splash names the posted course while the leaderboard is offline', async () => {
  const day = '2026-11-21'
  const {outputFiles} = await build({
    entryPoints: [fileURLToPath(new URL('./splash.ts', import.meta.url))],
    bundle: true,
    external: ['@devvit/web/client'],
    format: 'cjs',
    write: false,
  })
  const [splash] = outputFiles
  assert.ok(splash)
  const title = {textContent: "Today's course"}
  const button = {addEventListener() {}, textContent: 'Throw'}
  const elements = new Map<string, object>([
    ['map', {getContext() {}, clientWidth: 0, clientHeight: 0}],
    ['start-btn', button],
    ['title', title],
    ['countdown', {textContent: ''}],
  ])
  runInNewContext(splash.text, {
    require: () => ({context: {postData: {day}}}),
    document: {getElementById: (id: string) => elements.get(id)},
    window: {addEventListener() {}},
    matchMedia: () => ({matches: true}),
    requestAnimationFrame() {},
    setInterval() {},
    setTimeout,
    clearTimeout,
    AbortController,
    fetch: () => Promise.reject(Error('offline')),
  })

  assert.equal(
    title.textContent,
    `${prettyDay(day)} · ${dailyCourse(day).course.name}`,
  )
  assert.equal(button.textContent, 'Fly this course')
})
