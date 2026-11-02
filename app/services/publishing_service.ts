import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import site from '#config/site'
import calendar, { weekdayKeys } from '#config/calendar'
import notifications from '#services/notification_service'
import { invalidField } from '#services/upload_service'
import { localDay, parseTimestamp } from '#services/level'
import SeriesModel from '#models/series'
import Chapter from '#models/chapter'

/**
 * Publishing drafts. The admin forms (manual) and the scheduler (`publishDue`, start/scheduler.ts)
 * share the same steps: the chapter gets the publication day (site time zone), its series moves up
 * in "Son Güncellenenler" (`bumpSeries`) and readers who saved the series hear about it
 * (`announceChapter`; never for a draft series). Scheduled times (`publish_at`) are entered in the
 * site time zone and stored as UTC timestamps like every other column.
 */

/** UTC "YYYY-MM-DD HH:mm:ss", the format of every timestamp column (input_service.now). */
export const stampOf = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')

const zoneParts = new Intl.DateTimeFormat('en-US', {
  timeZone: site.timezone,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Wall clock of `time` in the site time zone. */
function wallClock(time: number) {
  const parts = Object.fromEntries(
    zoneParts.formatToParts(new Date(time)).map((part) => [part.type, part.value])
  )
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    utc: Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second)
    ),
  }
}

/** Site time zone offset (ms) at `time`. */
const offsetAt = (time: number) => wallClock(time).utc - Math.floor(time / 1000) * 1000

/**
 * "2026-10-25T14:00" (a datetime-local value, site time zone) → epoch ms, or null when the text
 * is not a real date and time.
 */
export function fromLocalInput(value: unknown): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(
    String(value ?? '').trim()
  )
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const check = new Date(wall)
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23) return null
  // Second pass corrects the guess around daylight saving changes.
  const first = wall - offsetAt(wall)
  return wall - offsetAt(first)
}

/** Midnight of a site-time-zone day ("YYYY-MM-DD") as epoch ms. */
export const startOfDay = (day: string) => fromLocalInput(`${day}T00:00`) ?? Date.parse(day)

/** Weekday key (config/calendar.ts) of a "YYYY-MM-DD" day. */
export const weekdayOf = (day: string) =>
  ['paz', 'pzt', 'sal', 'car', 'per', 'cum', 'cmt'][new Date(`${day}T12:00:00Z`).getUTCDay()]

/** The day `count` days after "YYYY-MM-DD". */
export function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

/** Stored weekday keys (any order, unknown keys dropped) → "cum,cmt,paz", or null. */
export function releaseDaysOf(value: unknown): string | null {
  const given = (Array.isArray(value) ? value : String(value ?? '').split(',')).map((item) =>
    String(item).trim()
  )
  const keys = weekdayKeys.filter((key) => given.includes(key))
  return keys.length ? keys.join(',') : null
}

/** Formatting helpers for templates (`schedule` Edge global). */
export const schedule = {
  /** "25 Eki 14:00" for a stored timestamp. */
  label(value: string | null | undefined) {
    const time = parseTimestamp(value)
    if (!Number.isFinite(time)) return ''
    const date = new Date(time).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      timeZone: site.timezone,
    })
    return `${date} ${wallClock(time).time}`
  },
  /** "14:00" in the site time zone. */
  time(value: string | null | undefined) {
    const time = parseTimestamp(value)
    return Number.isFinite(time) ? wallClock(time).time : ''
  },
  /** Value of a datetime-local input ("2026-10-25T14:00") for a stored timestamp. */
  input(value: string | null | undefined) {
    const time = parseTimestamp(value)
    if (!Number.isFinite(time)) return ''
    const wall = wallClock(time)
    return `${wall.day}T${wall.time}`
  },
  /** Current time as a datetime-local value (the `min` of the planned-time input). */
  inputNow() {
    const wall = wallClock(Date.now())
    return `${wall.day}T${wall.time}`
  },
  /** Stored keys ("cum,cmt") → ["cum", "cmt"]. */
  keys(value: string | null | undefined) {
    return (releaseDaysOf(value) || '').split(',').filter(Boolean)
  },
  /** "Cuma, Cumartesi" (plus the free-text note), or ''. */
  days(value: string | null | undefined, note?: string | null) {
    const names = this.keys(value).map((key) => calendar.weekdays[key])
    return [names.join(', '), note?.trim() || ''].filter(Boolean).join(' · ')
  },
  weekdays: calendar.weekdays,
  shortWeekdays: calendar.shortWeekdays,
}

/** Rows touched by a query builder `update` (a number, or [number] on some drivers). */
const affected = (result: unknown) => Number(Array.isArray(result) ? result[0] : result) || 0

class PublishingService {
  /** Publication day of a chapter published at `at` (site time zone). */
  dayOf(at: Date) {
    return localDay(at)
  }

  /**
   * Planned time posted by a form (`publish_at`, datetime-local in the site time zone) as a stored
   * timestamp. Only drafts are planned: published content and an empty field give null (a plain
   * draft). The time must lie ahead; an unchanged stored value is kept even if it just passed,
   * since the scheduler publishes it within a minute.
   */
  scheduleFrom(
    draft: boolean,
    value: unknown,
    previous: string | null | undefined,
    at = new Date()
  ) {
    const text = String(value ?? '').trim()
    if (!draft || !text) return null
    const time = fromLocalInput(text)
    if (time === null) invalidField('publish_at', 'Geçerli bir tarih ve saat seçin.')
    const stamp = stampOf(new Date(time))
    if (previous && stamp === String(previous).slice(0, 19)) return stamp
    if (time <= at.getTime()) invalidField('publish_at', 'Planlı yayın zamanı ileride olmalı.')
    if (time > at.getTime() + 366 * 86_400_000)
      invalidField('publish_at', 'Planlı yayın zamanı en fazla bir yıl sonrası olabilir.')
    return stamp
  }

