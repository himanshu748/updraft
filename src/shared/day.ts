export type DayKey = string

/** UTC calendar day as YYYY-MM-DD. */
export function dayKey(date: Date = new Date()): DayKey {
  return date.toISOString().slice(0, 10)
}

export function isDayKey(s: unknown): s is DayKey {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export function addDays(day: DayKey, n: number): DayKey {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return dayKey(d)
}

export function weekday(day: DayKey): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay()
}

export function prettyDay(day: DayKey): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatTime(frames: number): string {
  return `${(frames / 60).toFixed(2)}s`
}
