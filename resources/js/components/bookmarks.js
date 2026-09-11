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
      })
    }
  } catch {
    /* Storage may be disabled by the browser. */
  }
  return items
}

export function bookmarkPage() {
  return {
    bookmarks: [],
    error: '',
    cover: bookmarkCover,
    init() {
      try {
        this.bookmarks = readBookmarks(window.localStorage)
      } catch {
        this.error = 'Tarayıcı depolamasına erişilemiyor.'
      }
    },
    removeBookmark(key) {
      try {
        window.localStorage.removeItem(key)
        this.bookmarks = this.bookmarks.filter((item) => item.key !== key)
      } catch {
        this.error = 'Kayıt kaldırılamadı.'
      }
    },
    clearAll() {
      for (const item of [...this.bookmarks]) this.removeBookmark(item.key)
    },
  }
}

export function bookmarkButton() {
  return {
    saved: false,
    item: null,
    key: '',
    init() {
      this.item = JSON.parse(this.$el.dataset.bookmark)
      this.key = `bookmark:${this.item.type}:${this.item.slug}`
      try {
        this.saved = window.localStorage.getItem(this.key) !== null
      } catch {
        /* Keep the button usable. */
      }
    },
    toggle() {
      try {
        if (this.saved) window.localStorage.removeItem(this.key)
        else window.localStorage.setItem(this.key, JSON.stringify(this.item))
        this.saved = !this.saved
      } catch {
        this.$el.setAttribute('title', 'Tarayıcı depolamasına erişilemiyor.')
      }
    },
  }
}
