export default (slideCount) => ({
  current: 0,
  total: Number(slideCount),
  timer: null,
  touchStartX: null,
  pausedBy: {
    focus: false,
    hover: false,
    touch: false,
  },

  init() {
    this.startAutoplay()
  },

  destroy() {
    this.stopAutoplay()
  },

  startAutoplay() {
    this.stopAutoplay()

    if (
      this.total < 2 ||
      Object.values(this.pausedBy).some(Boolean) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    this.timer = window.setInterval(() => {
      this.current = (this.current + 1) % this.total
    }, 6000)
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

  goTo(index) {
    this.current = (index + this.total) % this.total
    this.startAutoplay()
  },

  next() {
    this.goTo(this.current + 1)
  },

  previous() {
    this.goTo(this.current - 1)
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
        distance < 0 ? this.next() : this.previous()
      }
    }

    this.touchStartX = null
    this.resume('touch')
  },
})
