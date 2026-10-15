import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'
import library from '#services/library_service'
import progress from '#services/progress_service'

export default class ChapterController {
  async show({ view, params, response, auth }: HttpContext) {
    const { type, slug, chapter: chapterNum } = params
    const missing = (what: 'series' | 'chapter') => {
      response.status(404)
      return view.render('pages/errors/not_found', { missing: what })
    }
    if (!Number.isSafeInteger(Number(chapterNum)) || Number(chapterNum) < 0)
      return missing('chapter')
    const series = await seriesService.getSeriesBySlug(type, slug)
    if (!series) return missing('series')

    const chapter = await seriesService.getChapter(type, slug, Number(chapterNum))
    if (!chapter) return missing('chapter')

    let reward = null
    if (auth.user) {
      const isNew = await library.recordRead(auth.user.id, series.id, chapter.id)
      reward = await progress.chapterRead(auth.user, series.id, isNew)
      // Level-ups and card drops add inbox messages after the menu summary was prepared.
      if (reward) view.share({ account: await progress.summary(auth.user) })
    }

    const allChapters = await seriesService.getChapters(type, slug)
    const currentIndex = allChapters.findIndex((c) => c.number === Number(chapterNum))
    const prevChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null
    const nextChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null

    return view.render('pages/chapter_reader', {
      title: series.title + ' - Bölüm ' + chapter.number,
      series,
      chapter,
      allChapters,
      prevChapter,
      nextChapter,
      commentThread: { seriesId: series.id, chapterId: chapter.id },
      reward: reward
        ? {
            exp: reward.exp,
            card: reward.card
              ? { name: reward.card.name, rarity: reward.card.rarity, image: reward.card.image }
              : null,
          }
        : null,
    })
  }
}
