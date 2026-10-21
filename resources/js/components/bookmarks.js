import { isAccount, postJson, readLocal } from './library.js'
import { thumb, toast } from './shared.js'

/** Content types with their own badge colour (components.css `.badge[data-tone]`). */
const typeTones = ['manga', 'manhwa', 'manhua', 'novel', 'webtoon', 'anime']

export function bookmarkCover(item) {
  const cover = item.coverImage
  if (typeof cover !== 'string') return '/images/no-cover.svg'
  if (cover.startsWith('/content/')) return thumb(cover, 320)
  if (cover.startsWith('/images/')) return cover
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
        // Hidden cover as it was when the series was saved (cover_policy_service).
        coverVeil: data?.coverVeil === 'blur' ? 'blur' : null,
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

/**
 * Saved series page (/kaydedilenler). Members get their list in data-items (rendered by the
 * server), guests read it from localStorage. The grid uses the series-card classes.
 */
export function bookmarkPage() {
  return {
    bookmarks: [],
    error: '',
    busy: false,
    account: false,
    cover: bookmarkCover,
    /** Video series (config/watch.ts) say "izlendi" instead of "okundu". */
    videoTypes: [],
    init() {
      try {
        this.videoTypes = JSON.parse(this.$el.dataset.videoTypes || '[]')
      } catch {
        this.videoTypes = []
      }
      this.account = isAccount() && this.$el.dataset.items !== undefined
      if (this.account) {
        this.bookmarks = JSON.parse(this.$el.dataset.items)
        return
      }
      try {
        this.bookmarks = readBookmarks(window.localStorage)
      } catch {
        this.error = 'Tarayıcı depolamasına erişilemiyor. Gizli pencere ya da site verisi engeli kapalı olmalı.'
      }
      this.refresh()
    },
    /**
     * A guest's list keeps covers as they were when saved; the server gives the current ones
     * (hidden-cover rules may have changed, or the visitor confirmed their age since), the
     * title and the newest chapter.
     */
    async refresh() {
      if (!this.bookmarks.length) return
      const items = this.bookmarks.slice(0, 200).map((item) => `${item.type}/${item.slug}`)
      try {
        const response = await fetch(`/kutuphane/kapaklar?items=${encodeURIComponent(items.join(','))}`, {
          headers: { accept: 'application/json' },
        })
        if (!response.ok) return
        const current = new Map((await response.json()).map((item) => [`${item.type}/${item.slug}`, item]))
        this.bookmarks = this.bookmarks.map((item) => {
          const fresh = current.get(`${item.type}/${item.slug}`)
          return fresh
            ? { ...item, title: fresh.title, coverImage: fresh.coverImage, coverVeil: fresh.coverVeil, latestChapter: fresh.latestChapter }
            : item
        })
      } catch {
        /* Offline: the stored list stays. */
      }
    },
    /** "12 seri · 3 seride yeni bölüm" under the page title. */
    get summary() {
      const fresh = this.bookmarks.filter((item) => this.hasNew(item)).length
      const total = `${this.bookmarks.length} seri`
      return fresh ? `${total} · ${fresh} seride yeni bölüm` : total
    },
    seriesUrl(item) {
      return `/series/${encodeURIComponent(item.type)}/${encodeURIComponent(item.slug)}`
    },
    chapterUrl(item, number) {
      return `/series/${encodeURIComponent(item.type)}/${encodeURIComponent(item.slug)}/${number}`
    },
    typeLabel(item) {
      return item.type.charAt(0).toUpperCase() + item.type.slice(1)
    },
    typeTone(item) {
      return typeTones.includes(item.type) ? item.type : 'neutral'
    },
    /** Meta line: reading position, with the newest chapter when the server knows it. */
    progressText(item) {
      const video = this.videoTypes.includes(item.type)
      if (item.lastRead === null) return video ? 'Henüz izlenmedi' : 'Henüz okunmadı'
      if (item.latestChapter !== null) return `Bölüm ${item.lastRead} / ${item.latestChapter}`
      return `${video ? 'Son izlenen' : 'Son okunan'}: Bölüm ${item.lastRead}`
    },
    continueText(item) {
      return `Devam et — Bölüm ${item.lastRead}`
    },
    removeLabel(item) {
      return `${item.title} kaydını kaldır`
    },
    hasNew(item) {
      return (
        item.lastRead !== null && item.latestChapter !== null && item.latestChapter > item.lastRead
      )
    },
    async removeBookmark(key, quiet = false) {
      const index = this.bookmarks.findIndex((entry) => entry.key === key)
      const item = this.bookmarks[index]
      if (!item) return false
      this.error = ''
      // Removing the focused card must not drop keyboard focus on <body>.
      const hadFocus = Boolean(document.activeElement?.closest?.('.bookmark-card'))
      try {
        if (this.account) await postJson('/kutuphane/kaldir', { type: item.type, slug: item.slug })
        else window.localStorage.removeItem(key)
        this.bookmarks = this.bookmarks.filter((entry) => entry.key !== key)
      } catch {
        this.error = 'Kayıt kaldırılamadı. Bağlantını kontrol edip tekrar dene.'
        return false
      }
      if (!quiet) toast(`${item.title} kaydedilenlerden kaldırıldı.`)
      if (hadFocus) this.$nextTick(() => this.focusAfterRemoval(index))
      return true
    },
    focusAfterRemoval(index) {
      const cards = this.$root.querySelectorAll('.bookmark-card')
      const card = cards[Math.min(index, cards.length - 1)]
      const target = card
        ? card.querySelector('.series-card__title a')
        : this.$root.querySelector('[data-bookmarks-empty] a')
      target?.focus()
    },
    async clearAll() {
      if (this.busy || !this.bookmarks.length) return
      this.busy = true
      let removed = 0
      for (const item of [...this.bookmarks]) if (await this.removeBookmark(item.key, true)) removed++
      this.busy = false
      if (removed && !this.bookmarks.length) {
        toast('Kaydedilenler listen temizlendi.')
        this.$nextTick(() => this.$root.querySelector('[data-bookmarks-empty] a')?.focus())
      }
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
          toast('Kayıt güncellenemedi. Bağlantını kontrol edip tekrar dene.', 'error')
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
        toast('Tarayıcı depolamasına erişilemiyor; seri kaydedilemedi.', 'error')
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { bookmarkPage, bookmarkButton }
