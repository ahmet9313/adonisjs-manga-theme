import { isAccount, postJson, readLocal } from './library.js'

export function bookmarkCover(item) {
  const cover = item.coverImage
  if (typeof cover !== 'string') return '/images/no-cover.svg'
  if (cover.startsWith('/content/') || cover.startsWith('/images/')) return cover
  if (/^[\w.-]+$/.test(cover))
    return `/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item.slug)}/${cover}`
  return '/images/no-cover.svg'
}

export function readBookmarks(storage) {
  const items = []
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith('bookmark:')) continue
      const [, type, slug] = key.split(':')
      if (!type || !slug) continue
      let data
      try {
        data = JSON.parse(storage.getItem(key))
      } catch {
        data = null
      }
      items.push({
        key,
        type,
        slug,
        title: typeof data?.title === 'string' ? data.title : slug.replaceAll('-', ' '),
        coverImage: data?.coverImage,
        savedAt: Number(data?.savedAt) || 0,
        lastRead: readLocal(type, slug).last,
        latestChapter: null,
      })
    }
  } catch {
    /* Storage may be disabled by the browser. */
  }
  return items.sort((a, b) => b.savedAt - a.savedAt)
}

export function bookmarkPage() {
  return {
    bookmarks: [],
    error: '',
    busy: false,
    account: false,
    cover: bookmarkCover,
    init() {
      this.account = isAccount() && this.$el.dataset.items !== undefined
      if (this.account) {
        this.bookmarks = JSON.parse(this.$el.dataset.items)
        return
      }
      try {
        this.bookmarks = readBookmarks(window.localStorage)
      } catch {
        this.error = 'Tarayıcı depolamasına erişilemiyor.'
      }
    },
    chapterUrl(item, number) {
      return `/series/${encodeURIComponent(item.type)}/${encodeURIComponent(item.slug)}/${number}`
    },
    hasNew(item) {
      return (
        item.lastRead !== null && item.latestChapter !== null && item.latestChapter > item.lastRead
      )
    },
    async removeBookmark(key) {
      const item = this.bookmarks.find((entry) => entry.key === key)
      if (!item) return
      this.error = ''
      try {
        if (this.account) await postJson('/kutuphane/kaldir', { type: item.type, slug: item.slug })
        else window.localStorage.removeItem(key)
        this.bookmarks = this.bookmarks.filter((entry) => entry.key !== key)
      } catch {
        this.error = 'Kayıt kaldırılamadı. Lütfen tekrar deneyin.'
      }
    },
    async clearAll() {
      this.busy = true
      for (const item of [...this.bookmarks]) await this.removeBookmark(item.key)
      this.busy = false
    },
  }
}

export function bookmarkButton() {
  return {
    saved: false,
    busy: false,
    failed: false,
    item: null,
    key: '',
    init() {
      this.item = JSON.parse(this.$el.dataset.bookmark)
      this.key = `bookmark:${this.item.type}:${this.item.slug}`
      if (isAccount()) {
        this.saved = this.$el.dataset.saved === 'true'
        return
      }
      try {
        this.saved = window.localStorage.getItem(this.key) !== null
      } catch {
        /* Keep the button usable. */
      }
    },
    async toggle() {
      if (this.busy) return
      this.failed = false
      if (isAccount()) {
        this.busy = true
        try {
          const result = await postJson('/kutuphane/kaydet', {
            type: this.item.type,
            slug: this.item.slug,
          })
          this.saved = result.saved
        } catch {
          this.failed = true
        }
        this.busy = false
        return
      }
      try {
        if (this.saved) window.localStorage.removeItem(this.key)
        else
          window.localStorage.setItem(
            this.key,
            JSON.stringify({ ...this.item, savedAt: Date.now() })
          )
        this.saved = !this.saved
      } catch {
        this.failed = true
      }
    },
  }
}
