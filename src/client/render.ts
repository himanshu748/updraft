import {
  balloonY,
  type Course,
  ceiling,
  groundAt,
  groundStep,
  ringRadius,
} from '../shared/course.ts'
import {hashString, makeRng} from '../shared/rng.ts'

export interface Camera {
  x: number
  y: number
  scale: number
  w: number
  h: number
  /** Device pixels per CSS pixel, so name tags stay readable on phones. */
  dpr: number
}

export interface PlaneSprite {
  x: number
  y: number
  hx: number
  hy: number
  color: string
  alpha: number
  label?: string | undefined
  trail?: readonly number[] | undefined
}

export const ghostColors = [
  '#ff5c8a',
  '#4f8cff',
  '#ffb020',
  '#22c39a',
  '#a86bff',
  '#ff7a45',
]

interface Cloud {
  x: number
  y: number
  s: number
}

export class Scene {
  readonly course: Course
  private readonly clouds: Cloud[]
  private readonly stars: Cloud[]
  constructor(course: Course) {
    this.course = course
    const rng = makeRng(hashString(`sky:${course.day}`))
    this.clouds = Array.from({length: 26}, () => ({
      x: rng() * (course.finishX * 0.4 + 1200),
      y: 380 + rng() * 420,
      s: 0.6 + rng() * 0.9,
    }))
    this.stars = Array.from({length: 90}, () => ({
      x: rng(),
      y: rng(),
      s: rng(),
    }))
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    frame: number,
    planes: readonly PlaneSprite[],
    taken: readonly boolean[],
  ): void {
    const {course} = this
    const t = course.theme
    const sx = (x: number): number => (x - cam.x) * cam.scale
    const sy = (y: number): number => cam.h - (y - cam.y) * cam.scale
    const s = cam.scale

    const sky = ctx.createLinearGradient(0, 0, 0, cam.h)
    sky.addColorStop(0, t.skyTop)
    sky.addColorStop(1, t.skyBottom)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, cam.w, cam.h)

