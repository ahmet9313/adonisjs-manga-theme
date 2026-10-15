import { test } from '@japa/runner'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import db from '@adonisjs/lucid/services/db'
import contentConfig from '#config/content'
import { badges } from '#config/rewards'
import Chapter from '#models/chapter'
import Comment from '#models/comment'
import ContentType from '#models/content_type'
import Series from '#models/series'
import User from '#models/user'
import cosmetics from '#services/cosmetic_service'
import { now } from '#services/input_service'
import progress from '#services/progress_service'
import { clearAttempts } from '#services/throttle'
import {
  buildCommunity,
  clearCommunity,
  DEMO_EMAIL_DOMAIN,
  DEMO_PASSWORD,
  equipRealAccounts,
} from '#database/demo/community'
import { createRng } from '#database/demo/rng'

const base = 'http://127.0.0.1:3334'
const password = 'social-pass-123'
const html = { headers: { accept: 'text/html' } }

type Query = PromiseLike<Record<string, any>[]>

const jsonOf = async (response: Promise<Response>): Promise<any> => {
  const result = await response
  return result.json()
}
const statusOf = async (response: Promise<Response>) => {
  const result = await response
  return result.status
}
const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}
const one = async (query: Query) => {
  const [item] = await query
  return item
}
/** `select count(*)` for a table with optional equality filters. */
const countOf = async (table: string, where: Record<string, unknown> = {}) => {
  const [item] = await db.from(table).where(where).count('* as total')
  return Number(item.total)
}
/** Runs raw SQL that selects a single `c` column. */
const scalar = async (sql: string) => {
  const result: any = await db.rawQuery(sql)
  const rows = Array.isArray(result) ? result : (result.rows ?? result[0] ?? [])
  return Number(rows[0]?.c ?? 0)
}
const userBy = (username: string) => User.findByOrFail('username', username)

/** Cookie-aware client; the CSRF token comes from the page's meta tag. */
function client(secret = password) {
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
  const token = async () => {
    const page = await textOf(request('/kaydedilenler', html))
    return page.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  }
  const login = async (identifier: string) =>
    request('/giris', {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: new URLSearchParams({ login: identifier, password: secret }),
    })
  const post = async (path: string, fields: Record<string, string> = {}) =>
    request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': await token() },
      body: new URLSearchParams(fields),
    })
  const comment = async (fields: Record<string, string>) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    return request('/yorumlar', {
      method: 'POST',
      body: form,
      headers: { 'x-csrf-token': await token() },
    })
  }
  return { request, login, post, comment }
}

