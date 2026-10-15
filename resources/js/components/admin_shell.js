const storageKey = 'admin-nav-collapsed'
const desktopQuery = () => window.matchMedia('(min-width: 1024px)')

/**
 * Admin shell (components/layout/admin.edge): the off-canvas sidebar below 1024 px (focus stays
 * inside while it is open, Escape or the backdrop closes it) and collapsible menu groups that
 * are remembered per browser.
 */
function adminShell() {
  return {
    navOpen: false,
    desktop: desktopQuery().matches,
    collapsed: [],

    init() {
      desktopQuery().addEventListener('change', (event) => {
        this.desktop = event.matches
        if (event.matches) this.navOpen = false
      })
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
        this.collapsed = Array.isArray(saved) ? saved : []
      } catch {
        this.collapsed = []
      }
    },

    toggleNav() {
      this.navOpen = !this.navOpen
    },

    closeNav() {
      if (!this.navOpen) return
      this.navOpen = false
      this.$refs.navButton?.focus()
    },

    isGroupOpen(key) {
      return !this.collapsed.includes(key)
    },

    toggleGroup(key) {
      this.collapsed = this.isGroupOpen(key)
        ? [...this.collapsed, key]
        : this.collapsed.filter((item) => item !== key)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(this.collapsed))
      } catch {}
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { adminShell }
