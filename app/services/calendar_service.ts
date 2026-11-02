import db from '@adonisjs/lucid/services/db'
import calendar from '#config/calendar'
import { localDay } from '#services/level'
import { coverView } from '#services/cover_policy_service'
import { addDays, schedule, startOfDay, stampOf, weekdayOf } from '#services/publishing_service'

/**
 * Data of the release calendar (/takvim). Draft series never appear; planned chapters of
 * published series are listed by number and time only (they are still drafts, so no link), and
 * released chapters come from published chapters of published series.
 */

interface SeriesRef {
  title: string
  slug: string
  type: string
  coverImage: string
  /** Hidden cover rule for this visitor (cover_policy_service): blur, placeholder or null. */
  coverVeil: 'blur' | 'placeholder' | null
  access: string
}

/** A series with the chapters of one day (planned: number and time; released: number, title). */
export interface SeriesDay extends SeriesRef {
  chapters: { number: number; time?: string; title?: string | null; access?: string }[]
}

export interface CalendarDay {
  day: string
  weekday: string
  planned: SeriesDay[]
  regular: SeriesRef[]
}

/** A date column as "YYYY-MM-DD" (drivers may return a Date object). */
const dayText = (value: unknown) =>
  value instanceof Date ? localDay(value) : String(value ?? '').slice(0, 10)

/** Series fields of a row; the cover follows the hidden-cover rules for the current visitor. */
function ref(row: Record<string, any>): SeriesRef {
  const view = coverView({
    coverImage: row.cover_image,
    ageRating: row.age_rating,
    coverMode: row.cover_mode,
  })
  return {
    title: row.title,
    slug: row.slug,
    type: row.type,
    coverImage: view.coverImage,
    coverVeil: view.coverVeil,
    access: row.access || 'public',
  }
}

/** Adds a chapter under its series on a day (rows arrive sorted, so the order is kept). */
function groupInto(
  days: Map<string, SeriesDay[]>,
  day: string,
  series: SeriesRef,
  chapter: SeriesDay['chapters'][number]
) {
  const list = days.get(day) ?? []
  let entry = list.find((item) => item.type === series.type && item.slug === series.slug)
  if (!entry) list.push((entry = { ...series, chapters: [] }))
  entry.chapters.push(chapter)
  days.set(day, list)
}

class CalendarService {
  /**
   * Days from today: the week view lists every day with its planned chapters and the series that
   * usually release on that weekday; the month view lists only days with planned chapters.
   */
  async upcoming(view: 'week' | 'month', at = new Date()) {
    const today = localDay(at)
    const length = view === 'month' ? calendar.monthDays : calendar.weekDays
    const days = Array.from({ length }, (_, index) => addDays(today, index))
    const from = stampOf(new Date(startOfDay(today)))
    const until = stampOf(new Date(startOfDay(addDays(today, length))))

    const plannedRows = await db
      .from('chapters')
      .join('series', 'series.id', 'chapters.series_id')
      .join('content_types', 'content_types.id', 'series.content_type_id')
      .where('chapters.draft', true)
      .where('series.draft', false)
      .whereNotNull('chapters.publish_at')
      .where('chapters.publish_at', '>=', from)
      .where('chapters.publish_at', '<', until)
      .orderBy('chapters.publish_at', 'asc')
      .orderBy('chapters.number', 'asc')
      .limit(calendar.maxUpcoming)
      .select(
        'chapters.number',
        'chapters.publish_at',
        'series.title',
        'series.slug',
        'series.cover_image',
        'series.age_rating',
        'series.cover_mode',
        'series.access',
        'content_types.slug as type'
      )

    const regularRows =
      view === 'week'
        ? await db
            .from('series')
            .join('content_types', 'content_types.id', 'series.content_type_id')
            .where('series.draft', false)
            .whereNotNull('series.release_days')
            .whereNot('series.release_days', '')
            .orderBy('series.title', 'asc')
            .select(
              'series.title',
              'series.slug',
              'series.cover_image',
              'series.age_rating',
              'series.cover_mode',
              'series.access',
              'series.release_days',
              'content_types.slug as type'
            )
        : []

    const planned = new Map<string, SeriesDay[]>()
    for (const row of plannedRows) {
      const stamp = String(row.publish_at)
      const day = schedule.input(stamp).slice(0, 10)
      const chapter = { number: Number(row.number), time: schedule.time(stamp) }
      groupInto(planned, day, ref(row), chapter)
    }

    const result: CalendarDay[] = days.map((day) => {
      const weekday = weekdayOf(day)
      return {
        day,
        weekday,
        planned: planned.get(day) ?? [],
        regular: regularRows
          .filter((row) => schedule.keys(row.release_days).includes(weekday))
          .map(ref),
      }
    })
    return view === 'month' ? result.filter((item) => item.planned.length) : result
  }

  /** Chapters published in the last days (today included), newest day first. */
  async recent(at = new Date()) {
    const today = localDay(at)
    const first = addDays(today, -(calendar.recentDays - 1))
    const rows = await db
      .from('chapters')
      .join('series', 'series.id', 'chapters.series_id')
      .join('content_types', 'content_types.id', 'series.content_type_id')
      .where('chapters.draft', false)
      .where('series.draft', false)
      .where('chapters.published_at', '>=', first)
      .where('chapters.published_at', '<=', today)
      .orderBy('chapters.published_at', 'desc')
      .orderBy('series.title', 'asc')
      .orderBy('chapters.number', 'desc')
      .limit(calendar.maxRecent)
      .select(
        'chapters.number',
        'chapters.title as chapter_title',
        'chapters.access as chapter_access',
        'chapters.published_at',
        'series.title',
        'series.slug',
        'series.cover_image',
        'series.age_rating',
        'series.cover_mode',
        'series.access',
        'content_types.slug as type'
      )
    const groups = new Map<string, SeriesDay[]>()
    for (const row of rows)
      groupInto(groups, dayText(row.published_at), ref(row), {
        number: Number(row.number),
        title: row.chapter_title || null,
        access: row.chapter_access || 'public',
      })
    return [...groups].map(([day, series]) => ({ day, weekday: weekdayOf(day), series }))
  }
}

export default new CalendarService()
