import db from '@adonisjs/lucid/services/db'
import SeriesModel from '#models/series'
import { serializeSeries } from '#services/series_presenter'

const readers = db.raw(
  '(select count(distinct cr.user_id) from chapter_reads cr where cr.series_id = series.id) as readers'
)
const savers = db.raw('(select count(*) from bookmarks b where b.series_id = series.id) as savers')

function cards(rows: SeriesModel[]) {
  return rows.map((series) => ({
    ...serializeSeries(series),
    chapterCount: Number(series.$extras.chapters_count || 0),
    readers: Number(series.$extras.readers || 0),
    savers: Number(series.$extras.savers || 0),
  }))
}

function base() {
  return SeriesModel.query()
    .select('series.*', readers, savers)
    .where('series.draft', false)
    .preload('contentType')
    .preload('genres')
    .preload('authors')
    .preload('artists')
    .withCount('chapters', (chapters) => chapters.where('draft', false))
}

/** "Sana özel öneriler": new releases in favourite genres and popular series not read yet. */
class RecommendationService {
  private async taste(userId: number | null) {
    if (!userId) return { read: [] as number[], genres: [] as number[] }
    const touched = await db
      .from('chapter_reads')
      .where('user_id', userId)
      .distinct('series_id')
      .union((query) => query.from('bookmarks').where('user_id', userId).select('series_id'))
    const ids = [...new Set(touched.map((row) => Number(row.series_id)))]
    const readRows = await db.from('chapter_reads').where('user_id', userId).distinct('series_id')
    const read = readRows.map((row) => Number(row.series_id))
    if (!ids.length) return { read, genres: [] }
    const genres = await db
      .from('series_genres')
      .whereIn('series_id', ids)
      .select('genre_id')
      .count('* as total')
      .groupBy('genre_id')
      .orderBy('total', 'desc')
      .limit(5)
    return { read, genres: genres.map((row) => Number(row.genre_id)) }
  }

  async fresh(userId: number | null, limit = 12) {
    const { read, genres } = await this.taste(userId)
    const query = base().whereNotIn('series.id', read.length ? read : [0])
    if (genres.length)
      query.orderByRaw(
        `case when exists (select 1 from series_genres sg where sg.series_id = series.id and sg.genre_id in (${genres.map(() => '?').join(',')})) then 0 else 1 end`,
        genres
      )
    const rows = await query
      .orderBy('series.created_at', 'desc')
      .orderBy('series.id', 'desc')
      .limit(limit)
    return { items: cards(rows), personal: genres.length > 0 }
  }

  async popular(userId: number | null, limit = 24) {
    const { read } = await this.taste(userId)
    const rows = await base()
      .whereNotIn('series.id', read.length ? read : [0])
      .orderBy('readers', 'desc')
      .orderBy('savers', 'desc')
      .orderBy('series.updated_at', 'desc')
      .limit(limit)
    return cards(rows)
  }
}

export default new RecommendationService()
