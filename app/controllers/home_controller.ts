import { buildPaginationPages, pageNumber } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'

export default class HomeController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = 15
    const [featured, { items: recentlyUpdated, hasNextPage, totalPages }] = await Promise.all([
      seriesService.getFeaturedSeries(),
      seriesService.getRecentlyUpdated(page, perPage),
    ])

    return view.render('pages/home', {
      featured,
      recentlyUpdated,
      hasNextPage,
      currentPage: page,
      totalPages,
      paginationPages: buildPaginationPages(page, totalPages),
    })
  }
}
