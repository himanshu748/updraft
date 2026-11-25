import type {Camera} from './render.ts'

/** A scrap of paper, in world units. Visual only: it never touches the sim. */
export interface Scrap {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  rot: number
  spin: number
  size: number
  color: string
}

/** Toss `n` scraps out from a point. Old scraps are dropped so a long flight stays light. */
export function spawnBurst(
  scraps: Scrap[],
  x: number,
  y: number,
  color: string,
  n: number,
  speed: number,
): void {
  while (scraps.length > 80) scraps.shift()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const kick = 0.4 + (i % 3) * 0.28
    scraps.push({
      x,
      y,
      vx: Math.cos(a) * speed * kick,
      vy: Math.sin(a) * speed * kick,
      life: 0.4 + (i % 4) * 0.08,
      rot: a,
      spin: (i % 2 ? 1 : -1) * 7,
      size: 2.2 + (i % 3),
      color,
    })
  }
}

export function stepScraps(scraps: Scrap[], dt: number): void {
  for (let i = scraps.length - 1; i >= 0; i--) {
    const p = scraps[i]
    if (!p) continue
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy -= 80 * dt
    p.life -= dt
    p.rot += p.spin * dt
    if (p.life <= 0) scraps.splice(i, 1)
  }
}

export function drawScraps(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  scraps: readonly Scrap[],
): void {
  const s = cam.scale
  for (const p of scraps) {
    const x = (p.x - cam.x) * s
    const y = cam.h - (p.y - cam.y) * s
    if (x < -20 || x > cam.w + 20 || y < -20 || y > cam.h + 20) continue
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(p.rot)
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2))
    ctx.fillStyle = p.color
    ctx.fillRect(
      -p.size * s,
      -p.size * 0.35 * s,
      p.size * 2 * s,
      p.size * 0.7 * s,
    )
    ctx.restore()
  }
  ctx.globalAlpha = 1
}
