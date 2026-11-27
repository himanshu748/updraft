import {
  context,
  navigateTo,
  showLoginPrompt,
  showToast,
} from '@devvit/web/client'
import type {DayRsp, Ghost, RunRsp} from '../shared/api.ts'
import {autopilot, dailyCourse} from '../shared/bot.ts'
import {
  countdown,
  type DayKey,
  dayKey,
  formatTime,
  isDayKey,
  prettyDay,
} from '../shared/day.ts'
import {
  Flight,
  fps,
  InputRecorder,
  maxLaunch,
  type RunInput,
} from '../shared/sim.ts'
import {fetchDay, postRun, postShare} from './fetch.ts'
import {drawScraps, type Scrap, spawnBurst, stepScraps} from './fx.ts'
import {bindFlightPointer} from './pointer.ts'
import {
  type Camera,
  fitScale,
  ghostColors,
  type PlaneSprite,
  Scene,
} from './render.ts'
import {
  leadSeconds,
  parPilot,
  personalBest,
  pickRaceTarget,
  pilotName,
  rivalSplits,
} from './rival.ts'
import {Sfx} from './sfx.ts'
import {coachedThrow, resolveThrow} from './throw.ts'

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
  verification: $('verification'),
  again: $<HTMLButtonElement>('again'),
  share: $<HTMLButtonElement>('share'),
  login: $<HTMLButtonElement>('login'),
  mute: $<HTMLButtonElement>('mute'),
  board: $('board'),
  boardHint: $('board-hint'),
  rival: $('rival'),
  personalRival: $<HTMLButtonElement>('personal-rival'),
  parRival: $<HTMLButtonElement>('par-rival'),
  next: $('next'),
}

const sfx = new Sfx()
const muteKey = 'updraft:muted'
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const scraps: Scrap[] = []
const paper = '#fffaf3'
let frameDt = 1 / 60
const postDate = context?.postData?.day
let day: DayKey = isDayKey(postDate) ? postDate : dayKey()
let canSubmit = isDayKey(postDate)
let info: DayRsp | undefined
let nextDayRequest = 0
let appliedDayRequest = 0
let scene: Scene
let mode: Mode = 'loading'
let flight: Flight
let recorder = new InputRecorder()
let ghosts: GhostFlight[] = []
let rival: string | null = null
let requestedRival: string | null = null
let rivalFlight: GhostFlight | undefined
const rivalColor = '#ffd23f'
/** The autopilot that set the day's par: always there to race, even before anyone has flown. */
let parGhost: {day: DayKey; ghost: Ghost} | undefined

function parPilotGhost(): Ghost {
  if (parGhost?.day !== day) {
    const {course, bot} = dailyCourse(day)
    parGhost = {
      day,
      ghost: {name: parPilot, frames: bot.frames, input: autopilot(course)},
    }
  }
  return parGhost.ghost
}
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
    canSubmit = true
  } catch (err) {
    console.warn(`offline; ${err}`)
  }
  requestedRival = storedRival()
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
  const lines = [`🥇 par ${formatTime(par.gold)}`]
  if (info?.me) lines.push(`best ${formatTime(info.me.frames)}`)
  hud.par.replaceChildren(
    ...lines.map(text => {
      const div = document.createElement('div')
      div.textContent = text
      return div
    }),
  )
}

function storedRival(): string | null {
  try {
    return localStorage.getItem(`updraft:rival:${day}`)
  } catch {
    return null
  }
}

function chooseRival(name: string): void {
  requestedRival = name
  try {
    localStorage.setItem(`updraft:rival:${day}`, name)
  } catch {}
  renderBoard()
  if (mode === 'aim') reset()
  else {
    hud.rival.hidden = false
    hud.rival.className = 'sub rival'
    hud.rival.textContent = `next: vs ${pilotName(name)}`
  }
}

function canRace(name: string): boolean {
  return (
    name !== info?.username && Boolean(info?.ghosts.some(g => g.name === name))
  )
}

