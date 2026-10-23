import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import Bookmark from '#models/bookmark'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'
import { badges, exp } from '#config/rewards'

const base = 'http://127.0.0.1:3334'
const password = 'reading-list-pass-1'

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
      cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
    return response
  }
  const page = (path: string) => request(path).then((response) => response.text())
  const login = async (identifier: string) => {
    const html = await page('/giris')
    const csrf = html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
    return request('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf, login: identifier, password }),
    })
  }
  const json = async (path: string, body: unknown) => {
    const html = await page('/')
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
  return { request, page, login, json }
}

/** EXP of the first real read: the read itself and the "İlk Adım" badge it earns. */
const firstReadExp = exp.chapterRead + badges.find((badge) => badge.slug === 'ilk-adim')!.exp

const body = (response: Response): Promise<any> => response.json()
const statusOf = (response: Promise<Response>) => response.then((result) => result.status)

const decode = (value: string) =>
  value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')

test.group('Reading list: statuses and read marks', (group) => {
  let type: ContentType
  let series: Series
  let draft: Series
  let other: Series
  const chapters: Record<number, Chapter> = {}
  const users: Record<string, User> = {}

  group.setup(async () => {
    clearAttempts()
    const timestamp = now()
    type = await ContentType.create({
      name: 'Okuma Listesi',
      slug: 'okuma-listesi',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const make = (slug: string, extra: Partial<Series> = {}) =>
      Series.create({
        title: `Liste ${slug}`,
        slug,
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
        ...extra,
      })
    series = await make('liste-ana')
    draft = await make('liste-taslak', { draft: true })
    other = await make('liste-diger')
    // 1–3 public, 4 members only, 5 VIP only, 6 draft.
    const extras: Record<number, Partial<Chapter>> = {
      4: { access: 'members' },
      5: { access: 'vip' },
      6: { draft: true },
    }
    for (let number = 1; number <= 6; number++)
      chapters[number] = await Chapter.create({
        seriesId: series.id,
        number,
        title: null,
        content: { type: 'images', pages: ['/images/no-cover.svg'] },
        publishedAt: '2026-10-01',
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extras[number],
      })
    for (const username of ['liste_uye', 'liste_iki', 'liste_misafir'])
      users[username] = await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role: 'member',
      })
  })

  group.each.setup(() => clearAttempts())

  group.teardown(async () => {
    await Series.query().whereIn('id', [series.id, draft.id, other.id]).delete()
    await User.query().whereIn('username', Object.keys(users)).delete()
    await type.delete()
  })

  test('statuses are saved, changed and validated', async ({ assert }) => {
    const member = client()
    await member.login('liste_uye')

    const saved = await member.json('/kutuphane/durum', {
      type: type.slug,
      slug: series.slug,
      status: 'plan',
    })
    assert.equal(saved.status, 200)
    assert.deepEqual(await body(saved), { saved: true, status: 'plan' })
    let bookmark = await Bookmark.query()
      .where({ userId: users.liste_uye.id, seriesId: series.id })
      .firstOrFail()
    assert.equal(bookmark.status, 'plan')

    await member.json('/kutuphane/durum', {
      type: type.slug,
      slug: series.slug,
      status: 'completed',
    })
    const rows = await Bookmark.query().where({ userId: users.liste_uye.id, seriesId: series.id })
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].status, 'completed')

    const invalid = await member.json('/kutuphane/durum', {
      type: type.slug,
      slug: series.slug,
      status: 'favorite',
    })
    assert.equal(invalid.status, 422)
    const hidden = await member.json('/kutuphane/durum', {
      type: type.slug,
      slug: draft.slug,
      status: 'plan',
    })
    assert.equal(hidden.status, 404)
    const guest = await client().json('/kutuphane/durum', {
      type: type.slug,
      slug: series.slug,
      status: 'plan',
    })
    assert.notEqual(guest.status, 200)

    // The plain "Kaydet" toggle saves as "reading".
    await member.json('/kutuphane/kaydet', { type: type.slug, slug: other.slug })
    bookmark = await Bookmark.query()
      .where({ userId: users.liste_uye.id, seriesId: other.id })
      .firstOrFail()
    assert.equal(bookmark.status, 'reading')

    // The series page shows the saved state and the status in the save button.
    const html = await member.page(`/series/${type.slug}/${series.slug}`)
    assert.include(html, 'data-status="completed"')
    assert.match(html, /bookmark-control__main[\s\S]*?aria-pressed="true"/)
    assert.include(html, 'Kaydedildi: </span><span x-text="label">Bitirdim</span>')
    assert.include(html, 'role="menuitemradio"')
  })

  test('the saved series page lists statuses and tabs', async ({ assert }) => {
    const member = client()
    await member.login('liste_uye')
    const html = await member.page('/kaydedilenler')
    const items = JSON.parse(decode(html.match(/data-items="([^"]*)"/)![1]))
    const savedStatus = (slug: string) => items.find((item: any) => item.slug === slug)?.status
    assert.equal(savedStatus(series.slug), 'completed')
    assert.equal(savedStatus(other.slug), 'reading')
    const statuses = JSON.parse(decode(html.match(/data-statuses="([^"]*)"/)![1]))
    assert.deepEqual(
      statuses.map((status: any) => status.key),
      ['reading', 'plan', 'completed', 'on_hold', 'dropped']
    )
    assert.include(html, 'Daha sonra okuyacağım')
    assert.include(html, 'data-bookmarks-filter')
    assert.include(html, 'Tümü')
  })

  test('guest bookmarks keep their status when moved into the account', async ({ assert }) => {
    const member = client()
    await member.login('liste_iki')
    // Already saved in the account: its own status stays.
    await member.json('/kutuphane/durum', { type: type.slug, slug: other.slug, status: 'dropped' })
    const response = await member.json('/kutuphane/aktar', {
      bookmarks: [
        { type: type.slug, slug: series.slug, status: 'on_hold' },
        { type: type.slug, slug: other.slug, status: 'completed' },
        { type: type.slug, slug: draft.slug, status: 'plan' },
      ],
      reads: [{ type: type.slug, slug: series.slug, chapters: [2] }],
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await body(response), { bookmarks: 1, reads: 1 })
    // Imported reads count like hand-made marks (no badges until opened).
    const imported = await db
      .from('chapter_reads')
      .where({ user_id: users.liste_iki.id, chapter_id: chapters[2].id })
      .first()
    assert.isTrue(Boolean(imported.marked))
    await db.from('chapter_reads').where('user_id', users.liste_iki.id).delete()
    const rows = await Bookmark.query().where('userId', users.liste_iki.id)
    const byId = new Map(rows.map((row) => [row.seriesId, row.status]))
    assert.equal(byId.get(series.id), 'on_hold')
    assert.equal(byId.get(other.id), 'dropped')
    assert.isFalse(byId.has(draft.id))

    // Unknown statuses from an edited browser copy fall back to "reading".
    await Bookmark.query().where('userId', users.liste_iki.id).delete()
    const fallback = await member.json('/kutuphane/aktar', {
      bookmarks: [{ type: type.slug, slug: series.slug, status: 'favourite' }],
    })
    assert.equal(fallback.status, 200)
    const row = await Bookmark.query()
      .where({ userId: users.liste_iki.id, seriesId: series.id })
      .firstOrFail()
    assert.equal(row.status, 'reading')
  })

  test('"mark all read" skips locked and draft chapters and gives no rewards', async ({
    assert,
  }) => {
    const member = client()
    await member.login('liste_misafir')
    const user = users.liste_misafir
    await user.refresh()
    const expBefore = user.exp

    // The series page offers marks only for chapters the member may open.
    const html = await member.page(`/series/${type.slug}/${series.slug}`)
    const progress = JSON.parse(decode(html.match(/data-progress="([^"]*)"/)![1]))
    assert.deepEqual(progress.markable.sort(), [1, 2, 3, 4])
    assert.include(html, 'Tümünü okundu işaretle')
    assert.equal((html.match(/class="chapter-row__toggle"/g) || []).length, 4)

    const response = await member.json('/kutuphane/okundu/tumu', {
      type: type.slug,
      slug: series.slug,
    })
    assert.equal(response.status, 200)
    const result = await body(response)
    assert.equal(result.added, 4)
    // The newest marked chapter becomes the last read one.
    assert.deepEqual(result.read, [4, 3, 2, 1])

    const reads = await db
      .from('chapter_reads')
      .where('user_id', user.id)
      .select('chapter_id', 'marked')
    assert.sameMembers(
      reads.map((row) => Number(row.chapter_id)),
      [1, 2, 3, 4].map((number) => chapters[number].id)
    )
    assert.isTrue(reads.every((row) => Boolean(row.marked)))

    // Repeating it adds nothing.
    const again = await member.json('/kutuphane/okundu/tumu', {
      type: type.slug,
      slug: series.slug,
    })
    const repeated = await body(again)
    assert.equal(repeated.added, 0)

    await user.refresh()
    assert.equal(user.exp, expBefore)
    const [cards] = await db.from('user_cards').where('user_id', user.id).count('* as total')
    assert.equal(Number(cards.total), 0)
    const [earned] = await db.from('user_badges').where('user_id', user.id).count('* as total')
    assert.equal(Number(earned.total), 0)

    // Opening a chapter that was only marked counts as the first real read.
    const opened = await member.request(`/series/${type.slug}/${series.slug}/2`)
    assert.equal(opened.status, 200)
    await user.refresh()
    assert.equal(user.exp, expBefore + firstReadExp)
    const row = await db
      .from('chapter_reads')
      .where({ user_id: user.id, chapter_id: chapters[2].id })
      .first()
    assert.isFalse(Boolean(row.marked))
    assert.isTrue(
      Boolean(await db.from('user_badges').where({ user_id: user.id, badge: 'ilk-adim' }).first())
    )

    // Drafts and missing series are refused.
    const hidden = await member.json('/kutuphane/okundu/tumu', {
      type: type.slug,
      slug: draft.slug,
    })
    assert.equal(hidden.status, 404)
  })

  test('single chapters are marked and unmarked; unmarking gives no second reward', async ({
    assert,
  }) => {
    const member = client()
    await member.login('liste_iki')
    const user = users.liste_iki
    const mark = (chapter: number, read: boolean) =>
      member.json('/kutuphane/okundu', { type: type.slug, slug: series.slug, chapter, read })

    // VIP and draft chapters cannot be marked by a member.
    assert.equal(await statusOf(mark(5, true)), 403)
    assert.equal(await statusOf(mark(6, true)), 403)
    assert.equal(await statusOf(mark(99, true)), 403)
    assert.equal(await statusOf(mark(1, 'evet' as any)), 422)

    const marked = await mark(3, true)
    assert.equal(marked.status, 200)
    assert.deepEqual(await body(marked), { read: true, chapters: [3] })
    await user.refresh()
    const expBefore = user.exp

    // Open chapter 1 for real (+EXP), unmark it, open it again: no second reward.
    await member.request(`/series/${type.slug}/${series.slug}/1`)
    await user.refresh()
    assert.equal(user.exp, expBefore + firstReadExp)
    const unmarked = await mark(1, false)
    const afterUnmark = await body(unmarked)
    assert.deepEqual(afterUnmark.chapters, [3])
    assert.isNull(
      await db.from('chapter_reads').where({ user_id: user.id, chapter_id: chapters[1].id }).first()
    )
    clearAttempts()
    await member.request(`/series/${type.slug}/${series.slug}/1`)
    await user.refresh()
    assert.equal(user.exp, expBefore + firstReadExp)
    // Read again, so it is in the list without a second reward.
    assert.isNotNull(
      await db.from('chapter_reads').where({ user_id: user.id, chapter_id: chapters[1].id }).first()
    )

    // Unmarking a chapter that was only marked by hand needs no memory.
    await mark(3, false)
    assert.isNull(
      await db
        .from('unmarked_reads')
        .where({ user_id: user.id, chapter_id: chapters[3].id })
        .first()
    )
    // "Mark all" keeps the newest chapter as the last read one even when it was read before.
    await mark(4, true)
    await mark(2, true)
    const all = await member.json('/kutuphane/okundu/tumu', { type: type.slug, slug: series.slug })
    const result = await body(all)
    assert.equal(result.added, 1)
    assert.equal(result.read[0], 4)

    const guest = await client().json('/kutuphane/okundu', {
      type: type.slug,
      slug: series.slug,
      chapter: 1,
      read: true,
    })
    assert.notEqual(guest.status, 200)
  })
})
