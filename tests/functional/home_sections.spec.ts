import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Chapter from '#models/chapter'
import Comment from '#models/comment'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Series from '#models/series'
import SeriesReview from '#models/series_review'
import User from '#models/user'
import { flags } from '#config/theme'
import settings from '#services/settings_service'
import { flagKey } from '#services/theme_service'
import { clearAttempts } from '#services/throttle'
import { now } from '#services/input_service'

const base = 'http://127.0.0.1:3334'
const password = 'home-sections-123'

const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}

/** Cookie-aware client with CSRF handling (form posts). */
function client() {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        accept: 'text/html',
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
  const token = async (path: string) => {
    const html = await textOf(request(path))
    return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  }
  const post = async (path: string, fields: Record<string, string>, from = path) =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  return { request, post }
}

/** Seconds-precision UTC timestamp `days` days ago, in the database format. */
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')

const sections = {
  home_hero: 'aria-roledescription="carousel"',
  home_updates: 'Son Güncellenenler',
  home_popular: 'Popüler Seriler',
  home_genres: 'Türlere Göre Keşfet',
  home_community: 'Öne Çıkan İncelemeler',
  home_readers: 'Ayın Okurları',
  home_completed: 'Tamamlanan Seriler',
} as const

test.group('Home page sections', (group) => {
  const created: { users: number[]; series: number[]; genres: number[] } = {
    users: [],
    series: [],
    genres: [],
  }

  group.each.setup(() => clearAttempts())

  group.setup(async () => {
    const timestamp = now()
    const type = await ContentType.firstOrCreate(
      { slug: 'manga' },
      { name: 'Manga', slug: 'manga' }
    )
    const genre = await Genre.create({
      name: 'Ev Türü Şık',
      slug: 'ev-turu-sik',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    created.genres.push(genre.id)

    const make = async (slug: string, status: string, featured: boolean) => {
      const series = await Series.create({
        title: `Ana Sayfa ${slug}`,
        slug,
        description: 'Ana sayfa testi',
        contentTypeId: type.id,
        status,
        translationStatus: 'Aktif',
        publicationYear: 2026,
        alternativeTitles: [],
        coverImage: '/images/no-cover.svg',
        featured,
        featuredDescription: featured ? 'Öne çıkan açıklama' : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      await series.related('genres').attach([genre.id])
      created.series.push(series.id)
      return series
    }
    const ongoing = await make('ev-devam', 'Devam Ediyor', true)
    const done = await make('ev-bitti', 'Tamamlandı', true)

    const chapters: Chapter[] = []
    for (let number = 1; number <= 4; number++)
      chapters.push(
        await Chapter.create({
          seriesId: ongoing.id,
          number,
          title: number === 4 ? 'Taze Bölüm' : null,
          content: { type: 'images', pages: ['/images/no-cover.svg'] },
          publishedAt: daysAgo(number === 4 ? 0 : 20).slice(0, 10),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      )

    const user = (username: string, extra: Partial<User> = {}) =>
      User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role: 'member',
        ...extra,
      })
    const admin = await user('ev_yonetici', { role: 'admin' })
    const reader = await user('ev_okur')
    const banned = await user('ev_yasakli', { bannedAt: timestamp })
    const old = await user('ev_eski_okur')
    created.users.push(admin.id, reader.id, banned.id, old.id)

    // Recent reads count; reads older than 30 days and suspended accounts do not.
    const reads = (who: User, days: number) =>
      db.table('chapter_reads').multiInsert(
        chapters.map((chapter) => ({
          user_id: who.id,
          series_id: ongoing.id,
          chapter_id: chapter.id,
          read_at: daysAgo(days),
        }))
      )
    await reads(reader, 2)
    await reads(banned, 1)
    await reads(old, 45)

    const root = await Comment.create({
      userId: admin.id,
      seriesId: done.id,
      chapterId: null,
      parentId: null,
      rootId: null,
      depth: 0,
      body: 'Ana sayfa kök yorumu',
      spoiler: false,
      likeCount: 0,
      dislikeCount: 0,
      replyCount: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await Comment.create({
      userId: reader.id,
      seriesId: done.id,
      chapterId: null,
      parentId: root.id,
      rootId: root.id,
      depth: 1,
      body: 'Ana sayfa yanıtı',
      spoiler: false,
      likeCount: 0,
      dislikeCount: 0,
      replyCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await SeriesReview.create({
      userId: reader.id,
      seriesId: done.id,
      rating: 9,
      title: 'Ana sayfa incelemesi',
      body: 'Baştan sona çok keyifli bir seri.',
      spoiler: false,
      helpfulCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.from('series').where('id', done.id).update({ rating_avg: 9, rating_count: 1 })
  })

  group.teardown(async () => {
    await settings.save(Object.fromEntries(flags.map((flag) => [flagKey(flag.key), ''])))
    await db.from('series').whereIn('id', created.series).delete()
    await db.from('genres').whereIn('id', created.genres).delete()
    await db.from('users').whereIn('id', created.users).delete()
  })

  test('the first page shows every section with its data', async ({ assert }) => {
    const html = await textOf(client().request('/'))
    for (const text of Object.values(sections)) assert.include(html, text)
    for (const text of ['Son Yorumlar', 'kişisine yanıt', 'Ana sayfa incelemesi', '★'])
      assert.include(html, text)
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1)
    assert.notInclude(html, '@!component')

    // Carousel contract: slides, titles and the next button.
    // Other specs may leave featured series behind, so count at least this spec's two.
    const slides = Number(html.match(/x-data="heroSlider\((\d+)\)"/)?.[1] ?? 0)
    assert.isAtLeast(slides, 2)
    assert.lengthOf(html.match(/data-hero-slide/g) ?? [], slides)
    assert.include(html, 'data-hero-title')
    assert.include(html, 'data-hero-next')

    // Latest chapters with the "Yeni" label for a chapter published today.
    assert.include(html, 'href="/series/manga/ev-devam/4"')
    assert.include(html, 'Taze Bölüm')
    assert.include(html, '>Yeni</span>')

    // Genre chips open the filtered catalog; the completed shelf links to its filter.
    assert.include(html, `href="/seriler?genre=${encodeURIComponent('Ev Türü Şık')}"`)
    assert.include(html, `href="/seriler?status=${encodeURIComponent('Tamamlandı')}"`)
    assert.include(html, 'href="/series/manga/ev-bitti"')

    // Readers of the month: recent reads only, suspended accounts left out.
    const readers = html.slice(html.indexOf('Ayın Okurları'))
    assert.include(readers, 'href="/uye/ev_okur"')
    assert.include(readers, '4 bölüm')
    assert.notInclude(readers, '/uye/ev_yasakli')
    assert.notInclude(readers, '/uye/ev_eski_okur')
  })

  test('page 2 of the updates list is still the full home page', async ({ assert }) => {
    const html = await textOf(client().request('/?page=2'))
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1)
    for (const text of Object.values(sections)) assert.include(html, text)
    assert.include(html, 'id="home-updates"')
  })

  test('the updates list pages load in place as a fragment', async ({ assert }) => {
    const full = await client().request('/?page=2')
    assert.include(full.headers.get('vary') || '', 'X-Fragment')

    const response = await client().request('/?page=2', {
      headers: { 'x-fragment': 'home-updates' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const html = await response.text()
    assert.include(html, 'data-updates-content')
    assert.include(html, 'data-updates-skeleton')
    assert.include(html, 'Son Güncellenenler')
    assert.notInclude(html, '<html')
    assert.notInclude(html, '<h1')
    assert.notInclude(html, sections.home_popular)
    // Page links keep pointing at the section, without the fragment header leaking into them.
    assert.notMatch(html, /href="[^"]*fragment/i)
  })

  test('each Göster/Gizle switch removes its section', async ({ assert }) => {
    const admin = client()
    await admin.post('/giris', { login: 'ev_yonetici', password }, '/giris')
    const everything = Object.fromEntries(flags.map((flag) => [`f_${flag.key}`, 'on']))

    for (const [key, text] of Object.entries(sections)) {
      const saved = await admin.post(
        '/admin/tema/goster',
        { ...everything, [`f_${key}`]: '' },
        '/admin/tema/goster'
      )
      assert.equal(saved.status, 302)
      const html = await textOf(admin.request('/'))
      assert.notInclude(html, text, key)
      assert.equal(html.match(/<h1[\s>]/g)?.length, 1, key)
      for (const [other, otherText] of Object.entries(sections))
        if (other !== key) assert.include(html, otherText, `${key} → ${other}`)
    }

    await admin.post('/admin/tema/goster', everything, '/admin/tema/goster')
    const restored = await textOf(admin.request('/'))
    for (const text of Object.values(sections)) assert.include(restored, text)
  }).timeout(60000)
})