function renderBoard(): void {
  const rows = info?.board ?? []
  rival = pickRaceTarget(
    info?.ghosts ?? [],
    info?.username ?? null,
    info?.me?.frames ?? null,
    requestedRival,
  )
  hud.personalRival.hidden = !info?.me
  hud.personalRival.setAttribute('aria-pressed', String(rival === personalBest))
  hud.parRival.setAttribute('aria-pressed', String(rival === parPilot))
  hud.board.replaceChildren(
    ...rows.map(r => {
      const li = document.createElement('li')
      if (r.name === info?.username) li.className = 'me'
      if (r.name === rival) li.classList.add('rival')
      const raceable = canRace(r.name)
      const row = document.createElement(raceable ? 'button' : 'div')
      row.className = 'row'
      row.innerHTML = `<b>${r.rank}</b><span></span><i>${formatTime(r.frames)}</i>`
      ;(row.children[1] as HTMLElement).textContent = `u/${r.name}`
      if (row instanceof HTMLButtonElement) {
        row.type = 'button'
        row.setAttribute('aria-pressed', String(r.name === rival))
        row.setAttribute('aria-label', `Race u/${r.name}'s ghost`)
        row.addEventListener('click', () => chooseRival(r.name))
      }
      li.append(row)
      return li
    }),
  )
  hud.boardHint.hidden = !rows.some(r => canRace(r.name))
  if (!rows.length) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = info
      ? 'No times yet. Be the first ghost.'
      : canSubmit
        ? 'Leaderboard unavailable. You can still fly.'
        : 'Leaderboard unavailable. You can still practice.'
    hud.board.append(empty)
  }
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
  const list: Ghost[] = (info?.ghosts ?? [])
    .filter(g => g.name !== info?.username)
    .sort((a, b) => Number(b.name === rival) - Number(a.name === rival))
    .slice(0, info?.me ? 24 : 25)
  if (info?.me) {
    list.push({
      name: personalBest,
      frames: info.me.frames,
      input: info.me.input,
    })
  }
  let colorIndex = 0
  ghosts = [...list, parPilotGhost()].map(ghost => {
    const mine = ghost.name === personalBest
    const chased = ghost.name === rival
    const par = ghost.name === parPilot
    const rank = info?.board.find(r => r.name === ghost.name)?.rank
    return {
      ghost,
      flight: new Flight(course, ghost.input.lx, ghost.input.ly),
      next: 0,
      hold: false,
      color: mine
        ? '#ffffff'
        : chased
          ? rivalColor
          : par
            ? '#c9d3e6'
            : (ghostColors[colorIndex++ % ghostColors.length] as string),
      label: mine
        ? 'your best'
        : chased
          ? `vs ${pilotName(ghost.name)}`
          : par
            ? parPilot
            : rank && rank <= 3
              ? `#${rank} ${ghost.name}`
              : '',
      trail: [],
    }
  })
  rivalFlight = ghosts.find(g => g.ghost.name === rival)
  hud.rival.hidden = !rivalFlight
  hud.rival.className = 'sub rival'
  hud.rival.textContent = rival ? `vs ${pilotName(rival)}` : ''
  mode = 'aim'
  hud.card.hidden = true
  hud.hint.textContent = throwHint()
  hud.hint.hidden = false
  hud.time.textContent = formatTime(0)
  renderNext()
}

function launch(): void {
  const {course} = dailyCourse(day)
  flight = new Flight(course, aim.lx, aim.ly)
  mode = 'flying'
  hud.hint.textContent = 'Hold to climb, let go to glide'
  sfx.whoosh()
  if (!reduceMotion) spawnBurst(scraps, flight.x, flight.y, paper, 12, 140)
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
    if (!reduceMotion) spawnBurst(scraps, flight.x, flight.y, '#ffd23f', 8, 110)
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
    if (!reduceMotion) spawnBurst(scraps, flight.x, flight.y, paper, 16, 160)
  }
  const run = flight
  const racedGhost = rivalFlight?.ghost
  showCard(undefined, input, racedGhost, canSubmit)
  if (!canSubmit) return
  let rsp: RunRsp | undefined
  try {
    rsp = await postRun({day, input})
  } catch (err) {
    console.warn(`run not saved; ${err}`)
  }
  // The player may have restarted while the server was replaying this flight.
  if (flight === run) {
    if (rsp?.improved) recordComment(null)
    showCard(rsp, input, racedGhost, false)
  }
  const request = ++nextDayRequest
  try {
    const next = await fetchDay()
    // A later refresh or a confirmed comment can already have updated this view.
    if (request < appliedDayRequest) return
    appliedDayRequest = request
    info = next
    renderPar()
    renderBoard()
    renderShare()
  } catch {}
}

