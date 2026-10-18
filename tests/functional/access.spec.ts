import { test } from '@japa/runner'
import { access as exists } from 'node:fs/promises'
import { join } from 'node:path'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import content from '#config/content'
import settings from '#services/settings_service'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'access-password-123'
/** 1×1 transparent PNG. */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)
const statusOf = (response: Promise<Response>) => response.then((result) => result.status)
const onDisk = (publicPath: string) =>
  exists(join(content.root, ...publicPath.slice('/content/'.length).split('/'))).then(
    () => true,
    () => false
  )

/** Cookie-aware client with form logins, CSRF form posts and header-token uploads. */
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
  const page = async (path: string) => {
    const response = await request(path)
    return response.text()
  }
  const token = async (path = '/giris') =>
    page(path).then((html) => html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || '')
  const post = async (path: string, fields: Record<string, string>, from = '/giris') =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  const login = (identifier: string) => post('/giris', { login: identifier, password })
  const upload = async (kind: string, bytes: Buffer, name: string) => {
    const html = await page('/admin/tema/genel')
    const meta = html.match(/name="csrf-token" content="([^"]+)"/)
    const form = new FormData()
    form.append('kind', kind)
    form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), name)
    return request('/admin/tema/gorsel', {
      method: 'POST',
      body: form,
      headers: { 'accept': 'application/json', 'x-csrf-token': meta?.[1] || '' },
    })
  }
  return { request, page, post, login, upload }
}

