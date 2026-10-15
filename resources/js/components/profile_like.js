import { send, toast } from './shared.js'

/**
 * Profile like toggle (`<button x-data="profileLike" data-config='{"liked","count","url"}'>`,
 * pages/profile/show). Guests get the sign-in dialog. The heart and the count change at once and
 * the server's answer settles them (an error rolls back and shows a toast), so a slow network
 * never makes the button feel stuck. State is exposed through aria-pressed by the template.
 */
export function profileLike() {
  return {
    liked: false,
    count: 0,
    busy: false,
    url: '',

    init() {
      let config = {}
      try {
        config = JSON.parse(this.$el.dataset.config || '{}')
      } catch {
        config = {}
      }
      this.liked = Boolean(config.liked)
      this.count = Number(config.count) || 0
      this.url = config.url || ''
    },

    async toggle() {
      if (document.body.dataset.account !== '1') return this.$dispatch('open-auth', 'login')
      if (this.busy || !this.url) return
      const before = { liked: this.liked, count: this.count }
      this.busy = true
      this.liked = !before.liked
      this.count = Math.max(0, before.count + (this.liked ? 1 : -1))
      try {
        const result = await send(this.url)
        this.liked = Boolean(result.liked)
        this.count = Number(result.count) || 0
      } catch (error) {
        Object.assign(this, before)
        toast(error.message, 'error')
      } finally {
        this.busy = false
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { profileLike }
