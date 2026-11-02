import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import mentions from '#services/mention_service'
import settings from '#services/settings_service'
import { flagKey } from '#services/theme_service'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const json = (response: Promise<Response>): Promise<any> => response.then((result) => result.json())
const statusOf = (response: Promise<Response>) => response.then((result) => result.status)
const password = 'engage-pass-123'

/** Cookie-aware client: form logins, JSON posts with the page's CSRF token. */
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
  const page = (path: string) =>
    request(path, { headers: { accept: 'text/html' } }).then((response) => response.text())
  // The session's CSRF token, fetched once and again after signing in (the session renews).
  let csrf = ''
  const token = async () => {
    if (!csrf)
      csrf = await page('/kaydedilenler').then(
        (html) => html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
      )
    return csrf
  }
  const login = async (identifier: string) => {
    const response = await request('/giris', {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: new URLSearchParams({ login: identifier, password }),
    })
    csrf = ''
    return response
  }
  const send = async (path: string, body: Record<string, unknown>) =>
    request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  /** POST /yorumlar as multipart, like the composer. */
  const comment = async (fields: Record<string, string>) => {
    const body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.set(key, value)
    return request('/yorumlar', {
      method: 'POST',
      body,
      headers: { 'x-csrf-token': await token() },
    })
  }
  return { request, page, login, send, comment }
}

const names = [
  'etk_okur',
  'etk_iki',
  'etk_editor',
  'etk_vipsiz',
  'etk_uye_a',
  'etk_uye_b',
  'etk_uye_c',
  'etk_uye_d',
  'etk_ban',
]
const users: Record<string, User> = {}
let series: Series
let chapter: Chapter
let draftChapter: Chapter
let vipChapter: Chapter
let chapterUrl: string

async function inbox(username: string) {
  return db
    .from('notifications')
    .where('user_id', users[username].id)
    .where('title', 'like', '%seni bir yorumda andı')
}

