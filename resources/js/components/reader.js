/**
 * Chapter reader (pages/chapter_reader.edge, partials/reader/*).
 *
 * - `readerToolbar`: the sticky toolbar. Chapter picker, reading settings (saved in localStorage
 *   under "reader-prefs" and announced with a `reader-prefs` window event), reading progress and
 *   hiding while the reader scrolls down or reads immersively. Mode, size and direction are
 *   mirrored in the `reader` cookie ("paged-125", "paged-125-rtl") so the server renders the right
 *   layout before any script runs. Accounts also keep the settings on the server
 *   (POST /okuyucu/tercihler); the page then carries them in `data-reader-account` and they win
 *   over this browser's copy, so they follow the reader across devices.
 * - `reader`: the chapter body. Applies the settings, tracks page images (placeholder until loaded,
 *   retry on error), turns pages and chapters from taps, swipes and keys, counts webtoon pages and
 *   remembers the page on screen (accounts: POST /okuyucu/konum, guests: localStorage
 *   "reader-pos") to offer "Kaldığın yer" on the next visit. Image chapters read either as one long
 *   strip ("webtoon") or one page at a time ("paged": outer thirds of the page and ← / → turn
 *   pages, mirrored when reading right to left; kept in the address as #sayfa-N). A tap in the
 *   middle third (or anywhere on the strip) and F hide the toolbar (immersive reading).
 *
 * URLs and texts come from data attributes (AGENTS.md rule 9).
 */

import { csrfToken, isAccount, postJson } from './library.js'

const prefsKey = 'reader-prefs'
const positionsKey = 'reader-pos'
/** Guests remember the page of this many chapters; the oldest are forgotten first. */
const maxPositions = 100
/** Page number in the address while reading page by page. */
const pageHash = /^#sayfa-(\d+)$/
/** Novel text sizes in rem; the default is the third step (config/reader.ts → fontSteps). */
const fontSizes = [0.9375, 1.0625, 1.125, 1.25, 1.375, 1.5]
const defaultFont = 2
/**
 * Page widths in percent of the reading column (52rem, or the screen when narrower), the same in
 * both modes (config/reader.ts → zoomSteps). Above 100% a page may outgrow the screen and scrolls
 * sideways.
 */
const zoomSteps = [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200]
const defaultZoom = 100
/** The page position is sent at most this often while reading (and once more on leaving). */
const saveEvery = 4000
/** A swipe turns the page when it moves at least this far, and mostly sideways. */
const swipe = { distance: 50, ratio: 1.5 }

const stepOf = (value, steps, fallback) =>
  Number.isInteger(value) && value >= 0 && value < steps.length ? value : fallback

function normalizePrefs(data) {
  return {
    font: stepOf(Number(data?.font), fontSizes, defaultFont),
    mode: data?.mode === 'paged' ? 'paged' : 'webtoon',
    zoom: zoomSteps.includes(Number(data?.zoom)) ? Number(data.zoom) : defaultZoom,
    dir: data?.dir === 'rtl' ? 'rtl' : 'ltr',
    auto: data?.auto === true,
  }
}

