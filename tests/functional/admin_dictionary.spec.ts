import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import ContentType from '#models/content_type'
import Series from '#models/series'
import { now } from '#services/input_service'

const base = 'http://127.0.0.1:3334'
const password = 'dictionary-pass-123'

const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}

/** Minimal cookie-aware client with CSRF handling (same as accounts.spec.ts). */
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
  const token = async (path: string) => {
    const html = await textOf(request(path))
    return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  }
  const post = async (path: string, fields: Record<string, string>, from = path) =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  return { request, token, post }
}

/** The four dictionaries share pages/admin/dictionary/{index,form}.edge. */
const dictionaries = [
  { label: 'Türler', base: '/admin/turler', model: Genre, name: 'Deneme Türü' },
  { label: 'Yazarlar', base: '/admin/yazarlar', model: Author, name: 'Deneme Yazarı' },
  { label: 'Çizerler', base: '/admin/cizerler', model: Artist, name: 'Deneme Çizeri' },
  {
    label: 'İçerik Türleri',
    base: '/admin/icerik-turleri',
    model: ContentType,
    name: 'Deneme Biçimi',
  },
] as const

test.group('Admin dictionaries (genres, authors, artists, content types)', (group) => {
  group.setup(async () => {
    await User.create({
      username: 'sozlukcu',
      email: 'sozluk@example.com',
      fullName: 'Sözlük Yöneticisi',
      password,
      role: 'admin',
    })
  })

  for (const dictionary of dictionaries) {
    test(`${dictionary.label}: list, quick add, duplicate keeps the input, edit, delete`, async ({
      assert,
    }) => {
      const admin = client()
      await admin.post('/giris', { login: 'sozlukcu', password })

      const empty = await textOf(admin.request(dictionary.base))
      assert.include(empty, `<h1 class="page-head__title">${dictionary.label}</h1>`)
      assert.include(empty, `action="${dictionary.base}/ekle"`)
      assert.notInclude(empty, '@!component')

      // Quick add on the list posts `name` to <base>/ekle, like the full form.
      const created = await admin.post(
        `${dictionary.base}/ekle`,
        { name: dictionary.name },
        dictionary.base
      )
      assert.equal(created.status, 302)
      assert.equal(created.headers.get('location'), dictionary.base)
      const record = await dictionary.model.findByOrFail('name', dictionary.name)

      const list = await textOf(admin.request(dictionary.base))
      assert.include(list, `href="${dictionary.base}/${record.id}/duzenle"`)
      assert.include(list, dictionary.name)
      assert.include(list, record.slug)

      // Read-only search filter (?q=) and its empty state.
      assert.include(await textOf(admin.request(`${dictionary.base}?q=Deneme`)), dictionary.name)
      const missing = await textOf(admin.request(`${dictionary.base}?q=hic-yok-xyz`))
      assert.notInclude(missing, `${dictionary.base}/${record.id}/duzenle`)
      assert.include(missing, 'ile eşleşen kayıt yok')
      assert.match(
        await textOf(admin.request(`${dictionary.base}?per_page=10`)),
        /<option value="10" selected>10<\/option>/
      )

      // A duplicate name returns to the form with the typed name and an inline error.
      const duplicate = await admin.post(
        `${dictionary.base}/ekle`,
        { name: dictionary.name },
        dictionary.base
      )
      assert.equal(duplicate.headers.get('location'), `${dictionary.base}/ekle`)
      const form = await textOf(admin.request(`${dictionary.base}/ekle`))
      assert.include(form, `value="${dictionary.name}"`)
      assert.include(form, 'zaten mevcut. Başka bir ad deneyin.')
      assert.include(form, 'aria-invalid="true"')
      assert.lengthOf(await dictionary.model.query().where('name', dictionary.name), 1)

      // Edit shows the name and the address; a rename is saved.
      const editPage = await textOf(admin.request(`${dictionary.base}/${record.id}/duzenle`))
      assert.include(editPage, `value="${dictionary.name}"`)
      assert.include(editPage, record.slug)
      assert.include(editPage, 'henüz hiçbir seride kullanılmıyor')
      const renamed = `${dictionary.name} 2`
      const edited = await admin.post(`${dictionary.base}/${record.id}/duzenle`, { name: renamed })
      assert.equal(edited.headers.get('location'), dictionary.base)
      await record.refresh()
      assert.equal(record.name, renamed)

      // An unused record is deleted after confirming (data-confirm tells what happens).
      assert.include(await textOf(admin.request(dictionary.base)), `data-confirm="“${renamed}” `)
      const removed = await admin.post(`${dictionary.base}/${record.id}/sil`, {}, dictionary.base)
      assert.equal(removed.headers.get('location'), dictionary.base)
      assert.isNull(await dictionary.model.find(record.id))
    })
  }

  test('a content type that series use cannot be deleted; a used genre is detached', async ({
    assert,
  }) => {
    const timestamp = now()
    const type = await ContentType.create({
      name: 'Kullanılan Biçim',
      slug: 'kullanilan-bicim',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const genre = await Genre.create({
      name: 'Kullanılan Tür',
      slug: 'kullanilan-tur',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const series = await Series.create({
      title: 'Sözlük Serisi',
      slug: 'sozluk-serisi',
      description: 'Test',
      contentTypeId: type.id,
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2026,
      alternativeTitles: [],
      coverImage: '/images/no-cover.svg',
      featured: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await series.related('genres').attach([genre.id])

    const admin = client()
    await admin.post('/giris', { login: 'sozlukcu', password })

    // The list counts the series, links to the catalogue and disables the delete button.
    const types = await textOf(admin.request('/admin/icerik-turleri'))
    assert.include(types, 'href="/seriler?type=kullanilan-bicim"')
    assert.notInclude(types, `action="/admin/icerik-turleri/${type.id}/sil"`)
    assert.include(types, 'Bu türü 1 seri kullanıyor')
    const typeForm = await textOf(admin.request(`/admin/icerik-turleri/${type.id}/duzenle`))
    assert.include(typeForm, '1 seride kullanılıyor')
    assert.notInclude(typeForm, `action="/admin/icerik-turleri/${type.id}/sil"`)

    // Posting the delete anyway is refused by the database and reported.
    const attempt = await admin.post(
      `/admin/icerik-turleri/${type.id}/sil`,
      {},
      '/admin/icerik-turleri'
    )
    assert.equal(attempt.headers.get('location'), '/admin/icerik-turleri')
    assert.isNotNull(await ContentType.find(type.id))
    assert.include(
      await textOf(admin.request('/admin/icerik-turleri')),
      'serilere bağlı olduğu için silinemez'
    )

    // A genre in use: the confirmation says it is removed from the series, which stay.
    const genres = await textOf(admin.request('/admin/turler'))
    assert.include(genres, 'href="/seriler?genre=Kullan%C4%B1lan%20T%C3%BCr"')
    assert.include(genres, '“Kullanılan Tür” türü silinecek ve 1 seriden kaldırılacak.')
    await admin.post(`/admin/turler/${genre.id}/sil`, {}, '/admin/turler')
    assert.isNull(await Genre.find(genre.id))
    assert.isNotNull(await Series.find(series.id))
    assert.lengthOf(await db.from('series_genres').where('series_id', series.id), 0)

    // Leave the shared test database as it was (other specs count series).
    await series.delete()
    await type.delete()
  })

  test('content types: format is chosen or suggested, locked while used, drives chapters', async ({
    assert,
  }) => {
    const admin = client()
    await admin.post('/giris', { login: 'sozlukcu', password })

    // The list and the form offer the three formats; anime is video, novel is text (0020).
    const list = await textOf(admin.request('/admin/icerik-turleri'))
    assert.include(list, 'name="format"')
    assert.include(list, '<option value="video"')
    const anime = await ContentType.findByOrFail('slug', 'anime')
    assert.equal(anime.format, 'video')
    const form = await textOf(admin.request('/admin/icerik-turleri/ekle'))
    for (const label of ['Görsel', 'Metin', 'Video'])
      assert.include(form, `<span class="ac-choice__label">${label}</span>`)
    assert.match(form, /value="image"[^>]*checked/)

    // Chosen explicitly, suggested from the name without a choice, or refused when unknown.
    await admin.post('/admin/icerik-turleri/ekle', { name: 'Hikâye', format: 'text' })
    await admin.post('/admin/icerik-turleri/ekle', { name: 'Light Novel' }, '/admin/icerik-turleri')
    await admin.post('/admin/icerik-turleri/ekle', { name: 'Donghua' }, '/admin/icerik-turleri')
    await admin.post('/admin/icerik-turleri/ekle', { name: 'Çizgi Roman' }, '/admin/icerik-turleri')
    await admin.post('/admin/icerik-turleri/ekle', { name: 'Bozuk', format: 'audio' })
    const story = await ContentType.findByOrFail('slug', 'hikaye')
    assert.equal(story.format, 'text')
    const suggested = await ContentType.query()
      .whereIn('slug', ['light-novel', 'donghua', 'cizgi-roman'])
      .orderBy('slug')
    assert.deepEqual(
      suggested.map((type) => [type.slug, type.format]),
      [
        ['cizgi-roman', 'image'],
        ['donghua', 'video'],
        ['light-novel', 'text'],
      ]
    )
    assert.isNull(await ContentType.findBy('slug', 'bozuk'))

    // An unused type can switch format; the list shows it.
    const edited = await admin.post(`/admin/icerik-turleri/${story.id}/duzenle`, {
      name: 'Hikâye',
      format: 'image',
    })
    assert.equal(edited.headers.get('location'), '/admin/icerik-turleri')
    await story.refresh()
    assert.equal(story.format, 'image')
    await admin.post(`/admin/icerik-turleri/${story.id}/duzenle`, {
      name: 'Hikâye',
      format: 'text',
    })
    await story.refresh()
    assert.equal(story.format, 'text')

    // The format, not the slug, picks the chapter body: a text type without "novel" in it.
    const timestamp = now()
    const series = await Series.create({
      title: 'Biçim Serisi',
      slug: 'bicim-serisi',
      description: 'Test',
      contentTypeId: story.id,
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2026,
      alternativeTitles: [],
      coverImage: '/images/no-cover.svg',
      featured: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const chapterForm = await textOf(admin.request(`/admin/bolumler/ekle?series_id=${series.id}`))
    assert.include(chapterForm, `&quot;${series.id}&quot;:&quot;text&quot;`)
    const saved = await admin.post(
      '/admin/bolumler/ekle',
      { series_id: String(series.id), number: '1', text_content: 'Bir varmış bir yokmuş.' },
      `/admin/bolumler/ekle?series_id=${series.id}`
    )
    assert.equal(saved.status, 302)
    const chapter = await db.from('chapters').where('series_id', series.id).firstOrFail()
    assert.equal(JSON.parse(chapter.content).type, 'text')
    const page = await textOf(admin.request('/series/hikaye/bicim-serisi/1'))
    assert.include(page, 'Bir varmış bir yokmuş.')

    // Used now: the radios are disabled and a posted change is refused; renaming still works.
    const lockedForm = await textOf(admin.request(`/admin/icerik-turleri/${story.id}/duzenle`))
    assert.include(lockedForm, 'biçim değiştirilemez')
    assert.match(lockedForm, /value="video"[^>]*disabled/)
    const refused = await admin.post(`/admin/icerik-turleri/${story.id}/duzenle`, {
      name: 'Hikâye',
      format: 'video',
    })
    assert.equal(refused.status, 302)
    await story.refresh()
    assert.equal(story.format, 'text')
    await admin.post(`/admin/icerik-turleri/${story.id}/duzenle`, { name: 'Hikâyeler' })
    await story.refresh()
    assert.equal(story.name, 'Hikâyeler')
    assert.equal(story.format, 'text')

    await db.from('chapters').where('series_id', series.id).delete()
    await series.delete()
    await ContentType.query()
      .whereIn('slug', ['hikaye', 'light-novel', 'donghua', 'cizgi-roman'])
      .delete()
  })
})
