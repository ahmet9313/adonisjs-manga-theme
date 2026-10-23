import { test } from '@japa/runner'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import Author from '#models/author'
import Genre from '#models/genre'
import User from '#models/user'
import settings from '#services/settings_service'
import feeds from '#services/feed_service'
import { scriptJson, clip } from '#services/seo_service'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'seo-password-123'
const tricky = 'Açık </script><b> & "Seri"'

/** Cookie-aware client with form logins and CSRF form posts. */
function client(extraCookies: Record<string, string> = {}) {
  const cookies = new Map<string, string>(Object.entries(extraCookies))
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
  const page = (path: string) => request(path).then((response) => response.text())
  const token = async (from: string) =>
    page(from).then((html) => html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || '')
  const post = async (path: string, fields: Record<string, string>, from = '/giris') =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  const login = (identifier: string) => post('/giris', { login: identifier, password })
  return { request, page, post, login }
}

/** The content of a `<meta property|name="key">` (HTML entities decoded), or null. */
function metaOf(html: string, key: string) {
  const match = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)
  return match ? decode(match[1]) : null
}
const canonicalOf = (html: string) =>
  /<link rel="canonical" href="([^"]*)">/.exec(html)?.[1] ?? null
const decode = (text: string) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
/** Every JSON-LD document of a page, parsed. */
function jsonLdOf(html: string) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1])
  )
}

