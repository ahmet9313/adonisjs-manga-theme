import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import Comment from '#models/comment'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'comment-pass-123'
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')

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
  const token = async () => {
    const html = await textOf(request('/kaydedilenler', { headers: { accept: 'text/html' } }))
    return html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  }
  const login = async (identifier: string) =>
    request('/giris', {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: new URLSearchParams({ login: identifier, password }),
    })
  const comment = async (
    fields: Record<string, string>,
    image?: { bytes: Buffer; name: string; type: string }
  ) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    if (image)
      form.append(
        'image',
        new Blob([new Uint8Array(image.bytes)], { type: image.type }),
        image.name
      )
    return request('/yorumlar', {
      method: 'POST',
      body: form,
      headers: { 'x-csrf-token': await token() },
    })
  }
  const post = async (path: string) =>
    request(path, { method: 'POST', headers: { 'x-csrf-token': await token() } })
  return { request, login, comment, post }
}

let series: Series
let chapter: Chapter

test.group('Threaded comments', (group) => {
  group.setup(async () => {
    clearAttempts()
    const timestamp = now()
    const type = await ContentType.create({ name: 'Webtoon', slug: 'webtoon' })
    series = await Series.create({
      title: 'Yorum Testi',
      slug: 'yorum-testi',
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
    chapter = await Chapter.create({
      seriesId: series.id,
      number: 1,
      title: null,
      content: { type: 'images', pages: ['/images/no-cover.svg'] },
      publishedAt: '2026-10-01',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    for (const [username, role] of [
      ['yorumcu', 'member'],
      ['ikinci', 'member'],
      ['moderator', 'editor'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
  })
  group.each.setup(() => clearAttempts())

  test('guests read but cannot write; members post text and GIF comments', async ({ assert }) => {
    const empty = await jsonOf(fetch(`${base}/yorumlar?series=${series.id}`))
    assert.deepEqual(empty, { items: [], hasMore: false, total: 0, roots: 0, replies: 0 })
    assert.equal(
      await statusOf(
        fetch(`${base}/yorumlar?series=abc`, { headers: { accept: 'application/json' } })
      ),
      422
    )

    const guest = await client().comment({ series_id: String(series.id), body: 'Merhaba' })
    assert.include([302, 401, 403], guest.status)

    const web = client()
    await web.login('yorumcu')
    const blank = await web.comment({ series_id: String(series.id), body: '   ' })
    assert.equal(blank.status, 422)
    const svg = await web.comment(
      { series_id: String(series.id) },
      {
        bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        name: 'a.gif',
        type: 'image/gif',
      }
    )
    assert.equal(svg.status, 422)

    const text = await jsonOf(
      web.comment({ series_id: String(series.id), body: '<b>Harika</b> seri' })
    )
    assert.equal(text.body, '<b>Harika</b> seri')
    assert.equal(text.depth, 0)
    assert.equal(text.author.username, 'yorumcu')
    assert.isTrue(text.canDelete)

    const withGif = await jsonOf(
      web.comment(
        { series_id: String(series.id), body: '', spoiler: '1' },
        { bytes: gif, name: 'tepki.gif', type: 'image/gif' }
      )
    )
    assert.match(withGif.image, /^\/content\/comments\/[0-9a-f-]+\.gif$/)
    assert.isTrue(withGif.spoiler)
    assert.deepEqual(await readFile(app.tmpPath('test-uploads' + withGif.image)), gif)
    const served = await fetch(base + withGif.image)
    assert.equal(served.status, 200)

    const chapterComment = await jsonOf(
      web.comment({
        series_id: String(series.id),
        chapter_id: String(chapter.id),
        body: 'Bölüm yorumu',
      })
    )
    assert.equal(chapterComment.depth, 0)
    const list = await jsonOf(fetch(`${base}/yorumlar?series=${series.id}`))
    assert.equal(list.total, 2)
    assert.deepEqual(
      list.items.map((item: { id: number }) => item.id),
      [withGif.id, text.id]
    )
    const chapterList = await jsonOf(
      fetch(`${base}/yorumlar?series=${series.id}&chapter=${chapter.id}`)
    )
    assert.equal(chapterList.total, 1)
    assert.isFalse(list.items[0].canDelete)
  })

  test('replies nest to any depth with counts, previews and lazy pages', async ({ assert }) => {
    const web = client()
    await web.login('ikinci')
    const root = await Comment.query().where('body', '<b>Harika</b> seri').firstOrFail()
    let parentId = root.id
    const created = []
    for (let depth = 1; depth <= 5; depth++) {
      const reply = await jsonOf(
        web.comment({
          series_id: String(series.id),
          parent_id: String(parentId),
          body: `Derinlik ${depth}`,
        })
      )
      assert.equal(reply.depth, depth)
      assert.equal(reply.rootId, root.id)
      created.push(reply)
      parentId = reply.id
    }
    assert.equal(created[0].replyTo, 'yorumcu')
    assert.equal(created[1].replyTo, 'ikinci')
    clearAttempts()
    for (let i = 0; i < 3; i++)
      await web.comment({
        series_id: String(series.id),
        parent_id: String(root.id),
        body: `Kardeş ${i}`,
      })

    const list = await jsonOf(fetch(`${base}/yorumlar?series=${series.id}`))
    const top = list.items.find((item: { id: number }) => item.id === root.id)
    assert.equal(top.replyCount, 4)
    assert.lengthOf(top.replies, 2)
    assert.equal(top.replies[0].body, 'Derinlik 1')
    const page = await jsonOf(fetch(`${base}/yorumlar/${root.id}/yanitlar`))
    assert.lengthOf(page.items, 4)
    const deeper = await jsonOf(fetch(`${base}/yorumlar/${created[3].id}/yanitlar`))
    assert.equal(deeper.items[0].body, 'Derinlik 5')
    assert.equal(list.total, 10)

    // A reply must stay in the same series/chapter thread.
    const chapterComment = await Comment.query().where('body', 'Bölüm yorumu').firstOrFail()
    const crossed = await web.comment({
      series_id: String(series.id),
      parent_id: String(chapterComment.id),
      body: 'Yanlış yer',
    })
    assert.equal(crossed.status, 422)
  })

  test('likes toggle once per user and are reflected for the viewer', async ({ assert }) => {
    const root = await Comment.query().where('body', '<b>Harika</b> seri').firstOrFail()
    const first = client()
    await first.login('ikinci')
    const second = client()
    await second.login('moderator')
    // A vote without a value is an up-vote; voting again takes it back. Answers carry the full
    // vote state.
    assert.deepEqual(await jsonOf(first.post(`/yorumlar/${root.id}/oy`)), {
      vote: 1,
      liked: true,
      likeCount: 1,
      dislikeCount: 0,
    })
    assert.deepEqual(await jsonOf(second.post(`/yorumlar/${root.id}/oy`)), {
      vote: 1,
      liked: true,
      likeCount: 2,
      dislikeCount: 0,
    })
    assert.deepEqual(await jsonOf(first.post(`/yorumlar/${root.id}/oy`)), {
      vote: 0,
      liked: false,
      likeCount: 1,
      dislikeCount: 0,
    })
    const seen = await jsonOf(second.request(`/yorumlar?series=${series.id}&sort=top`))
    assert.equal(seen.items[0].id, root.id)
    assert.equal(seen.items[0].vote, 1)
    assert.isTrue(seen.items[0].canDelete, 'editors can moderate')
  })

  test('deleting: owners and staff only, leaves vanish, parents become placeholders', async ({
    assert,
  }) => {
    const root = await Comment.query().where('body', '<b>Harika</b> seri').firstOrFail()
    const leaf = await Comment.query().where('body', 'Kardeş 2').firstOrFail()
    const stranger = client()
    await stranger.login('yorumcu')
    assert.equal(await statusOf(stranger.post(`/yorumlar/${leaf.id}/sil`)), 403)

    const owner = client()
    await owner.login('ikinci')
    assert.deepEqual(await jsonOf(owner.post(`/yorumlar/${leaf.id}/sil`)), { deleted: 'hard' })
    assert.isNull(await Comment.find(leaf.id))
    await root.refresh()
    assert.equal(root.replyCount, 3)

    const staff = client()
    await staff.login('moderator')
    assert.deepEqual(await jsonOf(staff.post(`/yorumlar/${root.id}/sil`)), { deleted: 'soft' })
    const list = await jsonOf(fetch(`${base}/yorumlar?series=${series.id}`))
    const placeholder = list.items.find((item: { id: number }) => item.id === root.id)
    assert.isTrue(placeholder.deleted)
    assert.equal(placeholder.body, '')
    assert.isNull(placeholder.author)
    assert.equal(await statusOf(owner.post(`/yorumlar/${root.id}/oy`)), 404)

    const withGif = await Comment.query().whereNotNull('image').firstOrFail()
    const image = withGif.image!
    const author = client()
    await author.login('yorumcu')
    assert.deepEqual(await jsonOf(author.post(`/yorumlar/${withGif.id}/sil`)), { deleted: 'hard' })
    assert.equal(await statusOf(fetch(base + image)), 404)
  })

  test('posting is rate limited and profiles list recent comments', async ({ assert }) => {
    const web = client()
    await web.login('moderator')
    const statuses = []
    for (let i = 0; i < 7; i++)
      statuses.push(
        await statusOf(web.comment({ series_id: String(series.id), body: `Seri ${i}` }))
      )
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 201, 429])
    const profile = await textOf(fetch(`${base}/uye/moderator`))
    assert.include(profile, 'Son etkinlik')
    assert.include(profile, 'Seri 5')
    assert.include(profile, '/series/webtoon/yorum-testi#yorumlar')
    const page = await textOf(fetch(`${base}/series/webtoon/yorum-testi`))
    assert.include(page, 'x-data="commentSection"')
    const reader = await textOf(fetch(`${base}/series/webtoon/yorum-testi/1`))
    assert.include(reader, `&quot;chapterId&quot;:${chapter.id}`)
  })
})
