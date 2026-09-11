export function filterBar() {
  const params = new URLSearchParams(window.location.search)
  const selected = (name) => [
    ...new Set(
      params
        .getAll(name)
        .flatMap((value) => value.split(','))
        .filter(Boolean)
    ),
  ]
  return {
    openGenre: false,
    openStatus: false,
    openSort: false,
    openType: false,
    genreSearch: '',
    selectedGenres: selected('genre'),
    selectedStatuses: selected('status'),
    selectedTypes: selected('type'),
    selectedOrder: params.get('order') || '',
    closeMenus() {
      this.openGenre = this.openStatus = this.openSort = this.openType = false
    },
    toggleMenu(name) {
      const open = this[name]
      this.closeMenus()
      this[name] = !open
    },
    sortLabel() {
      if (this.selectedOrder === 'title') return 'A-Z'
      if (this.selectedOrder === 'title-desc') return 'Z-A'
      if (this.selectedOrder === 'newest') return 'En Yeni'
      return 'Son Güncellenen'
    },
    hasActiveFilters() {
      // Only show reset if URL actually has filter params (not initial page load with defaults)
      const url = new URLSearchParams(window.location.search)
      return (
        url.has('genre') ||
        url.has('status') ||
        url.has('type') ||
        url.has('order') ||
        (url.has('search') && url.get('search').trim() !== '')
      )
    },
  }
}

export function paginationBar() {
  return {
    buildUrl(page) {
      const params = new URLSearchParams(window.location.search)
      params.set('page', page)
      return '/seriler?' + params.toString()
    },
  }
}
