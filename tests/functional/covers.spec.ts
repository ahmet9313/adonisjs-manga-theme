import { test } from '@japa/runner'
import User from '#models/user'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import Series from '#models/series'
import ContentType from '#models/content_type'
import settings from '#services/settings_service'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'
import { coverView } from '#services/cover_policy_service'
import {
  clearCoverCache,
  downloadCover,
  plainText,
  providers,
  searchCovers,
  similarity,
  workDetails,
  type Fetcher,
  type Work,
} from '#services/cover_search_service'

const base = 'http://127.0.0.1:3334'
const password = 'covers-password-123'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } })

const anilistComic = {
  id: 2,
  siteUrl: 'https://anilist.co/manga/2',
  type: 'MANGA',
  format: 'MANGA',
  countryOfOrigin: 'KR',
  isAdult: false,
  status: 'FINISHED',
  popularity: 90000,
  synonyms: ['I Level Up Alone'],
  genres: ['Action', 'Fantasy', 'Isekai'],
  tags: [
    { name: 'Martial Arts', rank: 80, isMediaSpoiler: false },
    { name: 'Spoiler Tag', rank: 90, isMediaSpoiler: true },
  ],
  description: 'A hunter<br>levels up &amp; up.<br><br>(Source: Webtoon)',
  bannerImage: 'https://s4.anilist.co/banner.jpg',
  startDate: { year: 2018 },
  title: { romaji: 'Na Honjaman Level Up', english: 'Solo Leveling', native: '나 혼자만 레벨업' },
  coverImage: {
    extraLarge: 'https://s4.anilist.co/comic.jpg',
    large: 'https://s4.anilist.co/comic-small.jpg',
  },
  staff: {
    edges: [
      { role: 'Original Creator', node: { name: { full: 'Chugong' } } },
      { role: 'Art', node: { name: { full: 'Jang Sung-Rak' } } },
      { role: 'Assistant', node: { name: { full: 'Somebody Else' } } },
    ],
  },
  studios: { nodes: [] },
}

/** Canned answers of the sources for "Solo Leveling" (a 2018 manhwa). */
const fakeSites: Fetcher = async (input, init) => {
  const url = String(input)
  if (url.startsWith('https://graphql.anilist.co')) {
    const { variables } = JSON.parse(String(init?.body))
    if (variables.id) return json({ data: { Media: anilistComic } })
    if (variables.search !== 'Solo Leveling') return json({ data: { Page: { media: [] } } })
    return json({
      data: {
        Page: {
          media: [
            {
              id: 1,
              format: 'NOVEL',
              countryOfOrigin: 'KR',
              popularity: 9000,
              startDate: { year: 2016 },
              title: { romaji: 'Na Honjaman Level Up', english: 'Solo Leveling' },
              coverImage: { extraLarge: 'https://s4.anilist.co/novel.jpg' },
            },
            anilistComic,
            {
              id: 3,
              format: 'MANGA',
              countryOfOrigin: 'JP',
              popularity: 50,
              startDate: { year: 1990 },
              title: { romaji: 'Peach Girl' },
              coverImage: { extraLarge: 'https://s4.anilist.co/peach.jpg' },
            },
            {
              id: 4,
              format: 'MANGA',
              countryOfOrigin: 'KR',
              popularity: 50,
              startDate: { year: 2018 },
              title: { english: 'Solo Leveling' },
              // Not on covers.imageHosts: dropped.
              coverImage: { extraLarge: 'https://evil.example/cover.jpg' },
            },
          ],
        },
      },
    })
  }
  if (url.startsWith('https://myanimelist.net/search/prefix.json'))
    return json({
      categories: [
        {
          type: 'manga',
          items: [
            {
              id: 121496,
              name: 'Solo Leveling',
              url: 'https://myanimelist.net/manga/121496/Solo_Leveling',
              image_url: 'https://cdn.myanimelist.net/r/116x180/images/manga/3/222295.jpg?s=abc',
              payload: { media_type: 'Manhwa', start_year: 2018 },
              es_score: 150,
            },
          ],
        },
      ],
    })
  // Kitsu is down (HTML maintenance page with status 200).
  if (url.startsWith('https://kitsu.app')) return html('<!doctype html>Bakım')
  throw new TypeError('fetch failed')
}

