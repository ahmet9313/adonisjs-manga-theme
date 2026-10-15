/** Small in-memory attempt limiter for credential endpoints (per process, resets on restart). */
const attempts = new Map<string, { count: number; resetAt: number }>()

export function tooManyAttempts(key: string, max: number): boolean {
  const entry = attempts.get(key)
  if (!entry || entry.resetAt <= Date.now()) return false
  return entry.count >= max
}

export function recordAttempt(key: string, windowMs: number) {
  const current = Date.now()
  if (attempts.size > 5000) {
    for (const [name, entry] of attempts) if (entry.resetAt <= current) attempts.delete(name)
  }
  const entry = attempts.get(key)
  if (!entry || entry.resetAt <= current)
    attempts.set(key, { count: 1, resetAt: current + windowMs })
  else entry.count++
}

export function clearAttempts(key?: string) {
  if (key) attempts.delete(key)
  else attempts.clear()
}
