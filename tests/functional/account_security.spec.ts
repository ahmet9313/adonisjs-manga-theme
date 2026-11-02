import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import mail from '@adonisjs/mail/services/main'
import type { FakeMailer } from '@adonisjs/mail'
import contentConfig from '#config/content'
import site from '#config/site'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import tokens from '#services/account_token_service'
import { ghostUsername } from '#services/account_data_service'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'guvenli-parola-1'
const html = { headers: { accept: 'text/html' } }

const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}
const statusOf = async (response: Promise<Response>) => {
  const result = await response
  return result.status
}
const locationOf = async (response: Promise<Response>) => {
  const result = await response
  return result.headers.get('location')
}
const rowOf = async (table: string, id: number) => {
  const row = await db.from(table).where('id', id).first()
  return row
}
const countOf = async (table: string, where: Record<string, unknown>) => {
  const [row] = await db.from(table).where(where).count('* as total')
  return Number(row.total)
}

/** Cookie-aware client; the CSRF token comes from the page's meta tag. */
function client() {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        accept: 'text/html',
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
    const page = await textOf(request('/sifremi-unuttum', html))
    return page.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  }
  const post = async (path: string, fields: Record<string, string> = {}, accept = 'text/html') =>
    request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), accept },
      body: new URLSearchParams(fields),
    })
  const login = (identifier: string, secret = password, remember = false) =>
    post('/giris', { login: identifier, password: secret, ...(remember ? { remember: 'on' } : {}) })
  return { request, post, login, cookies }
}

/** Every account this file creates (removed in the group teardown). */
const usernames = new Set<string>(['dogrulama_okur'])
function makeUser(username: string, extra: Partial<User> = {}) {
  usernames.add(username)
  return User.create({
    username,
    email: `${username}@example.com`,
    fullName: username,
    password,
    role: 'member',
    emailVerifiedAt: now(),
    ...extra,
  })
}