test.group('Drafts, members / VIP content and age gates', (group) => {
  let type: ContentType
  const series: Record<string, Series> = {}
  const chapters: Record<string, Chapter> = {}

  group.setup(async () => {
    const timestamp = now()
    type = await ContentType.create({
      name: 'Erişim Metni',
      slug: 'erisim-metni',
      format: 'text',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const make = (slug: string, extra: Partial<Series> = {}) =>
      Series.create({
        title: `Erişim ${slug}`,
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
    series.open = await make('erisim-acik')
    series.draft = await make('erisim-taslak', { draft: true })
    series.vip = await make('erisim-vip', { access: 'vip' })
    series.adult = await make('erisim-yetiskin', { ageRating: '18+' })
    series.teen = await make('erisim-genc', { ageRating: '16+' })
    const chapter = (key: string, owner: Series, number: number, extra: Partial<Chapter> = {}) =>
      Chapter.create({
        seriesId: owner.id,
        number,
        title: null,
        content: { type: 'text', text: `GİZLİ METİN ${key}` },
        publishedAt: timestamp.slice(0, 10),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      }).then((created) => (chapters[key] = created))
    await chapter('public', series.open, 1)
    await chapter('draft', series.open, 2, { draft: true })
    await chapter('members', series.open, 3, { access: 'members' })
    await chapter('warned', series.open, 4, { warning: 'Bu bölüm şiddet içerir.' })
    await chapter('vip', series.vip, 1)
    await chapter('adult', series.adult, 1)
    await chapter('teen', series.teen, 1)
    for (const [username, role] of [
      ['erisim_admin', 'admin'],
      ['erisim_vip', 'vip'],
      ['erisim_uye', 'member'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
  })

  group.each.setup(() => clearAttempts('login:127.0.0.1'))

  group.teardown(async () => {
    await Series.query()
      .whereIn(
        'id',
        Object.values(series).map((item) => item.id)
      )
      .delete()
    await type.delete()
    await User.query().whereLike('username', 'erisim_%').delete()
    await settings.save({ age_policy_18: '', age_policy_16: '' })
  })

  test('drafts are hidden from readers and listed nowhere; staff preview them', async ({
    assert,
  }) => {
    const guest = client()
    const catalog = await guest.page('/seriler?type=erisim-metni')
    assert.include(catalog, 'href="/series/erisim-metni/erisim-acik"')
    assert.notInclude(catalog, 'erisim-taslak')
    assert.notInclude(await guest.page('/ara?q=Erişim'), 'erisim-taslak')
    assert.equal(await statusOf(guest.request('/series/erisim-metni/erisim-taslak')), 404)

    // The draft chapter: not in the list, not openable.
    const detail = await guest.page('/series/erisim-metni/erisim-acik')
    assert.include(detail, 'href="/series/erisim-metni/erisim-acik/1"')
    assert.notInclude(detail, 'href="/series/erisim-metni/erisim-acik/2"')
    assert.equal(await statusOf(guest.request('/series/erisim-metni/erisim-acik/2')), 404)

    const admin = client()
    await admin.login('erisim_admin')
    const preview = await admin.page('/series/erisim-metni/erisim-taslak')
    assert.include(preview, 'Taslak seri')
    const chapter = await admin.page('/series/erisim-metni/erisim-acik/2')
    assert.include(chapter, 'GİZLİ METİN draft')
    assert.include(chapter, 'Taslak bölüm')
  })

  test('members and VIP chapters ask for an account or the VIP role', async ({ assert }) => {
    const guest = client()
    const locked = await guest.request('/series/erisim-metni/erisim-acik/3')
    assert.equal(locked.status, 403)
    const lockedHtml = await locked.text()
    assert.include(lockedHtml, 'Üyelere özel')
    assert.include(lockedHtml, '/giris?next=%2Fseries%2Ferisim-metni%2Ferisim-acik%2F3')
    assert.notInclude(lockedHtml, 'GİZLİ METİN')
    // The series page lists the chapter with a lock; the thread API stays closed.
    assert.match(
      await guest.page('/series/erisim-metni/erisim-acik'),
      /lock-badge[^>]*title="Üyelere özel"/
    )
    const thread = await guest.request(
      `/yorumlar?series=${series.open.id}&chapter=${chapters.members.id}`
    )
    assert.equal(thread.status, 403)

    const member = client()
    await member.login('erisim_uye')
    assert.include(await member.page('/series/erisim-metni/erisim-acik/3'), 'GİZLİ METİN members')
    const vipForMember = await member.request('/series/erisim-metni/erisim-vip/1')
    assert.equal(vipForMember.status, 403)
    assert.include(await vipForMember.text(), "VIP'lere özel")
    assert.equal(
      await db
        .from('chapter_reads')
        .where('chapter_id', chapters.vip.id)
        .count('* as n')
        .first()
        .then((row) => Number(row.n)),
      0
    )

    const vip = client()
    await vip.login('erisim_vip')
    assert.include(await vip.page('/series/erisim-metni/erisim-vip/1'), 'GİZLİ METİN vip')
    const admin = client()
    await admin.login('erisim_admin')
    assert.include(await admin.page('/series/erisim-metni/erisim-vip/1'), 'GİZLİ METİN vip')
  })

  test('age policies: 18+ asks guests to sign in, 16+ asks for a confirmation', async ({
    assert,
  }) => {
    const guest = client()
    const adult = await guest.request('/series/erisim-metni/erisim-yetiskin')
    assert.equal(adult.status, 403)
    assert.include(await adult.text(), '18+ içerik için giriş yap')

    const teen = await guest.page('/series/erisim-metni/erisim-genc/1')
    assert.include(teen, '16 yaş ve üzeri içerik')
    assert.include(teen, 'action="/yas-onayi"')
    assert.notInclude(teen, 'GİZLİ METİN')
    const confirmed = await guest.post(
      '/yas-onayi',
      { age: '16', next: '/series/erisim-metni/erisim-genc/1' },
      '/series/erisim-metni/erisim-genc/1'
    )
    assert.equal(confirmed.headers.get('location'), '/series/erisim-metni/erisim-genc/1')
    assert.include(await guest.page('/series/erisim-metni/erisim-genc/1'), 'GİZLİ METİN teen')
    // An outside address in `next` falls back to the home page.
    const outside = await guest.post(
      '/yas-onayi',
      { age: '16', next: 'https://example.com/' },
      '/series/erisim-metni/erisim-genc/1'
    )
    assert.equal(outside.headers.get('location'), '/')

    // A member still confirms 18+ once; the confirmation covers 16+ too.
    const member = client()
    await member.login('erisim_uye')
    assert.include(await member.page('/series/erisim-metni/erisim-yetiskin'), '18 yaşından büyüğüm')
    await member.post(
      '/yas-onayi',
      { age: '18', next: '/series/erisim-metni/erisim-yetiskin' },
      '/series/erisim-metni/erisim-yetiskin'
    )
    assert.include(await member.page('/series/erisim-metni/erisim-yetiskin/1'), 'GİZLİ METİN adult')
    assert.include(await member.page('/series/erisim-metni/erisim-genc/1'), 'GİZLİ METİN teen')

    // Admin → Tema → Yaş ve Erişim: 18+ without a gate opens for guests.
    const admin = client()
    await admin.login('erisim_admin')
    const page = await admin.page('/admin/tema/erisim')
    assert.match(page, /name="age_policy_18" value="members"[^>]*checked/)
    await admin.post(
      '/admin/tema/erisim',
      { age_policy_18: 'none', age_policy_16: 'warn', age_policy_13: 'none', age_policy_7: 'none' },
      '/admin/tema/erisim'
    )
    assert.equal(settings.agePolicy('18+'), 'none')
    assert.include(
      await client().page('/series/erisim-metni/erisim-yetiskin/1'),
      'GİZLİ METİN adult'
    )
    await settings.save({ age_policy_18: '' })
  })

  test('a chapter warning comes first and nothing is recorded before it', async ({ assert }) => {
    const member = client()
    await member.login('erisim_uye')
    const warning = await member.page('/series/erisim-metni/erisim-acik/4')
    assert.include(warning, 'Bölüm uyarısı')
    assert.include(warning, 'Bu bölüm şiddet içerir.')
    assert.include(warning, 'href="/series/erisim-metni/erisim-acik/4?onay=1"')
    assert.notInclude(warning, 'GİZLİ METİN')
    const user = await User.findByOrFail('username', 'erisim_uye')
    const reads = () =>
      db
        .from('chapter_reads')
        .where({ user_id: user.id, chapter_id: chapters.warned.id })
        .count('* as n')
        .first()
        .then((row) => Number(row.n))
    assert.equal(await reads(), 0)
    assert.include(
      await member.page('/series/erisim-metni/erisim-acik/4?onay=1'),
      'GİZLİ METİN warned'
    )
    assert.equal(await reads(), 1)
  })

  test('admin: a chapter saved as draft is announced when it is published', async ({ assert }) => {
    const admin = client()
    await admin.login('erisim_admin')
    const reader = await User.findByOrFail('username', 'erisim_uye')
    await db.table('bookmarks').insert({
      user_id: reader.id,
      series_id: series.open.id,
      created_at: now(),
    })
    const notices = () =>
      db
        .from('notifications')
        .where({ user_id: reader.id, category: 'chapter' })
        .count('* as n')
        .first()
        .then((row) => Number(row.n))
    const form = `/admin/bolumler/ekle?series_id=${series.open.id}`
    const fields = { series_id: String(series.open.id), number: '9', text_content: 'Yeni metin' }
    await admin.post('/admin/bolumler/ekle', { ...fields, draft: 'on', access: 'vip' }, form)
    const saved = await Chapter.query().where({ seriesId: series.open.id, number: 9 }).firstOrFail()
    assert.isTrue(saved.draft)
    assert.equal(saved.access, 'vip')
    assert.equal(await notices(), 0)

    await db.from('chapters').where('id', saved.id).update({ published_at: '2020-01-01' })
    await admin.post(
      `/admin/bolumler/${saved.id}/duzenle`,
      { ...fields, warning: 'Spoiler içerir' },
      `/admin/bolumler/${saved.id}/duzenle`
    )
    await saved.refresh()
    assert.isFalse(saved.draft)
    assert.equal(saved.access, 'public')
    assert.equal(saved.warning, 'Spoiler içerir')
    assert.equal(saved.publishedAt, now().slice(0, 10))
    assert.equal(await notices(), 1)
    await db.from('bookmarks').where({ user_id: reader.id }).delete()
    await db.from('notifications').where({ user_id: reader.id }).delete()
  })
})

test.group('Theme images: logo, phone logo, tab icon and background uploads', (group) => {
  group.setup(async () => {
    for (const [username, role] of [
      ['tema_gorsel_admin', 'admin'],
      ['tema_gorsel_uye', 'member'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
  })
  group.each.setup(() => clearAttempts('login:127.0.0.1'))
  group.teardown(async () => {
    await settings.save({ logo_url: '', logo_mobile_url: '', favicon_url: '' })
    await User.query().whereLike('username', 'tema_gorsel_%').delete()
  })

  test('uploads fill the fields, the site uses them and replaced files are deleted', async ({
    assert,
  }) => {
    const admin = client()
    await admin.login('tema_gorsel_admin')
    const genel = await admin.page('/admin/tema/genel')
    for (const kind of ['logo', 'logo_mobile', 'favicon'])
      assert.include(genel, `data-kind="${kind}"`)
    assert.include(await admin.page('/admin/tema/gorunum'), 'data-kind="background"')

    const uploaded: Record<string, string> = {}
    for (const kind of ['logo', 'logo_mobile', 'favicon', 'background']) {
      const response = await admin.upload(kind, png, `${kind}.png`)
      assert.equal(response.status, 200, kind)
      const { url } = (await response.json()) as { url: string }
      assert.match(url, /^\/content\/branding\/[0-9a-f-]+\.png$/)
      assert.isTrue(await onDisk(url))
      uploaded[kind] = url
    }
    // Wrong kind, a disguised SVG and a member are refused.
    assert.equal(await statusOf(admin.upload('banner', png, 'x.png')), 422)
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    assert.equal(await statusOf(admin.upload('logo', svg, 'logo.svg')), 422)
    const member = client()
    await member.login('tema_gorsel_uye')
    // Non-administrators never reach the endpoint (role middleware).
    assert.notEqual(await statusOf(member.upload('logo', png, 'x.png')), 200)

    await admin.post(
      '/admin/tema/genel',
      {
        site_name: 'MangaHub',
        logo_url: uploaded.logo,
        logo_mobile_url: uploaded.logo_mobile,
        favicon_url: uploaded.favicon,
      },
      '/admin/tema/genel'
    )
    const home = await client().page('/')
    assert.include(home, `<link rel="icon" href="${uploaded.favicon}">`)
    assert.match(home, new RegExp(`src="${uploaded.logo}" alt="" class="logo__img max-lg:hidden"`))
    assert.match(
      home,
      new RegExp(`src="${uploaded.logo_mobile}" alt="" class="logo__img lg:hidden"`)
    )

    // Replacing the logo deletes the old upload; an address typed by hand is kept as is.
    const second = await admin.upload('logo', png, 'yeni.png')
    const { url: newLogo } = (await second.json()) as { url: string }
    await admin.post(
      '/admin/tema/genel',
      {
        site_name: 'MangaHub',
        logo_url: newLogo,
        logo_mobile_url: uploaded.logo_mobile,
        favicon_url: '/images/no-cover.svg',
      },
      '/admin/tema/genel'
    )
    assert.isFalse(await onDisk(uploaded.logo))
    assert.isFalse(await onDisk(uploaded.favicon))
    assert.isTrue(await onDisk(newLogo))
    assert.include(await client().page('/'), '<link rel="icon" href="/images/no-cover.svg">')
  })
})
