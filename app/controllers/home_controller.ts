import { pageNumber } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import { parseTimestamp } from '#services/level'
import seriesService from '#services/series_service'
import comments from '#services/comment_service'
import reviews from '#services/review_service'
import recommendations from '#services/recommendation_service'
import stats from '#services/community_stats_service'
import theme from '#services/theme_service'

/** Chapters published in the last three days carry a "Yeni" label. */
const freshFor = 3 * 86_400_000

export default class HomeController {
  /**
   * Home page. Page 1: hero, latest updates and the discovery/community sections, each behind
   * its Admin → Tema → Göster/Gizle switch (hidden sections are not queried). From page 2 on
   * (?page=) only the latest updates list is shown.
   */
  async index({ view, request, auth }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = 12
    const shown = (key: string) => page === 1 && theme.flag(key)

    const [featured, updates, popular, genres, latestComments, topReviews, readers, completed] =
      await Promise.all([
        shown('home_hero') ? seriesService.getFeaturedSeries() : [],
        theme.flag('home_updates')
          ? seriesService.getRecentlyUpdated(page, perPage)
          : { items: [], hasNextPage: false, totalPages: 1 },
        shown('home_popular') ? recommendations.popular(auth.user?.id ?? null, 12) : [],
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

    const now = Date.now()
    const recentlyUpdated = updates.items.map((item) => ({
      ...item,
      latestChapters: item.latestChapters.map((chapter) => ({
        ...chapter,
        fresh: now - parseTimestamp(chapter.publishedAt) < freshFor,
      })),
    }))

    return view.render('pages/home', {
      featured,
      recentlyUpdated,
      popular,
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
