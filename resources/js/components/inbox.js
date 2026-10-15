import { ago, send } from './shared.js'

const inboxTabs = [
  { key: 'all', label: 'Tümü' },
  { key: 'unread', label: 'Okunmamış' },
  { key: 'system', label: 'Sistem' },
  { key: 'reward', label: 'Ödüller' },
  { key: 'activity', label: 'Etkinlik' },
  { key: 'chapter', label: 'Yeni Bölümler' },
]

export function inbox() {
  return {
    open: false,
    tabs: inboxTabs,
    filter: 'all',
    items: [],
    page: 0,
    hasMore: false,
    loading: false,
    busy: false,
    error: '',
    confirmClear: false,

    get unread() {
      return window.Alpine.store('account').unread
    },

    set unread(value) {
      window.Alpine.store('account').unread = value
    },

    show() {
      this.open = true
      this.load(true)
    },

    close() {
      this.open = false
      this.confirmClear = false
    },

    setFilter(filter) {
      this.filter = filter
      this.confirmClear = false
      this.load(true)
    },

    async load(reset = false) {
      this.loading = true
      this.error = ''
      const page = reset ? 1 : this.page + 1
      try {
        const response = await fetch(`/bildirimler?filter=${this.filter}&page=${page}`, {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error()
        const data = await response.json()
        this.items = reset ? data.items : [...this.items, ...data.items]
        this.page = page
        this.hasMore = data.hasMore
        this.unread = data.unread
      } catch {
        this.error = 'Bildirimler yüklenemedi.'
      }
      this.loading = false
    },

    async toggleRead(item) {
      try {
        const result = await send(`/bildirimler/${item.id}/okundu`, { read: item.read ? '0' : '1' })
        item.read = result.read
        this.unread = result.unread
        if (this.filter === 'unread' && item.read) this.items = this.items.filter((row) => row !== item)
      } catch (error) {
        this.error = error.message
      }
    },

    async follow(item, event) {
      if (!item.link) event.preventDefault()
      if (!item.read) {
        item.read = true
        this.unread = Math.max(0, this.unread - 1)
        // Fire and forget: navigation continues immediately.
        send(`/bildirimler/${item.id}/okundu`, { read: '1' }).catch(() => {})
      }
    },

    async remove(item) {
      try {
        const result = await send(`/bildirimler/${item.id}/sil`)
        this.items = this.items.filter((row) => row !== item)
        this.unread = result.unread
      } catch (error) {
        this.error = error.message
      }
    },

    async readAll() {
      this.busy = true
      try {
        await send('/bildirimler/tumu-okundu')
        for (const item of this.items) item.read = true
        this.unread = 0
        if (this.filter === 'unread') this.items = []
      } catch (error) {
        this.error = error.message
      }
      this.busy = false
    },

    async removeAll() {
      if (!this.confirmClear) {
        this.confirmClear = true
        return
      }
      this.confirmClear = false
      this.busy = true
      try {
        const result = await send('/bildirimler/tumunu-sil', { filter: this.filter })
        this.items = []
        this.hasMore = false
        this.unread = result.unread
      } catch (error) {
        this.error = error.message
      }
      this.busy = false
    },

    emoji(category) {
      return { system: '📢', reward: '🎁', activity: '💬', chapter: '📖' }[category] || '🔔'
    },

    /** Colour tone of a category (`data-tone` on .tone-icon). */
    tone(category) {
      return { system: 'info', reward: 'warning', activity: 'accent', chapter: 'success' }[category] || 'neutral'
    },

    ago,
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { inbox }
