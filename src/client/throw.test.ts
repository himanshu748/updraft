import assert from 'node:assert/strict'
import {test} from 'node:test'
import {coachedThrow, resolveThrow} from './throw.ts'

test('a tap launches the coached throw', () => {
  assert.deepEqual(resolveThrow(0, 0, 0), coachedThrow)
  assert.deepEqual(resolveThrow(4, -2, 12), coachedThrow)
})

test('a drag back to the left keeps that aim', () => {
  assert.deepEqual(resolveThrow(-80, 30, 90), {lx: -80, ly: 30})
})

test('a forward drag, or a left drag too small to be a throw, does nothing', () => {
  assert.equal(resolveThrow(40, 10, 60), null)
  assert.equal(resolveThrow(-4, 0, 40), null)
})
