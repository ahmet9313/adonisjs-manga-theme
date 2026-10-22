/**
 * Chapter reader (pages/chapter_reader.edge, partials/reader/*).
 *
 * - `readerToolbar`: the sticky toolbar. Chapter picker, reading settings (saved in localStorage
 *   under "reader-prefs" and announced with a `reader-prefs` window event), reading progress and
 *   hiding while the reader scrolls down. Mode and size are mirrored in the `reader` cookie
 *   ("paged-125") so the server renders the right layout before any script runs.
 * - `reader`: the chapter body. Applies the settings, tracks page images (placeholder until loaded,
 *   retry on error) and turns chapters with the ← / → keys. Image chapters read either as one long
 *   strip ("webtoon") or one page at a time ("paged": tap the right half or press → for the next
 *   page, left half or ← for the previous one; kept in the address as #sayfa-N). − / + resize the
 *   pages in both modes, and switching modes keeps the page being read.
 *
 * URLs and texts come from data attributes (AGENTS.md rule 9).
 */

const prefsKey = 'reader-prefs'
/** Page number in the address while reading page by page. */
const pageHash = /^#sayfa-(\d+)$/
/** Novel text sizes in rem; the default is the third step. */
const fontSizes = [0.9375, 1.0625, 1.125, 1.25, 1.375, 1.5]
const defaultFont = 2
/**
 * Page widths in percent of the reading column (52rem, or the screen when narrower), the same in
 * both modes. Above 100% a page may outgrow the screen and scrolls sideways.
 */
const zoomSteps = [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200]
const defaultZoom = 100

const stepOf = (value, steps, fallback) =>
  Number.isInteger(value) && value >= 0 && value < steps.length ? value : fallback

export function readPrefs() {
  let data = null
  try {
    data = JSON.parse(window.localStorage.getItem(prefsKey) || 'null')
  } catch {
    data = null
  }
  return {
    font: stepOf(Number(data?.font), fontSizes, defaultFont),
    mode: data?.mode === 'paged' ? 'paged' : 'webtoon',
    zoom: zoomSteps.includes(Number(data?.zoom)) ? Number(data.zoom) : defaultZoom,
  }
}

/** Mode and size for the server (ChapterController reads the plain `reader` cookie). */
function saveCookie(prefs) {
  const value = `${prefs.mode}-${prefs.zoom}`
  if (document.cookie.split('; ').includes(`reader=${value}`)) return
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `reader=${value}; path=/; max-age=31536000; samesite=lax${secure}`
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(prefsKey, JSON.stringify(prefs))
  } catch {
    /* Private windows may block storage; the choice still applies to this page. */
  }
  saveCookie(prefs)
  window.dispatchEvent(new CustomEvent('reader-prefs', { detail: { ...prefs } }))
}

/** Typing in a field or picking from a list must never turn the page. */
const isTyping = (target) =>
  target instanceof Element &&
  Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))

const browseKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']

/**
 * Chapter pickers (<select>): a mouse or touch choice opens the chapter at once, but browsing the
 * list with the arrow keys (which fires `change` on some systems) waits for Enter, so keyboard
 * users can move through the chapters without leaving the page (WCAG 3.2.2).
 */
export const chapterPicker = {
  keyed: false,

  pickKey(event) {
    if (browseKeys.includes(event.key)) this.keyed = true
    else if (event.key === 'Enter') {
      event.preventDefault()
      this.keyed = false
      this.openChapter(event.target)
    }
  },

  pick(event) {
    if (!this.keyed) this.openChapter(event.target)
  },

  /** Opens the chosen chapter unless it is the one on screen (the server-selected option). */
  openChapter(select) {
    const current = [...select.options].find((option) => option.defaultSelected)
    if (current && current.value === select.value) return
    this.go(select.value)
  },

  pickBlur() {
    this.keyed = false
  },

  go(number) {
    if (number !== '' && number !== undefined) window.location.href = this.base + number
  },
}

