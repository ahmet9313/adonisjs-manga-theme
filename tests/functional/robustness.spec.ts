import { test } from '@japa/runner'
import { get as httpGet } from 'node:http'
import { mkdir, writeFile, access as exists } from 'node:fs/promises'
import { join } from 'node:path'
import db from '@adonisjs/lucid/services/db'
import content from '#config/content'
import User from '#models/user'
import Series from '#models/series'
import Chapter from '#models/chapter'
import ContentType from '#models/content_type'
import library from '#services/library_service'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'
import { removeUnreferencedImages } from '#services/upload_service'
import sharp from 'sharp'

const base = 'http://127.0.0.1:3334'
const password = 'robust-password-123'

function rawGet(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown> }>((done, fail) => {
    httpGet(`${base}${path}`, { headers }, (response) => {
      response.resume()
      response.on('end', () => done({ status: response.statusCode!, headers: response.headers }))
    }).on('error', fail)
  })
}

/** Cookie-aware client with form logins and CSRF form posts. */
function client() {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
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
      const value = pair.slice(index + 1)
      if (value) cookies.set(pair.slice(0, index), value)
      else cookies.delete(pair.slice(0, index))
    }
    return response
  }
  const token = async (path = '/giris') => {
    const html = await request(path).then((r) => r.text())
    return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  }
  const post = async (path: string, fields: Record<string, string>, from = '/giris') =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  const login = (name: string, secret = password, remember = false) =>
    post('/giris', { login: name, password: secret, ...(remember ? { remember: 'on' } : {}) })
  return { request, post, login, cookies }
}

const location = (response: Response) => response.headers.get('location')
const statusOf = (response: Promise<Response>) => response.then((r) => r.status)
async function tokensOf(userId: number) {
  const rows = await db.from('remember_me_tokens').where('tokenable_id', userId).count('* as n')
  return Number(rows[0].n)
}

test.group('Compression', () => {
  test('text answers are compressed, images and byte ranges are not', async ({ assert }) => {
    const page = await rawGet('/', { 'accept-encoding': 'br, gzip' })
    assert.equal(page.status, 200)
    assert.oneOf(page.headers['content-encoding'], ['br', 'gzip'])
    assert.include(String(page.headers.vary), 'Accept-Encoding')

    const plain = await rawGet('/', {})
    assert.isUndefined(plain.headers['content-encoding'])

    await mkdir(join(content.root, 'robust'), { recursive: true })
    await writeFile(
      join(content.root, 'robust', 'a.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg">${' '.repeat(4000)}</svg>`
    )
    const ranged = await rawGet('/content/robust/a.svg', {
      'accept-encoding': 'gzip',
      'range': 'bytes=0-99',
    })
    assert.isUndefined(ranged.headers['content-encoding'])
  })
})

test.group('Image variants', () => {
  test('stored images come in fixed smaller WebP sizes', async ({ assert }) => {
    await mkdir(join(content.root, 'robust'), { recursive: true })
    await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#7c3aed' } })
      .png()
      .toFile(join(content.root, 'robust', 'big.png'))
    const small = await fetch(`${base}/content/robust/big.png?w=320`)
    assert.equal(small.status, 200)
    assert.equal(small.headers.get('content-type'), 'image/webp')
    const meta = await sharp(Buffer.from(await small.arrayBuffer())).metadata()
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 320, 480])
    // Sizes outside the list, and SVGs, get the original file.
    const odd = await fetch(`${base}/content/robust/big.png?w=333`)
    assert.equal(odd.headers.get('content-type'), 'image/png')
    const svg = await fetch(`${base}/content/robust/a.svg?w=320`)
    assert.include(String(svg.headers.get('content-type')), 'image/svg+xml')
  })
})

