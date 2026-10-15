import { expToNext, maxLevel } from '#config/rewards'
import site from '#config/site'

/** Pure progression helpers shared by models, services and views. */
export function levelFor(exp: number) {
  let level = 1
  let floor = 0
  while (level < maxLevel && exp >= floor + expToNext(level)) {
    floor += expToNext(level)
    level++
  }
  const needed = level < maxLevel ? expToNext(level) : 0
  const current = exp - floor
  return {
    level,
    exp,
    current,
    needed,
    progress: needed ? Math.min(100, Math.floor((current / needed) * 100)) : 100,
  }
}

/** Total EXP at which `level` starts. */
export function expForLevel(level: number) {
  let total = 0
  for (let index = 1; index < Math.min(level, maxLevel); index++) total += expToNext(index)
  return total
}

/** Database timestamps are UTC "YYYY-MM-DD HH:mm:ss" strings. */
export function parseTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN
  return Date.parse(`${String(value).replace(' ', 'T')}Z`)
}

export function isRecent(value: string | null | undefined, minutes: number) {
  const time = parseTimestamp(value)
  return Number.isFinite(time) && Date.now() - time < minutes * 60 * 1000
}

/** Calendar day (YYYY-MM-DD) in the site time zone. */
export function localDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: site.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function previousDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
