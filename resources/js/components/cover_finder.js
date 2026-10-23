/**
 * `coverFinder`: "Otomatik doldur" in the admin series form (partials/admin/cover_finder.edge).
 *
 * 1. Search: `data-search` with what the form holds (title, alternative titles, content type,
 *    year); covers and banners ranked best first.
 * 2. "Bilgileri getir": `data-details` reads the chosen work (description, other titles, genres,
 *    authors/artists, year, status, age rating, banner) and shows what would change, one checkbox
 *    per field (fields the form already has are unticked).
 * 3. Apply: images come through `data-image` and go to the drop zones (`image-drop` event,
 *    tag_input.js); missing authors/artists (and the genres ticked) are added with `data-record`;
 *    the rest is written into the fields (`tags-add`, `multi-select-add` events).
 * Nothing is stored until the form is saved. Messages are Turkish and fixed here.
 */

const fieldOf = (form, selector) => form?.querySelector(selector)?.value?.trim() || ''

/** Sets a form control and lets the form know (unsaved changes, live previews). */
function setValue(element, value) {
  if (!element) return
  element.value = String(value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * The year to rank by. A new series' form starts with this year, which says nothing about the
 * work, so it only counts once changed.
 */
function yearOf(root, form) {
  const year = fieldOf(form, '#f-publication_year')
  const untouched = root?.dataset.new === 'true' && year === String(new Date().getFullYear())
  return untouched ? '' : year
}

const csrf = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''

function coverFinder() {
  let controller = null

  return {
    open: false,
    step: 'pick',
    query: '',
    tab: 'cover',
    loading: false,
    searched: false,
    error: '',
    results: { covers: [], banners: [], failures: [] },
    selectedId: '',
    applying: false,
    applyError: '',
    announcement: '',
    lastKey: '',
    root: null,
    details: null,
    detailsLoading: false,
    detailsError: '',
    fill: {},
    newGenres: [],

    init() {
      // Methods also run from the dialog, which is teleported to <body>.
      this.root = this.$el
    },

    get form() {
      return this.root?.closest('form')
    },

    get items() {
      return this.tab === 'banner' ? this.results.banners : this.results.covers
    },

    get selected() {
      return this.items.find((item) => item.id === this.selectedId) || null
    },

    /** "Manhwa · 2018" from the form, so the admin sees what the ranking uses. */
    get context() {
      const type = this.form?.querySelector('#f-content_type_id')
      const label = type?.value ? type.selectedOptions[0]?.textContent.trim() : ''
      const year = yearOf(this.root, this.form)
      const parts = [label, year].filter(Boolean)
      return parts.length ? `Sıralama formdaki bilgilere göre yapılır: ${parts.join(' · ')}` : ''
    },

    get sourcesNote() {
      const failed = this.results.failures.map((failure) => failure.label)
      return failed.length ? `${failed.join(', ')} şu an yanıt vermiyor.` : ''
    },

    show() {
      this.open = true
      const title = fieldOf(this.form, '#f-title')
      if (title && (!this.query || !this.searched)) this.query = title
      this.$nextTick(() => document.getElementById('cover-finder-q')?.focus())
      if (this.query.trim() && this.searchKey() !== this.lastKey) this.search()
    },

    close() {
      controller?.abort()
      this.open = false
      this.step = 'pick'
    },

    searchKey() {
      const form = this.form
      return JSON.stringify([
        this.query.trim(),
        fieldOf(form, 'input[data-name="alternative_titles"]'),
        fieldOf(form, '#f-content_type_id'),
        yearOf(this.root, form),
      ])
    },

    async search() {
      const query = this.query.trim()
      if (!query) return
      controller?.abort()
      controller = new AbortController()
      const form = this.form
      const params = new URLSearchParams({
        q: query,
        alt: fieldOf(form, 'input[data-name="alternative_titles"]'),
        type_id: fieldOf(form, '#f-content_type_id'),
        year: yearOf(this.root, form),
      })
      this.lastKey = this.searchKey()
      this.step = 'pick'
      this.loading = true
      this.error = ''
      this.selectedId = ''
      this.applyError = ''
      this.detailsError = ''
      this.announcement = 'Aranıyor…'
      try {
        const response = await fetch(`${this.root.dataset.search}?${params}`, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Arama yapılamadı; tekrar deneyin.')
        this.results = {
          covers: data.covers || [],
          banners: data.banners || [],
          failures: data.failures || [],
        }
        // Stay on the banner tab only when it has something and covers do not.
        if (!this.results.covers.length && this.results.banners.length) this.tab = 'banner'
        else if (this.tab === 'banner' && !this.results.banners.length) this.tab = 'cover'
        this.selectedId = this.items[0]?.id || ''
        this.searched = true
        this.announcement = `${this.results.covers.length} kapak, ${this.results.banners.length} banner bulundu.`
      } catch (error) {
        if (error.name === 'AbortError') return
        this.error =
          error instanceof TypeError ? 'Sunucuya ulaşılamadı; bağlantınızı denetleyin.' : error.message
        this.searched = true
        this.announcement = this.error
      } finally {
        this.loading = false
      }
    },

    setTab(tab) {
      this.tab = tab
      this.selectedId = this.items[0]?.id || ''
      this.applyError = ''
    },

    select(item) {
      this.selectedId = item.id
      this.applyError = ''
      this.detailsError = ''
    },

    proxied(url) {
      return `${this.root.dataset.image}?url=${encodeURIComponent(url)}`
    },

    thumbUrl(item) {
      return this.proxied(item.thumb)
    },

    /** A missing small image falls back to the full one; a card without either is hidden. */
    thumbFailed(event, item) {
      const image = event.target
      const full = this.proxied(item.image)
      if (item.thumb !== item.image && !image.src.endsWith(full.split('?')[1])) image.src = full
      else image.closest('.cover-option')?.classList.add('is-broken')
    },

    /* ------------------------------------------------------------ details */

    async loadDetails() {
      const item = this.selected
      if (!item || this.detailsLoading) return
      this.detailsLoading = true
      this.detailsError = ''
      this.applyError = ''
      try {
        const params = new URLSearchParams({
          source: item.source,
          ref: item.ref,
          type_id: fieldOf(this.form, '#f-content_type_id'),
        })
        const response = await fetch(`${this.root.dataset.details}?${params}`, {
          headers: { accept: 'application/json' },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Bilgiler alınamadı; tekrar deneyin.')
        this.details = data
        this.newGenres = []
        this.fill = this.defaults(data, item)
        this.step = 'review'
        this.announcement = `${data.sourceLabel} bilgileri geldi; doldurulacak alanları seçin.`
        this.$nextTick(() => document.getElementById('cover-finder-review')?.focus())
      } catch (error) {
        this.detailsError =
          error instanceof TypeError ? 'Sunucuya ulaşılamadı; tekrar deneyin.' : error.message
      } finally {
        this.detailsLoading = false
      }
    },

    /** Ticked: what the form lacks; a new series also takes year, status and type. */
    defaults(data, item) {
      const isNew = this.root.dataset.new === 'true'
      const empty = (selector) => !fieldOf(this.form, selector)
      return {
        cover: item.kind === 'cover' || Boolean(data.cover),
        banner: item.kind === 'banner' || Boolean(data.banner),
        title: Boolean(data.title) && empty('#f-title'),
        alternatives: this.newAlternatives.length > 0,
        description: Boolean(data.description) && empty('#f-description'),
        contentType: Boolean(data.contentType) && (isNew || empty('#f-content_type_id')),
        year: Boolean(data.year) && (isNew || empty('#f-publication_year')),
        status: Boolean(data.status) && isNew,
        ageRating: Boolean(data.ageRating) && empty('#f-age_rating'),
        genres: data.genres.matched.length > 0,
        authors: data.authors.length > 0,
        artists: data.artists.length > 0,
      }
    },

    get newAlternatives() {
      if (!this.details) return []
      const have = new Set(
        fieldOf(this.form, 'input[data-name="alternative_titles"]')
          .split(',')
          .map((title) => title.trim().toLocaleLowerCase('tr'))
          .concat(fieldOf(this.form, '#f-title').toLocaleLowerCase('tr'))
      )
      return this.details.alternatives
        // Titles are posted comma separated (tag_input.js), so one with a comma cannot be kept.
        .filter((title) => !title.includes(',') && !have.has(title.toLocaleLowerCase('tr')))
        .slice(0, 6)
    },

    /** The cover/banner offered: the chosen image, or the work's own from the details. */
    get coverUrl() {
      if (!this.details) return ''
      return this.selected?.kind === 'cover' ? this.selected.image : this.details.cover || ''
    },

    get bannerUrl() {
      if (!this.details) return ''
      return this.selected?.kind === 'banner' ? this.selected.image : this.details.banner || ''
    },

    /** What the form holds now (the shown text of a select). */
    currentOf(selector) {
      const element = this.form?.querySelector(selector)
      if (!element) return ''
      if (element.tagName === 'SELECT')
        return element.value ? element.selectedOptions[0]?.textContent.trim() || '' : ''
      return element.value.trim()
    },

    toggleGenre(name) {
      const index = this.newGenres.indexOf(name)
      if (index === -1) this.newGenres.push(name)
      else this.newGenres.splice(index, 1)
    },

    back() {
      this.step = 'pick'
      this.applyError = ''
    },

    /* -------------------------------------------------------------- apply */

    async putImage(url, kind, source) {
      const response = await fetch(this.proxied(url))
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Görsel indirilemedi; başka bir görsel seçin.')
      }
      const blob = await response.blob()
      const ext = response.headers.get('x-cover-extension') || 'jpg'
      const file = new File([blob], `${source}-${kind}.${ext}`, { type: blob.type })
      const name = kind === 'banner' ? 'banner_image' : 'cover_image'
      window.dispatchEvent(new CustomEvent('image-drop', { detail: { name, file } }))
    },

    /** Finds or adds a genre/author/artist; answers { id, name }. */
    async record(kind, name) {
      const response = await fetch(this.root.dataset.record, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-csrf-token': csrf(),
        },
        body: JSON.stringify({ kind, name }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `${name} eklenemedi.`)
      return data
    },

    async choose(kind, list) {
      const items = []
      for (const entry of list) items.push(entry.id ? entry : await this.record(kind, entry.name))
      if (items.length)
        window.dispatchEvent(
          new CustomEvent('multi-select-add', { detail: { id: `f-${kind}`, items } })
        )
    },

    /** "Yalnız görseli kullan": the chosen image only. */
    async applyImage() {
      const item = this.selected
      if (!item || this.applying) return
      await this.run(async () => {
        await this.putImage(item.image, item.kind, item.source)
        return `${item.kind === 'banner' ? 'Banner' : 'Kapak'} seçildi (${item.sourceLabel}).`
      })
    },

    /** "Forma uygula": every ticked field. */
    async applyAll() {
      const data = this.details
      if (!data || this.applying) return
      await this.run(async () => {
        const form = this.form
        const fill = this.fill
        const source = this.selected?.source || data.source
        if (fill.cover && this.coverUrl) await this.putImage(this.coverUrl, 'cover', source)
        if (fill.banner && this.bannerUrl) await this.putImage(this.bannerUrl, 'banner', source)
        if (fill.title) setValue(form.querySelector('#f-title'), data.title)
        if (fill.description) setValue(form.querySelector('#f-description'), data.description)
        if (fill.contentType)
          setValue(form.querySelector('#f-content_type_id'), data.contentType.id)
        if (fill.year) setValue(form.querySelector('#f-publication_year'), data.year)
        if (fill.status) setValue(form.querySelector('#f-status'), data.status)
        if (fill.ageRating) setValue(form.querySelector('#f-age_rating'), data.ageRating)
        if (fill.alternatives && this.newAlternatives.length)
          window.dispatchEvent(
            new CustomEvent('tags-add', {
              detail: { id: 'f-alternative_titles', tags: this.newAlternatives },
            })
          )
        const genres = fill.genres ? [...data.genres.matched] : []
        for (const name of this.newGenres) genres.push({ id: null, name })
        await this.choose('genres', genres)
        if (fill.authors) await this.choose('authors', data.authors)
        if (fill.artists) await this.choose('artists', data.artists)
        return `Form ${data.sourceLabel} bilgileriyle dolduruldu; kontrol edin.`
      })
    },

    async run(task) {
      this.applying = true
      this.applyError = ''
      try {
        const text = await task()
        window.dispatchEvent(
          new CustomEvent('toast', { detail: { text: `${text} Kaydedince geçerli olur.` } })
        )
        this.close()
      } catch (error) {
        this.applyError =
          error instanceof TypeError ? 'Sunucuya ulaşılamadı; tekrar deneyin.' : error.message
      } finally {
        this.applying = false
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { coverFinder }
