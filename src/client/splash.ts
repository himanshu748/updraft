import {requestExpandedMode} from '@devvit/web/client'
import type {DayRsp} from '../shared/api.ts'
import {dailyCourse} from '../shared/bot.ts'
import {groundAt} from '../shared/course.ts'
import {dayKey, formatTime, prettyDay} from '../shared/day.ts'
import {simulate} from '../shared/sim.ts'
import {fetchDay} from './fetch.ts'
import {ghostColors} from './render.ts'

const canvas = document.getElementById('map') as HTMLCanvasElement
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const title = document.getElementById('title') as HTMLElement
const stats = document.getElementById('stats') as HTMLElement

startBtn.addEventListener('click', ev => {
  try {
    requestExpandedMode(ev, 'game')
  } catch {
    location.href = 'game.html'
  }
})

let info: DayRsp | undefined

/** The whole course at a glance, with every ghost's line drawn over it. */
function draw(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  const {course} = dailyCourse(info?.day ?? dayKey())
  const t = course.theme
  const w = canvas.width
  const h = canvas.height
  const sx = (x: number): number => (x / (course.finishX + 200)) * w
  const sy = (y: number): number => h - (y / 760) * h
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, t.skyTop)
  sky.addColorStop(1, t.skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  for (const th of course.thermals) {
    ctx.fillStyle = 'rgba(255,190,110,0.3)'
    ctx.fillRect(
      sx(th.x - th.w / 2),
      sy(th.top),
      sx(th.w),
      sy(groundAt(course, th.x)) - sy(th.top),
    )
  }
  for (const b of course.balloons) {
    ctx.fillStyle = `hsl(${b.hue} 80% 60%)`
    ctx.beginPath()
    ctx.arc(sx(b.x), sy(b.y), Math.max(3, (b.r / 760) * h), 0, Math.PI * 2)
    ctx.fill()
  }
  const lines = info?.ghosts ?? []
  lines.forEach((g, i) => {
    ctx.strokeStyle =
      g.name === info?.username
        ? '#fff'
        : (ghostColors[i % ghostColors.length] as string)
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    simulate(course, g.input, f => {
      if (f.frame % 6 === 0) ctx.lineTo(sx(f.x), sy(f.y))
    })
    ctx.stroke()
  })
  ctx.globalAlpha = 1
  ctx.fillStyle = t.ground
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= course.finishX + 200; x += 80)
    ctx.lineTo(sx(x), sy(groundAt(course, x)))
  ctx.lineTo(w, h)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(0, 0, w, h)
}

async function init(): Promise<void> {
  draw()
  try {
    info = await fetchDay()
  } catch {
    return
  }
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
  if (info.streak > 1) parts.push(`🔥 ${info.streak}-day streak`)
  stats.textContent = parts.join(' · ')
  if (info.me) startBtn.textContent = 'Beat your ghost'
  else if (info.day !== info.today) startBtn.textContent = 'Fly this course'
  draw()
}

window.addEventListener('resize', draw)
void init()
