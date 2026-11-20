import {showLoginPrompt, showToast} from '@devvit/web/client'
import type {DayRsp, Ghost, RunRsp} from '../shared/api.ts'
import {dailyCourse} from '../shared/bot.ts'
import {
  type DayKey,
  dayKey,
  formatTime,
  prettyDay,
  untilNextDay,
} from '../shared/day.ts'
import {
  Flight,
  fps,
  InputRecorder,
  maxLaunch,
  type RunInput,
} from '../shared/sim.ts'
import {fetchDay, postRun, postShare} from './fetch.ts'
import {
  type Camera,
  fitScale,
  ghostColors,
  type PlaneSprite,
  Scene,
} from './render.ts'
import {Sfx} from './sfx.ts'

type Mode = 'loading' | 'aim' | 'flying' | 'done'

interface GhostFlight {
  ghost: Ghost
  flight: Flight
  next: number
  hold: boolean
  color: string
  label: string
  trail: number[]
}

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T
const canvas = $<HTMLCanvasElement>('view')
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
const hud = {
  time: $('time'),
  name: $('course-name'),
  par: $('par'),
  bar: $('progress'),
  hint: $('hint'),
  card: $('card'),
  cardBody: $('card-body'),
  again: $<HTMLButtonElement>('again'),
  share: $<HTMLButtonElement>('share'),
  login: $<HTMLButtonElement>('login'),
  mute: $<HTMLButtonElement>('mute'),
  board: $('board'),
}

const sfx = new Sfx()
let day: DayKey = dayKey()
let info: DayRsp | undefined
let scene: Scene
let mode: Mode = 'loading'
let flight: Flight
let recorder = new InputRecorder()
let ghosts: GhostFlight[] = []
let trail: number[] = []
let holding = false
let aimFrom: {x: number; y: number} | undefined
let aim = {lx: 0, ly: 0}
let acc = 0
let last = 0
let doneAt = 0
let camX = 0
let camY = 0

async function init(): Promise<void> {
  try {
    info = await fetchDay()
    day = info.day
  } catch (err) {
    console.warn(`offline; ${err}`)
  }
  const {course} = dailyCourse(day)
  scene = new Scene(course)
  hud.name.textContent = `${prettyDay(day)} · ${course.name}`
  renderPar()
  renderBoard()
  reset()
  requestAnimationFrame(loop)
}

function renderPar(): void {
  const {par} = dailyCourse(day)
  const best = info?.me ? ` · best ${formatTime(info.me.frames)}` : ''
  hud.par.textContent = `🥇 ${formatTime(par.gold)}${best}`
}

function renderBoard(): void {
  const rows = info?.board ?? []
  hud.board.replaceChildren(
    ...rows.map(r => {
      const li = document.createElement('li')
      if (r.name === info?.username) li.className = 'me'
      li.innerHTML = `<b>${r.rank}</b><span></span><i>${formatTime(r.frames)}</i>`
      ;(li.children[1] as HTMLElement).textContent = `u/${r.name}`
      return li
    }),
  )
  if (!rows.length)
    hud.board.innerHTML =
      '<li class="empty">No times yet. Be the first ghost.</li>'
}

function reset(): void {
  const {course} = dailyCourse(day)
  flight = new Flight(course, -1, 0)
  recorder = new InputRecorder()
  trail = []
  holding = false
  aim = {lx: 0, ly: 0}
  aimFrom = undefined
  acc = 0
  const list: Ghost[] = [...(info?.ghosts ?? [])]
  if (info?.me && !list.some(g => g.name === info?.username))
    list.push({
      name: info.username ?? 'you',
      frames: info.me.frames,
      input: info.me.input,
    })
  let colorIndex = 0
  ghosts = list.slice(0, 25).map((ghost, i) => {
    const mine = ghost.name === info?.username
    return {
      ghost,
      flight: new Flight(course, ghost.input.lx, ghost.input.ly),
      next: 0,
      hold: false,
      color: mine
        ? '#ffffff'
        : (ghostColors[colorIndex++ % ghostColors.length] as string),
      label: mine ? 'your best' : i < 3 ? `#${i + 1} ${ghost.name}` : '',
      trail: [],
    }
  })
  mode = 'aim'
  hud.card.hidden = true
  hud.hint.textContent = 'Drag back from the plane, let go to throw'
  hud.hint.hidden = false
  hud.time.textContent = formatTime(0)
}

function launch(): void {
  const {course} = dailyCourse(day)
  flight = new Flight(course, aim.lx, aim.ly)
  mode = 'flying'
  hud.hint.textContent = 'Hold to climb, let go to glide'
  sfx.whoosh()
  setTimeout(() => {
    if (mode === 'flying') hud.hint.hidden = true
  }, 2500)
}

