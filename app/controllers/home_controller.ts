import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'

function buildPaginationPages(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }
  return pages
}

export default class HomeController {
  async index({ view, request }: HttpContext) {
    const page = Number(request.input('page', 1))
    const perPage = 15
    const featured = await seriesService.getFeaturedSeries()
    const allSeries = await seriesService.getAllSeries()
    const totalPages = Math.ceil(allSeries.length / perPage)
    const { items: recentlyUpdated, hasNextPage } = await seriesService.getRecentlyUpdated(page, perPage)

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
