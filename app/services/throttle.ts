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

/** Takes back one attempt (a login that turned out to be right); never below zero. */
export function refundAttempt(key: string) {
  const entry = attempts.get(key)
  if (entry && entry.count > 0) entry.count--
}

/**
 * Checks and counts in one step, so parallel requests cannot all pass the check before any of
 * them is recorded. True when the request may go on.
 */
export function takeAttempt(key: string, max: number, windowMs: number): boolean {
  if (tooManyAttempts(key, max)) return false
  recordAttempt(key, windowMs)
  return true
}

export function clearAttempts(key?: string) {
  if (key) attempts.delete(key)
  else attempts.clear()
}