function stepAll(): void {
  recorder.set(holding, flight.frame)
  const rings = flight.ringsTaken
  flight.step(recorder.hold)
  if (flight.ringsTaken > rings) {
    sfx.ring()
    navigator.vibrate?.(15)
  }
  if (flight.frame % 2 === 0) pushTrail(trail, flight.x, flight.y, 240)
  for (const g of ghosts) {
    const f = g.flight
    if (f.status !== 'flying') continue
    while (
      g.next < g.ghost.input.toggles.length &&
      g.ghost.input.toggles[g.next] === f.frame
    ) {
      g.hold = !g.hold
      g.next++
    }
    f.step(g.hold)
    if (f.frame % 3 === 0) pushTrail(g.trail, f.x, f.y, 120)
  }
  if (flight.status !== 'flying') void finish()
}

function pushTrail(t: number[], x: number, y: number, max: number): void {
  t.push(x, y)
  if (t.length > max * 2) t.splice(0, 2)
}

async function finish(): Promise<void> {
  mode = 'done'
  doneAt = performance.now()
  hud.hint.hidden = true
  const input: RunInput = {
    lx: aim.lx,
    ly: aim.ly,
    toggles: [...recorder.toggles],
  }
  const ok = flight.status === 'finished'
  if (ok) sfx.finish()
  else {
    sfx.crash()
    navigator.vibrate?.([30, 40, 30])
  }
  let rsp: RunRsp | undefined
  try {
    rsp = await postRun({day, input})
  } catch (err) {
    console.warn(`run not saved; ${err}`)
  }
  showCard(rsp)
  try {
    info = await fetchDay()
    renderPar()
    renderBoard()
  } catch {}
}

function showCard(rsp: RunRsp | undefined): void {
  const ok = flight.status === 'finished'
  const medal = rsp?.medal ?? 'none'
  const icon = {gold: '🥇', silver: '🥈', bronze: '🥉', none: ok ? '🛬' : '💥'}[
    medal
  ]
  const lines: string[] = []
  if (ok) {
    lines.push(`<div class="big">${icon} ${formatTime(flight.frame)}</div>`)
    if (rsp?.improved)
      lines.push('<div class="pill new">New personal best</div>')
    if (rsp?.rank)
      lines.push(`<div>#${rsp.rank} of ${rsp.players} pilots today</div>`)
    if (rsp && rsp.players > 1)
      lines.push(`<div>Faster than ${rsp.beat}% of the field</div>`)
    if (rsp?.best && !rsp.improved)
      lines.push(`<div class="dim">Your best: ${formatTime(rsp.best)}</div>`)
  } else {
    lines.push(
      `<div class="big">${icon} ${flight.status === 'timeout' ? 'Out of time' : 'Crashed'}</div>`,
    )
    lines.push(
      `<div>Made it ${Math.round(flight.progress * 100)}% of the way</div>`,
    )
  }
  if (flight.ringsTaken)
    lines.push(
      `<div class="dim">${flight.ringsTaken} boost ring${flight.ringsTaken > 1 ? 's' : ''}</div>`,
    )
  const streak = rsp?.streak ?? 0
  if (info && info.day === info.today) {
    const flownToday = ok || Boolean(rsp?.best ?? info.me)
    const next = `New course in ${untilNextDay()}`
    if (!flownToday && streak)
      lines.push(
        `<div>🔥 Land a run today to keep your ${streak}-day streak</div>`,
      )
    else if (streak) lines.push(`<div>🔥 ${streak}-day streak · ${next}</div>`)
    else if (flownToday) lines.push(`<div class="dim">${next}</div>`)
  } else if (streak) lines.push(`<div>🔥 ${streak}-day streak</div>`)
  hud.cardBody.innerHTML = lines.join('')
  const loggedIn = Boolean(info?.username)
  hud.share.hidden = !loggedIn || !(rsp?.best ?? info?.me)
  hud.login.hidden = loggedIn || !ok
  hud.card.hidden = false
}

function loop(now: number): void {
  const dt = Math.min(0.25, (now - (last || now)) / 1000)
  last = now
  if (mode === 'flying') {
    acc += dt
    while (acc >= 1 / fps && mode === 'flying') {
      acc -= 1 / fps
      stepAll()
    }
    hud.time.textContent = formatTime(flight.frame)
  }
  draw(now)
  requestAnimationFrame(loop)
}

function camera(): Camera {
  const w = canvas.width
  const h = canvas.height
  const scale = fitScale(w, h)
  const viewH = h / scale
  const targetX = flight.x - (w / scale) * 0.28
  const targetY = Math.max(-30, Math.min(760 - viewH, flight.y - viewH * 0.5))
  camX += (targetX - camX) * (mode === 'aim' ? 1 : 0.2)
  camY += (Math.max(-30, targetY) - camY) * (mode === 'aim' ? 1 : 0.1)
  return {x: camX, y: camY, scale, w, h}
}

