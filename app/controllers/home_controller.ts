import { pageNumber } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import { parseTimestamp } from '#services/level'
import seriesService from '#services/series_service'
import comments from '#services/comment_service'
import reviews from '#services/review_service'
import recommendations from '#services/recommendation_service'
import stats from '#services/community_stats_service'
import theme from '#services/theme_service'
import views from '#services/view_service'

/** Chapters published in the last three days carry a "Yeni" label. */
const freshFor = 3 * 86_400_000

/** Marks the chapters published in the last three days (`fresh`). */
function withFreshness<T extends { latestChapters: { publishedAt: string }[] }>(items: T[]) {
  const now = Date.now()
  return items.map((item) => ({
    ...item,
    latestChapters: item.latestChapters.map((chapter) => ({
      ...chapter,
      fresh: now - parseTimestamp(chapter.publishedAt) < freshFor,
    })),
  }))
}

export default class HomeController {
  /**
   * Home page: hero, latest updates and the discovery/community sections, each behind its
   * Admin → Tema → Göster/Gizle switch (hidden sections are not queried). ?page= only pages the
   * latest updates list; every page is still the full home page. The list's page links load the
   * next page in place: they send `X-Fragment: home-updates` and get only that section back.
   */
  async index({ view, request, response, auth }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = 12
    const shown = (key: string) => theme.flag(key)
    // The same URL answers with the whole page or one section: caches must keep them apart.
    response.header('Vary', 'X-Fragment')

    if (request.header('x-fragment') === 'home-updates') {
      if (!shown('home_updates')) return response.notFound('')
      const updates = await seriesService.getRecentlyUpdated(page, perPage)
      response.header('Cache-Control', 'no-store')
      return view.render('partials/home/updates', {
        recentlyUpdated: withFreshness(updates.items),
        currentPage: page,
        totalPages: updates.totalPages,
        // Not the first screen: no eager cover images.
        heroOn: true,
      })
    }

    const [featured, updates, popular, genres, latestComments, topReviews, readers, completed] =
      await Promise.all([
        shown('home_hero') ? seriesService.getFeaturedSeries() : [],
        theme.flag('home_updates')
          ? seriesService.getRecentlyUpdated(page, perPage)
          : { items: [], hasNextPage: false, totalPages: 1 },
        // Most viewed series (Günlük / Haftalık / Aylık / Tümü); the readers rail until the
        // site has counted its first views.
        shown('home_popular')
          ? views
              .tabs()
              .then(async (tabs) =>
                tabs.all.length
                  ? { tabs, rail: [] }
                  : { tabs: null, rail: await recommendations.popular(auth.user?.id ?? null, 12) }
              )
          : { tabs: null, rail: [] },
        shown('home_genres') ? stats.genres() : [],
        shown('home_community') ? comments.latest(5) : [],
        shown('home_community') ? reviews.featured(4) : [],
        shown('home_readers') ? stats.topReaders(30, 8) : [],
        shown('home_completed')
          ? seriesService
              .filterSeries({ statuses: ['Tamamlandı'] }, 1, 6)
              // The card prints `lastChapter` as "Bölüm N"; the shelf shows the count instead.
              .then(({ items }) => items.map((item) => ({ ...item, lastChapter: 0 })))
          : [],
      ])

    const recentlyUpdated = withFreshness(updates.items)

    return view.render('pages/home', {
      featured,
      recentlyUpdated,
      popular: popular.rail,
      popularTabs: popular.tabs,
      genres,
      latestComments,
      topReviews,
      readers,
      completed,
      currentPage: page,
      totalPages: updates.totalPages,
      hasNextPage: updates.hasNextPage,
      signedIn: Boolean(auth.user),
    })
  }
}
