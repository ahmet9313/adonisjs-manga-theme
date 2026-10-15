/** Small seeded generator so demo data is reproducible (same seed, same community). */
export function createRng(seed: number) {
  let state = seed >>> 0

  /** Uniform in [0, 1). mulberry32. */
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min
  const chance = (probability: number) => next() < probability
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]

  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0)
    let roll = next() * total
    for (const [item, weight] of items) {
      roll -= weight
      if (roll < 0) return item
    }
    return items[items.length - 1][0]
  }

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let index = copy.length - 1; index > 0; index--) {
      const other = Math.floor(next() * (index + 1))
      ;[copy[index], copy[other]] = [copy[other], copy[index]]
    }
    return copy
  }

  const sample = <T>(items: readonly T[], count: number): T[] =>
    shuffle(items).slice(0, Math.max(0, Math.min(count, items.length)))

  /** Normal distribution (Box–Muller). */
  const gauss = (mean = 0, deviation = 1) => {
    const u = Math.max(next(), Number.EPSILON)
    const v = next()
    return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /** Heavy-tailed positive integer: most values small, a few large (likes, replies). */
  const longTail = (scale: number, cap: number) =>
    Math.min(cap, Math.floor(-Math.log(Math.max(next(), 1e-9)) * scale))

  return { next, int, chance, pick, weighted, shuffle, sample, gauss, longTail }
}

export type Rng = ReturnType<typeof createRng>

/** Stable 32-bit hash of a string, for per-item seeds. */
export function hashSeed(text: string) {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