function draw(now: number): void {
  const cam = camera()
  const frame = mode === 'aim' ? Math.floor(now / (1000 / fps)) : flight.frame
  const planes: PlaneSprite[] = []
  for (const g of ghosts) {
    if (mode === 'aim') continue
    planes.push({
      x: g.flight.x,
      y: g.flight.y,
      hx: g.flight.hx,
      hy: g.flight.hy,
      color: g.color,
      alpha: 0.6,
      label: g.label,
      trail: g.trail,
    })
  }
  const crashed = mode === 'done' && flight.status !== 'finished'
  const wobble = crashed ? Math.min(1, (now - doneAt) / 500) : 0
  planes.push({
    x: flight.x,
    y: flight.y - wobble * 6,
    hx: crashed ? 0.6 : flight.hx,
    hy: crashed ? -0.8 : flight.hy,
    color: '#ffffff',
    alpha: 1,
    trail,
  })
  scene.draw(ctx, cam, frame, planes, flight.rings)
  if (mode === 'aim') drawAim(cam)
  const pct = flight.progress * 100
  hud.bar.style.setProperty('--p', `${pct}%`)
}

function drawAim(cam: Camera): void {
  if (!aimFrom || (aim.lx === 0 && aim.ly === 0)) return
  const preview = new Flight(dailyCourse(day).course, aim.lx, aim.ly)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (let i = 0; i < 70 && preview.status === 'flying'; i++) {
    preview.step(false)
    if (i % 5 === 0) {
      ctx.beginPath()
      ctx.arc(
        (preview.x - cam.x) * cam.scale,
        cam.h - (preview.y - cam.y) * cam.scale,
        3,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
  }
  const power = Math.min(1, Math.hypot(aim.lx, aim.ly) / maxLaunch)
  ctx.strokeStyle = `hsl(${120 - power * 120} 90% 60%)`
  ctx.lineWidth = 4
  ctx.beginPath()
  const px = (flight.x - cam.x) * cam.scale
  const py = cam.h - (flight.y - cam.y) * cam.scale
  ctx.moveTo(px, py)
  ctx.lineTo(px + (aim.lx / maxLaunch) * 80, py + (aim.ly / maxLaunch) * 80)
  ctx.stroke()
}

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
}

function press(x: number, y: number): void {
  sfx.unlock()
  if (mode === 'aim') aimFrom = {x, y}
  else if (mode === 'flying') holding = true
}

function move(x: number, y: number): void {
  if (mode !== 'aim' || !aimFrom) return
  const k =
    maxLaunch / (Math.min(canvas.clientWidth, canvas.clientHeight) * 0.35)
  const lx = Math.max(
    -maxLaunch,
    Math.min(maxLaunch, Math.round((x - aimFrom.x) * k)),
  )
  const ly = Math.max(
    -maxLaunch,
    Math.min(maxLaunch, Math.round((y - aimFrom.y) * k)),
  )
  aim = {lx, ly}
}

function release(): void {
  if (mode === 'aim' && aimFrom) {
    aimFrom = undefined
    if (Math.hypot(aim.lx, aim.ly) > maxLaunch * 0.12 && aim.lx < 0) launch()
    else {
      aim = {lx: 0, ly: 0}
      hud.hint.textContent = 'Pull back to the left, then let go'
    }
  } else if (mode === 'flying') holding = false
}

canvas.addEventListener('pointerdown', ev => {
  canvas.setPointerCapture(ev.pointerId)
  press(ev.clientX, ev.clientY)
})
canvas.addEventListener('pointermove', ev => move(ev.clientX, ev.clientY))
canvas.addEventListener('pointerup', () => release())
canvas.addEventListener('pointercancel', () => release())
window.addEventListener('keydown', ev => {
  if (ev.repeat || ev.target instanceof HTMLButtonElement) return
  if (ev.code === 'Space' || ev.code === 'ArrowUp') {
    ev.preventDefault()
    sfx.unlock()
    if (mode === 'aim') {
      aim = {lx: -95, ly: 35}
      launch()
    } else if (mode === 'flying') holding = true
    else if (mode === 'done' && performance.now() - doneAt > 600) reset()
  }
})
window.addEventListener('keyup', ev => {
  if (ev.code === 'Space' || ev.code === 'ArrowUp') holding = false
})
window.addEventListener('resize', resize)
hud.again.addEventListener('click', () => reset())
hud.login.addEventListener('click', () => {
  try {
    showLoginPrompt()
  } catch {}
})
hud.share.addEventListener('click', async () => {
  hud.share.disabled = true
  try {
    await postShare({day})
    toast('Posted your time in the comments')
  } catch (err) {
    toast(`Couldn't post: ${err instanceof Error ? err.message : err}`)
  } finally {
    hud.share.disabled = false
  }
})
hud.mute.addEventListener('click', () => {
  hud.mute.textContent = sfx.toggle() ? '🔊' : '🔇'
})

function toast(text: string): void {
  try {
    showToast(text)
  } catch {
    hud.hint.textContent = text
    hud.hint.hidden = false
  }
}

resize()
void init()
