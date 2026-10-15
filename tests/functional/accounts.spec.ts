import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import User from '#models/user'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'correct-horse-battery'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=',
  'base64'
)

const statusOf = async (response: Promise<Response>) => {
  const result = await response
  return result.status
}
const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}
const locationOf = async (response: Promise<Response>) => {
  const result = await response
  return result.headers.get('location')
}

/** Minimal cookie-aware client with CSRF handling. */
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
  const token = async (path: string) => {
    const html = await textOf(request(path))
    return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  }
  const post = async (path: string, fields: Record<string, string>, from = path) =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  return { request, token, post }
}

test.group('Accounts, roles and profile images', (group) => {
  group.each.setup(() => clearAttempts())

  test('registration validates input, creates a member and signs in', async ({ assert }) => {
    const web = client()
    const bad = await web.post('/kayit', {
      username: 'a!',
      email: 'nope',
      password: 'short',
      password_confirmation: 'other',
    })
    assert.equal(bad.status, 302)
    assert.equal(bad.headers.get('location'), '/kayit?next=%2F')
    assert.isNull(await User.findBy('email', 'nope'))

    const ok = await web.post('/kayit', {
      username: 'Okuyucu_1',
      email: 'Okuyucu@Example.com',
      password,
      password_confirmation: password,
    })
    assert.equal(ok.headers.get('location'), '/')
    const user = await User.findByOrFail('username', 'okuyucu_1')
    assert.equal(user.email, 'okuyucu@example.com')
    assert.equal(user.fullName, 'Okuyucu_1')
    assert.equal(user.role, 'member')
    assert.notEqual(user.password, password)

    const home = await textOf(web.request('/'))
    assert.include(home, 'account-menu')
    assert.include(home, '/uye/okuyucu_1')
    assert.notInclude(home, 'Yönetim Paneli')

    const duplicate = await client().post('/kayit', {
      username: 'OKUYUCU_1',
      email: 'baska@example.com',
      password,
      password_confirmation: password,
    })
    assert.equal(duplicate.headers.get('location'), '/kayit?next=%2F')
    assert.isNull(await User.findBy('email', 'baska@example.com'))
  })

  test('members cannot reach administration; staff and role changes work', async ({ assert }) => {
    await User.create({
      username: 'editor1',
      email: 'editor@example.com',
      fullName: 'Editor',
      password,
      role: 'editor',
    })
    await User.create({
      username: 'boss',
      email: 'boss@example.com',
      fullName: 'Boss',
      password,
      role: 'admin',
    })
    const member = await User.findByOrFail('username', 'okuyucu_1')

    const asMember = client()
    await asMember.post('/giris', { login: 'okuyucu_1', password })
    assert.equal(await statusOf(asMember.request('/admin')), 403)
    assert.equal(await statusOf(asMember.request('/admin/kullanicilar')), 403)

    const asEditor = client()
    const editorLogin = await asEditor.post('/giris', {
      login: 'editor@example.com',
      password,
      next: '/admin',
    })
    assert.equal(editorLogin.headers.get('location'), '/admin')
    assert.equal(await statusOf(asEditor.request('/admin/seriler')), 200)
    assert.equal(await statusOf(asEditor.request('/admin/kullanicilar')), 403)
    // Cosmetics and cards (gifting included) are administrator-only.
    assert.equal(await statusOf(asEditor.request('/admin/kozmetikler')), 403)
    assert.equal(await statusOf(asEditor.request('/admin/kartlar')), 403)
    assert.notInclude(await textOf(asEditor.request('/admin/seriler')), 'href="/admin/kozmetikler"')

    const asAdmin = client()
    await asAdmin.post('/giris', { login: 'boss', password })
    assert.equal(await statusOf(asAdmin.request('/admin/kullanicilar')), 200)
    assert.equal(await statusOf(asAdmin.request('/admin/kozmetikler')), 200)
    assert.equal(await statusOf(asAdmin.request('/admin/kartlar')), 200)
    assert.equal(
      await statusOf(asAdmin.request('/admin/kullanicilar?search=okuyucu&role=member')),
      200
    )
    const edit = `/admin/kullanicilar/${member.id}/duzenle`
    assert.equal(await statusOf(asAdmin.request(edit)), 200)
    const promoted = await asAdmin.post(edit, { role: 'editor' })
    assert.equal(promoted.status, 302)
    await member.refresh()
    assert.equal(member.role, 'editor')
    assert.equal(await statusOf(asMember.request('/admin/seriler')), 200)

    // Administrators cannot change their own role or status.
    const boss = await User.findByOrFail('username', 'boss')
    const selfDemote = await asAdmin.request(`/admin/kullanicilar/${boss.id}/duzenle`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: new URLSearchParams({
        _csrf: await asAdmin.token(`/admin/kullanicilar/${member.id}/duzenle`),
        role: 'member',
      }),
    })
    assert.equal(selfDemote.status, 422)
    await boss.refresh()
    assert.equal(boss.role, 'admin')

    // Suspending closes the open session and blocks future logins.
    await asAdmin.post(edit, { role: 'member', banned: 'on' })
    await member.refresh()
    assert.isNotNull(member.bannedAt)
    assert.equal(await statusOf(asMember.request('/admin/seriler')), 302)
    const blocked = await client().post('/giris', { login: 'okuyucu_1', password })
    assert.equal(blocked.headers.get('location'), '/giris?next=%2F')
    assert.equal(await statusOf(client().request('/uye/okuyucu_1')), 404)
  })

  test('failed logins are rate limited and open redirects are rejected', async ({ assert }) => {
    const web = client()
    for (let i = 0; i < 8; i++)
      await web.post('/giris', { login: 'boss', password: 'wrong-password' }, '/giris')
    const locked = await web.post('/giris', { login: 'boss', password }, '/giris')
    assert.equal(locked.headers.get('location'), '/giris?next=%2F')
    assert.equal(await statusOf(web.request('/admin')), 302)
    clearAttempts()
    const redirected = await web.post(
      '/giris',
      { login: 'boss', password, next: '//evil.example' },
      '/giris'
    )
    assert.equal(redirected.headers.get('location'), '/')
  })

  test('profile settings, avatar upload, replacement and removal', async ({ assert }) => {
    const web = client()
    await web.post('/giris', { login: 'boss', password })
    for (const path of ['/ayarlar', '/uye/boss'])
      assert.equal(await statusOf(web.request(path)), 200, path)
    assert.equal(await statusOf(client().request('/ayarlar')), 302)

    const updated = await web.post(
      '/ayarlar/profil',
      { full_name: 'Patron <b>', bio: 'Merhaba' },
      '/ayarlar'
    )
    assert.equal(updated.status, 302)
    const profile = await textOf(web.request('/uye/boss'))
    assert.include(profile, 'Patron &lt;b&gt;')
    assert.notInclude(profile, 'Patron <b>')

    const wrong = await web.post(
      '/ayarlar/parola',
      {
        current_password: 'nope',
        password: 'new-password-123',
        password_confirmation: 'new-password-123',
      },
      '/ayarlar'
    )
    assert.equal(wrong.status, 302)
    const boss = await User.findByOrFail('username', 'boss')
    assert.notEqual(boss.password, 'new-password-123')
    assert.equal(
      await locationOf(client().post('/giris', { login: 'boss', password: 'new-password-123' })),
      '/giris?next=%2F'
    )

    const upload = async (kind: string, bytes: Buffer, name: string, type: string) => {
      const form = new FormData()
      form.set('_csrf', await web.token('/ayarlar'))
      form.append(kind, new Blob([new Uint8Array(bytes)], { type }), name)
      return web.request(`/ayarlar/${kind}`, {
        method: 'POST',
        body: form,
        headers: { accept: 'application/json' },
      })
    }
    const rejected = await upload(
      'avatar',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'x.svg',
      'image/svg+xml'
    )
    assert.equal(rejected.status, 422)
    const fake = await upload('avatar', Buffer.from('not an image'), 'x.png', 'image/png')
    assert.equal(fake.status, 422)
    const reloaded = await User.findByOrFail('username', 'boss')
    assert.isNull(reloaded.avatar)

    const first = await upload('avatar', png, 'avatar.png', 'image/png')
    assert.equal(first.status, 200)
    const { avatar } = (await first.json()) as { avatar: string }
    assert.match(avatar, /^\/content\/avatars\/[0-9a-f-]+\.png$/)
    assert.deepEqual(await readFile(app.tmpPath('test-uploads' + avatar)), png)
    assert.equal(await statusOf(fetch(base + avatar)), 200)

    const second = await upload('avatar', png, 'avatar.png', 'image/png')
    const next = ((await second.json()) as { avatar: string }).avatar
    assert.notEqual(next, avatar)
    assert.equal(await statusOf(fetch(base + avatar)), 404)
    assert.equal(await statusOf(upload('banner', png, 'banner.png', 'image/png')), 200)
    assert.include(await textOf(web.request('/')), next)

    const removal = await web.request('/ayarlar/avatar/sil', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'x-csrf-token': await web.token('/ayarlar') },
    })
    assert.equal(removal.status, 200)
    const afterRemoval = await User.findByOrFail('username', 'boss')
    assert.isNull(afterRemoval.avatar)
    assert.equal(await statusOf(fetch(base + next)), 404)
  })

  test('legacy admin sign-in URL redirects and logout works', async ({ assert }) => {
    const web = client()
    const legacy = await web.request('/admin/giris')
    assert.equal(legacy.headers.get('location'), '/giris?next=/admin')
    await web.post('/giris', { login: 'editor1', password })
    assert.equal(await statusOf(web.request('/admin')), 200)
    await web.post('/cikis', {}, '/')
    assert.equal(await statusOf(web.request('/admin')), 302)
    assert.equal(await statusOf(web.request('/does-not-exist')), 404)
  })
})
