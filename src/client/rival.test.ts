import assert from 'node:assert/strict'
import {test} from 'node:test'
import type {Ghost} from '../shared/api.ts'
import {fps} from '../shared/sim.ts'
import {leadSeconds, pickRival} from './rival.ts'

const names = ['ace', 'bo', 'cy', 'di']
const ghost = (name: string, frames: number): Ghost => ({
  name,
  frames,
  input: {lx: -90, ly: 40, toggles: []},
})
const ghosts: Ghost[] = names.map((name, i) => ghost(name, 900 + i * 10))
const best = (name: string): number =>
  ghosts.find(g => g.name === name)?.frames ?? 0

test('chases the pilot just ahead', () => {
  assert.equal(pickRival(ghosts, 'cy', best('cy'), null), 'bo')
})

test('works past the ten board rows, from the ghosts', () => {
  const field = Array.from({length: 24}, (_, i) => ghost(`p${i + 1}`, 900 + i))
  assert.equal(pickRival(field, 'p15', 914, null), 'p14')
})

test('the leader chases the runner-up', () => {
  assert.equal(pickRival(ghosts, 'ace', best('ace'), null), 'bo')
})

test('a new pilot chases #1', () => {
  assert.equal(pickRival(ghosts, null, null, null), 'ace')
  assert.equal(pickRival(ghosts, 'newbie', null, null), 'ace')
})

test("keeps the player's pick, but never themselves or a pilot without a ghost", () => {
  assert.equal(pickRival(ghosts, 'cy', best('cy'), 'di'), 'di')
  assert.equal(pickRival(ghosts, 'cy', best('cy'), 'cy'), 'bo')
  assert.equal(pickRival(ghosts, 'cy', best('cy'), 'gone'), 'bo')
  assert.equal(pickRival(ghosts.slice(2), 'di', best('di'), null), 'cy')
})

test('no rival on an empty board', () => {
  assert.equal(pickRival([], 'ace', 900, 'bo'), null)
})

test('lead is the x gap in seconds at the current speed', () => {
  assert.equal(leadSeconds(130, 100, 5), 30 / 5 / fps)
  assert.ok(leadSeconds(100, 130, 5) < 0)
  assert.ok(Number.isFinite(leadSeconds(110, 100, 0)))
})