function readerToolbar() {
  return {
    ...chapterPicker,
    prefs: readPrefs(),
    fontMax: fontSizes.length - 1,
    zoomMin: zoomSteps[0],
    zoomMax: zoomSteps.at(-1),
    hidden: false,
    percent: 0,
    /** Set by the paged reader (`reader-page` event); null while the strip is scrolled. */
    pagePercent: null,
    /** Image chapter (the arrows turn pages in paged mode); false for novel and empty chapters. */
    images: false,
    base: '',
    content: null,

    init() {
      this.base = this.$el.dataset.base || ''
      this.images = Boolean(this.$el.dataset.images)
      this.content = document.getElementById('reader-content')
      let lastY = window.scrollY
      let frame = 0
      this.onScroll = () => {
        if (frame) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          this.update(window.scrollY - lastY)
          lastY = window.scrollY
        })
      }
      this.onPage = (event) => {
        this.pagePercent = event.detail.percent
        this.update(0)
      }
      window.addEventListener('scroll', this.onScroll, { passive: true })
      window.addEventListener('resize', this.onScroll, { passive: true })
      window.addEventListener('reader-page', this.onPage)
      this.update(0)
    },

    destroy() {
      window.removeEventListener('scroll', this.onScroll)
      window.removeEventListener('resize', this.onScroll)
      window.removeEventListener('reader-page', this.onPage)
    },

    /** Progress through the pages, and whether the bar should step aside. */
    update(delta) {
      if (this.pagePercent !== null || this.content) {
        let percent = this.pagePercent
        if (percent === null) {
          const box = this.content.getBoundingClientRect()
          const travel = box.height - window.innerHeight
          const ratio = travel > 0 ? -box.top / travel : box.top < window.innerHeight ? 1 : 0
          percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
        }
        if (this.$refs.bar) this.$refs.bar.style.transform = `scaleX(${percent / 100})`
        if (percent !== this.percent) this.percent = percent
      }
      // Keep the bar while it is in use (focus inside, settings open).
      const busy =
        this.$el.contains(document.activeElement) ||
        Boolean(this.$el.querySelector('[aria-expanded="true"]'))
      if (busy || window.scrollY < 160) this.hidden = false
      else if (delta > 6) this.hidden = true
      else if (delta < -6) this.hidden = false
    },

    font(step) {
      const font = Math.min(this.fontMax, Math.max(0, this.prefs.font + step))
      if (font === this.prefs.font) return
      this.prefs = { ...this.prefs, font }
      savePrefs(this.prefs)
    },

    fontLabel() {
      return `${Math.round((fontSizes[this.prefs.font] / fontSizes[defaultFont]) * 100)}%`
    },

    setMode(mode) {
      this.prefs = { ...this.prefs, mode }
      savePrefs(this.prefs)
    },

    zoomBy(step) {
      const index = zoomSteps.indexOf(this.prefs.zoom) + step
      const zoom = zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, index))]
      if (zoom === this.prefs.zoom) return
      this.prefs = { ...this.prefs, zoom }
      savePrefs(this.prefs)
    },

    zoomLabel() {
      return `${this.prefs.zoom}%`
    },
  }
}

