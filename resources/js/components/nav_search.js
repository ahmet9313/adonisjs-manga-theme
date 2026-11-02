const typeLabel = (type) => (type ? type.charAt(0).toUpperCase() + type.slice(1) : '')

/**
 * Header search as an ARIA combobox: results come from /ara while typing; arrow keys move
 * through them (the last option opens the full catalog search), Enter follows the active one
 * or searches the catalog, Escape closes. "/" focuses the desktop field from anywhere.
 * Usage: x-data="navSearch('desktop')" with partials/search_results.edge inside the listbox.
 */
function navSearch(prefix = 'search') {
  return {
    prefix,
    query: '',
    results: [],
    open: false,
    loading: false,
    searched: false,
    active: -1,
    requestId: 0,

    init() {
      if (prefix !== 'desktop') return
      window.addEventListener('keydown', (event) => {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
        const target = event.target
        if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
          return
        if (!this.$refs.input?.offsetParent) return
        event.preventDefault()
        this.$refs.input.focus()
      })
    },

    async search() {
      const requestId = ++this.requestId
      const text = this.query.trim()
      this.active = -1
      if (text.length < 2) {
        this.loading = false
        this.searched = false
        this.results = []
        this.open = false
        return
      }
      this.loading = true
      this.open = true
      try {
        const response = await fetch('/ara?q=' + encodeURIComponent(text), {
          headers: { accept: 'application/json' },
        })
        if (!response.ok) throw new Error('Arama isteği başarısız')
        const results = await response.json()
        if (requestId === this.requestId) this.results = results
      } catch {
        if (requestId === this.requestId) this.results = []
      } finally {
        if (requestId === this.requestId) {
          this.loading = false
          this.searched = true
        }
      }
    },

    reopen() {
      if (this.query.trim().length >= 2) this.open = true
    },

    close() {
      this.open = false
      this.active = -1
    },

    /** Options: every result plus "Tüm sonuçlar" at the end. */
    optionCount() {
      return this.query.trim().length >= 2 ? this.results.length + 1 : 0
    },

    activeId() {
      if (!this.open || this.active < 0) return null
      return this.active >= this.results.length
        ? `${this.prefix}-result-all`
        : `${this.prefix}-result-${this.active}`
    },

    onKeydown(event) {
      const count = this.optionCount()
      if (event.key === 'ArrowDown' && count) {
        event.preventDefault()
        this.open = true
        this.active = this.active + 1 >= count ? 0 : this.active + 1
        this.scrollActive()
      } else if (event.key === 'ArrowUp' && count) {
        event.preventDefault()
        this.open = true
        this.active = this.active <= 0 ? count - 1 : this.active - 1
        this.scrollActive()
      } else if (event.key === 'Enter') {
        const text = this.query.trim()
        if (!text) return
        event.preventDefault()
        const item = this.results[this.active]
        window.location.href = item
          ? `/series/${item.type}/${item.slug}`
          : '/seriler?search=' + encodeURIComponent(text)
      } else if (event.key === 'Escape' && this.open) {
        event.stopPropagation()
        this.close()
      }
    },

    scrollActive() {
      this.$nextTick(() => document.getElementById(this.activeId() || '')?.scrollIntoView({ block: 'nearest' }))
    },

    /** "“Kimetsu no Yaiba” · Manga · Bölüm 205 · Aksiyon": the alternative title that matched, type, latest chapter. */
    describe(item) {
      return [
        item.alias ? `“${item.alias}”` : '',
        typeLabel(item.type),
        item.lastChapter ? `Bölüm ${item.lastChapter}` : '',
        ...(item.genres || []).slice(0, item.alias ? 1 : 2),
      ]
        .filter(Boolean)
        .join(' · ')
    },
  }
}

export default navSearch

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { navSearch }
