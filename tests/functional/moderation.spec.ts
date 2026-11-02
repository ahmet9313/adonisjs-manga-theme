import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import Comment from '#models/comment'
import SeriesReview from '#models/series_review'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'
import settings from '#services/settings_service'
import { foldTurkish, parseBlockedWords } from '#services/word_filter_service'

const base = 'http://127.0.0.1:3334'
const password = 'moderation-pass-123'

const statusOf = async (response: Promise<Response | { status: number }>) => {
  const result = await response
  return result.status
}
const htmlOf = async (page: Promise<{ html: string }>) => {
  const result = await page
  return result.html
}
const errorOf = async (response: Response) => {
  const data = (await response.json()) as { error?: string }
  return data.error ?? ''
}

function client() {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        accept: 'application/json',
        ...options.headers,
      },
    })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
    return response
  }
  const token = async () => {
    const response = await request('/kaydedilenler', { headers: { accept: 'text/html' } })
    const html = await response.text()
    return html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  }
  const login = async (identifier: string) =>
    request('/giris', {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: new URLSearchParams({ login: identifier, password }),
    })
  /** JSON POST (report, comment, review endpoints). */
  const json = async (path: string, body: Record<string, unknown>) =>
    request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  /** Classic form POST of the admin pages. */
  const form = async (path: string, body: Record<string, string> = {}) =>
    request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: new URLSearchParams(body),
    })
  const page = async (path: string) => {
    const response = await request(path, { headers: { accept: 'text/html' } })
    return { status: response.status, html: await response.text() }
  }
  return { request, login, json, form, page }
}

const report = (
  web: ReturnType<typeof client>,
  type: string,
  id: number,
  reason: string,
  note?: string
) => web.json('/bildir', { target_type: type, target_id: id, reason, note })

let series: Series
let chapter: Chapter
let draftChapter: Chapter
let episode: Chapter