/** Live split against the chosen rival: how far ahead or behind, in seconds. */
function renderLead(): void {
  if (!rivalFlight) return
  const r = rivalFlight.flight
  const who = pilotName(rivalFlight.ghost.name)
  if (r.status === 'finished') {
    hud.rival.className = 'sub rival behind'
    hud.rival.textContent = `${who} landed`
    return
  }
  const s = leadSeconds(flight.x, r.x, flight.speed)
  hud.rival.className = `sub rival ${s >= 0 ? 'ahead' : 'behind'}`
  hud.rival.textContent = `${s >= 0 ? '▲' : '▼'} ${Math.abs(s).toFixed(2)}s ${s >= 0 ? 'ahead of' : 'behind'} ${who}`
}

function renderShare(): void {
  hud.share.textContent = info?.myComment
    ? 'View my comment'
    : 'Comment my time'
}

function recordComment(url: string | null): void {
  if (!info) return
  info.myComment = url
  appliedDayRequest = ++nextDayRequest
}

function showCard(
  rsp: RunRsp | undefined,
  input: RunInput,
  racedGhost: Ghost | undefined,
  pending: boolean,
): void {
  const ok = flight.status === 'finished'
  const verified = rsp?.status === 'finished' && rsp.frames === flight.frame
  const medal = verified ? rsp.medal : 'none'
  const icon = {gold: '🥇', silver: '🥈', bronze: '🥉', none: ok ? '🛬' : '💥'}[
    medal
  ]
  const lines: string[] = []
  if (ok) {
    lines.push(`<div class="big">${icon} ${formatTime(flight.frame)}</div>`)
    if (verified && rsp.improved)
      lines.push('<div class="pill new">New personal best</div>')
    if (racedGhost) {
      const diff = flight.frame - racedGhost.frames
      const who = escapeHtml(pilotName(racedGhost.name))
      if (diff < 0)
        lines.push(
          `<div class="pill win">Beat ${who} by ${formatTime(-diff)}</div>`,
        )
      else if (diff === 0) lines.push(`<div>Dead heat with ${who}</div>`)
      else {
        const winner =
          racedGhost.name === parPilot
            ? 'The par pilot'
            : racedGhost.name === personalBest
              ? 'Your best'
              : who
        lines.push(`<div>${winner} was ${formatTime(diff)} faster</div>`)
      }
    }
    if (verified && rsp.rank && rsp.players !== null)
      lines.push(`<div>#${rsp.rank} of ${rsp.players} pilots today</div>`)
    if (
      verified &&
      rsp.players !== null &&
      rsp.players > 1 &&
      rsp.beat !== null
    )
      lines.push(`<div>Faster than ${rsp.beat}% of the field</div>`)
    if (verified && rsp.best && !rsp.improved)
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
    if (!flownToday && streak)
      lines.push(
        `<div>🔥 Land a run today to keep your ${streak}-day streak</div>`,
      )
    else if (streak) lines.push(`<div>🔥 ${streak}-day streak</div>`)
  } else if (streak) lines.push(`<div>🔥 ${streak}-day streak</div>`)
  if (racedGhost) {
    const splits = rivalSplits(flight.course, input, racedGhost.input)
    if (splits.length) {
      const who = escapeHtml(pilotName(racedGhost.name))
      const rows = splits.map(({percent, delta}) => {
        const pace = delta < 0 ? 'ahead' : delta > 0 ? 'behind' : 'tied'
        const result =
          delta === 0 ? 'Tied' : `${formatTime(Math.abs(delta))} ${pace}`
        return `<li class="${pace}"><b>${percent}%</b><span>${result}</span></li>`
      })
      lines.push(
        `<h3>Splits vs ${who}</h3><ul class="splits">${rows.join('')}</ul>`,
      )
    }
  }
  hud.cardBody.innerHTML = lines.join('')
  let verification = ''
  if (!canSubmit) {
    verification = 'Practice flight. Reopen the post to race for a time.'
  } else if (ok) {
    if (pending) verification = 'Checking your time on the server…'
    else if (!verified) verification = 'The server did not confirm this time.'
    else if (rsp.saved) verification = 'Server verified this flight.'
    else
      verification =
        'Server verified this guest flight. Sign in to save a time.'
  }
  hud.verification.textContent = verification
  const loggedIn = Boolean(info?.username)
  hud.share.hidden = pending || !loggedIn || !(rsp?.best ?? info?.me)
  renderShare()
  hud.login.hidden = !canSubmit || loggedIn || !ok
  const opening = hud.card.hidden
  hud.card.hidden = false
  renderNext()
  if (!opening) return
  const run = flight
  setTimeout(() => {
    if (mode !== 'done' || flight !== run) return
    staleSpace = spaceHeld
    hud.again.focus({preventScroll: true})
  }, 600)
}

