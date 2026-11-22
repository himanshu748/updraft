import assert from 'node:assert/strict'
import {test} from 'node:test'
import type {BoardEntry, Ghost} from '../shared/api.ts'
import {fps} from '../shared/sim.ts'
import {leadSeconds, pickRival} from './rival.ts'

const names = ['ace', 'bo', 'cy', 'di']
const board: BoardEntry[] = names.map((name, i) => ({
  rank: i + 1,
  name,
  frames: 900 + i * 10,
}))
const ghosts: Ghost[] = board.map(r => ({
  name: r.name,
  frames: r.frames,
  input: {lx: -90, ly: 40, toggles: []},
}))

test('chases the pilot just ahead', () => {
  assert.equal(pickRival(board, ghosts, 'cy', null), 'bo')
})

test('the leader chases the runner-up', () => {
  assert.equal(pickRival(board, ghosts, 'ace', null), 'bo')
})

test('a new pilot chases #1', () => {
  assert.equal(pickRival(board, ghosts, null, null), 'ace')
  assert.equal(pickRival(board, ghosts, 'newbie', null), 'ace')
})

test("keeps the player's pick, but never themselves or a pilot without a ghost", () => {
  assert.equal(pickRival(board, ghosts, 'cy', 'di'), 'di')
  assert.equal(pickRival(board, ghosts, 'cy', 'cy'), 'bo')
  assert.equal(pickRival(board, ghosts, 'cy', 'gone'), 'bo')
  assert.equal(pickRival(board, ghosts.slice(2), 'di', null), 'cy')
})

test('no rival on an empty board', () => {
  assert.equal(pickRival([], [], 'ace', 'bo'), null)
})

test('lead is the x gap in seconds at the current speed', () => {
  assert.equal(leadSeconds(130, 100, 5), 30 / 5 / fps)
  assert.ok(leadSeconds(100, 130, 5) < 0)
  assert.ok(Number.isFinite(leadSeconds(110, 100, 0)))
})
