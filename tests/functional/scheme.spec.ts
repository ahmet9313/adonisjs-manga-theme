import { test } from '@japa/runner'
import User from '#models/user'
import { clearAttempts } from '#services/throttle'
import settings from '#services/settings_service'
import { colorTokens, flags, looks } from '#config/theme'
import { colorKey, flagKey, lightColorKey, lookKey, CUSTOM_CSS_KEY } from '#services/theme_service'

const base = 'http://127.0.0.1:3334'
const password = 'correct-horse-battery'
const stock = (key: string, light = false) => {
  const token = colorTokens.find((item) => item.key === key)!
  return light ? token.light : token.default
}

/** Minimal cookie-aware client with CSRF handling (same as theme.spec.ts). */
function client(initial: Record<string, string> = {}) {
  const cookies = new Map<string, string>(Object.entries(initial))
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
  const text = async (path: string) => {
    const response = await request(path)
    return response.text()
  }
  const token = async (path: string) => {
    const html = await text(path)
    return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  }
  const post = async (path: string, fields: Record<string, string>, from = path) =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  return { request, text, post, cookies }
}

const htmlTag = (html: string) => html.match(/<html[^>]*>/)?.[0] ?? ''

async function admin() {
  const visitor = client()
  await visitor.post('/giris', { login: 'schemeadmin', password })
  return visitor
}

