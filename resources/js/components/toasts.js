let toastId = 0

/** How long a notification stays (errors stay until closed). */
const lifetime = { reward: 6500, success: 4500, info: 4500 }

/**
 * Notifications (partials/ui/toast.edge). Server flashes are already in the HTML; this adds the
 * ones dispatched as `toast` events and rewards granted while rendering (`data-reward-toast`).
 */
export function toasts() {
  return {
    items: [],

    init() {
      for (const element of this.$el.querySelectorAll('[data-server-toast]')) {
        const wait = lifetime[element.dataset.tone]
        if (wait) setTimeout(() => element.remove(), wait)
      }
      for (const element of document.querySelectorAll('[data-reward-toast]')) {
        try {
          const detail = JSON.parse(element.dataset.rewardToast)
          setTimeout(() => this.push(detail), 400)
        } catch {}
      }
    },

    push(detail) {
      const id = ++toastId
      const item = { id, tone: 'success', image: '', ...detail }
      this.items.push(item)
      const wait = lifetime[item.tone]
      if (wait) setTimeout(() => this.dismiss(id), wait)
    },

    dismiss(id) {
      this.items = this.items.filter((item) => item.id !== id)
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { toasts }