test.group('Cover search: ranking and sources', (group) => {
  group.each.setup(() => clearCoverCache())

  test('names are compared without case, accents or punctuation', ({ assert }) => {
    assert.equal(similarity('Solo Leveling', 'SOLO LEVELING!'), 1)
    assert.isAbove(similarity('Solo Leveling', 'Solo Leveling: Ragnarok'), 0.6)
    assert.isAbove(similarity('Frieren', 'Frieren: Beyond Journey’s End'), 0.6)
    assert.isBelow(similarity('Peach', 'Peach Girl'), 0.6)
    assert.equal(similarity('Kılıç Ustası', 'kilic ustasi'), 1)
    assert.equal(plainText('a<br>b &amp; c<i>!</i> (Source: X)'), 'a\nb & c!')
  })

  test('the matching comic comes first, other media after it', async ({ assert }) => {
    const results = await searchCovers(
      {
        query: 'Tek Başına Seviye Atlama',
        alternatives: ['Solo Leveling'],
        format: 'image',
        type: 'manhwa',
        year: 2018,
      },
      fakeSites
    )
    const covers = results.covers.map((item) => `${item.source}:${item.image.split('/').pop()}`)
    // The 2018 manhwa leads (AniList key art, then MyAnimeList), the novel of the same name is
    // last; Peach Girl and the foreign host are left out.
    assert.deepEqual(covers, ['anilist:comic.jpg', 'mal:222295l.jpg', 'anilist:novel.jpg'])
    assert.equal(results.covers[0].ref, '2')
    assert.equal(results.covers[0].detail, 'Manhwa · 2018 · Ana kapak')
    assert.deepEqual(
      results.banners.map((item) => item.image),
      ['https://s4.anilist.co/banner.jpg']
    )
    // A source that is down is named, not fatal; IMDb is not asked for comics.
    assert.deepEqual(
      results.failures.map((failure) => failure.label),
      ['Kitsu']
    )
  })

  test('anime ask the anime catalogues and IMDb; comics never IMDb', async ({ assert }) => {
    const asked: string[] = []
    const recorder: Fetcher = async (input, init) => {
      const url = String(input)
      asked.push(
        url.startsWith('https://graphql')
          ? `anilist:${JSON.parse(String(init?.body)).variables.type}`
          : url.split('?')[0].replace(/suggestion\/x\/.*/, 'suggestion')
      )
      if (url.includes('prefix.json')) asked.push(new URL(url).searchParams.get('type')!)
      return json({ data: [] })
    }
    await searchCovers({ query: 'Sintel', format: 'video', type: 'anime' }, recorder)
    assert.includeMembers(asked, [
      'anilist:ANIME',
      'https://kitsu.app/api/edge/anime',
      'https://myanimelist.net/search/prefix.json',
      'anime',
      'https://v3.sg.media-imdb.com/suggestion',
    ])
    asked.length = 0
    await searchCovers({ query: 'Overlord', format: 'text', type: 'novel' }, recorder)
    assert.include(asked, 'anilist:MANGA')
    assert.notInclude(asked.join(), 'imdb')
  })
})

