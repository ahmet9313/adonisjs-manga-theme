import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import SeriesModel from '#models/series'
import { serializeSeries } from '#services/series_presenter'
import { localDay } from '#services/level'

/**
 * Plain cookie with the chapters this browser was counted for today: "20261022.12.45.88"
 * (site day, then chapter ids). Nothing personal is stored, neither in the cookie nor in the
 * database; clearing the cookie only lets the same visitor count once more.
 */
export const VIEW_COOKIE = 'seen'
const VIEW_COOKIE_MAX_AGE = 24 * 60 * 60
/** Newest ids kept in the cookie (about 2 KB at most). */
const REMEMBERED = 250

/** Crawlers, link previews, headless browsers and command-line clients are not readers. */
const botAgents =
  /bot|crawl|spider|slurp|preview|scrape|facebookexternalhit|embedly|headless|lighthouse|curl|wget|python|go-http|okhttp|java\//i

export type ViewPeriod = 'day' | 'week' | 'month' | 'all'
/** Days covered by each period, today included ("Günlük" is today in the site time zone). */
const periodDays: Record<Exclude<ViewPeriod, 'all'>, number> = { day: 1, week: 7, month: 30 }
export const viewPeriods: ViewPeriod[] = ['day', 'week', 'month', 'all']

/** Popular lists are shared by every visitor for a minute (only ids and totals, see `ranked`). */
const CACHE_MS = 60_000

/** First day ("YYYY-MM-DD", site time zone) of a period that ends today. */
export function firstDayOf(days: number, now = Date.now()) {
  return localDay(new Date(now - (days - 1) * 86_400_000))
}

/**
 * Short Turkish count: 950 → "950", 12 480 → "12,4 B", 2 730 000 → "2,7 Mn", 1,2e9 → "1,2 Mr".
 * Rounded down, so a count never looks bigger than it is (999 999 → "999 B", not "1.000 B").
 */
export function countOf(value: unknown) {
  const count = Math.max(0, Math.floor(Number(value) || 0))
  if (count < 1000) return String(count)
  const [size, unit] = count >= 1e9 ? [1e9, 'Mr'] : count >= 1e6 ? [1e6, 'Mn'] : [1e3, 'B']
  const short = count / size
  const shown = short < 100 ? Math.floor(short * 10) / 10 : Math.floor(short)
  return `${shown.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${unit}`
}

export function isBot(userAgent: string | null | undefined) {
  return !userAgent || botAgents.test(userAgent)
}

/** Chapter ids counted today from the cookie value (another day's list counts as empty). */
function seenToday(raw: unknown, today: string) {
  const [day, ...ids] = typeof raw === 'string' ? raw.split('.') : []
  if (day !== today.replaceAll('-', '')) return []
  return ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
}

interface Ranked {
  series: SeriesModel
  views: number
}

type SeriesQuery = ModelQueryBuilderContract<typeof SeriesModel>

class ViewService {
  private pending = new Set<Promise<void>>()
  private cache = new Map<string, { at: number; rows: Ranked[] }>()

  /**
   * Counts one view of a chapter (or episode) the visitor opened past every gate: at most once per
   * browser, chapter and day; never for staff previews of drafts, bots or prefetches. The write
   * waits until the response is sent and never fails the page (errors are only logged).
   */
  track(
    { request, response }: Pick<HttpContext, 'request' | 'response'>,
    target: { seriesId: number; chapterId: number; preview: boolean }
  ) {
    if (target.preview || isBot(request.header('user-agent'))) return false
    const purpose = `${request.header('sec-purpose') || ''} ${request.header('purpose') || ''}`
    if (/prefetch|prerender/i.test(purpose)) return false

    const today = localDay()
    let raw: unknown = null
    try {
      raw = request.plainCookie(VIEW_COOKIE, { encoded: false })
    } catch {
      raw = null
    }
    const seen = seenToday(raw, today)
    if (seen.includes(target.chapterId)) return false

    const ids = [...seen, target.chapterId].slice(-REMEMBERED)
    response.plainCookie(VIEW_COOKIE, [today.replaceAll('-', ''), ...ids].join('.'), {
      encode: false,
      maxAge: VIEW_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })

    const outgoing = response.response
    const sent = new Promise<void>((resolve) => {
      if (outgoing.writableFinished) return resolve()
      outgoing.once('finish', () => resolve())
      outgoing.once('close', () => resolve())
    })
    const job: Promise<void> = sent
      .then(() => this.record(target.seriesId, target.chapterId, today))
      .catch((error) => logger.warn({ err: error }, 'Görüntülenme kaydedilemedi'))
      .finally(() => this.pending.delete(job))
    this.pending.add(job)
    return true
  }

