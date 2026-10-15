import { send, tierOf, toast } from './shared.js'

/**
 * Cosmetic collection (/kozmetik/<tür>): equip and take off items, and the "Dene" preview that
 * shows the visitor's own profile card and comment with the item applied.
 * State comes from `data-config` ({ kind, items, me }); endpoints: POST /kozmetik/:id/kusan and
 * POST /kozmetik/cikar/:kind. Guests are sent to the sign-in dialog.
 */
export function cosmeticStore() {
  return {
    kind: '',
    items: [],
    me: null,
    /** Item in the "Dene" dialog; kept after closing so the dialog can fade out. */
    trying: null,
    tryOpen: false,
    busy: false,
    busyId: null,

    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, config)
      this.$nextTick(() => this.revealActiveKind())
    },

    /** On narrow screens the kind tabs scroll; bring the current one into view. */
    revealActiveKind() {
      const nav = this.$el.querySelector('.cos-kinds nav')
      const active = nav?.querySelector('[aria-current]')
      if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
      const offset = active.getBoundingClientRect().left - nav.getBoundingClientRect().left
      nav.scrollLeft += offset - (nav.clientWidth - active.offsetWidth) / 2
    },

    /** Equips the item, or takes it off when it is already equipped. Returns true on success. */
    async equip(item) {
      if (!this.me) {
        this.tryOpen = false
        this.$dispatch('open-auth', 'login')
        return false
      }
      if (!item.unlocked || this.busy) return false
      this.busy = true
      this.busyId = item.id
      let done = false
      try {
        const result = item.equipped
          ? await send(`/kozmetik/cikar/${this.kind}`)
          : await send(`/kozmetik/${item.id}/kusan`)
        const next = !item.equipped
        for (const other of this.items) other.equipped = false
        item.equipped = next
        this.me.look = result.look || { ...this.me.look, [this.kind]: next ? item.visual : null }
        toast(next ? `${item.name} kuşanıldı` : `${item.name} çıkarıldı`)
        done = true
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
      this.busyId = null
      return done
    },

    tryOn(item) {
      this.trying = item
      this.tryOpen = true
    },

    closeTry() {
      this.tryOpen = false
    },

    async equipTried() {
      if (this.trying && (await this.equip(this.trying))) this.tryOpen = false
    },

    /** Look used in the preview: the tried item replaces the equipped one of the same kind. */
    previewLook() {
      const look = { frame: null, effect: null, wallpaper: null, ...(this.me?.look || {}) }
      if (this.trying && this.kind !== 'sticker') look[this.kind] = this.trying.visual
      return look
    },

    imageStyle(visual) {
      if (visual?.img) return `background-image: url("${encodeURI(visual.img)}")`
      return visual?.css || ''
    },

    /** Coloured background of the initial when the visitor has no photo (components/avatar). */
    avatarStyle() {
      const hue = this.me?.hue ?? 150
      return `background: linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 50) % 360} 70% 35%))`
    },

    initial() {
      return (this.me?.name || this.me?.username || '?').charAt(0).toUpperCase()
    },

    displayName() {
      return this.me ? this.me.name || this.me.username : 'Okur'
    },

    handle() {
      return '@' + (this.me ? this.me.username : 'okur')
    },

    level() {
      return this.me ? this.me.level : 1
    },

    statusText(item) {
      if (item.unlocked) return this.kind === 'sticker' ? 'Kullanılabilir' : 'Açıldı'
      return item.lockText
    },

    usersText(item) {
      return this.kind === 'sticker'
        ? `${item.users} kez kullanıldı`
        : `${item.users} kişi kullanıyor`
    },

    equipLabel(item) {
      if (this.me && !item.unlocked) return 'Kilitli'
      return item.equipped ? 'Kuşanıldı' : 'Kuşan'
    },

    hintTone() {
      if (!this.trying) return 'info'
      if (!this.me) return 'accent'
      if (!this.trying.unlocked) return 'warning'
      return this.trying.equipped ? 'success' : 'info'
    },

    tryHint() {
      const item = this.trying
      if (!item) return ''
      if (!this.me)
        return 'Kuşanmak için giriş yap. Okudukça, yorum yaptıkça ve rozet kazandıkça yeni öğelerin kilidi açılır.'
      if (!item.unlocked) return `Kilidi açmak için: ${item.lockText}. Kuşanınca böyle görünecek.`
      if (this.kind === 'sticker') return 'Bu çıkartmayı yorum yazarken kullanabilirsin.'
      if (item.equipped) return 'Şu an kuşanılı: profilinde ve yorumlarında böyle görünüyor.'
      return 'Kuşanınca profilinde ve yorumlarında böyle görünür.'
    },

    tierOf,
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { cosmeticStore }