test.group('Cover search: details for the form', () => {
  test('AniList: people by role, plain description, status, genres apart from tags', async ({
    assert,
  }) => {
    const details = await workDetails('anilist', '2', 'image', fakeSites)
    assert.equal(details.title, 'Solo Leveling')
    assert.deepEqual(details.authors, ['Chugong'])
    assert.deepEqual(details.artists, ['Jang Sung-Rak'])
    assert.equal(details.description, 'A hunter\nlevels up & up.')
    assert.equal(details.status, 'Tamamlandı')
    assert.equal(details.year, 2018)
    assert.isNull(details.ageRating)
    assert.deepEqual(details.genres, ['Action', 'Fantasy', 'Isekai'])
    assert.deepEqual(details.tags, ['Martial Arts'])
    assert.includeMembers(details.alternatives, ['Na Honjaman Level Up', 'I Level Up Alone'])
    assert.notInclude(details.alternatives, 'Solo Leveling')
    assert.equal(details.banner, 'https://s4.anilist.co/banner.jpg')
  })

  test('MyAnimeList page: names, people, genres, status, large cover; gaps from AniList', async ({
    assert,
  }) => {
    const page = `<html><head>
      <meta property="og:title" content="Solo Leveling">
      <meta property="og:image" content="https://cdn.myanimelist.net/images/manga/3/222295.jpg">
      </head><body>
      <span itemprop="description">Ten years ago, &quot;the Gate&quot; appeared.<br>
      [Written by MAL Rewrite]</span>
      <div class="spaceit_pad"><span class="dark_text">Synonyms:</span> Na Honjaman Level Up, I Level Up Alone</div>
      <div class="spaceit_pad"><span class="dark_text">Japanese:</span> 나 혼자만 레벨업</div>
      <div class="spaceit_pad"><span class="dark_text">Type:</span> <a href="/topmanga.php?type=manhwa">Manhwa</a></div>
      <div class="spaceit_pad"><span class="dark_text">Status:</span> Finished</div>
      <div class="spaceit_pad"><span class="dark_text">Published:</span> Mar  4, 2018 to May  31, 2023</div>
      <span itemprop="genre" style="display:none">Action</span><span itemprop="genre" style="display:none">Ecchi</span>
      <div class="spaceit_pad"><span class="dark_text">Authors:</span>
      <a href="/people/49667/Chugong">Chugong</a> (Story), <a href="/people/1/Kishimoto">Kishimoto, Masashi</a> (Story & Art)</div>
      </body></html>`
    const sites: Fetcher = async (input, init) =>
      String(input).startsWith('https://myanimelist.net/manga/121496')
        ? html(page)
        : fakeSites(input, init)
    const details = await workDetails('mal', '121496', 'image', sites)
    assert.equal(details.title, 'Solo Leveling')
    assert.equal(details.description, 'Ten years ago, "the Gate" appeared.')
    assert.deepEqual(details.authors, ['Chugong', 'Masashi Kishimoto'])
    assert.deepEqual(details.artists, ['Masashi Kishimoto'])
    assert.deepEqual(details.genres, ['Action', 'Ecchi'])
    assert.equal(details.ageRating, '16+')
    assert.equal(details.status, 'Tamamlandı')
    assert.equal(details.year, 2018)
    assert.equal(details.medium, 'comic')
    assert.equal(details.country, 'KR')
    assert.equal(details.cover, 'https://cdn.myanimelist.net/images/manga/3/222295l.jpg')
    // MyAnimeList has no banner: the same work on AniList fills it.
    assert.equal(details.banner, 'https://s4.anilist.co/banner.jpg')
    assert.equal(details.sourceLabel, 'MyAnimeList + AniList')
  })
})

test.group('Cover search: downloads', () => {
  const serve =
    (responses: Record<string, () => Response>): Fetcher =>
    async (input) => {
      const make = responses[String(input)]
      if (!make) throw new TypeError('unexpected ' + input)
      return make()
    }

  test('only allowed hosts, redirects and image files are accepted', async ({ assert }) => {
    const image = await downloadCover(
      'https://s4.anilist.co/a.png',
      serve({ 'https://s4.anilist.co/a.png': () => new Response(png) })
    )
    assert.equal(image.type, 'image/png')
    assert.equal(image.ext, 'png')
    assert.equal(image.bytes.length, png.length)

    for (const address of [
      'http://s4.anilist.co/a.png',
      'https://127.0.0.1/a.png',
      'https://s4.anilist.co.evil.example/a.png',
      'https://user@s4.anilist.co/a.png',
      'file:///etc/passwd',
    ])
      await assert.rejects(() => downloadCover(address, serve({})), /indirilemez/)

    await assert.rejects(
      () =>
        downloadCover(
          'https://s4.anilist.co/r.png',
          serve({
            'https://s4.anilist.co/r.png': () =>
              new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/x' } }),
          })
        ),
      /yönlendirildi/
    )
    const redirected = await downloadCover(
      'https://s4.anilist.co/r.png',
      serve({
        'https://s4.anilist.co/r.png': () =>
          new Response(null, { status: 301, headers: { location: '/b.png' } }),
        'https://s4.anilist.co/b.png': () => new Response(png),
      })
    )
    assert.equal(redirected.type, 'image/png')

    await assert.rejects(
      () =>
        downloadCover(
          'https://s4.anilist.co/x.svg',
          serve({ 'https://s4.anilist.co/x.svg': () => new Response('<svg/>') })
        ),
      /JPG, PNG veya WebP/
    )
    await assert.rejects(
      () =>
        downloadCover(
          'https://s4.anilist.co/big.png',
          serve({
            'https://s4.anilist.co/big.png': () => new Response(Buffer.alloc(11 * 1024 * 1024)),
          })
        ),
      /10 MB/
    )
  })
})

