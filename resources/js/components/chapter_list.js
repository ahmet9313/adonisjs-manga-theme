export default function chapterList() {
  return {
    allChapters: [],
    ascending: false,
    showAll: false,
    search: '',
    init() {
      this.allChapters = JSON.parse(this.$el.dataset.chapters)
    },
    toggleSort() {
      this.ascending = !this.ascending
      this.allChapters.sort((a, b) => (this.ascending ? a.number - b.number : b.number - a.number))
    },
    filteredChapters() {
      let list = this.allChapters
      if (this.search) {
        const q = this.search.toLowerCase()
        list = list.filter(
          (ch) => String(ch.number).includes(q) || ch.title.toLowerCase().includes(q)
        )
      }
      if (!this.showAll && !this.search) {
        list = list.slice(0, 10)
      }
      return list
    },
  }
}