  /** Moves the series up in "Son Güncellenenler" (published chapters only, never drafts). */
  async bumpSeries(
    ids: (number | null | undefined)[],
    timestamp: string,
    trx?: TransactionClientContract
  ) {
    const unique = [...new Set(ids.filter((id): id is number => Boolean(id)))]
    if (!unique.length) return
    await (trx ?? db).from('series').whereIn('id', unique).update({ updated_at: timestamp })
  }

  /** Tells every reader who saved the series that a new chapter is out (silent for draft series). */
  async announceChapter(chapterId: number) {
    const chapter = await Chapter.find(chapterId)
    if (!chapter || chapter.draft) return
    const series = await SeriesModel.query()
      .where('id', chapter.seriesId)
      .preload('contentType')
      .first()
    if (!series || series.draft) return
    const readers = await db.from('bookmarks').where('series_id', series.id).select('user_id')
    await notifications.notifyMany(
      readers.map((row) => Number(row.user_id)),
      'chapter',
      {
        title: `Yeni bölüm: ${series.title}`,
        body: `Bölüm ${chapter.number}${chapter.title ? ` — ${chapter.title}` : ''} yayında.`,
        link: `/series/${series.contentType.slug}/${series.slug}/${chapter.number}`,
      }
    )
  }

  /**
   * Publishes every draft whose scheduled time has come. Safe to run from several processes at
   * once: each row is flipped by a conditional update (`draft = true AND publish_at <= now`) and
   * only the process whose update changed it bumps the series and sends the announcement.
   * Errors are logged per row and never thrown, so one broken row cannot stop the others.
   */
  async publishDue(at = new Date()) {
    const stamp = stampOf(at)
    const result = { series: 0, chapters: 0 }
    // Series first: a chapter due in the same run of a series going live is then announced.
    const dueSeries = await db
      .from('series')
      .where('draft', true)
      .whereNotNull('publish_at')
      .where('publish_at', '<=', stamp)
      .select('id')
    for (const row of dueSeries) {
      try {
        const flipped = await db
          .from('series')
          .where('id', row.id)
          .where('draft', true)
          .where('publish_at', '<=', stamp)
          .update({ draft: false, publish_at: null, updated_at: stamp })
        if (affected(flipped)) result.series++
      } catch (error) {
        logger.error({ err: error, seriesId: row.id }, 'Planlı seri yayınlanamadı')
      }
    }
    const dueChapters = await db
      .from('chapters')
      .where('draft', true)
      .whereNotNull('publish_at')
      .where('publish_at', '<=', stamp)
      .orderBy('publish_at', 'asc')
      .orderBy('number', 'asc')
      .select('id', 'series_id', 'publish_at')
    for (const row of dueChapters) {
      try {
        // The chapter carries the day it was scheduled for, not the day the scheduler noticed it.
        const scheduled = parseTimestamp(row.publish_at)
        const day = this.dayOf(Number.isFinite(scheduled) ? new Date(scheduled) : at)
        const flipped = await db.transaction(async (trx) => {
          const changed = await trx
            .from('chapters')
            .where('id', row.id)
            .where('draft', true)
            .where('publish_at', '<=', stamp)
            .update({ draft: false, publish_at: null, published_at: day, updated_at: stamp })
          if (!affected(changed)) return false
          await this.bumpSeries([Number(row.series_id)], stamp, trx)
          return true
        })
        if (!flipped) continue
        result.chapters++
        await this.announceChapter(Number(row.id))
      } catch (error) {
        logger.error({ err: error, chapterId: row.id }, 'Planlı bölüm yayınlanamadı')
      }
    }
    if (result.series || result.chapters)
      logger.info(`Planlı yayın: ${result.series} seri, ${result.chapters} bölüm yayınlandı`)
    return result
  }

  /** The next scheduled series and chapters (admin dashboard), soonest first. */
  async upcoming(limit = 5) {
    const [series, chapters] = await Promise.all([
      SeriesModel.query()
        .where('draft', true)
        .whereNotNull('publishAt')
        .orderBy('publishAt', 'asc')
        .limit(limit),
      Chapter.query()
        .where('draft', true)
        .whereNotNull('publishAt')
        .preload('series')
        .orderBy('publishAt', 'asc')
        .limit(limit),
    ])
    return [
      ...series.map((item) => ({
        kind: 'series' as const,
        at: item.publishAt!,
        title: item.title,
        detail: 'Seri',
        href: `/admin/seriler/${item.id}/duzenle`,
      })),
      ...chapters.map((item) => ({
        kind: 'chapter' as const,
        at: item.publishAt!,
        title: item.series?.title || '',
        detail: `Bölüm ${item.number}`,
        href: `/admin/bolumler/${item.id}/duzenle`,
      })),
    ]
      .sort((a, b) => parseTimestamp(a.at) - parseTimestamp(b.at))
      .slice(0, limit)
  }
}

export default new PublishingService()
