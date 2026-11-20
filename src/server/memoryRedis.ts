import type {redis as devvitRedis} from '@devvit/web/server'

type Redis = typeof devvitRedis

/** In-memory stand-in for the parts of Devvit Redis Updraft uses (tests and local preview). */
export function installMemoryRedis(redis: Redis): () => void {
  const strings = new Map<string, string>()
  const hashes = new Map<string, Map<string, string>>()
  const zsets = new Map<string, Map<string, number>>()
  const hash = (k: string): Map<string, string> => {
    const m = hashes.get(k) ?? new Map<string, string>()
    hashes.set(k, m)
    return m
  }
  const zset = (k: string): Map<string, number> => {
    const m = zsets.get(k) ?? new Map<string, number>()
    zsets.set(k, m)
    return m
  }
  const sorted = (k: string): {member: string; score: number}[] =>
    [...zset(k)]
      .map(([member, score]) => ({member, score}))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1))
  const num = (v: number | string): number =>
    v === '+inf' ? Infinity : v === '-inf' ? -Infinity : Number(v)

  const original = {...redis}
  const fake: Partial<Redis> = {
    get: async k => strings.get(k),
    set: async (k, v) => {
      strings.set(k, v)
      return 'OK'
    },
    incrBy: async (k, n) => {
      const v = Number(strings.get(k) ?? 0) + n
      strings.set(k, `${v}`)
      return v
    },
    hGet: async (k, f) => hash(k).get(f),
    hMGet: async (k, fs) => fs.map(f => hash(k).get(f) ?? null),
    hGetAll: async k => Object.fromEntries(hash(k)),
    hSet: async (k, obj) => {
      for (const [f, v] of Object.entries(obj)) hash(k).set(f, v)
      return Object.keys(obj).length
    },
    zAdd: async (k, ...ms) => {
      for (const m of ms) zset(k).set(m.member, m.score)
      return ms.length
    },
    zScore: async (k, m) => zset(k).get(m),
    zRank: async (k, m) => {
      const i = sorted(k).findIndex(e => e.member === m)
      return i < 0 ? undefined : i
    },
    zCard: async k => zset(k).size,
    zRange: async (k, start, stop, opts) => {
      const all = sorted(k)
      if (opts?.by === 'score')
        return all.filter(e => e.score >= num(start) && e.score <= num(stop))
      const s = Number(start)
      const e = Number(stop)
      return all.slice(s, e < 0 ? all.length + e + 1 : e + 1)
    },
  }
  Object.assign(redis, fake)
  return () => Object.assign(redis, original)
}
