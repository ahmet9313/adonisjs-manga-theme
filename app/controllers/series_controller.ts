import { variantUrl } from '#services/media_service'
import { buildPaginationPages, pageNumber, filterValues, searchText } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'
import library from '#services/library_service'
import reviews, { ratingLabels } from '#services/review_service'
import Author from '#models/author'
import Artist from '#models/artist'
import ContentType from '#models/content_type'
import access, { AGE_COOKIE } from '#services/access_service'
import views from '#services/view_service'
import teamService from '#services/team_service'

export default class SeriesController {
  async index({ view, request }: HttpContext) {
    const qs = request.qs()

    const filters = {
      genres: filterValues(qs.genre),
      statuses: filterValues(qs.status),
      types: filterValues(qs.type),
      authors: filterValues(qs.author),
      artists: filterValues(qs.artist),
      search: searchText(qs.search),
      orderBy: searchText(qs.order),
    }

    const page = pageNumber(qs.page)
    const perPage = 24

    const [
      { items: results, hasNextPage, totalResults, totalPages },
      genres,
      authors,
      artists,
      contentTypes,
    ] = await Promise.all([
      seriesService.filterSeries(filters, page, perPage),
      seriesService.getAllGenres(),
      filters.authors.length ? Author.query().whereIn('slug', filters.authors) : [],
      filters.artists.length ? Artist.query().whereIn('slug', filters.artists) : [],
      ContentType.query().orderBy('name'),
    ])
    // Author/artist filters have no dropdown; they are shown as removable chips.
    const chipUrl = (key: 'author' | 'artist', slug: string) => {
      const params = new URLSearchParams()
      for (const [name, value] of Object.entries(qs)) {
        if (name === 'page') continue
        for (const item of filterValues(value)) {
          if (!(name === key && item === slug)) params.append(name, item)
        }
      }
      const query = params.toString()
      return query ? `/seriler?${query}` : '/seriler'
    }
    const people = [
      ...authors.map((a) => ({
        field: 'author',
        label: 'Yazar',
        name: a.name,
        slug: a.slug,
        removeUrl: chipUrl('author', a.slug),
      })),
      ...artists.map((a) => ({
        field: 'artist',
        label: 'Sanatçı',
        name: a.name,
        slug: a.slug,
        removeUrl: chipUrl('artist', a.slug),
      })),
    ]

    return view.render('pages/series_list', {
      title: 'Seriler',
      results,
      filters,
      genres,
      contentTypes: contentTypes.map((type) => ({ slug: type.slug, name: type.name })),
      people,
      currentPage: page,
      hasNextPage,
      totalResults,
      totalPages,
      paginationPages: buildPaginationPages(page, totalPages),
    })
  }

  async show({ view, params, request, response, auth }: HttpContext) {
    const { type, slug } = params
    const drafts = access.canSeeDrafts(auth.user)
    const series = await seriesService.getSeriesBySlug(type, slug, { drafts })

    if (!series) {
      response.status(404)
      return view.render('pages/errors/not_found', { missing: 'series' })
    }

    // The series page itself only asks for the age rating; members / VIP content is listed with
    // locks and gated when a chapter opens.
    const gate = access.gate(
      auth.user,
      { series: { ...series, access: 'public' } },
      { confirmedAge: access.confirmedAge(request.plainCookie(AGE_COOKIE, { encoded: false })) }
    )
    if (gate) {
      if (gate.kind === 'login') response.status(403)
      return view.render('pages/content_gate', {
        title: series.title,
        gate,
        series,
        chapter: null,
        next: request.url(true),
      })
    }

    const chapters = await seriesService.getChaptersOf(series.id, { drafts })
    const similar = await seriesService.getSimilarSeries(type, slug)
    const reading = auth.user ? await library.state(auth.user.id, series.id) : null
    const savers = await views.saversOf(series.id)

    return view.render('pages/series_detail', {
      title: series.title,
      description: series.description,
      series,
      chapters,
      similar,
      reading,
      savers,
      commentThread: { seriesId: series.id, chapterId: null },
      teamCredits: await teamService.seriesCredits(series.id),
      reviewConfig: {
        seriesId: series.id,
        labels: ratingLabels,
        summary: await reviews.summary(series.id),
      },
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
        thumb: variantUrl(s.coverImage, 160),
        coverVeil: s.coverVeil,
        genres: s.genres.slice(0, 3),
      }))
    )
  }
}
