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

export default class SeriesController {
  async index({ view, request }: HttpContext) {
    const qs = request.qs()

    // Support both single and multiple values for each filter
    const toArray = (val: any): string[] => {
      if (!val) return []
      if (Array.isArray(val)) return val.filter(Boolean)
      return val.split(',').filter(Boolean)
    }

    const filters = {
      genres: toArray(qs.genre),
      statuses: toArray(qs.status),
      types: toArray(qs.type),
      search: (qs.search as string) || '',
      orderBy: (qs.order as string) || '',
    }

    const page = Number(qs.page || 1)
    const perPage = 24

    const allResults = await seriesService.filterSeries(filters)
    const start = (page - 1) * perPage
    const paged = allResults.slice(start, start + perPage)
    const hasNextPage = start + perPage < allResults.length
    const totalResults = allResults.length

    // Attach chapter count to each result
    const results = await Promise.all(
      paged.map(async (s) => {
        const chapters = await seriesService.getChapters(s.type, s.slug)
        return { ...s, chapterCount: chapters.length, lastChapter: chapters[0]?.number || 0 }
      })
    )

    const genres = await seriesService.getAllGenres()

    const totalPages = Math.ceil(allResults.length / perPage)

    return view.render('pages/series_list', {
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
      series,
      chapters,
      similar,
    })
  }

  async search({ request, response }: HttpContext) {
    const query = request.input('q', '')
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
