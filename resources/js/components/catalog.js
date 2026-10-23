/**
 * Catalog filter bar (pages/series_list.edge).
 *
 * The bar is a plain GET form whose dropdowns are <details> elements, so it works without
 * JavaScript. This component adds: one open dropdown at a time (outside clicks and Escape close
 * it, focus returns to its button), arrow keys inside a dropdown, a live genre search that
 * ignores Turkish diacritics, three-state genre chips (dahil → hariç → temizle; they drive the
 * `genre` / `xgenre` checkboxes of partials/catalog/genre_filter.edge), live counts on the
 * buttons, and clean URLs (empty fields are left out). The initial state comes from the server in
 * `data-config` (AGENTS.md rule 9):
 * { genres, excludedGenres, genreMode, statuses, types, order, sorts: { value: label } }.
 */

/** "Doğaüstü" and "dogaustu" match: lower case (Turkish rules), no diacritics, dotless ı → i. */
const fold = (text) =>
  String(text ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const MENUS = ['openGenre', 'openStatus', 'openType', 'openMore', 'openSort']

const list = (value) => (Array.isArray(value) ? value.map(String) : [])

export function filterBar() {
  return {
    openGenre: false,
    openStatus: false,
    openSort: false,
    openType: false,
    openMore: false,
    genreSearch: '',
    selectedGenres: [],
    excludedGenres: [],
    genreMode: '',
    selectedStatuses: [],
    selectedTypes: [],
    selectedOrder: '',
    sorts: {},

    init() {
      let config = {}
      try {
        config = JSON.parse(this.$root.dataset.config || '{}')
      } catch {
        config = {}
      }
      this.selectedGenres = list(config.genres)
      this.excludedGenres = list(config.excludedGenres)
      this.genreMode = config.genreMode === 'all' ? 'all' : ''
      this.selectedStatuses = list(config.statuses)
      this.selectedTypes = list(config.types)
      this.selectedOrder = typeof config.order === 'string' ? config.order : ''
      this.sorts = config.sorts && typeof config.sorts === 'object' ? config.sorts : {}
      // A dropdown opened before the script started stays open (`:open` starts from this state).
      for (const details of this.$root.querySelectorAll('details[data-menu]'))
        if (MENUS.includes(details.dataset.menu)) this[details.dataset.menu] = details.open
    },

    /** Closes every dropdown; `returnFocus` moves focus back to the button of the open one. */
    closeMenus(returnFocus = false) {
      const summary = this.$root.querySelector('details[open] > summary')
      for (const name of MENUS) this[name] = false
      if (returnFocus && summary) summary.focus()
    },

    /** Keeps the state in step with a <details> that the visitor opened or closed. */
    sync(name, open) {
      if (open === this[name]) return
      if (open) this.closeMenus()
      this[name] = open
    },

    /** Escape closes the open dropdown (and only then stops the event). */
    onEscape(event) {
      if (!MENUS.some((name) => this[name])) return
      event.preventDefault()
      event.stopPropagation()
      this.closeMenus(true)
    },

    /** ArrowDown/ArrowUp/Home/End move between the controls of the open dropdown. */
    onKeydown(event) {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const details = event.target.closest('details[open]')
      if (!details) return
      // In the genre search box Home/End keep moving the caret.
      if (event.target.type === 'search' && !event.key.startsWith('Arrow')) return
      const items = [
        ...details.querySelectorAll(
          'summary, .catalog-filter__panel a[href], .catalog-filter__panel input:not([type="hidden"]), .catalog-filter__panel button:not(:disabled)'
        ),
      ].filter((el) => el.getClientRects().length > 0)
      const index = items.indexOf(event.target)
      if (index === -1 || items.length < 2) return
      event.preventDefault()
      const next = {
        ArrowDown: index + 1 >= items.length ? 0 : index + 1,
        ArrowUp: index <= 0 ? items.length - 1 : index - 1,
        Home: 0,
        End: items.length - 1,
      }[event.key]
      items[next]?.focus()
    },

    genreMatches(name) {
      const query = fold(this.genreSearch)
      return !query || fold(name).includes(query)
    },

    /** 'include', 'exclude' or '' for one genre chip. */
    genreState(name) {
      if (this.selectedGenres.includes(name)) return 'include'
      return this.excludedGenres.includes(name) ? 'exclude' : ''
    },

    /** One press: include; second: exclude; third: clear. */
    cycleGenre(name) {
      const state = this.genreState(name)
      this.selectedGenres = this.selectedGenres.filter((item) => item !== name)
      this.excludedGenres = this.excludedGenres.filter((item) => item !== name)
      if (state === '') this.selectedGenres.push(name)
      else if (state === 'include') this.excludedGenres.push(name)
    },

    genreCount() {
      return this.selectedGenres.length + this.excludedGenres.length
    },

    clearGenres() {
      this.selectedGenres = []
      this.excludedGenres = []
    },

    /** Empties the year and chapter fields of the "Diğer" dropdown. */
    clearMore() {
      for (const input of this.$root.querySelectorAll('#filter-more input')) input.value = ''
    },

    hasGenreMatch() {
      return [...this.$root.querySelectorAll('[data-genre]')].some((el) =>
        this.genreMatches(el.dataset.genre)
      )
    },

    sortLabel() {
      return this.sorts[this.selectedOrder] ?? this.sorts[''] ?? ''
    },

    /** Submits the form as a clean URL: empty values and duplicates are left out. */
    submit() {
      const form = this.$root
      const params = new URLSearchParams()
      const seen = new Set()
      for (const [key, value] of new FormData(form)) {
        const text = String(value).trim()
        if (!text || seen.has(key + '\u0000' + text)) continue
        seen.add(key + '\u0000' + text)
        params.append(key, text)
      }
      const query = params.toString()
      window.location.assign(
        (form.getAttribute('action') || '/seriler') + (query ? '?' + query : '')
      )
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { filterBar }
