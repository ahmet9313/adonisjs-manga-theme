import type { HttpContext } from '@adonisjs/core/http'
import recommendations from '#services/recommendation_service'
import library from '#services/library_service'

export default class DiscoverController {
  /** "Sana özel öneriler" with Yeni / Popüler tabs. */
  async recommendations({ view, request, auth }: HttpContext) {
    const tab = request.input('sekme') === 'populer' ? 'popular' : 'fresh'
    const userId = auth.user?.id ?? null
    const fresh = tab === 'fresh' ? await recommendations.fresh(userId) : null
    const popular = tab === 'popular' ? await recommendations.popular(userId) : null
    return view.render('pages/discover/recommendations', {
      title: 'Sana Özel Öneriler',
      tab,
      fresh,
      popular,
    })
  }

  async history({ view, auth }: HttpContext) {
    return view.render('pages/discover/history', {
      title: 'Okuma Geçmişi',
      items: await library.history(auth.user!.id),
    })
  }
}
