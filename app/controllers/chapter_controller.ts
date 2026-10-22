import type { HttpContext } from '@adonisjs/core/http'
import seriesService from '#services/series_service'
import library from '#services/library_service'
import progress from '#services/progress_service'
import watch from '#config/watch'
import access, { AGE_COOKIE } from '#services/access_service'

/**
 * Reading mode and page size from the plain `reader` cookie ("paged-125", written by reader.js),
 * so the first paint already has the visitor's layout. Sizes match reader.js (30–200 %).
 */
function readerViewOf(value: unknown) {
  const match = /^(webtoon|paged)-(\d{2,3})$/.exec(typeof value === 'string' ? value : '')
  const zoom = match ? Number(match[2]) : 100
  return {
    mode: match?.[1] ?? 'webtoon',
    zoom: zoom >= 30 && zoom <= 200 ? zoom : 100,
  }
}

export default class ChapterController {
  async show({ view, params, request, response, auth }: HttpContext) {
    const { type, slug, chapter: chapterNum } = params
    const missing = (what: 'series' | 'chapter') => {
      response.status(404)
      return view.render('pages/errors/not_found', { missing: what })
    }
    if (!Number.isSafeInteger(Number(chapterNum)) || Number(chapterNum) < 0)
      return missing('chapter')
    const drafts = access.canSeeDrafts(auth.user)
    const series = await seriesService.getSeriesBySlug(type, slug, { drafts, people: false })
    if (!series) return missing('series')

    const chapter = await seriesService.getChapterOf(series.id, Number(chapterNum), { drafts })
    if (!chapter) return missing('chapter')

    // Nothing is recorded or rewarded until the visitor passes every gate.
    const gate = access.gate(
      auth.user,
      { series, chapter },
      {
        confirmedAge: access.confirmedAge(request.plainCookie(AGE_COOKIE, { encoded: false })),
        warningConfirmed: request.input('onay') === '1',
      }
    )
    if (gate) {
      if (gate.kind === 'login' || gate.kind === 'vip') response.status(403)
      return view.render('pages/content_gate', {
        title: series.title + ' - Bölüm ' + chapter.number,
        gate,
        series,
        chapter: { number: chapter.number, title: chapter.title },
        next: request.url(true),
      })
    }

    let reward = null
    if (auth.user) {
      const isNew = await library.recordRead(auth.user.id, series.id, chapter.id)
      reward = await progress.chapterRead(auth.user, series.id, isNew)
      // Level-ups and card drops add inbox messages after the menu summary was prepared.
      if (reward) view.share({ account: await progress.summary(auth.user) })
    }

    const allChapters = await seriesService.getChaptersOf(series.id, { drafts })
    let readerCookie: unknown = null
    try {
      readerCookie = request.plainCookie('reader', { encoded: false })
    } catch {
      readerCookie = null
    }
    const currentIndex = allChapters.findIndex((c) => c.number === Number(chapterNum))
    const prevChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null
    const nextChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null

    // Video episodes share the reader's data; only the page template differs.
    return view.render(chapter.video ? 'pages/episode_watch' : 'pages/chapter_reader', {
      title: series.title + ' - Bölüm ' + chapter.number,
      series,
      chapter,
      allChapters,
      prevChapter,
      nextChapter,
      commentThread: { seriesId: series.id, chapterId: chapter.id },
      readerView: readerViewOf(readerCookie),
      reward: reward
        ? {
            exp: reward.exp,
            card: reward.card
              ? { name: reward.card.name, rarity: reward.card.rarity, image: reward.card.image }
              : null,
          }
        : null,
      ...(chapter.video ? { localHost: watch.localHost } : {}),
    })
  }
}
