import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'

export default class ChapterController {
  async show({ view, params, response }: HttpContext) {
    const { type, slug, chapter: chapterNum } = params
    if (!Number.isSafeInteger(Number(chapterNum)) || Number(chapterNum) < 0)
      return response.notFound('Bölüm bulunamadı')
    const series = await seriesService.getSeriesBySlug(type, slug)

    if (!series) {
      return response.notFound('Seri bulunamadı')
    }

    const chapter = await seriesService.getChapter(type, slug, Number(chapterNum))
    if (!chapter) {
      return response.notFound('Bölüm bulunamadı')
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
    })
  }
}