    if (t.name.startsWith('Starlit')) {
      for (const st of this.stars) {
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(frame / 50 + st.s * 9))
        ctx.fillStyle = '#fff'
        ctx.fillRect(st.x * cam.w, st.y * cam.h * 0.7, 2, 2)
      }
      ctx.globalAlpha = 1
    }

    ctx.fillStyle = t.sun
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(cam.w * 0.78, cam.h * 0.18, Math.max(26, 54 * s), 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    if (!t.name.startsWith('Starlit')) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      for (let i = 0; i < 16; i++) {
        const x = ((i * 197 + frame * (8 + (i % 4) * 3)) % (cam.w + 24)) - 12
        const y = (i * 83) % Math.max(1, cam.h * 0.7)
        ctx.fillRect(x, y, Math.max(2, 2.4 * s), Math.max(1, 1.2 * s))
      }
    }

    for (const c of this.clouds) {
      const x = (c.x - cam.x * 0.3) * s
      if (x < -200 * s || x > cam.w + 200 * s) continue
      const y = cam.h - (c.y - cam.y * 0.5) * s
      ctx.fillStyle = 'rgba(70, 80, 110, 0.13)'
      ctx.beginPath()
      ctx.ellipse(x, y + 8 * s, 74 * c.s * s, 18 * c.s * s, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.82)'
      ctx.beginPath()
      ctx.ellipse(x, y, 70 * c.s * s, 18 * c.s * s, 0, 0, Math.PI * 2)
      ctx.ellipse(
        x + 30 * c.s * s,
        y - 12 * c.s * s,
        40 * c.s * s,
        18 * c.s * s,
        0,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }

    this.hills(ctx, cam, 0.25, 150, 90, t.far, 0.0021)
    this.hills(ctx, cam, 0.5, 90, 70, t.near, 0.0043)

    // thermals
    for (const th of course.thermals) {
      const x0 = sx(th.x - th.w / 2)
      const x1 = sx(th.x + th.w / 2)
      if (x1 < 0 || x0 > cam.w) continue
      const g = ctx.createLinearGradient(x0, 0, x1, 0)
      g.addColorStop(0, 'rgba(255,200,120,0)')
      g.addColorStop(0.5, 'rgba(255,190,110,0.32)')
      g.addColorStop(1, 'rgba(255,200,120,0)')
      ctx.fillStyle = g
      const top = sy(th.top)
      const bottom = sy(groundAt(course, th.x))
      ctx.fillRect(x0, top, x1 - x0, bottom - top)
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = Math.max(1.5, 2.5 * s)
      const span = th.top - groundAt(course, th.x)
      for (let i = 0; i < 7; i++) {
        const px = th.x + ((i * 37) % th.w) - th.w / 2 + th.w * 0.1
        const py =
          groundAt(course, th.x) + ((frame * th.lift * 2 + i * 97) % span)
        const cx = sx(px)
        const cy = sy(py)
        ctx.beginPath()
        ctx.moveTo(cx - 7 * s, cy + 6 * s)
        ctx.lineTo(cx, cy)
        ctx.lineTo(cx + 7 * s, cy + 6 * s)
        ctx.stroke()
      }
    }

    // wind bands
    for (const w of course.winds) {
      const x0 = sx(w.x0)
      const x1 = sx(w.x1)
      if (x1 < 0 || x0 > cam.w) continue
      const y0 = sy(w.y1)
      const y1 = sy(w.y0)
      const tail = w.wx > 0
      const dir = Math.sign(w.wx)
      ctx.fillStyle = tail ? 'rgba(90,255,190,0.24)' : 'rgba(255,60,90,0.3)'
      roundRect(ctx, x0, y0, x1 - x0, y1 - y0, 18 * s)
      ctx.fill()
      ctx.setLineDash([10 * s, 8 * s])
      ctx.strokeStyle = tail ? 'rgba(200,255,235,0.7)' : 'rgba(255,90,110,0.75)'
      ctx.lineWidth = Math.max(1.5, 2.5 * s)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = tail ? 'rgba(255,255,255,0.8)' : 'rgba(255,235,238,0.9)'
      ctx.lineWidth = Math.max(1, 2 * s)
      const len = w.x1 - w.x0
      for (let i = 0; i < 9; i++) {
        const lane = w.y0 + ((i * 53) % (w.y1 - w.y0 - 10)) + 5
        const off = (((frame * w.wx * 4 + i * 211) % len) + len) % len
        const ax = sx(w.x0 + off)
        const ay = sy(lane)
        ctx.beginPath()
        ctx.moveTo(ax - dir * 34 * s, ay)
        ctx.lineTo(ax, ay)
        ctx.moveTo(ax - dir * 8 * s, ay - 6 * s)
        ctx.lineTo(ax, ay)
        ctx.lineTo(ax - dir * 8 * s, ay + 6 * s)
        ctx.stroke()
      }
      const size = Math.max(14, 22 * s)
      ctx.font = `800 ${size}px system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.fillStyle = tail ? 'rgba(255,255,255,0.9)' : 'rgba(255,240,242,0.95)'
      const text = tail ? 'TAILWIND →' : '← HEADWIND'
      const tx = Math.min(
        Math.max(x0 + 12 * s, 12 * s),
        x1 - ctx.measureText(text).width - 12 * s,
      )
      ctx.fillText(text, tx, y0 + size + 8 * s)
    }

    // rings
    course.rings.forEach((r, i) => {
      const x = sx(r.x)
      if (x < -60 || x > cam.w + 60) return
      const y = sy(r.y)
      ctx.globalAlpha = taken[i] ? 0.25 : 1
      ctx.strokeStyle = '#ffd23f'
      ctx.lineWidth = Math.max(3, 7 * s)
      ctx.beginPath()
      ctx.ellipse(
        x,
        y,
        ringRadius * 0.45 * s,
        ringRadius * s,
        0,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = Math.max(1, 2 * s)
      ctx.stroke()
      ctx.globalAlpha = 1
    })

    // balloons
    for (const b of course.balloons) {
      const x = sx(b.x)
      if (x < -80 || x > cam.w + 80) continue
      const by = balloonY(b, frame)
      const y = sy(by)
      const r = b.r * s
      ctx.strokeStyle = 'rgba(60,40,40,0.6)'
      ctx.lineWidth = Math.max(1, 1.5 * s)
      ctx.beginPath()
      ctx.moveTo(x - r * 0.5, y + r * 0.8)
      ctx.lineTo(x - r * 0.25, y + r * 1.45)
      ctx.moveTo(x + r * 0.5, y + r * 0.8)
      ctx.lineTo(x + r * 0.25, y + r * 1.45)
      ctx.stroke()
      ctx.fillStyle = '#8a5a3c'
      ctx.fillRect(x - r * 0.28, y + r * 1.4, r * 0.56, r * 0.4)
      const g = ctx.createRadialGradient(
        x - r * 0.35,
        y - r * 0.4,
        r * 0.1,
        x,
        y,
        r,
      )
      g.addColorStop(0, `hsl(${b.hue} 90% 78%)`)
      g.addColorStop(1, `hsl(${b.hue} 75% 52%)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `hsl(${b.hue} 60% 40%)`
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.45, r, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // finish gate
    const fx = sx(course.finishX)
    if (fx > -40 && fx < cam.w + 40) {
      const top = sy(ceiling)
      const bottom = sy(groundAt(course, course.finishX))
      const sq = 14 * s
      for (let y = top, i = 0; y < bottom; y += sq, i++) {
        ctx.fillStyle = i % 2 ? '#222' : '#fff'
        ctx.fillRect(fx - sq, y, sq, sq)
        ctx.fillStyle = i % 2 ? '#fff' : '#222'
        ctx.fillRect(fx, y, sq, sq)
      }
      ctx.fillStyle = '#ff4d4d'
      ctx.font = `800 ${Math.max(14, 26 * s)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('FINISH', fx, top - 10 * s)
    }

    // ground
    ctx.fillStyle = t.ground
    ctx.beginPath()
    ctx.moveTo(0, cam.h)
    const i0 = Math.max(0, Math.floor(cam.x / groundStep) - 1)
    const i1 = Math.min(
      course.ground.length - 1,
      Math.ceil((cam.x + cam.w / s) / groundStep) + 1,
    )
    for (let i = i0; i <= i1; i++)
      ctx.lineTo(sx(i * groundStep), sy(course.ground[i] ?? 0))
    ctx.lineTo(cam.w, cam.h)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    for (let i = i0; i <= i1; i++) {
      const px = sx(i * groundStep)
      const py = sy(course.ground[i] ?? 0)
      if (i === i0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = shade(t.ground, 0.62)
    ctx.lineWidth = Math.max(4, 8 * s)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = Math.max(1.5, 2.5 * s)
    ctx.stroke()

    // launch flag
    const lx = sx(course.start.x - 40)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = Math.max(2, 3 * s)
    ctx.beginPath()
    ctx.moveTo(lx, sy(300))
    ctx.lineTo(lx, sy(370))
    ctx.stroke()
    ctx.fillStyle = '#ff4500'
    ctx.beginPath()
    ctx.moveTo(lx, sy(370))
    ctx.lineTo(lx + 30 * s, sy(360))
    ctx.lineTo(lx, sy(350))
    ctx.fill()

    for (const p of planes) drawPlane(ctx, cam, p)
    drawLabels(ctx, cam, planes)
  }

  private hills(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    par: number,
    base: number,
    amp: number,
    color: string,
    freq: number,
  ): void {
    const s = cam.scale
    const seed = hashString(this.course.day) % 1000
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, cam.h)
    for (let px = 0; px <= cam.w + 20; px += 20) {
      const wx = cam.x * par + px / s
      const h =
        base +
        amp *
          (Math.sin(wx * freq + seed) * 0.6 +
            Math.sin(wx * freq * 2.7 + seed * 2) * 0.4)
      ctx.lineTo(px, cam.h - (h - cam.y * par) * s)
    }
    ctx.lineTo(cam.w, cam.h)
    ctx.fill()
  }
}

export function drawPlane(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  p: PlaneSprite,
): void {
  const s = cam.scale
  const sx = (x: number): number => (x - cam.x) * s
  const sy = (y: number): number => cam.h - (y - cam.y) * s
  ctx.globalAlpha = p.alpha
  if (p.trail && p.trail.length >= 4) {
    ctx.strokeStyle = p.color
    ctx.lineWidth = Math.max(1.5, 3 * s)
    ctx.lineCap = 'round'
    ctx.setLineDash([])
    ctx.beginPath()
    for (let i = 0; i < p.trail.length; i += 2)
      ctx.lineTo(sx(p.trail[i] ?? 0), sy(p.trail[i + 1] ?? 0))
    ctx.globalAlpha = p.alpha * 0.45
    ctx.stroke()
    ctx.globalAlpha = p.alpha
  }
  const x = sx(p.x)
  const y = sy(p.y)
  const a = Math.atan2(-p.hy, p.hx)
  const k = Math.max(0.7, s) * 1.15
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = 'rgba(36, 28, 48, 0.22)'
  ctx.save()
  ctx.translate(1.5 * k, 2.6 * k)
  tracePlane(ctx, k)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = p.color
  tracePlane(ctx, k)
  ctx.fill()
  ctx.fillStyle = shade(p.color, 0.74)
  ctx.beginPath()
  ctx.moveTo(20 * k, 0.3 * k)
  ctx.lineTo(-8 * k, 2 * k)
  ctx.lineTo(-15 * k, 11 * k)
  ctx.lineTo(-3 * k, 3 * k)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(42, 32, 54, 0.4)'
  ctx.lineWidth = Math.max(1, 1.3 * k)
  ctx.beginPath()
  ctx.moveTo(14 * k, 0)
  ctx.lineTo(-13 * k, 0)
  ctx.stroke()
  tracePlane(ctx, k)
  ctx.strokeStyle = 'rgba(36, 28, 48, 0.7)'
  ctx.lineWidth = Math.max(1.25, 1.7 * k)
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Folded paper plane, nose to the right, before the caller rotates it. */
function tracePlane(ctx: CanvasRenderingContext2D, k: number): void {
  ctx.beginPath()
  ctx.moveTo(22 * k, 0)
  ctx.lineTo(-3 * k, -3 * k)
  ctx.lineTo(-16 * k, -13 * k)
  ctx.lineTo(-9 * k, -2.2 * k)
  ctx.lineTo(-19 * k, 0)
  ctx.lineTo(-9 * k, 2.2 * k)
  ctx.lineTo(-16 * k, 12 * k)
  ctx.lineTo(-3 * k, 3 * k)
  ctx.closePath()
}

function shade(hex: string, mul: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const n = Number.parseInt(hex.slice(1), 16)
  const ch = (shift: number): number =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * mul)))
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Ghost name tags on dark pills, skipping any that would overlap one already drawn. */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  planes: readonly PlaneSprite[],
): void {
  const s = cam.scale
  const k = Math.max(0.6, s)
  const u = cam.dpr
  const size = Math.max(12 * u, 13 * k)
  const padX = 7 * u
  const h = size + 8 * u
  const taken: Box[] = []
  ctx.font = `700 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of planes) {
    if (!p.label) continue
    const x = (p.x - cam.x) * s
    const y = cam.h - (p.y - cam.y) * s
    if (x < -40 || x > cam.w + 40) continue
    const w = ctx.measureText(p.label).width + padX * 2 + 10 * u
    const spots = [y - 22 * k - h / 2, y + 20 * k + h / 2]
    const spot = spots
      .map(cy => ({
        x0: x - w / 2,
        y0: cy - h / 2,
        x1: x + w / 2,
        y1: cy + h / 2,
      }))
      .find(b => !taken.some(t => overlaps(t, b)))
    if (!spot) continue
    taken.push(spot)
    const cy = (spot.y0 + spot.y1) / 2
    ctx.globalAlpha = 0.85
    ctx.fillStyle = 'rgba(15,22,44,0.72)'
    ctx.beginPath()
    ctx.roundRect(spot.x0, spot.y0, w, h, h / 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(spot.x0 + padX + 3 * u, cy, 3.5 * u, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(p.label, x + 5 * u, cy + 0.5 * u)
  }
  ctx.textBaseline = 'alphabetic'
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Picks a scale that shows enough course ahead on phones and desktops. */
export function fitScale(w: number, h: number): number {
  return Math.min(h / 720, Math.max(w / 700, h / 1300))
}
