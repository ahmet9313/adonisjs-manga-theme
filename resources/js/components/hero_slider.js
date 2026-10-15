/**
 * Home page behaviour.
 *
 * `heroSlider(n)`: the featured series carousel (WAI-ARIA carousel pattern). One slide is shown
 * at a time (x-show); it rotates every 7 s unless the visitor asked for reduced motion, pressed
 * pause, hovers it, has keyboard focus inside it, touches it or the tab is hidden. Arrow keys,
 * swipes, the dots and the previous/next buttons change the slide. The images of the
 * neighbouring slides are fetched ahead so a change never shows an empty frame.
 *
 * `homeRail`: previous/next buttons for a horizontally scrolling rail (`x-ref="track"`).
 */
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const heroSlider = (slideCount) => ({
  current: 0,
  total: Number(slideCount),
  timer: null,
  touchStartX: null,
  /** Paused by the play/pause button (or by default for reduced motion). */
  stopped: false,
  pausedBy: {
    focus: false,
    hover: false,
    touch: false,
    hidden: false,
  },

  init() {
    this.stopped = reducedMotion()
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
    document.removeEventListener('visibilitychange', this.onVisibility)
  },

  /** True while the slides change on their own (the play/pause button shows this). */
  get playing() {
    return !this.stopped && this.total > 1
  },

  startAutoplay() {
    this.stopAutoplay()
    if (this.total < 2 || this.stopped || Object.values(this.pausedBy).some(Boolean)) return
    this.timer = window.setInterval(() => this.show(this.current + 1), 7000)
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

  show(index) {
    this.current = (index + this.total) % this.total
    this.prefetch()
  },

  goTo(index) {
    this.show(index)
    this.startAutoplay()
  },

  next() {
    this.goTo(this.current + 1)
  },

  previous() {
    this.goTo(this.current - 1)
  },

  /** Lazy images of hidden slides never load on their own: ask for the neighbours' artwork. */
  prefetch() {
    const slides = this.$root.querySelectorAll('[data-hero-slide]')
    for (const offset of [1, -1]) {
      const slide = slides[(this.current + offset + this.total) % this.total]
      for (const img of slide?.querySelectorAll('img[loading="lazy"]') ?? []) img.loading = 'eager'
    }
  },

  handleTouchStart(event) {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null
    this.pause('touch')
  },

  handleTouchEnd(event) {
    const touchEndX = event.changedTouches[0]?.clientX

    if (this.touchStartX !== null && touchEndX !== undefined) {
      const distance = touchEndX - this.touchStartX

      if (Math.abs(distance) >= 50) {
        if (distance < 0) this.next()
        else this.previous()
      }
    }

    this.touchStartX = null
    this.resume('touch')
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

export default heroSlider

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { heroSlider, homeRail }
