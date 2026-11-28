import {context, requestExpandedMode} from '@devvit/web/client'
import type {DayRsp} from '../shared/api.ts'
import {dailyCourse} from '../shared/bot.ts'
import {groundAt} from '../shared/course.ts'
import {countdown, dayKey, formatTime, isDayKey, prettyDay} from '../shared/day.ts'
import {simulate} from '../shared/sim.ts'
import {fetchDay} from './fetch.ts'
import {type Camera, drawPlane, ghostColors} from './render.ts'
import {parPilot, personalBest, pickRaceTarget, pilotName} from './rival.ts'

const canvas = document.getElementById('map') as HTMLCanvasElement
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const title = document.getElementById('title') as HTMLElement
const stats = document.getElementById('stats') as HTMLElement
const countdownEl = document.getElementById('countdown') as HTMLElement
const podium = document.getElementById('podium') as HTMLElement
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const postDay = context?.postData?.day
const initialDay = dayKey()
const previewDay = isDayKey(postDay) ? postDay : initialDay

startBtn.addEventListener('click', ev => {
  try {
    requestExpandedMode(ev, 'game')
  } catch {
    location.href = 'game.html'
  }
})

let info: DayRsp | undefined
let backdrop: HTMLCanvasElement | undefined
let backdropW = 0
let backdropH = 0

/** The whole course at a glance, with every ghost's line drawn over it. */
function paintBackdrop(w: number, h: number): void {
  canvas.width = w
  canvas.height = h
  if (!backdrop) backdrop = document.createElement('canvas')
  backdrop.width = w
  backdrop.height = h
  backdropW = w
  backdropH = h
  const b = backdrop.getContext('2d') as CanvasRenderingContext2D
  const {course} = dailyCourse(info?.day ?? previewDay)
  const t = course.theme
  const sx = (x: number): number => (x / (course.finishX + 200)) * w
  const sy = (y: number): number => h - (y / 760) * h
  const sky = b.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, t.skyTop)
  sky.addColorStop(1, t.skyBottom)
  b.fillStyle = sky
  b.fillRect(0, 0, w, h)
  for (const th of course.thermals) {
    b.fillStyle = 'rgba(255,190,110,0.3)'
    b.fillRect(
      sx(th.x - th.w / 2),
      sy(th.top),
      sx(th.w),
      sy(groundAt(course, th.x)) - sy(th.top),
    )
  }
  for (const balloon of course.balloons) {
    b.fillStyle = `hsl(${balloon.hue} 80% 60%)`
    b.beginPath()
    b.arc(
      sx(balloon.x),
      sy(balloon.y),
      Math.max(3, (balloon.r / 760) * h),
      0,
      Math.PI * 2,
    )
    b.fill()
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const lines = info?.ghosts ?? []
  lines.forEach((g, i) => {
    b.strokeStyle =
      g.name === info?.username
        ? '#fff'
        : (ghostColors[i % ghostColors.length] as string)
    b.globalAlpha = 0.55
    b.lineWidth = 2 * dpr
    b.beginPath()
    simulate(course, g.input, f => {
      if (f.frame % 6 === 0) b.lineTo(sx(f.x), sy(f.y))
    })
    b.stroke()
  })
  b.globalAlpha = 1
  b.fillStyle = t.ground
  b.beginPath()
  b.moveTo(0, h)
  for (let x = 0; x <= course.finishX + 200; x += 80)
    b.lineTo(sx(x), sy(groundAt(course, x)))
  b.lineTo(w, h)
  b.fill()
  b.fillStyle = 'rgba(0,0,0,0.18)'
  b.fillRect(0, 0, w, h)
}

/** A paper plane already in the air, so the post is moving the moment it opens. */
function drawGlider(now: number): void {
  const w = canvas.width
  const h = canvas.height
  if (w < 2 || h < 2) return
  const scale = Math.max(1.6, Math.min(w, h) / 380)
  const t = reduceMotion ? 0.5 : (now % 8000) / 8000
  // Stay inside the sky so a wing is never cut off, and fade the loop.
  const sx = (0.18 + t * 0.64) * w
  const sy = h * 0.15 + Math.sin(t * Math.PI * 2) * h * 0.025
  const fade = Math.min(1, t * 8, (1 - t) * 8)
  const cam: Camera = {x: 0, y: 0, scale, w, h, dpr: 1}
  drawPlane(ctx, cam, {
    x: sx / scale,
    y: (h - sy) / scale,
    hx: 1,
    hy: Math.cos(t * Math.PI * 2) * 0.35,
    color: '#fffaf3',
    alpha: fade,
  })
}

function renderSplash(now = 0): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.round(canvas.clientWidth * dpr)
  const h = Math.round(canvas.clientHeight * dpr)
  if (w < 2 || h < 2) return
  if (!backdrop || w !== backdropW || h !== backdropH) paintBackdrop(w, h)
  if (!backdrop) return
  ctx.drawImage(backdrop, 0, 0)
  drawGlider(now)
}

function loop(now: number): void {
  renderSplash(now)
  if (!reduceMotion) requestAnimationFrame(loop)
}

/** The rival the game will pick, so the button names who you're about to race. */
function storedRival(day: string): string | null {
  try {
    return localStorage.getItem(`updraft:rival:${day}`)
  } catch {
    return null
  }
}

function renderCountdown(): void {
  countdownEl.textContent = `Next course in ${countdown()}`
}

async function init(): Promise<void> {
  if (previewDay !== initialDay) {
    title.textContent = `${prettyDay(previewDay)} · ${dailyCourse(previewDay).course.name}`
    startBtn.textContent = 'Fly this course'
  }
  renderCountdown()
  renderSplash()
  try {
    info = await fetchDay()
  } catch {
    return
  }
  backdropW = 0
  const {course, par} = dailyCourse(info.day)
  title.textContent = `${prettyDay(info.day)} · ${course.name}`
  const parts = [`${course.theme.name}`, `🥇 par ${formatTime(par.gold)}`]
  if (info.players)
    parts.push(`${info.players} pilot${info.players > 1 ? 's' : ''}`)
  if (info.board[0])
    parts.push(
      `fastest ${formatTime(info.board[0].frames)} by u/${info.board[0].name}`,
    )
  if (info.me)
    parts.push(`your best ${formatTime(info.me.frames)} (#${info.me.rank})`)
  const today = info.day === info.today
  if (info.streak !== null && info.streak > 1)
    parts.push(
      today && !info.me
        ? `🔥 ${info.streak}-day streak, fly today to keep it`
        : `🔥 ${info.streak}-day streak`,
    )
  stats.textContent = parts.join(' · ')
  const medals = ['🥇', '🥈', '🥉']
  podium.textContent = info.yesterday.length
    ? `Yesterday: ${info.yesterday.map((r, i) => `${medals[i]}\u00a0u/${r.name}\u00a0${formatTime(r.frames)}`).join(' · ')}`
    : ''
  podium.hidden = !info.yesterday.length
  const stored = storedRival(info.day)
  const rival = pickRaceTarget(
    info.ghosts,
    info.username,
    info.me?.frames ?? null,
    stored,
  )
  if (rival === personalBest) startBtn.textContent = 'Beat your ghost'
  else if (rival !== parPilot || stored === parPilot)
    startBtn.textContent = `Chase ${pilotName(rival)}`
  else if (info.day !== info.today) startBtn.textContent = 'Fly this course'
  renderSplash()
}

window.addEventListener('resize', () => {
  backdropW = 0
  renderSplash()
})
setInterval(renderCountdown, 1000)
requestAnimationFrame(loop)
void init()
