import type { HttpContext } from '@adonisjs/core/http'
import SeriesModel from '#models/series'
import Chapter from '#models/chapter'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import ContentType from '#models/content_type'

export default class DashboardController {
  async index({ view }: HttpContext) {
    const [seriesCount, chapterCount, genreCount, authorCount, artistCount, contentTypeCount] =
      await Promise.all([
        SeriesModel.query().count('* as total').first(),
        Chapter.query().count('* as total').first(),
        Genre.query().count('* as total').first(),
        Author.query().count('* as total').first(),
        Artist.query().count('* as total').first(),
        ContentType.query().count('* as total').first(),
      ])

    const recentSeries = await SeriesModel.query()
      .preload('contentType')
      .orderBy('updatedAt', 'desc')
      .limit(10)

    const recentChapters = await Chapter.query()
      .preload('series')
      .orderBy('createdAt', 'desc')
      .limit(10)

    return view.render('pages/admin/dashboard', {
      title: 'Panel',
      stats: {
        series: Number((seriesCount as any)?.$extras?.total || 0),
        chapters: Number((chapterCount as any)?.$extras?.total || 0),
        genres: Number((genreCount as any)?.$extras?.total || 0),
        authors: Number((authorCount as any)?.$extras?.total || 0),
        artists: Number((artistCount as any)?.$extras?.total || 0),
        contentTypes: Number((contentTypeCount as any)?.$extras?.total || 0),
      },
      recentSeries,
      recentChapters,
    })
  }
}
