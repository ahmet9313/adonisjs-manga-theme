import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import recommendations from '#services/recommendation_service'
import library from '#services/library_service'
import { localDay } from '#services/level'

const DAY = 86_400_000

export default class DiscoverController {
  /** "Öneriler" with Yeni / Popüler tabs. */
  async recommendations({ view, request, auth }: HttpContext) {
    const tab = request.input('sekme') === 'populer' ? 'popular' : 'fresh'
    const userId = auth.user?.id ?? null
    const fresh = tab === 'fresh' ? await recommendations.fresh(userId) : null
    const popular = tab === 'popular' ? await recommendations.popular(userId) : null
    return view.render('pages/discover/recommendations', {
      title: 'Öneriler',
      tab,
      fresh,
      popular,
      // Only used to explain a suggestion ("Sevdiğin tür: Aksiyon").
      favourites: fresh?.personal && userId ? await this.favouriteGenres(userId) : [],
    })
  }

  /** Reading history grouped by recency, with chapter totals for the progress bars. */
  async history({ view, auth }: HttpContext) {
    const items = await library.history(auth.user!.id)
    const totals = await this.chapterTotals(items)
    const today = localDay()
    const rows = items.map((item) => {
      const time = Date.parse(item.readAt)
      return {
        ...item,
        chapterCount: Math.max(totals.get(`${item.type}/${item.slug}`) ?? 0, item.readCount),
        period:
          localDay(new Date(time)) === today
            ? 'today'
            : Date.now() - time < 7 * DAY
              ? 'week'
              : 'older',
      }
    })
    return view.render('pages/discover/history', {
      title: 'Okuma Geçmişi',
      items: rows,
      groups: ['today', 'week', 'older']
        .map((period) => ({ period, items: rows.filter((row) => row.period === period) }))
        .filter((group) => group.items.length > 0),
    })
  }

  /** Number of chapters of every series in the history, keyed by "<type>/<slug>". */
  private async chapterTotals(items: { type: string; slug: string }[]) {
    const totals = new Map<string, number>()
    if (!items.length) return totals
    const rows = await db
      .from('series')
      .join('content_types', 'content_types.id', 'series.content_type_id')
      .leftJoin('chapters', 'chapters.series_id', 'series.id')
      .whereIn('series.slug', [...new Set(items.map((item) => item.slug))])
      .groupBy('series.id', 'series.slug', 'content_types.slug')
      .select('series.slug', 'content_types.slug as type')
      .count('chapters.id as total')
    for (const row of rows) totals.set(`${row.type}/${row.slug}`, Number(row.total))
    return totals
  }

  /**
   * Names of the reader's most frequent genres over read and bookmarked series (the same taste
   * the recommendation service ranks by), so a card can say why it was suggested.
   */
  private async favouriteGenres(userId: number): Promise<string[]> {
    const rows = await db
      .from('series_genres')
      .join('genres', 'genres.id', 'series_genres.genre_id')
      .where((query) =>
        query
          .whereIn('series_genres.series_id', (reads) =>
            reads.from('chapter_reads').where('user_id', userId).select('series_id')
          )
          .orWhereIn('series_genres.series_id', (saved) =>
            saved.from('bookmarks').where('user_id', userId).select('series_id')
          )
      )
      .groupBy('genres.id', 'genres.name')
      .select('genres.name')
      .count('* as total')
      .orderBy('total', 'desc')
      .limit(5)
    return rows.map((row) => String(row.name))
  }
}
