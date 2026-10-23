import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import installConfig from '#config/install'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import User from '#models/user'
import install, { INSTALLED_KEY, WIZARD_KEY } from '#services/install_service'
import settings from '#services/settings_service'
import { lookKey } from '#services/theme_service'

const base = 'http://127.0.0.1:3334'
const remote = { 'x-forwarded-for': '203.0.113.7' }

const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}

/** Cookie-aware client; `extra` headers go on every request (e.g. a proxy's forwarded-for). */
function client(extra: Record<string, string> = {}) {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        accept: 'text/html',
        ...extra,
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
    const page = await textOf(request(installConfig.path))
    return page.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  }
  const post = async (path: string, fields: Record<string, string> = {}) =>
    request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': await token() },
      body: new URLSearchParams(fields),
    })
  return { request, post }
}

/** Administrators made by other files are demoted during this file and restored afterwards. */
let demoted: number[] = []
/** Content types and genres that existed before this file (the rest are its own, removed). */
let typesBefore: number[] = []
let genresBefore: number[] = []

test.group('First-run setup wizard', (group) => {
  group.setup(async () => {
    // Any administrator would make the site count as installed (an existing site).
    const admins = await db.from('users').where('role', 'admin').select('id')
    demoted = admins.map((row) => Number(row.id))
    if (demoted.length) await db.from('users').whereIn('id', demoted).update({ role: 'editor' })
    const types = await db.from('content_types').select('id')
    const genres = await db.from('genres').select('id')
    typesBefore = types.map((row) => Number(row.id))
    genresBefore = genres.map((row) => Number(row.id))
  })
  group.each.setup(async () => {
    await settings.save({ [INSTALLED_KEY]: '', [WIZARD_KEY]: '' })
    install.testFresh = true
    install.reset()
  })
  group.teardown(async () => {
    if (demoted.length) await db.from('users').whereIn('id', demoted).update({ role: 'admin' })
    await db.from('users').where('username', 'kurulum_yonetici').delete()
    await db.from('content_types').whereNotIn('id', typesBefore).delete()
    await db.from('genres').whereNotIn('id', genresBefore).delete()
    await settings.save({
      site_name: '',
      site_description: '',
      site_url: '',
      [lookKey('default_scheme')]: '',
      [INSTALLED_KEY]: '',
      [WIZARD_KEY]: '',
    })
    install.testFresh = false
    install.reset()
  })

  test('before installation every page leads to the wizard', async ({ assert }) => {
    const visitor = client()
    const home = await visitor.request('/')
    assert.equal(home.status, 302)
    assert.equal(home.headers.get('location'), '/kurulum')
    const json = await visitor.request('/seriler', { headers: { accept: 'application/json' } })
    assert.equal(json.status, 503)

    const page = await textOf(visitor.request('/kurulum'))
    assert.include(page, 'Hoş geldin')
    assert.include(page, 'Sistem kontrolü')
    assert.include(page, 'Veritabanı hazır')
    // Same machine: no key asked, the next step is open.
    assert.notInclude(page, 'name="key"')
    assert.include(page, 'href="/kurulum/site"')
  })

  test('from another machine the console key is required', async ({ assert }) => {
    const outsider = client(remote)
    const page = await textOf(outsider.request('/kurulum'))
    assert.include(page, 'name="key"')
    assert.notInclude(page, 'href="/kurulum/site"')

    const blocked = await outsider.request('/kurulum/site')
    assert.equal(blocked.headers.get('location'), '/kurulum')
    const save = await outsider.post('/kurulum/site', {
      site_name: 'Ele Geçirildi',
      default_scheme: 'dark',
    })
    assert.equal(save.headers.get('location'), '/kurulum')
    assert.notEqual(settings.get('site_name'), 'Ele Geçirildi')

    await outsider.post('/kurulum/anahtar', { key: 'YANLIS00' })
    assert.include(await textOf(outsider.request('/kurulum')), 'Kurulum anahtarı yanlış')
    await outsider.post('/kurulum/anahtar', { key: install.key.toLowerCase() })
    const open = await outsider.request('/kurulum/site')
    assert.equal(open.status, 200)
  })

  test('the wizard sets up the site, the first administrator and the basics', async ({
    assert,
  }) => {
    const owner = client()

    // The admin step waits for nothing but the database; content and finish need the admin.
    const early = await owner.request('/kurulum/icerik')
    assert.equal(early.headers.get('location'), '/kurulum/yonetici')

    const short = await owner.post('/kurulum/site', { site_name: 'M', default_scheme: 'dark' })
    assert.equal(short.status, 302)
    assert.notEqual(short.headers.get('location'), '/kurulum/yonetici')
    const site = await owner.post('/kurulum/site', {
      site_name: 'Gölge Çeviri',
      site_description: 'Türkçe manga',
      site_url: 'https://golgeceviri.com/',
      default_scheme: 'light',
    })
    assert.equal(site.headers.get('location'), '/kurulum/yonetici')
    assert.equal(settings.get('site_name'), 'Gölge Çeviri')
    assert.equal(settings.get('site_url'), 'https://golgeceviri.com')
    assert.equal(settings.get(lookKey('default_scheme')), 'light')

    const mismatch = await owner.post('/kurulum/yonetici', {
      username: 'kurulum_yonetici',
      email: 'kurulum@example.com',
      password: 'guclu-parola-1',
      password_confirmation: 'baska-parola-2',
    })
    assert.notEqual(mismatch.headers.get('location'), '/kurulum/icerik')
    assert.isNull(await User.findBy('username', 'kurulum_yonetici'))

    const created = await owner.post('/kurulum/yonetici', {
      username: 'Kurulum_Yonetici',
      email: 'Kurulum@Example.com',
      password: 'guclu-parola-1',
      password_confirmation: 'guclu-parola-1',
    })
    assert.equal(created.headers.get('location'), '/kurulum/icerik')
    const admin = await User.findByOrFail('username', 'kurulum_yonetici')
    assert.equal(admin.role, 'admin')
    assert.equal(admin.email, 'kurulum@example.com')
    assert.isNotNull(admin.emailVerifiedAt)
    // A second admin cannot be made through the wizard.
    const again = await owner.post('/kurulum/yonetici', {
      username: 'ikinci_yonetici',
      email: 'ikinci@example.com',
      password: 'guclu-parola-1',
      password_confirmation: 'guclu-parola-1',
    })
    assert.equal(again.headers.get('location'), '/kurulum/icerik')
    assert.isNull(await User.findBy('username', 'ikinci_yonetici'))

    const content = await owner.post('/kurulum/icerik', { basics: 'on' })
    assert.equal(content.headers.get('location'), '/kurulum/bitir')
    for (const name of installConfig.contentTypes)
      assert.isNotNull(await ContentType.findBy('name', name), name)
    const anime = await ContentType.findByOrFail('slug', 'anime')
    assert.equal(anime.format, 'video')
    const novel = await ContentType.findByOrFail('slug', 'novel')
    assert.equal(novel.format, 'text')
    assert.isNotNull(await Genre.findBy('slug', 'aksiyon'))
    // Running it again adds nothing twice.
    const before = await db.from('genres').count('* as total').first()
    await owner.post('/kurulum/icerik', { basics: 'on' })
    const after = await db.from('genres').count('* as total').first()
    assert.equal(Number(after.total), Number(before.total))

    const status = await owner.request('/kurulum/icerik/durum', {
      headers: { accept: 'application/json' },
    })
    assert.deepInclude(await status.json(), { state: 'idle' })

    assert.include(await textOf(owner.request('/kurulum/bitir')), 'Kurulumu tamamla')
    const done = await owner.post('/kurulum/bitir')
    assert.equal(done.headers.get('location'), '/admin')
    assert.isTrue(await install.isInstalled())
    assert.isNotEmpty(settings.get(INSTALLED_KEY))

    // The new administrator is signed in, and the wizard is gone.
    const panel = await owner.request('/admin')
    assert.equal(panel.status, 200)
    const closed = await owner.request('/kurulum')
    assert.equal(closed.headers.get('location'), '/')
    const home = await client().request('/')
    assert.equal(home.status, 200)
  })

  test('a site that already has an administrator counts as installed', async ({ assert }) => {
    // No administrator yet (others are demoted for this file): still the wizard.
    await db.from('users').where('username', 'kurulum_yonetici').delete()
    assert.isFalse(await install.isInstalled())
    await User.create({
      username: 'kurulum_yonetici',
      email: 'kurulum@example.com',
      fullName: 'Kurulum',
      password: 'guclu-parola-1',
      role: 'admin',
    })
    // An administrator the wizard did not create: an existing site, installed on the spot.
    assert.isTrue(await install.isInstalled())
    assert.isNotEmpty(settings.get(INSTALLED_KEY))
    const home = await client().request('/')
    assert.equal(home.status, 200)
  })
})