/** Settings saved with the account (rendered by ChapterController), or null. */
function accountPrefs() {
  const raw = document.querySelector('[data-reader-account]')?.dataset.readerAccount
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function storedPrefs() {
  try {
    return JSON.parse(window.localStorage.getItem(prefsKey) || 'null')
  } catch {
    return null
  }
}

/** The `reader` cookie ("paged-125-rtl") when this browser's storage has nothing (or is blocked). */
function cookiePrefs() {
  const value = document.cookie
    .split('; ')
    .find((pair) => pair.startsWith('reader='))
    ?.slice(7)
  const match = /^(webtoon|paged)-(\d{2,3})(?:-(ltr|rtl))?$/.exec(value || '')
  return match ? { mode: match[1], zoom: Number(match[2]), dir: match[3] } : null
}

export function readPrefs() {
  return normalizePrefs(accountPrefs() ?? storedPrefs() ?? cookiePrefs())
}

/** Mode, size and direction for the server (ChapterController reads the plain `reader` cookie). */
function saveCookie(prefs) {
  const value = `${prefs.mode}-${prefs.zoom}${prefs.dir === 'rtl' ? '-rtl' : ''}`
  if (document.cookie.split('; ').includes(`reader=${value}`)) return
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `reader=${value}; path=/; max-age=31536000; samesite=lax${secure}`
}

function storeLocal(prefs) {
  try {
    window.localStorage.setItem(prefsKey, JSON.stringify(prefs))
  } catch {
    /* Private windows may block storage; the choice still applies to this page. */
  }
  saveCookie(prefs)
}

let uploadTimer = 0

/** Accounts: the settings follow the reader; quick − / + presses are sent once. */
function uploadPrefs(prefs, delay = 600) {
  window.clearTimeout(uploadTimer)
  uploadTimer = window.setTimeout(() => {
    postJson('/okuyucu/tercihler', prefs).catch(() => {
      /* Kept in this browser; the next change tries again. */
    })
  }, delay)
}

function savePrefs(prefs) {
  storeLocal(prefs)
  if (isAccount()) uploadPrefs(prefs)
  window.dispatchEvent(new CustomEvent('reader-prefs', { detail: { ...prefs } }))
}

function readPositions() {
  try {
    const data = JSON.parse(window.localStorage.getItem(positionsKey) || 'null')
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/** Guests: the page last seen in a chapter ("type/slug/number"), or null. */
function localPosition(key) {
  const page = Number(readPositions()[key])
  return Number.isInteger(page) && page > 0 ? page : null
}

function storePosition(key, page) {
  try {
    const all = readPositions()
    delete all[key]
    all[key] = page
    const keys = Object.keys(all)
    for (const old of keys.slice(0, Math.max(0, keys.length - maxPositions))) delete all[old]
    window.localStorage.setItem(positionsKey, JSON.stringify(all))
  } catch {
    /* Storage may be disabled by the browser. */
  }
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
    /** Immersive reading (`reader-immersive` event): the bar stays out of the way. */
    immersive: false,
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
      this.onImmersive = (event) => {
        this.immersive = event.detail.on
        this.update(0)
      }
      window.addEventListener('scroll', this.onScroll, { passive: true })
      window.addEventListener('resize', this.onScroll, { passive: true })
      window.addEventListener('reader-page', this.onPage)
      window.addEventListener('reader-immersive', this.onImmersive)
      this.update(0)
    },

    destroy() {
      window.removeEventListener('scroll', this.onScroll)
      window.removeEventListener('resize', this.onScroll)
      window.removeEventListener('reader-page', this.onPage)
      window.removeEventListener('reader-immersive', this.onImmersive)
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
      // Keep the bar while it is in use (settings open; focus inside unless reading immersively).
      const open = Boolean(this.$el.querySelector('[aria-expanded="true"]'))
      if (this.immersive) {
        this.hidden = !open
        return
      }
      const busy = open || this.$el.contains(document.activeElement)
      if (busy || window.scrollY < 160) this.hidden = false
      else if (delta > 6) this.hidden = true
      else if (delta < -6) this.hidden = false
    },

    change(values) {
      this.prefs = { ...this.prefs, ...values }
      savePrefs(this.prefs)
    },

    font(step) {
      const font = Math.min(this.fontMax, Math.max(0, this.prefs.font + step))
      if (font !== this.prefs.font) this.change({ font })
    },

    fontLabel() {
      return `${Math.round((fontSizes[this.prefs.font] / fontSizes[defaultFont]) * 100)}%`
    },

    setMode(mode) {
      this.change({ mode })
    },

    setDir(dir) {
      this.change({ dir })
    },

    setAuto(auto) {
      this.change({ auto })
    },

    zoomBy(step) {
      const index = zoomSteps.indexOf(this.prefs.zoom) + step
      const zoom = zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, index))]
      if (zoom !== this.prefs.zoom) this.change({ zoom })
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
    /** Paged mode: the page on screen (0-based). */
    page: 0,
    /** Webtoon mode: the page crossing the upper part of the screen, null before the first. */
    seen: null,
    immersive: false,
    /** "Kaldığın yer" page (1-based) while the prompt is offered, else null. */
    resume: null,
    chapterId: null,
    positionKey: '',
    /** Page the chapter opened on; positions are saved once the reader moves away from it. */
    startPage: null,
    moved: false,
    pending: null,
    saveTimer: 0,
    touch: null,
    swipedAt: 0,

    init() {
      const config = JSON.parse(this.$el.dataset.config || '{}')
      this.base = config.base || ''
      this.prev = config.prev || null
      this.next = config.next || null
      this.chapterId = config.chapter || null
      this.positionKey = config.key || ''
      this.onPrefs = (event) => this.applyPrefs(event.detail)
      this.onKey = (event) => this.key(event)
      this.onLeave = (event) => {
        if (event.type === 'pagehide' || document.visibilityState === 'hidden') this.flush(true)
      }
      window.addEventListener('reader-prefs', this.onPrefs)
      window.addEventListener('keydown', this.onKey)
      window.addEventListener('pagehide', this.onLeave)
      document.addEventListener('visibilitychange', this.onLeave)
      this.pages = [...this.$el.querySelectorAll('[data-page]')]
      for (const page of this.pages) this.watch(page)
      const match = pageHash.exec(window.location.hash)
      if (match && this.paged)
        this.page = Math.min(this.pages.length, Math.max(1, Number(match[1]))) - 1
      this.syncPrefs()
      this.offerResume(match ? null : isAccount() ? config.resume : localPosition(this.positionKey))
      this.observe()
      this.show()
    },

    destroy() {
      window.removeEventListener('reader-prefs', this.onPrefs)
      window.removeEventListener('keydown', this.onKey)
      window.removeEventListener('pagehide', this.onLeave)
      document.removeEventListener('visibilitychange', this.onLeave)
      this.observer?.disconnect()
      this.flush(true)
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

    /** Right-to-left reading (paged mode only): the left side goes forward. */
    get rtl() {
      return this.paged && this.prefs.dir === 'rtl'
    },

    /**
     * Accounts: settings saved with the account also become this browser's; an account without
     * saved settings takes the ones this browser already had.
     */
    syncPrefs() {
      if (!isAccount()) return saveCookie(this.prefs)
      if (accountPrefs()) storeLocal(this.prefs)
      else if (storedPrefs()) {
        saveCookie(this.prefs)
        uploadPrefs(this.prefs, 0)
      } else saveCookie(this.prefs)
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
     * Webtoon page counter: a thin band in the upper part of the screen tells which page is being
     * read (cheaper than measuring every page on scroll).
     */
    observe() {
      if (!this.pages.length || !('IntersectionObserver' in window)) return
      const inBand = new Set()
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const index = this.pages.indexOf(entry.target)
            if (entry.isIntersecting) inBand.add(index)
            else inBand.delete(index)
          }
          if (!inBand.size || this.paged) return
          this.seen = Math.min(...inBand)
          this.remember(this.seen)
        },
        { rootMargin: '-30% 0px -60% 0px' }
      )
      for (const page of this.pages) this.observer.observe(page)
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
      if (this.paged) this.remember(this.page)
    },

    /** Opens a page in paged mode and brings the page area into view when it is off screen. */
    goTo(index) {
      this.page = Math.min(this.pages.length - 1, Math.max(0, index))
      this.show()
      const content = document.getElementById('reader-content')
      const top = content?.getBoundingClientRect().top ?? 0
      if (content && (top < 0 || top > window.innerHeight / 2)) content.scrollIntoView()
    },

    /**
     * Next/previous page. Past the last page the next chapter opens when "Bölüm bitince sonrakine
     * geç" is on; otherwise the end-of-chapter card comes into view with "Sonraki bölüm" focused.
     */
    turn(step) {
      const page = this.page + step
      if (page < 0) return
      if (page < this.pages.length) return this.goTo(page)
      if (this.prefs.auto && this.next) {
        this.flush(true)
        window.location.href = this.next
        return
      }
      const end = this.$el.querySelector('.reader-end')
      end?.scrollIntoView({ block: 'center' })
      end?.querySelector('a[rel="next"]')?.focus({ preventScroll: true })
    },

    /**
     * Turns by screen side: +1 for the right side (→, D, a swipe to the left), -1 for the left.
     * Left to right that is next / previous; right to left it is mirrored.
     */
    side(direction) {
      this.turn(this.rtl ? -direction : direction)
    },

    /**
     * Paged mode: the outer thirds turn pages (right goes forward, or left when reading right to
     * left) and the middle third toggles immersive reading. Webtoon: a tap on the strip toggles it.
     * Buttons inside keep their own job; the click that ends a swipe is ignored.
     */
    tap(event) {
      if (event.target.closest('button, a') || Date.now() - this.swipedAt < 500) return
      if (!this.paged) return this.toggleImmersive()
      const box = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width
      if (x > 1 / 3 && x < 2 / 3) return this.toggleImmersive()
      this.side(x >= 2 / 3 ? 1 : -1)
    },

    touchStart(event) {
      const point = event.touches[0]
      this.touch =
        this.paged && event.touches.length === 1
          ? {
              x: point.clientX,
              y: point.clientY,
              scroll: event.currentTarget.scrollLeft,
            }
          : null
    },

    /**
     * Swipe in paged mode: to the left for the next page (to the right when reading right to left).
     * Mostly vertical moves scroll the page, and a page zoomed wider than the screen scrolls
     * sideways first: it turns only once its edge is reached. Pinch-zoomed views never turn.
     */
    touchEnd(event) {
      const start = this.touch
      this.touch = null
      if (!start || !this.paged || event.changedTouches.length !== 1) return
      if ((window.visualViewport?.scale ?? 1) > 1.01) return
      const point = event.changedTouches[0]
      const dx = point.clientX - start.x
      const dy = point.clientY - start.y
      if (Math.abs(dx) < swipe.distance || Math.abs(dx) < Math.abs(dy) * swipe.ratio) return
      const area = event.currentTarget
      const wide = area.scrollWidth - area.clientWidth
      if (wide > 1) {
        if (Math.abs(area.scrollLeft - start.scroll) > 1) return
        if (dx < 0 && area.scrollLeft < wide - 1) return
        if (dx > 0 && area.scrollLeft > 1) return
      }
      this.swipedAt = Date.now()
      this.side(dx < 0 ? 1 : -1)
    },

    toggleImmersive() {
      this.immersive = !this.immersive
      window.dispatchEvent(new CustomEvent('reader-immersive', { detail: { on: this.immersive } }))
    },

    /** Offers "Kaldığın yer" for a page between the first and the last one. */
    offerResume(page) {
      const value = Number(page)
      if (Number.isInteger(value) && value > 1 && value < this.pages.length) this.resume = value
    },

    resumeReading() {
      const index = this.resume - 1
      this.resume = null
      this.moved = true
      if (this.paged) this.goTo(index)
      else this.pages[index]?.scrollIntoView()
    },

    dismissResume() {
      this.resume = null
    },

    /**
     * Remembers the page on screen. Nothing is saved while "Kaldığın yer" is still offered (the
     * prompt goes away once that page is reached or the reader has moved two pages on), nor for
     * the page the chapter opened on until the reader moves.
     */
    remember(index) {
      if (this.startPage === null) {
        // The browser may have restored the scroll position to that page already.
        if (this.resume && index + 1 >= this.resume) this.resume = null
        this.startPage = index
        return
      }
      if (this.resume) {
        if (index + 1 < this.resume && index < this.startPage + 2) return
        this.resume = null
      }
      if (!this.moved && index === this.startPage) return
      this.moved = true
      this.pending = index + 1
      if (!this.saveTimer) this.saveTimer = window.setTimeout(() => this.flush(), saveEvery)
    },

    /** Sends the remembered page (accounts) or stores it (guests). */
    flush(leaving = false) {
      window.clearTimeout(this.saveTimer)
      this.saveTimer = 0
      const page = this.pending
      this.pending = null
      if (!page) return
      if (!isAccount()) {
        if (this.positionKey) storePosition(this.positionKey, page)
        return
      }
      if (!this.chapterId) return
      fetch('/okuyucu/konum', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: leaving,
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-csrf-token': csrfToken(),
        },
        body: JSON.stringify({ chapter: this.chapterId, page }),
      }).catch(() => {
        /* The position is a convenience; the next page change tries again. */
      })
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

    /** Opens the previous (-1) or next (+1) chapter, when there is one. */
    chapter(step) {
      const target = step < 0 ? this.prev : this.next
      if (!target) return false
      this.flush(true)
      window.location.href = target
      return true
    },

    /**
     * Keys (not while typing or when a dialog is open):
     * - ← / → and A / D: previous / next page in paged mode (mirrored right to left), previous /
     *   next chapter otherwise; `,` / `.`: previous / next chapter in every mode;
     * - Home / End: first / last page in paged mode; F: immersive reading on / off.
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
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === 'f') {
        event.preventDefault()
        this.toggleImmersive()
        return
      }
      if (key === ',' || key === '.') {
        if (this.chapter(key === ',' ? -1 : 1)) event.preventDefault()
        return
      }
      if (this.paged && (key === 'Home' || key === 'End')) {
        event.preventDefault()
        this.goTo(key === 'Home' ? 0 : this.pages.length - 1)
        return
      }
      const step =
        key === 'ArrowLeft' || key === 'a' ? -1 : key === 'ArrowRight' || key === 'd' ? 1 : 0
      if (!step) return
      if (this.paged) {
        event.preventDefault()
        this.side(step)
        return
      }
      if (this.chapter(step)) event.preventDefault()
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { reader, readerToolbar }