test.group('Chapter reactions, comment edits, mentions and the phone tab bar', (group) => {
  group.setup(async () => {
    clearAttempts()
    const timestamp = now()
    const type = await ContentType.create({ name: 'Etkileşim', slug: 'etkilesim' })
    series = await Series.create({
      title: 'Etkileşim Testi',
      slug: 'etkilesim-testi',
      description: 'Test',
      contentTypeId: type.id,
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2025,
      alternativeTitles: [],
      coverImage: '/images/no-cover.svg',
      featured: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const make = (number: number, extra: Partial<Chapter> = {}) =>
      Chapter.create({
        seriesId: series.id,
        number,
        title: null,
        content: { type: 'images', pages: ['/images/no-cover.svg'] },
        publishedAt: '2026-10-01',
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      })
    chapter = await make(1)
    draftChapter = await make(2, { draft: true })
    vipChapter = await make(3, { access: 'vip' })
    chapterUrl = `/series/etkilesim/etkilesim-testi/1`
    for (const username of names)
      users[username] = await User.create({
        username,
        email: `${username}@engage.example.com`,
        fullName: username === 'etk_iki' ? 'İkinci <Okur>' : username,
        password,
        role: username === 'etk_editor' ? 'editor' : 'member',
      })
    await db.from('users').where('id', users.etk_ban.id).update({ banned_at: timestamp })
  })
  group.each.setup(() => clearAttempts())
  group.teardown(async () => {
    await settings.save({ [flagKey('mobile_bottom_nav')]: '', [flagKey('chapter_reactions')]: '' })
    await db.from('series').where('id', series.id).delete()
    await db
      .from('users')
      .whereIn(
        'id',
        Object.values(users).map((user) => user.id)
      )
      .delete()
  })

  test('members set, change and remove one reaction per chapter', async ({ assert }) => {
    assert.equal(
      await statusOf(client().send(`/bolumler/${chapter.id}/tepki`, { reaction: 'like' })),
      401
    )

    const web = client()
    await web.login('etk_okur')
    const path = `/bolumler/${chapter.id}/tepki`
    let result = await json(web.send(path, { reaction: 'like' }))
    assert.equal(result.counts.like, 1)
    assert.equal(result.total, 1)
    assert.equal(result.mine, 'like')

    result = await json(web.send(path, { reaction: 'love' }))
    assert.deepInclude(result, { mine: 'love', total: 1 })
    assert.equal(result.counts.like, 0)
    assert.equal(result.counts.love, 1)

    const other = client()
    await other.login('etk_iki')
    result = await json(other.send(path, { reaction: 'love' }))
    assert.equal(result.counts.love, 2)

    // The same reaction again changes nothing; an empty one removes it.
    result = await json(web.send(path, { reaction: 'love' }))
    assert.equal(result.counts.love, 2)
    result = await json(web.send(path, { reaction: '' }))
    assert.deepInclude(result, { mine: null, total: 1 })
    const [row] = await db
      .from('chapter_reactions')
      .where('chapter_id', chapter.id)
      .count('* as total')
    assert.equal(Number(row.total), 1)

    assert.equal(await statusOf(web.send(path, { reaction: 'angry' })), 422)
    assert.equal(
      await statusOf(web.send(`/bolumler/${draftChapter.id}/tepki`, { reaction: 'like' })),
      403
    )
    assert.equal(
      await statusOf(web.send(`/bolumler/${vipChapter.id}/tepki`, { reaction: 'like' })),
      403
    )
    assert.equal(await statusOf(web.send('/bolumler/999999/tepki', { reaction: 'like' })), 404)

    // The reader shows the counts and the viewer's choice; guests get the sign-in prompt.
    const html = await other.page(chapterUrl)
    assert.include(html, 'Bölüm nasıldı?')
    assert.match(html, /data-key="love"\s+aria-pressed="true"/)
    const guestHtml = await client().page(chapterUrl)
    assert.include(guestHtml, 'Tepki vermek için')
    assert.include(guestHtml, '1 tepki')

    await settings.save({ [flagKey('chapter_reactions')]: '0' })
    assert.notInclude(await client().page(chapterUrl), 'Bölüm nasıldı?')
    await settings.save({ [flagKey('chapter_reactions')]: '' })
  }).timeout(90000)

  test('mentions link existing accounts safely and notify them once', async ({ assert }) => {
    const known = new Set(['etk_iki'])
    assert.equal(
      mentions.render('Selam @etk_iki <script>alert(1)</script> & @yokboyle, a@etk_iki.com', known),
      'Selam <a href="/uye/etk_iki" class="mention">@etk_iki</a> &lt;script&gt;alert(1)&lt;/script&gt; &amp; @yokboyle, a@etk_iki.com'
    )
    assert.equal(
      mentions.render('"@ETK_IKI"', known),
      '&quot;<a href="/uye/etk_iki" class="mention">@ETK_IKI</a>&quot;'
    )
    assert.deepEqual(mentions.extract('@a1b @x @ab_c @AB_C mail@abc @toolongusername_123456'), [
      'a1b',
      'ab_c',
    ])

    const web = client()
    await web.login('etk_okur')
    const post = (fields: Record<string, string>) =>
      web.comment({ series_id: String(series.id), ...fields })

    const created = await json(
      post({ body: 'Bak @etk_iki @etk_iki @etk_okur @etk_ban @yokboyle <b>kalın</b>' })
    )
    assert.include(created.bodyHtml, '<a href="/uye/etk_iki" class="mention">@etk_iki</a>')
    assert.include(created.bodyHtml, '<a href="/uye/etk_okur" class="mention">@etk_okur</a>')
    assert.include(created.bodyHtml, '@etk_ban')
    assert.notInclude(created.bodyHtml, '/uye/etk_ban')
    assert.notInclude(created.bodyHtml, '/uye/yokboyle')
    assert.include(created.bodyHtml, '&lt;b&gt;kalın&lt;/b&gt;')
    assert.lengthOf(await inbox('etk_iki'), 1)
    assert.lengthOf(await inbox('etk_okur'), 0)
    assert.lengthOf(await inbox('etk_ban'), 0)
    const [notice] = await inbox('etk_iki')
    assert.equal(notice.link, `/series/etkilesim/etkilesim-testi#yorumlar`)

    // A reply already notifies the parent's author; the mention does not add a second notice.
    const other = client()
    await other.login('etk_iki')
    const root = await json(other.comment({ series_id: String(series.id), body: 'Kök yorum' }))
    await post({ body: 'Katılıyorum @etk_iki', parent_id: String(root.id) })
    assert.lengthOf(await inbox('etk_iki'), 1)
    const replies = await db
      .from('notifications')
      .where('user_id', users.etk_iki.id)
      .where('title', 'like', '%yorumuna yanıt verdi')
    assert.lengthOf(replies, 1)

    // Only the first five names count.
    await post({ body: '@etk_uye_a @etk_uye_b @etk_uye_c @etk_uye_d @etk_editor @etk_vipsiz' })
    for (const name of ['etk_uye_a', 'etk_uye_b', 'etk_uye_c', 'etk_uye_d', 'etk_editor'])
      assert.lengthOf(await inbox(name), 1, name)
    assert.lengthOf(await inbox('etk_vipsiz'), 0)

    // Nobody hears about a thread they cannot open (a VIP chapter written in by staff).
    const staff = client()
    await staff.login('etk_editor')
    const vipComment = staff.comment({
      series_id: String(series.id),
      chapter_id: String(vipChapter.id),
      body: 'VIP bölümde @etk_vipsiz',
    })
    assert.equal(await statusOf(vipComment), 201)
    assert.lengthOf(await inbox('etk_vipsiz'), 0)

    // The thread listing links mentions too.
    const list = await json(fetch(`${base}/yorumlar?series=${series.id}`))
    const listed = list.items.find((item: { id: number }) => item.id === created.id)
    assert.equal(listed.bodyHtml, created.bodyHtml)
  }).timeout(90000)

  test('authors edit their own comments within the window', async ({ assert }) => {
    const web = client()
    await web.login('etk_okur')
    const created = await json(web.comment({ series_id: String(series.id), body: 'İlk hâli' }))
    assert.isTrue(created.canEdit)
    assert.isNull(created.editedAt)

    const path = `/yorumlar/${created.id}/duzenle`
    const edited = await json(web.send(path, { body: 'Yeni hâli @etk_uye_a', spoiler: '1' }))
    assert.equal(edited.body, 'Yeni hâli @etk_uye_a')
    assert.isTrue(edited.spoiler)
    assert.isString(edited.editedAt)
    assert.include(edited.bodyHtml, '/uye/etk_uye_a')
    // etk_uye_a was mentioned once before (previous test) and once by this edit.
    assert.lengthOf(await inbox('etk_uye_a'), 2)
    await web.send(path, { body: 'Yeni hâli @etk_uye_a yine' })
    assert.lengthOf(await inbox('etk_uye_a'), 2)

    assert.equal(await statusOf(web.send(path, { body: '   ' })), 422)

    const other = client()
    await other.login('etk_iki')
    assert.equal(await statusOf(other.send(path, { body: 'Başkasının yorumu' })), 403)
    const staff = client()
    await staff.login('etk_editor')
    assert.equal(await statusOf(staff.send(path, { body: 'Moderatör' })), 403)
    assert.equal(await statusOf(client().send(path, { body: 'Misafir' })), 401)

    const list = await json(other.request(`/yorumlar?series=${series.id}`))
    const listed = list.items.find((item: { id: number }) => item.id === created.id)
    assert.isFalse(listed.canEdit)
    assert.isString(listed.editedAt)

    // After the edit window only deleting is left.
    await db.from('comments').where('id', created.id).update({ created_at: '2020-01-01 00:00:00' })
    assert.equal(await statusOf(web.send(path, { body: 'Çok geç' })), 403)
    const mine = await json(web.request(`/yorumlar?series=${series.id}`))
    const own = mine.items.find((item: { id: number }) => item.id === created.id)
    assert.isFalse(own.canEdit)
    assert.isTrue(own.canDelete)
  }).timeout(90000)

  test('the member search suggests usernames for mentions', async ({ assert }) => {
    assert.equal(await statusOf(client().request('/uyeler/ara?q=etk')), 401)
    const web = client()
    await web.login('etk_okur')
    const search = (q: string) =>
      json(web.request(`/uyeler/ara?q=${encodeURIComponent(q)}`)).then((data) => data.items)
    assert.deepEqual(await search('e'), [])
    const found = await search('etk_i')
    assert.lengthOf(found, 1)
    assert.deepInclude(found[0], { username: 'etk_iki', fullName: 'İkinci <Okur>', avatar: null })
    assert.isNumber(found[0].hue)
    const several: { username: string }[] = await search('@etk_uye_')
    assert.deepEqual(
      several.map((item) => item.username),
      ['etk_uye_a', 'etk_uye_b', 'etk_uye_c', 'etk_uye_d']
    )
    // "_" is literal, not a wildcard; suspended accounts are left out.
    assert.deepEqual(await search('etk_uyea'), [])
    assert.deepEqual(await search('etk_b'), [])
    assert.deepEqual(await search("x' or 1=1"), [])
  }).timeout(90000)

  test('the phone tab bar follows its switch and stays off admin pages', async ({ assert }) => {
    const guestHtml = await client().page('/')
    assert.include(guestHtml, 'class="bottom-nav"')
    assert.include(guestHtml, 'aria-label="Alt menü"')

    const staff = client()
    await staff.login('etk_editor')
    const home = await staff.page('/seriler')
    assert.match(home, /href="\/seriler" class="bottom-nav__item" aria-current=page/)
    assert.include(home, "$dispatch('open-inbox')")
    const admin = await staff.page('/admin')
    assert.include(admin, 'admin-sidebar')
    assert.notInclude(admin, 'bottom-nav')

    await settings.save({ [flagKey('mobile_bottom_nav')]: '0' })
    assert.notInclude(await client().page('/'), 'class="bottom-nav"')
    await settings.save({ [flagKey('mobile_bottom_nav')]: '' })
    assert.include(await client().page('/'), 'class="bottom-nav"')
  }).timeout(90000)
})
