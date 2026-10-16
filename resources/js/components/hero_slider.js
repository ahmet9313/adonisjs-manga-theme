/**
 * Home page behaviour.
 *
 * `heroSlider(n)`: the featured series carousel (WAI-ARIA carousel pattern). The slides lie side by
 * side like a phone carousel: the current one fills the frame, the others wait to its left/right
 * with `visibility: hidden` (so only one slide is visible, focusable or read once a change has
 * settled). A change slides the old slide out and the new one in. Mouse, pen and touch drags move
 * the current slide and its neighbour with the pointer; letting go past the threshold (or with a
 * quick flick) changes the slide, otherwise both spring back. Vertical scrolling stays with the
 * browser (`touch-action: pan-y`). It rotates every 7 s unless the visitor asked for reduced
 * motion, pressed pause, hovers it, has keyboard focus inside it, drags it or the tab is hidden.
 * Arrow keys, the dots and the previous/next buttons change the slide too. The images of the
 * neighbouring slides are fetched ahead so a change never shows an empty frame.
 *
 * `homeRail`: previous/next buttons for a horizontally scrolling rail (`x-ref="track"`).
 *
 * `homeUpdates`: the "Son Güncellenenler" page links (they point at `#home-updates`) load the page
 * in place. The list turns into skeleton rows, the server sends that section alone
 * (`X-Fragment: home-updates`) and its `[data-updates-content]` replaces ours; the address bar
 * follows (`?page=`), so reloading, sharing and back/forward still work. A failed request opens
 * the page the usual way.
 */
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Slide movement (ms); matches the feel of a native swipe. */
const slideTime = 450
const slideEase = 'cubic-bezier(0.22, 0.8, 0.24, 1)'