async function makeSeries(slug: string, chapterCount = 0) {
  const type = await ContentType.firstOrCreate({ slug: 'manga' }, { name: 'Manga', slug: 'manga' })
  const timestamp = now()
  const series = await Series.create({
    title: `Sosyal ${slug}`,
    slug,
    description: 'Test',
    contentTypeId: type.id,
    status: 'Devam Ediyor',
    translationStatus: 'Aktif',
    publicationYear: 2025,
    alternativeTitles: ['Alt Başlık'],
    coverImage: '/images/no-cover.svg',
    featured: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const chapters: Chapter[] = []
  for (let number = 1; number <= chapterCount; number++)
    chapters.push(
      await Chapter.create({
        seriesId: series.id,
        number,
        title: `Bölüm ${number}`,
        content: { type: 'images', pages: ['/images/no-cover.svg'] },
        publishedAt: '2026-10-01',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    )
  return { series, chapters }
}

const makeUser = (username: string, role: 'member' | 'editor' | 'admin' = 'member') =>
  User.create({ username, email: `${username}@example.com`, fullName: username, password, role })

const reviewIdOf = async (username: string, seriesId: number) => {
  const item = await one(
    db
      .from('series_reviews')
      .join('users', 'users.id', 'series_reviews.user_id')
      .where({ 'users.username': username, 'series_reviews.series_id': seriesId })
      .select('series_reviews.id')
  )
  return Number(item.id)
}

test.group('Ratings and reviews', (group) => {
  let target: Series
  const others: Series[] = []

  group.setup(async () => {
    clearAttempts()
    const made = await makeSeries('sosyal-puan')
    target = made.series
    for (const slug of ['sosyal-b', 'sosyal-c', 'sosyal-d', 'sosyal-e']) {
      const extra = await makeSeries(slug)
      others.push(extra.series)
    }
    for (const name of ['puanci_a', 'puanci_b', 'puanci_c']) await makeUser(name)
    await makeUser('puan_editor', 'editor')
  })
  group.each.setup(() => clearAttempts())

  test('guests read ratings but cannot rate; input is validated', async ({ assert }) => {
    const listing = await jsonOf(fetch(`${base}/incelemeler?series=${target.id}`))
    assert.deepEqual(listing.items, [])
    assert.deepEqual(
      { count: listing.summary.count, average: listing.summary.average },
      { count: 0, average: 0 }
    )
    assert.lengthOf(listing.summary.distribution, 10)
    assert.isNull(listing.mine ?? null)
    const invalid = await statusOf(
      fetch(`${base}/incelemeler?series=abc`, { headers: { accept: 'application/json' } })
    )
    assert.equal(invalid, 422)

    const guest = await client().post('/incelemeler', { series_id: String(target.id), rating: '8' })
    assert.include([302, 401, 403], guest.status)

    const web = client()
    await web.login('puanci_a')
    const bad: Record<string, string>[] = [
      { series_id: String(target.id), rating: '0' },
      { series_id: String(target.id), rating: '11' },
      { series_id: String(target.id), rating: '7.5' },
      { series_id: String(target.id) },
      { series_id: String(target.id), rating: '8', body: 'kısa' },
      { series_id: String(target.id), rating: '8', title: 'x'.repeat(81) },
      { series_id: '999999', rating: '8' },
    ]
    for (const fields of bad)
      assert.include([404, 422], await statusOf(web.post('/incelemeler', fields)))
    assert.equal(await countOf('series_reviews'), 0)
  })

  test('a rating counts once per reader, updates the series and earns EXP only the first time', async ({
    assert,
  }) => {
    const web = client()
    await web.login('puanci_a')
    const before = await userBy('puanci_a')
    assert.equal(before.exp, 0)

    const created = await web.post('/incelemeler', { series_id: String(target.id), rating: '8' })
    assert.equal(created.status, 201)
    const first: any = await created.json()
    assert.isTrue(first.created)
    assert.equal(first.mine.rating, 8)
    assert.equal(first.mine.ratingLabel, 'Harika')
    assert.deepEqual(
      {
        count: first.summary.count,
        average: first.summary.average,
        written: first.summary.written,
      },
      { count: 1, average: 8, written: 0 }
    )
    assert.equal(first.summary.distribution[7], 1)
    const afterFirst = await userBy('puanci_a')
    assert.equal(afterFirst.exp, 15)

    // Editing (now with text) changes it in place and gives no new EXP.
    const edited = await web.post('/incelemeler', {
      series_id: String(target.id),
      rating: '6',
      title: 'İlk izlenim',
      body: 'Başı yavaş ama fena değil, devam edeceğim.',
    })
    assert.equal(edited.status, 200)
    const second: any = await edited.json()
    assert.isFalse(second.created)
    assert.deepEqual(
      {
        count: second.summary.count,
        average: second.summary.average,
        written: second.summary.written,
      },
      { count: 1, average: 6, written: 1 }
    )
    const afterEdit = await userBy('puanci_a')
    assert.equal(afterEdit.exp, 15)
    assert.equal(await countOf('series_reviews', { user_id: before.id }), 1)

    const fresh = await Series.findOrFail(target.id)
    assert.deepEqual([fresh.ratingAvg, fresh.ratingCount, fresh.reviewCount], [6, 1, 1])
  })

  test('reviews list, sort and filter; helpful votes toggle and notify the author', async ({
    assert,
  }) => {
    const b = client()
    await b.login('puanci_b')
    const spoiler = await b.post('/incelemeler', {
      series_id: String(target.id),
      rating: '10',
      title: 'Başyapıt',
      body: 'Sonu beklemediğim bir yere bağlandı, kesinlikle okunmalı.',
      spoiler: '1',
    })
    assert.equal(spoiler.status, 201)
    const c = client()
    await c.login('puanci_c')
    await c.post('/incelemeler', { series_id: String(target.id), rating: '4' })

    const ratings = (items: { rating: number }[]) => items.map((item) => item.rating)
    const high = await jsonOf(c.request(`/incelemeler?series=${target.id}&sort=high&text=0`))
    assert.deepEqual(ratings(high.items), [10, 6, 4])
    assert.deepEqual(
      { count: high.summary.count, average: high.summary.average, written: high.summary.written },
      { count: 3, average: 6.7, written: 2 }
    )
    assert.equal(high.mine.rating, 4)
    const low = await jsonOf(c.request(`/incelemeler?series=${target.id}&sort=low&text=0`))
    assert.deepEqual(ratings(low.items), [4, 6, 10])
    const written = await jsonOf(c.request(`/incelemeler?series=${target.id}&sort=new`))
    assert.sameMembers(ratings(written.items), [10, 6])
    const second = await jsonOf(c.request(`/incelemeler?series=${target.id}&sort=new&page=2`))
    assert.notProperty(second, 'summary')

    const review = high.items[0]
    assert.isTrue(review.spoiler)
    assert.equal(review.author.username, 'puanci_b')
    assert.isFalse(review.own)

    const vote = await jsonOf(c.post(`/incelemeler/${review.id}/faydali`))
    assert.deepEqual(vote, { voted: true, helpfulCount: 1 })
    const author = await userBy('puanci_b')
    const notice = await one(
      db
        .from('notifications')
        .where('user_id', author.id)
        .where('title', 'like', '%incelemeni faydalı buldu%')
    )
    assert.exists(notice)
    const seen = await jsonOf(c.request(`/incelemeler?series=${target.id}&sort=high&text=0`))
    assert.isTrue(seen.items[0].voted)
    assert.equal(seen.items[0].helpfulCount, 1)

    // Toggling removes the vote; authors cannot vote for themselves; guests cannot vote.
    const undone = await jsonOf(c.post(`/incelemeler/${review.id}/faydali`))
    assert.deepEqual(undone, { voted: false, helpfulCount: 0 })
    const own = await b.post(`/incelemeler/${review.id}/faydali`)
    assert.equal(own.status, 422)
    const guest = await client().post(`/incelemeler/${review.id}/faydali`)
    assert.include([302, 401, 403], guest.status)
    await c.post(`/incelemeler/${review.id}/faydali`)
    const stored = await one(db.from('series_reviews').where('id', review.id))
    assert.equal(stored.helpful_count, 1)
  })

  test('series page, catalog sorting and home cards show the ratings', async ({ assert }) => {
    const page = await textOf(fetch(`${base}/series/manga/${target.slug}`, html))
    assert.include(page, 'id="incelemeler"')
    assert.include(page, '(3 puan · 2 inceleme)')
    assert.include(page, 'Alt Başlık')
    assert.include(page, 'data-config=')

    // Weighted sort: two perfect votes beat one, which beats none.
    const a = client()
    await a.login('puanci_a')
    const b = client()
    await b.login('puanci_b')
    await a.post('/incelemeler', { series_id: String(others[0].id), rating: '10' })
    await b.post('/incelemeler', { series_id: String(others[0].id), rating: '10' })
    await a.post('/incelemeler', { series_id: String(others[1].id), rating: '10' })
    const catalog = await textOf(fetch(`${base}/seriler?order=rating&type=manga`, html))
    const position = (slug: string) => catalog.indexOf(`/series/manga/${slug}"`)
    assert.isAbove(position(others[1].slug), position(others[0].slug))
    assert.isAbove(position(others[2].slug), position(others[1].slug))
    assert.include(catalog, '★ 10.0')
    const votes = await textOf(fetch(`${base}/seriler?order=votes&type=manga`, html))
    assert.isAbove(
      votes.indexOf(`/series/manga/${others[1].slug}"`),
      votes.indexOf(`/series/manga/${others[0].slug}"`)
    )
    assert.include(await textOf(fetch(`${base}/`, html)), '★')
  })

  test('profiles list ratings; five written reviews earn the critic badge', async ({ assert }) => {
    const profile = await textOf(fetch(`${base}/uye/puanci_a`, html))
    for (const text of ['İncelemeler', 'Başı yavaş ama fena değil', 'Ortalama puan'])
      assert.include(profile, text)

    const user = await userBy('puanci_c')
    const web = client()
    await web.login('puanci_c')
    for (const item of [target, ...others]) {
      const status = await statusOf(
        web.post('/incelemeler', {
          series_id: String(item.id),
          rating: '7',
          body: 'Yeterince uzun bir inceleme metni.',
        })
      )
      assert.include([200, 201], status)
      clearAttempts()
    }
    const earned = await progress.earnedBadges(user.id)
    assert.isTrue(earned.has('elestirmen'))
    assert.isTrue(badges.some((badge) => badge.slug === 'elestirmen'))
    const fresh = await userBy('puanci_c')
    // Four first-time ratings (the one on `target` already existed) plus the badge bonus.
    assert.isAtLeast(fresh.exp, 4 * 15 + 100)
  })

  test('only authors and staff delete reviews; aggregates follow', async ({ assert }) => {
    const a = client()
    await a.login('puanci_a')
    const b = client()
    await b.login('puanci_b')
    const staff = client()
    await staff.login('puan_editor')

    const ofB = await reviewIdOf('puanci_b', target.id)
    const ofA = await reviewIdOf('puanci_a', target.id)
    const forbidden = await a.post(`/incelemeler/${ofB}/sil`)
    assert.equal(forbidden.status, 403)
    const removed = await jsonOf(a.post(`/incelemeler/${ofA}/sil`))
    assert.equal(removed.summary.count, 2)
    const byStaff = await jsonOf(staff.post(`/incelemeler/${ofB}/sil`))
    assert.equal(byStaff.summary.count, 1)
    const left = await Series.findOrFail(target.id)
    assert.deepEqual([left.ratingCount, left.ratingAvg], [1, 7])
    const gone = await b.post(`/incelemeler/${ofB}/sil`)
    assert.equal(gone.status, 404)
  })
})

test.group('Replies show what they answer', (group) => {
  let series: Series
  let chapter: Chapter

  group.setup(async () => {
    clearAttempts()
    const made = await makeSeries('sosyal-yanit', 1)
    series = made.series
    chapter = made.chapters[0]
    await makeUser('yanitci_a')
    await makeUser('yanitci_b')
  })
  group.each.setup(() => clearAttempts())

  test('every reply carries a preview of its parent; deletions are marked; counts are split', async ({
    assert,
  }) => {
    const a = client()
    await a.login('yanitci_a')
    const b = client()
    await b.login('yanitci_b')
    const sid = String(series.id)
    const root = await jsonOf(
      a.comment({ series_id: sid, body: 'Bu serinin animesi var mı, bilen var mı acaba?' })
    )
    const reply = await jsonOf(
      b.comment({ series_id: sid, parent_id: String(root.id), body: 'Var, geçen yıl çıktı.' })
    )
    const deeper = await jsonOf(
      a.comment({ series_id: sid, parent_id: String(reply.id), body: 'Teşekkürler!' })
    )
    assert.isNull(root.parent)
    assert.deepEqual(reply.parent, {
      id: root.id,
      deleted: false,
      username: 'yanitci_a',
      fullName: 'yanitci_a',
      excerpt: 'Bu serinin animesi var mı, bilen var mı acaba?',
    })
    assert.equal(reply.replyTo, 'yanitci_a')
    assert.equal(deeper.parent.username, 'yanitci_b')
    assert.equal(deeper.parent.excerpt, 'Var, geçen yıl çıktı.')

    const list = await jsonOf(fetch(`${base}/yorumlar?series=${series.id}`))
    assert.deepEqual(
      { total: list.total, roots: list.roots, replies: list.replies },
      { total: 3, roots: 1, replies: 2 }
    )
    assert.equal(list.items[0].replies[0].parent.id, root.id)
    const page = await jsonOf(fetch(`${base}/yorumlar/${reply.id}/yanitlar`))
    assert.equal(page.items[0].parent.id, reply.id)

    // Spoilers are described, not quoted; chapter threads are counted separately.
    const cid = String(chapter.id)
    const chapterRoot = await jsonOf(
      a.comment({ series_id: sid, chapter_id: cid, body: 'Bölüm çok iyiydi', spoiler: '1' })
    )
    const spoilerReply = await jsonOf(
      b.comment({
        series_id: sid,
        chapter_id: cid,
        parent_id: String(chapterRoot.id),
        body: 'Aynen!',
      })
    )
    assert.equal(spoilerReply.parent.excerpt, 'Spoiler içeren yorum')
    const chapterList = await jsonOf(
      fetch(`${base}/yorumlar?series=${series.id}&chapter=${chapter.id}`)
    )
    assert.deepEqual(
      { roots: chapterList.roots, replies: chapterList.replies },
      { roots: 1, replies: 1 }
    )

    // A deleted parent leaves a placeholder; the reply says it answered a deleted comment.
    const deleted = await jsonOf(a.post(`/yorumlar/${root.id}/sil`))
    assert.equal(deleted.deleted, 'soft')
    const after = await jsonOf(fetch(`${base}/yorumlar/${root.id}/yanitlar`))
    assert.deepEqual(after.items[0].parent, {
      id: root.id,
      deleted: true,
      username: null,
      fullName: null,
      excerpt: '',
    })
    const counted = await jsonOf(fetch(`${base}/yorumlar?series=${series.id}`))
    assert.deepEqual(
      { total: counted.total, roots: counted.roots, replies: counted.replies },
      { total: 2, roots: 0, replies: 2 }
    )
  })

  test('the profile shows replies with what they answered, plus reply statistics', async ({
    assert,
  }) => {
    const profile = await textOf(fetch(`${base}/uye/yanitci_b`, html))
    for (const text of ['kişisine yanıt', 'Yazdığı yanıt', 'Aldığı yanıt'])
      assert.include(profile, text)
    assert.match(profile, />Yanıt<\/span>/)
    const owner = await userBy('yanitci_a')
    const note = await one(
      db
        .from('notifications')
        .where('user_id', owner.id)
        .where('title', 'like', '%yorumuna yanıt verdi%')
    )
    assert.exists(note)
    const replies = await Comment.query().where('userId', owner.id).whereNotNull('parentId')
    assert.isAtLeast(replies.length, 1)
  })
})

test.group('Demo community', (group) => {
  const root = contentConfig.root
  const seriesIds: number[] = []

  group.setup(async () => {
    clearAttempts()
    for (let index = 1; index <= 5; index++) {
      const made = await makeSeries(`demo-seri-${index}`, 4)
      seriesIds.push(made.series.id)
    }
  })

  test('builds a consistent, reproducible community from the existing series', async ({
    assert,
  }) => {
    const options = { contentRoot: root, scale: 0.12, gifLimit: 3, realAccounts: false, seed: 5 }
    const report = await buildCommunity(options)
    assert.exists(report)
    assert.isAtLeast(report!.users, 8)
    assert.isAtLeast(report!.comments, 40)
    assert.isAbove(report!.replies, 5)
    assert.isAbove(report!.ratings, 10)
    assert.isAbove(report!.reviews, 3)
    assert.isAtLeast(report!.cosmetics, 100)
    assert.isAbove(report!.cards, 5)
    assert.equal(report!.gifs, 3)

    const demoUsers = await scalar(
      `select count(*) c from users where email like '%@${DEMO_EMAIL_DOMAIN}'`
    )
    assert.equal(demoUsers, report!.users)

    // Denormalised counters match the rows they summarise (other specs' comments are ignored).
    const demoAuthor = `(select id from users where email like '%@${DEMO_EMAIL_DOMAIN}')`
    const zero = [
      `select count(*) c from comments p where p.user_id in ${demoAuthor} and p.reply_count != (select count(*) from comments c where c.parent_id = p.id)`,
      `select count(*) c from comments p where p.user_id in ${demoAuthor} and (p.like_count != (select count(*) from comment_likes l where l.comment_id = p.id and l.value = 1) or p.dislike_count != (select count(*) from comment_likes l where l.comment_id = p.id and l.value = -1))`,
      `select count(*) c from comments c join comments p on p.id = c.parent_id where c.user_id in ${demoAuthor} and (c.created_at <= p.created_at or c.depth != p.depth + 1 or c.series_id != p.series_id or coalesce(c.chapter_id, 0) != coalesce(p.chapter_id, 0) or c.root_id != coalesce(p.root_id, p.id))`,
      'select count(*) c from series_reviews r where r.helpful_count != (select count(*) from review_votes v where v.review_id = r.id)',
      'select count(*) c from users u where u.profile_like_count != (select count(*) from profile_likes p where p.member_id = u.id)',
      "select count(*) c from series s where s.rating_count != (select count(*) from series_reviews r where r.series_id = s.id) or s.review_count != (select count(*) from series_reviews r where r.series_id = s.id and r.body is not null and r.body != '')",
      "select count(*) c from comments where created_at > datetime('now')",
    ]
    for (const sql of zero) assert.equal(await scalar(sql), 0, sql)

    // Variety: replies, GIFs, stickers and people who are online right now.
    const present = [
      'select count(*) c from comments where parent_id is not null',
      "select count(*) c from comments where image like '%.gif'",
      'select count(*) c from comments where sticker_id is not null',
      "select count(*) c from users where last_seen_at > datetime('now', '-5 minutes')",
    ]
    for (const sql of present) assert.isAbove(await scalar(sql), 0, sql)

    // Generated files exist and are what they claim to be.
    const sample = await User.query().where('email', 'like', `%@${DEMO_EMAIL_DOMAIN}`).firstOrFail()
    const avatar = await readFile(`${root}/seed/avatars/${sample.username}.svg`, 'utf8')
    assert.match(avatar.slice(0, 40), /^<svg/)
    const gif = await readFile(`${root}/seed/gifs/kahkaha.gif`)
    assert.equal(gif.subarray(0, 6).toString(), 'GIF89a')

    // Running it again changes nothing.
    assert.isNull(await buildCommunity(options))
    assert.equal(
      await scalar(`select count(*) c from users where email like '%@${DEMO_EMAIL_DOMAIN}'`),
      demoUsers
    )
  }).timeout(60000)

  test('demo accounts sign in, own equipment, and the pages render the seeded data', async ({
    assert,
  }) => {
    const veteran = await User.query()
      .where('email', 'like', `%@${DEMO_EMAIL_DOMAIN}`)
      .orderBy('exp', 'desc')
      .firstOrFail()
    const web = client(DEMO_PASSWORD)
    const login = await web.login(veteran.username)
    assert.include([200, 302], login.status)
    assert.equal(await statusOf(web.request('/oduller', html)), 200)

    const inventory = await jsonOf(web.request('/envanter'))
    const owned =
      inventory.frame.length +
      inventory.effect.length +
      inventory.wallpaper.length +
      inventory.sticker.length
    assert.isAbove(owned, 10)
    assert.isAbove(
      [veteran.frameId, veteran.effectId, veteran.wallpaperId].filter(Boolean).length,
      0
    )

    const profile = await textOf(web.request(`/uye/${veteran.username}`, html))
    for (const text of ['Koleksiyon', 'Kart vitrini', 'Aldığı yanıt', 'Kuşanılanlar'])
      assert.include(profile, text)

    const withData = await Series.findOrFail(seriesIds[0])
    const page = await textOf(fetch(`${base}/series/manga/${withData.slug}`, html))
    assert.match(page, /\(\d+ puan · \d+ inceleme\)/)
    const threads = await jsonOf(fetch(`${base}/yorumlar?series=${withData.id}`))
    assert.isAbove(threads.items.length, 0)
    assert.equal(threads.total, threads.roots + threads.replies)

    const home = await textOf(fetch(`${base}/`, html))
    for (const text of ['Son Yorumlar', 'Öne Çıkan İncelemeler', 'puan']) assert.include(home, text)
    assert.include(home, 'kişisine yanıt')

    const shop = await textOf(web.request('/kozmetik/cerceveler', html))
    assert.include(shop, 'Kedi Kulakları')
    const catalog = await cosmetics.catalog()
    assert.isAtLeast(
      [...catalog.values()].filter((item) => item.slug.startsWith('demo-')).length,
      100
    )
  }).timeout(30000)

  test('existing accounts get the full test equipment and answers, once', async ({ assert }) => {
    const owner = await makeUser('gercek_hesap')
    const own = await Comment.create({
      userId: owner.id,
      seriesId: seriesIds[1],
      chapterId: null,
      parentId: null,
      rootId: null,
      depth: 0,
      body: 'Bu seri çok güzel',
      spoiler: false,
      likeCount: 0,
      dislikeCount: 0,
      replyCount: 0,
      createdAt: now(),
      updatedAt: now(),
    })
    // Demo readers answer 85% of the time; a few passes make a reply certain.
    const rng = createRng(1)
    for (let pass = 0; pass < 6; pass++) {
      await equipRealAccounts(rng, Date.now())
      if (await countOf('comments', { parent_id: own.id })) break
    }

    const active = await countOf('cosmetics', { active: true })
    assert.equal(await countOf('user_cosmetics', { user_id: owner.id }), active)
    const cardTotal = await countOf('cards', { active: true })
    assert.isAtLeast(
      await countOf('user_cards', { user_id: owner.id }),
      Math.floor(cardTotal * 0.7)
    )
    assert.equal(await countOf('user_shards', { user_id: owner.id }), 7)
    const liked = await User.findOrFail(owner.id)
    assert.isAbove(liked.profileLikeCount, 5)

    const replies = await Comment.query().where('parentId', own.id)
    assert.isAbove(replies.length, 0)
    const fresh = await Comment.findOrFail(own.id)
    assert.equal(fresh.replyCount, replies.length)
    assert.equal(fresh.likeCount, await countOf('comment_likes', { comment_id: own.id }))
    for (const reply of replies) {
      assert.equal(reply.likeCount, await countOf('comment_likes', { comment_id: reply.id }))
      assert.include(reply.body, '@gercek_hesap')
    }
    const notices = await db
      .from('notifications')
      .where('user_id', owner.id)
      .where('title', 'like', '%yorumuna yanıt verdi%')
    assert.equal(notices.length, replies.length)

    // A second pass is a no-op for this account.
    await equipRealAccounts(createRng(2), Date.now())
    assert.equal(await countOf('user_cosmetics', { user_id: owner.id }), active)
    assert.equal(await countOf('comments', { parent_id: own.id }), replies.length)
  }).timeout(30000)

  test('clearing removes the demo community and keeps everything else', async ({ assert }) => {
    const owner = await userBy('gercek_hesap')
    await clearCommunity(root)

    assert.equal(
      await scalar(`select count(*) c from users where email like '%@${DEMO_EMAIL_DOMAIN}'`),
      0
    )
    assert.equal(await scalar("select count(*) c from cosmetics where slug like 'demo-%'"), 0)
    assert.equal(await scalar("select count(*) c from cards where image like '/content/seed/%'"), 0)
    assert.equal(
      await scalar(
        "select count(*) c from series_reviews where user_id in (select id from users where email like '%@demo.%')"
      ),
      0
    )
    assert.isFalse(existsSync(`${root}/seed`))
    for (const id of seriesIds) {
      const left = await Series.findOrFail(id)
      assert.deepEqual([left.ratingAvg, left.ratingCount, left.reviewCount], [0, 0, 0])
    }

    // The real account and its comment survive; its reply counter is repaired.
    assert.isNotNull(await User.find(owner.id))
    const own = await Comment.query().where('userId', owner.id).firstOrFail()
    assert.equal(own.replyCount, 0)
    assert.isNull(await Comment.query().where('parentId', own.id).first())
    // Gifts of built-in items stay; the generated ones are gone with their cosmetics.
    assert.isAbove(await countOf('user_cosmetics', { user_id: owner.id }), 30)
  }).timeout(30000)
})
