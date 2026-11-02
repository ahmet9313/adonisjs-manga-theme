import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Page from '#models/page'
import settings from '#services/settings_service'
import siteContent, { DISCLAIMER_KEY, socialKey } from '#services/site_content_service'
import { flagKey } from '#services/theme_service'
import { clearAttempts } from '#services/throttle'
import site from '#config/site'

const base = 'http://127.0.0.1:3334'
const password = 'content-pages-123'
const statusOf = (response: Promise<Response>) => response.then((result) => result.status)

/** Cookie-aware client with form logins and CSRF form posts. */
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
  const page = (path: string) => request(path).then((response) => response.text())
  const token = async (path = '/giris') =>
    page(path).then((html) => html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || '')
  const post = async (path: string, fields: Record<string, string>, from = '/giris') =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await token(from), ...fields }),
    })
  const login = (identifier: string) => post('/giris', { login: identifier, password })
  return { request, page, post, login, cookies }
}

const users = [
  { username: 'cp_admin', role: 'admin' },
  { username: 'cp_editor', role: 'editor' },
  { username: 'cp_member', role: 'member' },
] as const

test.group('Static pages, announcements, footer and cookie notice', (group) => {
  group.setup(async () => {
    for (const user of users)
      await User.create({
        username: user.username,
        email: `${user.username}@example.com`,
        fullName: user.username,
        password,
        role: user.role,
      })
  })
  group.each.setup(() => clearAttempts())
  group.teardown(async () => {
    // Later test files share the database: leave no announcements or extra pages behind.
    await db.from('posts').delete()
    await db.from('pages').whereLike('slug', 'cp-%').delete()
    siteContent.forget()
    await settings.save({
      [DISCLAIMER_KEY]: '',
      ...Object.fromEntries(site.socialNetworks.map((network) => [socialKey(network.key), ''])),
      [flagKey('home_announcements')]: '',
      [flagKey('footer_disclaimer')]: '',
      [flagKey('footer_pages')]: '',
      [flagKey('cookie_notice')]: '',
      [flagKey('nav_discord')]: '',
    })
  })

  test('starter pages render as escaped Markdown and fill the footer', async ({ assert }) => {
    const slugs = await Page.query()
      .orderBy('sort')
      .then((pages) => pages.map((page) => page.slug))
    assert.includeMembers(slugs, [
      'hakkimizda',
      'sss',
      'telif-hakki',
      'gizlilik-politikasi',
      'kullanim-kosullari',
      'yorum-kurallari',
      'iletisim',
    ])

    const guest = client()
    const response = await guest.request('/sayfa/sss')
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.include(html, '<h1 class="page-head__title"')
    assert.include(html, 'Sıkça Sorulan Sorular')
    assert.include(html, '<h4>Yeni bölüm ne zaman gelir?</h4>')
    assert.include(html, '<strong>Şablon metin:</strong>')
    assert.include(html, '<a href="/sayfa/iletisim">İletişim</a>')

    // Footer "Bilgi" column, the default disclaimer and announcements link on every page.
    const home = await guest.page('/')
    assert.include(home, 'id="footer-info"')
    for (const slug of slugs) assert.include(home, `href="/sayfa/${slug}"`)
    assert.include(home, 'href="/duyurular" class="footer-link"')
    assert.include(home, site.disclaimer)

    assert.equal(await statusOf(guest.request('/sayfa/olmayan-sayfa')), 404)
  })

  test('administrators manage pages; drafts are 404 for readers; editors cannot', async ({
    assert,
  }) => {
    const admin = client()
    await admin.login('cp_admin')
    assert.equal(await statusOf(admin.request('/admin/sayfalar')), 200)

    const created = await admin.post(
      '/admin/sayfalar/ekle',
      {
        title: 'CP Ekip Alımı',
        slug: 'cp-ekip',
        body: '# Başlık\n\n<script>alert(1)</script> [kötü](javascript:alert(1)) [iyi](https://ornek.com)',
        sort: '5',
        published: 'on',
        show_in_footer: 'on',
      },
      '/admin/sayfalar/ekle'
    )
    assert.equal(created.headers.get('location'), '/admin/sayfalar')
    const page = await Page.findByOrFail('slug', 'cp-ekip')
    assert.isTrue(page.published)

    const guest = client()
    const html = await guest.page('/sayfa/cp-ekip')
    assert.include(html, '&lt;script&gt;alert(1)&lt;/script&gt;')
    assert.notInclude(html, '<script>alert(1)')
    assert.notInclude(html, 'href="javascript:')
    assert.include(html, 'href="https://ornek.com" rel="noopener noreferrer nofollow"')
    // The new page appears in the footer right away (cache dropped on save).
    assert.include(await guest.page('/'), 'href="/sayfa/cp-ekip"')

    // Same title again: the address gets a suffix; an empty slug on edit keeps the address.
    await admin.post(
      '/admin/sayfalar/ekle',
      { title: 'CP Ekip', body: 'ikinci', published: 'on' },
      '/admin/sayfalar/ekle'
    )
    await admin.post(
      '/admin/sayfalar/ekle',
      { title: 'CP Ekip', body: 'üçüncü', published: 'on' },
      '/admin/sayfalar/ekle'
    )
    assert.isNotNull(await Page.findBy('slug', 'cp-ekip-2'))

    // Unpublishing (and hiding from the footer): readers get 404, staff a preview with a notice.
    await admin.post(
      `/admin/sayfalar/${page.id}/duzenle`,
      { title: 'CP Ekip Alımı', slug: '', body: 'Taslak metin', sort: '5' },
      `/admin/sayfalar/${page.id}/duzenle`
    )
    await page.refresh()
    assert.equal(page.slug, 'cp-ekip')
    assert.isFalse(page.published)
    assert.isFalse(page.showInFooter)
    assert.equal(await statusOf(guest.request('/sayfa/cp-ekip')), 404)
    const member = client()
    await member.login('cp_member')
    assert.equal(await statusOf(member.request('/sayfa/cp-ekip')), 404)
    const preview = await admin.page('/sayfa/cp-ekip')
    assert.include(preview, 'Yayında olmayan sayfa')
    assert.notInclude(await guest.page('/'), 'href="/sayfa/cp-ekip"')

    // Validation: an empty body is refused.
    const bad = await admin.post(
      '/admin/sayfalar/ekle',
      { title: 'CP Boş', body: '   ' },
      '/admin/sayfalar/ekle'
    )
    assert.equal(bad.status, 302)
    assert.isNull(await Page.findBy('title', 'CP Boş'))

    // Editors: no pages section (menu item hidden, routes 403) but announcements are theirs.
    const editor = client()
    await editor.login('cp_editor')
    const editorHtml = await editor.page('/admin/duyurular')
    assert.include(editorHtml, 'href="/admin/duyurular"')
    assert.notInclude(editorHtml, 'href="/admin/sayfalar"')
    assert.equal(await statusOf(editor.request('/admin/sayfalar')), 403)
    assert.equal(
      await statusOf(editor.post(`/admin/sayfalar/${page.id}/sil`, {}, '/admin/duyurular')),
      403
    )
    assert.equal(await statusOf(member.request('/admin/duyurular')), 403)

    // Delete.
    await admin.post(`/admin/sayfalar/${page.id}/sil`, {}, '/admin/sayfalar')
    assert.isNull(await Page.find(page.id))
    // A deleted page's edit form returns to the list with a notice.
    const gone = await admin.request(`/admin/sayfalar/${page.id}/duzenle`)
    assert.equal(gone.headers.get('location'), '/admin/sayfalar')
  })

  test('announcements: drafts stay private, pinned first, home block and its switch', async ({
    assert,
  }) => {
    const editor = client()
    await editor.login('cp_editor')
    const add = (fields: Record<string, string>) =>
      editor.post('/admin/duyurular/ekle', fields, '/admin/duyurular/ekle')

    await add({ title: 'Eski duyuru', body: 'eski', published: 'on' })
    await add({ title: 'Sabit duyuru', body: '**Kurallar** burada', published: 'on', pinned: 'on' })
    await add({ title: 'Orta duyuru', body: 'orta', published: 'on' })
    await add({ title: 'Yeni duyuru', body: 'yeni <img src=x onerror=alert(1)>', published: 'on' })
    await add({ title: 'Gizli taslak', body: 'taslak' })
    // Spread the dates so the order is certain.
    const stamps: Record<string, string> = {
      'eski-duyuru': '2026-01-01 10:00:00',
      'sabit-duyuru': '2026-01-02 10:00:00',
      'orta-duyuru': '2026-01-03 10:00:00',
      'yeni-duyuru': '2026-01-04 10:00:00',
    }
    for (const [slug, stamp] of Object.entries(stamps))
      await db.from('posts').where('slug', slug).update({ published_at: stamp })
    const draft = await db.from('posts').where('slug', 'gizli-taslak').first()
    assert.isNull(draft.published_at)

    const guest = client()
    const list = await guest.page('/duyurular')
    const order = ['Sabit duyuru', 'Yeni duyuru', 'Orta duyuru', 'Eski duyuru'].map((title) =>
      list.indexOf(title)
    )
    assert.isTrue(order.every((position) => position > 0))
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order
    )
    assert.notInclude(list, 'Gizli taslak')
    assert.include(list, 'Sabit')
    // Excerpts are plain text, escaped by the view.
    assert.include(list, '&lt;img src=x onerror=alert(1)&gt;')

    const one = await guest.page('/duyuru/sabit-duyuru')
    assert.include(one, '<strong>Kurallar</strong> burada')
    assert.include(one, 'cp_editor')
    assert.equal(await statusOf(guest.request('/duyuru/gizli-taslak')), 404)
    assert.include(await editor.page('/duyuru/gizli-taslak'), 'Taslak duyuru')

    // Home block: three newest, pinned first, draft left out.
    const home = await guest.page('/')
    assert.include(home, 'id="home-posts-title"')
    const block = home.slice(
      home.indexOf('id="home-posts-title"'),
      home.indexOf('</ul>', home.indexOf('class="home-posts"'))
    )
    assert.include(block, 'Sabit duyuru')
    assert.include(block, 'Yeni duyuru')
    assert.include(block, 'Orta duyuru')
    assert.notInclude(block, 'Eski duyuru')
    assert.notInclude(block, 'Gizli taslak')
    assert.isBelow(block.indexOf('Sabit duyuru'), block.indexOf('Yeni duyuru'))

    await settings.save({ [flagKey('home_announcements')]: '0' })
    assert.notInclude(await guest.page('/'), 'id="home-posts-title"')
    await settings.save({ [flagKey('home_announcements')]: '' })

    // Unpublishing turns a post back into a draft.
    const row = await db.from('posts').where('slug', 'orta-duyuru').first()
    await editor.post(
      `/admin/duyurular/${row.id}/duzenle`,
      { title: 'Orta duyuru', body: 'orta' },
      `/admin/duyurular/${row.id}/duzenle`
    )
    const updated = await db.from('posts').where('id', row.id).first()
    assert.isNull(updated.published_at)
    assert.notInclude(await guest.page('/duyurular'), 'Orta duyuru')

    // Live preview endpoint: the same escaping renderer, staff only.
    const previewResponse = await editor.post(
      '/admin/icerik/onizleme',
      { body: '**a** <b>b</b>' },
      '/admin/duyurular/ekle'
    )
    assert.equal(previewResponse.status, 200)
    assert.deepEqual(await previewResponse.json(), {
      html: '<p><strong>a</strong> &lt;b&gt;b&lt;/b&gt;</p>',
    })
    const member = client()
    await member.login('cp_member')
    assert.equal(
      await statusOf(member.post('/admin/icerik/onizleme', { body: 'x' }, '/seriler')),
      403
    )
  })

  test('footer disclaimer, social links and the Discord button follow Tema → Genel', async ({
    assert,
  }) => {
    const admin = client()
    await admin.login('cp_admin')
    const form = await admin.page('/admin/tema/genel')
    assert.include(form, 'name="footer_disclaimer"')
    assert.include(form, 'name="social_discord"')

    const guest = client()
    assert.notInclude(await guest.page('/'), 'Discord sunucumuz')

    const saved = await admin.post(
      '/admin/tema/genel',
      {
        part: 'links',
        footer_disclaimer: 'Tüm haklar yayıncılara aittir; orijinali destekleyin.',
        social_discord: 'https://discord.gg/ornek',
        social_x: 'https://x.com/ornek',
      },
      '/admin/tema/genel'
    )
    assert.equal(saved.headers.get('location'), '/admin/tema/genel')
    // The identity form's values are untouched.
    assert.equal(settings.get('site_name'), site.name)

    let home = await guest.page('/')
    assert.include(home, 'Tüm haklar yayıncılara aittir; orijinali destekleyin.')
    assert.notInclude(home, site.disclaimer)
    assert.include(home, 'aria-label="Discord sunucumuz (yeni sekmede açılır)"')
    assert.include(home, 'href="https://discord.gg/ornek" class="mobile-link"')
    assert.include(home, 'href="https://x.com/ornek" class="footer-link"')

    // Only http(s) addresses are accepted.
    await admin.post(
      '/admin/tema/genel',
      { part: 'links', social_discord: 'javascript:alert(1)' },
      '/admin/tema/genel'
    )
    assert.equal(settings.get(socialKey('discord')), 'https://discord.gg/ornek')

    // Switches: the Discord button, the disclaimer and the footer pages column.
    await settings.save({
      [flagKey('nav_discord')]: '0',
      [flagKey('footer_disclaimer')]: '0',
      [flagKey('footer_pages')]: '0',
    })
    home = await guest.page('/')
    assert.notInclude(home, 'Discord sunucumuz')
    assert.notInclude(home, 'Tüm haklar yayıncılara aittir')
    assert.notInclude(home, 'id="footer-info"')
    // The footer still lists the Discord account among the social links.
    assert.include(home, 'href="https://discord.gg/ornek" class="footer-link"')
    await settings.save({
      [flagKey('nav_discord')]: '',
      [flagKey('footer_disclaimer')]: '',
      [flagKey('footer_pages')]: '',
    })

    // Emptying the disclaimer restores the default text.
    await admin.post(
      '/admin/tema/genel',
      { part: 'links', footer_disclaimer: '' },
      '/admin/tema/genel'
    )
    assert.include(await guest.page('/'), site.disclaimer)
  })

  test('the cookie notice shows until accepted and has a no-JavaScript fallback', async ({
    assert,
  }) => {
    const guest = client()
    const html = await guest.page('/seriler')
    assert.include(html, 'aria-label="Çerez bildirimi"')
    assert.include(html, 'Siteyi kullanarak çerez kullanımını kabul edersin.')
    assert.include(html, 'href="/sayfa/gizlilik-politikasi"')
    assert.include(html, 'action="/cerez-onayi"')

    const accepted = await guest.post('/cerez-onayi', { next: '/seriler?page=2' }, '/seriler')
    assert.equal(accepted.status, 302)
    assert.equal(accepted.headers.get('location'), '/seriler?page=2')
    assert.match(accepted.headers.getSetCookie().join(';'), /cookie_ok=1/)
    assert.notInclude(await guest.page('/seriler'), 'aria-label="Çerez bildirimi"')

    // The cookie written by the script hides it too; outside addresses are not followed.
    const scripted = client({ cookie_ok: '1' })
    assert.notInclude(await scripted.page('/'), 'aria-label="Çerez bildirimi"')
    const outside = await client().post('/cerez-onayi', { next: '//evil.example' }, '/giris')
    assert.equal(outside.headers.get('location'), '/')

    // Switched off under Göster / Gizle.
    await settings.save({ [flagKey('cookie_notice')]: '0' })
    assert.notInclude(await client().page('/'), 'aria-label="Çerez bildirimi"')
    await settings.save({ [flagKey('cookie_notice')]: '' })
  })
})
