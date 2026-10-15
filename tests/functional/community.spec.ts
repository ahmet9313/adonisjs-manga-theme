import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import Bookmark from '#models/bookmark'
import User from '#models/user'
import Cosmetic from '#models/cosmetic'
import Card from '#models/card'
import cards from '#services/card_service'
import progress from '#services/progress_service'
import { now } from '#services/input_service'
import { localDay, previousDay } from '#services/level'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'community-pass-123'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}
const jsonOf = async (response: Promise<Response>): Promise<any> => {
  const result = await response
  return result.json()
}
const statusOf = async (response: Promise<Response>) => {
  const result = await response
  return result.status
}
const pick = async (response: Promise<Response>, key: string): Promise<any> => {
  const data = await jsonOf(response)
  return data[key]
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
  const page = (path: string) => request(path, { headers: { accept: 'text/html' } })
  const login = async (identifier: string) =>
    request('/giris', {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: new URLSearchParams({ login: identifier, password }),
    })
  const register = async (username: string) =>
    request('/kayit', {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: new URLSearchParams({
        username,
        email: `${username}@example.com`,
        password,
        password_confirmation: password,
      }),
    })
  const json = async (path: string, body: unknown = {}) =>
    request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'x-csrf-token': await token(),
      },
      body: JSON.stringify(body),
    })
  const get = (path: string) => request(path, { headers: { accept: 'application/json' } })
  const form = async (path: string, data: FormData) =>
    request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': await token(), 'accept': 'text/html' },
      body: data,
    })
  return { request, page, login, register, json, get, form, token }
}

let series: Series
let other: Series
let chapters: Chapter[] = []

async function member(username: string, extra: Partial<User> = {}) {
  const timestamp = now()
  return User.create({
    username,
    fullName: username,
    email: `${username}@example.com`,
    password,
    role: 'member',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  })
}