test.group('Sign-in limits and sessions', (group) => {
  group.setup(async () => {
    for (const username of ['saglam_a', 'saglam_b'])
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role: 'member',
      })
  })
  group.each.setup(() => clearAttempts())
  group.teardown(async () => {
    clearAttempts()
    await User.query().whereLike('username', 'saglam_%').delete()
  })

  test('a right password no longer resets the connection limit', async ({ assert }) => {
    const web = client()
    for (let i = 1; i <= 7; i++) await web.login(`kimse_yok_${i}`, 'yanlis')
    // The attacker's own account logs in: before, this cleared the counter.
    assert.equal(location(await client().login('saglam_a')), '/')
    await web.login('kimse_yok_8', 'yanlis')
    const locked = await client().login('saglam_a')
    assert.equal(location(locked), '/giris?next=%2F')
  })

  test('parallel wrong passwords are all counted', async ({ assert }) => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => client().login(`paralel_${i}`, 'yanlis'))
    )
    assert.equal(location(await client().login('saglam_a')), '/giris?next=%2F')
  })

  test('a password change ends the other sessions and remembered logins', async ({ assert }) => {
    const here = client()
    const there = client()
    await here.login('saglam_b')
    await there.login('saglam_b', password, true)
    const user = await User.findByOrFail('username', 'saglam_b')
    assert.isAbove(await tokensOf(user.id), 0)
    const changed = await here.post(
      '/ayarlar/parola',
      {
        current_password: password,
        password: 'yeni-parola-123',
        password_confirmation: 'yeni-parola-123',
      },
      '/ayarlar'
    )
    assert.equal(location(changed), '/ayarlar')
    assert.equal(await statusOf(here.request('/ayarlar')), 200)
    assert.equal(await statusOf(there.request('/ayarlar')), 302)
    assert.equal(await tokensOf(user.id), 0)
    // Another account signing in on the same browser is not thrown out by the old stamp.
    await here.post('/cikis', {}, '/ayarlar')
    assert.equal(location(await here.login('saglam_a')), '/')
    assert.equal(await statusOf(here.request('/ayarlar')), 200)
    user.password = password
    await user.save()
  })

  test('the current password can be guessed only five times', async ({ assert }) => {
    const web = client()
    await web.login('saglam_a')
    const change = (current: string) =>
      web.post(
        '/ayarlar/parola',
        {
          current_password: current,
          password: 'baska-parola-1',
          password_confirmation: 'baska-parola-1',
        },
        '/ayarlar'
      )
    for (let i = 0; i < 5; i++) await change('yanlis-parola')
    await change(password)
    const user = await User.findByOrFail('username', 'saglam_a')
    // Still the old password: the sixth try was refused before checking.
    assert.isTrue(await user.verifyPassword(password))
  })

  test('comment votes are rate limited', async ({ assert }) => {
    const web = client()
    await web.login('saglam_a')
    const settingsPage = await web.request('/ayarlar').then((r) => r.text())
    const token = settingsPage.match(/name="csrf-token" content="([^"]+)"/)?.[1]
    const vote = () =>
      web.request('/yorumlar/999999/oy', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-csrf-token': token || '',
        },
        body: JSON.stringify({ value: 1 }),
      })
    for (let i = 0; i < 30; i++) assert.equal(await statusOf(vote()), 404)
    assert.equal(await statusOf(vote()), 429)
  })
})

