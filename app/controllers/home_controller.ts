import { buildPaginationPages, pageNumber } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'
import comments from '#services/comment_service'
import reviews from '#services/review_service'

export default class HomeController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = 15
    const [
      featured,
      { items: recentlyUpdated, hasNextPage, totalPages },
      latestComments,
      topReviews,
    ] = await Promise.all([
      seriesService.getFeaturedSeries(),
      seriesService.getRecentlyUpdated(page, perPage),
      page === 1 ? comments.latest(6) : [],
      page === 1 ? reviews.featured(4) : [],
    ])

    return view.render('pages/home', {
      featured,
      recentlyUpdated,
      latestComments,
      topReviews,
      hasNextPage,
      currentPage: page,
      totalPages,
      paginationPages: buildPaginationPages(page, totalPages),
    })
  }
}
