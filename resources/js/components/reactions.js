import { send, toast } from './shared.js'

/**
 * "Bölüm nasıldı?" (partials/reader/reactions.edge). One reaction per member and chapter:
 * pressing another one changes it, pressing the chosen one removes it. The counts update at
 * once and are corrected by the server answer; guests get the sign-in dialog.
 */
function chapterReactions() {
  return {
    chapterId: null,
    counts: {},
    mine: null,
    member: false,
    busy: false,

    init() {
      Object.assign(this, JSON.parse(this.$el.dataset.config))
    },

    total() {
      return Object.values(this.counts).reduce((sum, value) => sum + Number(value || 0), 0)
    },

    async choose(key) {
      if (!this.member) return this.$dispatch('open-auth', 'login')
      if (this.busy || !key) return
      const before = { counts: { ...this.counts }, mine: this.mine }
      const next = this.mine === key ? null : key
      if (this.mine) this.counts[this.mine] = Math.max(0, (this.counts[this.mine] || 0) - 1)
      if (next) this.counts[next] = (this.counts[next] || 0) + 1
      this.mine = next
      this.busy = true
      try {
        const result = await send(`/bolumler/${this.chapterId}/tepki`, { reaction: next ?? '' })
        this.counts = result.counts
        this.mine = result.mine
      } catch (error) {
        Object.assign(this, before)
        // A network failure throws a TypeError with a browser message; show ours instead.
        toast(error instanceof TypeError ? 'Tepki kaydedilemedi.' : error.message, 'error')
      }
      this.busy = false
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { chapterReactions }