test.group('Reports and moderation', (group) => {
  group.setup(async () => {
    clearAttempts()
    const timestamp = now()
    const type = await ContentType.create({ name: 'Bildirim Manga', slug: 'bildirim-manga' })
    const video = await ContentType.create({
      name: 'Bildirim Anime',
      slug: 'bildirim-anime',
      format: 'video',
    } as any)
    const make = (title: string, slug: string, contentTypeId: number) =>
      Series.create({
        title,
        slug,
        description: 'Test',
        contentTypeId,
        status: 'Devam Ediyor',
        translationStatus: 'Aktif',
        publicationYear: 2025,
        alternativeTitles: [],
        coverImage: '/images/no-cover.svg',
        featured: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    series = await make('Bildirim Testi', 'bildirim-testi', type.id)
    const anime = await make('Bildirim Animesi', 'bildirim-animesi', video.id)
    const chapterOf = (seriesId: number, number: number, content: any, draft = false) =>
      Chapter.create({
        seriesId,
        number,
        title: null,
        content,
        draft,
        publishedAt: '2026-10-01',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    chapter = await chapterOf(series.id, 1, { type: 'images', pages: ['/images/no-cover.svg'] })
    draftChapter = await chapterOf(
      series.id,
      2,
      { type: 'images', pages: ['/images/no-cover.svg'] },
      true
    )
    episode = await chapterOf(anime.id, 1, {
      type: 'video',
      sources: [
        { host: 'YouTube', kind: 'embed', url: 'https://www.youtube.com/embed/x', label: '' },
      ],
    })
    for (const [username, role] of [
      ['modmember', 'member'],
      ['modother', 'member'],
      ['modeditor', 'editor'],
      ['modadmin', 'admin'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
  })
  group.each.setup(() => clearAttempts())
  group.teardown(async () => {
    await settings.save({ blocked_words: '' })
  })

  test('guests report chapter errors once per reason and are throttled', async ({ assert }) => {
    const guest = client()
    assert.equal(await statusOf(report(guest, 'chapter', chapter.id, 'missing_pages')), 201)
    const again = await report(guest, 'chapter', chapter.id, 'missing_pages')
    assert.equal(again.status, 409)
    assert.include(await errorOf(again), 'zaten bildirdin')
    assert.equal(
      await statusOf(report(guest, 'chapter', chapter.id, 'page_order', '3 ve 4 yer değişmiş')),
      201
    )
    // Reasons follow the chapter's format; "Diğer" needs a note; drafts stay hidden.
    clearAttempts()
    assert.equal(await statusOf(report(guest, 'chapter', chapter.id, 'source_down')), 422)
    assert.equal(await statusOf(report(guest, 'chapter', episode.id, 'source_down')), 201)
    assert.equal(await statusOf(report(guest, 'chapter', chapter.id, 'other')), 422)
    assert.equal(await statusOf(report(guest, 'chapter', draftChapter.id, 'missing_pages')), 404)
    // Comments and reviews need an account.
    assert.equal(await statusOf(report(guest, 'comment', 1, 'spam')), 401)

    const stored = await db
      .from('reports')
      .where('target_id', chapter.id)
      .where('target_type', 'chapter')
    assert.lengthOf(stored, 2)
    assert.isNull(stored[0].reporter_id)
    assert.match(stored[0].reporter_ip, /^[0-9a-f]{40}$/)
    assert.notInclude(stored[0].reporter_ip, '127.0.0.1')

    // Five attempts per address in ten minutes (every attempt counts, the rejected ones too).
    clearAttempts()
    for (let index = 0; index < 5; index++)
      await report(guest, 'chapter', chapter.id, 'broken_images')
    assert.equal(await statusOf(report(guest, 'chapter', chapter.id, 'translation')), 429)
  })

  test('members report chapters and other people’s comments and reviews', async ({ assert }) => {
    const member = client()
    await member.login('modmember')
    // A member is told apart from a guest on the same address.
    assert.equal(await statusOf(report(member, 'chapter', chapter.id, 'missing_pages')), 201)
    assert.equal(await statusOf(report(member, 'chapter', chapter.id, 'missing_pages')), 409)

    const other = await User.findByOrFail('username', 'modother')
    const mine = await User.findByOrFail('username', 'modmember')
    const timestamp = now()
    const fields = {
      seriesId: series.id,
      chapterId: null,
      parentId: null,
      rootId: null,
      depth: 0,
      image: null,
      stickerId: null,
      spoiler: false,
      likeCount: 0,
      dislikeCount: 0,
      replyCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const theirs = await Comment.create({
      ...fields,
      userId: other.id,
      body: 'Reklam: ucuz kupon!',
    })
    const own = await Comment.create({ ...fields, userId: mine.id, body: 'Benim yorumum' })
    const gone = await Comment.create({
      ...fields,
      userId: other.id,
      body: '',
      deletedAt: timestamp,
    })
    assert.equal(await statusOf(report(member, 'comment', theirs.id, 'spam', 'Kupon linki')), 201)
    assert.equal(await statusOf(report(member, 'comment', theirs.id, 'abuse')), 409)
    assert.equal(await statusOf(report(member, 'comment', theirs.id, 'missing_pages')), 422)
    const self = await report(member, 'comment', own.id, 'spam')
    assert.equal(self.status, 422)
    assert.include(await errorOf(self), 'Kendi içeriğini')
    assert.equal(await statusOf(report(member, 'comment', gone.id, 'spam')), 404)

    const review = await SeriesReview.create({
      userId: other.id,
      seriesId: series.id,
      rating: 2,
      title: 'Kötü',
      body: 'Bu seri bence hiç iyi değil, sıkıcı.',
      spoiler: true,
      helpfulCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.from('series').where('id', series.id).update({ rating_count: 1, review_count: 1 })
    assert.equal(await statusOf(report(member, 'review', review.id, 'spoiler')), 201)
    const otherClient = client()
    await otherClient.login('modother')
    assert.equal(await statusOf(report(otherClient, 'review', review.id, 'spam')), 422)
  })

  test('staff see the grouped queue; members get 403', async ({ assert }) => {
    const member = client()
    await member.login('modmember')
    assert.equal(await statusOf(member.page('/admin/moderasyon')), 403)

    const editor = client()
    await editor.login('modeditor')
    const chapters = await editor.page('/admin/moderasyon')
    assert.equal(chapters.status, 200)
    assert.include(chapters.html, 'Bildirim Testi · Bölüm 1')
    assert.include(chapters.html, 'Sayfa sırası yanlış')
    assert.include(chapters.html, '3 ve 4 yer değişmiş')
    assert.include(chapters.html, 'Kaynak çalışmıyor')
    // Editors reach the page from the menu, with the open count.
    assert.include(chapters.html, 'href="/admin/moderasyon" aria-current=page')
    assert.match(chapters.html, /admin-link__count[^>]*>\d+/)

    const content = await editor.page('/admin/moderasyon?tab=icerik')
    assert.include(content.html, 'Reklam: ucuz kupon!')
    assert.include(content.html, 'Kupon linki')
    assert.include(content.html, 'Spoiler')
    assert.include(content.html, 'Bu seri bence hiç iyi değil')
    assert.include(content.html, '/admin/moderasyon/uye/')

    const dashboard = await editor.page('/admin')
    assert.include(dashboard.html, 'bölüm hatası')
  })

  test('resolve, dismiss and delete close every open report of a target', async ({ assert }) => {
    const editor = client()
    await editor.login('modeditor')
    const resolved = await editor.form(`/admin/moderasyon/chapter/${chapter.id}/coz`, {
      back: '/admin/moderasyon?durum=open',
    })
    assert.equal(resolved.status, 302)
    assert.equal(resolved.headers.get('location'), '/admin/moderasyon?durum=open')
    const open = await db
      .from('reports')
      .where({ target_type: 'chapter', target_id: chapter.id, status: 'open' })
    assert.lengthOf(open, 0)
    const closed = await db
      .from('reports')
      .where({ target_type: 'chapter', target_id: chapter.id, status: 'resolved' })
    assert.isAbove(closed.length, 2)
    const staff = await User.findByOrFail('username', 'modeditor')
    assert.isTrue(closed.every((row) => row.resolved_by === staff.id && row.resolved_at))
    // The member who reported hears about the fix; an outside "back" is ignored.
    const member = await User.findByOrFail('username', 'modmember')
    const thanks = await db
      .from('notifications')
      .where({ user_id: member.id, title: 'Bildirdiğin hata düzeltildi' })
    assert.lengthOf(thanks, 1)
    const outside = await editor.form(`/admin/moderasyon/chapter/${episode.id}/reddet`, {
      back: 'https://example.com',
    })
    assert.equal(outside.headers.get('location'), '/admin/moderasyon')
    const dismissed = await db
      .from('reports')
      .where({ target_type: 'chapter', target_id: episode.id })
      .select('status', 'resolution')
    assert.deepEqual(dismissed, [{ status: 'dismissed', resolution: 'dismissed' }])
    const history = await editor.page('/admin/moderasyon?durum=dismissed')
    assert.include(history.html, 'Reddedildi · @modeditor')

    const comment = await Comment.findByOrFail('body', 'Reklam: ucuz kupon!')
    assert.equal(await statusOf(editor.form(`/admin/moderasyon/comment/${comment.id}/sil`)), 302)
    assert.isNull(await Comment.find(comment.id))
    const commentReports = await db
      .from('reports')
      .where({ target_type: 'comment', target_id: comment.id })
    assert.isTrue(
      commentReports.every((row) => row.status === 'resolved' && row.resolution === 'deleted')
    )

    const review = await SeriesReview.query().where('seriesId', series.id).firstOrFail()
    await editor.form(`/admin/moderasyon/review/${review.id}/sil`)
    assert.isNull(await SeriesReview.find(review.id))
    const fresh = await Series.findOrFail(series.id)
    assert.equal(fresh.reviewCount, 0)
    assert.equal(await statusOf(editor.form(`/admin/moderasyon/chapter/${chapter.id}/sil`)), 404)
  })

  test('muted members cannot post; staff cannot be muted; unmute restores', async ({ assert }) => {
    const other = await User.findByOrFail('username', 'modother')
    const editor = client()
    await editor.login('modeditor')
    assert.equal(
      await statusOf(editor.form(`/admin/moderasyon/uye/${other.id}/sustur`, { days: '7' })),
      302
    )
    await other.refresh()
    assert.isTrue(other.isMuted)
    const days = (Date.parse(`${other.mutedUntil!.replace(' ', 'T')}Z`) - Date.now()) / 86_400_000
    assert.closeTo(days, 7, 0.01)
    const notice = await db
      .from('notifications')
      .where({ user_id: other.id, title: 'Hesabın susturuldu' })
    assert.lengthOf(notice, 1)

    const muted = client()
    await muted.login('modother')
    const comment = await muted.json('/yorumlar', { series_id: series.id, body: 'Merhaba' })
    assert.equal(comment.status, 403)
    assert.include(await errorOf(comment), 'tarihine kadar yorum ve inceleme yazamazsın')
    const review = await muted.json('/incelemeler', { series_id: series.id, rating: 8 })
    assert.equal(review.status, 403)
    // Reading still works.
    assert.equal(await statusOf(muted.page('/series/bildirim-manga/bildirim-testi/1')), 200)

    // Bad durations are rejected; staff and the moderator themselves are never muted.
    await editor.form(`/admin/moderasyon/uye/${other.id}/sustur`, { days: '3' })
    await other.refresh()
    assert.closeTo(
      (Date.parse(`${other.mutedUntil!.replace(' ', 'T')}Z`) - Date.now()) / 86_400_000,
      7,
      0.01
    )
    const admin = await User.findByOrFail('username', 'modadmin')
    await editor.form(`/admin/moderasyon/uye/${admin.id}/sustur`, { days: '1' })
    await admin.refresh()
    assert.isNull(admin.mutedUntil)

    // The admin user page shows the state and lifts it.
    const adminClient = client()
    await adminClient.login('modadmin')
    const userPage = await adminClient.page(`/admin/kullanicilar/${other.id}/duzenle`)
    assert.include(userPage.html, 'tarihine kadar susturuldu')
    assert.include(userPage.html, `/admin/moderasyon/uye/${other.id}/susturma-kaldir`)
    const lifted = await adminClient.form(`/admin/moderasyon/uye/${other.id}/susturma-kaldir`, {
      back: `/admin/kullanicilar/${other.id}/duzenle`,
    })
    assert.equal(lifted.headers.get('location'), `/admin/kullanicilar/${other.id}/duzenle`)
    await other.refresh()
    assert.isNull(other.mutedUntil)
    assert.equal(
      await statusOf(muted.json('/yorumlar', { series_id: series.id, body: 'Döndüm' })),
      201
    )

    // "Süresiz" is a far-future date.
    await adminClient.form(`/admin/moderasyon/uye/${other.id}/sustur`, { days: '0' })
    await other.refresh()
    assert.equal(other.mutedUntil, '9999-12-31 23:59:59')
    const forever = await muted.json('/yorumlar', { series_id: series.id, body: 'Yine ben' })
    assert.include(await errorOf(forever), 'süresiz')
    await adminClient.form(`/admin/moderasyon/uye/${other.id}/susturma-kaldir`)
  })

  test('blocked words reject comments and reviews with Turkish case rules', async ({ assert }) => {
    assert.equal(foldTurkish('İĞRENÇ IŞIK'), 'iğrenç ışık')
    assert.deepEqual(parseBlockedWords('  Aptal \n\naptal, Kötü   Söz\n'), ['aptal', 'kötü söz'])

    const editor = client()
    await editor.login('modeditor')
    await editor.form('/admin/moderasyon/kelimeler', { words: 'Aptal\nİğrenç\nkötü söz' })
    assert.include(await htmlOf(editor.page('/admin/moderasyon')), 'iğrenç')

    const member = client()
    await member.login('modmember')
    const post = (body: string) => member.json('/yorumlar', { series_id: series.id, body })
    const blocked = await post('Sen tam bir APTALSIN')
    assert.equal(blocked.status, 422)
    assert.include(await errorOf(blocked), '“aptal”')
    assert.equal(await statusOf(post('Bu bölüm İĞRENÇTİ')), 422)
    assert.equal(await statusOf(post('Gerçekten kötü   söz bu')), 422)
    // Inside another word, or "I" (= ı) instead of "İ", is not a match.
    assert.equal(await statusOf(post('Kaptan çok iyiydi')), 201)
    assert.equal(await statusOf(post('IĞRENÇ yazımı farklı')), 201)

    const review = await member.json('/incelemeler', {
      series_id: series.id,
      rating: 3,
      title: 'Aptalca bir son',
    })
    assert.equal(review.status, 422)
    assert.include(await errorOf(review), 'İncelemen')

    await editor.form('/admin/moderasyon/kelimeler', { words: '' })
    clearAttempts()
    assert.equal(await statusOf(post('Sen tam bir APTALSIN')), 201)
  })
})
