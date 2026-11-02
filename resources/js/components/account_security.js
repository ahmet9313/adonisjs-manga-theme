/**
 * Settings: the "E-postanı doğrula" banner (dismissible; remembered in this browser only, the
 * account menu keeps its reminder) and the account deletion form, whose button opens only when
 * the user name is typed exactly. The server checks both again.
 */
const verifyBanner = () => ({
  dismissed: false,
  key: '',

  init() {
    this.key = `verify-banner:${this.$el.dataset.user || ''}`
    try {
      this.dismissed = window.localStorage.getItem(this.key) === '1'
    } catch {
      /* Storage may be disabled by the browser. */
    }
  },

  dismiss() {
    this.dismissed = true
    try {
      window.localStorage.setItem(this.key, '1')
    } catch {
      /* Storage may be disabled by the browser. */
    }
  },
})

const accountDelete = () => ({
  username: '',
  typed: '',

  init() {
    this.username = (this.$el.dataset.username || '').toLowerCase()
  },

  get matches() {
    return this.typed.trim().toLowerCase() === this.username
  },
})

export const components = { verifyBanner, accountDelete }
