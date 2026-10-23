import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import reader from '#config/reader'
import readerService from '#services/reader_service'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'reader-pass-123'

/** Cookie-aware client with form logins and JSON posts carrying the page's CSRF token. */
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
      const value = pair.slice(index + 1)
      if (value) cookies.set(pair.slice(0, index), value)
      else cookies.delete(pair.slice(0, index))
    }
    return response
  }
  const text = (path: string) => request(path).then((response) => response.text())
  const login = async (name: string) => {
    const html = await text('/giris')
    const token = html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
    return request('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: token, login: name, password }),
    })
  }
  let token = ''
  const json = async (path: string, body: unknown) => {
    if (!token) {
      const html = await text('/')
      token = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
    }
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
  const status = (path: string, body: unknown) => json(path, body).then((r) => r.status)
  return { request, text, login, json, status, cookies }
}

/** Server-rendered reader layout: mode, size, direction, account settings and resume page. */
function layoutOf(html: string) {
  const tag = /<div class="reader" [^>]*>/s.exec(html)?.[0] || ''
  const config = /data-config="([^"]*)"/.exec(tag)?.[1] || '{}'
  const account = /data-reader-account="([^"]*)"/.exec(tag)?.[1]
  const decode = (value: string) => JSON.parse(value.replaceAll('&quot;', '"'))
  return {
    mode: /data-mode="(\w+)"/.exec(tag)?.[1],
    dir: /data-dir="(\w+)"/.exec(tag)?.[1],
    zoom: /--reader-zoom: ([\d.]+)/.exec(tag)?.[1],
    account: account ? decode(account) : null,
    resume: decode(config).resume as number | null,
  }
}

const pages = Array.from({ length: 6 }, () => '/images/no-cover.svg')
const prefs = { mode: 'paged', zoom: 125, dir: 'rtl', font: 3, auto: true }
let series: Series
let chapter: Chapter
let vipChapter: Chapter
let draftChapter: Chapter
let member: User
const chapterUrl = (number: number) => `/series/okuyucu-test/${series.slug}/${number}`
const expOf = (user: User) => User.findOrFail(user.id).then((row) => Number(row.exp))
async function readsOf(user: User) {
  const rows = await db.from('chapter_reads').where('user_id', user.id).count('* as n')
  return Number(rows[0].n)
}

