import { send, toast } from './shared.js'

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
        window.dispatchEvent(
          new CustomEvent('cosmetic-change', {
            detail: { kind: this.kind, id: item.id, equipped: item.equipped },
          })
        )
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { inventory }
