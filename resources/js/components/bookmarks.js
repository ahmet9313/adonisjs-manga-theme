import { isAccount, postJson, readLocal } from './library.js'
import { thumb, toast } from './shared.js'
import { components as ui } from './ui.js'

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
        status: statusOf(data),
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
 * server), guests read it from localStorage. The grid uses the series-card classes. The status
 * filter ("Tümü", "Okuyorum" …, data-statuses) is kept in the address as `?durum=`.
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
    /** [{ key, label, video, icon }] from config/site.ts → libraryStatuses. */
    statuses: [],
    filter: 'all',
    init() {
      try {
        this.videoTypes = JSON.parse(this.$el.dataset.videoTypes || '[]')
        this.statuses = JSON.parse(this.$el.dataset.statuses || '[]')
      } catch {
        this.videoTypes = []
      }
      const wanted = new URLSearchParams(window.location.search).get('durum')
      if (this.statuses.some((status) => status.key === wanted)) this.filter = wanted
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
    /** Bookmarks with an unknown status (an edited browser copy) count as "reading". */
    statusKey(item) {
      return this.statuses.some((status) => status.key === item.status) ? item.status : 'reading'
    },
    countOf(key) {
      if (key === 'all') return this.bookmarks.length
      return this.bookmarks.filter((item) => this.statusKey(item) === key).length
    },
    /** Cards of the chosen status tab. */
    get visible() {
      if (this.filter === 'all') return this.bookmarks
      return this.bookmarks.filter((item) => this.statusKey(item) === this.filter)
    },
    setFilter(key) {
      this.filter = key
      try {
        const url = new URL(window.location.href)
        if (key === 'all') url.searchParams.delete('durum')
        else url.searchParams.set('durum', key)
        window.history.replaceState(window.history.state, '', url)
      } catch {
        /* The filter still works without the address. */
      }
    },
    statusLabel(item) {
      const status = this.statuses.find((entry) => entry.key === this.statusKey(item))
      if (!status) return ''
      return this.videoTypes.includes(item.type) ? status.video : status.label
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
      const item = this.bookmarks.find((entry) => entry.key === key)
      const index = this.visible.findIndex((entry) => entry.key === key)
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
        : this.$root.querySelector('[data-bookmarks-empty] a, [data-bookmarks-filter] [aria-pressed="true"]')
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

/** Status of a guest bookmark (localStorage JSON); older copies have none and mean "reading". */
export const statusOf = (data) => (typeof data?.status === 'string' ? data.status : 'reading')

/**
 * Save button with reading statuses on the series page (partials/series/bookmark_control.edge),
 * built on the shared dropdown (ui.js) for the status menu. Accounts save on the server; guests
 * keep `{ …series, savedAt, status }` under `bookmark:<type>:<slug>` in localStorage.
 */
export function bookmarkButton() {
  return {
    ...ui.dropdown(),
    saved: false,
    status: 'reading',
    busy: false,
    failed: false,
    item: null,
    key: '',
    statuses: [],
    init() {
      const main = this.$refs.main
      this.item = JSON.parse(main.dataset.bookmark)
      this.statuses = JSON.parse(this.$el.dataset.statuses || '[]')
      this.key = `bookmark:${this.item.type}:${this.item.slug}`
      if (isAccount()) {
        this.saved = main.dataset.saved === 'true'
        this.status = main.dataset.status || 'reading'
        return
      }
      try {
        const stored = window.localStorage.getItem(this.key)
        this.saved = stored !== null
        if (this.saved) this.status = statusOf(JSON.parse(stored))
      } catch {
        /* Keep the button usable. */
      }
    },
    get label() {
      return this.statuses.find((entry) => entry.key === this.status)?.label || ''
    },
    /** "Kaydet" saves as "Okuyorum"; once saved the button opens the status menu. */
    primary() {
      if (this.saved) this.toggle()
      else this.choose(this.statuses[0]?.key || 'reading', false)
    },
    async choose(status, fromMenu = true) {
      if (this.busy) return
      const wasSaved = this.saved
      if (await this.store(status)) {
        this.saved = true
        this.status = status
        if (fromMenu) toast(wasSaved ? `Durum: ${this.label}` : `Kaydedildi: ${this.label}`, 'success')
      }
      if (fromMenu) this.close(true)
    },
    async remove() {
      if (this.busy || !this.saved) return
      if (await this.store(null)) {
        this.saved = false
        this.status = 'reading'
        toast(`${this.item.title} kaydedilenlerden kaldırıldı.`)
      }
      this.close(false)
      this.$nextTick(() => this.$refs.main.focus())
    },
    /** Saves with `status`, or removes the bookmark when it is null. True on success. */
    async store(status) {
      this.failed = false
      if (isAccount()) {
        this.busy = true
        try {
          if (status === null)
            await postJson('/kutuphane/kaldir', { type: this.item.type, slug: this.item.slug })
          else
            await postJson('/kutuphane/durum', {
              type: this.item.type,
              slug: this.item.slug,
              status,
            })
          return true
        } catch {
          this.failed = true
          toast('Kayıt güncellenemedi. Bağlantını kontrol edip tekrar dene.', 'error')
          return false
        } finally {
          this.busy = false
        }
      }
      try {
        if (status === null) window.localStorage.removeItem(this.key)
        else {
          let savedAt = Date.now()
          try {
            savedAt = Number(JSON.parse(window.localStorage.getItem(this.key))?.savedAt) || savedAt
          } catch {
            /* A broken copy is replaced. */
          }
          window.localStorage.setItem(this.key, JSON.stringify({ ...this.item, savedAt, status }))
        }
        return true
      } catch {
        this.failed = true
        toast('Tarayıcı depolamasına erişilemiyor; seri kaydedilemedi.', 'error')
        return false
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { bookmarkPage, bookmarkButton }
