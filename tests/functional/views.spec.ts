import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import views, { countOf, firstDayOf, isBot } from '#services/view_service'
import { localDay } from '#services/level'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'views-password-123'
/** A browser-like agent (Node's fetch says "node", which also counts). */
const statusOf = (response: Promise<Response>) => response.then((result) => result.status)
const browser = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'

/** Cookie-aware client with form logins. */
function client(agent = browser) {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        'cookie': [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        'user-agent': agent,
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
  const page = async (path: string) => request(path).then((response) => response.text())
  const login = async (identifier: string) => {
    const html = await page('/giris')
    const token = html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
    return request('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: token, login: identifier, password }),
    })
  }
  return { request, page, login, cookies }
}

const countsOf = async (seriesId: number, chapterId: number) => {
  const chapter = await db.from('chapters').where('id', chapterId).select('view_count').first()
  const series = await db.from('series').where('id', seriesId).select('view_count').first()
  const day = await db
    .from('series_daily_views')
    .where({ series_id: seriesId, day: localDay() })
    .select('views')
    .first()
  return {
    chapter: Number(chapter?.view_count || 0),
    series: Number(series?.view_count || 0),
    today: Number(day?.views || 0),
  }
}

test('countOf abbreviates counts the Turkish way', ({ assert }) => {
  assert.equal(countOf(0), '0')
  assert.equal(countOf(null), '0')
  assert.equal(countOf(-5), '0')
  assert.equal(countOf(999), '999')
  assert.equal(countOf(1000), '1 B')
  assert.equal(countOf(1250), '1,2 B')
  assert.equal(countOf(12_480), '12,4 B')
  assert.equal(countOf(999_999), '999 B')
  assert.equal(countOf(2_730_000), '2,7 Mn')
  assert.equal(countOf(1_200_000_000), '1,2 Mr')
  assert.isTrue(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'))
  assert.isTrue(isBot('Mozilla/5.0 HeadlessChrome/141.0'))
  assert.isTrue(isBot(''))
  assert.isFalse(isBot(browser))
})

test.group('View counts and popular lists', (group) => {
  let type: ContentType
  const series: Record<string, Series> = {}
  const chapters: Record<string, Chapter> = {}

  group.each.setup(() => clearAttempts())

  group.setup(async () => {
    const timestamp = now()
    type = await ContentType.create({
      name: 'Görüntü Türü',
      slug: 'goruntu-turu',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const make = (key: string, extra: Partial<Series> = {}) =>
      Series.create({
        title: `Sayaç ${key}`,
        slug: `sayac-${key}`,
        description: 'Görüntülenme testi',
        contentTypeId: type.id,
        status: 'Devam Ediyor',
        translationStatus: 'Aktif',
        publicationYear: 2026,
        alternativeTitles: [],
        coverImage: '/images/no-cover.svg',
        featured: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      }).then((created) => (series[key] = created))
    await make('okunan')
    await make('gunluk')
    await make('haftalik')
    await make('eski')
    await make('taslak', { draft: true })
    const chapter = (key: string, owner: Series, number: number, extra: Partial<Chapter> = {}) =>
      Chapter.create({
        seriesId: owner.id,
        number,
        title: null,
        content: { type: 'images', pages: ['/images/no-cover.svg'] },
        publishedAt: timestamp.slice(0, 10),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      }).then((created) => (chapters[key] = created))
    await chapter('public', series.okunan, 1)
    await chapter('second', series.okunan, 2)
    await chapter('draft', series.okunan, 3, { draft: true })
    await chapter('members', series.okunan, 4, { access: 'members' })
    await chapter('draftSeries', series.taslak, 1)

    await User.create({
      username: 'sayac_admin',
      email: 'sayac_admin@example.com',
      fullName: 'Sayaç Yönetici',
      password,
      role: 'admin',
    })
  })

  test('a chapter counts once per browser and day', async ({ assert }) => {
    const reader = client()
    const url = `/series/goruntu-turu/sayac-okunan/1`
    assert.equal(await statusOf(reader.request(url)), 200)
    await views.settle()
    assert.deepEqual(await countsOf(series.okunan.id, chapters.public.id), {
      chapter: 1,
      series: 1,
      today: 1,
    })
    assert.match(reader.cookies.get('seen') || '', new RegExp(`\\.${chapters.public.id}$`))

    // Same browser, same day: not again. Another chapter of the series counts.
    await reader.request(url)
    await reader.request(`/series/goruntu-turu/sayac-okunan/2`)
    await views.settle()
    assert.deepEqual(await countsOf(series.okunan.id, chapters.public.id), {
      chapter: 1,
      series: 2,
      today: 2,
    })

    // Another browser counts; yesterday's list does not stop a new count.
    await client().request(url)
    const returning = client()
    returning.cookies.set('seen', `20000101.${chapters.public.id}`)
    await returning.request(url)
    await views.settle()
    const counts = await countsOf(series.okunan.id, chapters.public.id)
    assert.equal(counts.chapter, 3)
    assert.equal(counts.today, 4)
    // Still one aggregate row per series and day.
    const rows = await db.from('series_daily_views').where('series_id', series.okunan.id)
    assert.lengthOf(rows, 1)
  })

  test('bots, prefetches, gates and draft previews are not counted', async ({ assert }) => {
    const before = await countsOf(series.okunan.id, chapters.public.id)
    const url = `/series/goruntu-turu/sayac-okunan/1`
    assert.equal(
      await statusOf(client('Mozilla/5.0 (compatible; Googlebot/2.1)').request(url)),
      200
    )
    await client('').request(url)
    await client().request(url, { headers: { 'sec-purpose': 'prefetch' } })

    // Members chapter for a guest: the gate answers, nothing is counted.
    const guest = client()
    assert.equal(await statusOf(guest.request(`/series/goruntu-turu/sayac-okunan/4`)), 403)
    assert.isUndefined(guest.cookies.get('seen'))

    // Staff previews of a draft chapter and of a draft series' chapter.
    const admin = client()
    await admin.login('sayac_admin')
    assert.equal(await statusOf(admin.request(`/series/goruntu-turu/sayac-okunan/3`)), 200)
    assert.equal(await statusOf(admin.request(`/series/goruntu-turu/sayac-taslak/1`)), 200)
    await views.settle()

    assert.deepEqual(await countsOf(series.okunan.id, chapters.public.id), before)
    for (const key of ['draft', 'members']) {
      const row = await db.from('chapters').where('id', chapters[key].id).first()
      assert.equal(Number(row.view_count), 0, key)
    }
    const draftSeries = await countsOf(series.taslak.id, chapters.draftSeries.id)
    assert.equal(draftSeries.series, 0)
  })

  test('record() upserts the row of the day', async ({ assert }) => {
    await views.record(series.eski.id, chapters.public.id, '2001-01-01')
    await views.record(series.eski.id, chapters.public.id, '2001-01-01')
    const row = await db
      .from('series_daily_views')
      .where({ series_id: series.eski.id, day: '2001-01-01' })
      .first()
    assert.equal(Number(row.views), 2)
    // Undo the side effects on the counters used below.
    await db.from('series_daily_views').where({ series_id: series.eski.id }).delete()
    await db.from('series').where('id', series.eski.id).update({ view_count: 0 })
    await db.from('chapters').where('id', chapters.public.id).decrement('view_count', 2)
  })

  test('popular tabs rank by period and leave drafts out', async ({ assert }) => {
    // Big numbers so incidental views from other test files never outrank them.
    const seed: [string, string, number][] = [
      ['gunluk', localDay(), 9000],
      ['haftalik', firstDayOf(6), 20000],
      ['haftalik', localDay(), 100],
      ['eski', firstDayOf(41), 50000],
      ['taslak', localDay(), 900000],
    ]
    for (const [key, day, count] of seed)
      await db.table('series_daily_views').insert({ series_id: series[key].id, day, views: count })
    for (const [key, total] of [
      ['gunluk', 9000],
      ['haftalik', 20100],
      ['eski', 50000],
      ['taslak', 900000],
    ] as const)
      await db.from('series').where('id', series[key].id).update({ view_count: total })
    views.clearCache()

    const slugs = (items: { slug: string }[]) => items.map((item) => item.slug)
    const day = await views.popular('day')
    assert.equal(day[0].slug, 'sayac-gunluk')
    assert.equal(day[0].views, 9000)
    assert.isBelow(slugs(day).indexOf('sayac-haftalik'), 3)
    assert.notInclude(slugs(day), 'sayac-eski')

    const week = await views.popular('week')
    assert.deepEqual(slugs(week).slice(0, 2), ['sayac-haftalik', 'sayac-gunluk'])
    assert.equal(week[0].views, 20100)
    assert.notInclude(slugs(week), 'sayac-eski')

    const all = await views.popular('all')
    assert.deepEqual(slugs(all).slice(0, 3), ['sayac-eski', 'sayac-haftalik', 'sayac-gunluk'])
    for (const list of [day, week, all, await views.popular('month')])
      assert.notInclude(slugs(list), 'sayac-taslak')

    const html = await client().page('/')
    assert.include(html, 'Popüler Seriler')
    for (const label of ['Günlük', 'Haftalık', 'Aylık', 'Tümü']) assert.include(html, label)
    assert.include(html, 'role="tablist"')
    assert.include(html, 'Sayaç haftalik')
    assert.include(html, '20,1 B')
    assert.notInclude(html, 'Sayaç taslak')
    // The week tab is the default panel (visible without JavaScript).
    const panel = (key: string) =>
      html.match(new RegExp(`<div role="tabpanel" id="home-popular-panel-${key}"[^>]*>`))?.[0] || ''
    assert.notMatch(panel('haftalik'), /\shidden\s/)
    assert.match(panel('gunluk'), /\shidden\s/)
  })

  test('the catalog sorts by views and by trend', async ({ assert }) => {
    const order = (html: string, keys: string[]) =>
      keys.map((key) => html.indexOf(`href="/series/goruntu-turu/sayac-${key}"`))

    const byViews = await client().page('/seriler?order=views&type=goruntu-turu')
    const [old, weekly, daily] = order(byViews, ['eski', 'haftalik', 'gunluk'])
    assert.isAbove(old, -1)
    assert.isBelow(old, weekly)
    assert.isBelow(weekly, daily)
    assert.include(byViews, 'En çok okunan')
    assert.include(byViews, '50 B görüntülenme')
    assert.notInclude(byViews, 'sayac-taslak')

    const trending = await client().page('/seriler?order=trending&type=goruntu-turu')
    const [weekly2, daily2, old2] = order(trending, ['haftalik', 'gunluk', 'eski'])
    assert.isAbove(weekly2, -1)
    assert.isBelow(weekly2, daily2)
    assert.isBelow(daily2, old2)
  })

  test('series page, chapter rows and admin show the counts', async ({ assert }) => {
    const reader = client()
    const saver = await User.findByOrFail('username', 'sayac_admin')
    await db.table('bookmarks').insert({
      user_id: saver.id,
      series_id: series.okunan.id,
      created_at: now(),
    })
    const html = await reader.page('/series/goruntu-turu/sayac-okunan')
    assert.include(html, 'Görüntülenme')
    assert.include(html, '1 kişi kaydetti')
    assert.match(html, /chapter-row__views[^>]*title="\d+ görüntülenme"/)

    const admin = client()
    await admin.login('sayac_admin')
    const page = await admin.page('/admin')
    // Only the view block: the "recent series" table lists drafts for staff.
    const dashboard = page.slice(page.indexOf('id="views-title"'), page.indexOf('id="quick-title"'))
    assert.include(dashboard, 'Bu haftanın en çok okunanları')
    assert.include(dashboard, 'Sayaç haftalik')
    assert.notInclude(dashboard, 'Sayaç taslak')
    const list = await admin.page('/admin/seriler?type=goruntu-turu')
    assert.include(list, '>Görüntülenme</th>')
    assert.include(list, '50 B')
  })
})
