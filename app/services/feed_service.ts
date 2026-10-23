import db from '@adonisjs/lucid/services/db'
import type { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'
import site from '#config/site'
import seoConfig from '#config/seo'
import settings from '#services/settings_service'
import { localDay, parseTimestamp } from '#services/level'
import seo, { clip, escapeXml } from '#services/seo_service'

/**
 * Sitemap and RSS rows (seo_controller). Only what anyone may open without a gate is listed:
 *
 * - series pages of published series whose age rating has no gate (Admin → Tema → Yaş ve
 *   Erişim → "Uyarı yok"); members / VIP series are listed because their page is public;
 * - chapters of those series when neither the series nor the chapter is a draft, both are open
 *   to everyone and the chapter has no notice to confirm.
 *
 * Age-gated series, drafts and locked chapters never appear. Rows are cached in memory for
 * config/seo.ts → sitemapMinutes / feedMinutes; XML is built per request with its origin.
 */

export interface SitemapEntry {
  path: string
  lastmod: string | null
}

export interface FeedItem {
  seriesTitle: string
  path: string
  number: number
  title: string | null
  date: number
}

interface Cached {
  until: number
  value: Promise<unknown>
}

/** ISO 8601 for a database timestamp, null when it cannot be read. */
function isoOf(value: string | null | undefined) {
  const time = parseTimestamp(value)
  return Number.isFinite(time) ? new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z') : null
}

/**
 * Release time of a chapter: `published_at` is a calendar day; the creation or last update time
 * is used when it falls on that day (a draft published later is updated that day), otherwise
 * the start of the day.
 */
function releaseTime(row: Record<string, string>) {
  const day = String(row.published_at || '').slice(0, 10)
  for (const stamp of [row.created_at, row.updated_at]) {
    const time = parseTimestamp(stamp)
    if (Number.isFinite(time) && localDay(new Date(time)) === day) return time
  }
  const time = Date.parse(`${day}T00:00:00Z`)
  return Number.isFinite(time) ? time : parseTimestamp(row.created_at) || 0
}

const pathOf = (type: string, slug: string, number?: number) =>
  `/series/${type}/${slug}` + (number === undefined ? '' : `/${number}`)

class FeedService {
  private cache = new Map<string, Cached>()

  private remember<T>(key: string, minutes: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key)
    if (hit && hit.until > Date.now()) return hit.value as Promise<T>
    const value = load().catch((error) => {
      this.cache.delete(key)
      throw error
    })
    this.cache.set(key, { until: Date.now() + minutes * 60_000, value })
    return value
  }

  /** Drops cached rows (tests; settings that change what is open). */
  forget() {
    this.cache.clear()
  }

  /** Age ratings that ask something before the page opens. */
  private gatedRatings() {
    return site.ageRatings.filter((rating) => settings.agePolicy(rating) !== 'none')
  }

  /** Published series without an age gate. */
  private openSeries(query: DatabaseQueryBuilderContract) {
    const gated = this.gatedRatings()
    return query
      .where('series.draft', false)
      .where((rule) => rule.whereNull('series.age_rating').orWhereNotIn('series.age_rating', gated))
  }

  /** Chapters anyone may read straight away. */
  private openChapters(query: DatabaseQueryBuilderContract) {
    return this.openSeries(query)
      .where('series.access', 'public')
      .where('chapters.draft', false)
      .where('chapters.access', 'public')
      .where((rule) => rule.whereNull('chapters.warning').orWhere('chapters.warning', ''))
  }

  async sitemap(): Promise<SitemapEntry[]> {
    return this.remember('sitemap', seoConfig.sitemapMinutes, async () => {
      const series = await this.openSeries(
        db
          .from('series')
          .join('content_types', 'content_types.id', 'series.content_type_id')
          .select('series.slug', 'series.updated_at', 'content_types.slug as type')
      ).orderBy('series.id')
      const chapters = await this.openChapters(
        db
          .from('chapters')
          .join('series', 'series.id', 'chapters.series_id')
          .join('content_types', 'content_types.id', 'series.content_type_id')
          .select(
            'series.slug',
            'content_types.slug as type',
            'chapters.number',
            'chapters.updated_at'
          )
      )
        .orderBy('chapters.series_id')
        .orderBy('chapters.number')

      const newest = series
        .map((row) => isoOf(row.updated_at))
        .filter(Boolean)
        .sort()
        .at(-1) as string | undefined
      return [
        { path: '/', lastmod: newest ?? null },
        { path: '/seriler', lastmod: newest ?? null },
        ...series.map((row) => ({
          path: pathOf(row.type, row.slug),
          lastmod: isoOf(row.updated_at),
        })),
        ...chapters.map((row) => ({
          path: pathOf(row.type, row.slug, Number(row.number)),
          lastmod: isoOf(row.updated_at),
        })),
      ]
    })
  }

  /** Latest released chapters, of the whole site or of one series. */
  async latest(seriesId: number | null = null): Promise<FeedItem[]> {
    return this.remember(`feed:${seriesId ?? 'all'}`, seoConfig.feedMinutes, async () => {
      const rows = await this.openChapters(
        db
          .from('chapters')
          .join('series', 'series.id', 'chapters.series_id')
          .join('content_types', 'content_types.id', 'series.content_type_id')
          .select(
            'series.title as series_title',
            'series.slug',
            'content_types.slug as type',
            'chapters.number',
            'chapters.title',
            'chapters.published_at',
            'chapters.created_at',
            'chapters.updated_at'
          )
      )
        .if(seriesId !== null, (query) => query.where('chapters.series_id', seriesId!))
        .orderBy('chapters.published_at', 'desc')
        .orderBy('chapters.id', 'desc')
        .limit(seoConfig.feedSize)
      return rows.map((row) => ({
        seriesTitle: row.series_title,
        path: pathOf(row.type, row.slug, Number(row.number)),
        number: Number(row.number),
        title: row.title || null,
        date: releaseTime(row),
      }))
    })
  }

  /** `<urlset>` of some entries. */
  urlset(entries: SitemapEntry[], origin: string) {
    const urls = entries.map(
      (entry) =>
        `<url><loc>${escapeXml(seo.absolute(encodeURI(entry.path), origin))}</loc>` +
        (entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '') +
        '</url>'
    )
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') +
      '\n</urlset>\n'
    )
  }

  /** `<sitemapindex>` of /sitemaps/1.xml … /sitemaps/<pages>.xml. */
  sitemapIndex(pages: number, origin: string) {
    const items = Array.from(
      { length: pages },
      (_, index) =>
        `<sitemap><loc>${escapeXml(seo.absolute(`/sitemaps/${index + 1}.xml`, origin))}</loc></sitemap>`
    )
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      items.join('\n') +
      '\n</sitemapindex>\n'
    )
  }

  /** RSS 2.0 channel. `self` is the feed's own path. */
  rss(
    channel: { title: string; path: string; self: string; description: string },
    items: FeedItem[],
    origin: string
  ) {
    const url = (path: string) => escapeXml(seo.absolute(encodeURI(path), origin))
    const newest = items.reduce((latest, item) => Math.max(latest, item.date), 0)
    const entries = items.map((item) => {
      const link = url(item.path)
      const text = item.title
        ? `${item.seriesTitle}, Bölüm ${item.number}: ${item.title}`
        : `${item.seriesTitle} serisinin ${item.number}. bölümü yayında.`
      return (
        '<item>' +
        `<title>${escapeXml(`${item.seriesTitle} — Bölüm ${item.number}`)}</title>` +
        `<link>${link}</link>` +
        `<guid isPermaLink="true">${link}</guid>` +
        `<pubDate>${new Date(item.date).toUTCString()}</pubDate>` +
        `<description>${escapeXml(text)}</description>` +
        '</item>'
      )
    })
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n' +
      `<title>${escapeXml(channel.title)}</title>\n` +
      `<link>${url(channel.path)}</link>\n` +
      `<description>${escapeXml(clip(channel.description, 500))}</description>\n` +
      `<language>${escapeXml(site.language)}</language>\n` +
      `<lastBuildDate>${new Date(newest || Date.now()).toUTCString()}</lastBuildDate>\n` +
      `<atom:link href="${url(channel.self)}" rel="self" type="application/rss+xml"/>\n` +
      entries.join('\n') +
      (entries.length ? '\n' : '') +
      '</channel>\n</rss>\n'
    )
  }
}

export default new FeedService()
