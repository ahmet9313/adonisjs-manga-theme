import { test } from '@japa/runner'
import User from '#models/user'
import { clearAttempts } from '#services/throttle'
import settings from '#services/settings_service'
import { colorTokens, flags, looks } from '#config/theme'
import { colorKey, flagKey, lookKey, CUSTOM_CSS_KEY } from '#services/theme_service'
import site from '#config/site'

const base = 'http://127.0.0.1:3334'
const password = 'correct-horse-battery'

const statusOf = async (response: Promise<Response>) => {
  const result = await response
  return result.status
}
const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
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

test.group('Admin navigation, roles and theme settings', (group) => {
  group.each.setup(() => clearAttempts())
  group.teardown(async () => {
    const theme: Record<string, string> = { [CUSTOM_CSS_KEY]: '' }
    for (const token of colorTokens) theme[colorKey(token.key)] = ''
    for (const look of looks) theme[lookKey(look.key)] = ''
    for (const flag of flags) theme[flagKey(flag.key)] = ''
    await settings.save({
      ...theme,
      site_name: '',
      site_description: '',
      logo_url: '',
      announcement_enabled: '',
      announcement_text: '',
      announcement_url: '',
      role_editor_label: '',
      role_editor_color: '',
    })
  })

  test('the sidebar groups sections by role and the users group comes last', async ({ assert }) => {
    await User.create({
      username: 'navadmin',
      email: 'navadmin@example.com',
      fullName: 'Nav Admin',
      password,
      role: 'admin',
    })
    await User.create({
      username: 'naveditor',
      email: 'naveditor@example.com',
      fullName: 'Nav Editor',
      password,
      role: 'editor',
    })

    const admin = client()
    await admin.post('/giris', { login: 'navadmin', password })
    const html = await textOf(admin.request('/admin/seriler'))
    const heading = (page: string, label: string) => page.search(new RegExp(`${label}\\s*<svg`))
    const positions = ['Manga', 'Topluluk', 'Tema', 'Kullanıcılar'].map((label) =>
      heading(html, label)
    )
    assert.isTrue(positions.every((position) => position > 0))
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions
    )
    assert.include(html, 'href="/admin/roller"')
    assert.include(html, 'href="/admin/tema/renkler"')
    assert.match(html, /href="\/admin\/seriler" aria-current=page/)

    const editor = client()
    await editor.post('/giris', { login: 'naveditor', password })
    const editorHtml = await textOf(editor.request('/admin/seriler'))
    assert.isAbove(heading(editorHtml, 'Manga'), 0)
    for (const hidden of ['Tema', 'Topluluk', 'Kullanıcılar'])
      assert.equal(heading(editorHtml, hidden), -1)
    for (const hidden of ['/admin/roller', '/admin/tema/genel'])
      assert.notInclude(editorHtml, hidden)
    for (const path of ['/admin/roller', '/admin/tema/genel', '/admin/tema/renkler'])
      assert.equal(await statusOf(editor.request(path)), 403)
  })

  test('roles can be renamed and recoloured; input is validated', async ({ assert }) => {
    const admin = client()
    await admin.post('/giris', { login: 'navadmin', password })
    const page = await textOf(admin.request('/admin/roller?rol=editor'))
    assert.include(page, 'Rol rengi')
    assert.include(page, 'Kozmetik ve kart yönetimi')

    const bad = await admin.post(
      '/admin/roller/editor',
      { label: 'E', color: 'red' },
      '/admin/roller?rol=editor'
    )
    assert.equal(bad.status, 302)
    assert.equal(settings.role('editor').label, 'Editör')

    const ok = await admin.post(
      '/admin/roller/editor',
      { label: 'Moderatör', color: '#AA33FF' },
      '/admin/roller?rol=editor'
    )
    assert.equal(ok.headers.get('location'), '/admin/roller?rol=editor')
    assert.equal(settings.role('editor').label, 'Moderatör')
    assert.equal(settings.role('editor').color, '#aa33ff')

    const users = await textOf(admin.request('/admin/kullanicilar'))
    assert.include(users, 'Moderatör')
    assert.include(users, 'color:#aa33ff')
  })

  test('general settings, announcement and unsafe links', async ({ assert }) => {
    const admin = client()
    await admin.post('/giris', { login: 'navadmin', password })
    for (const section of ['genel', 'renkler', 'gorunum', 'goster', 'duyuru', 'gelismis'])
      assert.equal(await statusOf(admin.request(`/admin/tema/${section}`)), 200, section)

    await admin.post(
      '/admin/tema/genel',
      { site_name: 'ToonHub', site_description: 'Yeni açıklama', logo_url: '' },
      '/admin/tema/genel'
    )
    assert.equal(site.name, 'ToonHub')
    assert.include(await textOf(admin.request('/')), 'ToonHub')

    const unsafe = await admin.post(
      '/admin/tema/duyuru',
      {
        announcement_enabled: 'on',
        announcement_text: 'Bakım',
        announcement_url: 'javascript:alert(1)',
      },
      '/admin/tema/duyuru'
    )
    assert.equal(unsafe.status, 302)
    assert.isNull(settings.announcement())
    await admin.post(
      '/admin/tema/duyuru',
      {
        announcement_enabled: 'on',
        announcement_text: 'Yeni sezon başladı',
        announcement_url: '/seriler',
      },
      '/admin/tema/duyuru'
    )
    const bar = await textOf(admin.request('/'))
    assert.include(bar, 'Yeni sezon başladı')
    assert.include(bar, 'href="/seriler"')
    await admin.post(
      '/admin/tema/duyuru',
      { announcement_text: 'Yeni sezon başladı' },
      '/admin/tema/duyuru'
    )
    assert.notInclude(await textOf(admin.request('/')), 'Yeni sezon başladı')
    await admin.post(
      '/admin/tema/genel',
      { site_name: 'MangaHub', site_description: '', logo_url: '' },
      '/admin/tema/genel'
    )
  })

  test('colours, layout and custom CSS are validated, applied and reset', async ({ assert }) => {
    const admin = client()
    await admin.post('/giris', { login: 'navadmin', password })

    const stock = await textOf(admin.request('/'))
    assert.notInclude(stock, '--t-bg:')
    assert.notInclude(stock, 'data-accent')

    const bad = await admin.post('/admin/tema/renkler', { c_bg: 'kırmızı' }, '/admin/tema/renkler')
    assert.equal(bad.status, 302)
    assert.notInclude(await textOf(admin.request('/')), '--t-bg:')

    // Short hex is expanded, stock values are not stored, empty means stock.
    await admin.post(
      '/admin/tema/renkler',
      {
        c_bg: '#123',
        c_accent: '#8b5cf6',
        c_text: '#e5e7eb',
        c_header_bg: '#101820cc',
        l_scheme: 'light',
      },
      '/admin/tema/renkler'
    )
    const themed = await textOf(admin.request('/'))
    assert.include(themed, '--t-bg:#112233')
    assert.include(themed, '--t-accent:#8b5cf6')
    assert.include(themed, '--t-header-bg:#101820cc')
    assert.include(themed, 'color-scheme:light')
    assert.notInclude(themed, '--t-text:')
    assert.match(themed, /<html[^>]* data-accent/)
    assert.notMatch(themed, /<html[^>]* data-accent2/)
    // The admin panel follows the theme unless it opts out or safe mode is used.
    assert.include(await textOf(admin.request('/admin')), '--t-bg:#112233')
    assert.notInclude(await textOf(admin.request('/admin?guvenli=1')), '--t-bg:')

    await admin.post(
      '/admin/tema/gorunum',
      {
        l_container: '64rem',
        l_radius: '0',
        l_font: 'serif',
        l_bg_image: '/images/x.png',
        l_blur: '3',
      },
      '/admin/tema/gorunum'
    )
    const looked = await textOf(admin.request('/'))
    assert.include(looked, '--t-container:64rem')
    assert.include(looked, '--t-radius:0')
    assert.include(looked, '--t-img:url("/images/x.png")')
    assert.include(looked, '--t-font:ui-serif')
    const badLook = await admin.post(
      '/admin/tema/gorunum',
      { l_radius: '99', l_bg_image: 'javascript:1' },
      '/admin/tema/gorunum'
    )
    assert.equal(badLook.status, 302)
    assert.include(await textOf(admin.request('/')), '--t-radius:0')

    const css = await admin.post(
      '/admin/tema/gelismis',
      { custom_css: '.glass{border-radius:0}' },
      '/admin/tema/gelismis'
    )
    assert.equal(css.status, 302)
    assert.include(await textOf(admin.request('/')), '.glass{border-radius:0}')
    await admin.post(
      '/admin/tema/gelismis',
      { custom_css: '</style><script>alert(1)</script>' },
      '/admin/tema/gelismis'
    )
    assert.notInclude(await textOf(admin.request('/')), '<script>alert(1)')

    const exported = await textOf(admin.request('/admin/tema/disa-aktar'))
    assert.equal(JSON.parse(exported).colors.bg, '#112233')

    await admin.post('/admin/tema/sifirla', {}, '/admin/tema/gelismis')
    const reset = await textOf(admin.request('/'))
    for (const gone of ['--t-bg:', '--t-container:', 'data-accent', '.glass{border-radius:0}'])
      assert.notInclude(reset, gone)

    // Import restores a snapshot through the same validation.
    const imported = await admin.post(
      '/admin/tema/ice-aktar',
      { theme_json: exported },
      '/admin/tema/gelismis'
    )
    assert.equal(imported.status, 302)
    assert.include(await textOf(admin.request('/')), '--t-bg:#112233')
    await admin.post('/admin/tema/sifirla', {}, '/admin/tema/gelismis')
  })

  test('switches remove sections from the page', async ({ assert }) => {
    const admin = client()
    await admin.post('/giris', { login: 'navadmin', password })
    const everything = Object.fromEntries(flags.map((flag) => [`f_${flag.key}`, 'on']))

    const before = await textOf(admin.request('/'))
    for (const text of ['Seri Listesi', 'desktop-series-search', 'Son Güncellenenler', '<footer'])
      assert.include(before, text)

    await admin.post(
      '/admin/tema/goster',
      {
        ...everything,
        f_nav_series: '',
        f_search: '',
        f_home_updates: '',
        f_footer: '',
        f_header_sticky: '',
        f_bg_glow: '',
      } as Record<string, string>,
      '/admin/tema/goster'
    )
    const hidden = await textOf(admin.request('/'))
    for (const text of ['desktop-series-search', 'Son Güncellenenler', '<footer'])
      assert.notInclude(hidden, text)
    assert.notInclude(hidden, 'href="/seriler" class="text-gray-300')
    assert.include(hidden, 'href="/oneriler"')
    assert.include(hidden, '.site-header{position:static!important}')
    assert.include(hidden, '--t-glow-1:transparent')

    await admin.post('/admin/tema/goster', everything, '/admin/tema/goster')
    assert.include(await textOf(admin.request('/')), 'Son Güncellenenler')
  })

  test('non-admins cannot change the theme', async ({ assert }) => {
    const editor = client()
    await editor.post('/giris', { login: 'naveditor', password })
    const attempt = await editor.post('/admin/tema/renkler', { c_bg: '#000000' }, '/admin')
    assert.equal(attempt.status, 403)
    assert.equal(await statusOf(editor.request('/admin/tema/disa-aktar')), 403)
    assert.notInclude(await textOf(client().request('/')), '--t-bg:#000000')
  })
})
