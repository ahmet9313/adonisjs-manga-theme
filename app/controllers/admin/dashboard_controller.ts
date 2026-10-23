import type { HttpContext } from '@adonisjs/core/http'
import site from '#config/site'
import SeriesModel from '#models/series'
import Chapter from '#models/chapter'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import ContentType from '#models/content_type'
import views from '#services/view_service'
import moderation from '#services/moderation_service'
import publishing from '#services/publishing_service'

const totalOf = (row: unknown) => Number((row as any)?.$extras?.total || 0)

export default class DashboardController {
  async index({ view }: HttpContext) {
    // Timestamps are stored as 'YYYY-MM-DD HH:MM:SS' (input_service.now), so they compare as text.
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    const [
      seriesCount,
      chapterCount,
      genreCount,
      authorCount,
      artistCount,
      contentTypeCount,
      ongoingCount,
      weekCount,
    ] = await Promise.all([
      SeriesModel.query().count('* as total').first(),
      Chapter.query().count('* as total').first(),
      Genre.query().count('* as total').first(),
      Author.query().count('* as total').first(),
      Artist.query().count('* as total').first(),
      ContentType.query().count('* as total').first(),
      SeriesModel.query().where('status', site.statuses[0]).count('* as total').first(),
      Chapter.query().where('createdAt', '>=', weekAgo).count('* as total').first(),
    ])

    const recentSeries = await SeriesModel.query()
      .preload('contentType')
      .withCount('chapters')
      .orderBy('updatedAt', 'desc')
      .limit(8)

    const recentChapters = await Chapter.query()
      .preload('series', (query) => query.preload('contentType'))
      .orderBy('createdAt', 'desc')
      .limit(8)

    return view.render('pages/admin/dashboard', {
      title: 'Panel',
      viewStats: await views.dashboard(),
      stats: {
        series: totalOf(seriesCount),
        chapters: totalOf(chapterCount),
        genres: totalOf(genreCount),
        authors: totalOf(authorCount),
        artists: totalOf(artistCount),
        contentTypes: totalOf(contentTypeCount),
        ongoing: totalOf(ongoingCount),
        chaptersThisWeek: totalOf(weekCount),
      },
      recentSeries,
      recentChapters,
      reportCounts: await moderation.openCounts(),
      scheduled: await publishing.upcoming(5),
    })
  }
}
