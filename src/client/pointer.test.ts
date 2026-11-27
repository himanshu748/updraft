import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bindFlightPointer} from './pointer.ts'

function flightPointer() {
  const calls: unknown[][] = []
  const canvas = Object.assign(new EventTarget(), {
    setPointerCapture: (id: number) => calls.push(['capture', id]),
  })
  bindFlightPointer(canvas, {
    press: (x, y) => calls.push(['press', x, y]),
    move: (x, y) => calls.push(['move', x, y]),
    release: (...args) => calls.push(['release', ...args]),
  })
  const emit = (
    type: string,
    pointerId: number,
    isPrimary = true,
    button = 0,
  ) =>
    canvas.dispatchEvent(
      Object.assign(new Event(type), {
        pointerId,
        isPrimary,
        button,
        clientX: pointerId * 2,
        clientY: pointerId * 3,
      }),
    )
  return {calls, emit}
}

test('a second finger cannot steer or release the primary flight gesture', () => {
  const {calls, emit} = flightPointer()
  emit('pointerdown', 1)
  emit('pointerdown', 2, false)
  emit('pointermove', 2, false)
  emit('pointerup', 2, false)
  emit('pointermove', 1)
  emit('pointerup', 1)
  emit('lostpointercapture', 1)
  assert.deepEqual(calls, [
    ['capture', 1],
    ['press', 2, 3],
    ['move', 2, 3],
    ['release', 2, 3],
  ])
})

test('right-click is ignored and losing pointer capture cancels the gesture', () => {
  const {calls, emit} = flightPointer()
  emit('pointerdown', 1, true, 2)
  emit('pointerdown', 2)
  emit('lostpointercapture', 2)
  emit('pointerup', 2)
  emit('pointerdown', 3)
  emit('pointercancel', 3)
  assert.deepEqual(calls, [
    ['capture', 2],
    ['press', 4, 6],
    ['release', undefined, undefined, true],
    ['capture', 3],
    ['press', 6, 9],
    ['release', undefined, undefined, true],
  ])
})
