import db from '@adonisjs/lucid/services/db'
import SeriesModel from '#models/series'
import notifications from '#services/notification_service'

interface Announced {
  number: number
  title: string | null
}

/**
 * Tells every reader who saved the series that new chapters are out: one notification, however
 * many chapters (a bulk upload of 30 chapters is one message, not 30). Draft series stay quiet;
 * their readers hear about the chapters when the series goes live.
 */
export async function announceChapters(seriesId: number, chapters: Announced[]) {
  if (!chapters.length) return
  const series = await SeriesModel.query()
    .where('id', seriesId)
    .preload('contentType')
    .firstOrFail()
  if (series.draft) return
  const readers = await db.from('bookmarks').where('series_id', series.id).select('user_id')
  if (!readers.length) return
  const sorted = [...chapters].sort((a, b) => a.number - b.number)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const single = sorted.length === 1
  await notifications.notifyMany(
    readers.map((row) => Number(row.user_id)),
    'chapter',
    single
      ? {
          title: `Yeni bölüm: ${series.title}`,
          body: `Bölüm ${first.number}${first.title ? ` — ${first.title}` : ''} yayında.`,
          link: `/series/${series.contentType.slug}/${series.slug}/${first.number}`,
        }
      : {
          title: `Yeni bölümler: ${series.title}`,
          body: `${sorted.length} yeni bölüm yayında (Bölüm ${first.number}–${last.number}).`,
          link: `/series/${series.contentType.slug}/${series.slug}/${last.number}`,
        }
  )
}