function loop(now: number): void {
  const dt = Math.min(0.25, (now - (last || now)) / 1000)
  last = now
  frameDt = dt
  if (mode === 'flying') {
    acc += dt
    while (acc >= 1 / fps && mode === 'flying') {
      acc -= 1 / fps
      stepAll()
    }
    hud.time.textContent = formatTime(flight.frame)
    if (flight.frame % 6 === 0) renderLead()
  }
  if (!reduceMotion) stepScraps(scraps, dt)
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
  const snap = mode === 'aim' || reduceMotion
  const kx = snap ? 1 : 1 - Math.exp(-8 * frameDt)
  const ky = snap ? 1 : 1 - Math.exp(-5 * frameDt)
  camX += (targetX - camX) * kx
  camY += (Math.max(-30, targetY) - camY) * ky
  return {x: camX, y: camY, scale, w, h, dpr: w / (canvas.clientWidth || w)}
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
  const bob = mode === 'aim' && !reduceMotion ? Math.sin(now / 320) * 3.5 : 0
  planes.push({
    x: flight.x,
    y: flight.y + bob - wobble * 6,
    hx: crashed ? 0.6 : flight.hx,
    hy: crashed ? -0.8 : flight.hy,
    color: paper,
    alpha: 1,
    trail,
  })
  scene.draw(ctx, cam, frame, planes, flight.rings)
  drawScraps(ctx, cam, scraps)
  if (mode === 'aim') drawAim(cam, bob)
  const pct = flight.progress * 100
  hud.bar.style.setProperty('--p', `${pct}%`)
}

