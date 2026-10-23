import { isAccount, markLocal, postJson, readLocal, unmarkLocal } from './library.js'
import { toast } from './shared.js'

/** Rows shown before "Tümünü göster". */
const preview = 10

/**
 * Chapter list of the series page (partials/series/chapters.edge). The rows are rendered on the
 * server, newest first, in the same order as data-chapters; this component filters them, flips
 * their order with CSS and marks what the reader has read: signed-in readers get their history
 * from data-progress, guests from localStorage. Chapters in `markable` (published and open to the
 * visitor) can be marked read or unread by hand; accounts store that on the server (no rewards),
 * guests in localStorage. Changes are announced as `reading-changed` ({ last }).
 */
export default function chapterList() {
  return {
    allChapters: [],
    ascending: false,
    showAll: false,
    search: '',
    read: new Set(),
    last: null,
    type: '',
    slug: '',
    markable: [],
    labels: {},
    marking: false,

    init() {
      this.allChapters = JSON.parse(this.$el.dataset.chapters)
      const { type, slug, read, markable } = JSON.parse(this.$el.dataset.progress)
      Object.assign(this, { type, slug, markable: markable || [] })
      this.labels = JSON.parse(this.$el.dataset.markLabels || '{}')
      if (isAccount()) this.applyRead(read || [])
      else this.loadLocal()
    },

    /** Account history, most recent first (the server's ReadingState.read). */
    applyRead(numbers) {
      this.read = new Set(numbers)
      this.last = numbers[0] ?? null
    },

    loadLocal() {
      const { chapters } = readLocal(this.type, this.slug)
      this.read = new Set(chapters)
      this.last = chapters.at(-1) ?? null
    },

    announce() {
      window.dispatchEvent(new CustomEvent('reading-changed', { detail: { last: this.last } }))
    },

    unreadCount() {
      return this.markable.filter((number) => !this.read.has(number)).length
    },

    markLabel(index) {
      const chapter = this.allChapters[index]
      return chapter && this.isRead(chapter) ? this.labels.unmark : this.labels.mark
    },

    /** "Okundu işaretle" / "Okunmadı olarak işaretle" for the row at `index`. */
    async toggleRead(index) {
      const chapter = this.allChapters[index]
      if (!chapter || this.marking || !this.markable.includes(chapter.number)) return
      const read = !this.isRead(chapter)
      if (isAccount()) {
        this.marking = true
        try {
          const result = await postJson('/kutuphane/okundu', {
            type: this.type,
            slug: this.slug,
            chapter: chapter.number,
            read,
          })
          this.applyRead(result.chapters)
        } catch {
          toast(this.labels.failed, 'error')
        } finally {
          this.marking = false
        }
      } else {
        const stored = read
          ? markLocal(this.type, this.slug, chapter.number)
          : unmarkLocal(this.type, this.slug, chapter.number)
        if (!stored) toast(this.labels.failed, 'error')
        this.loadLocal()
      }
      this.announce()
    },

    /** "Tümünü okundu işaretle": every markable chapter, oldest first so the newest ends last. */
    async markAll() {
      if (this.marking) return
      const fresh = this.markable.filter((number) => !this.read.has(number)).sort((a, b) => a - b)
      if (!fresh.length) return
      this.marking = true
      try {
        if (isAccount()) {
          const result = await postJson('/kutuphane/okundu/tumu', {
            type: this.type,
            slug: this.slug,
          })
          this.applyRead(result.read)
          toast(`${result.added} ${this.labels.done}`, 'success')
        } else {
          // The newest chapter ends last even when it was read before, like on the server.
          const newest = Math.max(...this.markable)
          const order = fresh.includes(newest) ? fresh : [...fresh, newest]
          if (!markLocal(this.type, this.slug, ...order)) throw new Error('storage')
          this.loadLocal()
          toast(`${fresh.length} ${this.labels.done}`, 'success')
        }
        this.announce()
      } catch {
        toast(this.labels.failed, 'error')
      } finally {
        this.marking = false
      }
    },

    isRead(chapter) {
      return this.read.has(chapter.number)
    },

    isLast(chapter) {
      return this.last === chapter.number
    },

    /** Reading state of the row at `index`: 'last', 'read' or ''. */
    state(index) {
      const chapter = this.allChapters[index]
      if (!chapter) return ''
      if (this.isLast(chapter)) return 'last'
      return this.isRead(chapter) ? 'read' : ''
    },

    query() {
      return this.search.trim().toLocaleLowerCase('tr')
    },

    matches(chapter) {
      const query = this.query()
      return (
        !query ||
        String(chapter.number).includes(query) ||
        chapter.title.toLocaleLowerCase('tr').includes(query)
      )
    },

    matchCount() {
      return this.allChapters.filter((chapter) => this.matches(chapter)).length
    },

    /** Whether the row at `index` is visible: search hits, or the first rows in the chosen order. */
    shown(index) {
      const chapter = this.allChapters[index]
      if (!chapter) return false
      if (this.query()) return this.matches(chapter)
      if (this.showAll) return true
      const rank = this.ascending ? this.allChapters.length - 1 - index : index
      return rank < preview
    },

    setOrder(ascending) {
      this.ascending = ascending
    },

    toggleSort() {
      this.ascending = !this.ascending
    },

    /** Visible chapters in display order. */
    filteredChapters() {
      const visible = this.allChapters.filter((_, index) => this.shown(index))
      return this.ascending ? visible.reverse() : visible
    },
  }
}

/**
 * Long text clamped to a few lines with a "Devamını oku" toggle (series description). The clamp
 * class is rendered on the server; `long` tells whether the text is cut at all.
 */
export function textClamp() {
  return {
    open: false,
    long: false,

    init() {
      this.$nextTick(() => this.measure())
      if ('ResizeObserver' in window) {
        this.observer = new ResizeObserver(() => this.measure())
        this.observer.observe(this.$refs.text)
      }
    },

    destroy() {
      this.observer?.disconnect()
    },

    measure() {
      const text = this.$refs.text
      if (!text || this.open) return
      this.long = text.scrollHeight > text.clientHeight + 1
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { chapterList, textClamp }
