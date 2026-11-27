type FlightPointerControls = {
  press(x: number, y: number): void
  move(x: number, y: number): void
  release(x?: number, y?: number, cancel?: boolean): void
}

/** Keep a launch or climb attached to the finger that started it. */
export function bindFlightPointer(
  canvas: Pick<HTMLCanvasElement, 'addEventListener' | 'setPointerCapture'>,
  controls: FlightPointerControls,
): void {
  let active: number | null = null
  canvas.addEventListener('pointerdown', ev => {
    if (active !== null || !ev.isPrimary || ev.button !== 0) return
    canvas.setPointerCapture(ev.pointerId)
    active = ev.pointerId
    controls.press(ev.clientX, ev.clientY)
  })
  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerId === active) controls.move(ev.clientX, ev.clientY)
  })
  canvas.addEventListener('pointerup', ev => {
    if (ev.pointerId !== active) return
    active = null
    controls.release(ev.clientX, ev.clientY)
  })
  const cancel = (ev: PointerEvent): void => {
    if (ev.pointerId !== active) return
    active = null
    controls.release(undefined, undefined, true)
  }
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('lostpointercapture', cancel)
}