const heroSlider = (slideCount) => ({
  current: 0,
  total: Number(slideCount),
  timer: null,
  /** Pointer drag in progress (`active` once it moved far enough sideways). */
  drag: null,
  dragging: false,
  suppressClick: false,
  /** Slide that is still sliding out after a change, and its cleanup timer. */
  leaving: null,
  settleTimer: null,
  /** Paused by the play/pause button (or by default for reduced motion). */
  stopped: false,
  pausedBy: {
    focus: false,
    hover: false,
    drag: false,
    hidden: false,
  },

  init() {
    this.stopped = reducedMotion()
    this.slides = [...this.$root.querySelectorAll('[data-hero-slide]')]
    this.layout()
    this.onVisibility = () => {
      if (document.hidden) this.pause('hidden')
      else this.resume('hidden')
    }
    document.addEventListener('visibilitychange', this.onVisibility)
    this.startAutoplay()
    // Fetch the next slide's artwork once the page has settled.
    this.prefetchTimer = window.setTimeout(() => this.prefetch(), 1200)
  },

  destroy() {
    this.stopAutoplay()
    window.clearTimeout(this.prefetchTimer)
    window.clearTimeout(this.settleTimer)
    document.removeEventListener('visibilitychange', this.onVisibility)
  },

  /** True while the slides change on their own (the play/pause button shows this). */
  get playing() {
    return !this.stopped && this.total > 1
  },

  startAutoplay() {
    this.stopAutoplay()
    if (this.total < 2 || this.stopped || Object.values(this.pausedBy).some(Boolean)) return
    this.timer = window.setInterval(() => this.show(this.current + 1, 1), 7000)
  },

  stopAutoplay() {
    if (this.timer === null) return
    window.clearInterval(this.timer)
    this.timer = null
  },

  pause(reason) {
    this.pausedBy[reason] = true
    this.stopAutoplay()
  },

  resume(reason) {
    this.pausedBy[reason] = false
    this.startAutoplay()
  },

  /** Play/pause button. */
  toggle() {
    this.stopped = !this.stopped
    if (this.stopped) this.stopAutoplay()
    else {
      // Pressing play means "go on now", even though the pointer is over the carousel.
      this.pausedBy.hover = false
      this.pausedBy.focus = false
      this.startAutoplay()
    }
  },

  wrap(index) {
    return (index + this.total) % this.total
  },

  /**
   * Shows slide `index`, sliding in from the side of `direction` (1: from the right, as "next";
   * -1: from the left). `fromDrag`: the new slide already sits where the drag left it.
   */
  show(index, direction, fromDrag = false) {
    const target = this.wrap(index)
    if (target === this.current || this.total < 2) return
    const dir = direction || (target > this.current ? 1 : -1)
    const incoming = this.slides[target]
    const outgoing = this.current
    // A slide still sliding out from the previous change is put away at once.
    if (this.leaving !== null && this.leaving !== target) this.place(this.leaving, 0, false, false)
    if (!fromDrag) {
      // Start the incoming slide just outside the frame on the chosen side, then let it move.
      this.place(target, dir * 100, false, true)
      void incoming?.offsetWidth
    }
    this.current = target
    this.leaving = outgoing
    const animate = !reducedMotion()
    this.place(target, 0, animate, true)
    this.place(outgoing, -dir * 100, animate, animate)
    window.clearTimeout(this.settleTimer)
    this.settleTimer = window.setTimeout(() => this.settle(), animate ? slideTime + 30 : 0)
    this.prefetch()
  },

  goTo(index, direction) {
    this.show(index, direction)
    this.startAutoplay()
  },

  next() {
    this.goTo(this.current + 1, 1)
  },

  previous() {
    this.goTo(this.current - 1, -1)
  },

  /** After a change: only the current slide stays visible. */
  settle() {
    this.leaving = null
    this.layout()
  },

  /** Resting layout: the current slide in the frame, every other slide hidden. */
  layout() {
    this.slides.forEach((_, index) => this.place(index, 0, false, index === this.current))
  },

  /**
   * Positions one slide. `percent` is its offset in frame widths (×100), `pixels` the extra drag
   * offset; `animate` uses the slide transition; `visible` toggles visibility.
   */
  place(index, percent, animate, visible, pixels = 0) {
    const slide = this.slides[index]
    if (!slide) return
    slide.style.transition = animate ? `transform ${slideTime}ms ${slideEase}` : 'none'
    slide.style.transform =
      percent || pixels ? `translate3d(calc(${percent}% + ${pixels}px), 0, 0)` : ''
    slide.style.visibility = visible ? '' : 'hidden'
    slide.toggleAttribute('inert', index !== this.current)
  },

  /** Lazy images of hidden slides never load on their own: ask for the neighbours' artwork. */
  prefetch() {
    for (const offset of [1, -1]) {
      const slide = this.slides[this.wrap(this.current + offset)]
      for (const img of slide?.querySelectorAll('img[loading="lazy"]') ?? []) img.loading = 'eager'
    }
  },

  dragStart(event) {
    if (this.total < 2 || this.drag || (event.pointerType === 'mouse' && event.button !== 0)) return
    // The controls are plain buttons; a press on them never starts a drag.
    if (event.target.closest('.home-hero__controls')) return
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      time: event.timeStamp,
      active: false,
      neighbour: null,
    }
  },

  dragMove(event) {
    const drag = this.drag
    if (!drag || drag.id !== event.pointerId) return
    if (event.pointerType === 'mouse' && event.buttons === 0) return this.dragEnd(event, true)
    drag.dx = event.clientX - drag.x
    if (!drag.active) {
      const dy = event.clientY - drag.y
      if (Math.abs(drag.dx) < 8 || Math.abs(drag.dx) < Math.abs(dy)) return
      drag.active = true
      this.dragging = true
      this.pause('drag')
      this.$root.setPointerCapture?.(event.pointerId)
      // A slide still moving from the previous change is put away.
      window.clearTimeout(this.settleTimer)
      this.settle()
    }
    // Dragging left brings in the next slide from the right, dragging right the previous one.
    const side = drag.dx < 0 ? 1 : -1
    const neighbour = this.wrap(this.current + side)
    if (drag.neighbour !== null && drag.neighbour !== neighbour && drag.neighbour !== this.current)
      this.place(drag.neighbour, 0, false, false)
    drag.neighbour = neighbour
    drag.side = side
    this.place(this.current, 0, false, true, drag.dx)
    if (neighbour !== this.current) this.place(neighbour, side * 100, false, true, drag.dx)
  },

  dragEnd(event, cancelled = false) {
    const drag = this.drag
    if (!drag || drag.id !== event.pointerId) return
    this.drag = null
    if (!drag.active) return
    this.dragging = false
    this.$root.releasePointerCapture?.(event.pointerId)
    // The click that follows a drag must not follow the link under the pointer.
    this.suppressClick = true
    window.setTimeout(() => (this.suppressClick = false), 0)

    const width = this.$root.clientWidth || 1
    const quick = event.timeStamp - drag.time < 300 && Math.abs(drag.dx) > 40
    const change = !cancelled && (Math.abs(drag.dx) >= Math.min(120, width * 0.2) || quick)
    if (change) this.show(drag.neighbour, drag.side, true)
    else {
      // Spring back, then hide the neighbour.
      const animate = !reducedMotion()
      this.place(this.current, 0, animate, true)
      if (drag.neighbour !== null && drag.neighbour !== this.current)
        this.place(drag.neighbour, drag.side * 100, animate, animate)
      window.clearTimeout(this.settleTimer)
      this.settleTimer = window.setTimeout(() => this.settle(), animate ? slideTime + 30 : 0)
    }
    this.resume('drag')
  },

  /** Capture-phase click filter: swallows the click that ends a drag. */
  dragClick(event) {
    if (!this.suppressClick) return
    event.preventDefault()
    event.stopPropagation()
  },
})