  /** Waits for the view writes already scheduled (tests). */
  async settle() {
    while (this.pending.size) await Promise.all([...this.pending])
  }

  /** Adds one view to the chapter, the series and the series' row of the day. */
  async record(seriesId: number, chapterId: number, day = localDay()) {
    await db.transaction(async (trx) => {
      // Plain counters: updated_at is left alone ("Son güncellenenler" must not move).
      await trx.from('chapters').where('id', chapterId).increment('view_count', 1)
      await trx.from('series').where('id', seriesId).increment('view_count', 1)
      // Portable upsert: ON CONFLICT … DO UPDATE (SQLite) / ON DUPLICATE KEY UPDATE (MySQL).
      await trx
        .knexQuery()
        .table('series_daily_views')
        .insert({ series_id: seriesId, day, views: 1 })
        .onConflict(['series_id', 'day'])
        .merge({ views: trx.knexRawQuery('views + 1') })
    })
  }

  /** Forgets the cached popular lists (tests, or after bulk changes). */
  clearCache() {
    this.cache.clear()
  }

  /**
   * Most viewed published series of a period: models and view totals, cached for a minute. The
   * cache never holds serialized cards: cover veils depend on the visitor (cover_policy_service).
   */
  private async ranked(period: ViewPeriod, limit: number): Promise<Ranked[]> {
    const key = `${period}:${limit}`
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows

    const published = () =>
      SeriesModel.query().where('series.draft', false).preload('contentType') as SeriesQuery
    let rows: Ranked[]
    if (period === 'all') {
      const models = await published()
        .where('series.view_count', '>', 0)
        .orderBy('series.view_count', 'desc')
        .orderBy('series.id', 'desc')
        .limit(limit)
      rows = models.map((series) => ({ series, views: series.viewCount }))
    } else {
      const totals = await db
        .from('series_daily_views as v')
        .join('series as s', 's.id', 'v.series_id')
        .where('s.draft', false)
        .where('v.day', '>=', firstDayOf(periodDays[period]))
        .groupBy('v.series_id')
        .select('v.series_id')
        .sum('v.views as total')
        .orderBy('total', 'desc')
        .orderBy('v.series_id', 'desc')
        .limit(limit)
      const ids = totals.map((row) => Number(row.series_id))
      const models = ids.length ? await published().whereIn('series.id', ids) : []
      const byId = new Map(models.map((series) => [series.id, series]))
      rows = totals.flatMap((row) => {
        const series = byId.get(Number(row.series_id))
        return series ? [{ series, views: Number(row.total) || 0 }] : []
      })
    }
    this.cache.set(key, { at: Date.now(), rows })
    return rows
  }

  /** Cards for one period: presenter output plus `views` (the period's total). */
  async popular(period: ViewPeriod, limit = 10) {
    const rows = await this.ranked(period, limit)
    return rows.map(({ series, views }) => ({ ...serializeSeries(series), views }))
  }

  /** The four "Popüler" tabs of the home page. */
  async tabs(limit = 10) {
    const [day, week, month, all] = await Promise.all(
      viewPeriods.map((period) => this.popular(period, limit))
    )
    return { day, week, month, all }
  }

  /** Catalog order "Trend": views of the last seven days, then all-time views. */
  orderByTrend(query: SeriesQuery) {
    return query
      .orderByRaw(
        '(select coalesce(sum(v.views), 0) from series_daily_views v where v.series_id = series.id and v.day >= ?) desc',
        [firstDayOf(7)]
      )
      .orderBy('series.view_count', 'desc')
  }

  /** How many accounts saved a series ("N kişi kaydetti"). */
  async saversOf(seriesId: number) {
    const row = await db.from('bookmarks').where('series_id', seriesId).count('* as total').first()
    return Number(row?.total || 0)
  }

  /** Admin dashboard: views today, in the last seven days and in total, and this week's top 5. */
  async dashboard() {
    const total = (row: any) => Number(row?.total || 0)
    const [today, week, all, top] = await Promise.all([
      db.from('series_daily_views').where('day', localDay()).sum('views as total').first(),
      db.from('series_daily_views').where('day', '>=', firstDayOf(7)).sum('views as total').first(),
      db.from('series').sum('view_count as total').first(),
      this.ranked('week', 5),
    ])
    return { today: total(today), week: total(week), all: total(all), top }
  }
}

export default new ViewService()
