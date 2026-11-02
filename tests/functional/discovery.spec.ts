import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import Genre from '#models/genre'
import Author from '#models/author'
import User from '#models/user'
import { now } from '#services/input_service'
import { foldSearch, refreshSearchText, searchWords } from '#services/search_index_service'
import { alphabet, compareTitles, initialOf, letterParam } from '#services/discovery_service'

const base = 'http://127.0.0.1:3334'
const password = 'test-password-only-123'
const get = (path: string, init: RequestInit = {}) =>
  fetch(base + path, { redirect: 'manual', ...init, signal: AbortSignal.timeout(30000) })
const html = (path: string) => get(path).then((response) => response.text())
const suggest = (q: string) =>
  get('/ara?q=' + encodeURIComponent(q)).then((response) => response.json() as Promise<any[]>)
const suggestedSlugs = (q: string) =>
  suggest(q).then((items) => items.map((item) => item.slug as string))
/** Slugs of the `kesif` series linked from a page, in order, without repeats. */
const slugsOf = (page: string) => [
  ...new Set([...page.matchAll(/href="\/series\/kesif\/([\w-]+)"/g)].map((match) => match[1])),
]

let kesif: ContentType
const genre: Record<string, Genre> = {}

async function makeSeries(
  title: string,
  slug: string,
  options: {
    genres?: string[]
    year?: number
    chapters?: number
    draftChapters?: number
    draft?: boolean
    alternativeTitles?: string[]
    type?: ContentType
  } = {}
) {
  const timestamp = now()
  const series = await Series.create({
    title,
    slug,
    description: 'Keşif testi',
    contentTypeId: (options.type || kesif).id,
    status: 'Devam Ediyor',
    translationStatus: 'Aktif',
    publicationYear: options.year ?? 2020,
    alternativeTitles: options.alternativeTitles || [],
    coverImage: '/images/no-cover.svg',
    featured: false,
    draft: options.draft ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await series.related('genres').sync((options.genres || []).map((name) => genre[name].id))
  const chapters = options.chapters ?? 1
  for (let number = 1; number <= chapters + (options.draftChapters || 0); number++)
    await Chapter.create({
      seriesId: series.id,
      number,
      title: null,
      content: { type: 'images', pages: ['/images/no-cover.svg'] },
      publishedAt: '2026-09-10',
      draft: number > chapters,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  return series
}

test.group('Discovery: filters, A–Z, random and search', (group) => {
  group.setup(async () => {
    kesif = await ContentType.create({ name: 'Keşif', slug: 'kesif' })
    for (const name of ['Kşf Aksiyon', 'Kşf Dram', 'Kşf Komedi'])
      genre[name] = await Genre.create({
        name,
        slug: foldSearch(name).replace(/ /g, '-'),
        createdAt: now(),
        updatedAt: now(),
      })
    await makeSeries('Şeytan Avcısı Keşif', 'seytan-avcisi-kesif', {
      genres: ['Kşf Aksiyon', 'Kşf Dram'],
      year: 2019,
      chapters: 3,
      alternativeTitles: ['Kimetsu no Yaiba Keşif'],
    })
    await makeSeries('Solo Leveling: Keşif Ragnarok', 'solo-leveling-kesif', {
      genres: ['Kşf Aksiyon'],
      year: 2024,
      chapters: 1,
      draftChapters: 2,
    })
    await makeSeries('Işık Keşif', 'isik-kesif', {
      genres: ['Kşf Dram', 'Kşf Komedi'],
      year: 2010,
      chapters: 5,
    })
    await makeSeries('İz Keşif', 'iz-kesif', { genres: ['Kşf Komedi'], year: 2015 })
    await makeSeries('Çağ Keşif Taslak', 'cag-kesif-taslak', {
      genres: ['Kşf Aksiyon', 'Kşf Komedi'],
      year: 2015,
      chapters: 9,
      draft: true,
    })
    await makeSeries('3 Keşif Gün', 'uc-kesif-gun', { year: 2001 })
    await makeSeries('élan keşif', 'elan-kesif', { year: 2002 })
  })

  test('folding ignores Turkish letters, case, accents and punctuation', ({ assert }) => {
    assert.equal(foldSearch('ŞEYTAN Avcısı'), 'seytan avcisi')
    assert.equal(foldSearch('İSTANBUL ışığı'), 'istanbul isigi')
    assert.equal(
      foldSearch("Solo Leveling: Ragnarok — Journey's End"),
      'solo leveling ragnarok journeys end'
    )
    assert.equal(foldSearch('Pokémon Çağı'), 'pokemon cagi')
    // Kana keep their voicing marks (ピ is not ヒ).
    assert.equal(foldSearch('ワンピース'), 'ワンピース')
    assert.deepEqual(searchWords('  solo-LEVELING solo '), ['solo', 'leveling'])
  })

  test('A–Z letters and order follow the Turkish alphabet', ({ assert }) => {
    assert.equal(initialOf('Çağ'), 'Ç')
    assert.equal(initialOf('Işık'), 'I')
    assert.equal(initialOf('İz'), 'İ')
    assert.equal(initialOf('iz'), 'İ')
    assert.equal(initialOf('Ölü'), 'Ö')
    assert.equal(initialOf('şeker'), 'Ş')
    assert.equal(initialOf('Üç'), 'Ü')
    assert.equal(initialOf('Ğ'), 'Ğ')
    assert.equal(initialOf('élan'), 'E')
    assert.equal(initialOf('[Oshi no Ko]'), 'O')
    assert.equal(initialOf('3 Gün'), '#')
    assert.equal(initialOf('呪術廻戦'), '#')
    assert.equal(initialOf('!!!'), '#')
    assert.deepEqual(
      ['Zor', 'İz', 'Ilık', 'Çay', 'Cam', 'Şal', 'Sal', 'Bölüm 10', 'Bölüm 9'].sort(compareTitles),
      ['Bölüm 9', 'Bölüm 10', 'Cam', 'Çay', 'Ilık', 'İz', 'Sal', 'Şal', 'Zor']
    )
    assert.equal(letterParam('ç'), 'Ç')
    assert.equal(letterParam('i'), 'İ')
    assert.equal(letterParam('#'), '#')
    assert.isNull(letterParam('ab'))
    assert.isNull(letterParam(['A']))
  })

  test('genres can be included (VEYA / VE) and excluded', async ({ assert }) => {
    const list = (query: string) => html(`/seriler?type=kesif&order=title&${query}`).then(slugsOf)

    assert.sameMembers(await list('genre=K%C5%9Ff%20Aksiyon&genre=K%C5%9Ff%20Komedi'), [
      'seytan-avcisi-kesif',
      'solo-leveling-kesif',
      'isik-kesif',
      'iz-kesif',
    ])
    assert.deepEqual(await list('genre=K%C5%9Ff%20Dram&genre=K%C5%9Ff%20Komedi&genre_mode=all'), [
      'isik-kesif',
    ])
    assert.deepEqual(await list('genre=K%C5%9Ff%20Aksiyon&xgenre=K%C5%9Ff%20Dram'), [
      'solo-leveling-kesif',
    ])
    assert.sameMembers(await list('xgenre=K%C5%9Ff%20Komedi'), [
      'seytan-avcisi-kesif',
      'solo-leveling-kesif',
      'uc-kesif-gun',
      'elan-kesif',
    ])
    // Comma lists work too; a genre both included and excluded counts as excluded.
    assert.sameMembers(
      await list('genre=K%C5%9Ff%20Aksiyon&xgenre=K%C5%9Ff%20Aksiyon,K%C5%9Ff%20Komedi'),
      ['uc-kesif-gun', 'elan-kesif']
    )

    const page = await html(
      '/seriler?type=kesif&genre=K%C5%9Ff%20Aksiyon&xgenre=K%C5%9Ff%20Dram&genre_mode=all'
    )
    // Chips: the excluded genre is marked apart; the filters keep each other in their links.
    assert.match(
      page,
      /class="chip catalog-chip catalog-chip--exclude"[^>]*>\s*<span class="catalog-chip__key">Hariç:<\/span> Kşf Dram/
    )
    assert.include(page, 'href="/seriler?genre=K%C5%9Ff+Aksiyon&amp;type=kesif&amp;genre_mode=all"')
    // The form works without JavaScript: genre / xgenre checkboxes keep their state.
    assert.match(page, /name="genre" value="Kşf Aksiyon" checked/)
    assert.match(page, /name="xgenre" value="Kşf Dram" checked/)
    assert.match(page, /name="genre_mode" value="all"[^>]*checked/)
  })

  test('year range and minimum chapters (published chapters only)', async ({ assert }) => {
    const list = (query: string) => html(`/seriler?type=kesif&${query}`).then(slugsOf)

    assert.sameMembers(await list('year_from=2015'), [
      'seytan-avcisi-kesif',
      'solo-leveling-kesif',
      'iz-kesif',
    ])
    assert.sameMembers(await list('year_from=2010&year_to=2015'), ['isik-kesif', 'iz-kesif'])
    assert.sameMembers(await list('year_from=2015&year_to=2010'), ['isik-kesif', 'iz-kesif'])
    assert.sameMembers(await list('min_chapters=3'), ['seytan-avcisi-kesif', 'isik-kesif'])
    // Solo Leveling has 1 published and 2 draft chapters.
    assert.notInclude(await list('min_chapters=2'), 'solo-leveling-kesif')
    // Bad values are ignored.
    assert.lengthOf(await list('year_from=abc&min_chapters=-4&year_to=99999'), 6)

    const page = await html('/seriler?type=kesif&year_from=2010&year_to=2015&min_chapters=3')
    assert.include(page, '<span class="catalog-chip__key">Yıl:</span> 2010–2015')
    assert.include(page, '<span class="catalog-chip__key">Bölüm:</span> en az 3')
    assert.include(page, 'id="filter-more"')
    assert.match(page, /name="year_from"[^>]*value="2010"/)
  })

  test('the A–Z index groups by Turkish letters and leaves drafts out', async ({ assert }) => {
    const all = await html('/seriler/a-z')
    assert.include(all, '<h1 class="page-head__title"')
    assert.match(all, /href="\/seriler\/a-z\?harf=%C5%9E" class="az-letter" data-count="\d+"/)
    assert.notInclude(all, 'cag-kesif-taslak')
    const letter = (value: string) => html('/seriler/a-z?harf=' + encodeURIComponent(value))

    const s = await letter('ş')
    assert.include(slugsOf(s), 'seytan-avcisi-kesif')
    assert.include(s, 'id="harf-Ş"')
    assert.notInclude(slugsOf(s), 'solo-leveling-kesif')
    const dotless = slugsOf(await letter('I'))
    assert.include(dotless, 'isik-kesif')
    assert.notInclude(dotless, 'iz-kesif')
    assert.include(slugsOf(await letter('İ')), 'iz-kesif')
    assert.include(slugsOf(await letter('#')), 'uc-kesif-gun')
    assert.include(slugsOf(await letter('E')), 'elan-kesif')
    assert.notInclude(await letter('Ç'), 'cag-kesif-taslak')
    // "Tümü" follows the alphabet: # last, Işık before İz, İz before Şeytan.
    const { items } = await alphabet(null, 1, 100_000)
    const order = items.map((item) => item.slug)
    assert.isBelow(order.indexOf('elan-kesif'), order.indexOf('isik-kesif'))
    assert.isBelow(order.indexOf('isik-kesif'), order.indexOf('iz-kesif'))
    assert.isBelow(order.indexOf('iz-kesif'), order.indexOf('seytan-avcisi-kesif'))
    assert.isBelow(order.indexOf('seytan-avcisi-kesif'), order.indexOf('uc-kesif-gun'))
    assert.notInclude(order, 'cag-kesif-taslak')
  })

  test('random never opens a draft', async ({ assert }) => {
    const only = await ContentType.create({ name: 'Rastgele', slug: 'rastgele-tur' })
    await makeSeries('Rastgele Yayında', 'rastgele-yayinda', { type: only })
    await makeSeries('Rastgele Taslak', 'rastgele-taslak', { type: only, draft: true })
    for (let i = 0; i < 15; i++) {
      const response = await get('/rastgele?type=rastgele-tur')
      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), '/series/rastgele-tur/rastgele-yayinda')
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    const any = await get('/rastgele')
    assert.equal(any.status, 302)
    assert.match(any.headers.get('location') || '', /^\/series\/[\w-]+\/[\w-]+$/)
    assert.notInclude(any.headers.get('location') || '', 'taslak')

    const empty = await ContentType.create({ name: 'Boş', slug: 'bos-tur' })
    await makeSeries('Boş Taslak', 'bos-taslak', { type: empty, draft: true })
    for (const type of ['bos-tur', 'yok-boyle']) {
      const response = await get('/rastgele?type=' + type)
      assert.equal(response.headers.get('location'), '/seriler')
    }
  })

  test('search ignores Turkish letters and punctuation and finds alternative titles', async ({
    assert,
  }) => {
    for (const q of ['seytan', 'ŞEYTAN', 'şeytan avcısı', 'SEYTAN AVCISI'])
      assert.include(await suggestedSlugs(q), 'seytan-avcisi-kesif', q)
    const [byAlias] = await suggest('kimetsu yaiba keşif')
    assert.equal(byAlias.slug, 'seytan-avcisi-kesif')
    assert.equal(byAlias.alias, 'Kimetsu no Yaiba Keşif')
    assert.equal(byAlias.lastChapter, 3)
    assert.equal(byAlias.type, 'kesif')
    assert.isString(byAlias.thumb)
    const [solo] = await suggest('solo leveling kesif')
    assert.equal(solo.slug, 'solo-leveling-kesif')
    assert.isNull(solo.alias)
    // Drafts never appear.
    assert.notInclude(await suggestedSlugs('cag kesif'), 'cag-kesif-taslak')
    assert.deepEqual(await suggest('a'), [])

    // The catalog search uses the same matching.
    assert.include(slugsOf(await html('/seriler?search=seytan%20kesif')), 'seytan-avcisi-kesif')
    assert.include(slugsOf(await html('/seriler?search=IŞIK')), 'isik-kesif')
    assert.include(
      slugsOf(await html('/seriler?search=solo-leveling%20ragnarok')),
      'solo-leveling-kesif'
    )

    // Rows without search_text (raw inserts) are still found by the old title match.
    const raw = await makeSeries('Ham Kayıt Keşif', 'ham-kayit-kesif')
    await db.from('series').where('id', raw.id).update({ search_text: null })
    assert.include(slugsOf(await html('/seriler?search=Ham%20Kay%C4%B1t')), 'ham-kayit-kesif')
  })

  test('search_text follows the names on create, update and in the admin form', async ({
    assert,
  }) => {
    const textOf = async (id: number) => {
      const row = await db.from('series').where('id', id).first()
      return row.search_text as string
    }

    const series = await makeSeries('Gölge Avcısı', 'golge-avcisi-kesif', {
      alternativeTitles: ['Shadow Hunter'],
    })
    assert.equal(await textOf(series.id), 'golge avcisi shadow hunter golge avcisi kesif')
    series.alternativeTitles = ['Kage no Karyuudo']
    await series.save()
    assert.include(await textOf(series.id), 'kage no karyuudo')
    assert.notInclude(await textOf(series.id), 'shadow')

    const author = await Author.create({
      name: 'Ömer Çizgici',
      slug: 'omer-cizgici',
      createdAt: now(),
      updatedAt: now(),
    })
    await series.related('authors').attach([author.id])
    await refreshSearchText([series.id])
    assert.include(await textOf(series.id), 'omer cizgici')

    // Admin form: authors join the search text in the same transaction; a rename follows.
    await User.create({
      email: 'kesif-admin@example.com',
      username: 'kesif_admin',
      role: 'admin',
      fullName: 'Keşif Admin',
      password,
    })
    const cookies = new Map<string, string>()
    const request = async (path: string, init: RequestInit = {}) => {
      const response = await get(path, {
        ...init,
        headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...init.headers },
      })
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';')
        cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1))
      }
      return response
    }
    const token = async (path: string) => {
      const page = await request(path).then((r) => r.text())
      return page.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
    }
    await request('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token('/giris'), login: 'kesif_admin', password }),
    })
    const form = new URLSearchParams({
      _csrf: await token('/admin/seriler/ekle'),
      title: 'Ay Işığı Kılıcı',
      description: 'Test',
      content_type_id: String(kesif.id),
      status: 'Devam Ediyor',
      translation_status: 'Aktif',
      publication_year: '2021',
      alternative_titles: 'Moonlight Blade, 月光剣',
    })
    form.append('authors[]', String(author.id))
    const saved = await request('/admin/seriler/ekle', { method: 'POST', body: form })
    assert.equal(saved.status, 302)
    const created = await Series.findByOrFail('title', 'Ay Işığı Kılıcı')
    assert.equal(
      await textOf(created.id),
      'ay isigi kilici moonlight blade 月光剣 omer cizgici ay isigi kilici'
    )
    assert.include(await suggestedSlugs('omer cizgici'), 'ay-isigi-kilici')

    const rename = await request(`/admin/yazarlar/${author.id}/duzenle`, {
      method: 'POST',
      body: new URLSearchParams({
        _csrf: await token(`/admin/yazarlar/${author.id}/duzenle`),
        name: 'Ömer Kalem',
      }),
    })
    assert.equal(rename.status, 302)
    assert.include(await textOf(created.id), 'omer kalem')
    assert.notInclude(await textOf(created.id), 'cizgici')
    assert.include(await textOf(series.id), 'omer kalem')
  })
})
