import { buildPaginationPages, pageNumber, filterValues, searchText } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'

export default class SeriesController {
  async index({ view, request }: HttpContext) {
    const qs = request.qs()

    const filters = {
      genres: filterValues(qs.genre),
      statuses: filterValues(qs.status),
      types: filterValues(qs.type),
      search: searchText(qs.search),
      orderBy: searchText(qs.order),
    }

    const page = pageNumber(qs.page)
    const perPage = 24

    const [{ items: results, hasNextPage, totalResults, totalPages }, genres] = await Promise.all([
      seriesService.filterSeries(filters, page, perPage),
      seriesService.getAllGenres(),
    ])

    return view.render('pages/series_list', {
      title: 'Seriler',
      results,
      filters,
      genres,
      currentPage: page,
      hasNextPage,
      totalResults,
      totalPages,
      paginationPages: buildPaginationPages(page, totalPages),
    })
  }

  async show({ view, params, response }: HttpContext) {
    const { type, slug } = params
    const series = await seriesService.getSeriesBySlug(type, slug)

    if (!series) {
      return response.notFound('Seri bulunamadı')
    }

    const chapters = await seriesService.getChapters(type, slug)
    const similar = await seriesService.getSimilarSeries(type, slug)

    return view.render('pages/series_detail', {
      title: series.title,
      description: series.description,
      series,
      chapters,
      similar,
    })
  }

  async search({ request, response }: HttpContext) {
    const query = searchText(request.input('q'))
    const results = await seriesService.searchSeries(query)
    return response.json(
      results.map((s) => ({
        title: s.title,
        slug: s.slug,
        type: s.type,
        coverImage: s.coverImage,
        genres: s.genres.slice(0, 3),
      }))
    )
  }
}
