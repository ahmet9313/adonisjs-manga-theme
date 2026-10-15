import { test } from '@japa/runner'
import edge from 'edge.js'

/** Minimal request and flash stubs: components read them from the shared state. */
function state(options: { flash?: Record<string, unknown>; query?: Record<string, unknown> } = {}) {
  const flash = options.flash ?? {}
  return {
    flashMessages: {
      has: (key: string) => key in flash,
      get: (key: string) => flash[key],
    },
    request: {
      url: () => '/seriler',
      qs: () => options.query ?? {},
      plainCookie: () => null,
    },
  }
}

/** Components see shared state (like `request` and `flashMessages` in the app), not locals. */
const render = (template: string, options?: Parameters<typeof state>[0]) =>
  edge.share(state(options)).renderRaw(template)

test.group('Design system components', () => {
  test('buttons render links, icon-only labels, loading state and extra attributes', async ({
    assert,
  }) => {
    const link = await render(
      "@component('components/ui/button', { variant: 'primary', href: '/seriler', iconRight: 'arrow-right' })\nSerilere git\n@end"
    )
    assert.match(link, /<a href="\/seriler" class="btn btn--primary btn--md"/)
    assert.include(link, 'Serilere git')

    const icon = await render(
      "@!component('components/ui/button', { variant: 'ghost', icon: 'x', label: 'Kapat', '@click': 'open = false' })"
    )
    assert.match(icon, /<button type="button" class="btn btn--ghost btn--md btn--icon"/)
    assert.include(icon, 'aria-label="Kapat"')
    assert.include(icon, '@click="open = false"')

    const busy = await render(
      "@component('components/ui/button', { type: 'submit', loading: true })\nKaydet\n@end"
    )
    assert.include(busy, 'type="submit"')
    assert.include(busy, 'aria-busy="true" disabled')
  })

  test('forwarded attributes are escaped and unsafe names are dropped', async ({ assert }) => {
    const template = String.raw`@!component('components/ui/button', { 'data-note': '"><script>x()</script>', onclick: 'x()', 'x"y': 'z', ':class': "open && 'on'" })`
    const html = await render(template)
    assert.include(html, 'data-note="&quot;&gt;&lt;script&gt;x()&lt;/script&gt;"')
    assert.notInclude(html, '<script>')
    assert.include(html, `:class="open &amp;&amp; 'on'"`)
    assert.notInclude(html, 'x"y')
    assert.notInclude(html, 'onclick')
  })

  test('fields show labels, previous input and validation errors', async ({ assert }) => {
    const plain = await render(
      "@!component('components/ui/field', { name: 'title', label: 'Başlık', required: true, value: 'Naruto', hint: 'En az 2 harf' })"
    )
    assert.include(plain, '<label for="f-title" class="field__label">')
    assert.include(plain, 'id="f-title" name="title"')
    assert.include(plain, 'value="Naruto"')
    assert.include(plain, 'aria-describedby="f-title-hint"')
    assert.include(plain, 'class="field__req"')

    const failed = await render(
      "@!component('components/ui/field', { name: 'title', label: 'Başlık', value: 'Naruto' })",
      { flash: { 'title': 'Yeni ad', 'inputErrorsBag.title': ['Başlık zaten kullanılıyor'] } }
    )
    assert.include(failed, 'value="Yeni ad"')
    assert.include(failed, 'aria-invalid="true"')
    assert.include(failed, 'aria-describedby="f-title-error"')
    assert.include(
      failed,
      '<p id="f-title-error" class="field__error" role="alert">Başlık zaten kullanılıyor</p>'
    )

    const select = await render(
      "@!component('components/ui/field', { name: 'status', label: 'Durum', type: 'select', value: 'Tamamlandı', options: [{ value: 'Devam Ediyor', label: 'Devam Ediyor' }, { value: 'Tamamlandı', label: 'Tamamlandı' }] })"
    )
    assert.include(select, '<option value="Tamamlandı" selected>')

    const toggle = await render(
      "@!component('components/ui/field', { name: 'featured', label: 'Öne çıkar', type: 'toggle', value: true })"
    )
    assert.include(toggle, 'role="switch"')
    assert.include(toggle, 'checked')
  })

  test('badges map values to tones and keep the text as the direct child', async ({ assert }) => {
    const type = await render(
      "@!component('components/ui/badge', { kind: 'type', value: 'manhwa', solid: true })"
    )
    assert.include(type, 'data-tone="manhwa"')
    assert.include(type, '>Manhwa</span>')
    assert.include(
      await render("@!component('components/ui/badge', { kind: 'status', value: 'Tamamlandı' })"),
      'data-tone="completed"'
    )
    assert.include(
      await render("@!component('components/ui/badge', { kind: 'age', value: '18+' })"),
      'data-tone="age18"'
    )
    assert.include(
      await render("@!component('components/ui/badge', { kind: 'info', text: 'Yanıt' })"),
      '>Yanıt</span>'
    )
  })

  test('modals, menus and tabs carry their ARIA roles', async ({ assert }) => {
    const modal = await render(
      "<div x-data=\"{ open: false }\">\n@component('components/ui/modal', { id: 'demo', title: 'Başlık' })\nİçerik\n@slot('footer')\nAlt\n@end\n@end\n</div>"
    )
    assert.include(modal, '<template x-teleport="body">')
    assert.include(modal, 'role="dialog" aria-modal="true" aria-labelledby="demo-title"')
    assert.include(modal, 'x-trap.inert.noscroll="open"')
    assert.include(modal, '<h2 id="demo-title" class="modal__title"')
    assert.include(modal, 'aria-label="Kapat"')
    assert.notInclude(modal, '<footer')

    const menu = await render(
      "@component('components/ui/dropdown', { id: 'sort-menu', label: 'Sırala' })\n<a href=\"#\" class=\"menu__item\">A</a>\n@end"
    )
    assert.include(menu, 'aria-controls="sort-menu"')
    assert.include(menu, 'aria-expanded="false"')
    assert.include(menu, 'id="sort-menu"')

    const tabs = await render(
      "@component('components/ui/tabs', { tabs: [{ key: 'a', label: 'Bir' }, { key: 'b', label: 'İki', count: 3 }], active: 'a', label: 'Örnek', id: 't' })\n@slot('a')\nBirinci\n@end\n@slot('b')\nİkinci\n@end\n@end"
    )
    assert.include(tabs, 'role="tablist" aria-label="Örnek"')
    assert.include(tabs, 'id="t-tab-a" data-tab="a" aria-controls="t-panel-a"')
    assert.include(tabs, 'aria-selected="true" tabindex="0"')
    assert.match(tabs, /id="t-panel-b"[^>]*\s+hidden\s/)
    // Every panel is rendered on the server.
    assert.include(tabs, 'Birinci')
    assert.include(tabs, 'İkinci')

    const links = await render(
      "@!component('components/ui/tabs', { mode: 'links', tabs: [{ key: 'yeni', label: 'Yeni', href: '/oneriler' }, { key: 'populer', label: 'Popüler', href: '/oneriler?sekme=populer' }], active: 'populer', label: 'Öneri türü' })"
    )
    assert.include(links, 'href="/oneriler?sekme=populer" class="tab" aria-current=page')
  })

  test('pagination keeps the query string and marks the current page', async ({ assert }) => {
    const html = await render("@!component('components/ui/pagination', { current: 2, total: 9 })", {
      query: { genre: 'Aksiyon', page: '2' },
    })
    assert.include(html, 'aria-label="Sayfalama"')
    assert.include(html, 'href="/seriler?genre=Aksiyon" class="pagination__item" rel="prev"')
    assert.include(
      html,
      'href="/seriler?genre=Aksiyon&amp;page=2" class="pagination__item" aria-current="page"'
    )
    assert.include(
      html,
      'href="/seriler?genre=Aksiyon&amp;page=3" class="pagination__item" rel="next"'
    )
    assert.include(html, 'pagination__gap')
    const single = await render("@!component('components/ui/pagination', { current: 1, total: 1 })")
    assert.equal(single.trim(), '')
  })

  test('series cards link the cover and the title to the series', async ({ assert }) => {
    const series = {
      type: 'manga',
      slug: 'naruto',
      title: 'Naruto',
      coverImage: '/content/naruto/cover.jpg',
      status: 'Tamamlandı',
      ageRating: '13+',
      ratingAverage: 8.46,
      ratingCount: 12,
      lastChapter: 700,
    }
    const card = await edge.renderRaw(
      "@!component('components/series/card', { series, priority: true })",
      {
        ...state(),
        series,
      }
    )
    assert.isTrue(card.indexOf('href="/series/manga/naruto"') < card.indexOf('Naruto</a>'))
    assert.include(card, 'loading="eager" fetchpriority="high"')
    assert.include(card, 'data-fallback="/images/no-cover.svg"')
    assert.include(card, '★ 8.5')
    assert.include(card, 'Bölüm 700')
    assert.include(card, 'data-tone="manga"')
    assert.include(card, 'data-tone="age13"')
    assert.notInclude(card, '@!component')
  })

  test('page headers, empty states, alerts and progress bars', async ({ assert }) => {
    const header = await render(
      "@component('components/ui/page_header', { title: 'Seriler', description: '53 seri' })\n@slot('actions')\n<a href=\"/x\">Ekle</a>\n@end\n@end"
    )
    assert.include(header, '<h1 class="page-head__title"')
    assert.include(header, 'page-head__actions')

    const empty = await render(
      "@component('components/ui/empty_state', { title: 'Sonuç yok', description: 'Filtreleri değiştirin.' })\n<a href=\"/seriler\">Sıfırla</a>\n@end"
    )
    assert.include(empty, 'empty__title')
    assert.include(empty, 'empty__actions')

    const alert = await render(
      "@component('components/ui/alert', { tone: 'danger', title: 'Hata' })\nMetin\n@end"
    )
    assert.include(alert, 'role="alert"')
    assert.include(alert, 'data-tone="danger"')

    const progress = await render(
      "@!component('components/ui/progress', { value: 30, max: 120, label: 'Seviye ilerlemesi' })"
    )
    assert.include(progress, 'role="progressbar" aria-label="Seviye ilerlemesi"')
    assert.include(progress, 'aria-valuenow="30"')
    assert.include(progress, 'width: 25%')
  })
})