async function makeSeries(slug: string, draft = false) {
  const type = await ContentType.firstOrCreate({ slug: 'manga' }, { name: 'Manga', slug: 'manga' })
  const timestamp = now()
  const series = await Series.create({
    title: `Güvenlik ${slug}`,
    slug,
    description: 'Test',
    contentTypeId: type.id,
    status: 'Devam Ediyor',
    translationStatus: 'Aktif',
    publicationYear: 2025,
    alternativeTitles: [],
    coverImage: '/images/no-cover.svg',
    featured: false,
    draft,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const chapter = await Chapter.create({
    seriesId: series.id,
    number: 1,
    title: 'Bölüm 1',
    content: { type: 'images', pages: ['/images/no-cover.svg'] },
    publishedAt: '2026-10-01',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return { series, chapter }
}

/** The link of the newest queued mail to this address (rendered from its text part). */
async function linkFor(fake: FakeMailer, address: string, path: string) {
  const messages = fake.messages.queued((message) =>
    (message.nodeMailerMessage.to ?? []).some(
      (to) => (typeof to === 'string' ? to : to.address) === address
    )
  )
  const message = messages.at(-1)
  if (!message) return null
  await message.computeContents()
  const text = String(message.nodeMailerMessage.text || '')
  const match = text.match(new RegExp(`https?://[^\\s]+${path}/([\\w-]+)`))
  return match ? match[1] : null
}

const queuedTo = (fake: FakeMailer, address: string) =>
  fake.messages.queued((message) =>
    (message.nodeMailerMessage.to ?? []).some(
      (to) => (typeof to === 'string' ? to : to.address) === address
    )
  ).length

test.group('Password reset, e-mail verification and account data', (group) => {
  let fake: FakeMailer
  let hadMangaType = false
  group.setup(async () => {
    fake = mail.fake()
    hadMangaType = Boolean(await ContentType.findBy('slug', 'manga'))
    return () => mail.restore()
  })
  // Every spec shares one in-memory database: leave nothing behind (users cascade to their
  // comments, reviews, tokens and library rows; series to their chapters).
  group.teardown(async () => {
    clearAttempts()
    await User.query()
      .whereIn('username', [...usernames, ghostUsername])
      .delete()
    await Series.query().whereLike('slug', 'guvenlik-%').delete()
    if (!hadMangaType) await ContentType.query().where('slug', 'manga').delete()
  })
  group.each.setup(() => {
    clearAttempts()
    fake.messages.clear()
  })

  test('forgot password answers the same for unknown addresses and is throttled', async ({
    assert,
  }) => {
    await makeUser('unutkan')
    await makeUser('askida_uye', { bannedAt: now() })
    const web = client()

    const known = await web.post('/sifremi-unuttum', { email: 'Unutkan@Example.com' })
    const unknown = await web.post('/sifremi-unuttum', { email: 'kimse@example.com' })
    const banned = await web.post('/sifremi-unuttum', { email: 'askida_uye@example.com' })
    for (const response of [known, unknown, banned]) {
      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), '/sifremi-unuttum')
    }
    const page = await textOf(web.request('/sifremi-unuttum'))
    assert.include(page, 'Bu adrese kayıtlı bir hesap varsa')
    assert.include(page, 'E-postanı kontrol et')
    // Only the real, active account gets a mail.
    assert.equal(queuedTo(fake, 'unutkan@example.com'), 1)
    assert.equal(queuedTo(fake, 'kimse@example.com'), 0)
    assert.equal(queuedTo(fake, 'askida_uye@example.com'), 0)

    // Per address: three requests an hour (the first one above counts).
    clearAttempts('forgot:127.0.0.1')
    await web.post('/sifremi-unuttum', { email: 'unutkan@example.com' })
    await web.post('/sifremi-unuttum', { email: 'unutkan@example.com' })
    const limited = await web.post('/sifremi-unuttum', { email: 'unutkan@example.com' })
    assert.equal(limited.headers.get('location'), '/sifremi-unuttum')
    assert.include(await textOf(web.request('/sifremi-unuttum')), 'Çok fazla sıfırlama isteği')
    assert.equal(queuedTo(fake, 'unutkan@example.com'), 3)

    // Per connection: five requests in 15 minutes, whatever the address (three counted above).
    await web.post('/sifremi-unuttum', { email: 'baska1@example.com' })
    assert.notInclude(await textOf(web.request('/sifremi-unuttum')), 'Çok fazla sıfırlama isteği')
    await web.post('/sifremi-unuttum', { email: 'baska2@example.com' })
    await web.post('/sifremi-unuttum', { email: 'baska3@example.com' })
    assert.include(await textOf(web.request('/sifremi-unuttum')), 'Çok fazla sıfırlama isteği')

    // A malformed address is a form error, not a mail.
    const bad = await client().post('/sifremi-unuttum', { email: 'yanlis' })
    assert.equal(bad.headers.get('location'), '/sifremi-unuttum')
    assert.include(await textOf(web.request('/giris')), 'href="/sifremi-unuttum"')
  })

  test('reset links are hashed, single use and expire', async ({ assert }) => {
    const user = await makeUser('sifirlayan')
    const web = client()
    await web.post('/sifremi-unuttum', { email: user.email })
    const token = await linkFor(fake, user.email, '/sifre-sifirla')
    assert.isString(token)
    // Only the SHA-256 is stored.
    const row = await db.from('account_tokens').where('user_id', user.id).first()
    assert.equal(row.type, 'reset')
    assert.notEqual(row.token_hash, token)
    assert.equal(row.token_hash, createHash('sha256').update(token!).digest('hex'))

    const form = await web.request(`/sifre-sifirla/${token}`)
    assert.equal(form.status, 200)
    assert.equal(form.headers.get('referrer-policy'), 'no-referrer')
    assert.include(await form.text(), 'Yeni parola belirle')

    // Same rules as registration; a failed form keeps the link usable.
    const mismatch = await web.post(`/sifre-sifirla/${token}`, {
      password: 'yepyeni-parola',
      password_confirmation: 'baska-parola',
    })
    assert.equal(mismatch.headers.get('location'), `/sifre-sifirla/${token}`)
    const short = await web.post(`/sifre-sifirla/${token}`, {
      password: 'kisa',
      password_confirmation: 'kisa',
    })
    assert.equal(short.headers.get('location'), `/sifre-sifirla/${token}`)
    await user.refresh()
    assert.isTrue(await hash.verify(user.password, password))

    const done = await web.post(`/sifre-sifirla/${token}`, {
      password: 'yepyeni-parola',
      password_confirmation: 'yepyeni-parola',
    })
    assert.equal(done.headers.get('location'), '/')
    await user.refresh()
    assert.isTrue(await hash.verify(user.password, 'yepyeni-parola'))
    assert.equal(await statusOf(web.request('/ayarlar')), 200)

    // Used once: the page says so and a second submit changes nothing.
    assert.include(await textOf(client().request(`/sifre-sifirla/${token}`)), 'Bağlantı geçersiz')
    const again = await client().post(`/sifre-sifirla/${token}`, {
      password: 'ucuncu-parola-1',
      password_confirmation: 'ucuncu-parola-1',
    })
    assert.equal(again.headers.get('location'), '/sifremi-unuttum')
    await user.refresh()
    assert.isTrue(await hash.verify(user.password, 'yepyeni-parola'))

    // A newer mail replaces the older link; an expired link is refused.
    const first = await tokens.issue(user, 'reset')
    const second = await tokens.issue(user, 'reset')
    assert.isNull(await tokens.find(first, ['reset']))
    assert.isNotNull(await tokens.find(second, ['reset']))
    await db
      .from('account_tokens')
      .where('token_hash', createHash('sha256').update(second).digest('hex'))
      .update({ expires_at: '2000-01-01 00:00:00' })
    assert.include(await textOf(client().request(`/sifre-sifirla/${second}`)), 'Bağlantı geçersiz')
    assert.include(await textOf(client().request('/sifre-sifirla/uydurma')), 'Bağlantı geçersiz')
  })

  test('a reset signs out other sessions and remember-me logins', async ({ assert }) => {
    const user = await makeUser('cok_cihazli')
    const phone = client()
    const laptop = client()
    await phone.login('cok_cihazli', password, true)
    await laptop.login('cok_cihazli')
    assert.equal(await statusOf(phone.request('/ayarlar')), 200)
    assert.equal(await countOf('remember_me_tokens', { tokenable_id: user.id }), 1)

    const stranger = client()
    await stranger.post('/sifremi-unuttum', { email: user.email })
    const token = await linkFor(fake, user.email, '/sifre-sifirla')
    await stranger.post(`/sifre-sifirla/${token}`, {
      password: 'cihazlar-kapandi',
      password_confirmation: 'cihazlar-kapandi',
    })

    assert.equal(await countOf('remember_me_tokens', { tokenable_id: user.id }), 0)
    for (const device of [phone, laptop]) {
      const settings = await device.request('/ayarlar')
      assert.equal(settings.status, 302)
      assert.include(settings.headers.get('location') || '', '/giris')
    }
    // Remember-me cookie alone cannot bring the old login back.
    phone.cookies.delete('adonis-session')
    assert.equal(await statusOf(phone.request('/ayarlar')), 302)
    assert.equal(await statusOf(stranger.request('/ayarlar')), 200)
  })

  test('registration mails a verification link; resend is throttled', async ({ assert }) => {
    const web = client()
    await web.post('/kayit', {
      username: 'dogrulama_okur',
      email: 'dogrulama_okur@example.com',
      password,
      password_confirmation: password,
    })
    const user = await User.findByOrFail('username', 'dogrulama_okur')
    assert.isNull(user.emailVerifiedAt)
    const firstLink = await linkFor(fake, user.email, '/eposta-dogrula')
    assert.isString(firstLink)

    const settings = await textOf(web.request('/ayarlar'))
    assert.include(settings, 'E-postanı doğrula')
    assert.include(settings, 'E-posta adresin doğrulanmadı')
    assert.include(await textOf(web.request('/')), 'E-postanı doğrula')

    for (let index = 0; index < 3; index++)
      assert.equal(
        await locationOf(web.post('/ayarlar/dogrulama', { next: '/ayarlar#account' })),
        '/ayarlar#account'
      )
    await web.post('/ayarlar/dogrulama')
    assert.include(await textOf(web.request('/ayarlar')), 'Çok sık bağlantı istedin')
    assert.equal(queuedTo(fake, user.email), 4)

    // Only the newest link works.
    const stale = await web.request(`/eposta-dogrula/${firstLink}`)
    assert.equal(stale.headers.get('location'), '/ayarlar#account')
    await user.refresh()
    assert.isNull(user.emailVerifiedAt)

    const latest = await linkFor(fake, user.email, '/eposta-dogrula')
    // Opening the link needs no session (it may be opened on another device).
    const opened = await client().request(`/eposta-dogrula/${latest}`)
    assert.equal(opened.headers.get('location'), '/giris')
    await user.refresh()
    assert.isNotNull(user.emailVerifiedAt)
    const after = await textOf(web.request('/ayarlar'))
    assert.include(after, 'E-posta adresin doğrulandı')
    assert.notInclude(after, 'verify-banner')
    await web.post('/ayarlar/dogrulama')
    assert.equal(queuedTo(fake, user.email), 4)
  })

  test('requireVerifiedToPost keeps unverified accounts from posting', async ({ assert }) => {
    await makeUser('dogrulanmamis', { emailVerifiedAt: null })
    await makeUser('dogrulanmis')
    const { series } = await makeSeries('guvenlik-yorum')
    const unverified = client()
    const verified = client()
    await unverified.login('dogrulanmamis')
    await verified.login('dogrulanmis')
    const comment = (web: ReturnType<typeof client>) =>
      web.post(
        '/yorumlar',
        { series_id: String(series.id), body: 'Harika bölüm!' },
        'application/json'
      )
    const review = (web: ReturnType<typeof client>) =>
      web.post('/incelemeler', { series_id: String(series.id), rating: '8' }, 'application/json')

    // Off (the default): nothing changes.
    assert.isFalse(site.requireVerifiedToPost)
    assert.notEqual(await statusOf(comment(unverified)), 403)
    assert.notEqual(await statusOf(review(unverified)), 403)

    site.requireVerifiedToPost = true
    try {
      const refused = await comment(unverified)
      assert.equal(refused.status, 403)
      const body: any = await refused.json()
      assert.isTrue(body.verify)
      assert.equal(await statusOf(review(unverified)), 403)
      assert.notEqual(await statusOf(comment(verified)), 403)
      assert.notEqual(await statusOf(review(verified)), 403)
      // Reading and saving stay open.
      assert.equal(await statusOf(unverified.request(`/series/manga/${series.slug}`)), 200)
      assert.equal(
        await statusOf(
          unverified.post(
            '/kutuphane/kaydet',
            { type: 'manga', slug: series.slug },
            'application/json'
          )
        ),
        200
      )
      assert.include(await textOf(unverified.request('/ayarlar')), 'doğrulayana kadar yorum')
    } finally {
      site.requireVerifiedToPost = false
    }
  })

  test('changing the e-mail asks to verify the new address and warns the old one', async ({
    assert,
  }) => {
    const user = await makeUser('adres_degisen')
    const oldLink = await tokens.issue(user, 'verify')
    const web = client()
    await web.login('adres_degisen')
    const changed = await web.post('/ayarlar/hesap', {
      email: 'Yeni.Adres@example.com',
      current_password: password,
    })
    assert.equal(changed.headers.get('location'), '/ayarlar')
    await user.refresh()
    assert.equal(user.email, 'yeni.adres@example.com')
    assert.isNull(user.emailVerifiedAt)

    // The new address gets a link, the old one a notice without a link.
    const link = await linkFor(fake, 'yeni.adres@example.com', '/eposta-dogrula')
    assert.isString(link)
    assert.equal(queuedTo(fake, 'adres_degisen@example.com'), 1)
    assert.isNull(await linkFor(fake, 'adres_degisen@example.com', '/eposta-dogrula'))
    // A link sent to the previous address no longer confirms anything.
    assert.isNull(await tokens.find(oldLink, ['verify', 'email_change']))

    await web.request(`/eposta-dogrula/${link}`)
    await user.refresh()
    assert.isNotNull(user.emailVerifiedAt)
    // Saving the same address again changes nothing.
    fake.messages.clear()
    await web.post('/ayarlar/hesap', { email: user.email, current_password: password })
    await user.refresh()
    assert.isNotNull(user.emailVerifiedAt)
    assert.equal(fake.messages.queued().length, 0)
  })

  test('account deletion removes personal data and anonymises comments', async ({ assert }) => {
    const { series, chapter } = await makeSeries('guvenlik-silme')
    const user = await makeUser('giden_uye')
    const friend = await makeUser('kalan_uye')
    const fan = await makeUser('hayran_uye')
    const stamp = now()

    const avatarDir = join(contentConfig.root, 'avatars')
    await mkdir(avatarDir, { recursive: true })
    await writeFile(join(avatarDir, 'giden.webp'), 'x')
    user.avatar = '/content/avatars/giden.webp'
    await user.save()

    // The member's data …
    await db
      .table('bookmarks')
      .insert({ user_id: user.id, series_id: series.id, created_at: stamp })
    await db.table('chapter_reads').insert({
      user_id: user.id,
      series_id: series.id,
      chapter_id: chapter.id,
      read_at: stamp,
    })
    await db.table('notifications').insert({
      user_id: user.id,
      category: 'system',
      title: 'Merhaba',
      body: '',
      created_at: stamp,
    })
    const cosmetic = await db.from('cosmetics').first()
    await db
      .table('user_cosmetics')
      .insert({ user_id: user.id, cosmetic_id: cosmetic.id, created_at: stamp })
    await db.table('user_badges').insert({ user_id: user.id, badge: 'okur', earned_at: stamp })
    await db.table('user_shards').insert({ user_id: user.id, rarity: 'F', amount: 3 })
    // … its likes and votes on other people's things …
    await db
      .table('profile_likes')
      .insert({ user_id: user.id, member_id: friend.id, created_at: stamp })
    await db
      .table('profile_likes')
      .insert({ user_id: fan.id, member_id: user.id, created_at: stamp })
    await db.from('users').where('id', friend.id).update({ profile_like_count: 1 })
    const comment = async (author: User, body: string, parent?: number) => {
      const [created] = await db.table('comments').insert({
        user_id: author.id,
        series_id: series.id,
        chapter_id: null,
        parent_id: parent ?? null,
        root_id: parent ?? null,
        depth: parent ? 1 : 0,
        body,
        spoiler: false,
        like_count: 0,
        dislike_count: 0,
        reply_count: 0,
        created_at: stamp,
        updated_at: stamp,
      })
      if (parent) await db.from('comments').where('id', parent).increment('reply_count', 1)
      return Number(created)
    }
    const thread = await comment(user, 'Gitmeden önce bir yorum')
    const reply = await comment(friend, 'Yanıtım burada', thread)
    await db
      .table('comment_likes')
      .insert({ user_id: user.id, comment_id: reply, value: 1, created_at: stamp })
    await db.from('comments').where('id', reply).update({ like_count: 1 })
    // … and its review (with a helpful vote) plus its vote on another review.
    const [ownReview] = await db.table('series_reviews').insert({
      user_id: user.id,
      series_id: series.id,
      rating: 2,
      title: null,
      body: null,
      spoiler: false,
      helpful_count: 1,
      created_at: stamp,
      updated_at: stamp,
    })
    await db
      .table('review_votes')
      .insert({ user_id: friend.id, review_id: ownReview, created_at: stamp })
    const [friendReview] = await db.table('series_reviews').insert({
      user_id: friend.id,
      series_id: series.id,
      rating: 10,
      title: null,
      body: null,
      spoiler: false,
      helpful_count: 1,
      created_at: stamp,
      updated_at: stamp,
    })
    await db
      .table('review_votes')
      .insert({ user_id: user.id, review_id: friendReview, created_at: stamp })
    await db.from('series').where('id', series.id).update({ rating_avg: 6, rating_count: 2 })

    const web = client()
    await web.login('giden_uye', password, true)
    assert.include(await textOf(web.request('/ayarlar')), 'Hesabımı sil')

    // Wrong password or user name: nothing happens.
    await web.post('/ayarlar/hesabi-sil', {
      delete_password: 'yanlis',
      confirm_username: 'giden_uye',
    })
    await web.post('/ayarlar/hesabi-sil', {
      delete_password: password,
      confirm_username: 'baskasi',
    })
    assert.isNotNull(await User.find(user.id))

    const gone = await web.post('/ayarlar/hesabi-sil', {
      delete_password: password,
      confirm_username: 'GIDEN_UYE',
    })
    assert.equal(gone.headers.get('location'), '/')
    assert.isNull(await User.find(user.id))
    for (const table of [
      'bookmarks',
      'chapter_reads',
      'notifications',
      'user_cosmetics',
      'user_badges',
      'user_shards',
      'comment_likes',
      'review_votes',
      'series_reviews',
      'account_tokens',
      'profile_likes',
    ])
      assert.equal(await countOf(table, { user_id: user.id }), 0, table)
    assert.equal(await countOf('remember_me_tokens', { tokenable_id: user.id }), 0)
    assert.equal(await countOf('profile_likes', { member_id: user.id }), 0)
    assert.isFalse(existsSync(join(avatarDir, 'giden.webp')))

    // Counters follow.
    await friend.refresh()
    assert.equal(friend.profileLikeCount, 0)
    const voted = await rowOf('comments', reply)
    assert.equal(voted.like_count, 0)
    const helpful = await rowOf('series_reviews', Number(friendReview))
    assert.equal(helpful.helpful_count, 0)
    const fresh = await db.from('series').where('id', series.id).first()
    assert.equal(Number(fresh.rating_count), 1)
    assert.equal(Number(fresh.rating_avg), 10)

    // The comment stays in its thread under the placeholder author.
    const ghost = await User.findByOrFail('username', ghostUsername)
    assert.isNotNull(ghost.bannedAt)
    const kept = await db.from('comments').where('id', thread).first()
    assert.equal(kept.user_id, ghost.id)
    assert.equal(kept.body, 'Gitmeden önce bir yorum')
    assert.equal(kept.reply_count, 1)
    const listed = await fetch(`${base}/yorumlar?series=${series.id}`, {
      headers: { accept: 'application/json' },
    })
    const listing: any = await listed.json()
    const shown = listing.items.find((item: any) => item.id === thread)
    assert.equal(shown.author.fullName, 'Silinmiş üye')
    assert.equal(await statusOf(client().request(`/uye/${ghostUsername}`)), 404)
    // The session (and the remember-me login) ended.
    assert.equal(await statusOf(web.request('/ayarlar')), 302)

    // With "delete my comments": a lone comment disappears, a replied one stays as "silindi".
    const second = await makeUser('yorum_silen')
    const lone = await comment(second, 'Tek başına')
    const replied = await comment(second, 'Yanıtı olan')
    const answer = await comment(friend, 'Cevap', replied)
    const deleter = client()
    await deleter.login('yorum_silen')
    await deleter.post('/ayarlar/hesabi-sil', {
      delete_password: password,
      confirm_username: 'yorum_silen',
      delete_comments: 'on',
    })
    assert.isNull(await User.find(second.id))
    assert.isNull(await db.from('comments').where('id', lone).first())
    const placeholder = await db.from('comments').where('id', replied).first()
    assert.equal(placeholder.body, '')
    assert.isNotNull(placeholder.deleted_at)
    assert.equal(placeholder.user_id, ghost.id)
    assert.isNotNull(await db.from('comments').where('id', answer).first())
    // The same placeholder account is reused.
    assert.equal(await countOf('users', { username: ghostUsername }), 1)
  })

  test('the last administrator cannot delete the account', async ({ assert }) => {
    const admin = await makeUser('tek_yonetici', { role: 'admin' })
    const others = await db
      .from('users')
      .where('role', 'admin')
      .whereNull('banned_at')
      .whereNot('id', admin.id)
      .select('id')
    const ids = others.map((row) => row.id)
    if (ids.length) await db.from('users').whereIn('id', ids).update({ banned_at: now() })
    try {
      const web = client()
      await web.login('tek_yonetici')
      const refused = await web.post('/ayarlar/hesabi-sil', {
        delete_password: password,
        confirm_username: 'tek_yonetici',
      })
      assert.equal(refused.headers.get('location'), '/ayarlar#security')
      assert.isNotNull(await User.find(admin.id))
      assert.include(await textOf(web.request('/ayarlar')), 'tek yöneticisi')
    } finally {
      if (ids.length) await db.from('users').whereIn('id', ids).update({ banned_at: null })
    }
    // With another administrator it works.
    await makeUser('ikinci_yonetici', { role: 'admin' })
    const web = client()
    await web.login('tek_yonetici')
    await web.post('/ayarlar/hesabi-sil', {
      delete_password: password,
      confirm_username: 'tek_yonetici',
    })
    assert.isNull(await User.find(admin.id))
  })

  test('data export contains the member’s data and is throttled', async ({ assert }) => {
    const user = await makeUser('veri_isteyen')
    const visible = await makeSeries('guvenlik-acik')
    const hidden = await makeSeries('guvenlik-taslak', true)
    const stamp = now()
    for (const series of [visible.series, hidden.series])
      await db
        .table('bookmarks')
        .insert({ user_id: user.id, series_id: series.id, created_at: stamp })
    await db.table('comments').insert({
      user_id: user.id,
      series_id: visible.series.id,
      body: 'Dışa aktarılacak yorum',
      spoiler: false,
      depth: 0,
      like_count: 0,
      dislike_count: 0,
      reply_count: 0,
      created_at: stamp,
      updated_at: stamp,
    })
    await db.table('series_reviews').insert({
      user_id: user.id,
      series_id: visible.series.id,
      rating: 9,
      title: 'Başlık',
      body: null,
      spoiler: false,
      helpful_count: 0,
      created_at: stamp,
      updated_at: stamp,
    })
    await db.table('notifications').insert({
      user_id: user.id,
      category: 'system',
      title: 'Bildirim başlığı',
      body: '',
      created_at: stamp,
    })

    const web = client()
    await web.login('veri_isteyen')
    const download = await web.request('/ayarlar/verilerim')
    assert.equal(download.status, 200)
    assert.include(download.headers.get('content-type') || '', 'application/json')
    assert.match(
      download.headers.get('content-disposition') || '',
      /attachment; filename="?verilerim-veri_isteyen-/
    )
    const text = await download.text()
    assert.notInclude(text, user.password)
    const data = JSON.parse(text)
    assert.equal(data.profile.username, 'veri_isteyen')
    assert.equal(data.profile.email, 'veri_isteyen@example.com')
    assert.notProperty(data.profile, 'password')
    assert.lengthOf(data.bookmarks, 2)
    assert.sameMembers(
      data.bookmarks.map((row: any) => row.series),
      [visible.series.title, null]
    )
    assert.equal(data.comments[0].body, 'Dışa aktarılacak yorum')
    assert.equal(data.reviews[0].rating, 9)
    assert.equal(data.notifications[0].title, 'Bildirim başlığı')
    for (const key of ['readingHistory', 'cosmetics', 'cards', 'badges', 'shards'])
      assert.isArray(data[key])

    for (let index = 0; index < 4; index++)
      assert.equal(await statusOf(web.request('/ayarlar/verilerim')), 200)
    const limited = await web.request('/ayarlar/verilerim')
    assert.equal(limited.status, 302)
    assert.equal(limited.headers.get('location'), '/ayarlar#security')
    assert.equal(await statusOf(client().request('/ayarlar/verilerim')), 302)
  })
})
