/**
 * Phone tab bar (partials/bottom_nav.edge). "Menü" toggles the header's mobile panel through
 * the `toggle-mobile-menu` window event and mirrors its state in aria-expanded. In the chapter
 * reader the bar slides away while reading downwards and comes back when scrolling up or at the
 * end of the page, like the reader toolbar. While a text field has focus (the on-screen
 * keyboard is open) the bar steps aside everywhere, so it never covers the composer.
 */
const typingTarget = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' &&
      !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type)))

function bottomNav() {
  return {
    hidden: false,
    typing: false,
    menuOpen: false,

    init() {
      this.panel = document.getElementById('mobile-navigation')
      if (this.panel) {
        const sync = () => {
          this.menuOpen = getComputedStyle(this.panel).display !== 'none'
        }
        this.observer = new MutationObserver(sync)
        this.observer.observe(this.panel, { attributes: true, attributeFilter: ['style'] })
        sync()
      }
      // After the frame, so moving between two fields does not flash the bar.
      this.onFocus = () =>
        window.requestAnimationFrame(() => {
          this.typing = typingTarget(document.activeElement)
          this.$el.inert = this.hidden || this.typing
        })
      document.addEventListener('focusin', this.onFocus)
      document.addEventListener('focusout', this.onFocus)
      if (!document.getElementById('reader-content')) return
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
    },

    destroy() {
      this.observer?.disconnect()
      document.removeEventListener('focusin', this.onFocus)
      document.removeEventListener('focusout', this.onFocus)
      if (this.onScroll) window.removeEventListener('scroll', this.onScroll)
    },

    update(delta) {
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80
      const busy = this.$el.contains(document.activeElement) || this.menuOpen
      if (busy || atEnd || window.scrollY < 160) this.hidden = false
      else if (delta > 6) this.hidden = true
      else if (delta < -6) this.hidden = false
      this.$el.inert = this.hidden || this.typing
    },

    toggleMenu() {
      window.dispatchEvent(new CustomEvent('toggle-mobile-menu'))
      // With a non-sticky header the panel opens at the top of the page.
      const header = this.panel?.closest('header')
      if (!this.menuOpen && header && header.getBoundingClientRect().bottom <= 0)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { bottomNav }