test.group('Reader: settings, direction and reading position', (group) => {
  group.setup(async () => {
    clearAttempts()
    const timestamp = now()
    const type = await ContentType.create({ name: 'Okuyucu Test', slug: 'okuyucu-test' })
    series = await Series.create({
      title: 'Okuyucu Serisi',
      slug: 'okuyucu-serisi',
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
    const make = (number: number, extra: Partial<Chapter> = {}) =>
      Chapter.create({
        seriesId: series.id,
        number,
        title: null,
        content: { type: 'images', pages },
        publishedAt: '2026-10-01',
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      })
    chapter = await make(1)
    await make(2)
    vipChapter = await make(3, { access: 'vip' })
    draftChapter = await make(4, { draft: true })
    member = await User.create({
      email: 'okuyucu-p3@example.com',
      username: 'okuyucu_p3',
      role: 'member',
      fullName: 'Okur',
      password,
    })
  })

  group.each.setup(() => clearAttempts())

  test('the reader cookie keeps old values and adds the reading direction', ({ assert }) => {
    const view = (value: unknown) => readerService.viewOfCookie(value)
    assert.deepEqual(view(undefined), { mode: 'webtoon', zoom: 100, dir: 'ltr' })
    assert.deepEqual(view('paged-150'), { mode: 'paged', zoom: 150, dir: 'ltr' })
    assert.deepEqual(view('webtoon-80'), { mode: 'webtoon', zoom: 80, dir: 'ltr' })
    assert.deepEqual(view('paged-125-rtl'), { mode: 'paged', zoom: 125, dir: 'rtl' })
    assert.deepEqual(view('paged-125-ltr'), { mode: 'paged', zoom: 125, dir: 'ltr' })
    assert.deepEqual(view('paged-999-rtl'), { mode: 'paged', zoom: 100, dir: 'rtl' })
    assert.deepEqual(view('paged-10'), { mode: 'paged', zoom: 100, dir: 'ltr' })
    for (const bad of ['paged-125-up', 'sideways-100', 'paged', 'paged-125-rtl-x', 42])
      assert.deepEqual(view(bad), { mode: 'webtoon', zoom: 100, dir: 'ltr' })

    assert.deepEqual(readerService.normalize({ mode: 'x', zoom: 33, dir: 'up', font: 9 }), {
      mode: 'webtoon',
      zoom: reader.defaultZoom,
      dir: 'ltr',
      font: reader.defaultFont,
      auto: false,
    })
    assert.deepEqual(readerService.normalize(prefs), prefs)
  })

  test('guests get the layout and direction from the cookie', async ({ assert }) => {
    const guest = client()
    assert.deepInclude(layoutOf(await guest.text(chapterUrl(1))), {
      mode: 'webtoon',
      dir: 'ltr',
      zoom: '1',
      account: null,
      resume: null,
    })
    guest.cookies.set('reader', 'paged-150-rtl')
    const html = await guest.text(chapterUrl(1))
    assert.deepInclude(layoutOf(html), { mode: 'paged', dir: 'rtl', zoom: '1.5', account: null })
    assert.include(html, 'Bölüm bitince sonrakine geç')
    assert.include(html, 'Sağdan sola')
  })

  test('settings are saved with the account, checked and rate limited', async ({ assert }) => {
    const guest = client()
    assert.equal(await guest.status('/okuyucu/tercihler', prefs), 401)

    const user = client()
    await user.login('okuyucu_p3')
    for (const bad of [
      { ...prefs, zoom: 33 },
      { ...prefs, mode: 'double' },
      { ...prefs, dir: 'up' },
      { ...prefs, font: 6 },
      { ...prefs, auto: 'yes' },
      { mode: 'paged' },
    ])
      assert.equal(await user.status('/okuyucu/tercihler', bad), 422, JSON.stringify(bad))

    const saved = await user.json('/okuyucu/tercihler', prefs)
    assert.equal(saved.status, 200)
    const body = (await saved.json()) as { prefs: unknown }
    assert.deepEqual(body.prefs, prefs)
    const row = await db.from('users').where('id', member.id).select('reader_prefs').first()
    assert.deepEqual(JSON.parse(row.reader_prefs), prefs)

    // The account's settings win over this browser's cookie, and reach the page for reader.js.
    user.cookies.set('reader', 'webtoon-100')
    const layout = layoutOf(await user.text(chapterUrl(1)))
    assert.deepInclude(layout, { mode: 'paged', dir: 'rtl', zoom: '1.25' })
    assert.deepEqual(layout.account, prefs)

    clearAttempts()
    let limited = 0
    for (let i = 0; i < reader.prefsPerMinute + 1; i++)
      if ((await user.status('/okuyucu/tercihler', prefs)) === 429) limited++
    assert.equal(limited, 1)
  })

  test('the reading position is saved for opened chapters without new rewards', async ({
    assert,
  }) => {
    const guest = client()
    assert.equal(await guest.status('/okuyucu/konum', { chapter: chapter.id, page: 3 }), 401)

    await db.from('chapter_reads').where('user_id', member.id).delete()
    const user = client()
    await user.login('okuyucu_p3')
    // Not opened yet: nothing to remember.
    assert.equal(await user.status('/okuyucu/konum', { chapter: chapter.id, page: 3 }), 404)

    await user.text(chapterUrl(1))
    const exp = await expOf(member)
    const reads = await readsOf(member)
    const saved = await user.json('/okuyucu/konum', { chapter: chapter.id, page: 3 })
    assert.equal(saved.status, 200)
    assert.deepEqual(await saved.json(), { page: 3 })
    const row = await db
      .from('chapter_reads')
      .where({ user_id: member.id, chapter_id: chapter.id })
      .first()
    assert.equal(Number(row.last_page), 3)
    assert.equal(await expOf(member), exp)
    assert.equal(await readsOf(member), reads)

    for (const bad of [
      { chapter: chapter.id, page: 7 },
      { chapter: chapter.id, page: 0 },
      { chapter: chapter.id, page: 2.5 },
      { chapter: 'x', page: 2 },
    ])
      assert.equal(await user.status('/okuyucu/konum', bad), 422, JSON.stringify(bad))
    assert.equal(await user.status('/okuyucu/konum', { chapter: 999999, page: 2 }), 404)

    // A chapter that became VIP or a draft after it was read takes no position.
    for (const locked of [vipChapter, draftChapter])
      await db.table('chapter_reads').insert({
        user_id: member.id,
        series_id: series.id,
        chapter_id: locked.id,
        read_at: now(),
      })
    assert.equal(await user.status('/okuyucu/konum', { chapter: vipChapter.id, page: 2 }), 403)
    assert.equal(await user.status('/okuyucu/konum', { chapter: draftChapter.id, page: 2 }), 404)

    // Opening the chapter again offers "Kaldığın yer" and grants nothing new.
    const html = await user.text(chapterUrl(1))
    assert.equal(layoutOf(html).resume, 3)
    assert.include(html, 'Kaldığın yer')
    assert.equal(await expOf(member), exp)

    // The first and the last page are not worth a prompt; a missing row gives none either.
    await user.json('/okuyucu/konum', { chapter: chapter.id, page: pages.length })
    assert.isNull(layoutOf(await user.text(chapterUrl(1))).resume)
    assert.isNull(layoutOf(await user.text(chapterUrl(2))).resume)

    clearAttempts()
    let limited = 0
    for (let i = 0; i < reader.positionsPerMinute + 1; i++)
      if ((await user.status('/okuyucu/konum', { chapter: chapter.id, page: 2 })) === 429) limited++
    assert.equal(limited, 1)
  })
})