function reader() {
  return {
    ...chapterPicker,
    prefs: readPrefs(),
    base: '',
    prev: null,
    next: null,
    pages: [],
    page: 0,

    init() {
      const config = JSON.parse(this.$el.dataset.config || '{}')
      this.base = config.base || ''
      this.prev = config.prev || null
      this.next = config.next || null
      this.onPrefs = (event) => this.applyPrefs(event.detail)
      this.onKey = (event) => this.key(event)
      window.addEventListener('reader-prefs', this.onPrefs)
      window.addEventListener('keydown', this.onKey)
      this.pages = [...this.$el.querySelectorAll('[data-page]')]
      for (const page of this.pages) this.watch(page)
      const match = pageHash.exec(window.location.hash)
      if (match && this.paged)
        this.page = Math.min(this.pages.length, Math.max(1, Number(match[1]))) - 1
      saveCookie(this.prefs)
      this.show()
    },

    destroy() {
      window.removeEventListener('reader-prefs', this.onPrefs)
      window.removeEventListener('keydown', this.onKey)
    },

    get fontSize() {
      return `${fontSizes[this.prefs.font]}rem`
    },

    get zoomScale() {
      return this.prefs.zoom / 100
    },

    /** One page at a time; novel chapters always read as text. */
    get paged() {
      return this.prefs.mode === 'paged' && this.pages.length > 0
    },

    /** New settings; a mode switch keeps the page being read in view. */
    applyPrefs(prefs) {
      const wasPaged = this.paged
      if (!wasPaged && prefs.mode === 'paged') this.page = this.pageInView()
      this.prefs = { ...prefs }
      this.show()
      if (wasPaged === this.paged) return
      // After Alpine has applied data-mode, so the target has its final position.
      this.$nextTick(() => {
        const target = this.paged ? document.getElementById('reader-content') : this.pages[this.page]
        target?.scrollIntoView()
      })
    },

    /** The webtoon page crossing the upper third of the screen. */
    pageInView() {
      const line = window.innerHeight / 3
      const index = this.pages.findIndex((page) => page.getBoundingClientRect().bottom > line)
      return Math.max(0, index)
    },

    /**
     * Marks the page on screen, loads the next two ahead, keeps the page number in the address
     * (#sayfa-N, without a history entry) and reports progress to the toolbar.
     */
    show() {
      this.pages.forEach((page, index) => {
        page.toggleAttribute('data-current', index === this.page)
        const image = page.querySelector('img')
        if (image && index > this.page && index <= this.page + 2) image.loading = 'eager'
      })
      const hash = window.location.hash
      if (!hash || pageHash.test(hash)) {
        const next = this.paged && this.page > 0 ? `#sayfa-${this.page + 1}` : ''
        if (next !== hash) {
          const { pathname, search } = window.location
          window.history.replaceState(window.history.state, '', pathname + search + next)
        }
      }
      const percent = this.paged ? Math.round(((this.page + 1) / this.pages.length) * 100) : null
      window.dispatchEvent(new CustomEvent('reader-page', { detail: { percent } }))
    },

    /** Next/previous page; past the last page the end-of-chapter card comes into view. */
    turn(step) {
      const page = this.page + step
      if (page < 0) return
      if (page >= this.pages.length) {
        this.$el.querySelector('.reader-end')?.scrollIntoView({ block: 'center' })
        return
      }
      this.page = page
      this.show()
      const content = document.getElementById('reader-content')
      const top = content?.getBoundingClientRect().top ?? 0
      if (content && (top < 0 || top > window.innerHeight / 2)) content.scrollIntoView()
    },

    /** Tap zones: left half goes back, right half forward (buttons inside keep their own job). */
    tap(event) {
      if (!this.paged || event.target.closest('button, a')) return
      const box = event.currentTarget.getBoundingClientRect()
      this.turn(event.clientX - box.left < box.width / 2 ? -1 : 1)
    },

    /** Placeholder height until the image is there; a retry box when it fails. */
    watch(page) {
      const image = page.querySelector('img')
      if (!image) return
      const loaded = () => {
        page.dataset.state = 'ready'
        this.measure(image)
      }
      image.addEventListener('load', loaded)
      image.addEventListener('error', () => (page.dataset.state = 'error'))
      if (image.complete && image.getAttribute('src')) {
        if (image.naturalWidth) loaded()
        else page.dataset.state = 'error'
      }
    },

    /**
     * Pages of a chapter usually share one size: the first loaded page gives the proportions the
     * remaining placeholders reserve, so the page does not jump while images arrive.
     */
    measure(image) {
      const pages = image.closest('.reader-pages')
      if (!pages || pages.dataset.ratio || !image.naturalWidth || !image.naturalHeight) return
      pages.style.setProperty('--page-ratio', `${image.naturalWidth} / ${image.naturalHeight}`)
      pages.dataset.ratio = '1'
    },

    retry(page) {
      const image = page?.querySelector('img')
      if (!image) return
      page.dataset.state = 'loading'
      image.loading = 'eager'
      image.setAttribute('src', image.getAttribute('src'))
    },

    /**
     * ← previous chapter, → next chapter; in paged mode the arrows turn pages instead (not while
     * typing or when a dialog is open).
     */
    key(event) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return
      if (isTyping(event.target) || this.$layers.size) return
      const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      if (step && this.paged) {
        event.preventDefault()
        this.turn(step)
        return
      }
      const target = step < 0 ? this.prev : step > 0 ? this.next : null
      if (!target) return
      event.preventDefault()
      window.location.href = target
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { reader, readerToolbar }
