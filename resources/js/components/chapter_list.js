import { isAccount, readLocal } from './library.js'

export default function chapterList() {
  return {
    allChapters: [],
    ascending: false,
    showAll: false,
    search: '',
    read: new Set(),
    last: null,
    init() {
      this.allChapters = JSON.parse(this.$el.dataset.chapters)
      const { type, slug, read } = JSON.parse(this.$el.dataset.progress)
      const progress = isAccount() ? { chapters: read || [] } : readLocal(type, slug)
      this.read = new Set(progress.chapters)
      this.last = isAccount() ? (read?.[0] ?? null) : (progress.chapters.at(-1) ?? null)
    },
    isRead(chapter) {
      return this.read.has(chapter.number)
    },
    isLast(chapter) {
      return this.last === chapter.number
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
