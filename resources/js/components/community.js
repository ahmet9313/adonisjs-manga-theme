import { csrfToken } from './library.js'

/** POST helper for JSON endpoints; throws with the server message on failure. */
export async function send(url, body = {}) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-csrf-token': csrfToken(),
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || data.errors?.[0]?.message || 'İşlem tamamlanamadı.')
  return data
}

export function toast(text, tone = 'success', image = '') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { text, tone, image } }))
}

export const tierOf = (level) => (level >= 50 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1)

/** Relative time used by the inbox: "şimdi", "5 dakika", "3 saat", "2 gün". */
export function ago(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 60) return 'şimdi'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dakika`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} saat`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} gün`
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const sectionKey = 'account-menu-sections'

/** Account dropdown: accordion sections (remembered per browser) and the daily check-in. */
export function accountMenu() {
  return {
    open: false,
    busy: false,
    sections: [],
    checkedIn: true,
    streak: 0,
    nextCheckin: 0,
    level: 1,
    current: 0,
    needed: 0,
    progress: 0,
    exp: 0,

    init() {
      Object.assign(this, JSON.parse(this.$el.dataset.config))
      try {
        const saved = JSON.parse(window.localStorage.getItem(sectionKey) || '[]')
        this.sections = Array.isArray(saved) ? saved : []
      } catch {
        this.sections = []
      }
    },

    isOpen(key) {
      return this.sections.includes(key)
    },

    toggle(key) {
      this.sections = this.isOpen(key)
        ? this.sections.filter((item) => item !== key)
        : [...this.sections, key]
      try {
        window.localStorage.setItem(sectionKey, JSON.stringify(this.sections))
      } catch {}
    },

    async checkin() {
      if (this.checkedIn || this.busy) return
      this.busy = true
      try {
        const result = await send('/gunluk-giris')
        this.checkedIn = true
        if (!result.already) {
          Object.assign(this, {
            streak: result.streak,
            level: result.level,
            current: result.current,
            needed: result.needed,
            progress: result.progress,
            exp: result.exp,
          })
          toast(`Günlük giriş: +${result.gained} EXP · ${result.streak}. gün`, 'reward')
          if (result.levelUp) toast(`Seviye atladın! Lv.${result.level}`, 'reward')
          if (result.card) toast(`Seri ödülü kart: ${result.card.name} (${result.card.rarity})`, 'reward')
          window.Alpine.store('account').unread += Number(result.levelUp) + Number(Boolean(result.card))
        }
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },
  }
}

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

    tone(category) {
      return (
        {
          system: 'bg-sky-500/15',
          reward: 'bg-amber-500/15',
          activity: 'bg-fuchsia-500/15',
          chapter: 'bg-emerald-500/15',
        }[category] || 'bg-white/10'
      )
    },

    ago,
  }
}

const inventoryTabs = [
  { key: 'sticker', label: 'Çıkartma', path: 'cikartmalar' },
  { key: 'frame', label: 'Avatar Çerçevesi', path: 'cerceveler' },
  { key: 'effect', label: 'Efekt', path: 'efektler' },
  { key: 'wallpaper', label: 'Duvar Kağıdı', path: 'duvar-kagitlari' },
]

export function inventory() {
  return {
    open: false,
    tabs: inventoryTabs,
    kind: 'sticker',
    data: {},
    loading: false,
    loaded: false,
    busy: false,
    error: '',
    name: document.body.dataset.name || '',

    async show(kind) {
      if (inventoryTabs.some((tab) => tab.key === kind)) this.kind = kind
      this.open = true
      if (this.loaded) return
      this.loading = true
      try {
        const response = await fetch('/envanter', {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error()
        this.data = await response.json()
        this.loaded = true
      } catch {
        this.error = 'Envanter yüklenemedi.'
      }
      this.loading = false
    },

    emptyText() {
      const label = inventoryTabs.find((tab) => tab.key === this.kind)?.label.toLocaleLowerCase('tr')
      return `Henüz açtığın bir ${label} yok. Okudukça ve seviye atladıkça açılır.`
    },

    storeLink() {
      return `/kozmetik/${inventoryTabs.find((tab) => tab.key === this.kind)?.path || 'cikartmalar'}`
    },

    async toggle(item) {
      this.busy = true
      try {
        await (item.equipped ? send(`/kozmetik/cikar/${this.kind}`) : send(`/kozmetik/${item.id}/kusan`))
        const wasEquipped = item.equipped
        for (const other of this.data[this.kind]) other.equipped = false
        item.equipped = !wasEquipped
        toast(item.equipped ? `${item.name} kuşanıldı` : `${item.name} çıkarıldı`)
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },
  }
}

let toastId = 0

export function toasts() {
  return {
    items: [],
    init() {
      // Rewards granted while rendering the page (chapter reads) arrive as data attributes.
      for (const element of document.querySelectorAll('[data-reward-toast]')) {
        try {
          const detail = JSON.parse(element.dataset.rewardToast)
          setTimeout(() => this.push(detail), 400)
        } catch {}
      }
    },
    push(detail) {
      const id = ++toastId
      this.items.push({ id, tone: 'success', ...detail })
      setTimeout(() => this.dismiss(id), detail.tone === 'reward' ? 6000 : 3500)
    },
    dismiss(id) {
      this.items = this.items.filter((item) => item.id !== id)
    },
  }
}

/** Cosmetic collection page: equip, take off and the "Dene" preview on your own card. */
export function cosmeticStore() {
  return {
    kind: '',
    items: [],
    trying: null,
    busy: false,
    me: null,

    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, config)
    },

    async equip(item) {
      if (!this.me) return this.$dispatch('open-auth', 'login')
      this.busy = true
      try {
        if (item.equipped) await send(`/kozmetik/cikar/${this.kind}`)
        else await send(`/kozmetik/${item.id}/kusan`)
        const next = !item.equipped
        for (const other of this.items) other.equipped = false
        item.equipped = next
        if (next) this.me.look[this.kind] = item.visual
        else this.me.look[this.kind] = null
        toast(next ? `${item.name} kuşanıldı` : `${item.name} çıkarıldı`)
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },

    tryOn(item) {
      this.trying = item
    },

    /** Look used in the preview: the tried item replaces the equipped one of the same kind. */
    previewLook() {
      const look = { ...(this.me?.look || { frame: null, effect: null, wallpaper: null }) }
      if (this.trying && this.kind !== 'sticker') look[this.kind] = this.trying.visual
      return look
    },

    imageStyle(visual) {
      return visual?.img ? `background-image:url('${visual.img}')` : visual?.css || ''
    },

    tierOf,
  }
}

/** Card collection: tabs, breaking duplicates into shards and crafting. */
export function cardCollection() {
  return {
    cards: [],
    shards: {},
    rules: [],
    tab: 'all',
    busy: false,
    reveal: null,
    selected: null,

    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, config)
    },

    visible() {
      if (this.tab === 'owned') return this.cards.filter((card) => card.count > 0)
      if (this.tab === 'missing') return this.cards.filter((card) => card.count === 0)
      return this.cards
    },

    ownedCount() {
      return this.cards.filter((card) => card.count > 0).length
    },

    async disassemble(card) {
      this.busy = true
      try {
        const result = await send(`/kartlar/${card.id}/parcala`)
        card.count = 1
        this.shards = result.shards
        toast(`+${result.gained} ${result.rarity} parçası`)
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },

    async craft(rarity) {
      this.busy = true
      try {
        const result = await send('/kartlar/uret', { rarity })
        this.shards = result.shards
        const card = this.cards.find((item) => item.id === result.card.id)
        if (card) card.count++
        this.reveal = card || result.card
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },
  }
}

export function profileLike() {
  return {
    liked: false,
    own: false,
    count: 0,
    busy: false,
    url: '',

    init() {
      Object.assign(this, JSON.parse(this.$el.dataset.config))
    },

    async toggle() {
      if (document.body.dataset.account !== '1') return this.$dispatch('open-auth', 'login')
      this.busy = true
      try {
        const result = await send(this.url)
        this.liked = result.liked
        this.count = result.count
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },
  }
}
