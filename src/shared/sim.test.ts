import assert from 'node:assert/strict'
import {test} from 'node:test'
import {autopilot, dailyCourse} from './bot.ts'
import {generateCourse} from './course.ts'
import {addDays} from './day.ts'
import {InputRecorder, isValidInput, simulate} from './sim.ts'

test('a day always produces the same course', () => {
  assert.deepEqual(generateCourse('2026-12-01'), generateCourse('2026-12-01'))
  assert.notDeepEqual(
    generateCourse('2026-12-01'),
    generateCourse('2026-12-02'),
  )
})

test('replaying the same input gives the same time', () => {
  const {course} = dailyCourse('2026-12-01')
  const input = autopilot(course)
  const a = simulate(course, input)
  const b = simulate(course, structuredClone(input))
  assert.equal(a.status, 'finished')
  assert.deepEqual(a, b)
})

test('every day of a year has a course the autopilot can finish', () => {
  for (let i = 0; i < 365; i++) {
    const {bot, par} = dailyCourse(addDays('2026-12-01', i))
    assert.equal(bot.status, 'finished')
    assert.ok(par.gold < par.silver && par.silver < par.bronze)
  }
})

test('never touching the screen after a weak throw crashes', () => {
  const {course} = dailyCourse('2026-12-01')
  const r = simulate(course, {lx: -10, ly: 0, toggles: []})
  assert.equal(r.status, 'crashed')
  assert.ok(r.progress < 1)
})

test('input validation rejects tampered runs', () => {
  assert.ok(isValidInput({lx: -90, ly: 40, toggles: [1, 5, 9]}))
  assert.ok(!isValidInput({lx: -900, ly: 40, toggles: []}))
  assert.ok(!isValidInput({lx: 1.5, ly: 40, toggles: []}))
  assert.ok(!isValidInput({lx: 0, ly: 0, toggles: [5, 5]}))
  assert.ok(!isValidInput({lx: 0, ly: 0, toggles: [-1]}))
  assert.ok(!isValidInput({lx: 0, ly: 0}))
  assert.ok(!isValidInput(null))
})

test('recorder drops a press and release in the same frame', () => {
  const r = new InputRecorder()
  r.set(true, 3)
  r.set(false, 3)
  r.set(true, 7)
  assert.deepEqual(r.toggles, [7])
  assert.equal(r.hold, true)
})