/** Cookie-aware client with a form login and a CSRF token for JSON posts. */
async function login(username: string) {
  const cookies = new Map<string, string>()
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...init,
      redirect: 'manual',
      headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...init.headers },
    })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1))
    }
    return response
  }
  const page = await request('/giris').then((r) => r.text())
  const csrf = page.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  await request('/giris', {
    method: 'POST',
    body: new URLSearchParams({ _csrf: csrf, login: username, password }),
  })
  const token = async () => {
    const admin = await request('/admin/seriler/ekle').then((r) => r.text())
    return admin.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  }
  return { request, token }
}

const asJson = { headers: { accept: 'application/json' } }

test.group('Cover search: admin endpoints', (group) => {
  const original = { ...providers }
  let type: ContentType

  group.setup(async () => {
    for (const [username, role] of [
      ['kapak_editor', 'editor'],
      ['kapak_uye', 'member'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
    const timestamp = now()
    type =
      (await ContentType.findBy('slug', 'manhwa')) ||
      (await ContentType.create({
        name: 'Kapak Manhwa',
        slug: 'manhwa',
        format: 'image',
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
    if (!(await Genre.findBy('name', 'Aksiyon')))
      await Genre.create({
        name: 'Aksiyon',
        slug: 'aksiyon',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    await Author.create({
      name: 'Chugong',
      slug: 'chugong-kapak',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })
  group.each.setup(() => {
    clearAttempts('login:127.0.0.1')
    clearCoverCache()
    Object.assign(providers, original)
  })
  group.teardown(async () => {
    Object.assign(providers, original)
    await User.query().whereLike('username', 'kapak_%').delete()
    await Author.query().where('slug', 'chugong-kapak').delete()
    await Artist.query().where('slug', 'jang-sung-rak').delete()
    if (type.name === 'Kapak Manhwa') await type.delete()
  })

  test('staff search and read a work for the form; members are kept out', async ({ assert }) => {
    const seen: unknown[] = []
    const work: Work = {
      ref: '2',
      names: ['Solo Leveling'],
      medium: 'comic',
      country: 'KR',
      year: 2018,
      link: 'https://anilist.co/manga/2',
      label: 'Manhwa',
      popularity: 10,
      images: [
        {
          kind: 'cover',
          image: 'https://s4.anilist.co/c.jpg',
          thumb: 'https://s4.anilist.co/c.jpg',
          width: null,
          height: null,
          note: 'Ana kapak',
          bonus: 0,
        },
      ],
    }
    for (const source of Object.keys(providers) as (keyof typeof providers)[])
      providers[source] = {
        search: async (_fetcher, query, search) => {
          seen.push([source, query, search.format, search.type, search.year])
          return source === 'anilist' ? [work] : []
        },
        details: (_fetcher, ref, format) => original.anilist.details(fakeSites, ref, format),
      }

    const editor = await login('kapak_editor')
    const page = await editor.request('/admin/seriler/ekle').then((r) => r.text())
    assert.include(page, 'x-data="coverFinder"')
    assert.include(page, 'Otomatik doldur')

    const found = await editor.request(
      `/admin/seriler/kapak-ara?q=Solo+Leveling&alt=Na+Honjaman+Level+Up&type_id=${type.id}&year=2018`,
      asJson
    )
    assert.equal(found.status, 200)
    const body = (await found.json()) as { covers: { image: string; ref: string }[] }
    assert.equal(body.covers[0].image, 'https://s4.anilist.co/c.jpg')
    assert.equal(body.covers[0].ref, '2')
    assert.deepInclude(seen, ['anilist', 'Solo Leveling', 'image', 'manhwa', 2018])

    // Details: genres matched to this site's names (Action → Aksiyon, the tag too when it
    // matches), known people get their id, unknown ones are offered as new.
    const read = await editor.request(
      `/admin/seriler/kapak-bilgi?source=anilist&ref=2&type_id=${type.id}`,
      asJson
    )
    assert.equal(read.status, 200)
    const details = (await read.json()) as any
    assert.equal(details.contentType.id, type.id)
    assert.include(
      details.genres.matched.map((g: any) => g.name),
      'Aksiyon'
    )
    assert.include(details.genres.unmatched, 'Isekai')
    assert.isNumber(details.authors[0].id)
    assert.deepEqual(details.artists, [{ id: null, name: 'Jang Sung-Rak' }])

    // Quick records: added once, found afterwards (same name in another spelling).
    const token = await editor.token()
    const add = (name: string) =>
      editor.request('/admin/seriler/kapak-kayit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({ kind: 'artists', name }),
      })
    const created = (await add('Jang Sung-Rak').then((r) => r.json())) as any
    assert.isTrue(created.created)
    const again = (await add('jang sung rak').then((r) => r.json())) as any
    assert.deepEqual([again.id, again.created], [created.id, false])

    const status = (path: string) => editor.request(path, asJson).then((r) => r.status)
    assert.equal(await status('/admin/seriler/kapak-ara?q='), 422)
    assert.equal(await status('/admin/seriler/kapak-bilgi?source=evil&ref=1'), 422)
    const foreign = await editor.request(
      `/admin/seriler/kapak-gorsel?url=${encodeURIComponent('http://127.0.0.1:3334/')}`
    )
    assert.equal(foreign.status, 422)

    const member = await login('kapak_uye')
    const refused = await member.request('/admin/seriler/kapak-ara?q=Solo', asJson)
    assert.oneOf(refused.status, [302, 403])
  })
})

test.group('Hidden covers', (group) => {
  let type: ContentType
  let adult: Series
  const keys = [
    'cover_policy_18',
    'cover_policy_16',
    'cover_reveal',
    'cover_placeholder_url',
    'age_policy_18',
  ]

  group.setup(async () => {
    const timestamp = now()
    type = await ContentType.create({
      name: 'Gizli Kapak',
      slug: 'gizli-kapak',
      format: 'image',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    adult = await Series.create({
      title: 'Gizli Kapak Serisi',
      slug: 'gizli-kapak-serisi',
      description: 'Test',
      contentTypeId: type.id,
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2020,
      ageRating: '18+',
      coverImage: '/content/gizli-kapak/gizli-kapak-serisi/cover.jpg',
      bannerImage: '/content/gizli-kapak/gizli-kapak-serisi/banner.jpg',
      alternativeTitles: [],
      keywords: [],
      featured: false,
      draft: false,
      access: 'public',
      coverMode: 'auto',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    for (const [username, role] of [
      ['gizli_uye', 'member'],
      ['gizli_admin', 'admin'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
  })
  group.each.setup(async () => {
    clearAttempts('login:127.0.0.1')
    await settings.save(Object.fromEntries(keys.map((key) => [key, ''])))
  })
  group.teardown(async () => {
    await settings.save(Object.fromEntries(keys.map((key) => [key, ''])))
    await adult.delete()
    await type.delete()
    await User.query().whereLike('username', 'gizli_%').delete()
  })

  test('rules per rating, per series, and who may see the real cover', async ({ assert }) => {
    const series = {
      coverImage: '/content/a.jpg',
      bannerImage: '/content/b.jpg',
      ageRating: '18+',
      coverMode: 'auto' as const,
    }
    const guest = { age: 0, member: false }
    const confirmed = { age: 18, member: false }
    const member = { age: 0, member: true }
    // Default: 18+ blurred, revealed by the age confirmation.
    assert.equal(coverView(series, guest).coverVeil, 'blur')
    assert.isNull(coverView(series, confirmed).coverVeil)
    assert.equal(coverView(series, { age: 16, member: false }).coverVeil, 'blur')
    assert.isNull(coverView({ ...series, ageRating: '16+' }, guest).coverVeil)

    await settings.save({ cover_policy_18: 'placeholder', cover_reveal: 'members' })
    const hidden = coverView(series, guest)
    assert.deepEqual(hidden, {
      coverImage: '/images/hidden-cover.svg',
      bannerImage: null,
      coverVeil: 'placeholder',
    })
    assert.equal(coverView(series, confirmed).coverVeil, 'placeholder')
    assert.isNull(coverView(series, member).coverVeil)

    await settings.save({ cover_reveal: 'members_age', cover_placeholder_url: '/content/x.png' })
    assert.equal(coverView(series, member).coverImage, '/content/x.png')
    assert.isNull(coverView(series, { age: 18, member: true }).coverVeil)

    await settings.save({ cover_reveal: 'none' })
    assert.equal(coverView(series, { age: 18, member: true }).coverVeil, 'placeholder')
    // A series' own setting wins over its rating, also without a rating.
    assert.isNull(coverView({ ...series, coverMode: 'show' }, guest).coverVeil)
    assert.equal(
      coverView({ ...series, ageRating: null, coverMode: 'blur' }, guest).coverVeil,
      'blur'
    )
  })

  test('lists, search and the series page hide the cover; age confirmation shows it', async ({
    assert,
  }) => {
    await settings.save({ age_policy_18: 'none' })
    const search = await fetch(`${base}/ara?q=Gizli+Kapak`).then((r) => r.json())
    assert.equal((search as any[])[0].coverVeil, 'blur')
    const catalog = await fetch(`${base}/seriler?search=Gizli+Kapak`).then((r) => r.text())
    assert.match(catalog, /cover\.jpg[^"]*"[^>]*\s+data-veil="blur"/)
    assert.include(catalog, 'cover-veil')
    const page = await fetch(`${base}/series/gizli-kapak/gizli-kapak-serisi`).then((r) => r.text())
    assert.include(page, 'Kapağı göster')

    const confirmed = await fetch(`${base}/seriler?search=Gizli+Kapak`, {
      headers: { cookie: 'age_ok=18' },
    }).then((r) => r.text())
    assert.notMatch(confirmed, /\sdata-veil="/)

    // Placeholder: the real file is never sent, the banner neither.
    await settings.save({ cover_policy_18: 'placeholder' })
    const hidden = await fetch(`${base}/series/gizli-kapak/gizli-kapak-serisi`).then((r) =>
      r.text()
    )
    assert.notInclude(hidden, 'gizli-kapak-serisi/cover.jpg')
    assert.notInclude(hidden, 'gizli-kapak-serisi/banner.jpg')
    assert.include(hidden, '/images/hidden-cover.svg')

    // "Üyeler": a signed-in member sees it, a guest does not.
    await settings.save({ cover_reveal: 'members' })
    const member = await login('gizli_uye')
    const signedIn = await member.request('/seriler?search=Gizli+Kapak').then((r) => r.text())
    assert.include(signedIn, 'gizli-kapak-serisi/cover.jpg')
    const guest = await fetch(`${base}/seriler?search=Gizli+Kapak`).then((r) => r.text())
    assert.notInclude(guest, 'gizli-kapak-serisi/cover.jpg')
  })

  test('Tema → Yaş ve Erişim saves the cover rules', async ({ assert }) => {
    const admin = await login('gizli_admin')
    const page = await admin.request('/admin/tema/erisim').then((r) => r.text())
    for (const text of ['Kapak bulanıklaştırma', 'name="cover_policy_18"', 'value="members_age"'])
      assert.include(page, text)
    assert.include(page, 'data-kind="cover_placeholder"')
    const csrf = page.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
    const post = (fields: Record<string, string>) =>
      admin.request('/admin/tema/erisim', {
        method: 'POST',
        body: new URLSearchParams({
          _csrf: csrf,
          part: 'covers',
          cover_policy_18: 'placeholder',
          cover_policy_16: 'blur',
          cover_policy_13: 'show',
          cover_policy_7: 'show',
          cover_reveal: 'members',
          cover_placeholder_url: '/content/branding/gizli.png',
          ...fields,
        }),
      })
    assert.equal(await post({}).then((r) => r.status), 302)
    assert.equal(settings.coverPolicy('18+'), 'placeholder')
    assert.equal(settings.coverPolicy('16+'), 'blur')
    assert.equal(settings.get('cover_reveal'), 'members')
    assert.equal(settings.get('cover_placeholder_url'), '/content/branding/gizli.png')
    // The age gate rules of the other form are untouched; bad values are refused.
    assert.equal(settings.agePolicy('18+'), 'members')
    await post({ cover_reveal: 'herkes', cover_placeholder_url: 'javascript:alert(1)' })
    assert.equal(settings.get('cover_reveal'), 'members')
    assert.equal(settings.get('cover_placeholder_url'), '/content/branding/gizli.png')
  })
})