/** Before the first drag: pulse the plane and point left so a new player knows where to pull. */
function drawThrowCue(u: number, px: number, py: number): void {
  const t = (performance.now() % 1400) / 1400
  const reach = Math.min(70 * u, px - 8 * u)
  const tip = px - reach
  const ty = py - 26 * u
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [color, width] of [
    ['rgba(20,28,52,0.45)', 6],
    ['#fff', 3],
  ] as const) {
    ctx.globalAlpha = 1 - t * 0.85
    ctx.strokeStyle = color
    ctx.lineWidth = width * u
    ctx.beginPath()
    ctx.arc(px, py, (14 + 22 * t) * u, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.moveTo(px - 10 * u, ty)
    ctx.lineTo(tip, ty)
    ctx.moveTo(tip + 8 * u, ty - 7 * u)
    ctx.lineTo(tip, ty)
    ctx.lineTo(tip + 8 * u, ty + 7 * u)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
}

function drawAim(cam: Camera, bob: number): void {
  const u = canvas.width / (canvas.clientWidth || canvas.width)
  const px = (flight.x - cam.x) * cam.scale
  const py = cam.h - (flight.y + bob - cam.y) * cam.scale
  if (!aimFrom || (aim.lx === 0 && aim.ly === 0)) {
    if (!aimFrom) drawThrowCue(u, px, py)
    return
  }
  const preview = new Flight(dailyCourse(day).course, aim.lx, aim.ly)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (let i = 0; i < 70 && preview.status === 'flying'; i++) {
    preview.step(false)
    if (i % 5 === 0) {
      ctx.beginPath()
      ctx.arc(
        (preview.x - cam.x) * cam.scale,
        cam.h - (preview.y - cam.y) * cam.scale,
        3 * u,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
  }
  const power = Math.min(1, Math.hypot(aim.lx, aim.ly) / maxLaunch)
  ctx.strokeStyle = `hsl(${120 - power * 120} 90% 60%)`
  ctx.lineWidth = 4 * u
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(
    px + (aim.lx / maxLaunch) * 80 * u,
    py + (aim.ly / maxLaunch) * 80 * u,
  )
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

function release(x?: number, y?: number, cancel = false): void {
  if (mode === 'aim' && aimFrom) {
    const from = aimFrom
    aimFrom = undefined
    if (cancel || x === undefined || y === undefined) {
      aim = {lx: 0, ly: 0}
      return
    }
    const thrown = resolveThrow(
      aim.lx,
      aim.ly,
      Math.hypot(x - from.x, y - from.y),
    )
    if (thrown) {
      aim = thrown
      launch()
    } else {
      aim = {lx: 0, ly: 0}
      hud.hint.textContent = 'Pull back to the left, then let go'
    }
  } else if (mode === 'flying') holding = false
}

bindFlightPointer(canvas, {press, move, release})
canvas.addEventListener('contextmenu', ev => ev.preventDefault())
window.addEventListener('keydown', ev => {
  if (ev.repeat) return
  const onButton = ev.target instanceof HTMLButtonElement
  if ((ev.code === 'Space' && !onButton) || ev.code === 'ArrowUp') {
    ev.preventDefault()
    sfx.unlock()
    if (mode === 'aim') {
      aim = {...coachedThrow}
      launch()
    } else if (mode === 'flying') holding = true
    else if (mode === 'done' && performance.now() - doneAt > 600) reset()
  }
})
window.addEventListener('keyup', ev => {
  if (ev.code === 'Space' || ev.code === 'ArrowUp') holding = false
})
window.addEventListener('blur', () => {
  holding = false
})
window.addEventListener('resize', resize)
// A Space held through the crash must not click Fly again when it is released.
let spaceHeld = false
let staleSpace = false
window.addEventListener('keydown', ev => {
  if (ev.code === 'Space') spaceHeld = true
})
window.addEventListener('keyup', ev => {
  if (ev.code === 'Space') spaceHeld = false
})
hud.again.addEventListener('keyup', ev => {
  if (ev.code !== 'Space') return
  if (staleSpace) ev.preventDefault()
  staleSpace = false
})
hud.again.addEventListener('click', () => {
  if (performance.now() - doneAt > 600) reset()
})
hud.personalRival.addEventListener('click', () => chooseRival(personalBest))
hud.parRival.addEventListener('click', () => chooseRival(parPilot))
hud.login.addEventListener('click', () => {
  try {
    showLoginPrompt()
  } catch {}
})
hud.share.addEventListener('click', async () => {
  const url = info?.myComment
  if (url) {
    try {
      navigateTo(url)
    } catch {
      window.open(url, '_blank')
    }
    return
  }
  const run = flight
  hud.share.disabled = true
  try {
    const rsp = await postShare({day})
    if (flight !== run) return
    recordComment(rsp.commentUrl)
    toast(
      rsp.existing
        ? 'You already commented this time'
        : 'Posted your time in the comments',
    )
  } catch (err) {
    if (flight === run) {
      if (err instanceof DOMException && err.name === 'AbortError')
        toast('Could not confirm your comment. Check the post comments.')
      else toast(`Couldn't post: ${err instanceof Error ? err.message : err}`)
    }
  } finally {
    hud.share.disabled = false
    renderShare()
  }
})
function setSound(on: boolean): void {
  sfx.on = on
  hud.mute.textContent = on ? '🔊' : '🔇'
  hud.mute.setAttribute('aria-pressed', String(!on))
  try {
    localStorage.setItem(muteKey, on ? '0' : '1')
  } catch {}
}
hud.mute.addEventListener('click', ev => {
  setSound(!sfx.on)
  // A tapped (not keyboard-activated) mute button gives focus back so Space keeps flying.
  if (ev.detail > 0) hud.mute.blur()
})

function toast(text: string): void {
  try {
    showToast(text)
  } catch {
    hud.hint.textContent = text
    hud.hint.hidden = false
  }
}

try {
  if (localStorage.getItem(muteKey) === '1') setSound(false)
} catch {}
function throwHint(): string {
  const touch =
    matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0 ||
    window.innerWidth <= 480
  return touch
    ? 'Tap to throw. Drag back to aim.'
    : 'Tap to throw, drag back to aim, or press Space'
}

function renderNext(): void {
  const show = mode === 'done' && !hud.card.hidden
  hud.next.hidden = !show
  if (show) hud.next.textContent = `Next course in ${countdown()}`
}

resize()
setInterval(renderNext, 1000)
void init()

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}
