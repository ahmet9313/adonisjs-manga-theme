import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import service from '#services/series_service'
import { now } from '#services/input_service'
import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'

const base = 'http://127.0.0.1:3334'
const timedFetch = (url: string, options: RequestInit = {}) =>
  fetch(url, { ...options, signal: AbortSignal.timeout(10000) })
const statusOf = async (response: Promise<Response>) => {
  const result = await response
  return result.status
}
const password = 'test-password-only-123'
let series: Series
let contentType: ContentType

test.group('Catalog and administration', (group) => {
  group.setup(async () => {
    contentType = await ContentType.create({ name: 'Manga', slug: 'manga' })
    const timestamp = now()
    for (let i = 0; i < 3; i++) {
      const item = await Series.create({
        title: `Reader's Test ${i}`,
        slug: `test-${i}`,
        description: 'Test',
        contentTypeId: contentType.id,
        status: 'Devam Ediyor',
        translationStatus: 'Aktif',
        publicationYear: 2026,
        alternativeTitles: ['Alternative title'],
        coverImage: '/images/no-cover.svg',
        featured: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      for (let number = 1; number <= 5; number++)
        await Chapter.create({
          seriesId: item.id,
          number,
          title: '</script><script>bad()</script>',
          content: { type: 'images', pages: ['/images/no-cover.svg'] },
          publishedAt: '2026-09-10',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      series = item
    }
    await User.create({ email: 'test@example.com', fullName: 'Test Admin', password })
  })

  test('pagination and aggregates return only the requested page with the correct chapters', async ({
    assert,
  }) => {
    const first = await service.getRecentlyUpdated(1, 2)
    const second = await service.getRecentlyUpdated(2, 2)
    assert.lengthOf(first.items, 2)
    assert.lengthOf(second.items, 1)
    assert.isTrue(first.hasNextPage)
    assert.isFalse(second.hasNextPage)
    assert.deepEqual(
      first.items[0].latestChapters.map((chapter) => chapter.number),
      [5, 4, 3]
    )
    assert.notInclude(
      first.items.map((item) => item.slug),
      second.items[0].slug
    )
    const filtered = await service.filterSeries({ types: ['manga'], search: 'Alternative' }, 1, 2)
    assert.equal(filtered.totalResults, 3)
    assert.equal(filtered.items[0].chapterCount, 5)
    assert.equal(filtered.items[0].lastChapter, 5)
    const search = await service.searchSeries('Alternative')
    assert.lengthOf(search, 3)
  })

  test('public routes handle malformed input and escape chapter data', async ({ assert }) => {
    for (const path of [
      '/',
      '/?page=-1',
      '/seriler',
      '/seriler?page=abc&genre[x]=a&search[x]=b',
      '/ara?q[x]=bad',
      '/kaydedilenler',
      `/series/manga/${series.slug}`,
      `/series/manga/${series.slug}/1`,
    ]) {
      const response = await timedFetch(base + path)
      const html = await response.text()
      assert.equal(response.status, 200, `${path}: ${html.slice(0, 200)}`)
      assert.notInclude(html, '</script><script>bad()</script>')
    }
    assert.equal(await statusOf(timedFetch(base + `/series/manga/${series.slug}/NaN`)), 404)
    const protectedPage = await timedFetch(base + '/admin', { redirect: 'manual' })
    assert.equal(protectedPage.status, 302)
    assert.equal(protectedPage.headers.get('location'), '/admin/giris')
    assert.equal(
      await statusOf(
        timedFetch(base + '/admin/seriler/ekle', {
          method: 'POST',
          redirect: 'manual',
          headers: { accept: 'application/json' },
        })
      ),
      302
    )
  })

  test('admin forms, validation and transactional relation writes', async ({ assert }) => {
    const cookies = new Map<string, string>()
    const request = async (path: string, options: RequestInit = {}) => {
      const response = await timedFetch(base + path, {
        ...options,
        redirect: 'manual',
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
    const token = async (path: string) => {
      const response = await request(path)
      assert.equal(response.status, 200, path)
      const html = await response.text()
      return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
    }
    const csrf = await token('/admin/giris')
    assert.isNotEmpty(csrf)
    const login = await request('/admin/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf, email: 'test@example.com', password }),
    })
    assert.equal(login.headers.get('location'), '/admin')
    for (const path of [
      '/admin',
      '/admin/seriler',
      `/admin/seriler/${series.id}/duzenle`,
      '/admin/bolumler',
      '/admin/bolumler/ekle',
      '/admin/turler',
      '/admin/yazarlar',
      '/admin/cizerler',
      '/admin/icerik-turleri',
      '/admin/profil',
    ]) {
      assert.equal(await statusOf(request(path)), 200, path)
    }
    const payload = {
      _csrf: await token('/admin/seriler/ekle'),
      title: 'Çılgın Şövalye',
      description: 'Test',
      content_type_id: String(contentType.id),
      status: 'Devam Ediyor',
      translation_status: 'Aktif',
      publication_year: '2026',
    }
    const invalid = await request('/admin/seriler/ekle', {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: new URLSearchParams({ ...payload, 'genres[]': '999999' }),
    })
    assert.equal(invalid.status, 422)
    assert.isNull(await Series.findBy('title', payload.title))
    const saved = await request('/admin/seriler/ekle', {
      method: 'POST',
      body: new URLSearchParams(payload),
    })
    assert.equal(saved.status, 302)
    const created = await Series.findByOrFail('title', payload.title)
    assert.equal(created.slug, 'cilgin-sovalye')
    assert.equal(created.coverImage, '/images/no-cover.svg')
    const editPayload = {
      ...payload,
      _csrf: await token(`/admin/seriler/${created.id}/duzenle`),
      title: 'Yeni Başlık',
    }
    assert.equal(
      await statusOf(
        request(`/admin/seriler/${created.id}/duzenle`, {
          method: 'POST',
          body: new URLSearchParams(editPayload),
        })
      ),
      302
    )
    await created.refresh()
    assert.equal(created.slug, 'cilgin-sovalye')
    assert.equal(created.title, 'Yeni Başlık')
    const invalidChapter = await request('/admin/bolumler/ekle', {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: new URLSearchParams({
        _csrf: await token('/admin/bolumler/ekle'),
        series_id: String(created.id),
        number: '1',
        page_order: '{',
      }),
    })
    assert.equal(invalidChapter.status, 422)
    assert.isNull(await Chapter.query().where('seriesId', created.id).first())

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=',
      'base64'
    )
    const upload = async (path: string, order: string[]) => {
      const form = new FormData()
      form.set('_csrf', await token(path))
      form.set('series_id', String(created.id))
      form.set('number', '1')
      form.set('page_order', JSON.stringify(order))
      form.append('pages', new Blob([png], { type: 'image/png' }), 'page.png')
      return request(path, { method: 'POST', body: form })
    }
    assert.equal(await statusOf(upload('/admin/bolumler/ekle', ['__new__'])), 302)
    const uploaded = await Chapter.query().where('seriesId', created.id).firstOrFail()
    assert.equal(uploaded.content.type, 'images')
    if (uploaded.content.type !== 'images') throw new Error('Expected image chapter')
    const original = uploaded.content.pages[0]
    const originalBytes = await readFile(app.tmpPath('test-uploads' + original))
    assert.deepEqual(originalBytes, png)
    const servedImage = await timedFetch(base + original)
    assert.equal(servedImage.status, 200)
    assert.deepEqual(Buffer.from(await servedImage.arrayBuffer()), png)
    assert.equal(await statusOf(timedFetch(base + '/content/invalid.txt')), 404)
    assert.equal(
      await statusOf(upload(`/admin/bolumler/${uploaded.id}/duzenle`, ['__new__', original])),
      302
    )
    await uploaded.refresh()
    if (uploaded.content.type !== 'images') throw new Error('Expected image chapter')
    assert.lengthOf(uploaded.content.pages, 2)
    assert.notEqual(uploaded.content.pages[0], original)
    assert.equal(uploaded.content.pages[1], original)
    assert.deepEqual(await readFile(app.tmpPath('test-uploads' + original)), originalBytes)
  })

  test('database enforces foreign keys and rolls back incomplete writes', async ({ assert }) => {
    const foreignKeys = await db.rawQuery('PRAGMA foreign_keys')
    assert.equal(foreignKeys[0].foreign_keys, 1)
    try {
      await db.transaction(async (trx) => {
        await trx.from('series').where('id', series.id).update({ title: 'Should rollback' })
        await trx.table('series_genres').insert({ series_id: series.id, genre_id: 99999 })
      })
      assert.fail('Invalid foreign key was accepted')
    } catch (error) {
      assert.include(String(error), 'FOREIGN KEY')
    }
    await series.refresh()
    assert.notEqual(series.title, 'Should rollback')
  })
})
