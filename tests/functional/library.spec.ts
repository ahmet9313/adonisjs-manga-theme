import { test } from '@japa/runner'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import User from '#models/user'
import Bookmark from '#models/bookmark'
import ChapterRead from '#models/chapter_read'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'library-pass-123'

const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}
const jsonOf = async (response: Promise<Response>) => {
  const result = await response
  return result.json()
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
  const csrf = async () => {
    const html = await textOf(request('/giris'))
    return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  }
  const login = async (identifier: string) =>
    request('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await csrf(), login: identifier, password }),
    })
  const json = async (path: string, body: unknown) => {
    const html = await textOf(request('/'))
    const token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
    return request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'x-csrf-token': token,
      },
      body: JSON.stringify(body),
    })
  }
  return { request, login, json }
}

let series: Series
let reader: User

test.group('Library: bookmarks, reading progress and metadata links', (group) => {
  group.setup(async () => {
    clearAttempts()
    const timestamp = now()
    const type = await ContentType.create({ name: 'Manhwa', slug: 'manhwa' })
    series = await Series.create({
      title: 'Kütüphane Testi',
      slug: 'kutuphane-testi',
      description: 'Test',
      contentTypeId: type.id,
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2024,
      alternativeTitles: [],
      coverImage: '/images/no-cover.svg',
      featured: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const other = await Series.create({
      title: 'Başka Seri',
      slug: 'baska-seri',
      description: 'Test',
      contentTypeId: type.id,
      status: 'Tamamlandı',
      translationStatus: 'Aktif',
      publicationYear: 2020,
      alternativeTitles: [],
      coverImage: '/images/no-cover.svg',
      featured: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const genre = await Genre.create({
      name: 'Gizem',
      slug: 'gizem',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const author = await Author.create({
      name: 'Yazar Bir',
      slug: 'yazar-bir',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const artist = await Artist.create({
      name: 'Çizer Bir',
      slug: 'cizer-bir',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await series.related('genres').attach([genre.id])
    await series.related('authors').attach([author.id])
    await series.related('artists').attach([artist.id])
    for (let number = 1; number <= 4; number++)
      await Chapter.create({
        seriesId: series.id,
        number,
        title: null,
        content: { type: 'images', pages: ['/images/no-cover.svg'] },
        publishedAt: '2026-10-01',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    await Chapter.create({
      seriesId: other.id,
      number: 1,
      title: null,
      content: { type: 'images', pages: ['/images/no-cover.svg'] },
      publishedAt: '2026-10-01',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    reader = await User.create({
      username: 'okur',
      email: 'okur@example.com',
      fullName: 'Okur',
      password,
      role: 'member',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })

  test('series page links genres, authors and artists without repeating header data', async ({
    assert,
  }) => {
    const html = await textOf(fetch(`${base}/series/manhwa/kutuphane-testi`))
    assert.include(html, 'href="/seriler?genre=Gizem"')
    assert.include(html, 'href="/seriler?author=yazar-bir"')
    assert.include(html, 'href="/seriler?artist=cizer-bir"')
    assert.include(html, 'href="/seriler?type=manhwa"')
    assert.notInclude(html, 'Tür(ler)')
    assert.notInclude(html, 'Yaş Sınırı')
    assert.notInclude(html, '>Yayınlanma<')
    assert.equal(html.split('/seriler?author=yazar-bir').length - 1, 1)

    const byAuthor = await textOf(fetch(`${base}/seriler?author=yazar-bir`))
    assert.include(byAuthor, '1 seri bulundu')
    assert.include(byAuthor, 'Yazar:</span> Yazar Bir')
    const byArtist = await textOf(fetch(`${base}/seriler?artist=cizer-bir&type=manhwa`))
    assert.include(byArtist, '1 seri bulundu')
    assert.include(byArtist, 'href="/seriler?type=manhwa"')
    assert.include(await textOf(fetch(`${base}/seriler?author=yok-boyle`)), '0 seri bulundu')
  })

  test('signed-in readers get account bookmarks, read marks and continue reading', async ({
    assert,
  }) => {
    const web = client()
    await web.login('okur')

    for (const number of [1, 3, 2]) {
      const response = await web.request(`/series/manhwa/kutuphane-testi/${number}`)
      assert.equal(response.status, 200)
    }
    await web.request('/series/manhwa/kutuphane-testi/2')
    assert.equal(
      await ChapterRead.query()
        .where('userId', reader.id)
        .count('* as total')
        .first()
        .then((row) => Number(row!.$extras.total)),
      3
    )

    const saved = await jsonOf(
      web.json('/kutuphane/kaydet', { type: 'manhwa', slug: 'kutuphane-testi' })
    )
    assert.deepEqual(saved, { saved: true })
    assert.isNotNull(
      await Bookmark.query().where({ userId: reader.id, seriesId: series.id }).first()
    )

    const page = await textOf(web.request('/series/manhwa/kutuphane-testi'))
    assert.include(page, 'data-saved="true"')
    assert.match(page, /&quot;last&quot;:2/)
    assert.match(page, /&quot;read&quot;:\[2,3,1\]/)

    const library = await textOf(web.request('/kaydedilenler'))
    assert.include(library, 'data-items=')
    assert.match(library, /&quot;lastRead&quot;:2,&quot;latestChapter&quot;:4/)

    const removed = await jsonOf(
      web.json('/kutuphane/kaldir', { type: 'manhwa', slug: 'kutuphane-testi' })
    )
    assert.deepEqual(removed, { saved: false })
    assert.isNull(await Bookmark.query().where({ userId: reader.id, seriesId: series.id }).first())
    const missing = await web.json('/kutuphane/kaydet', { type: 'manhwa', slug: 'yok' })
    assert.equal(missing.status, 404)
  })

  test('guest library is imported into the account without overriding newer reads', async ({
    assert,
  }) => {
    const web = client()
    await web.login('okur')
    const result = await jsonOf(
      web.json('/kutuphane/aktar', {
        bookmarks: [
          { type: 'manhwa', slug: 'kutuphane-testi' },
          { type: 'manhwa', slug: 'baska-seri' },
          { type: 'manhwa', slug: 'olmayan' },
        ],
        reads: [
          { type: 'manhwa', slug: 'kutuphane-testi', chapters: [4, 1] },
          { type: 'manhwa', slug: 'baska-seri', chapters: [1, 99] },
        ],
      })
    )
    assert.deepEqual(result, { bookmarks: 2, reads: 2 })
    const page = await textOf(web.request('/series/manhwa/kutuphane-testi'))
    // Chapter 2 was read on the account last, the imported chapter 4 must not replace it.
    assert.match(page, /&quot;last&quot;:2/)
    assert.match(page, /&quot;read&quot;:\[2,3,1,4\]/)
    const again = await jsonOf(
      web.json('/kutuphane/aktar', {
        bookmarks: [{ type: 'manhwa', slug: 'baska-seri' }],
        reads: [],
      })
    )
    assert.deepEqual(again, { bookmarks: 0, reads: 0 })
  })

  test('guests keep the local library and cannot call account endpoints', async ({ assert }) => {
    const html = await textOf(fetch(`${base}/kaydedilenler`))
    assert.notInclude(html, 'data-items=')
    assert.include(html, 'data-account="0"')
    const response = await fetch(`${base}/kutuphane/kaydet`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ type: 'manhwa', slug: 'kutuphane-testi' }),
    })
    assert.include([302, 401, 403], response.status)
    assert.equal(
      await Bookmark.query()
        .where('seriesId', series.id)
        .count('* as total')
        .first()
        .then((row) => Number(row!.$extras.total)),
      1
    )
  })
})
