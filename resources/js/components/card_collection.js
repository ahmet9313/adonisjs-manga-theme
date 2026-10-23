import { send, thumb, toast } from './shared.js'

/**
 * Card collection (/kartlar): filters, the card dialog (details, the reveal of a freshly crafted
 * card, the confirmation before breaking duplicates), breaking duplicates into shards and crafting
 * cards from shards.
 * State comes from `data-config` ({ cards, shards, rules }); endpoints: POST /kartlar/:id/parcala
 * and POST /kartlar/uret ({ rarity }).
 */
export function cardCollection() {
  return {
    cards: [],
    shards: {},
    rules: [],
    /** Filter: all | owned | missing | duplicates. */
    tab: 'all',
    busy: false,
    /** Rarity being crafted (spinner on its button). */
    crafting: null,
    /** Card in the dialog; kept after closing so the dialog can fade out. */
    selected: null,
    /** What the dialog shows: detail | reveal (a card that was just crafted) | break. */
    mode: 'detail',
    viewing: false,
    /** The crafted card was new to the collection. */
    fresh: false,
    /** The break confirmation was opened from the detail view ("Vazgeç" goes back there). */
    fromDetail: false,

    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, config)
    },

    rule(rarity) {
      return (
        this.rules.find((rule) => rule.rarity === rarity) || {
          rarity,
          label: rarity,
          shards: 0,
          craft: 0,
        }
      )
    },

    /* ---- Counts ------------------------------------------------------------------------- */
    ownedCount() {
      return this.cards.filter((card) => card.count > 0).length
    },

    duplicateCount() {
      return this.cards.filter((card) => card.count > 1).length
    },

    percentOwned() {
      return this.cards.length ? Math.round((this.ownedCount() / this.cards.length) * 100) : 0
    },

    ownedOf(rarity) {
      return this.cards.filter((card) => card.rarity === rarity && card.count > 0).length
    },

    totalOf(rarity) {
      return this.cards.filter((card) => card.rarity === rarity).length
    },

    /* ---- Shards and crafting ------------------------------------------------------------ */
    count(rule) {
      return this.shards[rule.rarity] || 0
    },

    canCraft(rule) {
      return rule.craft > 0 && this.count(rule) >= rule.craft
    },

    /** Progress towards the next craft, capped at 100. */
    progressOf(rule) {
      return rule.craft ? Math.min(100, Math.round((this.count(rule) / rule.craft) * 100)) : 0
    },

    /** Shards the duplicates of a card are worth. */
    gain(card) {
      return Math.max(0, card.count - 1) * this.rule(card.rarity).shards
    },

    /* ---- Filtered grid ------------------------------------------------------------------ */
    visible() {
      if (this.tab === 'owned') return this.cards.filter((card) => card.count > 0)
      if (this.tab === 'missing') return this.cards.filter((card) => card.count === 0)
      if (this.tab === 'duplicates') return this.cards.filter((card) => card.count > 1)
      return this.cards
    },

    /** Visible cards grouped by rarity, rarest first. */
    groups() {
      const cards = this.visible()
      return [...this.rules]
        .reverse()
        .map((rule) => ({ rule, cards: cards.filter((card) => card.rarity === rule.rarity) }))
        .filter((group) => group.cards.length)
    },

    /** Grid thumbnails are small; the dialog keeps the full image. */
    thumb(src) {
      return thumb(src, 320)
    },

    cardLabel(card) {
      const rule = this.rule(card.rarity)
      const rarity = `${rule.label} (${card.rarity})`
      if (!card.count) return `Bilinmeyen kart, ${rarity}`
      return card.count > 1
        ? `${card.name}, ${rarity}, ${card.count} kopya`
        : `${card.name}, ${rarity}`
    },

    /* ---- Dialog ------------------------------------------------------------------------- */
    show(card, mode = 'detail') {
      // Re-create the dialog content so the reveal animation plays again.
      this.selected = null
      this.$nextTick(() => {
        this.selected = card
        this.mode = mode
        this.viewing = true
        this.refocus()
      })
    },

    open(card) {
      this.fromDetail = false
      this.show(card, 'detail')
    },

    openBreak(card) {
      this.fromDetail = false
      this.show(card, 'break')
    },

    askBreak() {
      this.fromDetail = true
      this.mode = 'break'
      this.refocus()
    },

    cancelBreak() {
      if (!this.fromDetail) return this.close()
      this.mode = 'detail'
      this.refocus()
    },

    close() {
      this.viewing = false
      const card = this.selected
      const mode = this.mode
      // Focus returns to the button that opened the dialog. When that button is gone (the
      // duplicates were broken, the craft button got disabled) fall back to something nearby.
      setTimeout(() => {
        const active = document.activeElement
        if (active && active !== document.body && active.getClientRects().length) return
        const target =
          mode === 'reveal'
            ? document.getElementById('shards-title')
            : card && document.getElementById(`card-${card.id}`)
        target?.focus()
      }, 80)
    },

    /** Moves focus to the main button of the current dialog view (they carry data-autofocus). */
    refocus() {
      this.$nextTick(() => {
        if (!this.viewing) return
        const panel = document.getElementById('card-dialog-title')?.closest('.modal__panel')
        const target = [...(panel?.querySelectorAll('[data-autofocus]') || [])].find(
          (element) => element.getClientRects().length > 0
        )
        target?.focus({ preventScroll: true })
      })
    },

    dialogTitle() {
      if (!this.selected) return 'Kart'
      if (this.mode === 'reveal') return 'Yeni kart üretildi!'
      if (this.mode === 'break') return 'Kopyaları parçala'
      return this.selected.count ? this.selected.name : 'Bilinmeyen kart'
    },

    dialogText() {
      const card = this.selected
      if (!card) return ''
      const rule = this.rule(card.rarity)
      if (this.mode === 'break')
        return `${card.count - 1} kopya parçalanır, 1 kart koleksiyonunda kalır. Bu işlem geri alınamaz.`
      if (this.mode === 'reveal')
        return this.fresh
          ? 'Koleksiyonuna yeni bir kart eklendi.'
          : `Bu kart sende zaten vardı; artık ${card.count} kopya. Fazlasını parçalayabilirsin.`
      if (!card.count)
        return `Bu kartı henüz kazanmadın. Serinin bölümlerini okurken düşebilir ya da ${card.rarity} parçalarıyla üretilebilir.`
      if (card.count > 1)
        return `Koleksiyonunda ${card.count} kopya var. Fazladan ${card.count - 1} kopyayı parçalayarak +${this.gain(card)} ${card.rarity} parçası kazanabilirsin.`
      return `${rule.label} nadirlikte bir kart. Koleksiyonunda 1 kopya var.`
    },

    /* ---- Actions ------------------------------------------------------------------------ */
    async disassemble() {
      const card = this.selected
      if (!card || this.busy || card.count < 2) return
      this.busy = true
      try {
        const result = await send(`/kartlar/${card.id}/parcala`)
        card.count = 1
        this.shards = result.shards
        toast(`+${result.gained} ${result.rarity} parçası kazandın`)
        if (this.fromDetail) {
          this.mode = 'detail'
          this.refocus()
        } else this.close()
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
    },

    async craft(rarity) {
      if (this.busy) return
      this.busy = true
      this.crafting = rarity
      try {
        const result = await send('/kartlar/uret', { rarity })
        this.shards = result.shards
        let card = this.cards.find((item) => item.id === result.card.id)
        if (card) card.count++
        else {
          card = { ...result.card, count: 1, series: null }
          this.cards.push(card)
        }
        this.fresh = card.count === 1
        this.fromDetail = false
        this.show(card, 'reveal')
      } catch (error) {
        toast(error.message, 'error')
      }
      this.busy = false
      this.crafting = null
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { cardCollection }
