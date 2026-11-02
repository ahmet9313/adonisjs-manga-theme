import type { HttpContext } from '@adonisjs/core/http'
import { pageNumber, searchText } from '#services/input_service'
import { LETTERS, alphabet, letterParam, randomSeries } from '#services/discovery_service'

/** A–Z index (/seriler/a-z) and the random series (/rastgele). */
export default class BrowseController {
  async az({ view, request }: HttpContext) {
    const letter = letterParam(request.input('harf'))
    const page = pageNumber(request.input('page'))
    const { counts, items, total, totalPages, all } = await alphabet(letter, page)
    // Consecutive titles of one letter under one heading.
    const groups: { letter: string; items: typeof items }[] = []
    for (const item of items) {
      const last = groups.at(-1)
      if (last && last.letter === item.letter) last.items.push(item)
      else groups.push({ letter: item.letter, items: [item] })
    }
    return view.render('pages/series_az', {
      title: letter ? `A–Z: ${letter}` : 'A–Z Seri Listesi',
      letters: LETTERS.map((item) => ({ value: item, count: counts[item] })),
      letter,
      groups,
      total,
      az: true,
      all,
      currentPage: page,
      totalPages,
    })
  }

  /** Redirects to a random published series; ?type=<slug> keeps to one content type. */
  async random({ request, response, session }: HttpContext) {
    const type = searchText(request.input('type')) || null
    const series = await randomSeries(type)
    response.header('cache-control', 'no-store')
    if (!series) {
      session.flash('info', 'Rastgele açılacak bir seri bulunamadı.')
      return response.redirect('/seriler')
    }
    return response.redirect(`/series/${series.type}/${series.slug}`)
  }
}
