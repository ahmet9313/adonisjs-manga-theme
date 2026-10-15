import { send, tierOf, toast } from './shared.js'

/**
 * Account menu state: level progress and the daily check-in. Opening and closing belongs to
 * the nested `dropdown` component (partials/account_menu.edge).
 */
export function accountMenu() {
  return {
    busy: false,
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
    },

    tier() {
      return tierOf(this.level)
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

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { accountMenu }