test.group('Data: indexes, imports, files', (group) => {
  let type: ContentType
  let series: Series
  let member: User

  group.setup(async () => {
    const timestamp = now()
    type = await ContentType.create({
      name: 'Sağlam',
      slug: 'saglam-tur',
      format: 'image',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    series = await Series.create({
      title: 'Sağlam Seri',
      slug: 'saglam-seri',
      description: 'Test',
      contentTypeId: type.id,
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2020,
      coverImage: '/content/saglam/cover.png',
      bannerImage: null,
      alternativeTitles: [],
      keywords: [],
      featured: false,
      draft: false,
      access: 'public',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    for (const [number, access] of [
      [1, 'public'],
      [2, 'vip'],
    ] as const)
      await Chapter.create({
        seriesId: series.id,
        number,
        title: null,
        content: { type: 'images', pages: [] },
        draft: false,
        access,
        publishedAt: '2026-10-01',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    member = await User.create({
      username: 'saglam_uye',
      email: 'saglam_uye@example.com',
      fullName: 'uye',
      password,
      role: 'member',
    })
  })
  group.teardown(async () => {
    await series.delete()
    await type.delete()
    await member.delete()
  })

  test('hot paths have their indexes', async ({ assert }) => {
    const rows = await db.rawQuery("select name from sqlite_master where type = 'index'")
    const names = rows.map((row: { name: string }) => row.name)
    for (const name of [
      'chapter_reads_series_user_idx',
      'bookmarks_series_idx',
      'comments_created_idx',
      'comment_likes_comment_idx',
      'series_authors_author_idx',
    ])
      assert.include(names, name)
  })

  test('a guest library hand-over skips chapters the account cannot open', async ({ assert }) => {
    const result = await library.importLocal(member, {
      bookmarks: [{ type: 'saglam-tur', slug: 'saglam-seri' }],
      reads: [{ type: 'saglam-tur', slug: 'saglam-seri', chapters: [1, 2] }],
    })
    assert.deepEqual(result, { bookmarks: 1, reads: 1 })
    const again = await library.importLocal(member, {
      bookmarks: [{ type: 'saglam-tur', slug: 'saglam-seri' }],
      reads: [{ type: 'saglam-tur', slug: 'saglam-seri', chapters: [1, 2] }],
    })
    assert.deepEqual(again, { bookmarks: 0, reads: 0 })
    // The account's saved list shows the stored cover (not the placeholder).
    const [saved] = await library.list(member.id)
    assert.equal(saved.coverImage, '/content/saglam/cover.png')
  })

  test('series images are deleted only when no series or card uses them', async ({ assert }) => {
    const dir = join(content.root, 'saglam')
    await mkdir(dir, { recursive: true })
    for (const name of ['cover.png', 'old.png', 'card.png']) await writeFile(join(dir, name), 'x')
    const timestamp = now()
    const [cardId] = await db.table('cards').insert({
      name: 'Sağlam Kart',
      rarity: 'F',
      image: '/content/saglam/card.png',
      created_at: timestamp,
      updated_at: timestamp,
    })
    await removeUnreferencedImages([
      '/content/saglam/cover.png',
      '/content/saglam/old.png',
      '/content/saglam/card.png',
      '/images/no-cover.svg',
    ])
    const present = (name: string) =>
      exists(join(dir, name)).then(
        () => true,
        () => false
      )
    assert.isTrue(await present('cover.png'))
    assert.isFalse(await present('old.png'))
    assert.isTrue(await present('card.png'))
    await db.from('cards').where('id', cardId).delete()
  })

  test("a guest's saved list gets current covers and newest chapters", async ({ assert }) => {
    const response = await fetch(
      `${base}/kutuphane/kapaklar?items=saglam-tur/saglam-seri,saglam-tur/yok,../x`
    )
    assert.equal(response.status, 200)
    const items = (await response.json()) as any[]
    assert.lengthOf(items, 1)
    assert.include(items[0], {
      type: 'saglam-tur',
      slug: 'saglam-seri',
      title: 'Sağlam Seri',
      coverImage: '/content/saglam/cover.png',
      coverVeil: null,
      latestChapter: 2,
    })
  })

  test('reviews of a draft series stay hidden', async ({ assert }) => {
    await Series.query().where('id', series.id).update({ draft: true })
    const hidden = await fetch(`${base}/incelemeler?series=${series.id}`, {
      headers: { accept: 'application/json' },
    })
    assert.equal(hidden.status, 404)
    await Series.query().where('id', series.id).update({ draft: false })
    const shown = await fetch(`${base}/incelemeler?series=${series.id}`, {
      headers: { accept: 'application/json' },
    })
    assert.equal(shown.status, 200)
  })
})