test.group('Colour schemes', (group) => {
  group.each.setup(() => clearAttempts())
  group.setup(async () => {
    await User.create({
      username: 'schemeadmin',
      email: 'schemeadmin@example.com',
      fullName: 'Scheme Admin',
      password,
      role: 'admin',
    })
  })
  group.teardown(async () => {
    const entries: Record<string, string> = { [CUSTOM_CSS_KEY]: '' }
    for (const token of colorTokens) {
      entries[colorKey(token.key)] = ''
      entries[lightColorKey(token.key)] = ''
    }
    for (const look of looks) entries[lookKey(look.key)] = ''
    for (const flag of flags) entries[flagKey(flag.key)] = ''
    await settings.save(entries)
  })

  test('the scheme comes from the theme cookie, else the default', async ({ assert }) => {
    const plain = await client().text('/')
    assert.include(htmlTag(plain), 'data-theme="dark"')
    assert.include(plain, `<meta name="theme-color" content="${stock('header_bg')}">`)
    assert.include(plain, '<link rel="icon" href="/favicon.svg"')

    const light = await client({ theme: 'light' }).text('/')
    assert.include(htmlTag(light), 'data-theme="light"')
    assert.include(light, `<meta name="theme-color" content="${stock('header_bg', true)}">`)

    const system = await client({ theme: 'system' }).text('/')
    assert.include(htmlTag(system), 'data-theme="system"')
    assert.include(system, 'media="(prefers-color-scheme: dark)"')
    assert.include(system, 'media="(prefers-color-scheme: light)"')

    const bogus = await client({ theme: 'hacker"><script>' }).text('/')
    assert.include(htmlTag(bogus), 'data-theme="dark"')
    assert.notInclude(bogus, '<script>"')

    // Error pages follow the cookie too (no session needed).
    const missing = await client({ theme: 'light' }).request('/series/manga/yok-boyle-seri')
    assert.equal(missing.status, 404)
    const missingHtml = await missing.text()
    assert.include(htmlTag(missingHtml), 'data-theme="light"')
    assert.include(missingHtml, 'Seri bulunamadı')
  })

  test('the default scheme and the visitor switch are set under Admin → Tema', async ({
    assert,
  }) => {
    const owner = await admin()
    await owner.post('/admin/tema/renkler', { l_default_scheme: 'system' }, '/admin/tema/renkler')
    // The success flash is rendered on the server as a notification (works without JavaScript).
    const saved = await owner.text('/admin/tema/renkler')
    assert.match(saved, /data-server-toast role="status">[\s\S]*Tema ayarları kaydedildi/)
    assert.include(htmlTag(await client().text('/')), 'data-theme="system"')
    assert.include(htmlTag(await client({ theme: 'dark' }).text('/')), 'data-theme="dark"')

    const everything = Object.fromEntries(flags.map((flag) => [`f_${flag.key}`, 'on']))
    await owner.post(
      '/admin/tema/goster',
      { ...everything, f_scheme_switch: '' } as Record<string, string>,
      '/admin/tema/goster'
    )
    // With the switch off, every visitor gets the default scheme.
    assert.include(htmlTag(await client({ theme: 'dark' }).text('/')), 'data-theme="system"')
    await owner.post('/admin/tema/goster', everything, '/admin/tema/goster')
    await owner.post('/admin/tema/renkler', { l_default_scheme: 'dark' }, '/admin/tema/renkler')
    assert.include(htmlTag(await client().text('/')), 'data-theme="dark"')
  })

  test('light colours are stored apart from dark ones', async ({ assert }) => {
    const owner = await admin()
    const bad = await owner.post('/admin/tema/renkler', { cl_bg: 'mavi' }, '/admin/tema/renkler')
    assert.equal(bad.status, 302)
    assert.equal(settings.get(lightColorKey('bg')), '')

    await owner.post(
      '/admin/tema/renkler',
      { c_bg: '#101010', cl_bg: '#FAFAF0', cl_text: stock('text', true) },
      '/admin/tema/renkler'
    )
    assert.equal(settings.get(colorKey('bg')), '#101010')
    assert.equal(settings.get(lightColorKey('bg')), '#fafaf0')
    // A value equal to the stock one of that scheme is not stored.
    assert.equal(settings.get(lightColorKey('text')), '')

    const html = await client().text('/')
    assert.match(html, /:root\{[^}]*--t-bg:#101010/)
    assert.include(html, ':root[data-theme="light"]{--t-bg:#fafaf0}')
    assert.include(
      html,
      '@media (prefers-color-scheme: light){:root[data-theme="system"]{--t-bg:#fafaf0}}'
    )

    // The editor gets both sets.
    const editor = await owner.text('/admin/tema/renkler')
    assert.include(editor, 'name="c_bg" value="#101010"')
    assert.include(editor, 'name="cl_bg" value="#fafaf0"')

    // Export keeps `colors` (dark) flat and adds `lightColors`.
    const exported = JSON.parse(await owner.text('/admin/tema/disa-aktar'))
    assert.equal(exported.colors.bg, '#101010')
    assert.equal(exported.lightColors.bg, '#fafaf0')

    await owner.post('/admin/tema/sifirla', {}, '/admin/tema/gelismis')
    assert.equal(settings.get(colorKey('bg')), '')
    assert.equal(settings.get(lightColorKey('bg')), '')
    assert.notInclude(await client().text('/'), '--t-bg:')

    // Import restores both schemes; an older export without `lightColors` still works.
    await owner.post(
      '/admin/tema/ice-aktar',
      { theme_json: JSON.stringify(exported) },
      '/admin/tema/gelismis'
    )
    assert.equal(settings.get(lightColorKey('bg')), '#fafaf0')
    const legacy = { colors: { bg: '#202020' }, looks: {}, flags: {}, css: '' }
    await owner.post(
      '/admin/tema/ice-aktar',
      { theme_json: JSON.stringify(legacy) },
      '/admin/tema/gelismis'
    )
    assert.equal(settings.get(colorKey('bg')), '#202020')
    assert.equal(settings.get(lightColorKey('bg')), '')
    await owner.post('/admin/tema/sifirla', {}, '/admin/tema/gelismis')
  })

  test('safe mode shows the stock dark panel', async ({ assert }) => {
    const owner = await admin()
    await owner.post('/admin/tema/renkler', { c_bg: '#330000' }, '/admin/tema/renkler')
    const themed = await owner.text('/admin')
    assert.include(themed, '--t-bg:#330000')
    const safe = await client({ ...Object.fromEntries(owner.cookies), theme: 'light' }).text(
      '/admin?guvenli=1'
    )
    assert.include(htmlTag(safe), 'data-theme="dark"')
    assert.notInclude(safe, '--t-bg:')
    await owner.post('/admin/tema/sifirla', {}, '/admin/tema/gelismis')
  })
})
