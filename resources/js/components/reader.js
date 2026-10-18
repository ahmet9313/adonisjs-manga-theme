/**
 * Chapter reader (pages/chapter_reader.edge, partials/reader/*).
 *
 * - `readerToolbar`: the sticky toolbar. Chapter picker, reading settings (saved in localStorage
 *   under "reader-prefs" and announced with a `reader-prefs` window event), reading progress and
 *   hiding while the reader scrolls down.
 * - `reader`: the chapter body. Applies the settings, tracks page images (placeholder until loaded,
 *   retry on error) and turns chapters with the ← / → keys.
 *
 * URLs and texts come from data attributes (AGENTS.md rule 9).
 */

const prefsKey = 'reader-prefs'
/** Novel text sizes in rem; the default is the third step. */
const fontSizes = [0.9375, 1.0625, 1.125, 1.25, 1.375, 1.5]
const defaultFont = 2

export function readPrefs() {
  let data = null
  try {
    data = JSON.parse(window.localStorage.getItem(prefsKey) || 'null')
  } catch {
    data = null
  }
  const font = Number(data?.font)
  return {
    fit: data?.fit === 'original' ? 'original' : 'width',
    font: Number.isInteger(font) && font >= 0 && font < fontSizes.length ? font : defaultFont,
  }
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(prefsKey, JSON.stringify(prefs))
  } catch {
    /* Private windows may block storage; the choice still applies to this page. */
  }
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
    hidden: false,
    percent: 0,
    base: '',
    content: null,

    init() {
      this.base = this.$el.dataset.base || ''
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
      window.addEventListener('scroll', this.onScroll, { passive: true })
      window.addEventListener('resize', this.onScroll, { passive: true })
      this.update(0)
    },

    destroy() {
      window.removeEventListener('scroll', this.onScroll)
      window.removeEventListener('resize', this.onScroll)
    },

    /** Progress through the pages, and whether the bar should step aside. */
    update(delta) {
      if (this.content) {
        const box = this.content.getBoundingClientRect()
        const travel = box.height - window.innerHeight
        const ratio = travel > 0 ? -box.top / travel : box.top < window.innerHeight ? 1 : 0
        const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
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

    setFit(fit) {
      this.prefs = { ...this.prefs, fit }
      savePrefs(this.prefs)
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
  }
}

function reader() {
  return {
    ...chapterPicker,
    prefs: readPrefs(),
    base: '',
    prev: null,
    next: null,

    init() {
      const config = JSON.parse(this.$el.dataset.config || '{}')
      this.base = config.base || ''
      this.prev = config.prev || null
      this.next = config.next || null
      this.onPrefs = (event) => (this.prefs = { ...event.detail })
      this.onKey = (event) => this.key(event)
      window.addEventListener('reader-prefs', this.onPrefs)
      window.addEventListener('keydown', this.onKey)
      for (const page of this.$el.querySelectorAll('[data-page]')) this.watch(page)
    },

    destroy() {
      window.removeEventListener('reader-prefs', this.onPrefs)
      window.removeEventListener('keydown', this.onKey)
    },

    get fontSize() {
      return `${fontSizes[this.prefs.font]}rem`
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

    /** ← previous chapter, → next chapter (not while typing or when a dialog is open). */
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
      const target =
        event.key === 'ArrowLeft' ? this.prev : event.key === 'ArrowRight' ? this.next : null
      if (!target) return
      event.preventDefault()
      window.location.href = target
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { reader, readerToolbar }
