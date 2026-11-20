import assert from 'node:assert/strict'
import {test} from 'node:test'
import {untilNextDay} from './day.ts'

test('untilNextDay counts down to the next UTC midnight', () => {
  assert.equal(untilNextDay(new Date('2026-11-20T16:48:00Z')), '7h 12m')
  assert.equal(untilNextDay(new Date('2026-11-20T23:00:00Z')), '1h 00m')
  assert.equal(untilNextDay(new Date('2026-11-20T23:47:30Z')), '13m')
  assert.equal(untilNextDay(new Date('2026-11-20T23:59:59Z')), '1m')
  assert.equal(untilNextDay(new Date('2026-12-31T00:00:00Z')), '24h 00m')
})
