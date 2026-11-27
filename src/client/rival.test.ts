import assert from 'node:assert/strict'
import {test} from 'node:test'
import type {Ghost} from '../shared/api.ts'
import {autopilot, dailyCourse} from '../shared/bot.ts'
import {fps} from '../shared/sim.ts'
import {
  leadSeconds,
  parPilot,
  personalBest,
  pickRaceTarget,
  pickRival,
  rivalSplits,
} from './rival.ts'

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

test('a tie does not count as ahead', () => {
  const tied = [ghost('ace', 900), ghost('bo', 910), ghost('cy', 910)]
  assert.equal(pickRival(tied, 'bo', 910, null), 'ace')
  assert.equal(pickRival(tied.slice(1), 'bo', 910, null), 'cy')
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

test('targets the personal best when it is the only saved race', () => {
  assert.equal(
    pickRaceTarget([ghost('cy', 920)], 'cy', 920, null),
    personalBest,
  )
  assert.equal(pickRaceTarget([], null, null, personalBest), parPilot)
})

test('honors an explicit personal or par choice across leaderboard refreshes', () => {
  assert.equal(pickRaceTarget(ghosts, 'cy', 920, personalBest), personalBest)
  assert.equal(pickRaceTarget(ghosts, 'cy', 920, parPilot), parPilot)
  assert.equal(pickRaceTarget(ghosts, 'cy', 920, 'di'), 'di')
  assert.equal(pickRaceTarget(ghosts, null, null, personalBest), 'ace')
})

test('lead is the x gap in seconds at the current speed', () => {
  assert.equal(leadSeconds(130, 100, 5), 30 / 5 / fps)
  assert.ok(leadSeconds(100, 130, 5) < 0)
  assert.ok(Number.isFinite(leadSeconds(110, 100, 0)))
})

test('replay splits show when the lead changes between course checkpoints', () => {
  const {course} = dailyCourse('2026-12-01')
  const player = autopilot(course)
  const rival = {...player, lx: player.lx + 5}
  assert.deepEqual(rivalSplits(course, player, rival), [
    {percent: 25, delta: -16},
    {percent: 50, delta: 4},
    {percent: 75, delta: 106},
  ])
  assert.deepEqual(rivalSplits(course, player, player), [
    {percent: 25, delta: 0},
    {percent: 50, delta: 0},
    {percent: 75, delta: 0},
  ])
})

test('replay splits omit checkpoints either pilot never reached', () => {
  const {course} = dailyCourse('2026-12-01')
  const rival = autopilot(course)
  const crash = {...rival, lx: rival.lx - 10}
  assert.deepEqual(rivalSplits(course, crash, rival), [
    {percent: 25, delta: -34},
    {percent: 50, delta: -113},
  ])
  assert.deepEqual(
    rivalSplits(course, rival, {...rival, lx: rival.lx + 10}),
    [],
  )
})