const homeRail = () => ({
  atStart: true,
  atEnd: false,

  init() {
    this.$nextTick(() => this.update())
    this.onResize = () => this.update()
    window.addEventListener('resize', this.onResize, { passive: true })
  },

  destroy() {
    window.removeEventListener('resize', this.onResize)
  },

  update() {
    const track = this.$refs.track
    if (!track) return
    const max = track.scrollWidth - track.clientWidth
    this.atStart = track.scrollLeft <= 4
    this.atEnd = track.scrollLeft >= max - 4
  },

  /** Scrolls about one screen of cards; `direction` is 1 or -1. */
  scroll(direction) {
    const track = this.$refs.track
    if (!track) return
    track.scrollBy({
      left: direction * Math.max(track.clientWidth * 0.85, 160),
      behavior: reducedMotion() ? 'auto' : 'smooth',
    })
  },
})

/** Status texts for screen readers while the latest updates list changes page. */
const updatesText = {
  loading: 'Sayfa yükleniyor…',
  loaded: (page) => `Sayfa ${page} yüklendi`,
}

/** The address of a list page without its #fragment. */
const pageAddress = (href) => {
  const url = new URL(href, location.href)
  url.hash = ''
  return url.href
}

const homeUpdates = () => ({
  request: null,

  init() {
    this.shown = pageAddress(location.href)
    // Back/forward between pages loaded here swaps the list again instead of doing nothing.
    history.replaceState({ ...history.state, homeUpdates: true }, '')
    this.onPopState = (event) => {
      if (event.state?.homeUpdates && pageAddress(location.href) !== this.shown)
        this.load(location.href, false)
    }
    window.addEventListener('popstate', this.onPopState)
  },

  destroy() {
    window.removeEventListener('popstate', this.onPopState)
    this.request?.abort()
  },

  /** Click handler of the section: takes over plain clicks on links to another list page. */
  navigate(event) {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target.closest('a[href]')
    if (!link || link.target || link.hasAttribute('download')) return
    const url = new URL(link.href)
    if (url.origin !== location.origin || url.pathname !== location.pathname) return
    if (url.hash !== '#home-updates') return
    event.preventDefault()
    if (pageAddress(url.href) === this.shown) return
    this.load(url.href, true)
  },

  /** Loads the list page at `href`; `push` adds a history entry (a click, not back/forward). */
  async load(href, push) {
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    const content = this.$root.querySelector('[data-updates-content]')
    this.showSkeleton(content)
    this.$root.setAttribute('aria-busy', 'true')
    this.announce(updatesText.loading)
    if (push) this.reveal()

    try {
      const response = await fetch(href, {
        headers: { 'X-Fragment': 'home-updates', 'Accept': 'text/html' },
        cache: 'no-store',
        signal: request.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const next = new DOMParser()
        .parseFromString(html, 'text/html')
        .querySelector('[data-updates-content]')
      if (!next) throw new Error('Missing [data-updates-content]')
      if (request.signal.aborted) return

      content.replaceChildren(...next.childNodes)
      this.shown = pageAddress(href)
      if (push) history.pushState({ homeUpdates: true }, '', href)
      const page = Number(new URL(href).searchParams.get('page')) || 1
      this.announce(updatesText.loaded(page))
      if (push) {
        const heading = content.querySelector('#home-updates-title')
        if (heading) {
          heading.tabIndex = -1
          heading.focus({ preventScroll: true })
        }
      }
    } catch (error) {
      if (request.signal.aborted) return
      // Fall back to an ordinary page load.
      console.error(error)
      location.assign(href)
    } finally {
      if (this.request === request) {
        this.request = null
        this.$root.removeAttribute('aria-busy')
      }
    }
  },

  /** Replaces the list (or the empty state) with as many skeleton rows as it had. */
  showSkeleton(content) {
    const template = this.$root.querySelector('[data-updates-skeleton]')
    const current = content?.querySelector('.home-updates, .empty')
    if (!template || !current) return
    const rows = current.matches('.home-updates') ? Math.max(current.children.length, 1) : 6
    const list = document.createElement('ul')
    list.className = 'home-updates'
    list.setAttribute('aria-hidden', 'true')
    for (let row = 0; row < rows; row++) list.append(template.content.cloneNode(true))
    current.replaceWith(list)
  },

  /** Scrolls back to the top of the section when it is above the viewport. */
  reveal() {
    const margin = Number.parseFloat(getComputedStyle(this.$root).scrollMarginTop) || 0
    if (this.$root.getBoundingClientRect().top >= margin) return
    this.$root.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  },

  announce(text) {
    const status = this.$root.querySelector('[data-updates-status]')
    if (status) status.textContent = text
  },
})

export default heroSlider

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { heroSlider, homeRail, homeUpdates }