test.group('SEO, sharing and feeds', (group) => {
  let manga: ContentType
  let novel: ContentType
  const series: Record<string, Series> = {}

  group.setup(async () => {
    const timestamp = now()
    feeds.forget()
    manga = await ContentType.create({
      name: 'Seo Manga',
      slug: 'seo-manga',
      format: 'image',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    novel = await ContentType.create({
      name: 'Seo Roman',
      slug: 'seo-roman',
      format: 'text',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const make = (slug: string, extra: Partial<Series> = {}) =>
      Series.create({
        title: `Seo ${slug}`,
        slug,
        description: 'Bir deneme serisi.',
        contentTypeId: manga.id,
        status: 'Devam Ediyor',
        translationStatus: 'Aktif',
        publicationYear: 2021,
        alternativeTitles: [],
        coverImage: `/content/seo/${slug}.jpg`,
        featured: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      })
    series.open = await make('seo-acik', {
      title: tricky,
      ageRating: '13+',
      alternativeTitles: ['Open Series'],
      ratingAvg: 8.44,
      ratingCount: 3,
    })
    series.draft = await make('seo-taslak', { draft: true })
    series.adult = await make('seo-yetiskin', { ageRating: '18+' })
    series.teen = await make('seo-genc', { ageRating: '16+' })
    series.members = await make('seo-uyeler', { access: 'members' })
    series.novel = await make('seo-roman-seri', { contentTypeId: novel.id })
    const author = await Author.create({
      name: 'Seo Yazar',
      slug: 'seo-yazar',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const genre = await Genre.create({
      name: 'Seo Macera',
      slug: 'seo-macera',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await series.open.related('authors').attach([author.id])
    await series.open.related('genres').attach([genre.id])
    const chapter = (owner: Series, number: number, extra: Partial<Chapter> = {}) =>
      Chapter.create({
        seriesId: owner.id,
        number,
        title: null,
        content: { type: 'images', pages: [] },
        publishedAt: timestamp.slice(0, 10),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      })
    await chapter(series.open, 1, { title: 'İlk adım' })
    await chapter(series.open, 2, { draft: true })
    await chapter(series.open, 3, { access: 'members' })
    await chapter(series.open, 4, { warning: 'Şiddet içerir.' })
    await chapter(series.open, 5, { access: 'vip' })
    await chapter(series.adult, 1)
    await chapter(series.teen, 1)
    await chapter(series.members, 1)
    await chapter(series.draft, 1)
    await User.create({
      username: 'seo_admin',
      email: 'seo_admin@example.com',
      fullName: 'seo_admin',
      password,
      role: 'admin',
    })
  })

  group.each.setup(async () => {
    clearAttempts('login:127.0.0.1')
    feeds.forget()
  })

  group.teardown(async () => {
    await Series.query()
      .whereIn(
        'id',
        Object.values(series).map((item) => item.id)
      )
      .delete()
    await manga.delete()
    await novel.delete()
    await Author.query().where('slug', 'seo-yazar').delete()
    await Genre.query().where('slug', 'seo-macera').delete()
    await User.query().where('username', 'seo_admin').delete()
    await settings.save({
      site_url: '',
      cover_policy_16: '',
      cover_placeholder_url: '',
      logo_url: '',
    })
    feeds.forget()
  })

  test('robots.txt keeps private paths out and points at the sitemap', async ({ assert }) => {
    const response = await client().request('/robots.txt')
    assert.equal(response.status, 200)
    assert.include(response.headers.get('content-type') || '', 'text/plain')
    const text = await response.text()
    assert.include(text, 'User-agent: *')
    for (const path of ['/admin', '/ayarlar', '/giris', '/kayit', '/bildirimler'])
      assert.include(text, `Disallow: ${path}\n`)
    assert.include(text, `Sitemap: ${base}/sitemap.xml`)
  })

  test('the sitemap lists open pages only and follows the site address', async ({ assert }) => {
    const response = await client().request('/sitemap.xml')
    assert.equal(response.status, 200)
    assert.include(response.headers.get('content-type') || '', 'application/xml')
    const xml = await response.text()
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /)
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    const has = (path: string) => locs.includes(base + path)
    assert.isTrue(has('/'))
    assert.isTrue(has('/seriler'))
    assert.isTrue(has('/series/seo-manga/seo-acik'))
    assert.isTrue(has('/series/seo-manga/seo-acik/1'))
    // Members series: its page is public, its chapters are not.
    assert.isTrue(has('/series/seo-manga/seo-uyeler'))
    assert.isFalse(has('/series/seo-manga/seo-uyeler/1'))
    assert.isTrue(has('/series/seo-roman/seo-roman-seri'))
    // Drafts, locked or noticed chapters and age-gated series (16+ warn, 18+ members) never.
    for (const path of [
      '/series/seo-manga/seo-acik/2',
      '/series/seo-manga/seo-acik/3',
      '/series/seo-manga/seo-acik/4',
      '/series/seo-manga/seo-acik/5',
    ])
      assert.isFalse(has(path), path)
    for (const slug of ['seo-taslak', 'seo-yetiskin', 'seo-genc']) assert.notInclude(xml, slug)
    assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/lastmod>/)
    assert.equal(
      await client()
        .request('/sitemaps/2.xml')
        .then((r) => r.status),
      404
    )
    assert.equal(
      await client()
        .request('/sitemaps/1.xml')
        .then((r) => r.status),
      200
    )

    // Admin → Tema → Genel → "Site adresi" replaces the request's address everywhere.
    await settings.save({ site_url: 'https://manga.example' })
    feeds.forget()
    assert.include(await client().page('/sitemap.xml'), '<loc>https://manga.example/seriler</loc>')
    assert.include(await client().page('/robots.txt'), 'Sitemap: https://manga.example/sitemap.xml')
    assert.equal(
      canonicalOf(await client().page('/series/seo-manga/seo-acik')),
      'https://manga.example/series/seo-manga/seo-acik'
    )
    await settings.save({ site_url: '' })
  })

  test('series page: canonical, Open Graph, Twitter, feed link and JSON-LD', async ({ assert }) => {
    const html = await client().page('/series/seo-manga/seo-acik?utm_source=x&fbclid=y')
    const url = `${base}/series/seo-manga/seo-acik`
    assert.equal(canonicalOf(html), url)
    assert.isNull(metaOf(html, 'robots'))
    assert.equal(metaOf(html, 'og:url'), url)
    assert.equal(metaOf(html, 'og:title'), tricky)
    assert.equal(metaOf(html, 'og:site_name'), 'MangaHub')
    assert.equal(metaOf(html, 'og:locale'), 'tr_TR')
    assert.equal(metaOf(html, 'og:description'), 'Bir deneme serisi.')
    assert.equal(metaOf(html, 'og:image'), `${base}/content/seo/seo-acik.jpg?w=1280`)
    assert.equal(metaOf(html, 'twitter:card'), 'summary_large_image')
    assert.equal(metaOf(html, 'twitter:title'), tricky)
    assert.equal(metaOf(html, 'twitter:image'), `${base}/content/seo/seo-acik.jpg?w=1280`)
    assert.include(
      html,
      `<link rel="alternate" type="application/rss+xml" title="MangaHub — yeni bölümler" href="${base}/rss.xml">`
    )
    assert.include(html, `href="${url}/rss.xml"`)

    // JSON-LD parses, carries the series and cannot close its own <script>.
    assert.notInclude(html, '</script><b>')
    const [work, crumbs] = jsonLdOf(html)
    assert.equal(work['@type'], 'ComicSeries')
    assert.equal(work.name, tricky)
    assert.deepEqual(work.alternateName, ['Open Series'])
    assert.equal(work.url, url)
    assert.equal(work.image, `${base}/content/seo/seo-acik.jpg?w=1280`)
    assert.deepEqual(work.author, [{ '@type': 'Person', 'name': 'Seo Yazar' }])
    assert.deepEqual(work.genre, ['Seo Macera'])
    assert.equal(work.datePublished, '2021')
    assert.deepEqual(work.aggregateRating, {
      '@type': 'AggregateRating',
      'ratingValue': 8.4,
      'ratingCount': 3,
      'bestRating': 10,
      'worstRating': 1,
    })
    assert.equal(crumbs['@type'], 'BreadcrumbList')
    assert.deepEqual(
      crumbs.itemListElement.map((item: { name: string }) => item.name),
      ['Ana Sayfa', 'Seriler', tricky]
    )

    // Unrated series leave the rating out; novels are books.
    const [book] = jsonLdOf(await client().page('/series/seo-roman/seo-roman-seri'))
    assert.equal(book['@type'], 'Book')
    assert.notProperty(book, 'aggregateRating')

    // Share menu: plain links to the networks with the absolute address, no third-party script.
    assert.include(html, `https://wa.me/?text=${encodeURIComponent(`${tricky} ${url}`)}`)
    assert.include(html, `https://t.me/share/url?url=${encodeURIComponent(url)}`)
    assert.include(html, `https://x.com/intent/tweet?url=${encodeURIComponent(url)}`)
    assert.include(html, `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)
    assert.include(html, 'x-data="shareLinks"')
  })

  test('chapter page: canonical, article tags, breadcrumbs and share row', async ({ assert }) => {
    const html = await client().page('/series/seo-manga/seo-acik/1?ref=abc')
    const url = `${base}/series/seo-manga/seo-acik/1`
    assert.equal(canonicalOf(html), url)
    assert.equal(metaOf(html, 'og:type'), 'article')
    assert.equal(metaOf(html, 'og:url'), url)
    assert.equal(metaOf(html, 'og:title'), `${tricky} - Bölüm 1`)
    assert.equal(metaOf(html, 'og:image'), `${base}/content/seo/seo-acik.jpg?w=1280`)
    assert.equal(metaOf(html, 'twitter:card'), 'summary_large_image')
    const documents = jsonLdOf(html)
    assert.lengthOf(documents, 1)
    assert.equal(documents[0]['@type'], 'BreadcrumbList')
    assert.deepEqual(
      documents[0].itemListElement.map((item: { item: string }) => item.item),
      [`${base}/`, `${base}/seriler`, `${base}/series/seo-manga/seo-acik`, url]
    )
    assert.include(html, 'Bu bölümü paylaş')
    assert.include(html, `https://t.me/share/url?url=${encodeURIComponent(url)}`)
  })

  test('link previews never carry a hidden cover', async ({ assert }) => {
    // 18+ (members gate, blurred cover by default): the gate page is not indexed and shows no
    // real cover in og:image or anywhere in the head.
    const gate = await client().request('/series/seo-manga/seo-yetiskin')
    assert.equal(gate.status, 403)
    const gated = await gate.text()
    const head = gated.slice(0, gated.indexOf('</head>'))
    assert.equal(metaOf(gated, 'robots'), 'noindex, follow')
    assert.isNull(canonicalOf(gated))
    assert.notInclude(head, 'seo-yetiskin.jpg')
    assert.lengthOf(jsonLdOf(gated), 0)

    // A visitor who confirmed their age sees the real cover; the preview still does not.
    await settings.save({
      cover_policy_16: 'blur',
      cover_placeholder_url: '/content/branding/gizli-kapak.png',
    })
    const teen = await client({ age_ok: '16' }).page('/series/seo-manga/seo-genc')
    assert.include(teen, '/content/seo/seo-genc.jpg')
    const teenHead = teen.slice(0, teen.indexOf('</head>'))
    assert.notInclude(teenHead, 'seo-genc.jpg')
    assert.equal(metaOf(teen, 'og:image'), `${base}/content/branding/gizli-kapak.png?w=1280`)
    const [work] = jsonLdOf(teen)
    assert.equal(work.image, `${base}/content/branding/gizli-kapak.png?w=1280`)
    // A chapter of the same series too.
    const chapter = await client({ age_ok: '16' }).page('/series/seo-manga/seo-genc/1')
    assert.equal(metaOf(chapter, 'og:image'), `${base}/content/branding/gizli-kapak.png?w=1280`)

    // Without a raster default image: the logo, else no image at all (SVGs are not previews).
    await settings.save({ cover_placeholder_url: '' })
    const plain = await client({ age_ok: '16' }).page('/series/seo-manga/seo-genc')
    assert.isNull(metaOf(plain, 'og:image'))
    assert.equal(metaOf(plain, 'twitter:card'), 'summary')
    await settings.save({ logo_url: '/content/branding/logo.png' })
    const logo = await client({ age_ok: '16' }).page('/series/seo-manga/seo-genc')
    assert.equal(metaOf(logo, 'og:image'), `${base}/content/branding/logo.png?w=1280`)
    await settings.save({ logo_url: '', cover_policy_16: '' })
  })

  test('noindex on private, search, gate, draft and error pages; catalog canonicals', async ({
    assert,
  }) => {
    const guest = client()
    for (const path of ['/giris', '/kayit', '/kaydedilenler', '/seriler?search=naruto']) {
      const html = await guest.page(path)
      assert.equal(metaOf(html, 'robots'), 'noindex, follow', path)
      assert.isNull(canonicalOf(html), path)
    }
    const missing = await guest.request('/series/seo-manga/boyle-bir-seri-yok')
    assert.equal(missing.status, 404)
    assert.include(await missing.text(), '<meta name="robots" content="noindex">')

    assert.equal(canonicalOf(await guest.page('/seriler')), `${base}/seriler`)
    assert.equal(canonicalOf(await guest.page('/seriler?page=2')), `${base}/seriler?page=2`)
    assert.equal(canonicalOf(await guest.page('/seriler?genre=aksiyon&page=2')), `${base}/seriler`)
    assert.equal(canonicalOf(await guest.page('/seriler?utm_medium=x')), `${base}/seriler`)

    // Home: WebSite with the catalog search.
    const home = await guest.page('/?utm_campaign=x')
    assert.equal(canonicalOf(home), `${base}/`)
    const website = jsonLdOf(home).find((document) => document['@type'] === 'WebSite')
    assert.equal(website.url, `${base}/`)
    assert.equal(
      website.potentialAction.target.urlTemplate,
      `${base}/seriler?search={search_term_string}`
    )
    assert.equal(website.potentialAction['query-input'], 'required name=search_term_string')

    // Staff previews of drafts and the admin panel are not indexed.
    const admin = client()
    await admin.login('seo_admin')
    const draft = await admin.page('/series/seo-manga/seo-taslak')
    assert.include(draft, 'Taslak seri')
    assert.equal(metaOf(draft, 'robots'), 'noindex, follow')
    assert.lengthOf(jsonLdOf(draft), 0)
    const draftChapter = await admin.page('/series/seo-manga/seo-acik/2')
    assert.equal(metaOf(draftChapter, 'robots'), 'noindex, follow')
    assert.include(await admin.page('/admin'), '<meta name="robots" content="noindex">')
    // The chapter notice is a gate as well.
    const notice = await guest.page('/series/seo-manga/seo-acik/4')
    assert.equal(metaOf(notice, 'robots'), 'noindex, follow')
  })

  test('RSS feeds list released public chapters', async ({ assert }) => {
    const response = await client().request('/rss.xml')
    assert.equal(response.status, 200)
    assert.include(response.headers.get('content-type') || '', 'application/rss+xml')
    const xml = await response.text()
    assert.include(xml, '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    assert.include(xml, `<atom:link href="${base}/rss.xml" rel="self"`)
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1])
    const open = items.filter((item) => item.includes('/series/seo-manga/'))
    assert.lengthOf(open, 1)
    const [item] = open
    assert.include(
      item,
      '<title>Açık &lt;/script&gt;&lt;b&gt; &amp; &quot;Seri&quot; — Bölüm 1</title>'
    )
    assert.include(item, `<link>${base}/series/seo-manga/seo-acik/1</link>`)
    assert.include(item, `<guid isPermaLink="true">${base}/series/seo-manga/seo-acik/1</guid>`)
    assert.match(item, /<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/)
    assert.include(item, 'İlk adım')
    for (const slug of ['seo-taslak', 'seo-yetiskin', 'seo-genc', 'seo-uyeler'])
      assert.notInclude(xml, slug)

    // One series: its own feed (not taken for a chapter number), drafts 404, gated ones empty.
    const own = await client().request('/series/seo-manga/seo-acik/rss.xml')
    assert.equal(own.status, 200)
    assert.include(own.headers.get('content-type') || '', 'application/rss+xml')
    const ownXml = await own.text()
    assert.lengthOf([...ownXml.matchAll(/<item>/g)], 1)
    assert.include(ownXml, `<link>${base}/series/seo-manga/seo-acik</link>`)
    assert.equal(
      await client()
        .request('/series/seo-manga/seo-taslak/rss.xml')
        .then((r) => r.status),
      404
    )
    const adult = await client().page('/series/seo-manga/seo-yetiskin/rss.xml')
    assert.include(adult, '<channel>')
    assert.notInclude(adult, '<item>')
  })

  test('Site adresi is validated and saved without a trailing slash', async ({ assert }) => {
    const admin = client()
    await admin.login('seo_admin')
    const fields = { site_name: 'MangaHub', site_description: '', logo_url: '', favicon_url: '' }
    await admin.post(
      '/admin/tema/genel',
      { ...fields, site_url: 'https://manga.example/yol' },
      '/admin/tema/genel'
    )
    assert.equal(settings.get('site_url'), '')
    await admin.post(
      '/admin/tema/genel',
      { ...fields, site_url: 'https://manga.example/' },
      '/admin/tema/genel'
    )
    assert.equal(settings.get('site_url'), 'https://manga.example')
    assert.include(await admin.page('/admin/tema/genel'), 'value="https://manga.example"')
    await settings.save({ site_url: '' })
  })

  test('helpers: script-safe JSON and description clipping', ({ assert }) => {
    const json = scriptJson({ name: '</script><!-- &  ' })
    assert.notInclude(json, '<')
    assert.notInclude(json, '&')
    assert.deepEqual(JSON.parse(json), { name: '</script><!-- &  ' })
    assert.equal(clip('  bir   iki  '), 'bir iki')
    const long = clip('kelime '.repeat(60), 50)
    assert.isAtMost(long.length, 50)
    assert.isTrue(long.endsWith('kelime…'))
  })
})
