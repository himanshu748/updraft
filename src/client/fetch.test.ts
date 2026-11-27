import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fetchDay, postRun} from './fetch.ts'

test('a stalled day request is aborted so local play can start', async t => {
  t.mock.timers.enable({apis: ['setTimeout']})
  t.mock.method(globalThis, 'fetch', (_path: string, init: RequestInit) => {
    const signal = init.signal
    assert.ok(signal)
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    })
  })

  const result = assert.rejects(fetchDay(), {name: 'AbortError'})
  t.mock.timers.tick(4000)
  await result
})

test('a stalled run verification is abandoned without resubmitting the flight', async t => {
  t.mock.timers.enable({apis: ['setTimeout']})
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    (_path: string, init: RequestInit) => {
      assert.equal(init.method, 'POST')
      const signal = init.signal
      assert.ok(signal)
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    },
  )

  const result = assert.rejects(
    postRun({day: '2026-11-27', input: {lx: 36, ly: 0, toggles: []}}),
    {name: 'AbortError'},
  )
  t.mock.timers.tick(8000)
  await result
  assert.equal(fetch.mock.callCount(), 1)
})