test.group('Community: earned progression, inbox, cosmetics and cards', (group) => {
  group.setup(async () => {
    clearAttempts()
    const timestamp = now()
    const type = await ContentType.create({ name: 'Topluluk', slug: 'topluluk' })
    const make = (title: string, slug: string) =>
      Series.create({
        title,
        slug,
        description: 'Topluluk testi',
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
    series = await make('Topluluk Serisi', 'topluluk-serisi')
    other = await make('Popüler Seri', 'populer-seri')
    for (let number = 1; number <= 3; number++)
      chapters.push(
        await Chapter.create({
          seriesId: series.id,
          number,
          title: null,
          content: { type: 'images', pages: ['/images/no-cover.svg'] },
          publishedAt: '2026-10-01',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      )
  })
  group.each.setup(() => clearAttempts())

  test('signing up sends a welcome message and EXP; the inbox can be filtered and cleaned', async ({
    assert,
  }) => {
    const reader = client()
    assert.equal(await statusOf(reader.register('yeni_okur')), 302)
    const user = await User.findByOrFail('username', 'yeni_okur')
    assert.equal(user.exp, 50)

    const home = await textOf(reader.page('/'))
    assert.include(home, 'Günlük Giriş')
    assert.include(home, 'data-unread="1"')
    assert.include(home, 'Gelen Kutusu')

    const inbox = await jsonOf(reader.get('/bildirimler'))
    assert.equal(inbox.unread, 1)
    assert.equal(inbox.items[0].category, 'system')
    assert.include(inbox.items[0].title, 'hoş geldin')
    assert.lengthOf(await pick(reader.get('/bildirimler?filter=reward'), 'items'), 0)

    const id = inbox.items[0].id
    assert.deepEqual(await jsonOf(reader.json(`/bildirimler/${id}/okundu`, { read: '1' })), {
      read: true,
      unread: 0,
    })
    assert.lengthOf(await pick(reader.get('/bildirimler?filter=unread'), 'items'), 0)
    await reader.json(`/bildirimler/${id}/okundu`, { read: '0' })
    await reader.json('/bildirimler/tumu-okundu')
    assert.equal(await pick(reader.get('/bildirimler'), 'unread'), 0)

    // Someone else's notification cannot be touched.
    const stranger = client()
    await stranger.register('baska_okur')
    assert.equal(await statusOf(stranger.json(`/bildirimler/${id}/sil`)), 404)

    assert.equal(await statusOf(reader.json(`/bildirimler/${id}/sil`)), 200)
    assert.lengthOf(await pick(reader.get('/bildirimler'), 'items'), 0)
    await db.table('notifications').insert({
      user_id: user.id,
      category: 'chapter',
      title: 'x',
      body: '',
      created_at: now(),
    })
    await reader.json('/bildirimler/tumunu-sil', { filter: 'all' })
    assert.lengthOf(await pick(reader.get('/bildirimler'), 'items'), 0)
  })

  test('daily check-in grows the streak once per day and the 7th day guarantees a card', async ({
    assert,
  }) => {
    const timestamp = now()
    await Card.create({
      name: 'Kahraman',
      image: '/images/no-cover.svg',
      rarity: 'B',
      seriesId: series.id,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const user = await member('gunluk_okur')
    const reader = client()
    await reader.login('gunluk_okur')

    const first = await jsonOf(reader.json('/gunluk-giris'))
    assert.isFalse(first.already)
    assert.equal(first.streak, 1)
    assert.equal(first.gained, 20)
    assert.isTrue(await pick(reader.json('/gunluk-giris'), 'already'))

    // Pretend the reader checked in yesterday on day six of a streak.
    await db
      .from('users')
      .where('id', user.id)
      .update({ last_checkin_on: previousDay(localDay()), streak: 6 })
    const seventh = await jsonOf(reader.json('/gunluk-giris'))
    assert.equal(seventh.streak, 7)
    assert.equal(seventh.gained, 50)
    assert.equal(seventh.card.name, 'Kahraman')
    await user.refresh()
    assert.equal(user.bestStreak, 7)
    const badges = await progress.earnedBadges(user.id)
    assert.isTrue(badges.has('sadik'))
    const inbox = await jsonOf(reader.get('/bildirimler?filter=reward'))
    assert.isTrue(inbox.items.some((item: any) => item.title.includes('Kahraman')))
    assert.isTrue(inbox.items.some((item: any) => item.title.includes('Sadık')))

    // The "Sadık" badge opens its frame.
    const frame = await Cosmetic.findByOrFail('slug', 'cerceve-sadik')
    assert.equal(await statusOf(reader.json(`/kozmetik/${frame.id}/kusan`)), 200)
  })

  test('first chapter reads give EXP and badges once; menu and reward pages render', async ({
    assert,
  }) => {
    const user = await member('okuyan_okur')
    const reader = client()
    await reader.login('okuyan_okur')
    const html = await textOf(reader.page(`/series/topluluk/${series.slug}/1`))
    assert.include(html, 'data-reward-toast')
    await user.refresh()
    // +10 for the chapter, +20 for the "İlk Adım" badge.
    assert.equal(user.exp, 30)

    clearAttempts()
    await reader.page(`/series/topluluk/${series.slug}/1`)
    await user.refresh()
    assert.equal(user.exp, 30, 'rereading a chapter gives nothing')

    // Rapid page flipping is throttled.
    await reader.page(`/series/topluluk/${series.slug}/2`)
    await reader.page(`/series/topluluk/${series.slug}/3`)
    await user.refresh()
    assert.equal(user.exp, 40)

    for (const path of [
      '/oduller',
      '/rozetler',
      '/kartlar',
      '/gecmis',
      '/ayarlar',
      '/uye/okuyan_okur',
    ]) {
      const response = await reader.page(path)
      assert.equal(response.status, 200, path)
      const body = await response.text()
      assert.notInclude(body, '@!component', path)
    }
    const badges = await textOf(reader.page('/rozetler'))
    assert.include(badges, 'İlk Adım')
    const history = await textOf(reader.page('/gecmis'))
    assert.include(history, 'Topluluk Serisi')
    assert.include(history, 'Bölüm 3')

    // Recommendations skip series the reader already started.
    const popular = await textOf(reader.page('/oneriler?sekme=populer'))
    assert.include(popular, 'Popüler Seri')
    assert.notInclude(popular, 'Topluluk Serisi')
    assert.equal(await statusOf(client().page('/oneriler')), 200)
  })

  test('cosmetics: locked items cannot be equipped, equipped ones show on comments', async ({
    assert,
  }) => {
    const user = await member('kozmetik_okur')
    const reader = client()
    await reader.login('kozmetik_okur')
    const zumrut = await Cosmetic.findByOrFail('slug', 'efekt-zumrut')
    const gokkusagi = await Cosmetic.findByOrFail('slug', 'efekt-gokkusagi')
    const ekip = await Cosmetic.findByOrFail('slug', 'efekt-ekip')

    const store = await textOf(reader.page('/kozmetik/efektler'))
    assert.include(store, 'Gökkuşağı')
    assert.include(store, 'Seviye 30')
    assert.notInclude(store, 'SATIN AL')

    assert.equal(await statusOf(reader.json(`/kozmetik/${gokkusagi.id}/kusan`)), 422)
    assert.equal(await statusOf(reader.json(`/kozmetik/${ekip.id}/kusan`)), 422)
    const equipped = await jsonOf(reader.json(`/kozmetik/${zumrut.id}/kusan`))
    assert.equal(equipped.look.effect.cls, 'fx fx-zumrut')

    const inventory = await jsonOf(reader.get('/envanter'))
    assert.isTrue(inventory.effect.some((item: any) => item.id === zumrut.id && item.equipped))
    assert.isFalse(inventory.effect.some((item: any) => item.id === gokkusagi.id))
    assert.isTrue(inventory.sticker.length > 0)

    const form = new FormData()
    form.set('series_id', String(series.id))
    form.set('body', 'Efektli yorum')
    const created = await jsonOf(
      reader.request('/yorumlar', {
        method: 'POST',
        body: form,
        headers: { 'x-csrf-token': await reader.token(), 'accept': 'application/json' },
      })
    )
    assert.equal(created.author.look.effect.cls, 'fx fx-zumrut')
    assert.equal(created.author.level, 1)
    assert.isTrue(created.author.online)

    // Gift-only items work after an admin gift; taking off clears the slot.
    await db
      .table('user_cosmetics')
      .insert({ user_id: user.id, cosmetic_id: ekip.id, created_at: now() })
    assert.equal(await statusOf(reader.json(`/kozmetik/${ekip.id}/kusan`)), 200)
    const takenOff = await pick(reader.json('/kozmetik/cikar/effect'), 'look')
    assert.isNull(takenOff.effect)
    assert.equal(await statusOf(reader.json('/kozmetik/cikar/sticker')), 422)
  })

  test('stickers, up/down votes and reply notifications in comments', async ({ assert }) => {
    const author = await member('yorum_sahibi')
    await member('yanitlayan')
    const first = client()
    await first.login('yorum_sahibi')
    const second = client()
    await second.login('yanitlayan')
    const post = async (who: ReturnType<typeof client>, fields: Record<string, string>) => {
      const form = new FormData()
      for (const [key, value] of Object.entries(fields)) form.set(key, value)
      return who.request('/yorumlar', {
        method: 'POST',
        body: form,
        headers: { 'x-csrf-token': await who.token(), 'accept': 'application/json' },
      })
    }

    const locked = await Cosmetic.findByOrFail('slug', 'cikartma-dusunceli')
    const open = await Cosmetic.findByOrFail('slug', 'cikartma-selam')
    assert.equal(
      await statusOf(post(first, { series_id: String(series.id), sticker_id: String(locked.id) })),
      422
    )
    const sticker = await jsonOf(
      post(first, { series_id: String(series.id), sticker_id: String(open.id) })
    )
    assert.equal(sticker.sticker.image, '/images/stickers/selam.svg')
    assert.equal(sticker.body, '')

    const reply = await post(second, {
      series_id: String(series.id),
      parent_id: String(sticker.id),
      body: 'Selam!',
    })
    assert.equal(reply.status, 201)
    const inbox = await jsonOf(first.get('/bildirimler?filter=activity'))
    assert.include(inbox.items[0].title, 'yanıt verdi')
    assert.include(inbox.items[0].link, `/series/topluluk/${series.slug}#yorumlar`)

    let vote = await jsonOf(second.json(`/yorumlar/${sticker.id}/oy`, { value: 1 }))
    assert.deepInclude(vote, { vote: 1, likeCount: 1, dislikeCount: 0 })
    vote = await jsonOf(second.json(`/yorumlar/${sticker.id}/oy`, { value: -1 }))
    assert.deepInclude(vote, { vote: -1, likeCount: 0, dislikeCount: 1 })
    vote = await jsonOf(second.json(`/yorumlar/${sticker.id}/oy`, { value: -1 }))
    assert.deepInclude(vote, { vote: 0, likeCount: 0, dislikeCount: 0 })
    // The legacy like endpoint still toggles an up-vote.
    assert.isTrue(await pick(second.json(`/yorumlar/${sticker.id}/begen`), 'liked'))

    const list = await jsonOf(second.get(`/yorumlar?series=${series.id}&sort=top`))
    const listed = list.items.find((item: any) => item.id === sticker.id)
    assert.equal(listed.vote, 1)
    assert.equal(listed.sticker.name, 'Selam')
    await author.refresh()
    assert.isAbove(author.exp, 0)
  })

  test('cards: series covers become cards, duplicates break into shards, shards craft cards', async ({
    assert,
  }) => {
    const user = await member('kart_okur')
    const reader = client()
    await reader.login('kart_okur')
    const created = await cards.createFromSeries(() => 0)
    assert.isAtLeast(created, 1)
    const card = await Card.query().where('seriesId', other.id).firstOrFail()
    assert.equal(card.rarity, 'F')

    await cards.give(user.id, card, false)
    assert.equal(await statusOf(reader.json(`/kartlar/${card.id}/parcala`)), 422)
    await cards.give(user.id, card, false)
    await cards.give(user.id, card, false)
    await cards.give(user.id, card, false)
    const broken = await jsonOf(reader.json(`/kartlar/${card.id}/parcala`))
    assert.deepInclude(broken, { rarity: 'F', gained: 3 })
    assert.equal(broken.shards.F, 3)

    const crafted = await jsonOf(reader.json('/kartlar/uret', { rarity: 'F' }))
    assert.equal(crafted.card.rarity, 'F')
    assert.equal(crafted.shards.F, 0)
    assert.equal(await statusOf(reader.json('/kartlar/uret', { rarity: 'F' })), 422)
    assert.equal(await statusOf(reader.json('/kartlar/uret', { rarity: 'X' })), 422)

    // Two simultaneous "break down" clicks convert the same copies only once.
    await cards.give(user.id, card, false)
    await cards.give(user.id, card, false)
    const results = await Promise.all([
      cards.disassemble(user.id, card.id),
      cards.disassemble(user.id, card.id),
    ])
    const won = results.filter(Boolean)
    assert.lengthOf(won, 1)
    const shards = await db.from('user_shards').where({ user_id: user.id, rarity: 'F' }).first()
    assert.equal(Number(shards.amount), won[0]!.gained)
    const [copies] = await db.from('user_cards').where({ user_id: user.id, card_id: card.id })
    assert.equal(Number(copies.count), 1)

    const page = await textOf(reader.page('/kartlar'))
    assert.include(page, 'Kart parçaları ve üretim')
  })

  test('profile likes notify once and cannot target yourself', async ({ assert }) => {
    const target = await member('begenilen')
    await member('begenen')
    const fan = client()
    await fan.login('begenen')
    assert.deepEqual(await jsonOf(fan.json('/uye/begenilen/begen')), { liked: true, count: 1 })
    assert.deepEqual(await jsonOf(fan.json('/uye/begenilen/begen')), { liked: false, count: 0 })
    assert.deepEqual(await jsonOf(fan.json('/uye/begenilen/begen')), { liked: true, count: 1 })
    const [row] = await db
      .from('notifications')
      .where({ user_id: target.id, category: 'activity' })
      .count('* as total')
    assert.equal(Number(row.total), 1)
    assert.equal(await statusOf(fan.json('/uye/begenen/begen')), 422)
    const profile = await textOf(fan.page('/uye/begenilen'))
    assert.include(profile, 'Son etkinlik')
  })

  test('admins manage cosmetics and new chapters reach readers who saved the series', async ({
    assert,
  }) => {
    const timestamp = now()
    await User.create({
      username: 'yonetici_k',
      fullName: 'Yönetici',
      email: 'yonetici_k@example.com',
      password,
      role: 'admin',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const fan = await member('kaydeden_okur')
    await Bookmark.create({ userId: fan.id, seriesId: series.id, createdAt: timestamp })
    const admin = client()
    await admin.login('yonetici_k')

    const effect = new FormData()
    effect.set('kind', 'effect')
    effect.set('name', 'Özel Geçiş')
    effect.set('style_mode', 'gradient')
    effect.append('colors[0]', '#ff0000')
    effect.append('colors[1]', '#00ff00')
    effect.set('required_level', '2')
    effect.set('active', 'on')
    assert.equal(await statusOf(admin.form('/admin/kozmetikler/ekle', effect)), 302)
    const saved = await Cosmetic.findByOrFail('name', 'Özel Geçiş')
    assert.equal(saved.style, 'grad:#ff0000,#00ff00')

    const sticker = new FormData()
    sticker.set('kind', 'sticker')
    sticker.set('name', 'Test Çıkartma')
    sticker.set('style_mode', 'image')
    sticker.set('required_level', '1')
    sticker.set('active', 'on')
    sticker.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'c.png')
    assert.equal(await statusOf(admin.form('/admin/kozmetikler/ekle', sticker)), 302)
    const uploaded = await Cosmetic.findByOrFail('name', 'Test Çıkartma')
    assert.match(uploaded.image!, /^\/content\/cosmetics\/sticker\/.+\.png$/)
    assert.equal(await statusOf(admin.page('/admin/kozmetikler')), 200)
    assert.equal(await statusOf(admin.page(`/admin/kozmetikler/${uploaded.id}/duzenle`)), 200)
    assert.equal(await statusOf(admin.page('/admin/kartlar')), 200)

    const gift = new FormData()
    gift.set('username', 'kaydeden_okur')
    await admin.form(`/admin/kozmetikler/${uploaded.id}/hediye`, gift)
    assert.isOk(
      await db.from('user_cosmetics').where({ user_id: fan.id, cosmetic_id: uploaded.id }).first()
    )

    assert.equal(
      await statusOf(admin.form(`/admin/kozmetikler/${uploaded.id}/sil`, new FormData())),
      302
    )
    assert.isNull(await Cosmetic.find(uploaded.id))

    const chapter = new FormData()
    chapter.set('series_id', String(series.id))
    chapter.set('number', '4')
    chapter.set('page_order', JSON.stringify(['__new__']))
    chapter.append('pages', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'p1.png')
    assert.equal(await statusOf(admin.form('/admin/bolumler/ekle', chapter)), 302)
    const notice = await db
      .from('notifications')
      .where({ user_id: fan.id, category: 'chapter' })
      .first()
    assert.equal(notice.link, `/series/topluluk/${series.slug}/4`)
  })
})
